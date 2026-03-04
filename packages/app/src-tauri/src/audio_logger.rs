//! Audio Logger — captures system audio output (meetings, calls, etc.)
//! Uses macOS ScreenCaptureKit via native Objective-C bridge.
//! This is a rex-monitor feature (private, not in open-source release).

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

/// Manages system audio capture sessions
pub struct AudioLogger {
    is_capturing: Arc<AtomicBool>,
    recordings_dir: PathBuf,
    current_samples: Arc<Mutex<Vec<f32>>>,
}

impl AudioLogger {
    pub fn new() -> Self {
        let recordings_dir = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("com.dstudio.rex")
            .join("recordings");
        std::fs::create_dir_all(&recordings_dir).ok();

        Self {
            is_capturing: Arc::new(AtomicBool::new(false)),
            recordings_dir,
            current_samples: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn recordings_dir(&self) -> &PathBuf {
        &self.recordings_dir
    }

    pub fn is_capturing(&self) -> bool {
        self.is_capturing.load(Ordering::SeqCst)
    }

    /// Start capturing system audio output via ScreenCaptureKit
    /// Requires macOS 13+ and screen recording permission
    pub fn start_capture(&self) -> Result<(), String> {
        if self.is_capturing.load(Ordering::SeqCst) {
            return Ok(());
        }

        self.current_samples.lock().unwrap().clear();
        self.is_capturing.store(true, Ordering::SeqCst);

        let is_capturing = Arc::clone(&self.is_capturing);
        let _samples = Arc::clone(&self.current_samples);

        std::thread::spawn(move || {
            #[cfg(target_os = "macos")]
            {
                // TODO: implement SCStream audio-only capture via ScreenCaptureKit
                // For now, keep thread alive until stop is called
                while is_capturing.load(Ordering::SeqCst) {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
            }

            #[cfg(not(target_os = "macos"))]
            {
                eprintln!("Audio logger is only supported on macOS");
                is_capturing.store(false, Ordering::SeqCst);
            }
        });

        Ok(())
    }

    /// Stop capturing and return the recorded samples
    pub fn stop_capture(&self) -> Vec<f32> {
        self.is_capturing.store(false, Ordering::SeqCst);
        std::thread::sleep(std::time::Duration::from_millis(200));
        self.current_samples.lock().unwrap().clone()
    }

    /// Save current recording as WAV file
    pub fn save_recording(&self, samples: &[f32], name: &str) -> Result<PathBuf, String> {
        let path = self.recordings_dir.join(format!("{name}.wav"));

        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: 16000,
            bits_per_sample: 32,
            sample_format: hound::SampleFormat::Float,
        };

        let mut writer = hound::WavWriter::create(&path, spec)
            .map_err(|e| format!("Failed to create WAV: {e}"))?;

        for &sample in samples {
            writer.write_sample(sample).map_err(|e| format!("Write error: {e}"))?;
        }

        writer.finalize().map_err(|e| format!("Finalize error: {e}"))?;
        Ok(path)
    }

    /// List all saved recordings
    pub fn list_recordings(&self) -> Vec<PathBuf> {
        std::fs::read_dir(&self.recordings_dir)
            .map(|entries| {
                entries
                    .filter_map(|e| e.ok())
                    .map(|e| e.path())
                    .filter(|p| p.extension().map(|e| e == "wav").unwrap_or(false))
                    .collect()
            })
            .unwrap_or_default()
    }
}

unsafe impl Send for AudioLogger {}
unsafe impl Sync for AudioLogger {}

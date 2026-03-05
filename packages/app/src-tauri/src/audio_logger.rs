//! Audio Logger — captures system audio output (meetings, calls, etc.)
//! Uses macOS ScreenCaptureKit for zero-driver audio loopback capture.
//! Requires macOS 13+ and screen recording permission.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

#[cfg(target_os = "macos")]
use screencapturekit::cm_sample_buffer::CMSampleBuffer;
#[cfg(target_os = "macos")]
use screencapturekit::sc_content_filter::{InitParams, SCContentFilter};
#[cfg(target_os = "macos")]
use screencapturekit::sc_error_handler::StreamErrorHandler;
#[cfg(target_os = "macos")]
use screencapturekit::sc_output_handler::{SCStreamOutputType, StreamOutput};
#[cfg(target_os = "macos")]
use screencapturekit::sc_shareable_content::SCShareableContent;
#[cfg(target_os = "macos")]
use screencapturekit::sc_stream::SCStream;
#[cfg(target_os = "macos")]
use screencapturekit::sc_stream_configuration::SCStreamConfiguration;

/// Manages system audio capture sessions
pub struct AudioLogger {
    is_capturing: Arc<AtomicBool>,
    recordings_dir: PathBuf,
    current_samples: Arc<Mutex<Vec<f32>>>,
    #[cfg(target_os = "macos")]
    stream: Arc<Mutex<Option<SCStream>>>,
}

#[cfg(target_os = "macos")]
struct ErrorHandler;

#[cfg(target_os = "macos")]
impl StreamErrorHandler for ErrorHandler {
    fn on_error(&self) {
        eprintln!("[AudioLogger] stream error");
    }
}

#[cfg(target_os = "macos")]
struct AudioOutputHandler {
    samples: Arc<Mutex<Vec<f32>>>,
    is_capturing: Arc<AtomicBool>,
}

#[cfg(target_os = "macos")]
impl StreamOutput for AudioOutputHandler {
    fn did_output_sample_buffer(&self, sample_buffer: CMSampleBuffer, of_type: SCStreamOutputType) {
        if !self.is_capturing.load(Ordering::SeqCst) {
            return;
        }
        if let SCStreamOutputType::Audio = of_type {
            let audio_buffers = sample_buffer.sys_ref.get_av_audio_buffer_list();
            let mut samples = self.samples.lock().unwrap();
            for buffer in &audio_buffers {
                // data is raw bytes of f32 PCM audio
                let f32_samples: &[f32] = unsafe {
                    std::slice::from_raw_parts(
                        buffer.data.as_ptr() as *const f32,
                        buffer.data.len() / std::mem::size_of::<f32>(),
                    )
                };
                let channels = buffer.number_channels as usize;
                if channels > 1 {
                    // Mix to mono
                    for chunk in f32_samples.chunks(channels) {
                        let mono = chunk.iter().sum::<f32>() / channels as f32;
                        samples.push(mono);
                    }
                } else {
                    samples.extend_from_slice(f32_samples);
                }
            }
        }
    }
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
            #[cfg(target_os = "macos")]
            stream: Arc::new(Mutex::new(None)),
        }
    }

    pub fn recordings_dir(&self) -> &PathBuf {
        &self.recordings_dir
    }

    pub fn is_capturing(&self) -> bool {
        self.is_capturing.load(Ordering::SeqCst)
    }

    /// Start capturing system audio output via ScreenCaptureKit
    pub fn start_capture(&self) -> Result<(), String> {
        if self.is_capturing.load(Ordering::SeqCst) {
            return Ok(());
        }

        #[cfg(target_os = "macos")]
        {
            self.current_samples.lock().unwrap().clear();

            eprintln!("[AudioLogger] Getting shareable content...");
            let content = SCShareableContent::try_current()
                .map_err(|e| format!("Failed to get shareable content (need Screen Recording permission in System Settings > Privacy & Security > Screen Recording): {e}"))?;

            eprintln!("[AudioLogger] Found {} displays", content.displays.len());
            let display = content
                .displays
                .into_iter()
                .next()
                .ok_or("No displays found")?;

            let filter = SCContentFilter::new(InitParams::Display(display));

            // Audio-only at 16kHz mono (whisper-ready)
            let config = SCStreamConfiguration {
                width: 2,
                height: 2,
                captures_audio: true,
                sample_rate: 16000,
                channel_count: 1,
                excludes_current_process_audio: false,
                ..Default::default()
            };

            let handler = AudioOutputHandler {
                samples: Arc::clone(&self.current_samples),
                is_capturing: Arc::clone(&self.is_capturing),
            };

            eprintln!("[AudioLogger] Creating stream...");
            let mut stream = SCStream::new(filter, config, ErrorHandler);
            stream.add_output(handler, SCStreamOutputType::Audio);

            eprintln!("[AudioLogger] Starting capture...");
            stream.start_capture().map_err(|e| format!("Failed to start capture: {e}"))?;

            self.is_capturing.store(true, Ordering::SeqCst);
            *self.stream.lock().unwrap() = Some(stream);

            eprintln!("[AudioLogger] Capture started successfully");
            return Ok(());
        }

        #[cfg(not(target_os = "macos"))]
        Err("Audio logger is only supported on macOS".to_string())
    }

    /// Stop capturing and return the recorded samples
    pub fn stop_capture(&self) -> Vec<f32> {
        if !self.is_capturing.load(Ordering::SeqCst) {
            return Vec::new();
        }

        self.is_capturing.store(false, Ordering::SeqCst);

        #[cfg(target_os = "macos")]
        {
            if let Some(stream) = self.stream.lock().unwrap().take() {
                let _ = stream.stop_capture();
            }
        }

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

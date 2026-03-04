use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}};
use std::thread;

/// Thread-safe audio recorder that captures mic input as f32 samples at 16kHz
pub struct AudioRecorder {
    samples: Arc<Mutex<Vec<f32>>>,
    is_recording: Arc<AtomicBool>,
}

// Safety: AudioRecorder doesn't hold the cpal::Stream directly.
// The stream lives only inside the recording thread.
unsafe impl Send for AudioRecorder {}
unsafe impl Sync for AudioRecorder {}

impl AudioRecorder {
    pub fn new() -> Self {
        Self {
            samples: Arc::new(Mutex::new(Vec::new())),
            is_recording: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn start(&self) -> Result<(), String> {
        if self.is_recording.load(Ordering::SeqCst) {
            return Ok(());
        }

        self.samples.lock().unwrap().clear();
        self.is_recording.store(true, Ordering::SeqCst);

        let samples = Arc::clone(&self.samples);
        let is_recording = Arc::clone(&self.is_recording);

        thread::spawn(move || {
            let host = cpal::default_host();
            let device = match host.default_input_device() {
                Some(d) => d,
                None => {
                    eprintln!("No input device found");
                    is_recording.store(false, Ordering::SeqCst);
                    return;
                }
            };

            let config = cpal::StreamConfig {
                channels: 1,
                sample_rate: cpal::SampleRate(16000),
                buffer_size: cpal::BufferSize::Default,
            };

            let samples_clone = Arc::clone(&samples);
            let stream = match device.build_input_stream(
                &config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    samples_clone.lock().unwrap().extend_from_slice(data);
                },
                |err| eprintln!("Audio stream error: {err}"),
                None,
            ) {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("Failed to build input stream: {e}");
                    is_recording.store(false, Ordering::SeqCst);
                    return;
                }
            };

            if let Err(e) = stream.play() {
                eprintln!("Failed to start stream: {e}");
                is_recording.store(false, Ordering::SeqCst);
                return;
            }

            // Keep the stream alive until recording stops
            while is_recording.load(Ordering::SeqCst) {
                thread::sleep(std::time::Duration::from_millis(50));
            }
            // Stream is dropped here, stopping recording
        });

        Ok(())
    }

    pub fn stop(&self) -> Vec<f32> {
        self.is_recording.store(false, Ordering::SeqCst);
        // Small delay to let the thread finish
        thread::sleep(std::time::Duration::from_millis(100));
        let samples = self.samples.lock().unwrap().clone();
        samples
    }

    pub fn is_recording(&self) -> bool {
        self.is_recording.load(Ordering::SeqCst)
    }
}

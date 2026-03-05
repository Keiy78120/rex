mod audio_logger;
mod recorder;
mod whisper;

use audio_logger::AudioLogger;
use recorder::AudioRecorder;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};
use whisper::WhisperEngine;

struct AppState {
    whisper: Mutex<WhisperEngine>,
    recorder: AudioRecorder,
    audio_logger: AudioLogger,
}

#[tauri::command]
async fn run_checks(app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_shell::ShellExt;
    let output = app
        .shell()
        .command("node")
        .args([
            "--input-type=module",
            "-e",
            r#"
            import { runAllChecks } from '@rex/core';
            const r = await runAllChecks();
            console.log(JSON.stringify(r));
        "#,
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to run node: {e}. Is Node.js installed?"))?;
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        if stdout.trim().is_empty() {
            return Err("Node returned empty output — @rex/core may not be installed".to_string());
        }
        Ok(stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("Health check failed: {stderr}"))
    }
}

#[tauri::command]
fn voice_start(state: tauri::State<'_, AppState>) -> Result<(), String> {
    if !state.whisper.lock().unwrap().has_tiny_model() {
        return Err("No whisper model found. Download ggml-tiny.en.bin to ~/Library/Application Support/com.dstudio.rex/models/".to_string());
    }
    state.recorder.start()
}

#[tauri::command]
fn voice_stop(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let samples = state.recorder.stop();
    if samples.is_empty() {
        return Ok(String::new());
    }

    let engine = state.whisper.lock().unwrap();

    // Pass 1: fast draft with tiny model
    let draft = engine.transcribe_tiny(&samples).unwrap_or_default();

    // Pass 2: accurate with large model (if available)
    let final_text = if engine.has_large_model() {
        engine.transcribe_large(&samples).unwrap_or(draft.clone())
    } else {
        draft
    };

    Ok(whisper::code_detect(&final_text))
}

#[tauri::command]
fn voice_status(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let engine = state.whisper.lock().unwrap();
    Ok(serde_json::json!({
        "recording": state.recorder.is_recording(),
        "tiny_model": engine.has_tiny_model(),
        "large_model": engine.has_large_model(),
        "models_dir": engine.models_dir().to_string_lossy(),
    }))
}

#[tauri::command]
fn audio_logger_start(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.audio_logger.start_capture()
}

#[tauri::command]
fn audio_logger_stop(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let samples = state.audio_logger.stop_capture();
    if samples.is_empty() {
        return Ok("No audio captured".to_string());
    }
    let timestamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let path = state.audio_logger.save_recording(&samples, &timestamp)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn audio_logger_status(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "capturing": state.audio_logger.is_capturing(),
        "recordings_dir": state.audio_logger.recordings_dir().to_string_lossy(),
        "recordings_count": state.audio_logger.list_recordings().len(),
    }))
}

/// Helper to call the @rex/memory bridge script via tsx.
/// Bridge path is relative to the monorepo root (2 levels up from src-tauri).
async fn call_memory_bridge(app: &tauri::AppHandle, args: &[&str]) -> Result<String, String> {
    use tauri_plugin_shell::ShellExt;

    // Resolve monorepo root: src-tauri/../.. = packages/app/../.. = repo root
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Cannot resolve resource dir: {e}"))?;
    // In dev mode, resource_dir points to src-tauri, go up 2 levels
    let repo_root = resource_dir.join("../..").canonicalize().unwrap_or_else(|_| {
        // Fallback: use home dir approach
        std::path::PathBuf::from(std::env::var("HOME").unwrap_or_default())
            .join("Documents/Developer/keiy/rex")
    });

    let tsx = repo_root.join("packages/memory/node_modules/.bin/tsx");
    let bridge = repo_root.join("packages/memory/src/bridge.ts");

    let output = app
        .shell()
        .command(tsx.to_string_lossy().as_ref())
        .args([bridge.to_string_lossy().as_ref()])
        .args(args)
        .output()
        .await
        .map_err(|e| format!("Failed to run memory bridge: {e}"))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout.is_empty() {
            Ok("{}".to_string())
        } else {
            Ok(stdout)
        }
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("Memory bridge error: {stderr}"))
    }
}

#[tauri::command]
async fn memory_search(app: tauri::AppHandle, query: String, limit: Option<u32>) -> Result<String, String> {
    let limit_str = limit.unwrap_or(10).to_string();
    call_memory_bridge(&app, &["search", &query, &limit_str]).await
}

#[tauri::command]
async fn memory_learn(app: tauri::AppHandle, fact: String, category: Option<String>) -> Result<String, String> {
    let cat = category.unwrap_or_else(|| "general".to_string());
    call_memory_bridge(&app, &["learn", &fact, &cat]).await
}

#[tauri::command]
async fn memory_status(app: tauri::AppHandle) -> Result<String, String> {
    call_memory_bridge(&app, &["status"]).await
}

#[tauri::command]
async fn ollama_status(app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_shell::ShellExt;
    let output = app
        .shell()
        .command("curl")
        .args(["-s", "http://localhost:11434/api/tags"])
        .output()
        .await;

    match output {
        Ok(o) if o.status.success() => {
            let body = String::from_utf8_lossy(&o.stdout);
            let json: serde_json::Value = serde_json::from_str(&body).unwrap_or_default();
            let models: Vec<String> = json["models"]
                .as_array()
                .map(|arr| arr.iter().filter_map(|m| m["name"].as_str().map(String::from)).collect())
                .unwrap_or_default();
            Ok(serde_json::json!({ "running": true, "models": models }).to_string())
        }
        _ => Ok(serde_json::json!({ "running": false, "models": [] }).to_string()),
    }
}

/// Calls `rex optimize` CLI and returns analysis text
#[tauri::command]
async fn optimize_analyze(app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_shell::ShellExt;
    let output = app
        .shell()
        .command("rex")
        .args(["optimize"])
        .output()
        .await
        .map_err(|e| format!("Failed to run rex optimize: {e}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Calls `rex optimize --apply` and returns JSON with before/after/saved token counts
#[tauri::command]
async fn optimize_apply(app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_shell::ShellExt;
    let output = app
        .shell()
        .command("rex")
        .args(["optimize", "--apply"])
        .output()
        .await
        .map_err(|e| format!("Failed to run rex optimize --apply: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    // Parse token counts from stdout
    let mut before = 0u64;
    let mut after = 0u64;
    for line in stdout.lines() {
        if line.contains("Before:") {
            before = line.split('~').nth(1).and_then(|s| s.trim().split_whitespace().next()).and_then(|s| s.parse().ok()).unwrap_or(0);
        }
        if line.contains("After:") {
            after = line.split('~').nth(1).and_then(|s| s.trim().split_whitespace().next()).and_then(|s| s.parse().ok()).unwrap_or(0);
        }
    }
    let saved = if before > after { before - after } else { 0 };
    Ok(serde_json::json!({ "before": before, "after": after, "saved": saved }).to_string())
}

/// Runs `rex ingest` to process session logs into memory
#[tauri::command]
async fn memory_ingest(app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_shell::ShellExt;
    let output = app
        .shell()
        .command("rex")
        .args(["ingest"])
        .output()
        .await
        .map_err(|e| format!("Failed to run rex ingest: {e}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Calls `rex setup` to install Ollama + models
#[tauri::command]
async fn run_setup(app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_shell::ShellExt;
    let output = app
        .shell()
        .command("rex")
        .args(["setup"])
        .output()
        .await
        .map_err(|e| format!("Failed to run rex setup: {e}"))?;
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut engine = WhisperEngine::new();
    let _ = engine.load_tiny();
    let _ = engine.load_large();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState {
            whisper: Mutex::new(engine),
            recorder: AudioRecorder::new(),
            audio_logger: AudioLogger::new(),
        })
        .setup(|app| {
            // Hide dock icon — menubar-only app (AccessoryActivationPolicy)
            #[cfg(target_os = "macos")]
            {
                let cls = objc2::runtime::AnyClass::get(c"NSApplication").unwrap();
                let ns_app: *mut objc2::runtime::AnyObject =
                    unsafe { objc2::msg_send![cls, sharedApplication] };
                let _: () = unsafe { objc2::msg_send![ns_app, setActivationPolicy: 1i64] };
            }

            // Build tray menu
            let quit = MenuItem::with_id(app, "quit", "Quit REX", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit])?;

            // Single tray icon (no trayIcon in tauri.conf.json)
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .icon_as_template(true)
                .menu(&menu)
                .on_menu_event(|app, event| {
                    if event.id() == "quit" {
                        app.exit(0);
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // Register global shortcut: Option+Space for voice
            use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
            let app_handle = app.handle().clone();
            app.global_shortcut()
                .on_shortcut("Alt+Space", move |_app, _shortcut, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }
                    let state = app_handle.state::<AppState>();
                    let is_recording = state.recorder.is_recording();

                    if is_recording {
                        // === STOP RECORDING ===
                        let samples = state.recorder.stop();

                        // Notify frontend
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("voice-recording", false);
                        }

                        // Hide overlay
                        if let Some(overlay) = app_handle.get_webview_window("voice-overlay") {
                            let _ = overlay.hide();
                        }

                        if samples.is_empty() {
                            eprintln!("[Voice] No samples captured");
                            return;
                        }

                        // Transcribe (try_lock to avoid deadlock on rapid toggle)
                        let engine = match state.whisper.try_lock() {
                            Ok(e) => e,
                            Err(_) => {
                                eprintln!("[Voice] Whisper engine busy, skipping");
                                return;
                            }
                        };

                        if !engine.has_tiny_model() {
                            eprintln!("[Voice] No tiny model loaded");
                            if let Some(window) = app_handle.get_webview_window("main") {
                                let _ = window.emit("voice-error", "No whisper model. Download ggml-tiny.en.bin");
                            }
                            return;
                        }

                        // Pass 1: fast draft with tiny model
                        let draft = match engine.transcribe_tiny(&samples) {
                            Ok(t) if !t.is_empty() => whisper::code_detect(&t),
                            Ok(_) => {
                                eprintln!("[Voice] Empty transcription");
                                return;
                            }
                            Err(e) => {
                                eprintln!("[Voice] Transcription error: {e}");
                                return;
                            }
                        };

                        // Emit draft immediately for instant feedback
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("voice-result", &draft);
                        }

                        // Pass 2: accurate with large model (replaces draft)
                        let text = if engine.has_large_model() {
                            match engine.transcribe_large(&samples) {
                                Ok(t) if !t.is_empty() => {
                                    let accurate = whisper::code_detect(&t);
                                    if let Some(window) = app_handle.get_webview_window("main") {
                                        let _ = window.emit("voice-result", &accurate);
                                    }
                                    accurate
                                }
                                _ => draft
                            }
                        } else {
                            draft
                        };

                        // Save transcription to memory (async, fire-and-forget)
                        {
                            let handle = app_handle.clone();
                            let text_clone = text.clone();
                            tauri::async_runtime::spawn(async move {
                                let fact = format!("[voice transcription] {}", text_clone);
                                if let Err(e) = call_memory_bridge(&handle, &["learn", &fact, "voice"]).await {
                                    eprintln!("[Voice] Failed to save to memory: {e}");
                                }
                            });
                        }

                        // Copy to clipboard + auto-paste
                        #[cfg(target_os = "macos")]
                        {
                            let text_for_paste = text;
                            std::thread::spawn(move || {
                                use std::io::Write;
                                if let Ok(mut child) = std::process::Command::new("pbcopy")
                                    .stdin(std::process::Stdio::piped())
                                    .spawn()
                                {
                                    if let Some(stdin) = child.stdin.as_mut() {
                                        let _ = stdin.write_all(text_for_paste.as_bytes());
                                    }
                                    let _ = child.wait();
                                }
                                std::thread::sleep(std::time::Duration::from_millis(100));
                                let _ = std::process::Command::new("osascript")
                                    .args([
                                        "-e",
                                        "tell application \"System Events\" to keystroke \"v\" using command down",
                                    ])
                                    .output();
                            });
                        }
                    } else {
                        // === START RECORDING ===
                        if let Err(e) = state.recorder.start() {
                            eprintln!("[Voice] Failed to start recording: {e}");
                            if let Some(window) = app_handle.get_webview_window("main") {
                                let _ = window.emit("voice-error", format!("Mic error: {e}"));
                            }
                            return;
                        }

                        // Notify frontend
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("voice-recording", true);
                        }

                        // Show voice overlay at bottom center of screen
                        if let Some(overlay) = app_handle.get_webview_window("voice-overlay") {
                            if let Ok(Some(monitor)) = overlay.current_monitor() {
                                let screen = monitor.size();
                                let x = (screen.width as i32 / 2) - 100;
                                let y = screen.height as i32 - 120;
                                let _ = overlay.set_position(tauri::Position::Physical(
                                    tauri::PhysicalPosition { x, y },
                                ));
                            }
                            let _ = overlay.show();
                        }
                    }
                })
                .ok();

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            run_checks,
            voice_start,
            voice_stop,
            voice_status,
            audio_logger_start,
            audio_logger_stop,
            audio_logger_status,
            memory_search,
            memory_learn,
            memory_status,
            memory_ingest,
            ollama_status,
            optimize_analyze,
            optimize_apply,
            run_setup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

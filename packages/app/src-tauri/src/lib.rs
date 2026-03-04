mod recorder;
mod whisper;

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
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
fn voice_start(state: tauri::State<'_, AppState>) -> Result<(), String> {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut engine = WhisperEngine::new();
    let _ = engine.load_tiny();
    let _ = engine.load_large();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(AppState {
            whisper: Mutex::new(engine),
            recorder: AudioRecorder::new(),
        })
        .setup(|app| {
            // Build tray menu
            let quit = MenuItem::with_id(app, "quit", "Quit REX", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit])?;

            // Create tray icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
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
            app.global_shortcut().on_shortcut("Alt+Space", move |_app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    let state = app_handle.state::<AppState>();
                    let is_recording = state.recorder.is_recording();
                    if is_recording {
                        let samples = state.recorder.stop();
                        if !samples.is_empty() {
                            let engine = state.whisper.lock().unwrap();
                            if let Ok(text) = engine.transcribe_tiny(&samples) {
                                let text = whisper::code_detect(&text);
                                if let Some(window) = app_handle.get_webview_window("main") {
                                    let _ = window.emit("voice-result", &text);
                                }
                            }
                        }
                    } else {
                        let _ = state.recorder.start();
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("voice-recording", true);
                        }
                    }
                }
            }).ok();

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            run_checks,
            voice_start,
            voice_stop,
            voice_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod win_bridge;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CaptureContextDto {
    pub captured_text: String,
    pub clipboard_text: String,
    pub source_app: String,
    pub capture_mode: String,
    #[serde(skip)]
    pub target_hwnd: isize,
}

#[derive(Default)]
pub struct AppRuntimeState {
    pub last_capture: Mutex<CaptureContextDto>,
    pub auto_select_all: Mutex<bool>,
    pub editor_blacklist: Mutex<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoreMirror {
    config: Option<StoreConfigMirror>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoreConfigMirror {
    windows: Option<StoreWindowsMirror>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct StoreWindowsMirror {
    preview_hotkey: Option<String>,
    blind_hotkey: Option<String>,
    auto_select_all: Option<bool>,
    editor_blacklist: Option<Vec<String>>,
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn resolve_portable_store_path(app: &AppHandle) -> Option<PathBuf> {
    let exe_path = std::env::current_exe().ok()?;
    let exe_dir = exe_path.parent()?;
    let data_dir = exe_dir.join("data");

    if fs::create_dir_all(&data_dir).is_err() {
        return None;
    }

    // Verify the directory is actually writable (e.g. falls back cleanly if placed in read-only Program Files)
    let probe = data_dir.join(".h2ai_write_probe");
    if fs::write(&probe, b"ok").is_err() {
        return None;
    }
    let _ = fs::remove_file(&probe);

    let portable_file = data_dir.join("h2ai_store.json");

    // Seamless one-time migration from legacy %APPDATA% location if portable store does not exist yet
    if !portable_file.exists() {
        if let Ok(legacy_dir) = app.path().app_config_dir() {
            let legacy_file = legacy_dir.join("h2ai_store.json");
            if legacy_file.exists() && legacy_file != portable_file {
                let _ = fs::copy(&legacy_file, &portable_file);
            }
        }
    }

    Some(portable_file)
}

fn store_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        if let Some(portable_path) = resolve_portable_store_path(app) {
            return Ok(portable_path);
        }
    }

    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("无法获取配置目录: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("创建配置目录失败: {e}"))?;
    Ok(dir.join("h2ai_store.json"))
}

#[tauri::command]
fn get_store_path(app: AppHandle) -> Result<String, String> {
    let path = store_file_path(&app)?;
    Ok(path.to_string_lossy().into_owned())
}

fn sync_windows_config_from_json(app: &AppHandle, raw_json: &str) {
    if let Ok(parsed) = serde_json::from_str::<StoreMirror>(raw_json) {
        if let Some(win) = parsed.config.and_then(|c| c.windows) {
            let state = app.state::<AppRuntimeState>();
            if let Some(auto) = win.auto_select_all {
                if let Ok(mut guard) = state.auto_select_all.lock() {
                    *guard = auto;
                }
            }
            if let Some(list) = win.editor_blacklist {
                if let Ok(mut guard) = state.editor_blacklist.lock() {
                    *guard = list;
                }
            }
        }
    }
}

#[tauri::command]
fn load_store(app: AppHandle) -> Result<String, String> {
    let path = store_file_path(&app)?;
    if !path.exists() {
        return Ok(String::new());
    }
    let content = fs::read_to_string(path).map_err(|e| format!("读取存储失败: {e}"))?;
    sync_windows_config_from_json(&app, &content);
    Ok(content)
}

#[tauri::command]
fn save_store(app: AppHandle, data: String) -> Result<(), String> {
    let path = store_file_path(&app)?;
    fs::write(path, &data).map_err(|e| format!("写入存储失败: {e}"))?;
    sync_windows_config_from_json(&app, &data);
    Ok(())
}

#[tauri::command]
fn get_last_capture(state: State<'_, AppRuntimeState>) -> CaptureContextDto {
    state
        .last_capture
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default()
}

#[tauri::command]
fn hide_popup(app: AppHandle) {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    if let Some(win) = app.get_webview_window("popup") {
        let _ = win.hide();
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    let _ = app;
}

#[tauri::command]
fn copy_to_clipboard(text: String) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return win_bridge::copy_plain_text(&text);
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = text;
        Ok(())
    }
}

#[tauri::command]
fn commit_to_target(
    app: AppHandle,
    state: State<'_, AppRuntimeState>,
    text: String,
) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        if let Some(win) = app.get_webview_window("popup") {
            let _ = win.hide();
        }
        let capture = state
            .last_capture
            .lock()
            .map(|g| g.clone())
            .unwrap_or_default();
        return win_bridge::commit_to_target(&capture, &text);
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (app, state, text);
        Ok(())
    }
}

#[tauri::command]
fn update_hotkeys(
    app: AppHandle,
    preview_hotkey: String,
    blind_hotkey: String,
) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return register_desktop_hotkeys(&app, &preview_hotkey, &blind_hotkey);
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (app, preview_hotkey, blind_hotkey);
        Ok(())
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn trigger_capture_and_emit(app: &AppHandle, blind: bool) {
    use tauri::Emitter;

    // Toggle behavior: if popup is already open and user presses preview hotkey again, close it immediately
    if !blind {
        if let Some(popup) = app.get_webview_window("popup") {
            if popup.is_visible().unwrap_or(false) {
                let _ = popup.hide();
                if let Ok(guard) = app.state::<AppRuntimeState>().last_capture.lock() {
                    win_bridge::restore_foreground(guard.target_hwnd);
                }
                return;
            }
        }
    }

    let (auto_select_all, blacklist) = {
        let state = app.state::<AppRuntimeState>();
        let auto = state.auto_select_all.lock().map(|g| *g).unwrap_or(true);
        let bl = state
            .editor_blacklist
            .lock()
            .map(|g| g.clone())
            .unwrap_or_default();
        (auto, bl)
    };

    let capture = win_bridge::capture_from_foreground(auto_select_all, &blacklist);
    if let Ok(mut guard) = app.state::<AppRuntimeState>().last_capture.lock() {
        *guard = capture.clone();
    }

    if blind {
        let _ = app.emit_to("popup", "blind-triggered", capture);
    } else {
        if let Some(popup) = app.get_webview_window("popup") {
            let _ = popup.center();
            let _ = popup.show();
            let _ = popup.set_focus();
        }
        let _ = app.emit_to("popup", "popup-triggered", capture);
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn register_desktop_hotkeys(
    app: &AppHandle,
    preview_hotkey: &str,
    blind_hotkey: &str,
) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

    let gs = app.global_shortcut();
    let _ = gs.unregister_all();

    if !preview_hotkey.trim().is_empty() {
        let app_handle = app.clone();
        gs.on_shortcut(preview_hotkey, move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                let handle = app_handle.clone();
                std::thread::spawn(move || trigger_capture_and_emit(&handle, false));
            }
        })
        .map_err(|e| format!("注册预览热键 ({preview_hotkey}) 失败: {e}"))?;
    }

    if !blind_hotkey.trim().is_empty() {
        let app_handle = app.clone();
        gs.on_shortcut(blind_hotkey, move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                let handle = app_handle.clone();
                std::thread::spawn(move || trigger_capture_and_emit(&handle, true));
            }
        })
        .map_err(|e| format!("注册盲转热键 ({blind_hotkey}) 失败: {e}"))?;
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().manage(AppRuntimeState {
        last_capture: Mutex::new(CaptureContextDto::default()),
        auto_select_all: Mutex::new(true),
        editor_blacklist: Mutex::new(vec![
            "code.exe".into(),
            "cursor.exe".into(),
            "antigravity.exe".into(),
            "devenv.exe".into(),
            "idea64.exe".into(),
            "winword.exe".into(),
            "excel.exe".into(),
            "notepad++.exe".into(),
            "obsidian.exe".into(),
        ]),
    });

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        });

    builder
        .setup(|app| {
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                use tauri::{
                    menu::{MenuBuilder, MenuItemBuilder},
                    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
                    WebviewUrl, WebviewWindowBuilder,
                };

                // Load saved config for hotkeys & blacklist
                let mut preview_hotkey = "Alt+Q".to_string();
                let mut blind_hotkey = "Alt+Shift+Q".to_string();
                if let Ok(path) = store_file_path(app.handle()) {
                    if let Ok(raw) = fs::read_to_string(path) {
                        sync_windows_config_from_json(app.handle(), &raw);
                        if let Ok(parsed) = serde_json::from_str::<StoreMirror>(&raw) {
                            if let Some(win) = parsed.config.and_then(|c| c.windows) {
                                if let Some(h) = win.preview_hotkey {
                                    preview_hotkey = h;
                                }
                                if let Some(h) = win.blind_hotkey {
                                    blind_hotkey = h;
                                }
                            }
                        }
                    }
                }

                // Create hidden popup window dynamically (safe from Android target)
                let _popup = WebviewWindowBuilder::new(
                    app,
                    "popup",
                    WebviewUrl::App("index.html#/popup".into()),
                )
                .title("Human2AI 嘴替悬浮窗")
                .inner_size(580.0, 460.0)
                .resizable(true)
                .decorations(false)
                .transparent(true)
                .always_on_top(true)
                .skip_taskbar(true)
                .visible(false)
                .build()?;

                // Build system tray
                let show_main = MenuItemBuilder::with_id("show_main", "打开主工坊").build(app)?;
                let show_popup = MenuItemBuilder::with_id("show_popup", "呼出嘴替悬浮窗").build(app)?;
                let quit_item = MenuItemBuilder::with_id("quit", "退出 Human2AI").build(app)?;
                let menu = MenuBuilder::new(app)
                    .items(&[&show_main, &show_popup, &quit_item])
                    .build()?;

                let mut tray_builder = TrayIconBuilder::new()
                    .menu(&menu)
                    .tooltip("Human2AI - AI八股嘴替")
                    .on_menu_event(|app, event| match event.id().as_ref() {
                        "show_main" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        "show_popup" => {
                            if let Some(w) = app.get_webview_window("popup") {
                                let _ = w.center();
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            if let Some(w) = tray.app_handle().get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    });

                if let Some(icon) = app.default_window_icon() {
                    tray_builder = tray_builder.icon(icon.clone());
                }
                let _tray = tray_builder.build(app)?;

                let _ = register_desktop_hotkeys(app.handle(), &preview_hotkey, &blind_hotkey);
            }

            #[cfg(any(target_os = "android", target_os = "ios"))]
            {
                let _ = app;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_store,
            save_store,
            get_store_path,
            get_last_capture,
            hide_popup,
            copy_to_clipboard,
            commit_to_target,
            update_hotkeys
        ])
        .run(tauri::generate_context!())
        .expect("error while running Human2AI tauri application");
}

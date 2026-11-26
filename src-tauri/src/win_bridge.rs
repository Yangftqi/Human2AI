use crate::CaptureContextDto;

pub fn copy_plain_text(text: &str) -> Result<(), String> {
    let mut clipboard =
        arboard::Clipboard::new().map_err(|e| format!("无法访问剪贴板: {e}"))?;
    clipboard
        .set_text(text.to_string())
        .map_err(|e| format!("写入剪贴板失败: {e}"))
}

#[cfg(target_os = "windows")]
mod win32_impl {
    use super::CaptureContextDto;
    use std::path::Path;
    use std::thread;
    use std::time::{Duration, Instant};
    use windows_sys::Win32::Foundation::{CloseHandle, HWND};
    use windows_sys::Win32::System::DataExchange::GetClipboardSequenceNumber;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT,
        KEYEVENTF_KEYUP, VK_CONTROL, VK_LMENU, VK_LSHIFT, VK_MENU, VK_RMENU, VK_RSHIFT,
        VK_SHIFT,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId, SetForegroundWindow,
    };

    fn make_key_input(vk: u16, key_up: bool) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    wScan: 0,
                    dwFlags: if key_up { KEYEVENTF_KEYUP } else { 0 },
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }

    fn send_ctrl_combo(vk: u16) {
        let inputs = [
            make_key_input(VK_CONTROL, false),
            make_key_input(vk, false),
            make_key_input(vk, true),
            make_key_input(VK_CONTROL, true),
        ];
        unsafe {
            SendInput(
                inputs.len() as u32,
                inputs.as_ptr(),
                std::mem::size_of::<INPUT>() as i32,
            );
        }
    }

    /// Wait briefly for user to release Alt/Shift from the global hotkey,
    /// then force-release modifier keys to prevent Ctrl+Alt+C misfires.
    fn release_hotkey_modifiers() {
        let deadline = Instant::now() + Duration::from_millis(200);
        unsafe {
            while Instant::now() < deadline {
                let alt_down = (GetAsyncKeyState(VK_MENU as i32) as u16 & 0x8000) != 0;
                let shift_down = (GetAsyncKeyState(VK_SHIFT as i32) as u16 & 0x8000) != 0;
                if !alt_down && !shift_down {
                    break;
                }
                thread::sleep(Duration::from_millis(12));
            }
            let release_inputs = [
                make_key_input(VK_MENU, true),
                make_key_input(VK_LMENU, true),
                make_key_input(VK_RMENU, true),
                make_key_input(VK_SHIFT, true),
                make_key_input(VK_LSHIFT, true),
                make_key_input(VK_RSHIFT, true),
            ];
            SendInput(
                release_inputs.len() as u32,
                release_inputs.as_ptr(),
                std::mem::size_of::<INPUT>() as i32,
            );
        }
    }

    fn get_process_exe_name(hwnd: HWND) -> String {
        unsafe {
            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, &mut pid);
            if pid == 0 {
                return String::new();
            }
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if handle.is_null() {
                return String::new();
            }
            let mut buf = [0u16; 512];
            let mut len = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(handle, 0, buf.as_mut_ptr(), &mut len);
            CloseHandle(handle);
            if ok == 0 || len == 0 {
                return String::new();
            }
            let full_path = String::from_utf16_lossy(&buf[..len as usize]);
            Path::new(&full_path)
                .file_name()
                .map(|n| n.to_string_lossy().to_lowercase())
                .unwrap_or_default()
        }
    }

    fn wait_clipboard_change(prev_seq: u32, max_ms: u64) -> bool {
        let deadline = Instant::now() + Duration::from_millis(max_ms);
        while Instant::now() < deadline {
            let cur = unsafe { GetClipboardSequenceNumber() };
            if cur != prev_seq {
                return true;
            }
            thread::sleep(Duration::from_millis(10));
        }
        false
    }

    pub fn capture_from_foreground(
        auto_select_all: bool,
        blacklist: &[String],
    ) -> CaptureContextDto {
        let hwnd = unsafe { GetForegroundWindow() };
        let source_app = if !hwnd.is_null() {
            get_process_exe_name(hwnd)
        } else {
            String::new()
        };

        let mut clipboard = match arboard::Clipboard::new() {
            Ok(cb) => cb,
            Err(_) => return CaptureContextDto::default(),
        };

        let original_clipboard = clipboard.get_text().unwrap_or_default();
        release_hotkey_modifiers();

        let seq0 = unsafe { GetClipboardSequenceNumber() };
        send_ctrl_combo(0x43); // 'C'

        let mut captured_text = String::new();
        let mut capture_mode = "none".to_string();

        if wait_clipboard_change(seq0, 120) {
            if let Ok(sel) = clipboard.get_text() {
                if !sel.is_empty() {
                    captured_text = sel;
                    capture_mode = "selection".to_string();
                }
            }
        }

        let is_blacklisted = blacklist
            .iter()
            .any(|item| item.eq_ignore_ascii_case(&source_app));

        if captured_text.is_empty() && auto_select_all && !is_blacklisted {
            let seq1 = unsafe { GetClipboardSequenceNumber() };
            send_ctrl_combo(0x41); // 'A'
            thread::sleep(Duration::from_millis(25));
            send_ctrl_combo(0x43); // 'C'
            if wait_clipboard_change(seq1, 130) {
                if let Ok(all_txt) = clipboard.get_text() {
                    if !all_txt.is_empty() {
                        captured_text = all_txt;
                        capture_mode = "select_all".to_string();
                    }
                }
            }
        }

        // Losslessly restore original clipboard content
        let _ = clipboard.set_text(original_clipboard.clone());

        CaptureContextDto {
            captured_text,
            clipboard_text: original_clipboard,
            source_app,
            capture_mode,
            target_hwnd: hwnd as isize,
        }
    }

    pub fn commit_to_target(
        capture: &CaptureContextDto,
        text: &str,
    ) -> Result<(), String> {
        let mut clipboard =
            arboard::Clipboard::new().map_err(|e| format!("无法访问剪贴板: {e}"))?;
        let backup = clipboard.get_text().unwrap_or_default();

        if capture.target_hwnd != 0 {
            unsafe {
                SetForegroundWindow(capture.target_hwnd as HWND);
            }
            thread::sleep(Duration::from_millis(55));
        }

        clipboard
            .set_text(text.to_string())
            .map_err(|e| format!("写入译文到剪贴板失败: {e}"))?;
        thread::sleep(Duration::from_millis(15));

        if capture.capture_mode == "select_all" {
            send_ctrl_combo(0x41); // Re-ensure Ctrl+A after focus switch
            thread::sleep(Duration::from_millis(20));
        }
        send_ctrl_combo(0x56); // 'V'
        thread::sleep(Duration::from_millis(75));

        let _ = clipboard.set_text(backup);
        Ok(())
    }

    pub fn restore_foreground(target_hwnd: isize) {
        if target_hwnd != 0 {
            unsafe {
                SetForegroundWindow(target_hwnd as HWND);
            }
        }
    }
}

#[cfg(target_os = "windows")]
pub use win32_impl::{capture_from_foreground, commit_to_target, restore_foreground};

#[cfg(not(target_os = "windows"))]
pub fn restore_foreground(_target_hwnd: isize) {}

#[cfg(not(target_os = "windows"))]
pub fn capture_from_foreground(
    _auto_select_all: bool,
    _blacklist: &[String],
) -> CaptureContextDto {
    CaptureContextDto::default()
}

#[cfg(not(target_os = "windows"))]
pub fn commit_to_target(
    _capture: &CaptureContextDto,
    text: &str,
) -> Result<(), String> {
    copy_plain_text(text)
}

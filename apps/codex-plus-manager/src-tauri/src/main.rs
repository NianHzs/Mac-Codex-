#![cfg_attr(windows, windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let mut update_confirmation_path = None;
    let mut index = 1;
    while index < args.len() {
        if args[index] == "--confirm-update" {
            if let Some(value) = args.get(index + 1) {
                let path = std::path::PathBuf::from(value);
                if path.is_absolute() {
                    update_confirmation_path = Some(path);
                } else {
                    let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                        "manager.update_confirmation.invalid_path",
                        serde_json::json!({ "path": value }),
                    );
                }
                index += 2;
                continue;
            }
        }
        index += 1;
    }

    for arg in &args {
        if arg.starts_with("codeworkcodexplusplus://") {
            match codex_plus_core::provider_import::save_pending_provider_import_from_url(&arg) {
                Ok(request) => {
                    let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                        "manager.provider_import_url.pending",
                        serde_json::json!({
                            "name": request.name,
                            "baseUrl": request.base_url
                        }),
                    );
                    focus_existing_manager_window();
                }
                Err(error) => {
                    let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                        "manager.provider_import_url.failed",
                        serde_json::json!({
                            "error": error.to_string()
                        }),
                    );
                }
            }
        }
    }
    codex_plus_manager_lib::run(update_confirmation_path);
}

#[cfg(windows)]
fn focus_existing_manager_window() {
    let current_process_id = std::process::id();
    for process in codex_plus_core::windows_enumerate_processes() {
        if process.process_id == current_process_id {
            continue;
        }
        if process
            .exe_file
            .eq_ignore_ascii_case("codework-codex-plus-plus-manager.exe")
        {
            let _ = codex_plus_core::windows_activate_process_window(process.process_id);
            break;
        }
    }
}

#[cfg(not(windows))]
fn focus_existing_manager_window() {}

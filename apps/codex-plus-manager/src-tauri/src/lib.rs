pub mod commands;
pub mod dream_skin_commands;
pub mod install;
pub mod member_session;
pub mod relay_tokens;
pub mod release_update;

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, WindowEvent};
#[cfg(windows)]
use windows::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMWA_CAPTION_COLOR, DWMWA_TEXT_COLOR,
    DWMWA_USE_IMMERSIVE_DARK_MODE,
};

const TRAY_ID: &str = "codex_plus_tray";
const TRAY_TOOLTIP: &str = "\u{265B}Codework AI\u{5BA2}\u{6237}\u{7AEF}";

static APP_EXITING: AtomicBool = AtomicBool::new(false);
const TRAY_MENU_SHOW: &str = "tray_show_main";
const TRAY_MENU_QUIT: &str = "tray_quit_app";

pub fn run(update_confirmation_path: Option<PathBuf>) {
    install_panic_logger();
    let _ = release_update::reconcile_pending_codework_update();
    let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
        "manager.start",
        serde_json::json!({
            "version": env!("CARGO_PKG_VERSION")
        }),
    );
    let Some(_guard) = acquire_single_instance_guard() else {
        return;
    };
    if let Err(error) = confirm_update_start(update_confirmation_path.as_deref()) {
        let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
            "manager.update_confirmation.failed",
            serde_json::json!({ "error": error.to_string() }),
        );
        return;
    }
    let run_result = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            let mut main_window_builder =
                tauri::WebviewWindowBuilder::new(
                    app,
                    "main",
                    tauri::WebviewUrl::App("/index.html".into()),
                )
                    .title("♛Codework AI客户端")
                    .inner_size(1180.0, 820.0)
                    .min_inner_size(960.0, 720.0);
            if let Some(icon) = app.default_window_icon().cloned() {
                main_window_builder = main_window_builder.icon(icon)?;
            }
            let main_window = main_window_builder.build()?;
            apply_manager_window_chrome(&main_window);
            install_tray(app)?;
            register_main_window_events(main_window);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::client_login,
            commands::client_profile,
            member_session::load_member_session,
            member_session::save_member_session,
            member_session::clear_member_session,
            relay_tokens::sync_relay_tokens,
            relay_tokens::load_cached_relay_tokens,
            relay_tokens::apply_relay_token,
            relay_tokens::test_relay_token_connection,
            relay_tokens::apply_workbuddy_relay_config,
            commands::sync_visual_theme_member_session,
            dream_skin_commands::dream_skin_status,
            dream_skin_commands::apply_dream_skin,
            dream_skin_commands::restore_dream_skin,
            commands::load_visual_theme_manifest,
            commands::load_visual_theme_asset,
            commands::update_client_active_role,
            commands::sync_client_identity_window_icon,
            commands::client_activity,
            commands::community_comments,
            commands::post_community_comment,
            commands::delete_community_comment,
            commands::toggle_community_comment_like,
            commands::reply_to_community_comment,
            commands::list_private_friends,
            commands::update_private_presence,
            commands::respond_to_friend_request,
            commands::send_friend_request,
            commands::cancel_friend_request,
            commands::search_registered_friend,
            commands::search_theme_grant_member,
            commands::save_theme_grants,
            commands::load_private_messages,
            commands::send_private_message,
            commands::send_private_attachment,
            commands::client_announcements,
            commands::manage_client_announcements,
            commands::save_client_announcement,
            commands::withdraw_client_announcement,
            commands::client_portal_link,
            commands::backend_version,
            release_update::check_codework_release,
            release_update::install_codework_release,
            commands::get_chatgpt_install_status,
            commands::install_official_chatgpt,
            commands::load_overview,
            commands::launch_codex_plus,
            commands::restart_codex_plus,
            commands::load_settings,
            commands::save_settings,
            commands::save_visual_theme_settings,
            commands::load_ccs_providers,
            commands::import_ccs_providers,
            commands::load_pending_provider_import,
            commands::confirm_pending_provider_import,
            commands::dismiss_pending_provider_import,
            commands::list_local_sessions,
            commands::list_zed_remote_projects,
            commands::open_zed_remote,
            commands::forget_zed_remote_project,
            commands::delete_local_session,
            commands::load_provider_sync_targets,
            commands::sync_providers_now,
            commands::load_ads,
            commands::refresh_script_market,
            commands::install_market_script,
            commands::refresh_skill_market,
            commands::install_market_skill,
            commands::set_user_script_enabled,
            commands::delete_user_script,
            commands::open_external_url,
            commands::install_entrypoints,
            commands::uninstall_entrypoints,
            commands::repair_shortcuts,
            commands::plugin_marketplace_status,
            commands::repair_plugin_marketplace,
            commands::remote_plugin_marketplace_status,
            commands::repair_remote_plugin_marketplace,
            commands::load_watcher_state,
            commands::install_watcher,
            commands::uninstall_watcher,
            commands::enable_watcher,
            commands::disable_watcher,
            commands::read_latest_logs,
            commands::copy_diagnostics,
            commands::reset_settings,
            commands::reset_image_overlay_settings,
            commands::relay_status,
            commands::read_relay_files,
            commands::check_env_conflicts,
            commands::remove_env_conflicts,
            commands::save_relay_file,
            commands::write_diagnostic_event,
            commands::backfill_relay_profile_from_live,
            commands::list_context_entries,
            commands::read_live_context_entries,
            commands::sync_live_context_entries,
            commands::upsert_context_entry,
            commands::delete_context_entry,
            commands::extract_relay_common_config,
            commands::test_relay_profile,
            commands::diagnose_relay_profile,
            commands::test_stepwise_settings,
            commands::fetch_relay_profile_models,
            commands::switch_relay_profile,
            commands::apply_relay_injection,
            commands::apply_pure_api_injection,
            commands::clear_relay_injection,
            manager_exit_app,
            manager_hide_to_tray,
            update_tray_labels
        ])
        .run(tauri::generate_context!());
    if let Err(error) = run_result {
        let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
            "manager.run_failed",
            serde_json::json!({
                "error": error.to_string()
            }),
        );
    }
}

fn install_tray<R: tauri::Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, TRAY_MENU_SHOW, "显示主窗口", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, TRAY_MENU_QUIT, "退出程序", true, None::<&str>)?;
    let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    let mut tray_builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip(TRAY_TOOLTIP)
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            TRAY_MENU_SHOW => {
                show_main_window(app);
            }
            TRAY_MENU_QUIT => {
                APP_EXITING.store(true, Ordering::SeqCst);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            }
            | TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } => {
                show_main_window(&tray.app_handle());
            }
            _ => {}
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }

    let _ = tray_builder.build(app)?;
    Ok(())
}

fn register_main_window_events<R: tauri::Runtime>(window: tauri::WebviewWindow<R>) {
    let event_window = window.clone();
    let minimized_window = event_window.clone();
    let close_event_window = event_window.clone();

    event_window.on_window_event(move |event| match event {
        WindowEvent::Resized(_) => {
            if matches!(minimized_window.is_minimized(), Ok(true)) {
                let _ = minimized_window.hide();
            }
        }
        WindowEvent::CloseRequested { api, .. } => {
            if APP_EXITING.load(Ordering::SeqCst) {
                return;
            }

            api.prevent_close();
            let _ = close_event_window.hide();
        }
        _ => {}
    });
}

#[tauri::command]
fn manager_exit_app<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    exit_manager_for_update(app);
}

#[cfg(windows)]
fn apply_manager_window_chrome<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    let Ok(hwnd) = window.hwnd() else {
        return;
    };

    // Windows expects COLORREF values in BGR byte order. Keep the native
    // title bar distinct from the product surface: a near-black indigo rather
    // than the user's system accent purple, with high-contrast chrome icons.
    let caption_color: u32 = 0x00331A11; // #111A33
    let text_color: u32 = 0x00FFF1E9; // #E9F1FF
    let use_dark_mode: i32 = 1;

    let _ = window.set_theme(Some(tauri::Theme::Dark));
    unsafe {
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_USE_IMMERSIVE_DARK_MODE,
            &use_dark_mode as *const i32 as *const _,
            std::mem::size_of::<i32>() as u32,
        );
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_CAPTION_COLOR,
            &caption_color as *const u32 as *const _,
            std::mem::size_of::<u32>() as u32,
        );
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_TEXT_COLOR,
            &text_color as *const u32 as *const _,
            std::mem::size_of::<u32>() as u32,
        );
    }
}

#[cfg(not(windows))]
fn apply_manager_window_chrome<R: tauri::Runtime>(_window: &tauri::WebviewWindow<R>) {}

pub(crate) fn exit_manager_for_update<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    mark_manager_exiting_for_update();
    app.exit(0);
}

fn mark_manager_exiting_for_update() {
    APP_EXITING.store(true, Ordering::SeqCst);
}

fn write_update_confirmation_marker(path: &Path) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let temporary_path = path.with_extension("json.tmp");
    let confirmed_at_ms = SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis() as u64;
    let contents = serde_json::to_string_pretty(&serde_json::json!({
        "version": codex_plus_core::version::DISPLAY_VERSION,
        "confirmedAtMs": confirmed_at_ms
    }))?;
    std::fs::write(&temporary_path, format!("{contents}\n"))?;
    if path.exists() {
        std::fs::remove_file(path)?;
    }
    std::fs::rename(&temporary_path, path)?;
    Ok(())
}

fn confirm_update_start(path: Option<&Path>) -> anyhow::Result<()> {
    let Some(path) = path else {
        return Ok(());
    };
    write_update_confirmation_marker(path)?;
    let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
        "manager.update_confirmation.written",
        serde_json::json!({
            "path": path,
            "version": codex_plus_core::version::DISPLAY_VERSION,
            "phase": "startup_before_gui"
        }),
    );
    Ok(())
}

#[tauri::command]
fn manager_hide_to_tray<R: tauri::Runtime>(window: tauri::WebviewWindow<R>) {
    let _ = window.hide();
}

#[tauri::command]
fn update_tray_labels<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    show_label: String,
    quit_label: String,
    window_title: String,
) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let show_item = MenuItem::with_id(&app, TRAY_MENU_SHOW, &show_label, true, None::<&str>);
        let quit_item = MenuItem::with_id(&app, TRAY_MENU_QUIT, &quit_label, true, None::<&str>);
        if let (Ok(show), Ok(quit)) = (show_item, quit_item) {
            if let Ok(menu) = Menu::with_items(&app, &[&show, &quit]) {
                let _ = tray.set_menu(Some(menu));
            }
        }
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title(&window_title);
    }
}

fn show_main_window<R: tauri::Runtime>(app_handle: &tauri::AppHandle<R>) {
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn update_exit_marks_the_manager_as_exiting() {
        APP_EXITING.store(false, Ordering::SeqCst);
        mark_manager_exiting_for_update();
        assert!(APP_EXITING.load(Ordering::SeqCst));
        APP_EXITING.store(false, Ordering::SeqCst);
    }

    #[test]
    fn update_confirmation_marker_records_the_started_version_atomically() {
        let temp = tempfile::tempdir().unwrap();
        let marker = temp.path().join("update-start-confirmed.json");

        write_update_confirmation_marker(&marker).unwrap();

        let value: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&marker).unwrap()).unwrap();
        assert_eq!(
            value["version"],
            serde_json::json!(codex_plus_core::version::DISPLAY_VERSION)
        );
        assert!(value["confirmedAtMs"].as_u64().is_some());
        assert!(!marker.with_extension("json.tmp").exists());
    }

    #[test]
    fn update_confirmation_can_be_written_before_gui_initialization() {
        let temp = tempfile::tempdir().unwrap();
        let marker = temp.path().join("update-start-confirmed.json");

        confirm_update_start(Some(&marker)).unwrap();

        assert!(marker.exists());
    }

    #[test]
    fn update_confirmation_happens_before_tauri_builder_starts() {
        let source = include_str!("lib.rs");
        let confirmation = source
            .find("confirm_update_start(update_confirmation_path.as_deref())")
            .expect("startup should confirm a pending update");
        let builder = source
            .find("tauri::Builder::default()")
            .expect("manager should construct the Tauri application");

        assert!(confirmation < builder);
    }
}

fn install_panic_logger() {
    std::panic::set_hook(Box::new(|panic_info| {
        let payload = panic_info
            .payload()
            .downcast_ref::<&str>()
            .map(|message| (*message).to_string())
            .or_else(|| panic_info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "非字符串 panic payload".to_string());
        let location = panic_info.location().map(|location| {
            serde_json::json!({
                "file": location.file(),
                "line": location.line(),
                "column": location.column()
            })
        });
        let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
            "manager.panic",
            serde_json::json!({
                "payload": payload,
                "location": location
            }),
        );
    }));
}

fn acquire_single_instance_guard() -> Option<codex_plus_core::ports::LoopbackPortGuard> {
    match codex_plus_core::ports::acquire_resilient_loopback_port_guard(
        codex_plus_core::ports::manager_guard_port(),
    ) {
        Ok(guard) => {
            if let Some(fallback_lock_path) = guard.fallback_path() {
                let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                    "manager.guard_fallback",
                    serde_json::json!({
                        "requested_guard_port": codex_plus_core::ports::manager_guard_port(),
                        "fallback_lock_path": fallback_lock_path
                    }),
                );
            }
            Some(guard)
        }
        Err(error) if error.kind() == std::io::ErrorKind::AddrInUse => {
            let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                "manager.already_running",
                serde_json::json!({
                    "guard_port": codex_plus_core::ports::manager_guard_port()
                }),
            );
            None
        }
        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
            let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                "manager.already_running",
                serde_json::json!({
                    "guard_port": codex_plus_core::ports::manager_guard_port()
                }),
            );
            None
        }
        Err(error) => {
            let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                "manager.guard_failed",
                serde_json::json!({
                    "guard_port": codex_plus_core::ports::manager_guard_port(),
                    "error": error.to_string()
                }),
            );
            match std::net::TcpListener::bind(("127.0.0.1", 0)) {
                Ok(listener) => Some(codex_plus_core::ports::LoopbackPortGuard::listener(
                    listener,
                )),
                Err(fallback_error) => {
                    let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                        "manager.guard_fallback_failed",
                        serde_json::json!({
                            "error": fallback_error.to_string()
                        }),
                    );
                    None
                }
            }
        }
    }
}

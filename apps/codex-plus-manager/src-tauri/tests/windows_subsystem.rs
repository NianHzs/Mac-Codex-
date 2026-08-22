#[cfg(windows)]
#[test]
fn manager_binary_uses_windows_gui_subsystem_in_debug_and_release() {
    let main_rs = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/src/main.rs"))
        .expect("read manager main.rs");

    assert!(
        main_rs.contains("#![cfg_attr(windows, windows_subsystem = \"windows\")]"),
        "manager binary should not allocate a console window on Windows"
    );
}

#[test]
fn manager_release_binary_uses_embedded_frontend_assets() {
    let cargo_toml = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/Cargo.toml"))
        .expect("read manager Cargo.toml");

    assert!(
        cargo_toml.contains("custom-protocol"),
        "release manager binary should use Tauri custom protocol instead of devUrl localhost"
    );
}

#[test]
fn manager_uses_single_instance_guard_before_starting_tauri() {
    let lib_rs = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/src/lib.rs"))
        .expect("read manager lib.rs");

    assert!(lib_rs.contains("acquire_single_instance_guard()"));
    assert!(lib_rs.contains("manager_guard_port"));
    assert!(lib_rs.contains("manager.already_running"));
}

#[test]
fn manager_main_window_uses_default_window_icon_explicitly() {
    let lib_rs = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/src/lib.rs"))
        .expect("read manager lib.rs");

    assert!(lib_rs.contains("main_window_builder"));
    assert!(lib_rs.contains("app.default_window_icon().cloned()"));
    assert!(lib_rs.contains("main_window_builder = main_window_builder.icon(icon)?"));
}

#[test]
fn manager_close_minimizes_to_tray_without_confirmation() {
    let lib_rs = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/src/lib.rs"))
        .expect("read manager lib.rs");
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let app_tsx = manifest_dir.parent().unwrap().join("src/App.tsx");
    let app_tsx = std::fs::read_to_string(&app_tsx).expect("read manager App.tsx");

    assert!(!lib_rs.contains("MessageDialogButtons"));
    assert!(!lib_rs.contains(".dialog()"));
    assert!(!lib_rs.contains("manager://close-requested"));
    assert!(lib_rs.contains("let _ = close_event_window.hide();"));
    assert!(!app_tsx.contains("CloseConfirmDialog"));
    assert!(app_tsx.contains("manager_exit_app"));
    assert!(app_tsx.contains("manager_hide_to_tray"));
}

#[test]
fn manager_queues_codework_provider_urls_for_confirmation_on_startup() {
    let main_rs = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/src/main.rs"))
        .expect("read manager main.rs");

    assert!(main_rs.contains("codeworkcodexplusplus://"));
    assert!(main_rs.contains("provider_import::save_pending_provider_import_from_url"));
    assert!(!main_rs.contains("provider_import::import_provider_from_url"));
    assert!(main_rs.contains("manager.provider_import_url.pending"));
}

#[cfg(windows)]
#[test]
fn manager_uses_a_dedicated_deep_indigo_native_title_bar() {
    let lib_rs = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/src/lib.rs"))
        .expect("read manager lib.rs");
    let cargo_toml = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/Cargo.toml"))
        .expect("read manager Cargo.toml");

    assert!(lib_rs.contains("apply_manager_window_chrome(&main_window)"));
    assert!(lib_rs.contains("DWMWA_CAPTION_COLOR"));
    assert!(lib_rs.contains("DWMWA_TEXT_COLOR"));
    assert!(cargo_toml.contains("Win32_Graphics_Dwm"));
}

#[test]
fn codework_windows_identity_is_isolated_from_upstream() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let manager_cargo = std::fs::read_to_string(manifest_dir.join("Cargo.toml"))
        .expect("read manager Cargo.toml");
    let launcher_cargo = std::fs::read_to_string(
        manifest_dir.join("../../codex-plus-launcher/Cargo.toml"),
    )
    .expect("read launcher Cargo.toml");
    let tauri_config = std::fs::read_to_string(manifest_dir.join("tauri.conf.json"))
        .expect("read tauri config");
    let manager_main = std::fs::read_to_string(manifest_dir.join("src/main.rs"))
        .expect("read manager main.rs");
    let windows_rs = std::fs::read_to_string(
        manifest_dir.join("../../../crates/codex-plus-core/src/install/windows.rs"),
    )
    .expect("read Windows install source");

    assert!(manager_cargo.contains("name = \"codework-codex-plus-plus-manager\""));
    assert!(launcher_cargo.contains("name = \"codework-codex-plus-plus\""));
    assert!(tauri_config.contains("com.codework.codexplusplus.manager"));
    assert!(tauri_config.contains("♛Codework AI客户端"));
    assert!(manager_main.contains("codeworkcodexplusplus://"));
    assert!(manager_main.contains("codework-codex-plus-plus-manager.exe"));
    assert!(windows_rs.contains("Uninstall\\CodeworkCodexPlusPlus"));
    assert!(windows_rs.contains("Software\\Classes\\codeworkcodexplusplus"));
    assert!(!windows_rs.contains("LEGACY_UNINSTALL_SUBKEY"));
}

#[test]
fn codework_homepage_and_provider_preset_are_present() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let app = std::fs::read_to_string(manifest_dir.join("../src/App.tsx"))
        .expect("read manager App.tsx");
    let codework = std::fs::read_to_string(manifest_dir.join("../src/codework.ts"))
        .expect("read Codework constants");
    let presets = std::fs::read_to_string(manifest_dir.join("../src/presets.ts"))
        .expect("read provider presets");
    let normalize_settings = app
        .split("function normalizeSettings")
        .nth(1)
        .and_then(|source| source.split("function clampNumber").next())
        .expect("read normalizeSettings source");

    assert!(app.contains("CODEWORK_PROVIDER_NAME"));
    assert!(app.contains("CODEWORK_REGISTER_URL"));
    assert!(app.contains("CODEWORK_API_BASE_URL"));
    assert!(app.contains("id: \"codework-ai\""));
    assert!(app.contains("name: \"Codework AI 官方中转\""));
    assert!(app.contains("gpt-5.6-terra"));
    assert!(app.contains("relayMode: \"pureApi\""));
    assert!(normalize_settings.contains("id: \"codework-ai\""));
    assert!(normalize_settings.contains("name: \"Codework AI 官方中转\""));
    assert!(normalize_settings.contains("baseUrl: CODEWORK_API_BASE_URL"));
    assert!(normalize_settings.contains("upstreamBaseUrl: CODEWORK_API_BASE_URL"));
    assert!(normalize_settings.contains("relayMode: \"pureApi\""));
    assert!(normalize_settings.contains("modelList: \"gpt-5.6-sol\\ngpt-5.6-terra\\ngpt-5.6-luna\\ngpt-5.5\""));
    assert!(codework.contains("Codework AI 内部技术应用"));
    assert!(codework.contains("https://gptproxy.site/register?aff=Kw5y"));
    assert!(presets.contains("id: \"codework-ai\""));
    assert!(presets.contains("CODEWORK_API_BASE_URL"));
    assert!(codework.contains("https://gptproxy.site/v1"));
}

#[test]
fn manager_has_no_recommendation_route_or_jojocode_home_card() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let app = std::fs::read_to_string(manifest_dir.join("../src/App.tsx"))
        .expect("read manager App.tsx");

    assert!(!app.contains("id: \"recommendations\""));
    assert!(!app.contains("jojocode-overview"));
    assert!(!app.contains("actions.openExternalUrl(\"https://jojocode.com/\")"));
}

#[test]
fn launcher_binary_embeds_codex_icon_resource() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let launcher_build = manifest_dir
        .parent()
        .and_then(std::path::Path::parent)
        .unwrap()
        .join("codex-plus-launcher/build.rs");
    let build_rs = std::fs::read_to_string(&launcher_build).expect("read launcher build.rs");

    assert!(build_rs.contains("WindowsResource"));
    assert!(build_rs.contains("icons/icon.ico"));
}

#[test]
fn windows_binaries_can_restart_after_a_silent_user_level_update() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let manager_build =
        std::fs::read_to_string(manifest_dir.join("build.rs")).expect("read manager build.rs");
    let windows_manifest = std::fs::read_to_string(manifest_dir.join("windows-app-manifest.xml"))
        .expect("read windows app manifest");
    let launcher_build = manifest_dir
        .parent()
        .and_then(std::path::Path::parent)
        .unwrap()
        .join("codex-plus-launcher/build.rs");
    let launcher_build = std::fs::read_to_string(&launcher_build).expect("read launcher build.rs");
    let windows_installer = manifest_dir
        .parent()
        .and_then(std::path::Path::parent)
        .and_then(std::path::Path::parent)
        .unwrap()
        .join("scripts/installer/windows/CodexPlusPlus.nsi");
    let windows_installer =
        std::fs::read_to_string(&windows_installer).expect("read windows installer");

    assert!(manager_build.contains("windows-app-manifest.xml"));
    assert!(launcher_build.contains("windows-app-manifest.xml"));
    assert!(windows_manifest.contains("level=\"asInvoker\""));
    assert!(!windows_manifest.contains("requireAdministrator"));
    assert!(windows_manifest.contains("Microsoft.Windows.Common-Controls"));
    assert!(windows_installer.contains("RequestExecutionLevel admin"));
}

#[test]
fn windows_entrypoints_register_codework_url_protocol() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let windows_install = manifest_dir
        .parent()
        .and_then(std::path::Path::parent)
        .and_then(std::path::Path::parent)
        .unwrap()
        .join("crates/codex-plus-core/src/install/windows.rs");
    let windows_install =
        std::fs::read_to_string(&windows_install).expect("read windows install source");

    assert!(windows_install.contains("Software\\Classes\\codeworkcodexplusplus"));
    assert!(windows_install.contains("URL Protocol"));
    assert!(windows_install.contains("%1"));
}

#[test]
fn manager_launch_button_spawns_silent_launcher_binary() {
    let commands_rs =
        std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/src/commands.rs"))
            .expect("read manager commands.rs");

    assert!(commands_rs.contains("SILENT_BINARY"));
    assert!(commands_rs.contains("std::process::Command::new"));
    assert!(!commands_rs.contains("launch_and_inject_with_hooks(options"));
}

#[test]
fn macos_packager_hides_silent_launcher_but_not_manager() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let packager = manifest_dir
        .parent()
        .and_then(std::path::Path::parent)
        .and_then(std::path::Path::parent)
        .unwrap()
        .join("scripts/installer/macos/package-dmg.sh");
    let script = std::fs::read_to_string(&packager).expect("read macOS packager");

    assert!(script.contains("<key>LSUIElement</key>"));
    assert!(script.contains("ARCH=\"${2:-$(uname -m)}\""));
    assert!(script.contains("BINARY_DIR=\"${BINARY_DIR:-$ROOT/target/release}\""));
    assert!(script.contains("Codework-AI客户端-${VERSION}-macos-${ARCH}.dmg"));
    assert!(script.contains(
        "create_app \"$PRODUCT_NAME\" \"CodeworkCodexPlusPlus\" \"$BINARY_DIR/codex-plus-plus\" \"com.codework.codexplusplus\" \"true\""
    ));
    assert!(script.contains(
        "create_app \"$MANAGER_NAME\" \"CodeworkCodexPlusPlusManager\" \"$BINARY_DIR/codex-plus-plus-manager\" \"com.codework.codexplusplus.manager\" \"false\""
    ));
}

#[test]
fn github_release_workflow_builds_separate_macos_x64_and_arm64_dmgs() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let workflow = manifest_dir
        .parent()
        .and_then(std::path::Path::parent)
        .and_then(std::path::Path::parent)
        .unwrap()
        .join(".github/workflows/release-assets.yml");
    let workflow = std::fs::read_to_string(&workflow).expect("read release assets workflow");

    assert!(workflow.contains("macos-15-intel"));
    assert!(workflow.contains("x86_64-apple-darwin"));
    assert!(workflow.contains("macos-14"));
    assert!(workflow.contains("aarch64-apple-darwin"));
    assert!(workflow.contains("package-dmg.sh \"$VERSION\" \"${{ matrix.arch }}\""));
    assert!(workflow.contains("target/${{ matrix.target }}/release"));
}

#[test]
fn github_release_workflow_uploads_static_latest_json() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let workflow = manifest_dir
        .parent()
        .and_then(std::path::Path::parent)
        .and_then(std::path::Path::parent)
        .unwrap()
        .join(".github/workflows/release-assets.yml");
    let workflow = std::fs::read_to_string(&workflow).expect("read release assets workflow");

    assert!(workflow.contains("latest-json:"));
    assert!(workflow.contains("latest.json"));
    assert!(workflow.contains("gh release upload \"$TAG\" latest.json --clobber"));
}

#[test]
fn github_release_workflow_can_publish_macos_packages_to_1panel() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let workflow = manifest_dir
        .parent()
        .and_then(std::path::Path::parent)
        .and_then(std::path::Path::parent)
        .unwrap()
        .join(".github/workflows/release-assets.yml");
    let workflow = std::fs::read_to_string(&workflow).expect("read release assets workflow");

    assert!(workflow.contains("publish-macos-to-1panel:"));
    assert!(workflow.contains("CODEWORK_1PANEL_SSH_PRIVATE_KEY"));
    assert!(workflow.contains("codework-ai-client-macos.json"));
    assert!(workflow.contains("sha256sum -c SHA256SUMS"));
    assert!(workflow.contains("Codework-AI客户端-${VERSION}-macos-*.dmg"));
}

#[test]
fn relay_settings_keeps_profile_config_and_auth_files_isolated() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let app_tsx = manifest_dir.parent().unwrap().join("src/App.tsx");
    let app_tsx = std::fs::read_to_string(&app_tsx).expect("read manager App.tsx");
    let commands_rs = manifest_dir.join("src/commands.rs");
    let commands_rs = std::fs::read_to_string(&commands_rs).expect("read manager commands.rs");

    assert!(app_tsx.contains("snapshotActiveRelayFilesBeforeSwitch"));
    assert!(app_tsx.contains("backfill_relay_profile_from_live"));
    assert!(app_tsx.contains("relayProfileSwitchValidation(selectedBeforeSave)"));
    assert!(app_tsx.contains("缺少独立 config.toml"));
    assert!(app_tsx.contains("const command = relayProfileSwitchCommand(selectedAfterSave)"));
    assert!(app_tsx.contains("function relayProfileSwitchCommand"));
    assert!(app_tsx.contains("return \"apply_pure_api_injection\""));
    assert!(app_tsx.contains("return \"apply_relay_injection\""));
    assert!(app_tsx.contains("const createNewAggregateProfile = () =>"));
    assert!(app_tsx.contains("onClick={createNewAggregateProfile}"));
    assert!(app_tsx.contains("已打开聚合供应商详情"));
    assert!(!commands_rs.contains("缺少独立 auth.json"));
    assert!(commands_rs.contains("backfill_relay_profile_from_live"));
    assert!(commands_rs.contains("apply_relay_profile_to_home_with_switch_rules"));
}

#[test]
fn relay_context_management_is_global_not_supplier_scoped() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let app_tsx = manifest_dir.parent().unwrap().join("src/App.tsx");
    let app_tsx = std::fs::read_to_string(&app_tsx).expect("read manager App.tsx");
    let styles = manifest_dir.parent().unwrap().join("src/styles.css");
    let styles = std::fs::read_to_string(&styles).expect("read manager styles.css");

    assert!(app_tsx.contains("作为全局配置独立管理"));
    assert!(
        app_tsx.contains("label: t(\"工具与插件\")") || app_tsx.contains("label: \"工具与插件\"")
    );
    assert!(
        app_tsx.contains("title={t(\"Codex 工具与插件\")}")
            || app_tsx.contains("title=\"Codex 工具与插件\"")
    );
    assert!(!app_tsx.contains("label: \"上下文配置\""));
    assert!(!app_tsx.contains("title=\"上下文配置\""));
    assert!(!app_tsx.contains("<strong>Codex 上下文</strong>"));
    assert!(app_tsx.contains("id: \"context\""));
    assert!(app_tsx.contains("function ContextScreen"));
    assert!(app_tsx.contains("route === \"context\""));
    assert!(app_tsx.contains("if (next === \"context\")"));
    assert!(app_tsx.contains("selectedContextConfigToml(entries)"));
    assert!(app_tsx.contains("toggleContextEntryEnabled"));
    assert!(app_tsx.contains("relayFiles={relayFiles}"));
    assert!(app_tsx.contains("read_live_context_entries"));
    assert!(app_tsx.contains("sync_live_context_entries"));
    assert!(app_tsx.contains("refreshLiveContextEntries"));
    assert!(app_tsx.contains("syncLiveContextEntries(next, true)"));
    assert!(app_tsx.contains("function contextEntriesWithLiveEntries"));
    assert!(app_tsx.contains("liveByKind"));
    assert!(app_tsx.contains("mergeLiveContextEntries"));
    assert!(app_tsx.contains("withLiveEntryState"));
    assert!(app_tsx.contains("contextEnabledSwitch"));
    assert!(!app_tsx.contains("entry.enabled ? \"已启用\" : \"已禁用\""));
    assert!(!app_tsx.contains("空配置体"));
    assert!(app_tsx.contains("relay-context-delete"));
    assert!(!app_tsx.contains("切换供应商时只合并勾选项"));
    assert!(!app_tsx.contains("未勾选的条目不会写入"));
    assert!(!app_tsx.contains("className=\"context-switch\""));
    assert!(!styles.contains(".context-switch {"));
    assert!(styles.contains(".context-enabled-switch"));
    assert!(styles.contains(".context-switch-track"));
    assert!(styles.contains(".context-switch-thumb"));
    assert!(!styles.contains(".relay-context-row code"));
    assert!(styles.contains(".relay-context-delete"));
}

#[test]
fn manager_window_and_relay_detail_header_stay_usable() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let app_tsx = manifest_dir.parent().unwrap().join("src/App.tsx");
    let app_tsx = std::fs::read_to_string(&app_tsx).expect("read manager App.tsx");
    let styles = manifest_dir.parent().unwrap().join("src/styles.css");
    let styles = std::fs::read_to_string(&styles).expect("read manager styles.css");
    let lib_rs =
        std::fs::read_to_string(manifest_dir.join("src/lib.rs")).expect("read manager lib.rs");
    let tauri_conf =
        std::fs::read_to_string(manifest_dir.join("tauri.conf.json")).expect("read tauri config");

    assert!(app_tsx.contains("relay-detail-sticky"));
    assert!(!app_tsx.contains("CardHead title=\"供应商详情\""));
    assert!(styles.contains(".relay-detail-sticky"));
    assert!(styles.contains("position: sticky"));
    assert!(styles.contains("top: 0"));
    assert!(styles.contains("margin: 0"));
    assert!(lib_rs.contains(".inner_size(1180.0, 820.0)"));
    assert!(lib_rs.contains(".min_inner_size(960.0, 720.0)"));
    assert!(tauri_conf.contains("\"width\": 1180"));
    assert!(tauri_conf.contains("\"height\": 820"));
    assert!(tauri_conf.contains("\"minWidth\": 960"));
    assert!(tauri_conf.contains("\"minHeight\": 720"));
}

#[test]
fn relay_preview_deduplicates_root_keys_when_merging_common_config() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let app_tsx = manifest_dir.parent().unwrap().join("src/App.tsx");
    let app_tsx = std::fs::read_to_string(&app_tsx).expect("read manager App.tsx");

    assert!(app_tsx.contains("dedupeTomlRootLines"));
    assert!(app_tsx.contains("rootSeen.add(key)"));
    assert!(app_tsx.contains("joinTomlSectionsRootFirst"));
}

#[test]
fn provider_presets_include_runapi() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let presets = manifest_dir.parent().unwrap().join("src/presets.ts");
    let presets = std::fs::read_to_string(&presets).expect("read manager presets.ts");

    assert!(presets.contains("id: \"runapi\""));
    assert!(presets.contains("name: \"RunAPI\""));
    assert!(presets.contains("category: \"aggregator\""));
    assert!(presets.contains("baseUrl: \"https://runapi.co/v1\""));
}

#[test]
fn manager_no_longer_exposes_mobile_control() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let app_tsx = manifest_dir.parent().unwrap().join("src/App.tsx");
    let app_tsx = std::fs::read_to_string(&app_tsx).expect("read manager App.tsx");

    assert!(!app_tsx.contains("mobileControl"));
    assert!(!app_tsx.contains("手机控制"));
    assert!(!app_tsx.contains("mobileRelayServers"));
    assert!(!app_tsx.contains("MobileControlScreen"));
}

#[test]
fn manager_ui_no_longer_exposes_command_wrapper_or_startup_marketplace_prompt() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let app_tsx = manifest_dir.parent().unwrap().join("src/App.tsx");
    let app_tsx = std::fs::read_to_string(&app_tsx).expect("read manager App.tsx");

    assert!(!app_tsx.contains("启用 Codex 命令包装器"));
    assert!(!app_tsx.contains("修复后端"));
    assert!(!app_tsx.contains("repairBackend"));
    assert!(!app_tsx.contains("await checkPluginMarketplacePrompt()"));
}

#[test]
fn codework_build_does_not_call_or_register_upstream_updater() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let app_tsx = manifest_dir.parent().unwrap().join("src/App.tsx");
    let app_tsx = std::fs::read_to_string(&app_tsx).expect("read manager App.tsx");
    let commands = std::fs::read_to_string(manifest_dir.join("src/commands.rs"))
        .expect("read manager commands");
    let lib = std::fs::read_to_string(manifest_dir.join("src/lib.rs"))
        .expect("read manager lib");
    let launcher = std::fs::read_to_string(
        manifest_dir.join("../../codex-plus-launcher/src/main.rs"),
    )
    .expect("read launcher main");
    let core_lib = std::fs::read_to_string(
        manifest_dir.join("../../../crates/codex-plus-core/src/lib.rs"),
    )
    .expect("read core lib");

    assert!(!app_tsx.contains("check_update"));
    assert!(!app_tsx.contains("perform_update"));
    assert!(!app_tsx.contains("updateInstallProgress"));
    assert!(!commands.contains("pub async fn check_update"));
    assert!(!commands.contains("pub async fn perform_update"));
    assert!(!lib.contains("commands::check_update"));
    assert!(!lib.contains("commands::perform_update"));
    assert!(!launcher.contains("notify_manager_when_update_available"));
    assert!(!core_lib.contains("pub mod update;"));
}

#[test]
fn codework_release_uses_dedicated_commands_and_keeps_the_upstream_updater_disabled() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let commands = std::fs::read_to_string(manifest_dir.join("src/commands.rs"))
        .expect("read manager commands");
    let release_update = std::fs::read_to_string(manifest_dir.join("src/release_update.rs"))
        .expect("read release update service");
    let lib = std::fs::read_to_string(manifest_dir.join("src/lib.rs"))
        .expect("read manager lib");

    assert!(release_update.contains("pub async fn check_codework_release"));
    assert!(release_update.contains("pub async fn install_codework_release"));
    assert!(release_update.contains("codework-release-progress"));
    assert!(lib.contains("release_update::check_codework_release"));
    assert!(lib.contains("release_update::install_codework_release"));
    assert!(!commands.contains("pub async fn check_update"));
    assert!(!commands.contains("pub async fn perform_update"));
}

#[test]
fn manager_installs_only_allowlisted_official_chatgpt_store_products() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let commands = std::fs::read_to_string(manifest_dir.join("src/commands.rs"))
        .expect("read manager commands");
    let lib = std::fs::read_to_string(manifest_dir.join("src/lib.rs"))
        .expect("read manager lib");

    assert!(commands.contains("9PLM9XGG6VKS"));
    assert!(commands.contains("9NT1R1C2HH7J"));
    assert!(commands.contains("--source"));
    assert!(commands.contains("msstore"));
    assert!(commands.contains("chatgpt-install-progress"));
    assert!(commands.contains("pub async fn get_chatgpt_install_status"));
    assert!(commands.contains("pub async fn install_official_chatgpt"));
    assert!(lib.contains("commands::get_chatgpt_install_status"));
    assert!(lib.contains("commands::install_official_chatgpt"));
}

#[test]
fn manager_ui_exposes_release_install_and_official_chatgpt_download_routes() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let app = std::fs::read_to_string(manifest_dir.parent().unwrap().join("src/App.tsx"))
        .expect("read manager App.tsx");

    assert!(app.contains("downloadChatGpt"));
    assert!(app.contains("check_codework_release"));
    assert!(app.contains("install_codework_release"));
    assert!(app.contains("chatgpt-install-progress"));
    assert!(app.contains("发现新版本"));
}

#[test]
fn codework_brand_uses_the_identity_aware_crown_and_keeps_the_packaged_crown_asset() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let app = std::fs::read_to_string(manifest_dir.parent().unwrap().join("src/App.tsx"))
        .expect("read manager App.tsx");
    let crown = manifest_dir.join("icons/codework-crown.svg");

    assert!(crown.exists());
    assert!(app.contains("<Crown"));
    assert!(app.contains("brand-crown"));
    assert!(!app.contains("brand-mark\">C++"));
}

#[test]
fn private_chat_centers_its_active_name_and_uses_an_admin_crest() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let chat = std::fs::read_to_string(manifest_dir.parent().unwrap().join("src/private-chat.tsx"))
        .expect("read private chat component");
    let styles = std::fs::read_to_string(manifest_dir.parent().unwrap().join("src/styles.css"))
        .expect("read manager styles");

    assert!(styles.contains(".private-chat-dialog > header strong"));
    assert!(styles.contains("grid-template-columns: 1fr auto 1fr"));
    assert!(chat.contains("private-chat-avatar admin"));
    assert!(chat.contains("UserRound"));
}

#[test]
fn tray_icon_has_a_codework_name_tooltip() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let library = std::fs::read_to_string(manifest_dir.join("src/lib.rs"))
        .expect("read manager library");

    assert!(library.contains("TRAY_TOOLTIP"));
    assert!(library.contains(".tooltip(TRAY_TOOLTIP)"));
}

#[test]
fn activity_opens_the_official_portal_with_the_member_ticket_handoff() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let app = std::fs::read_to_string(manifest_dir.parent().unwrap().join("src/App.tsx"))
        .expect("read manager App.tsx");
    let injector = std::fs::read_to_string(manifest_dir.join("../../../assets/inject/renderer-inject.js"))
        .expect("read renderer injector");

    assert!(app.contains("client_portal_link"));
    assert!(app.contains("CODEWORK_ACTIVITY_PORTAL_URL"));
    assert!(injector.contains("http://115.190.199.191:20080/download"));
    assert!(!injector.contains("github.com/BigPizzaV3/CodexPlusPlus"));
}

#[test]
fn manager_exposes_the_community_and_admin_experience_routes() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let app = std::fs::read_to_string(manifest_dir.parent().unwrap().join("src/App.tsx"))
        .expect("read manager App.tsx");
    let commands = std::fs::read_to_string(manifest_dir.join("src/commands.rs"))
        .expect("read manager commands");

    assert!(app.contains("community"));
    assert!(app.contains("超话"));
    assert!(app.contains("身份体验"));
    assert!(commands.contains("pub async fn community_comments"));
    assert!(commands.contains("pub async fn post_community_comment"));
    assert!(commands.contains("pub async fn delete_community_comment"));
}

#[test]
fn codework_installer_is_independent_and_packages_notices() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let root = manifest_dir.join("../../..");
    let nsi = std::fs::read_to_string(
        root.join("scripts/installer/windows/CodeworkCodexPlusPlus.nsi"),
    )
    .expect("read Codework NSIS installer");
    let build_script = std::fs::read_to_string(root.join("scripts/build-codework-windows.ps1"))
        .expect("read Codework build script");
    let frontend_brand = std::fs::read_to_string(root.join("apps/codex-plus-manager/src/codework.ts"))
        .expect("read Codework frontend brand");
    let notices = std::fs::read_to_string(root.join("THIRD_PARTY_NOTICES.txt"))
        .expect("read third-party notices");

    assert!(nsi.contains("Name \"♛Codework AI客户端\""));
    assert!(nsi.contains("InstallDir \"$LOCALAPPDATA\\Programs\\Codework Codex++\""));
    assert!(nsi.contains("♛Codework AI客户端-${VERSION}-windows-x64-setup.exe"));
    assert!(nsi.contains("codework-codex-plus-plus.exe"));
    assert!(nsi.contains("codework-codex-plus-plus-manager.exe"));
    assert!(nsi.contains("THIRD_PARTY_NOTICES.txt"));
    assert!(!nsi.contains("taskkill /IM codex-plus-plus.exe"));
    assert!(!nsi.contains("Uninstall\\Codex++"));
    assert!(build_script.contains("CARGO_INCREMENTAL"));
    assert!(build_script.contains("CARGO_BUILD_JOBS"));
    assert!(build_script.contains("$env:CARGO_TARGET_DIR"));
    assert!(build_script.contains("'D:\\CodeworkBuildCache\\cargo-target'"));
    assert!(!build_script.contains(
        "Join-Path $env:LOCALAPPDATA 'CodeworkCodexPlusPlus\\cargo-target'"
    ));
    assert!(build_script.contains("$cargoReleaseDir"));
    assert!(build_script.contains(
        "Join-Path $cargoReleaseDir 'codework-codex-plus-plus.exe'"
    ));
    assert!(build_script.contains(
        "Join-Path $cargoReleaseDir 'codework-codex-plus-plus-manager.exe'"
    ));
    assert!(build_script.contains("function Assert-NativeSuccess"));
    assert!(build_script.contains("INSTALLER_SMOKE_TEST"));
    assert!(build_script.contains("/DSMOKE_TEST"));
    assert!(nsi.contains("!ifdef SMOKE_TEST"));
    assert!(build_script.contains("codework-codex-plus-plus.exe"));
    assert!(build_script.contains("codework-codex-plus-plus-manager.exe"));
    for checked_command in [
        "Assert-NativeSuccess 'npm ci' $LASTEXITCODE",
        "Assert-NativeSuccess 'npm run check' $LASTEXITCODE",
        "Assert-NativeSuccess 'npm run vite:build' $LASTEXITCODE",
        "Assert-NativeSuccess 'cargo test --workspace --exclude codex-plus-manager --jobs 1' $LASTEXITCODE",
        "Assert-NativeSuccess 'cargo build --release --jobs 1' $LASTEXITCODE",
        "Assert-NativeSuccess 'makensis' $LASTEXITCODE",
    ] {
        assert!(
            build_script.contains(checked_command),
            "build script must stop after native command failure: {checked_command}"
        );
    }
    assert!(build_script.contains("$forbiddenStrings = @("));
    assert!(build_script.contains("$legacyAlipayLabel = -join"));
    assert!(build_script.contains("0x652F, 0x4ED8, 0x5B9D, 0x8D5E, 0x8D4F, 0x7801"));
    assert!(!build_script.contains("支付宝赞赏码"));
    // 字面量扫描原来调用外部 rg，但它不保证在 PATH 上，而这是发布前最后一道闸门，
    // 不该依赖可选工具。现在用脚本内的 Test-BinaryContainsText（UTF-8 + UTF-16LE
    // 双编码字节级匹配）。断言改为盯住能力与覆盖范围，而不是某个命令的字面写法。
    assert!(build_script.contains("function Test-BinaryContainsText"));
    assert!(build_script.contains("[System.Text.Encoding]::UTF8.GetBytes($Text)"));
    assert!(build_script.contains("[System.Text.Encoding]::Unicode.GetBytes($Text)"));
    assert!(build_script.contains("[System.IO.File]::ReadAllBytes($file.FullName)"));
    assert!(build_script.contains(
        "$scanRoots = @($stage, $installer, (Join-Path $manager 'dist'))"
    ));
    assert!(build_script.contains(
        "Test-BinaryContainsText -SearchRoots $scanRoots -Text $forbiddenText"
    ));
    assert!(!build_script.contains("$forbidden = '"));
    assert!(build_script.contains("$requiredBinaryStrings = @("));
    assert!(build_script.contains("$publicProductName = -join (0x265B"));
    assert!(build_script.contains("$releaseDir = Join-Path $releaseRoot \"$publicProductName-$version\""));
    assert!(build_script.contains("$requiredFrontendStrings = @("));
    assert!(build_script.contains(
        "Test-BinaryContainsText -SearchRoots @($stage) -Text $requiredText"
    ));
    assert!(build_script.contains(
        "Test-BinaryContainsText -SearchRoots @($frontendDist) -Text $requiredText"
    ));
    // 扫描不能依赖不一定存在的外部工具
    assert!(!build_script.contains("& rg "));
    assert!(!build_script.contains("$requiredPattern ="));
    assert!(frontend_brand.contains("CODEWORK_PRODUCT_NAME = \"♛Codework AI客户端\""));
    assert!(notices.contains("MIT License"));
    assert!(notices.contains("https://github.com/BigPizzaV3/CodexPlusPlus"));
    assert!(notices.contains("https://github.com/Fei-Away/Codex-Dream-Skin"));
}

#[test]
fn manager_requires_member_login_before_showing_the_workspace_and_exposes_activity_center() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let app = std::fs::read_to_string(manifest_dir.join("../src/App.tsx"))
        .expect("read manager app");
    let commands = std::fs::read_to_string(manifest_dir.join("src/commands.rs"))
        .expect("read manager commands");
    let build_script = std::fs::read_to_string(manifest_dir.join("../../../scripts/build-codework-windows.ps1"))
        .expect("read Codework build script");

    assert!(app.contains("MemberLoginGate"));
    assert!(app.contains("CODEWORK_OFFICIAL_ACCOUNT_LABEL"));
    assert!(app.contains("官方账号"));
    assert!(app.contains("const [memberLoginApproved, setMemberLoginApproved] = useState(false);"));
    assert!(app.contains("setMemberLoginApproved(true);"));
    assert!(app.contains("setRoute(\"account\");"));
    assert!(app.contains("visible={!memberLoginApproved}"));
    assert!(app.contains("id: \"activity\""));
    assert!(app.contains("ActivityCenterScreen"));
    assert!(app.contains("id: \"updates\""));
    assert!(app.contains("ReleaseNotesScreen"));
    assert!(app.contains("MEMBER_REMEMBERED_CREDENTIALS_KEY"));
    assert!(app.contains("CODEWORK_FORGOT_PASSWORD_URL"));
    assert!(app.contains("CODEWORK_QQ_QR_URL"));
    assert!(app.contains("CODEWORK_WECHAT_QR_URL"));
    assert!(app.contains("CODEWORK_ACTIVITY_PORTAL_URL"));
    assert!(app.contains("client_portal_link"));
    assert!(!app.contains("UPSTREAM_SOURCE_URL"));
    assert!(app.contains("client_activity"));
    assert!(commands.contains("pub async fn client_activity"));
    assert!(commands.contains("pub async fn client_portal_link"));
    assert!(build_script.contains("$releaseNotesPath"));
    assert!(build_script.contains("$tipsPath"));
    assert!(!build_script.contains("<#"));
    assert!(build_script.contains("Compress-Archive"));
}

#[test]
fn updater_silently_overwrites_then_restarts_the_new_manager() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let commands = std::fs::read_to_string(manifest_dir.join("src/commands.rs"))
        .expect("read manager commands");
    let installer = std::fs::read_to_string(
        manifest_dir.join("../../../scripts/installer/windows/CodeworkCodexPlusPlus.nsi"),
    )
    .expect("read NSIS installer");

    assert!(commands.contains("codework_release_installer_args"));
    assert!(commands.contains("/UPDATE"));
    assert!(installer.contains("IfSilent silent_update_finished normal_install_finished"));
    assert!(installer.contains("codework-codex-plus-plus-manager.exe"));
    assert!(installer.contains("--confirm-update"));
}

#[test]
fn installer_stages_only_the_internal_codework_dream_skin_runtime() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let build_script = std::fs::read_to_string(
        manifest_dir.join("../../../scripts/build-codework-windows.ps1"),
    )
    .expect("read Codework build script");

    assert!(build_script.contains("$dreamSkinRuntimeFiles = @("));
    assert!(build_script.contains("apply-codework-theme.ps1"));
    assert!(build_script.contains("verify-dream-skin.ps1"));
    assert!(!build_script.contains(
        "Copy-Item -LiteralPath $dreamSkinSource -Destination $dreamSkinStage -Recurse -Force"
    ));
    assert!(build_script.contains("$dreamSkinExcludedFiles = @("));
    assert!(build_script.contains("tray-dream-skin.ps1"));
    assert!(build_script.contains("install-dream-skin.ps1"));
}

#[test]
fn installer_waits_for_new_manager_and_restores_previous_binaries_on_timeout() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let installer = std::fs::read_to_string(
        manifest_dir.join("../../../scripts/installer/windows/CodeworkCodexPlusPlus.nsi"),
    )
    .expect("read Codework NSIS installer");

    assert!(installer.contains("codework-codex-plus-plus.exe.previous"));
    assert!(installer.contains("codework-codex-plus-plus-manager.exe.previous"));
    assert!(installer.contains("--confirm-update"));
    assert!(installer.contains("update-start-confirmed.json"));
    assert!(installer.contains("update-rollback.json"));
    assert!(installer.contains("rollback_update"));
    assert!(!installer.contains("manager.exe /F /T"));
}

#[test]
fn visual_theme_pro_has_a_dedicated_route_and_safe_injection_settings() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let app = std::fs::read_to_string(manifest_dir.join("../src/App.tsx"))
        .expect("read manager app");
    let renderer = std::fs::read_to_string(manifest_dir.join("../../../assets/inject/renderer-inject.js"))
        .expect("read Codex renderer injector");
    let settings = std::fs::read_to_string(
        manifest_dir.join("../../../crates/codex-plus-core/src/settings.rs"),
    )
    .expect("read core settings");

    assert!(app.contains("id: \"visualTheme\""));
    assert!(app.contains("VisualThemeScreen"));
    assert!(app.contains("load_visual_theme_manifest"));
    assert!(app.contains("load_visual_theme_asset"));
    assert!(app.contains("codework-theme-manifest-cache"));
    assert!(app.contains("isSafeThemeManifest"));
    assert!(app.contains("lastSavedThemeServiceUrlRef"));
    assert!(renderer.contains("applyCodeworkVisualTheme"));
    assert!(renderer.contains("isSafeCodeworkThemeManifest"));
    assert!(renderer.contains("codeworkVisualThemeCssFromTokens"));
    assert!(renderer.contains("[data-codework-theme-scope]"));
    assert!(!renderer.contains("#root{background-color:var(--codework-theme-background)!important"));
    assert!(!renderer.contains("aside *{color:var(--codework-theme-text)!important}"));
    assert!(renderer.contains("window.__codexSessionDeleteBridge(\"/theme/manifest\", {})"));
    assert!(renderer.contains("restoreCodeworkCharacterTheme"));
    assert!(renderer.contains("data-codework-character-theme"));
    assert!(app.contains("new URL("));
    assert!(renderer.contains("AbortController"));
    assert!(renderer.contains("codexAppVisualThemeEnabled"));
    assert!(renderer.contains("codexAppVisualThemeId"));
    assert!(settings.contains("codex_app_visual_theme_enabled"));
    assert!(settings.contains("codex_app_visual_theme_id"));
}

#[test]
fn visual_theme_service_has_a_1panel_deployment_and_restricted_character_manifest() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let root = manifest_dir.join("../../..");
    let app = std::fs::read_to_string(manifest_dir.join("../src/App.tsx"))
        .expect("read manager app");
    let settings = std::fs::read_to_string(
        manifest_dir.join("../../../crates/codex-plus-core/src/settings.rs"),
    )
    .expect("read core settings");
    let compose = std::fs::read_to_string(root.join("services/codework-theme-service/compose.yaml"))
        .expect("read theme service compose file");
    let server = std::fs::read_to_string(root.join("services/codework-theme-service/server.mjs"))
        .expect("read theme service server");
    let themes = std::fs::read_to_string(root.join("services/codework-theme-service/themes/manifest.json"))
        .expect("read theme manifest");

    assert!(compose.contains("28080:28080"));
    assert!(server.contains("/v1/themes/manifest"));
    assert!(server.contains("Access-Control-Allow-Origin"));
    assert!(app.contains("codexAppVisualThemeServiceUrl"));
    assert!(settings.contains("codex_app_visual_theme_service_url"));
    let manifest: serde_json::Value = serde_json::from_str(&themes).expect("parse theme manifest");
    assert_eq!(manifest["version"], "2");
    let themes = manifest["themes"].as_array().expect("themes array");
    assert_eq!(themes.len(), 4);
    assert!(themes.iter().any(|theme| theme["id"] == "hello-kitty-christmas" && theme["access"] == "restricted"));
    assert!(themes.iter().any(|theme|
        theme["id"] == "shinchan-energy"
            && theme["cssProfile"] == "dream-skin-light"
            && theme["art"]["safeArea"] == "left"
            && theme["art"]["taskMode"] == "ambient"
    ));
    assert!(themes.iter().any(|theme|
        theme["id"] == "hello-kitty-cloud-dream"
            && theme["access"] == "restricted"
            && theme["cssProfile"] == "dream-skin-light"
            && theme["heroAsset"] == "kitty-cloud-dream.jpg"
    ));

    let mut theme_ids = std::collections::HashSet::new();
    for theme in themes {
        let id = theme["id"].as_str().expect("theme id");
        assert!(theme_ids.insert(id), "theme IDs must be unique");

        let tokens = theme["tokens"].as_object().expect("theme tokens");
        for key in ["background", "surface", "accent", "border", "text"] {
            let color = tokens[key].as_str().expect("token color");
            assert!(
                color.len() == 7
                    && color.starts_with('#')
                    && color[1..].bytes().all(|byte| byte.is_ascii_hexdigit()),
                "{key} must be a six-digit hex color"
            );
        }

        let radius = tokens["radius"].as_i64().expect("token radius");
        assert!((0..=32).contains(&radius), "radius must be between 0 and 32");
        let font_scale = tokens["fontScale"].as_f64().expect("token fontScale");
        assert!(
            (0.8..=1.3).contains(&font_scale),
            "fontScale must be between 0.8 and 1.3"
        );
    }
}

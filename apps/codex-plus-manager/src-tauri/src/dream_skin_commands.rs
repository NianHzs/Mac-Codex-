use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use url::Url;

const CODEWORK_DREAM_SKIN_SCRIPTS: &[&str] = &[
    "apply-codework-theme.ps1",
    "restore-dream-skin.ps1",
    "start-dream-skin.ps1",
    "verify-dream-skin.ps1",
];

#[derive(Debug, Clone)]
struct RemoteDreamSkinSelection {
    theme: codex_plus_core::dream_skin::DreamSkinTheme,
    asset_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteDreamSkinManifest {
    themes: Vec<RemoteDreamSkinManifestItem>,
    #[serde(default)]
    allowed_theme_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteDreamSkinManifestItem {
    id: String,
    name: String,
    #[serde(default = "default_remote_dream_skin_access")]
    access: String,
    revision: String,
    sha256: String,
    hero_asset: String,
    art: codex_plus_core::dream_skin::DreamSkinArt,
}

fn default_remote_dream_skin_access() -> String {
    "public".to_string()
}

fn remote_dream_skin_selection(
    manifest: &serde_json::Value,
    theme_id: &str,
) -> anyhow::Result<RemoteDreamSkinSelection> {
    let manifest: RemoteDreamSkinManifest = serde_json::from_value(manifest.clone())
        .map_err(|_| anyhow::anyhow!("Theme manifest is invalid"))?;
    let item = manifest
        .themes
        .into_iter()
        .find(|item| item.id == theme_id)
        .ok_or_else(|| anyhow::anyhow!("Selected theme is unavailable"))?;
    anyhow::ensure!(
        item.access == "public" || (item.access == "restricted" && manifest.allowed_theme_ids.contains(&item.id)),
        "Selected theme is not authorized"
    );
    anyhow::ensure!(
        is_safe_theme_asset_name(&item.hero_asset),
        "Selected theme asset is invalid"
    );
    Ok(RemoteDreamSkinSelection {
        asset_name: item.hero_asset.clone(),
        theme: codex_plus_core::dream_skin::DreamSkinTheme {
            id: item.id,
            revision: item.revision,
            name: item.name,
            appearance: codex_plus_core::dream_skin::DreamAppearance::Light,
            client_version: codex_plus_core::version::DISPLAY_VERSION.to_string(),
            art: item.art,
            asset_name: item.hero_asset,
            sha256: item.sha256,
        },
    })
}

fn is_safe_theme_asset_name(value: &str) -> bool {
    let Some((stem, extension)) = value.rsplit_once('.') else {
        return false;
    };
    !stem.is_empty()
        && stem.len() <= 120
        && stem
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
        && matches!(extension.to_ascii_lowercase().as_str(), "png" | "jpg" | "jpeg" | "webp")
}

fn visual_theme_service_url(settings: &codex_plus_core::settings::BackendSettings, endpoint: &str) -> anyhow::Result<String> {
    let mut service_url = Url::parse(settings.codex_app_visual_theme_service_url.trim())?;
    anyhow::ensure!(
        matches!(service_url.scheme(), "http" | "https"),
        "Theme service address is invalid"
    );
    service_url.set_query(None);
    service_url.set_fragment(None);
    let base_path = service_url.path().trim_end_matches('/');
    service_url.set_path(&format!("{base_path}/"));
    Ok(service_url.join(endpoint)?.to_string())
}

fn current_theme_member_token(settings: &codex_plus_core::settings::BackendSettings) -> anyhow::Result<&str> {
    let token = settings.codex_app_visual_theme_member_token.trim();
    anyhow::ensure!((16..=4096).contains(&token.len()), "Theme member session is unavailable");
    Ok(token)
}

fn next_dream_skin_generation() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(1)
        .max(1)
}

fn dream_skin_runtime_failure_message(_error: &str) -> String {
    "个性化主题未能完成应用，请检查网络与 Codex 状态后重试。".to_string()
}

async fn stage_remote_dream_skin(theme_id: &str) -> anyhow::Result<codex_plus_core::dream_skin::EngineThemeRequest> {
    let settings = codex_plus_core::settings::SettingsStore::default().load().unwrap_or_default();
    let token = current_theme_member_token(&settings)?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .build()?;
    let manifest_url = visual_theme_service_url(&settings, "v1/themes/manifest")?;
    let manifest_response = client.get(manifest_url).bearer_auth(token).send().await?;
    anyhow::ensure!(manifest_response.status().is_success(), "Theme service is unavailable");
    let manifest = manifest_response.json::<serde_json::Value>().await?;
    let selection = remote_dream_skin_selection(&manifest, theme_id)?;
    let asset_url = visual_theme_service_url(
        &settings,
        &format!("v1/themes/assets/{}", selection.asset_name),
    )?;
    let asset_response = client.get(asset_url).bearer_auth(token).send().await?;
    anyhow::ensure!(asset_response.status().is_success(), "Theme asset is unavailable");
    let content_type = asset_response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.split(';').next().unwrap_or_default().trim().to_ascii_lowercase())
        .unwrap_or_default();
    let bytes = asset_response.bytes().await?.to_vec();
    let asset = codex_plus_core::dream_skin::DreamSkinAsset {
        file_name: selection.asset_name,
        bytes,
        content_type,
    };
    codex_plus_core::dream_skin::DreamSkinStore::default().stage_engine_request(
        &selection.theme,
        &asset,
        next_dream_skin_generation(),
    )
}

fn stage_custom_dream_skin_from_path(
    store: &codex_plus_core::dream_skin::DreamSkinStore,
    source: &Path,
    generation: u64,
) -> anyhow::Result<codex_plus_core::dream_skin::EngineThemeRequest> {
    anyhow::ensure!(source.is_file(), "Custom wallpaper is unavailable");
    let file_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| anyhow::anyhow!("Custom wallpaper name is invalid"))?;
    anyhow::ensure!(is_safe_theme_asset_name(file_name), "Custom wallpaper type is invalid");
    let content_type = match source
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        _ => anyhow::bail!("Custom wallpaper type is invalid"),
    };
    let bytes = std::fs::read(source)?;
    let hash = format!("{:x}", Sha256::digest(&bytes));
    let extension = source
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("png")
        .to_ascii_lowercase();
    let asset_name = format!("custom-wallpaper.{extension}");
    let theme = codex_plus_core::dream_skin::DreamSkinTheme {
        id: "custom-dream-skin".to_string(),
        revision: format!("local-{generation}"),
        name: "自定义 Dream Skin".to_string(),
        appearance: codex_plus_core::dream_skin::DreamAppearance::Light,
        client_version: codex_plus_core::version::DISPLAY_VERSION.to_string(),
        art: codex_plus_core::dream_skin::DreamSkinArt {
            focus_x: 0.5,
            focus_y: 0.45,
            safe_area: "left".to_string(),
            task_mode: "ambient".to_string(),
        },
        asset_name: asset_name.clone(),
        sha256: hash,
    };
    store.stage_engine_request(
        &theme,
        &codex_plus_core::dream_skin::DreamSkinAsset {
            file_name: asset_name,
            bytes,
            content_type: content_type.to_string(),
        },
        generation,
    )
}

fn stage_configured_custom_dream_skin() -> anyhow::Result<codex_plus_core::dream_skin::EngineThemeRequest> {
    let settings = codex_plus_core::settings::SettingsStore::default().load().unwrap_or_default();
    anyhow::ensure!(settings.codex_app_image_overlay_enabled, "Custom wallpaper is not enabled");
    stage_custom_dream_skin_from_path(
        &codex_plus_core::dream_skin::DreamSkinStore::default(),
        Path::new(settings.codex_app_image_overlay_path.trim()),
        next_dream_skin_generation(),
    )
}

#[derive(Debug, Clone)]
struct CodeworkDreamSkinRuntime {
    root: PathBuf,
    state_root: PathBuf,
}

impl CodeworkDreamSkinRuntime {
    fn new(root: PathBuf, state_root: PathBuf) -> anyhow::Result<Self> {
        anyhow::ensure!(root.join("scripts").is_dir(), "bundled Dream Skin runtime is missing");
        anyhow::ensure!(state_root.is_absolute(), "Codework Dream Skin state root is invalid");
        Ok(Self { root, state_root })
    }

    fn script(&self, name: &str) -> anyhow::Result<PathBuf> {
        anyhow::ensure!(
            CODEWORK_DREAM_SKIN_SCRIPTS.contains(&name),
            "requested Dream Skin script is unavailable"
        );
        let script = self.root.join("scripts").join(name);
        anyhow::ensure!(script.is_file(), "bundled Dream Skin script is missing");
        Ok(script)
    }

    fn arguments(&self, arguments: &[&str]) -> Vec<String> {
        let mut command_arguments = vec![
            "-StateRoot".to_string(),
            self.state_root.to_string_lossy().into_owned(),
        ];
        command_arguments.extend(arguments.iter().map(|argument| (*argument).to_string()));
        command_arguments
    }

    fn run(&self, name: &str, arguments: &[&str]) -> anyhow::Result<()> {
        let script = self.script(name)?;
        run_dream_skin_script(&script, &self.arguments(arguments))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DreamSkinProbe {
    Closed,
    DebugCodexRunning,
    NormalCodexRunning,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DreamSkinRuntimeState {
    restart_required: bool,
}

impl DreamSkinRuntimeState {
    pub fn from_probe(probe: DreamSkinProbe) -> Self {
        Self { restart_required: matches!(probe, DreamSkinProbe::NormalCodexRunning) }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DreamSkinPayload {
    pub dream_skin_state: String,
    pub restart_required: bool,
    pub theme_id: Option<String>,
    pub runtime_message: Option<String>,
}

impl DreamSkinPayload {
    pub fn off() -> Self {
        Self {
            dream_skin_state: "off".to_string(),
            restart_required: false,
            theme_id: None,
            runtime_message: None,
        }
    }
}

pub fn apply_payload_from_state(state: DreamSkinRuntimeState) -> DreamSkinPayload {
    if state.restart_required {
        DreamSkinPayload {
            dream_skin_state: "restart_required".to_string(),
            restart_required: true,
            theme_id: None,
            runtime_message: None,
        }
    } else {
        DreamSkinPayload {
            dream_skin_state: "preparing".to_string(),
            restart_required: false,
            theme_id: None,
            runtime_message: None,
        }
    }
}

#[tauri::command]
pub fn dream_skin_status(since_ms: Option<u64>) -> crate::commands::CommandResult<DreamSkinPayload> {
    let settings = codex_plus_core::settings::SettingsStore::default()
        .load()
        .unwrap_or_default();
    let theme_id = settings.codex_app_visual_theme_id;
    let event = codex_plus_core::diagnostic_log::latest_dream_skin_runtime_event(&theme_id, 60_000);
    let payload = match event.filter(|event| since_ms.is_none_or(|since| event.timestamp_ms >= since)) {
        Some(event) => DreamSkinPayload {
            dream_skin_state: event.state,
            restart_required: false,
            theme_id: Some(event.theme_id),
            runtime_message: event.message,
        },
        None => DreamSkinPayload {
            dream_skin_state: "pending".to_string(),
            restart_required: false,
            theme_id: Some(theme_id),
            runtime_message: None,
        },
    };
    crate::commands::ok("Dream Skin status loaded", payload)
}

#[tauri::command]
pub async fn apply_dream_skin(theme_id: String, allow_restart: bool) -> crate::commands::CommandResult<DreamSkinPayload> {
    let state = DreamSkinRuntimeState::from_probe(if allow_restart {
        DreamSkinProbe::Closed
    } else {
        DreamSkinProbe::NormalCodexRunning
    });
    if !allow_restart {
        return crate::commands::ok("Dream Skin apply state prepared", apply_payload_from_state(state));
    }
    let result = async {
        let request = if theme_id.trim() == "custom-dream-skin" {
            stage_configured_custom_dream_skin()?
        } else {
            stage_remote_dream_skin(theme_id.trim()).await?
        };
        let theme_directory = request
            .asset_path
            .parent()
            .ok_or_else(|| anyhow::anyhow!("Staged Codework theme directory is invalid"))?
            .to_string_lossy()
            .into_owned();
        let runtime = CodeworkDreamSkinRuntime::new(
            dream_skin_runtime(),
            codex_plus_core::paths::default_dream_skin_dir(),
        )?;
        runtime.run("apply-codework-theme.ps1", &["-ThemeDirectory", &theme_directory])?;
        runtime.run("start-dream-skin.ps1", &["-RestartExisting"])
    }
    .await;
    match result {
        Ok(()) => {
            let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                "renderer.dream_skin_applied",
                serde_json::json!({ "detail": { "themeId": theme_id.trim() } }),
            );
            crate::commands::ok(
                "Dream Skin enabled",
                DreamSkinPayload {
                    dream_skin_state: "active".to_string(),
                    restart_required: false,
                    theme_id: Some(theme_id),
                    runtime_message: None,
                },
            )
        }
        Err(error) => {
            let message = dream_skin_runtime_failure_message(&error.to_string());
            let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                "renderer.dream_skin_apply_failed",
                serde_json::json!({ "detail": { "themeId": theme_id.trim(), "message": message } }),
            );
            crate::commands::failed(
                "Dream Skin start failed",
                DreamSkinPayload {
                    dream_skin_state: "failed".to_string(),
                    restart_required: false,
                    theme_id: Some(theme_id),
                    runtime_message: Some(message),
                },
            )
        }
    }
}

fn development_dream_skin_runtime() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("..")
        .join("assets")
        .join("vendor")
        .join("fei-away-codex-dream-skin")
        .join("windows-runtime")
}

fn dream_skin_runtime() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|parent| parent.join("dream-skin")))
        .filter(|path| path.join("scripts").join("start-dream-skin.ps1").is_file())
        .unwrap_or_else(development_dream_skin_runtime)
}

fn run_dream_skin_script(script: &Path, arguments: &[String]) -> anyhow::Result<()> {
    anyhow::ensure!(script.is_file(), "bundled Dream Skin script is missing");
    let mut command = Command::new("powershell.exe");
    command.args(["-NoProfile", "-ExecutionPolicy", "RemoteSigned", "-File"]);
    command.arg(script);
    command.args(arguments);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(codex_plus_core::windows_create_no_window());
    }
    let output = command.output()?;
    anyhow::ensure!(output.status.success(), "Dream Skin script exited with {}", output.status);
    Ok(())
}

fn restore_payload_from_store(store: &codex_plus_core::dream_skin::DreamSkinStore) -> anyhow::Result<DreamSkinPayload> {
    store.restore_active_theme()?;
    Ok(DreamSkinPayload::off())
}

#[cfg(test)]
fn cache_verified_theme(
    store: &codex_plus_core::dream_skin::DreamSkinStore,
    theme: &codex_plus_core::dream_skin::DreamSkinTheme,
    asset: &codex_plus_core::dream_skin::DreamSkinAsset,
) -> anyhow::Result<()> {
    store.commit_theme(theme, asset)?;
    store.set_active_theme(&theme.id, &theme.revision)
}

fn embedded_restore_script_arguments() -> [&'static str; 2] {
    ["-ForceRestart", "-NoRelaunch"]
}

#[tauri::command]
pub fn restore_dream_skin() -> crate::commands::CommandResult<DreamSkinPayload> {
    let arguments = embedded_restore_script_arguments();
    let result = CodeworkDreamSkinRuntime::new(
        dream_skin_runtime(),
        codex_plus_core::paths::default_dream_skin_dir(),
    )
    .and_then(|runtime| runtime.run("restore-dream-skin.ps1", &arguments))
    .and_then(|_| restore_payload_from_store(&codex_plus_core::dream_skin::DreamSkinStore::default()));
    match result {
        Ok(payload) => crate::commands::ok("Dream Skin restored", payload),
        Err(error) => crate::commands::failed(
            "Unable to restore Dream Skin",
            DreamSkinPayload {
                dream_skin_state: "failed".to_string(),
                restart_required: false,
                theme_id: None,
                runtime_message: Some(error.to_string()),
            },
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apply_payload_requires_restart_only_for_a_non_debug_codex_session() {
        let state = DreamSkinRuntimeState::from_probe(DreamSkinProbe::NormalCodexRunning);
        assert_eq!(apply_payload_from_state(state).dream_skin_state, "restart_required");
        assert!(apply_payload_from_state(state).restart_required);
    }

    #[test]
    fn restore_payload_never_serializes_access_tokens_or_asset_bytes() {
        let json = serde_json::to_string(&DreamSkinPayload::off()).unwrap();
        assert!(!json.contains("access-token"));
        assert!(!json.contains("data:image"));
    }

    #[test]
    fn command_envelope_status_is_not_overwritten_by_dream_skin_state() {
        let result = crate::commands::ok("Dream Skin restored", DreamSkinPayload::off());
        let value = serde_json::to_value(result).unwrap();
        assert_eq!(value["status"], "ok");
        assert_eq!(value["dreamSkinState"], "off");
    }

    #[test]
    fn apply_payload_can_proceed_after_restart_is_approved() {
        let state = DreamSkinRuntimeState::from_probe(DreamSkinProbe::Closed);
        assert_eq!(apply_payload_from_state(state).dream_skin_state, "preparing");
        assert!(!apply_payload_from_state(state).restart_required);
    }

    #[test]
    fn restore_payload_clears_the_active_theme_state() {
        let root = tempfile::tempdir().unwrap();
        let store = codex_plus_core::dream_skin::DreamSkinStore::new(root.path().join("DreamSkin"));
        store.set_active_theme("brand", "revision-1").unwrap();
        let payload = restore_payload_from_store(&store).unwrap();
        assert_eq!(payload.dream_skin_state, "off");
        assert_eq!(store.active_theme().unwrap(), None);
    }

    #[test]
    fn verified_download_is_committed_before_becoming_active() {
        let root = tempfile::tempdir().unwrap();
        let store = codex_plus_core::dream_skin::DreamSkinStore::new(root.path().join("DreamSkin"));
        let theme = codex_plus_core::dream_skin::DreamSkinTheme {
            id: "brand".to_string(), revision: "revision-1".to_string(), name: "Brand".to_string(),
            appearance: codex_plus_core::dream_skin::DreamAppearance::Light,
            client_version: codex_plus_core::version::DISPLAY_VERSION.to_string(),
            art: codex_plus_core::dream_skin::DreamSkinArt { focus_x: 0.5, focus_y: 0.5, safe_area: "left".to_string(), task_mode: "ambient".to_string() },
            asset_name: "brand.png".to_string(), sha256: "5ccc7b74fb4179b8bb08fe2e458b10217e707a7a0f259e31d557db07425c823c".to_string(),
        };
        let asset = codex_plus_core::dream_skin::DreamSkinAsset { file_name: "brand.png".to_string(), bytes: b"verified-image".to_vec(), content_type: "image/png".to_string() };
        cache_verified_theme(&store, &theme, &asset).unwrap();
        assert_eq!(store.active_theme().unwrap(), Some(("brand".to_string(), "revision-1".to_string())));
    }

    #[test]
    fn bundled_runtime_contains_start_and_restore_scripts() {
        let root = development_dream_skin_runtime();
        assert!(root.join("scripts").join("start-dream-skin.ps1").is_file());
        assert!(root.join("scripts").join("restore-dream-skin.ps1").is_file());
    }

    #[test]
    fn bundled_runtime_never_opens_a_terminal_or_relay_dialog_for_theme_startup() {
        let root = development_dream_skin_runtime();
        let start = std::fs::read_to_string(root.join("scripts").join("start-dream-skin.ps1")).unwrap();
        let tray = std::fs::read_to_string(root.join("scripts").join("tray-dream-skin.ps1")).unwrap();

        assert!(!start.lines().any(|line| line.trim() == "Show-DreamSkinAiRelayDialog"));
        assert!(tray.contains("Start-Process -FilePath $powershell -ArgumentList $argumentLine -WindowStyle Hidden"));
    }

    #[test]
    fn embedded_restore_stops_legacy_runtime_without_relaunching_codex() {
        assert_eq!(embedded_restore_script_arguments(), ["-ForceRestart", "-NoRelaunch"]);
    }

    #[test]
    fn embedded_runtime_uses_codework_owned_state_for_every_lifecycle_script() {
        let root = development_dream_skin_runtime();
        for script_name in [
            "apply-codework-theme.ps1",
            "start-dream-skin.ps1",
            "restore-dream-skin.ps1",
            "verify-dream-skin.ps1",
        ] {
            let source = std::fs::read_to_string(root.join("scripts").join(script_name)).unwrap();
            assert!(
                source.contains("[string]$StateRoot"),
                "{script_name} must accept the Codework-owned state root"
            );
            assert!(
                !source.contains("Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'"),
                "{script_name} must not fall back to the standalone CodexDreamSkin directory"
            );
        }
    }

    #[test]
    fn runtime_adapter_pins_scripts_and_passes_only_the_codework_state_root() {
        let root = development_dream_skin_runtime();
        let state_root = std::path::PathBuf::from(r"C:\Users\tester\.codework-codex-plus-plus\DreamSkin");
        let runtime = CodeworkDreamSkinRuntime::new(root, state_root.clone()).unwrap();

        assert!(runtime.script("start-dream-skin.ps1").is_ok());
        assert!(runtime.script("..\\tray-dream-skin.ps1").is_err());
        assert_eq!(
            runtime.arguments(&["-RestartExisting"]),
            vec![
                "-StateRoot".to_string(),
                state_root.to_string_lossy().into_owned(),
                "-RestartExisting".to_string(),
            ]
        );
    }

    #[test]
    fn runtime_theme_selector_can_activate_a_theme_staged_by_codework() {
        let source = std::fs::read_to_string(
            development_dream_skin_runtime()
                .join("scripts")
                .join("apply-codework-theme.ps1"),
        )
        .unwrap();

        assert!(source.contains("[string]$ThemeDirectory"));
        assert!(source.contains("$ThemeDirectory"));
        assert!(source.contains("$theme.assetName"));
    }

    #[test]
    fn remote_selection_accepts_only_an_authorized_theme_with_a_verified_asset_contract() {
        let manifest = serde_json::json!({
            "allowedThemeIds": ["hello-kitty-cloud-dream"],
            "themes": [{
                "id": "hello-kitty-cloud-dream",
                "name": "云端梦境",
                "access": "restricted",
                "revision": "2026-07-21-r2",
                "sha256": "2a3a6444212e86585354102703b056eaa4fef7f6fd8c1177f2afe87ee1ffc65a",
                "heroAsset": "kitty-cloud-dream.jpg",
                "art": { "focusX": 0.5, "focusY": 0.52, "safeArea": "left", "taskMode": "ambient" }
            }]
        });

        let selection = remote_dream_skin_selection(&manifest, "hello-kitty-cloud-dream").unwrap();
        assert_eq!(selection.theme.id, "hello-kitty-cloud-dream");
        assert_eq!(selection.asset_name, "kitty-cloud-dream.jpg");
        assert!(remote_dream_skin_selection(&manifest, "shinchan-energy").is_err());
    }

    #[test]
    fn runtime_failure_message_never_exposes_paths_or_session_values() {
        let message = dream_skin_runtime_failure_message(
            "asset failed at C:\\Users\\tester\\wallpaper.png bearer very-secret-token",
        );
        assert!(!message.contains("C:\\Users"));
        assert!(!message.contains("very-secret-token"));
        assert!(message.contains("个性化主题"));
    }

    #[test]
    fn custom_wallpaper_is_staged_into_the_same_codework_owned_engine_store() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("wallpaper.jpg");
        std::fs::write(&source, b"verified-custom-wallpaper").unwrap();
        let store = codex_plus_core::dream_skin::DreamSkinStore::new(root.path().join("DreamSkin"));

        let request = stage_custom_dream_skin_from_path(&store, &source, 7).unwrap();

        assert_eq!(request.theme.id, "custom-dream-skin");
        assert!(request.validate_for(&store).is_ok());
        assert!(request.asset_path.starts_with(root.path().join("DreamSkin")));
    }
}

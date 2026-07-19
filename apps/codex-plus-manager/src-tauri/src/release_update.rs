use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use codex_plus_core::release_manifest::{
    SignedReleaseManifest, parse_release_version, sha256_file,
};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::Emitter;

use crate::commands::{CommandResult, failed, ok};

const CODEWORK_RELEASE_MANIFEST_URL: &str =
    "http://115.190.199.191:20080/downloads/codework-ai-client-windows.json";
pub const RELEASE_PROGRESS_EVENT: &str = "codework-release-progress";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingCodeworkUpdate {
    pub target_version: String,
    #[serde(default)]
    pub previous_version: String,
    pub requested_at_ms: u64,
    #[serde(default)]
    pub last_failure: Option<String>,
}

impl PendingCodeworkUpdate {
    pub fn new(target_version: &str, previous_version: &str) -> Self {
        Self {
            target_version: target_version.trim().to_string(),
            previous_version: previous_version.trim().to_string(),
            requested_at_ms: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|duration| duration.as_millis() as u64)
                .unwrap_or_default(),
            last_failure: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeworkReleasePayload {
    pub available: bool,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub download_url: Option<String>,
    pub notes: Vec<String>,
    pub pending_target_version: Option<String>,
    pub integrity_status: String,
    pub expected_size: Option<u64>,
    pub sha256: Option<String>,
    pub mandatory: bool,
    pub minimum_supported_version: Option<String>,
    pub rollback_available: bool,
    pub last_failure: Option<String>,
}

pub fn payload_from_manifest(
    current_version: &str,
    manifest: SignedReleaseManifest,
    pending: Option<&PendingCodeworkUpdate>,
) -> CodeworkReleasePayload {
    let available = compare_release_versions(&manifest.version, current_version)
        .map(|ordering| ordering.is_gt())
        .unwrap_or(false);
    CodeworkReleasePayload {
        available,
        current_version: current_version.trim().to_string(),
        latest_version: Some(manifest.version),
        download_url: Some(manifest.download_url),
        notes: manifest.notes,
        pending_target_version: pending.map(|update| update.target_version.clone()),
        integrity_status: "verified_manifest".to_string(),
        expected_size: Some(manifest.size),
        sha256: Some(manifest.sha256),
        mandatory: manifest.mandatory,
        minimum_supported_version: Some(manifest.minimum_supported_version),
        rollback_available: pending
            .map(|update| !update.previous_version.trim().is_empty())
            .unwrap_or(false),
        last_failure: pending.and_then(|update| update.last_failure.clone()),
    }
}

fn compare_release_versions(left: &str, right: &str) -> Option<std::cmp::Ordering> {
    parse_release_version(left)?.partial_cmp(&parse_release_version(right)?)
}

#[tauri::command]
pub async fn check_codework_release() -> CommandResult<CodeworkReleasePayload> {
    let current_version = codex_plus_core::version::DISPLAY_VERSION.to_string();
    let pending = reconcile_pending_codework_update();
    match fetch_codework_release_manifest().await {
        Ok(manifest) => {
            let payload = payload_from_manifest(&current_version, manifest, pending.as_ref());
            ok(
                if payload.available {
                    "发现新版本"
                } else {
                    "当前已是最新版本"
                },
                payload,
            )
        }
        Err(error) => failed(
            &format!("无法检查客户端更新：{error}"),
            empty_codework_release_payload(current_version, pending.as_ref()),
        ),
    }
}

#[tauri::command]
pub async fn install_codework_release(
    app: tauri::AppHandle,
) -> CommandResult<CodeworkReleasePayload> {
    let current_version = codex_plus_core::version::DISPLAY_VERSION.to_string();
    let pending = reconcile_pending_codework_update();
    let manifest = match fetch_codework_release_manifest().await {
        Ok(manifest) => manifest,
        Err(error) => {
            return failed(
                &format!("无法读取更新信息：{error}"),
                empty_codework_release_payload(current_version, pending.as_ref()),
            );
        }
    };
    let mut payload = payload_from_manifest(&current_version, manifest.clone(), pending.as_ref());
    if !payload.available {
        return failed("当前没有可安装的新版本", payload);
    }

    let _ = app.emit(
        RELEASE_PROGRESS_EVENT,
        json!({ "stage": "downloading", "downloadedBytes": 0_u64 }),
    );
    let installer_path = match download_codework_release(&app, &manifest).await {
        Ok(path) => path,
        Err(error) => {
            payload.last_failure = Some(error.to_string());
            return failed(&format!("客户端下载或校验失败：{error}"), payload);
        }
    };
    if let Err(error) = save_pending_codework_update(&manifest.version, &current_version) {
        payload.last_failure = Some(error.to_string());
        return failed(&format!("无法记录待完成更新：{error}"), payload);
    }
    payload.pending_target_version = Some(manifest.version.clone());
    payload.rollback_available = true;

    match launch_codework_release_after_current_process_exits(&installer_path) {
        Ok(()) => {
            let _ = app.emit(
                RELEASE_PROGRESS_EVENT,
                json!({ "stage": "installing", "downloadedBytes": manifest.size }),
            );
            let _ = app.emit(
                RELEASE_PROGRESS_EVENT,
                json!({
                    "stage": "closing",
                    "downloadedBytes": manifest.size,
                    "totalBytes": manifest.size,
                    "percent": 100_u64
                }),
            );
            std::thread::sleep(std::time::Duration::from_millis(650));
            crate::exit_manager_for_update(app);
            ok("更新已校验并启动安装，客户端将自动退出", payload)
        }
        Err(error) => {
            let _ = record_pending_update_failure(&error.to_string());
            payload.last_failure = Some(error.to_string());
            failed(&format!("无法启动更新安装程序：{error}"), payload)
        }
    }
}

fn pending_update_completed(target_version: &str, started_version: &str) -> bool {
    target_version.trim() == started_version.trim()
}

fn pending_codework_update_path() -> PathBuf {
    codex_plus_core::paths::default_pending_client_update_path()
}

fn save_pending_codework_update(
    target_version: &str,
    previous_version: &str,
) -> anyhow::Result<()> {
    let path = pending_codework_update_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let update = PendingCodeworkUpdate::new(target_version, previous_version);
    fs::write(
        path,
        format!("{}\n", serde_json::to_string_pretty(&update)?),
    )?;
    Ok(())
}

fn record_pending_update_failure(message: &str) -> anyhow::Result<()> {
    let path = pending_codework_update_path();
    let contents = fs::read_to_string(&path)?;
    let mut pending: PendingCodeworkUpdate = serde_json::from_str(&contents)?;
    pending.last_failure = Some(message.trim().to_string());
    fs::write(
        path,
        format!("{}\n", serde_json::to_string_pretty(&pending)?),
    )?;
    Ok(())
}

fn clear_pending_codework_update() -> anyhow::Result<()> {
    match fs::remove_file(pending_codework_update_path()) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

pub fn reconcile_pending_codework_update() -> Option<PendingCodeworkUpdate> {
    let path = pending_codework_update_path();
    let contents = fs::read_to_string(&path).ok()?;
    let pending: PendingCodeworkUpdate = serde_json::from_str(&contents).ok()?;
    if pending_update_completed(
        &pending.target_version,
        codex_plus_core::version::DISPLAY_VERSION,
    ) {
        let _ = clear_pending_codework_update();
        return None;
    }
    Some(pending)
}

fn codework_release_installer_args() -> [&'static str; 2] {
    ["/S", "/UPDATE"]
}

fn launch_codework_release_after_current_process_exits(
    installer_path: &Path,
) -> std::io::Result<()> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        return std::process::Command::new(installer_path)
            .args(codework_release_installer_args())
            .creation_flags(codex_plus_core::windows_create_no_window())
            .spawn()
            .map(|_| ());
    }

    #[cfg(not(windows))]
    {
        std::process::Command::new(installer_path)
            .args(codework_release_installer_args())
            .spawn()
            .map(|_| ())
    }
}

fn empty_codework_release_payload(
    current_version: String,
    pending: Option<&PendingCodeworkUpdate>,
) -> CodeworkReleasePayload {
    CodeworkReleasePayload {
        available: false,
        current_version,
        latest_version: None,
        download_url: None,
        notes: Vec::new(),
        pending_target_version: pending.map(|update| update.target_version.clone()),
        integrity_status: "unavailable".to_string(),
        expected_size: None,
        sha256: None,
        mandatory: false,
        minimum_supported_version: None,
        rollback_available: pending
            .map(|update| !update.previous_version.trim().is_empty())
            .unwrap_or(false),
        last_failure: pending.and_then(|update| update.last_failure.clone()),
    }
}

async fn fetch_codework_release_manifest() -> anyhow::Result<SignedReleaseManifest> {
    let response = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .build()?
        .get(CODEWORK_RELEASE_MANIFEST_URL)
        .send()
        .await?
        .error_for_status()?;
    let manifest: SignedReleaseManifest = response.json().await?;
    manifest.validate_shape()?;
    Ok(manifest)
}

async fn download_codework_release(
    app: &tauri::AppHandle,
    manifest: &SignedReleaseManifest,
) -> anyhow::Result<PathBuf> {
    let response = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .build()?
        .get(&manifest.download_url)
        .send()
        .await?
        .error_for_status()?;
    let response_total = response.content_length();
    let download_dir = std::env::temp_dir().join("Codework AI客户端");
    fs::create_dir_all(&download_dir)?;
    let installer_path = download_dir.join("Codework-update-setup.exe");
    let partial_path = download_dir.join("Codework-update-setup.exe.part");
    let mut output = fs::File::create(&partial_path)?;
    let mut downloaded = 0_u64;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        output.write_all(&chunk)?;
        downloaded += chunk.len() as u64;
        let percent = (manifest.size > 0)
            .then(|| downloaded.saturating_mul(100) / manifest.size)
            .map(|value| value.min(100));
        let _ = app.emit(
            RELEASE_PROGRESS_EVENT,
            json!({
                "stage": "downloading",
                "downloadedBytes": downloaded,
                "totalBytes": manifest.size,
                "responseTotalBytes": response_total,
                "percent": percent
            }),
        );
    }
    output.flush()?;
    drop(output);
    if let Err(error) = verify_downloaded_installer(&partial_path, manifest) {
        let _ = fs::remove_file(&partial_path);
        return Err(error);
    }
    if installer_path.exists() {
        fs::remove_file(&installer_path)?;
    }
    fs::rename(&partial_path, &installer_path)?;
    let _ = app.emit(
        RELEASE_PROGRESS_EVENT,
        json!({
            "stage": "downloaded",
            "downloadedBytes": downloaded,
            "totalBytes": manifest.size,
            "percent": 100_u64
        }),
    );
    Ok(installer_path)
}

fn verify_downloaded_installer(
    installer_path: &Path,
    manifest: &SignedReleaseManifest,
) -> anyhow::Result<()> {
    let actual_size = fs::metadata(installer_path)?.len();
    anyhow::ensure!(
        actual_size == manifest.size,
        "安装包大小不一致：预期 {} 字节，实际 {} 字节",
        manifest.size,
        actual_size
    );
    let actual_sha256 = sha256_file(installer_path)?;
    anyhow::ensure!(
        actual_sha256.eq_ignore_ascii_case(manifest.sha256.trim()),
        "安装包 SHA-256 校验失败"
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use codex_plus_core::release_manifest::SignedReleaseManifest;

    use super::{PendingCodeworkUpdate, payload_from_manifest, verify_downloaded_installer};

    fn fixture_manifest() -> SignedReleaseManifest {
        SignedReleaseManifest {
            version: "1.3.37".to_string(),
            download_url: "http://115.190.199.191:20080/downloads/client-1.3.37.exe".to_string(),
            size: 15_332_386,
            sha256: "284a6adbda7572d3761dca23b1d7b03ab13912bd2f6a413aa31e6da9a5786519".to_string(),
            signature: "signed-value".to_string(),
            published_at: "2026-07-19T16:30:00Z".to_string(),
            minimum_supported_version: "1.3.36".to_string(),
            mandatory: false,
            notes: vec!["增强更新安全性".to_string()],
        }
    }

    #[test]
    fn checked_release_exposes_integrity_metadata_without_exposing_signature() {
        let payload = payload_from_manifest("1.3.36", fixture_manifest(), None);

        assert_eq!(payload.integrity_status, "verified_manifest");
        assert_eq!(payload.expected_size, Some(15_332_386));
        assert_eq!(
            payload.sha256.as_deref(),
            Some("284a6adbda7572d3761dca23b1d7b03ab13912bd2f6a413aa31e6da9a5786519")
        );
        assert!(payload.download_url.as_deref().unwrap().ends_with(".exe"));
    }

    #[test]
    fn incomplete_update_keeps_target_and_rollback_information() {
        let pending = PendingCodeworkUpdate::new("1.3.37", "1.3.36");

        assert_eq!(pending.target_version, "1.3.37");
        assert_eq!(pending.previous_version, "1.3.36");
    }

    #[test]
    fn downloaded_installer_must_match_manifest_size_and_sha256() {
        let temp = tempfile::tempdir().unwrap();
        let installer = temp.path().join("setup.exe");
        std::fs::write(&installer, b"abc").unwrap();
        let mut manifest = fixture_manifest();
        manifest.size = 3;
        manifest.sha256 =
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad".to_string();

        assert!(verify_downloaded_installer(&installer, &manifest).is_ok());

        manifest.size = 4;
        assert!(verify_downloaded_installer(&installer, &manifest).is_err());
    }

    #[test]
    fn codework_release_update_uses_silent_installer_arguments() {
        assert_eq!(super::codework_release_installer_args(), ["/S", "/UPDATE"]);
    }

    #[test]
    fn codework_release_update_relies_on_the_silent_installer_to_stop_old_processes() {
        let script =
            include_str!("../../../../scripts/installer/windows/CodeworkCodexPlusPlus.nsi");
        let update_service = include_str!("release_update.rs");
        assert!(script.contains(
            "nsExec::ExecToStack 'taskkill /IM codework-codex-plus-plus-manager.exe /F'"
        ));
        assert!(!script.contains("taskkill /IM codework-codex-plus-plus-manager.exe /F /T"));
        assert!(script.contains("taskkill /IM codework-codex-plus-plus.exe /F /T"));
        assert!(!update_service.contains("Command::new(\"cmd.exe\")"));
        assert!(update_service.contains("Command::new(installer_path)"));
    }

    #[test]
    fn pending_update_is_successful_only_when_started_version_matches_target() {
        assert!(super::pending_update_completed("1.3.24", "1.3.24"));
        assert!(!super::pending_update_completed("1.3.24", "1.3.23"));
    }
}

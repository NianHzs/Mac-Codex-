use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, bail, ensure};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

const MAX_ASSET_BYTES: usize = 16 * 1024 * 1024;
const MAX_IMAGE_EDGE: u32 = 16_384;
const MAX_IMAGE_PIXELS: u64 = 50_000_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DreamAppearance {
    Auto,
    Light,
    Dark,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DreamSkinArt {
    pub focus_x: f32,
    pub focus_y: f32,
    pub safe_area: String,
    pub task_mode: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DreamSkinTheme {
    pub id: String,
    pub revision: String,
    pub name: String,
    pub appearance: DreamAppearance,
    #[serde(default = "default_client_version")]
    pub client_version: String,
    pub art: DreamSkinArt,
    pub asset_name: String,
    pub sha256: String,
}

fn default_client_version() -> String {
    crate::version::DISPLAY_VERSION.to_string()
}

impl DreamSkinTheme {
    #[cfg(test)]
    fn fixture(id: &str) -> Self {
        let bytes = b"verified-image";
        Self {
            id: id.to_string(),
            revision: "test-r1".to_string(),
            name: "Test theme".to_string(),
            appearance: DreamAppearance::Light,
            client_version: default_client_version(),
            art: DreamSkinArt {
                focus_x: 0.5,
                focus_y: 0.5,
                safe_area: "left".to_string(),
                task_mode: "ambient".to_string(),
            },
            asset_name: format!("{id}.png"),
            sha256: sha256_hex(bytes),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DreamSkinAsset {
    pub file_name: String,
    pub bytes: Vec<u8>,
    pub content_type: String,
}

impl DreamSkinAsset {
    #[cfg(test)]
    fn fixture(theme_id: &str, bytes: &[u8], content_type: &str) -> Self {
        Self {
            file_name: format!("{theme_id}.png"),
            bytes: bytes.to_vec(),
            content_type: content_type.to_string(),
        }
    }
}

/// A single, generation-scoped request handed from Codework to the embedded
/// renderer.  Requests may only reference assets owned by the Codework store.
#[derive(Debug, Clone, PartialEq)]
pub struct EngineThemeRequest {
    pub theme: DreamSkinTheme,
    pub generation: u64,
    pub asset_path: PathBuf,
}

impl EngineThemeRequest {
    pub fn new(theme: DreamSkinTheme, generation: u64, asset_path: PathBuf) -> Self {
        Self { theme, generation, asset_path }
    }

    pub fn validate_for(&self, store: &DreamSkinStore) -> anyhow::Result<()> {
        ensure!(self.generation > 0, "Dream Skin generation is invalid");
        validate_theme(&self.theme)?;
        ensure!(self.asset_path.is_file(), "Dream Skin engine asset is missing");
        ensure!(
            self.asset_path.starts_with(&store.root),
            "Dream Skin engine asset escapes Codework storage"
        );
        ensure!(
            self.asset_path == store.theme_path(&self.theme.id).join(&self.theme.asset_name),
            "Dream Skin engine asset does not match its theme"
        );
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DreamSkinStatus {
    Off,
    Preparing,
    RestartRequired,
    Applying,
    Verifying,
    Active,
    Paused,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DreamSkinEvent {
    AssetsVerified,
    RestartApproved,
    InjectionStarted,
    RendererVerified,
    Pause,
    Resume,
    Restore,
    Failed,
}

impl DreamSkinStatus {
    pub fn advance(self, event: DreamSkinEvent) -> anyhow::Result<Self> {
        use DreamSkinEvent as Event;
        use DreamSkinStatus as Status;

        match (self, event) {
            (_, Event::Restore) => Ok(Status::Off),
            (Status::Preparing, Event::AssetsVerified) => Ok(Status::Applying),
            (Status::RestartRequired, Event::RestartApproved) => Ok(Status::Applying),
            (Status::Applying, Event::InjectionStarted) => Ok(Status::Verifying),
            (Status::Applying, Event::RendererVerified) | (Status::Verifying, Event::RendererVerified) => Ok(Status::Active),
            (Status::Active, Event::Pause) => Ok(Status::Paused),
            (Status::Paused, Event::Resume) => Ok(Status::Applying),
            (_, Event::Failed) => Ok(Status::Failed),
            (status, event) => bail!("invalid Dream Skin transition: {status:?} + {event:?}"),
        }
    }
}

#[derive(Debug, Clone)]
pub struct DreamSkinStore {
    root: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActiveDreamSkinTheme {
    theme_id: String,
    revision: String,
}

impl DreamSkinStore {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn default() -> Self {
        Self::new(crate::paths::default_dream_skin_dir())
    }

    pub fn theme_path(&self, theme_id: &str) -> PathBuf {
        self.root.join("themes").join(theme_id)
    }

    pub fn set_active_theme(&self, theme_id: &str, revision: &str) -> anyhow::Result<()> {
        ensure!(is_safe_theme_id(theme_id), "Dream Skin active theme id is invalid");
        ensure!(is_safe_revision(revision), "Dream Skin active revision is invalid");
        fs::create_dir_all(&self.root)?;
        ensure_safe_existing_components(&self.root)?;
        let active = ActiveDreamSkinTheme { theme_id: theme_id.to_string(), revision: revision.to_string() };
        crate::settings::atomic_write(&self.root.join("active-theme.json"), &serde_json::to_vec_pretty(&active)?)
    }

    pub fn active_theme(&self) -> anyhow::Result<Option<(String, String)>> {
        let path = self.root.join("active-theme.json");
        let contents = match fs::read_to_string(path) {
            Ok(contents) => contents,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error.into()),
        };
        let active: ActiveDreamSkinTheme = serde_json::from_str(&contents)?;
        ensure!(is_safe_theme_id(&active.theme_id) && is_safe_revision(&active.revision), "Dream Skin active state is invalid");
        Ok(Some((active.theme_id, active.revision)))
    }

    pub fn restore_active_theme(&self) -> anyhow::Result<()> {
        let path = self.root.join("active-theme.json");
        match fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.into()),
        }
    }

    pub fn commit_theme(&self, theme: &DreamSkinTheme, asset: &DreamSkinAsset) -> anyhow::Result<()> {
        validate_theme(theme)?;
        validate_asset(theme, asset)?;
        ensure_safe_existing_components(&self.root)?;

        let themes_root = self.root.join("themes");
        fs::create_dir_all(&themes_root)
            .with_context(|| format!("failed to create Dream Skin store at {}", themes_root.display()))?;
        ensure_safe_existing_components(&themes_root)?;

        let staging = themes_root.join(format!(".{}-{}.staging", theme.id, Uuid::new_v4()));
        fs::create_dir(&staging)?;
        let asset_path = staging.join(&theme.asset_name);
        fs::write(&asset_path, &asset.bytes)
            .with_context(|| format!("failed to write Dream Skin asset {}", asset_path.display()))?;
        fs::write(staging.join("theme.json"), serde_json::to_vec_pretty(theme)?)?;

        let target = self.theme_path(&theme.id);
        let backup = themes_root.join(format!(".{}-{}.previous", theme.id, Uuid::new_v4()));
        if target.exists() {
            ensure_safe_existing_components(&target)?;
            fs::rename(&target, &backup)?;
        }
        if let Err(error) = fs::rename(&staging, &target) {
            if backup.exists() {
                let _ = fs::rename(&backup, &target);
            }
            return Err(error).context("failed to atomically activate Dream Skin theme");
        }
        if backup.exists() {
            fs::remove_dir_all(backup)?;
        }
        Ok(())
    }

    /// Commits an already verified theme and returns the only asset path the
    /// renderer may use for the new generation.
    pub fn stage_engine_request(
        &self,
        theme: &DreamSkinTheme,
        asset: &DreamSkinAsset,
        generation: u64,
    ) -> anyhow::Result<EngineThemeRequest> {
        ensure!(generation > 0, "Dream Skin generation is invalid");
        self.commit_theme(theme, asset)?;
        let request = EngineThemeRequest::new(
            theme.clone(),
            generation,
            self.theme_path(&theme.id).join(&theme.asset_name),
        );
        request.validate_for(self)?;
        self.set_active_theme(&theme.id, &theme.revision)?;
        Ok(request)
    }
}

fn validate_theme(theme: &DreamSkinTheme) -> anyhow::Result<()> {
    ensure!(is_safe_theme_id(&theme.id), "Dream Skin theme id is invalid");
    ensure!(is_safe_revision(&theme.revision), "Dream Skin revision is invalid");
    ensure!(!theme.name.trim().is_empty() && theme.name.len() <= 80, "Dream Skin name is invalid");
    ensure!(is_safe_asset_name(&theme.asset_name), "Dream Skin asset name is invalid");
    ensure!(is_sha256(&theme.sha256), "Dream Skin asset hash is invalid");
    ensure!((0.0..=1.0).contains(&theme.art.focus_x), "Dream Skin focusX is invalid");
    ensure!((0.0..=1.0).contains(&theme.art.focus_y), "Dream Skin focusY is invalid");
    ensure!(matches!(theme.art.safe_area.as_str(), "left" | "center" | "right" | "none"), "Dream Skin safe area is invalid");
    ensure!(matches!(theme.art.task_mode.as_str(), "ambient" | "banner" | "off"), "Dream Skin task mode is invalid");
    Ok(())
}

fn validate_asset(theme: &DreamSkinTheme, asset: &DreamSkinAsset) -> anyhow::Result<()> {
    ensure!(asset.file_name == theme.asset_name, "Dream Skin asset name does not match theme");
    ensure!(matches!(asset.content_type.as_str(), "image/png" | "image/jpeg" | "image/webp"), "Dream Skin asset type is invalid");
    ensure!(!asset.bytes.is_empty() && asset.bytes.len() <= MAX_ASSET_BYTES, "Dream Skin asset size is invalid");
    ensure!(sha256_hex(&asset.bytes) == theme.sha256.to_ascii_lowercase(), "Dream Skin asset hash does not match");
    if let Some((width, height)) = image_dimensions(&asset.bytes, &asset.content_type) {
        ensure!(width <= MAX_IMAGE_EDGE && height <= MAX_IMAGE_EDGE, "Dream Skin image edge is invalid");
        ensure!(u64::from(width) * u64::from(height) <= MAX_IMAGE_PIXELS, "Dream Skin image area is invalid");
    }
    Ok(())
}

fn image_dimensions(bytes: &[u8], content_type: &str) -> Option<(u32, u32)> {
    match content_type {
        "image/png" if bytes.len() >= 24 && &bytes[..8] == b"\x89PNG\r\n\x1a\n" => Some((
            u32::from_be_bytes(bytes[16..20].try_into().ok()?),
            u32::from_be_bytes(bytes[20..24].try_into().ok()?),
        )),
        "image/webp" if bytes.len() >= 30 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" && &bytes[12..16] == b"VP8X" => Some((
            1 + u32::from_le_bytes([bytes[24], bytes[25], bytes[26], 0]),
            1 + u32::from_le_bytes([bytes[27], bytes[28], bytes[29], 0]),
        )),
        "image/jpeg" => jpeg_dimensions(bytes),
        _ => None,
    }
}

fn jpeg_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.get(..2)? != [0xff, 0xd8] { return None; }
    let mut index = 2;
    while index + 9 < bytes.len() {
        if bytes[index] != 0xff { index += 1; continue; }
        let marker = bytes[index + 1];
        index += 2;
        if marker == 0xd9 || marker == 0xda { break; }
        let length = u16::from_be_bytes(bytes.get(index..index + 2)?.try_into().ok()?) as usize;
        if length < 7 || index + length > bytes.len() { return None; }
        if matches!(marker, 0xc0..=0xc3 | 0xc5..=0xc7 | 0xc9..=0xcb | 0xcd..=0xcf) {
            let height = u16::from_be_bytes(bytes.get(index + 3..index + 5)?.try_into().ok()?) as u32;
            let width = u16::from_be_bytes(bytes.get(index + 5..index + 7)?.try_into().ok()?) as u32;
            return Some((width, height));
        }
        index += length;
    }
    None
}

fn ensure_safe_existing_components(path: &Path) -> anyhow::Result<()> {
    for component in path.ancestors().filter(|candidate| candidate.exists()) {
        let metadata = fs::symlink_metadata(component)?;
        ensure!(!metadata.file_type().is_symlink(), "Dream Skin store path contains a symlink");
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            ensure!(metadata.file_attributes() & 0x400 == 0, "Dream Skin store path contains a reparse point");
        }
    }
    Ok(())
}

fn is_safe_theme_id(value: &str) -> bool {
    let bytes = value.as_bytes();
    !bytes.is_empty()
        && bytes.len() <= 64
        && bytes[0].is_ascii_lowercase()
        && bytes.iter().all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || *byte == b'-')
}

fn is_safe_revision(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value.bytes().all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
}

fn is_safe_asset_name(value: &str) -> bool {
    let Some((stem, extension)) = value.rsplit_once('.') else { return false; };
    !stem.is_empty()
        && stem.len() <= 120
        && stem.bytes().all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
        && matches!(extension.to_ascii_lowercase().as_str(), "png" | "jpg" | "jpeg" | "webp")
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn theme_store_accepts_a_verified_asset_and_rejects_path_escape() {
        let root = tempfile::tempdir().unwrap();
        let store = DreamSkinStore::new(root.path().join("DreamSkin"));
        let asset = DreamSkinAsset::fixture("brand", b"verified-image", "image/png");

        store
            .commit_theme(&DreamSkinTheme::fixture("brand"), &asset)
            .unwrap();

        assert!(store.theme_path("brand").join("theme.json").exists());
        assert!(store
            .commit_theme(&DreamSkinTheme::fixture("../escape"), &asset)
            .is_err());
    }

    #[test]
    fn apply_state_requires_verified_before_active_and_restore_clears_owner() {
        let prepared = DreamSkinStatus::Preparing;
        assert_eq!(
            prepared.advance(DreamSkinEvent::AssetsVerified).unwrap(),
            DreamSkinStatus::Applying
        );
        assert_eq!(
            DreamSkinStatus::Applying
                .advance(DreamSkinEvent::RendererVerified)
                .unwrap(),
            DreamSkinStatus::Active
        );
        assert_eq!(
            DreamSkinStatus::Active
                .advance(DreamSkinEvent::Restore)
                .unwrap(),
            DreamSkinStatus::Off
        );
    }

    #[test]
    fn active_theme_state_round_trips_without_asset_bytes() {
        let root = tempfile::tempdir().unwrap();
        let store = DreamSkinStore::new(root.path().join("DreamSkin"));
        store.set_active_theme("brand", "revision-1").unwrap();
        assert_eq!(store.active_theme().unwrap(), Some(("brand".to_string(), "revision-1".to_string())));
        assert!(!std::fs::read_to_string(root.path().join("DreamSkin").join("active-theme.json")).unwrap().contains("verified-image"));
    }

    #[test]
    fn restoring_dream_skin_clears_only_its_active_state() {
        let root = tempfile::tempdir().unwrap();
        let store = DreamSkinStore::new(root.path().join("DreamSkin"));
        store.set_active_theme("brand", "revision-1").unwrap();
        store.restore_active_theme().unwrap();
        assert_eq!(store.active_theme().unwrap(), None);
    }

    #[test]
    fn engine_request_rejects_zero_generation_and_assets_outside_codework_store() {
        let root = tempfile::tempdir().unwrap();
        let store = DreamSkinStore::new(root.path().join("DreamSkin"));
        let asset = DreamSkinAsset::fixture("brand", b"verified-image", "image/png");
        let theme = DreamSkinTheme::fixture("brand");
        store.commit_theme(&theme, &asset).unwrap();

        let mut request = EngineThemeRequest::new(
            theme,
            1,
            store.theme_path("brand").join("brand.png"),
        );
        assert!(request.validate_for(&store).is_ok());

        request.generation = 0;
        assert!(request.validate_for(&store).is_err());

        request.generation = 1;
        request.asset_path = root.path().join("outside.png");
        assert!(request.validate_for(&store).is_err());
    }

    #[test]
    fn staging_engine_request_commits_verified_asset_before_marking_it_active() {
        let root = tempfile::tempdir().unwrap();
        let store = DreamSkinStore::new(root.path().join("DreamSkin"));
        let theme = DreamSkinTheme::fixture("brand");
        let asset = DreamSkinAsset::fixture("brand", b"verified-image", "image/png");

        let request = store.stage_engine_request(&theme, &asset, 42).unwrap();

        assert_eq!(request.generation, 42);
        assert!(request.validate_for(&store).is_ok());
        assert_eq!(store.active_theme().unwrap(), Some(("brand".to_string(), "test-r1".to_string())));
    }
}

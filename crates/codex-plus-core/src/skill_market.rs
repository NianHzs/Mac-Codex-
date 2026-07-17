use std::collections::BTreeMap;
use std::io::{Cursor, Read};
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::Context;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use url::Url;

pub const DEFAULT_SKILL_MARKET_INDEX_URL: &str =
    "http://115.190.199.191:20080/downloads/codework-skills/index.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillMarketManifest {
    pub version: u64,
    pub updated_at: Option<String>,
    pub skills: Vec<MarketSkill>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketSkill {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub version: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub homepage: String,
    pub package_url: String,
    pub sha256: String,
}

pub fn parse_skill_manifest(raw: Value) -> anyhow::Result<SkillMarketManifest> {
    let version = raw.get("version").and_then(Value::as_u64).unwrap_or(1);
    let updated_at = optional_string(&raw, "updated_at").or_else(|| optional_string(&raw, "updatedAt"));
    let skills = raw
        .get("skills")
        .and_then(Value::as_array)
        .ok_or_else(|| anyhow::anyhow!("official skill market has no skills list"))?
        .iter()
        .map(parse_market_skill)
        .collect::<anyhow::Result<Vec<_>>>()?;
    if skills.is_empty() {
        anyhow::bail!("official skill market has no valid skills");
    }
    Ok(SkillMarketManifest {
        version,
        updated_at,
        skills,
    })
}

pub async fn fetch_skill_manifest(url: &str) -> anyhow::Result<SkillMarketManifest> {
    let raw = reqwest::get(url)
        .await
        .with_context(|| format!("failed to request official skill index {url}"))?
        .error_for_status()
        .with_context(|| format!("official skill index returned an error status {url}"))?
        .json::<Value>()
        .await
        .context("failed to decode official skill index JSON")?;
    parse_skill_manifest(raw)
}

pub async fn install_market_skill(
    skills_root: &Path,
    skill: &MarketSkill,
) -> anyhow::Result<()> {
    let bytes = reqwest::get(&skill.package_url)
        .await
        .with_context(|| format!("failed to request official skill package {}", skill.id))?
        .error_for_status()
        .with_context(|| format!("official skill package returned an error status {}", skill.id))?
        .bytes()
        .await
        .with_context(|| format!("failed to read official skill package {}", skill.id))?;
    verify_sha256(&bytes, &skill.sha256)?;
    install_skill_archive(skills_root, &skill.id, &skill.version, &bytes)
}

pub fn verify_sha256(bytes: &[u8], expected: &str) -> anyhow::Result<()> {
    if !is_sha256(expected) {
        anyhow::bail!("official skill package checksum is invalid");
    }
    let actual = format!("{:x}", Sha256::digest(bytes));
    if !actual.eq_ignore_ascii_case(expected) {
        anyhow::bail!("official skill package checksum does not match");
    }
    Ok(())
}

pub fn install_skill_archive(
    skills_root: &Path,
    id: &str,
    version: &str,
    bytes: &[u8],
) -> anyhow::Result<()> {
    validate_skill_id(id)?;
    if version.trim().is_empty() {
        anyhow::bail!("official skill version is empty");
    }
    std::fs::create_dir_all(skills_root)
        .with_context(|| format!("failed to create skills directory {}", skills_root.display()))?;
    let staging_parent = skills_root.join(".tmp");
    std::fs::create_dir_all(&staging_parent)
        .with_context(|| format!("failed to create staging directory {}", staging_parent.display()))?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let staging = staging_parent.join(format!("{id}-{nonce}"));
    std::fs::create_dir_all(&staging)
        .with_context(|| format!("failed to create skill staging directory {}", staging.display()))?;

    let result = extract_skill_zip(bytes, &staging)
        .and_then(|_| ensure_skill_root(&staging))
        .and_then(|_| write_skill_marker(&staging, id, version))
        .and_then(|_| replace_skill_directory(skills_root, id, &staging));
    if result.is_err() {
        let _ = std::fs::remove_dir_all(&staging);
    }
    result
}

pub fn installed_skill_versions(skills_root: &Path) -> BTreeMap<String, String> {
    let Ok(entries) = std::fs::read_dir(skills_root) else {
        return BTreeMap::new();
    };
    entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let id = entry.file_name().to_string_lossy().to_string();
            if id.starts_with('.') || !entry.path().is_dir() || validate_skill_id(&id).is_err() {
                return None;
            }
            let marker = entry.path().join(".codework-skill.json");
            let value = std::fs::read_to_string(marker).ok()?;
            let json: Value = serde_json::from_str(&value).ok()?;
            let version = json.get("version")?.as_str()?.trim();
            (!version.is_empty()).then(|| (id, version.to_string()))
        })
        .collect()
}

fn parse_market_skill(raw: &Value) -> anyhow::Result<MarketSkill> {
    let id = required_string(raw, "id")?;
    validate_skill_id(&id)?;
    let name = required_string(raw, "name")?;
    let description = required_string(raw, "description")?;
    let version = required_string(raw, "version")?;
    let package_url = required_string(raw, "packageUrl")
        .or_else(|_| required_string(raw, "package_url"))?;
    let url = Url::parse(&package_url).context("official skill package URL is invalid")?;
    if !matches!(url.scheme(), "http" | "https") {
        anyhow::bail!("official skill package URL must use HTTP or HTTPS");
    }
    let sha256 = required_string(raw, "sha256")?;
    if !is_sha256(&sha256) {
        anyhow::bail!("official skill package SHA-256 is invalid");
    }
    let tags = raw
        .get("tags")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
                .collect()
        })
        .unwrap_or_default();
    Ok(MarketSkill {
        id,
        name,
        description,
        version,
        author: optional_string(raw, "author").unwrap_or_default(),
        tags,
        homepage: optional_string(raw, "homepage").unwrap_or_default(),
        package_url,
        sha256: sha256.to_ascii_lowercase(),
    })
}

fn extract_skill_zip(bytes: &[u8], destination: &Path) -> anyhow::Result<()> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).context("failed to read skill package ZIP")?;
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .with_context(|| format!("failed to read skill package entry {index}"))?;
        if file
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            anyhow::bail!("skill package contains a symbolic link");
        }
        let relative_path = safe_zip_path(file.name())?;
        let output_path = destination.join(relative_path);
        if file.is_dir() {
            std::fs::create_dir_all(&output_path)
                .with_context(|| format!("failed to create {}", output_path.display()))?;
            continue;
        }
        if let Some(parent) = output_path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("failed to create {}", parent.display()))?;
        }
        let mut contents = Vec::new();
        file.read_to_end(&mut contents)
            .with_context(|| format!("failed to read skill package entry {}", file.name()))?;
        std::fs::write(&output_path, contents)
            .with_context(|| format!("failed to write {}", output_path.display()))?;
    }
    Ok(())
}

fn safe_zip_path(name: &str) -> anyhow::Result<PathBuf> {
    if name.is_empty() || name.contains('\0') {
        anyhow::bail!("skill package contains an invalid path");
    }
    let path = Path::new(name);
    let mut relative = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(value) => relative.push(value),
            Component::CurDir => {}
            Component::Prefix(_) | Component::RootDir | Component::ParentDir => {
                anyhow::bail!("skill package entry escapes the skill directory");
            }
        }
    }
    if relative.as_os_str().is_empty() {
        anyhow::bail!("skill package contains an empty path");
    }
    Ok(relative)
}

fn ensure_skill_root(staging: &Path) -> anyhow::Result<()> {
    if !staging.join("SKILL.md").is_file() {
        anyhow::bail!("official skill package must contain SKILL.md at its root");
    }
    Ok(())
}

fn write_skill_marker(staging: &Path, id: &str, version: &str) -> anyhow::Result<()> {
    let marker = serde_json::to_vec_pretty(&json!({ "id": id, "version": version }))?;
    crate::settings::atomic_write(&staging.join(".codework-skill.json"), &marker)
        .context("failed to record installed skill version")
}

fn replace_skill_directory(skills_root: &Path, id: &str, staging: &Path) -> anyhow::Result<()> {
    let destination = skills_root.join(id);
    let backup = skills_root.join(format!(".{id}.previous-codework"));
    if backup.exists() {
        std::fs::remove_dir_all(&backup)
            .with_context(|| format!("failed to remove old skill backup {}", backup.display()))?;
    }
    let had_destination = destination.exists();
    if had_destination {
        std::fs::rename(&destination, &backup)
            .with_context(|| format!("failed to stage current skill {}", destination.display()))?;
    }
    if let Err(error) = std::fs::rename(staging, &destination) {
        if had_destination {
            let _ = std::fs::rename(&backup, &destination);
        }
        return Err(error).with_context(|| format!("failed to install skill {}", destination.display()));
    }
    if backup.exists() {
        let _ = std::fs::remove_dir_all(backup);
    }
    Ok(())
}

fn required_string(raw: &Value, key: &str) -> anyhow::Result<String> {
    raw.get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| anyhow::anyhow!("official skill entry is missing {key}"))
}

fn optional_string(raw: &Value, key: &str) -> Option<String> {
    raw.get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn validate_skill_id(id: &str) -> anyhow::Result<()> {
    if id.is_empty()
        || id.len() > 80
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    {
        anyhow::bail!("official skill id is invalid");
    }
    Ok(())
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

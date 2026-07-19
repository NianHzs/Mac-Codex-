use std::path::{Path, PathBuf};

use anyhow::Context;
use base64::Engine;
use codex_plus_core::release_manifest::{SignedReleaseManifest, sha256_file};
use ed25519_dalek::SigningKey;
use rand::rngs::OsRng;

fn main() {
    if let Err(error) = run() {
        eprintln!("{error:#}");
        std::process::exit(1);
    }
}

fn run() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let Some(command) = args.first().map(String::as_str) else {
        anyhow::bail!("缺少命令：generate-key 或 sign-manifest");
    };
    match command {
        "generate-key" => generate_key_pair(
            &required_path(&args, "--private-key")?,
            &required_path(&args, "--public-key")?,
        ),
        "sign-manifest" => sign_manifest(&args),
        _ => anyhow::bail!("未知命令：{command}"),
    }
}

fn required_value(args: &[String], name: &str) -> anyhow::Result<String> {
    let index = args
        .iter()
        .position(|value| value == name)
        .with_context(|| format!("缺少参数 {name}"))?;
    args.get(index + 1)
        .filter(|value| !value.trim().is_empty())
        .cloned()
        .with_context(|| format!("参数 {name} 不能为空"))
}

fn required_path(args: &[String], name: &str) -> anyhow::Result<PathBuf> {
    let index = args
        .iter()
        .position(|value| value == name)
        .with_context(|| format!("缺少参数 {name}"))?;
    let value = args
        .get(index + 1)
        .filter(|value| !value.trim().is_empty())
        .with_context(|| format!("参数 {name} 不能为空"))?;
    Ok(PathBuf::from(value))
}

fn generate_key_pair(private_path: &Path, public_path: &Path) -> anyhow::Result<()> {
    ensure_parent(private_path)?;
    ensure_parent(public_path)?;
    let signing_key = SigningKey::generate(&mut OsRng);
    let private_value = base64::engine::general_purpose::STANDARD.encode(signing_key.to_bytes());
    let public_value =
        base64::engine::general_purpose::STANDARD.encode(signing_key.verifying_key().to_bytes());
    std::fs::write(private_path, format!("{private_value}\n"))?;
    std::fs::write(public_path, format!("{public_value}\n"))?;
    Ok(())
}

fn sign_manifest(args: &[String]) -> anyhow::Result<()> {
    let private_path = required_path(args, "--private-key")?;
    let installer_path = required_path(args, "--installer")?;
    let notes_path = required_path(args, "--notes-file")?;
    let output_path = required_path(args, "--output")?;
    let private_bytes: [u8; 32] = base64::engine::general_purpose::STANDARD
        .decode(std::fs::read_to_string(&private_path)?.trim())
        .context("发布私钥不是有效的 Base64")?
        .try_into()
        .map_err(|_| anyhow::anyhow!("发布私钥必须为 32 字节"))?;
    let signing_key = SigningKey::from_bytes(&private_bytes);
    let notes: Vec<String> = serde_json::from_str(&std::fs::read_to_string(&notes_path)?)
        .context("更新说明文件必须是 JSON 字符串数组")?;
    let mut manifest = SignedReleaseManifest {
        version: required_value(args, "--version")?,
        download_url: required_value(args, "--download-url")?,
        size: std::fs::metadata(&installer_path)?.len(),
        sha256: sha256_file(&installer_path)?,
        signature: String::new(),
        published_at: required_value(args, "--published-at")?,
        minimum_supported_version: required_value(args, "--minimum-supported-version")?,
        mandatory: args.iter().any(|value| value == "--mandatory"),
        notes,
    };
    manifest.validate_shape()?;
    manifest.sign_with(&signing_key);
    ensure_parent(&output_path)?;
    std::fs::write(
        output_path,
        format!("{}\n", serde_json::to_string_pretty(&manifest)?),
    )?;
    Ok(())
}

fn ensure_parent(path: &Path) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    Ok(())
}

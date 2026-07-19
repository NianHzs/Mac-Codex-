use std::fs::File;
use std::io::Read;
use std::path::Path;

use anyhow::Context;
use base64::Engine;
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;
use url::Url;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SignedReleaseManifest {
    pub version: String,
    pub download_url: String,
    pub size: u64,
    pub sha256: String,
    pub signature: String,
    pub published_at: String,
    pub minimum_supported_version: String,
    #[serde(default)]
    pub mandatory: bool,
    #[serde(default)]
    pub notes: Vec<String>,
}

impl SignedReleaseManifest {
    pub fn signing_payload(&self) -> Vec<u8> {
        format!(
            "version={}\ndownloadUrl={}\nsize={}\nsha256={}\npublishedAt={}\nminimumSupportedVersion={}\nmandatory={}\n",
            self.version.trim(),
            self.download_url.trim(),
            self.size,
            self.sha256.trim().to_ascii_lowercase(),
            self.published_at.trim(),
            self.minimum_supported_version.trim(),
            self.mandatory,
        )
        .into_bytes()
    }

    pub fn validate_shape(&self) -> anyhow::Result<()> {
        anyhow::ensure!(
            parse_release_version(&self.version).is_some(),
            "发布版本号格式无效"
        );
        anyhow::ensure!(
            parse_release_version(&self.minimum_supported_version).is_some(),
            "最低支持版本号格式无效"
        );
        let url = Url::parse(self.download_url.trim()).context("发布下载地址格式无效")?;
        anyhow::ensure!(
            matches!(url.scheme(), "http" | "https") && url.host_str().is_some(),
            "发布下载地址必须使用 HTTP 或 HTTPS"
        );
        anyhow::ensure!(self.size > 0, "安装包大小必须大于零");
        let sha256 = self.sha256.trim();
        anyhow::ensure!(
            sha256.len() == 64 && sha256.bytes().all(|byte| byte.is_ascii_hexdigit()),
            "安装包 SHA-256 格式无效"
        );
        OffsetDateTime::parse(self.published_at.trim(), &Rfc3339)
            .context("发布时间必须使用 RFC3339 格式")?;
        Ok(())
    }

    pub fn sign_with(&mut self, signing_key: &SigningKey) {
        let signature = signing_key.sign(&self.signing_payload());
        self.signature = base64::engine::general_purpose::STANDARD.encode(signature.to_bytes());
    }

    pub fn verify(&self, public_key: &VerifyingKey) -> anyhow::Result<()> {
        self.validate_shape()?;
        let signature_bytes = base64::engine::general_purpose::STANDARD
            .decode(self.signature.trim())
            .context("发布签名不是有效的 Base64")?;
        let signature = Signature::from_slice(&signature_bytes).context("发布签名长度无效")?;
        public_key
            .verify(&self.signing_payload(), &signature)
            .context("发布签名校验失败")
    }
}

pub fn sha256_file(path: &Path) -> anyhow::Result<String> {
    let mut file =
        File::open(path).with_context(|| format!("无法读取安装包：{}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

pub fn parse_release_version(value: &str) -> Option<[u32; 3]> {
    let parts: Vec<_> = value.trim().split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    let mut parsed = [0_u32; 3];
    for (index, part) in parts.iter().enumerate() {
        parsed[index] = part.parse().ok()?;
    }
    Some(parsed)
}

use codex_plus_core::release_manifest::{SignedReleaseManifest, sha256_file};
use ed25519_dalek::SigningKey;

fn fixture_manifest() -> SignedReleaseManifest {
    SignedReleaseManifest {
        version: "1.3.37".to_string(),
        download_url:
            "http://115.190.199.191:20080/downloads/codework-ai-client-1.3.37-windows-x64-setup.exe"
                .to_string(),
        size: 15_332_386,
        sha256: "284a6adbda7572d3761dca23b1d7b03ab13912bd2f6a413aa31e6da9a5786519".to_string(),
        signature: String::new(),
        published_at: "2026-07-19T16:30:00Z".to_string(),
        minimum_supported_version: "1.3.36".to_string(),
        mandatory: false,
        notes: vec!["增强更新安全性".to_string()],
    }
}

#[test]
fn signed_manifest_rejects_a_changed_installer_size() {
    let signing_key = SigningKey::from_bytes(&[7_u8; 32]);
    let mut manifest = fixture_manifest();
    manifest.sign_with(&signing_key);

    assert!(manifest.verify(&signing_key.verifying_key()).is_ok());

    manifest.size += 1;

    assert!(manifest.verify(&signing_key.verifying_key()).is_err());
}

#[test]
fn manifest_rejects_a_non_rfc3339_publish_time() {
    let mut manifest = fixture_manifest();
    manifest.published_at = "yesterday-afternoon".to_string();

    assert!(manifest.validate_shape().is_err());
}

#[test]
fn sha256_file_hashes_the_exact_installer_bytes() {
    let temp = tempfile::tempdir().unwrap();
    let installer = temp.path().join("setup.exe");
    std::fs::write(&installer, b"abc").unwrap();

    assert_eq!(
        sha256_file(&installer).unwrap(),
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
}

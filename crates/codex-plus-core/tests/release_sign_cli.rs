use std::process::Command;

use base64::Engine;
use codex_plus_core::release_manifest::SignedReleaseManifest;
use ed25519_dalek::VerifyingKey;

#[test]
fn release_sign_cli_generates_a_private_and_public_key_pair() {
    let temp = tempfile::tempdir().unwrap();
    let private_key = temp.path().join("release-private.key");
    let public_key = temp.path().join("release-public.key");

    let status = Command::new(env!("CARGO_BIN_EXE_codework-release-sign"))
        .args([
            "generate-key",
            "--private-key",
            private_key.to_str().unwrap(),
            "--public-key",
            public_key.to_str().unwrap(),
        ])
        .status()
        .unwrap();

    assert!(status.success());
    assert_eq!(
        base64::engine::general_purpose::STANDARD
            .decode(std::fs::read_to_string(private_key).unwrap().trim())
            .unwrap()
            .len(),
        32
    );
    assert_eq!(
        base64::engine::general_purpose::STANDARD
            .decode(std::fs::read_to_string(public_key).unwrap().trim())
            .unwrap()
            .len(),
        32
    );
}

#[test]
fn release_sign_cli_derives_the_matching_public_key_without_regenerating_the_private_key() {
    let temp = tempfile::tempdir().unwrap();
    let private_key = temp.path().join("release-private.key");
    let generated_public_key = temp.path().join("generated-public.key");
    let derived_public_key = temp.path().join("derived-public.key");

    let generate_status = Command::new(env!("CARGO_BIN_EXE_codework-release-sign"))
        .args([
            "generate-key",
            "--private-key",
            private_key.to_str().unwrap(),
            "--public-key",
            generated_public_key.to_str().unwrap(),
        ])
        .status()
        .unwrap();
    assert!(generate_status.success());
    let private_before = std::fs::read_to_string(&private_key).unwrap();

    let derive_status = Command::new(env!("CARGO_BIN_EXE_codework-release-sign"))
        .args([
            "derive-public-key",
            "--private-key",
            private_key.to_str().unwrap(),
            "--public-key",
            derived_public_key.to_str().unwrap(),
        ])
        .status()
        .unwrap();

    assert!(derive_status.success());
    assert_eq!(
        std::fs::read_to_string(&derived_public_key).unwrap(),
        std::fs::read_to_string(&generated_public_key).unwrap()
    );
    assert_eq!(
        std::fs::read_to_string(&private_key).unwrap(),
        private_before
    );
}

#[test]
fn release_sign_cli_writes_a_verifiable_manifest_for_the_installer() {
    let temp = tempfile::tempdir().unwrap();
    let private_key = temp.path().join("release-private.key");
    let public_key = temp.path().join("release-public.key");
    let installer = temp.path().join("setup.exe");
    let notes = temp.path().join("notes.json");
    let manifest_path = temp.path().join("manifest.json");
    std::fs::write(&installer, b"abc").unwrap();
    std::fs::write(&notes, r#"["增强更新安全性"]"#).unwrap();

    let generate_status = Command::new(env!("CARGO_BIN_EXE_codework-release-sign"))
        .args([
            "generate-key",
            "--private-key",
            private_key.to_str().unwrap(),
            "--public-key",
            public_key.to_str().unwrap(),
        ])
        .status()
        .unwrap();
    assert!(generate_status.success());

    let sign_status = Command::new(env!("CARGO_BIN_EXE_codework-release-sign"))
        .args([
            "sign-manifest",
            "--private-key",
            private_key.to_str().unwrap(),
            "--installer",
            installer.to_str().unwrap(),
            "--version",
            "1.3.37",
            "--download-url",
            "http://115.190.199.191:20080/downloads/client-1.3.37.exe",
            "--published-at",
            "2026-07-19T16:30:00Z",
            "--minimum-supported-version",
            "1.3.36",
            "--notes-file",
            notes.to_str().unwrap(),
            "--output",
            manifest_path.to_str().unwrap(),
        ])
        .status()
        .unwrap();

    assert!(sign_status.success());
    let manifest: SignedReleaseManifest =
        serde_json::from_str(&std::fs::read_to_string(&manifest_path).unwrap()).unwrap();
    assert_eq!(manifest.size, 3);
    assert_eq!(
        manifest.sha256,
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    let public_bytes: [u8; 32] = base64::engine::general_purpose::STANDARD
        .decode(std::fs::read_to_string(&public_key).unwrap().trim())
        .unwrap()
        .try_into()
        .unwrap();
    let verifying_key = VerifyingKey::from_bytes(&public_bytes).unwrap();
    manifest.verify(&verifying_key).unwrap();

    let verify_status = Command::new(env!("CARGO_BIN_EXE_codework-release-sign"))
        .args([
            "verify-manifest",
            "--public-key",
            public_key.to_str().unwrap(),
            "--manifest",
            manifest_path.to_str().unwrap(),
            "--installer",
            installer.to_str().unwrap(),
        ])
        .status()
        .unwrap();
    assert!(verify_status.success());

    std::fs::write(&installer, b"modified-installer").unwrap();
    let mismatched_installer_status = Command::new(env!("CARGO_BIN_EXE_codework-release-sign"))
        .args([
            "verify-manifest",
            "--public-key",
            public_key.to_str().unwrap(),
            "--manifest",
            manifest_path.to_str().unwrap(),
            "--installer",
            installer.to_str().unwrap(),
        ])
        .status()
        .unwrap();
    assert!(!mismatched_installer_status.success());

    std::fs::write(&installer, b"abc").unwrap();
    let mut modified_manifest: SignedReleaseManifest =
        serde_json::from_str(&std::fs::read_to_string(&manifest_path).unwrap()).unwrap();
    modified_manifest.version = "1.3.38".to_string();
    std::fs::write(
        &manifest_path,
        serde_json::to_string_pretty(&modified_manifest).unwrap(),
    )
    .unwrap();
    let tampered_manifest_status = Command::new(env!("CARGO_BIN_EXE_codework-release-sign"))
        .args([
            "verify-manifest",
            "--public-key",
            public_key.to_str().unwrap(),
            "--manifest",
            manifest_path.to_str().unwrap(),
            "--installer",
            installer.to_str().unwrap(),
        ])
        .status()
        .unwrap();
    assert!(!tampered_manifest_status.success());
}

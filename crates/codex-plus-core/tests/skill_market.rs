use std::io::Write;

use codex_plus_core::skill_market::{
    install_skill_archive, parse_skill_manifest, verify_sha256,
};
use serde_json::json;

#[test]
fn parses_official_skill_manifest_and_rejects_incomplete_entries() {
    let manifest = parse_skill_manifest(json!({
        "version": 1,
        "skills": [{
            "id": "smart-copywriter",
            "name": "智能文案助手",
            "description": "撰写实用文案",
            "version": "1.0.0",
            "packageUrl": "https://example.invalid/smart-copywriter.zip",
            "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        }]
    }))
    .unwrap();

    assert_eq!(manifest.skills.len(), 1);
    assert_eq!(manifest.skills[0].id, "smart-copywriter");
    assert!(parse_skill_manifest(json!({ "skills": [{ "id": "bad" }] })).is_err());
}

#[test]
fn rejects_package_when_sha256_does_not_match() {
    assert!(verify_sha256(b"content", &"0".repeat(64)).is_err());
}

#[test]
fn rejects_zip_entry_that_escapes_skill_destination() {
    let temp = tempfile::tempdir().unwrap();
    let bytes = zip_bytes(&[("../outside.txt", b"bad")]);

    assert!(install_skill_archive(temp.path(), "smart-copywriter", "1.0.0", &bytes).is_err());
    assert!(!temp.path().join("outside.txt").exists());
}

#[test]
fn installs_a_valid_skill_with_its_version_marker() {
    let temp = tempfile::tempdir().unwrap();
    let bytes = zip_bytes(&[("SKILL.md", b"# Smart copywriter\n")]);

    install_skill_archive(temp.path(), "smart-copywriter", "1.0.0", &bytes).unwrap();

    assert!(temp.path().join("smart-copywriter").join("SKILL.md").exists());
    let marker = std::fs::read_to_string(
        temp.path()
            .join("smart-copywriter")
            .join(".codework-skill.json"),
    )
    .unwrap();
    assert!(marker.contains("smart-copywriter"));
    assert!(marker.contains("1.0.0"));
}

fn zip_bytes(entries: &[(&str, &[u8])]) -> Vec<u8> {
    let mut bytes = Vec::new();
    {
        let mut writer = zip::ZipWriter::new(std::io::Cursor::new(&mut bytes));
        let options = zip::write::SimpleFileOptions::default();
        for (name, contents) in entries {
            writer.start_file(*name, options).unwrap();
            writer.write_all(contents).unwrap();
        }
        writer.finish().unwrap();
    }
    bytes
}

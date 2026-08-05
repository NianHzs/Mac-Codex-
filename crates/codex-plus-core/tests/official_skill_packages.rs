use std::path::PathBuf;

#[test]
fn official_skill_sources_have_skill_instructions() {
    let root = repository_root().join("official-skills");
    for id in [
        "smart-copywriter",
        "short-video-script",
        "spreadsheet-data-assistant",
        "file-organization-assistant",
        "code-debugging-assistant",
        "project-bootstrap-assistant",
    ] {
        let content = std::fs::read_to_string(root.join(id).join("SKILL.md")).unwrap();
        assert!(content.contains("# "));
    }
    let organizer = std::fs::read_to_string(root.join("file-organization-assistant").join("SKILL.md")).unwrap();
    assert!(organizer.contains("预览"));
    assert!(organizer.contains("确认"));
}

fn repository_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|path| path.parent())
        .unwrap()
        .to_path_buf()
}

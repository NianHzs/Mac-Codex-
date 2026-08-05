use std::path::PathBuf;

use codex_plus_core::dream_skin::{DreamAppearance, DreamSkinArt, DreamSkinTheme, EngineThemeRequest};
use codex_plus_core::dream_skin_cdp::{dream_skin_early_payload, dream_skin_early_payload_for_request, validate_dream_skin_websocket_url};
use codex_plus_core::launcher::build_codex_arguments;

#[test]
fn dream_skin_rejects_remote_and_wrong_port_websocket_targets() {
    assert!(validate_dream_skin_websocket_url("ws://127.0.0.1:9335/devtools/page/a", 9335).is_ok());
    assert!(validate_dream_skin_websocket_url("ws://192.168.1.8:9335/devtools/page/a", 9335).is_err());
    assert!(validate_dream_skin_websocket_url("ws://127.0.0.1:9336/devtools/page/a", 9335).is_err());
}

#[test]
fn early_payload_contains_generation_guard_and_cleanup_marker() {
    let script = dream_skin_early_payload("theme-rev-7", "payload-json");
    assert!(script.contains("__CODEWORK_DREAM_SKIN_GENERATION__"));
    assert!(script.contains("restoreCodeworkDreamSkin"));
}

#[test]
fn dream_skin_theme_keeps_the_codework_client_version_for_the_brand_badge() {
    let theme: DreamSkinTheme = serde_json::from_value(serde_json::json!({
        "id": "custom-dream-skin",
        "revision": "local-8",
        "name": "Custom Dream Skin",
        "appearance": "light",
        "clientVersion": "1.3.62",
        "art": { "focusX": 0.5, "focusY": 0.45, "safeArea": "left", "taskMode": "ambient" },
        "assetName": "custom-wallpaper.png",
        "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }))
    .unwrap();

    assert_eq!(serde_json::to_value(theme).unwrap()["clientVersion"], "1.3.62");
}

#[test]
fn request_payload_uses_a_numeric_generation_guard() {
    let request = EngineThemeRequest::new(
        DreamSkinTheme {
            id: "shinchan-energy".to_string(),
            revision: "r2".to_string(),
            name: "Shinchan".to_string(),
            appearance: DreamAppearance::Light,
            client_version: "1.3.62".to_string(),
            art: DreamSkinArt {
                focus_x: 0.5,
                focus_y: 0.5,
                safe_area: "left".to_string(),
                task_mode: "ambient".to_string(),
            },
            asset_name: "shinchan.png".to_string(),
            sha256: "a".repeat(64),
        },
        73,
        PathBuf::from("C:/Codework/DreamSkin/themes/shinchan-energy/shinchan.png"),
    );

    let script = dream_skin_early_payload_for_request(&request, "payload-json");

    assert!(script.contains("const generation = 73;"));
    assert!(script.contains("restoreCodeworkDreamSkin"));
}

#[test]
fn dream_skin_launch_binds_the_debug_port_to_loopback() {
    assert!(build_codex_arguments(9335, &[])
        .contains(&"--remote-debugging-address=127.0.0.1".to_string()));
}

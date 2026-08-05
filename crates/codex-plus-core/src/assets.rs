use base64::Engine;
use serde_json::Map;
use serde_json::{Value, json};
use std::path::Path;

use crate::settings::BackendSettings;

const RENDERER_SCRIPT: &str = include_str!("../../../assets/inject/renderer-inject.js");
// Vendored unchanged from Fei-Away/Codex-Dream-Skin under the MIT license.
// Keep the accompanying LICENSE and NOTICE files beside these sources.
const FEI_AWAY_DREAM_SKIN_CSS: &str = include_str!("../../../assets/vendor/fei-away-codex-dream-skin/dream-skin.css");
const FEI_AWAY_DREAM_SKIN_RUNTIME: &str = include_str!("../../../assets/vendor/fei-away-codex-dream-skin/renderer-inject.js");
const STEPWISE_SCRIPT: &str = include_str!("../../../assets/inject/stepwise-inject.js");
const SPONSOR_WECHAT: &[u8] =
    include_bytes!("../../../assets/images/codework-sponsor-wechat.jpg");
pub const DIAGNOSTIC_BUILD_ID: &str = "diag-20260518-1";

fn fei_away_dream_skin_runner() -> &'static str {
    FEI_AWAY_DREAM_SKIN_RUNTIME
        .trim_end()
        .strip_suffix("(__DREAM_CSS_JSON__, __DREAM_ART_JSON__, __DREAM_THEME_JSON__)")
        .expect("vendored Fei-Away renderer must end with its three runtime placeholders")
}

pub fn renderer_script() -> &'static str {
    RENDERER_SCRIPT
}

pub fn stepwise_script() -> &'static str {
    STEPWISE_SCRIPT
}

pub fn sponsor_image_data_uris() -> Value {
    json!({
        "wechat": image_data_uri("image/jpeg", SPONSOR_WECHAT),
    })
}

pub fn injection_script(helper_port: u16) -> String {
    injection_script_with_settings(helper_port, &BackendSettings::default())
}

pub fn injection_script_with_settings(helper_port: u16, settings: &BackendSettings) -> String {
    let helper_url = format!("http://127.0.0.1:{helper_port}");
    let sponsor_images = sponsor_image_data_uris();
    let image_overlay = image_overlay_config(helper_port, settings);
    let plugin_marketplaces = local_plugin_marketplaces();
    let paste_fix = paste_fix_enabled_config(settings);
    let force_chinese_locale = force_chinese_locale_config(settings);
    let fast_startup = fast_startup_config(settings);
    let dream_skin_payload = dream_skin_payload(settings);
    let dream_skin_runner = fei_away_dream_skin_runner();
    format!(
        "window.__CODEX_SESSION_DELETE_HELPER__ = {};\nwindow.__CODEX_PLUS_SPONSOR_IMAGES__ = {};\nwindow.__CODEX_PLUS_PRODUCT_LABEL__ = {};\nwindow.__CODEX_PLUS_VERSION__ = {};\nwindow.__CODEX_PLUS_BUILD__ = {};\nwindow.__CODEX_PLUS_IMAGE_OVERLAY__ = {};\nwindow.__CODEX_PLUS_PLUGIN_MARKETPLACES__ = {};\nwindow.__CODEX_PLUS_PASTE_FIX__ = {};\nwindow.__CODEX_PLUS_FORCE_CHINESE_LOCALE__ = {};\nwindow.__CODEX_PLUS_FAST_STARTUP__ = {};\nwindow.__CODEWORK_DREAM_SKIN_PAYLOAD__ = {};\nwindow.__CODEX_PLUS_DREAM_SKIN_CSS__ = {};\nwindow.__CODEX_PLUS_DREAM_SKIN_RUN__ = {};\n{}\n{}",
        serde_json::to_string(&helper_url).expect("helper URL should serialize"),
        serde_json::to_string(&sponsor_images).expect("sponsor images should serialize"),
        serde_json::to_string(crate::version::PRODUCT_LABEL)
            .expect("product label should serialize"),
        serde_json::to_string(crate::version::DISPLAY_VERSION)
            .expect("display version should serialize"),
        serde_json::to_string(DIAGNOSTIC_BUILD_ID).expect("build id should serialize"),
        serde_json::to_string(&image_overlay).expect("image overlay config should serialize"),
        serde_json::to_string(&plugin_marketplaces).expect("plugin marketplaces should serialize"),
        serde_json::to_string(&paste_fix).expect("paste fix config should serialize"),
        serde_json::to_string(&force_chinese_locale)
            .expect("force Chinese locale config should serialize"),
        serde_json::to_string(&fast_startup).expect("fast startup config should serialize"),
        serde_json::to_string(&dream_skin_payload).expect("Dream Skin payload should serialize"),
        serde_json::to_string(FEI_AWAY_DREAM_SKIN_CSS).expect("Dream Skin CSS should serialize"),
        dream_skin_runner,
        renderer_script(),
        stepwise_script(),
    )
}

fn dream_skin_payload(settings: &BackendSettings) -> Value {
    json!({
        "enabled": settings.codex_app_visual_theme_enabled,
        "themeId": settings.codex_app_visual_theme_id,
        "generation": "settings-v1",
    })
}

fn local_plugin_marketplaces() -> Value {
    let home = crate::codex_home::default_codex_home_dir();
    local_plugin_marketplaces_from_home(&home)
}

fn local_plugin_marketplaces_from_home(home: &Path) -> Value {
    let installed_plugins = installed_plugins_from_config(&home);
    let marketplace_dir = home
        .join(".tmp")
        .join("plugins")
        .join(".agents")
        .join("plugins");
    let candidates = [
        marketplace_dir.join("marketplace.json"),
        marketplace_dir.join("api_marketplace.json"),
        home.join(".tmp")
            .join("plugins-remote")
            .join(".agents")
            .join("plugins")
            .join("marketplace.json"),
    ];
    let marketplaces = candidates
        .iter()
        .filter_map(|path| {
            let text = std::fs::read_to_string(path).ok()?;
            let mut marketplace: Value = serde_json::from_str(&text).ok()?;
            expand_local_plugin_marketplace(&mut marketplace, path, &home, &installed_plugins);
            if let Some(object) = marketplace.as_object_mut() {
                object
                    .entry("path")
                    .or_insert_with(|| Value::String(path.to_string_lossy().to_string()));
            }
            Some(marketplace)
        })
        .collect::<Vec<_>>();
    Value::Array(marketplaces)
}

fn expand_local_plugin_marketplace(
    marketplace: &mut Value,
    marketplace_path: &Path,
    home: &Path,
    installed_plugins: &std::collections::BTreeSet<String>,
) {
    let marketplace_name = marketplace
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let Some(plugins) = marketplace.get_mut("plugins").and_then(Value::as_array_mut) else {
        return;
    };
    let marketplace_root = marketplace_path
        .ancestors()
        .nth(3)
        .map(Path::to_path_buf)
        .unwrap_or_else(|| home.join(".tmp").join("plugins"));
    for plugin in plugins {
        let Some(plugin_object) = plugin.as_object_mut() else {
            continue;
        };
        let plugin_name = plugin_object
            .get("name")
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| {
                plugin_object
                    .get("id")
                    .and_then(Value::as_str)
                    .and_then(|id| id.split('@').next())
                    .map(str::to_string)
            })
            .unwrap_or_default();
        if plugin_name.is_empty() {
            continue;
        }
        let manifest_path = marketplace_root
            .join("plugins")
            .join(&plugin_name)
            .join(".codex-plugin")
            .join("plugin.json");
        let plugin_root = marketplace_root.join("plugins").join(&plugin_name);
        if let Some(manifest) = plugin_manifest(&manifest_path) {
            merge_plugin_manifest(plugin_object, manifest);
        }
        absolutize_plugin_icon_paths(plugin_object, &plugin_root);
        plugin_object
            .entry("name".to_string())
            .or_insert_with(|| Value::String(plugin_name.clone()));
        plugin_object
            .entry("id".to_string())
            .or_insert_with(|| Value::String(format!("{plugin_name}@{marketplace_name}")));
        plugin_object
            .entry("marketplaceName".to_string())
            .or_insert_with(|| Value::String(marketplace_name.clone()));
        plugin_object
            .entry("marketplacePath".to_string())
            .or_insert_with(|| Value::String(marketplace_name.clone()));
        plugin_object
            .entry("keywords".to_string())
            .or_insert_with(|| Value::Array(Vec::new()));
        plugin_object.insert(
            "installed".to_string(),
            Value::Bool(installed_plugins.contains(&format!("{plugin_name}@{marketplace_name}"))),
        );
    }
}

fn absolutize_plugin_icon_paths(plugin: &mut Map<String, Value>, plugin_root: &Path) {
    for key in ["composerIconPath", "logoPath"] {
        absolutize_string_field(plugin, key, plugin_root);
    }
    let Some(interface) = plugin.get_mut("interface").and_then(Value::as_object_mut) else {
        return;
    };
    for key in ["composerIcon", "composerIconUrl", "logo", "logoUrl"] {
        absolutize_string_field(interface, key, plugin_root);
    }
}

fn absolutize_string_field(object: &mut Map<String, Value>, key: &str, root: &Path) {
    let Some(value) = object.get(key).and_then(Value::as_str).map(str::to_string) else {
        return;
    };
    let Some(path) = absolutize_plugin_asset_path(&value, root) else {
        return;
    };
    object.insert(key.to_string(), Value::String(path));
}

fn absolutize_plugin_asset_path(value: &str, root: &Path) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty()
        || trimmed.starts_with("data:")
        || trimmed.starts_with("http:")
        || trimmed.starts_with("https:")
        || trimmed.starts_with("file:")
        || Path::new(trimmed).is_absolute()
    {
        return None;
    }
    let relative = trimmed.strip_prefix("./").unwrap_or(trimmed);
    Some(root.join(relative).to_string_lossy().to_string())
}

fn plugin_manifest(path: &Path) -> Option<Map<String, Value>> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str::<Value>(&text)
        .ok()?
        .as_object()
        .cloned()
}

fn merge_plugin_manifest(plugin: &mut Map<String, Value>, manifest: Map<String, Value>) {
    for (key, value) in manifest {
        plugin.entry(key).or_insert(value);
    }
}

fn installed_plugins_from_config(home: &Path) -> std::collections::BTreeSet<String> {
    let text = std::fs::read_to_string(home.join("config.toml")).unwrap_or_default();
    let doc = text.parse::<toml_edit::DocumentMut>().ok();
    let Some(plugins) = doc
        .as_ref()
        .and_then(|doc| doc.get("plugins"))
        .and_then(toml_edit::Item::as_table)
    else {
        return std::collections::BTreeSet::new();
    };
    plugins
        .iter()
        .filter_map(|(id, item)| {
            let enabled = item
                .get("enabled")
                .and_then(toml_edit::Item::as_bool)
                .unwrap_or(false);
            enabled.then(|| id.to_string())
        })
        .collect()
}

pub fn image_overlay_config(helper_port: u16, settings: &BackendSettings) -> Value {
    let path = Path::new(settings.codex_app_image_overlay_path.trim());
    let content_type = image_content_type(path).unwrap_or_default();
    let selected_custom_wallpaper = !settings.codex_app_visual_theme_enabled
        || settings.codex_app_visual_theme_id.trim() == "custom-dream-skin";
    let enabled = selected_custom_wallpaper
        && settings.codex_app_image_overlay_enabled
        && path.is_file()
        && matches!(content_type, "image/png" | "image/jpeg" | "image/webp");
    json!({
        "enabled": enabled,
        "opacity": f64::from(settings.codex_app_image_overlay_opacity.clamp(1, 100)) / 100.0,
        "fitMode": settings.codex_app_image_overlay_fit_mode.as_str(),
        "contentType": if enabled { content_type } else { "" },
        "dataUrl": "",
        "imageUrl": if enabled {
            format!("http://127.0.0.1:{helper_port}/overlay/image")
        } else {
            String::new()
        },
    })
}

pub fn paste_fix_enabled_config(settings: &BackendSettings) -> Value {
    json!({ "enabled": settings.codex_app_paste_fix })
}

pub fn force_chinese_locale_config(settings: &BackendSettings) -> Value {
    json!({ "enabled": settings.codex_app_force_chinese_locale, "locale": "zh-CN" })
}

pub fn fast_startup_config(settings: &BackendSettings) -> Value {
    json!({ "enabled": settings.codex_app_fast_startup, "statsigTimeoutMs": 800 })
}

fn image_data_uri(mime_type: &str, bytes: &[u8]) -> String {
    format!(
        "data:{mime_type};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    )
}

fn image_content_type(path: &Path) -> Option<&'static str> {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("png") => Some("image/png"),
        Some("jpg") | Some("jpeg") => Some("image/jpeg"),
        Some("webp") => Some("image/webp"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn image_overlay_config_includes_fit_mode() {
        let settings = BackendSettings {
            codex_app_image_overlay_fit_mode: "fill".to_string(),
            ..BackendSettings::default()
        };
        let config = image_overlay_config(57321, &settings);

        assert_eq!(config["fitMode"].as_str(), Some("fill"));
    }

    #[test]
    fn image_overlay_config_uses_loopback_url_without_embedding_image_bytes() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("wallpaper.png");
        std::fs::write(&path, b"large-local-wallpaper").unwrap();
        let settings = BackendSettings {
            codex_app_image_overlay_enabled: true,
            codex_app_image_overlay_path: path.to_string_lossy().to_string(),
            ..BackendSettings::default()
        };

        let config = image_overlay_config(57321, &settings);
        assert_eq!(config["enabled"], true);
        assert_eq!(config["dataUrl"], "");
        assert_eq!(config["imageUrl"], "http://127.0.0.1:57321/overlay/image");
        assert_eq!(config["contentType"], "image/png");
        assert!(!injection_script_with_settings(57321, &settings)
            .contains("bGFyZ2UtbG9jYWwtd2FsbHBhcGVy"));
    }

    #[test]
    fn image_overlay_is_disabled_when_a_curated_visual_theme_is_selected() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("legacy-custom-wallpaper.png");
        std::fs::write(&path, b"legacy-wallpaper").unwrap();
        let settings = BackendSettings {
            codex_app_image_overlay_enabled: true,
            codex_app_image_overlay_path: path.to_string_lossy().to_string(),
            codex_app_visual_theme_enabled: true,
            codex_app_visual_theme_id: "shinchan-energy".to_string(),
            ..BackendSettings::default()
        };

        let config = image_overlay_config(57321, &settings);

        assert_eq!(config["enabled"], false);
        assert_eq!(config["imageUrl"], "");
    }

    #[test]
    fn visual_theme_scopes_colours_to_the_content_workspace() {
        let script = renderer_script();

        assert!(script.contains("[data-codework-theme-scope]"));
        assert!(!script.contains("aside *{color:var(--codework-theme-text)!important}"));
        assert!(!script.contains("html,body{background-color:var(--codework-theme-background)"));
    }

    #[test]
    fn character_themes_use_the_internal_bridge_and_have_a_safe_restore_path() {
        let script = injection_script(57321);

        assert!(script.contains("window.__codexSessionDeleteBridge(\"/theme/manifest\", {})"));
        assert!(script.contains("window.__codexSessionDeleteBridge(\"/theme/assets\", { assetName })"));
        assert!(script.contains("postJson(\"/identity/status\", payload || {})"));
        assert!(script.contains("restoreCodeworkCharacterTheme"));
        assert!(script.contains("data-codework-character-theme"));
    }

    #[test]
    fn renderer_accepts_the_signed_dream_skin_manifest_metadata() {
        let script = renderer_script();

        assert!(script.contains(
            "const codeworkVisualThemeItemKeys = [\"id\", \"name\", \"detail\", \"tier\", \"version\", \"revision\", \"sha256\", \"assetBytes\""
        ));
        assert!(script.contains(
            "const codeworkVisualThemeManifestKeys = [\"version\", \"updatedAt\", \"authorizationExpiresAt\", \"themes\", \"allowedThemeIds\"]"
        ));
    }

    #[test]
    fn dream_skin_keeps_character_art_visible_in_card_layouts() {
        let renderer = renderer_script();

        assert!(renderer.contains("--dream-ambient-opacity:${isShinchan ? \".36\" : \".32\"} !important;"));
        assert!(renderer.contains(".dream-task::before { content:\"\" !important;opacity:${isShinchan ? \".34\" : \".30\"} !important;"));
    }

    #[test]
    fn wide_dream_skin_task_surface_leaves_character_art_visible() {
        let renderer = renderer_script();

        assert!(renderer.contains("--dream-task-immersive-edge:color-mix(in srgb,${surface} 78%,transparent) !important;"));
        assert!(renderer.contains("--dream-task-immersive-mid:color-mix(in srgb,${surface} 58%,transparent) !important;"));
        assert!(renderer.contains("--dream-task-immersive-far:color-mix(in srgb,${surface} 32%,transparent) !important;"));
    }

    #[test]
    fn dream_skin_treats_the_empty_start_surface_as_home_when_the_home_icon_is_absent() {
        let renderer = renderer_script();

        assert!(renderer.contains("!shellMain.querySelector(\"[data-message-author-role], .thread-scroll-container\")"));
    }

    #[test]
    fn dream_skin_assets_are_pinned_and_the_adapter_has_one_owner() {
        let script = injection_script(57321);

        assert!(include_str!("../../../assets/vendor/fei-away-codex-dream-skin/UPSTREAM.md")
            .contains("Codex Dream Skin"));
        assert!(script.contains("window.__CODEWORK_DREAM_SKIN_PAYLOAD__"));
        assert_eq!(script.matches("codework-dream-skin-style").count(), 0);
        assert!(!renderer_script().contains("setCodeworkVisualThemeTokens"));
        assert!(!script.contains("setCodeworkDreamSkinPaletteStyle(theme);"));
        assert!(!script.contains("renderCodeworkDreamSkin();"));
        assert!(!script.contains("ensureCodeworkDreamSkinObserver();"));
    }

    #[test]
    fn dream_skin_preserves_native_header_control_layout_and_visibility() {
        let renderer = renderer_script();
        let injection = injection_script(57321);

        assert!(!renderer.contains("visibility:visible !important;"));
        assert!(!renderer.contains("pointer-events:auto !important;\n        z-index:12 !important;"));
        assert!(!renderer.contains("position:relative !important;\n        visibility:visible !important;"));
        assert!(!injection.contains(".dream-task > * {"));
        assert!(injection.contains(".dream-task > :not(header.app-header-tint) {"));
    }

    #[test]
    fn dream_skin_renders_the_task_rail_as_one_continuous_yellow_track() {
        assert!(FEI_AWAY_DREAM_SKIN_CSS.contains(
            "html.codex-dream-skin [class*=\"application-menu-top-bar\"]"
        ));
        assert!(FEI_AWAY_DREAM_SKIN_CSS.contains(
            "html.codex-dream-skin [class*=\"navigation-row\"]"
        ));
        assert!(FEI_AWAY_DREAM_SKIN_CSS.contains(
            "button[class*=\"navigation-row\"] {"
        ));
        assert!(FEI_AWAY_DREAM_SKIN_CSS.contains(
            "nav:has(button[class*=\"navigation-row\"])::before"
        ));
        assert!(FEI_AWAY_DREAM_SKIN_CSS.contains(
            "background: linear-gradient(to bottom, #F8D96C, #E2AA1E) !important;"
        ));
        assert!(FEI_AWAY_DREAM_SKIN_CSS.contains(
            "button[class*=\"navigation-row\"]:has([class~=\"bg-token-foreground\"]) [class*=\"marker\"]"
        ));
        assert!(FEI_AWAY_DREAM_SKIN_CSS.contains(
            "background: color-mix(in srgb, var(--dream-sidebar) 88%, var(--dream-surface)) !important;"
        ));
    }

    #[test]
    fn injection_script_exposes_the_fixed_codework_client_product_label() {
        let script = injection_script(57321);

        assert!(script.contains(
            "window.__CODEX_PLUS_PRODUCT_LABEL__ = \"Codework AI客户端\";"
        ));
    }

    #[test]
    fn local_plugin_marketplaces_includes_api_marketplace_snapshot() {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path();
        let marketplace_dir = home
            .join(".tmp")
            .join("plugins")
            .join(".agents")
            .join("plugins");
        let api_plugin_dir = home
            .join(".tmp")
            .join("plugins")
            .join("plugins")
            .join("build-web-apps");
        let remote_marketplace_dir = home
            .join(".tmp")
            .join("plugins-remote")
            .join(".agents")
            .join("plugins");
        let remote_plugin_dir = home
            .join(".tmp")
            .join("plugins-remote")
            .join("plugins")
            .join("product-design");
        std::fs::create_dir_all(&marketplace_dir).unwrap();
        std::fs::create_dir_all(&remote_marketplace_dir).unwrap();
        std::fs::create_dir_all(api_plugin_dir.join(".codex-plugin")).unwrap();
        std::fs::create_dir_all(remote_plugin_dir.join(".codex-plugin")).unwrap();
        std::fs::write(
            marketplace_dir.join("marketplace.json"),
            r#"{"name":"openai-curated","plugins":[{"name":"gmail"}]}"#,
        )
        .unwrap();
        std::fs::write(
            marketplace_dir.join("api_marketplace.json"),
            r#"{"name":"openai-api-curated","plugins":[{"name":"build-web-apps"}]}"#,
        )
        .unwrap();
        std::fs::write(
            remote_marketplace_dir.join("marketplace.json"),
            r#"{"name":"openai-curated-remote","plugins":[{"name":"product-design"}]}"#,
        )
        .unwrap();
        std::fs::write(
            api_plugin_dir.join(".codex-plugin").join("plugin.json"),
            r#"{"interface":{"displayName":"Build Web Apps"}}"#,
        )
        .unwrap();
        std::fs::write(
            remote_plugin_dir.join(".codex-plugin").join("plugin.json"),
            r#"{"interface":{"displayName":"Product Design"}}"#,
        )
        .unwrap();

        let marketplaces = local_plugin_marketplaces_from_home(home);
        let array = marketplaces.as_array().unwrap();

        assert_eq!(array.len(), 3);
        assert_eq!(array[0]["name"].as_str(), Some("openai-curated"));
        assert_eq!(array[1]["name"].as_str(), Some("openai-api-curated"));
        assert_eq!(array[2]["name"].as_str(), Some("openai-curated-remote"));
        assert_eq!(
            array[1]["plugins"][0]["interface"]["displayName"].as_str(),
            Some("Build Web Apps")
        );
        assert_eq!(
            array[2]["plugins"][0]["interface"]["displayName"].as_str(),
            Some("Product Design")
        );
        assert_eq!(
            array[2]["plugins"][0]["marketplaceName"].as_str(),
            Some("openai-curated-remote")
        );
        assert_eq!(
            array[2]["plugins"][0]["marketplacePath"].as_str(),
            Some("openai-curated-remote")
        );
    }
}

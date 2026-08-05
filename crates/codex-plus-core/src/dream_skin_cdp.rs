use anyhow::{bail, ensure};
use url::Url;

use crate::dream_skin::EngineThemeRequest;

/// Validates a page target before the Dream Skin runtime is sent over CDP.
/// Only the launched loopback browser on the expected port is in scope.
pub fn validate_dream_skin_websocket_url(value: &str, expected_port: u16) -> anyhow::Result<Url> {
    let url = Url::parse(value).map_err(|_| anyhow::anyhow!("Dream Skin websocket URL is invalid"))?;
    ensure!(url.scheme() == "ws", "Dream Skin websocket scheme is invalid");
    ensure!(url.username().is_empty() && url.password().is_none(), "Dream Skin websocket credentials are invalid");
    ensure!(url.host_str().is_some_and(|host| host == "127.0.0.1" || host == "::1"), "Dream Skin websocket host is not loopback");
    ensure!(url.port() == Some(expected_port), "Dream Skin websocket port is invalid");
    ensure!(url.query().is_none() && url.fragment().is_none(), "Dream Skin websocket URL extras are invalid");

    let parts: Vec<_> = url.path_segments().ok_or_else(|| anyhow::anyhow!("Dream Skin websocket path is invalid"))?.collect();
    if parts.len() != 3 || parts[0] != "devtools" || parts[1] != "page" || parts[2].is_empty() {
        bail!("Dream Skin websocket target is not a page");
    }
    Ok(url)
}

/// Creates the early document script used by CDP. The generation guard ensures an
/// old renderer cannot keep styling a page after a new authorized theme is applied.
pub fn dream_skin_early_payload(revision: &str, payload_json: &str) -> String {
    let revision = serde_json::to_string(revision).expect("Dream Skin revision serializes");
    let payload = serde_json::to_string(payload_json).expect("Dream Skin payload serializes");
    format!(
        "(() => {{ const generation = {revision}; if (window.__CODEWORK_DREAM_SKIN_GENERATION__ !== generation) {{ window.restoreCodeworkDreamSkin?.(); }} window.__CODEWORK_DREAM_SKIN_GENERATION__ = generation; window.__CODEWORK_DREAM_SKIN_EARLY_PAYLOAD__ = {payload}; }})();"
    )
}

/// Binds a renderer payload to the monotonic generation managed by Codework.
/// A delayed response from an older theme can therefore only clean itself up;
/// it can never become the active renderer again.
pub fn dream_skin_early_payload_for_request(
    request: &EngineThemeRequest,
    payload_json: &str,
) -> String {
    let generation = request.generation;
    let payload = serde_json::to_string(payload_json).expect("Dream Skin payload serializes");
    format!(
        "(() => {{ const generation = {generation}; if (window.__CODEWORK_DREAM_SKIN_GENERATION__ !== generation) {{ window.restoreCodeworkDreamSkin?.(); }} window.__CODEWORK_DREAM_SKIN_GENERATION__ = generation; window.__CODEX_PLUS_DREAM_SKIN_EARLY_PAYLOAD__ = {payload}; }})();"
    )
}

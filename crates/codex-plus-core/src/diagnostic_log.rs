use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

static TEST_LOG_PATH: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DiagnosticRecord {
    timestamp_ms: u64,
    pid: u32,
    event: String,
    detail: Value,
}

pub fn append_diagnostic_log(event: &str, detail: impl Serialize) -> std::io::Result<()> {
    let path = diagnostic_log_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let detail = serde_json::to_value(detail).unwrap_or_else(|error| {
        json!({
            "serialization_error": error.to_string()
        })
    });
    let record = DiagnosticRecord {
        timestamp_ms: now_ms(),
        pid: std::process::id(),
        event: event.to_string(),
        detail,
    };
    let line = serde_json::to_string(&record).unwrap_or_else(|error| {
        json!({
            "timestamp_ms": now_ms(),
            "pid": std::process::id(),
            "event": "diagnostic_log.serialization_failed",
            "detail": {
                "message": error.to_string()
            }
        })
        .to_string()
    });

    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)?;
    writeln!(file, "{line}")?;
    Ok(())
}

pub fn diagnostic_log_path() -> PathBuf {
    if let Some(lock) = TEST_LOG_PATH.get() {
        if let Ok(guard) = lock.lock() {
            if let Some(path) = &*guard {
                return path.clone();
            }
        }
    }
    crate::paths::default_diagnostic_log_path()
}

#[doc(hidden)]
pub fn set_diagnostic_log_path_for_tests(path: Option<PathBuf>) {
    let lock = TEST_LOG_PATH.get_or_init(|| Mutex::new(None));
    *lock.lock().expect("test log path lock poisoned") = path;
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DreamSkinRuntimeEvent {
    pub state: String,
    pub theme_id: String,
    pub message: Option<String>,
    pub timestamp_ms: u64,
}

pub fn latest_dream_skin_runtime_event(
    theme_id: &str,
    max_age_ms: u64,
) -> Option<DreamSkinRuntimeEvent> {
    let contents = std::fs::read_to_string(diagnostic_log_path()).ok()?;
    let now = now_ms();
    for line in contents.lines().rev() {
        let Ok(record) = serde_json::from_str::<DiagnosticRecord>(line) else {
            continue;
        };
        if now.saturating_sub(record.timestamp_ms) > max_age_ms {
            continue;
        }
        let state = match record.event.as_str() {
            "renderer.dream_skin_applied" => "active",
            "renderer.dream_skin_apply_failed" => "failed",
            _ => continue,
        };
        let detail = record.detail.get("detail").and_then(Value::as_object);
        let event_theme_id = detail
            .and_then(|value| value.get("themeId"))
            .and_then(Value::as_str)
            .unwrap_or_default();
        if event_theme_id != theme_id {
            continue;
        }
        let message = detail
            .and_then(|value| value.get("message"))
            .and_then(Value::as_str)
            .map(str::to_string);
        return Some(DreamSkinRuntimeEvent {
            state: state.to_string(),
            theme_id: event_theme_id.to_string(),
            message,
            timestamp_ms: record.timestamp_ms,
        });
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn latest_dream_skin_runtime_event_returns_the_newest_matching_renderer_event() {
        let dir = tempfile::tempdir().unwrap();
        set_diagnostic_log_path_for_tests(Some(dir.path().join("diagnostics.log")));
        append_diagnostic_log(
            "renderer.dream_skin_apply_failed",
            json!({ "detail": { "themeId": "old-theme", "message": "old" } }),
        )
        .unwrap();
        append_diagnostic_log(
            "renderer.dream_skin_applied",
            json!({ "detail": { "themeId": "custom-dream-skin" } }),
        )
        .unwrap();

        let event = latest_dream_skin_runtime_event("custom-dream-skin", 60_000).unwrap();
        assert_eq!(event.state, "active");
        assert_eq!(event.theme_id, "custom-dream-skin");
        set_diagnostic_log_path_for_tests(None);
    }
}

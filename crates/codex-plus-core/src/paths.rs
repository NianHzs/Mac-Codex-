use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

const APP_STATE_DIR: &str = crate::branding::STATE_DIR;
const SETTINGS_FILE: &str = "settings.json";
const LATEST_STATUS_FILE: &str = "latest-status.json";
const DIAGNOSTIC_LOG_FILE: &str = "codex-plus.log";
const PENDING_PROVIDER_IMPORT_FILE: &str = "pending-provider-import.json";
const PENDING_CLIENT_UPDATE_FILE: &str = "pending-client-update.json";
const UPDATE_CONFIRMATION_FILE: &str = "update-start-confirmed.json";
const UPDATE_ROLLBACK_FILE: &str = "update-rollback.json";

pub fn default_app_state_dir() -> PathBuf {
    if let Some(home_dir) = directories::BaseDirs::new().map(|dirs| dirs.home_dir().to_path_buf()) {
        return home_dir.join(APP_STATE_DIR);
    }

    PathBuf::from(APP_STATE_DIR)
}

pub fn default_settings_path() -> PathBuf {
    if let Some(path) = settings_path_for_tests() {
        return path;
    }
    default_app_state_dir().join(SETTINGS_FILE)
}

pub fn default_latest_status_path() -> PathBuf {
    default_app_state_dir().join(LATEST_STATUS_FILE)
}

pub fn default_diagnostic_log_path() -> PathBuf {
    default_app_state_dir().join(DIAGNOSTIC_LOG_FILE)
}

pub fn default_pending_provider_import_path() -> PathBuf {
    default_app_state_dir().join(PENDING_PROVIDER_IMPORT_FILE)
}

pub fn default_pending_client_update_path() -> PathBuf {
    default_app_state_dir().join(PENDING_CLIENT_UPDATE_FILE)
}

pub fn default_update_confirmation_path() -> PathBuf {
    default_app_state_dir().join(UPDATE_CONFIRMATION_FILE)
}

pub fn default_update_rollback_path() -> PathBuf {
    default_app_state_dir().join(UPDATE_ROLLBACK_FILE)
}

fn settings_path_for_tests() -> Option<PathBuf> {
    SETTINGS_PATH_FOR_TESTS
        .get_or_init(|| Mutex::new(None))
        .lock()
        .ok()
        .and_then(|path| path.clone())
}

static SETTINGS_PATH_FOR_TESTS: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();

pub fn set_settings_path_for_tests(path: Option<PathBuf>) -> Option<PathBuf> {
    SETTINGS_PATH_FOR_TESTS
        .get_or_init(|| Mutex::new(None))
        .lock()
        .ok()
        .and_then(|mut current| std::mem::replace(&mut *current, path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_path_uses_app_state_directory() {
        let path = default_settings_path();

        assert!(path.ends_with(".codework-codex-plus-plus/settings.json"));
    }

    #[test]
    fn default_latest_status_path_uses_app_state_directory() {
        let path = default_latest_status_path();

        assert!(path.ends_with(".codework-codex-plus-plus/latest-status.json"));
    }

    #[test]
    fn default_diagnostic_log_path_uses_app_state_directory() {
        let path = default_diagnostic_log_path();

        assert!(path.ends_with(".codework-codex-plus-plus/codex-plus.log"));
    }

    #[test]
    fn default_pending_provider_import_path_uses_app_state_directory() {
        let path = default_pending_provider_import_path();

        assert!(path.ends_with(".codework-codex-plus-plus/pending-provider-import.json"));
    }

    #[test]
    fn default_pending_client_update_path_uses_app_state_directory() {
        let path = default_pending_client_update_path();

        assert!(path.ends_with(".codework-codex-plus-plus/pending-client-update.json"));
    }

    #[test]
    fn update_confirmation_and_rollback_paths_use_app_state_directory() {
        assert!(
            default_update_confirmation_path()
                .ends_with(".codework-codex-plus-plus/update-start-confirmed.json")
        );
        assert!(
            default_update_rollback_path()
                .ends_with(".codework-codex-plus-plus/update-rollback.json")
        );
    }
}

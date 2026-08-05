use std::path::PathBuf;

const ACTIVE_IDENTITY_ICON_FILE: &str = "codework-active-identity.ico";
const ACTIVE_IDENTITY_ICON_POINTER_FILE: &str = "codework-active-identity.txt";

pub fn icon_name_for_role(role: &str) -> &'static str {
    match role.trim().to_ascii_lowercase().as_str() {
        "administrator" => "identity-administrator.ico",
        "founder" => "identity-founder.ico",
        "director" => "identity-director.ico",
        "vip" => "identity-vip.ico",
        _ => "identity-supreme.ico",
    }
}

/// Windows caches icons by their resource path.  Each membership role therefore
/// receives its own stable path instead of overwriting one shared ICO file.
pub fn materialized_icon_file_name_for_role(role: &str) -> &'static str {
    match role.trim().to_ascii_lowercase().as_str() {
        "administrator" => "codework-identity-administrator.ico",
        "founder" => "codework-identity-founder.ico",
        "director" => "codework-identity-director.ico",
        "vip" => "codework-identity-vip.ico",
        _ => "codework-identity-supreme.ico",
    }
}

pub fn role_from_materialized_icon_file_name(file_name: &str) -> Option<&'static str> {
    match file_name.trim().to_ascii_lowercase().as_str() {
        "codework-identity-administrator.ico" => Some("administrator"),
        "codework-identity-founder.ico" => Some("founder"),
        "codework-identity-director.ico" => Some("director"),
        "codework-identity-supreme.ico" => Some("supreme"),
        "codework-identity-vip.ico" => Some("vip"),
        _ => None,
    }
}

pub fn active_role() -> &'static str {
    let pointer = crate::paths::default_app_state_dir().join(ACTIVE_IDENTITY_ICON_POINTER_FILE);
    std::fs::read_to_string(pointer)
        .ok()
        .and_then(|file_name| role_from_materialized_icon_file_name(&file_name))
        .unwrap_or("guest")
}

pub fn materialize_icon_for_role(role: &str) -> anyhow::Result<PathBuf> {
    let state_dir = crate::paths::default_app_state_dir();
    let destination = state_dir.join(materialized_icon_file_name_for_role(role));
    let parent = destination.parent().ok_or_else(|| anyhow::anyhow!("identity icon path has no parent"))?;
    std::fs::create_dir_all(parent)?;
    std::fs::write(&destination, icon_bytes_for_role(role))?;
    std::fs::write(
        state_dir.join(ACTIVE_IDENTITY_ICON_POINTER_FILE),
        materialized_icon_file_name_for_role(role),
    )?;
    Ok(destination)
}

pub fn active_icon_path() -> Option<PathBuf> {
    let state_dir = crate::paths::default_app_state_dir();
    let pointer = state_dir.join(ACTIVE_IDENTITY_ICON_POINTER_FILE);
    if let Ok(file_name) = std::fs::read_to_string(pointer) {
        let file_name = file_name.trim();
        if !file_name.is_empty() && !file_name.contains(['/', '\\']) {
            let path = state_dir.join(file_name);
            if path.is_file() {
                return Some(path);
            }
        }
    }

    // Keep existing installations working until their first identity sync.
    let legacy_path = state_dir.join(ACTIVE_IDENTITY_ICON_FILE);
    legacy_path.is_file().then_some(legacy_path)
}

fn icon_bytes_for_role(role: &str) -> &'static [u8] {
    match icon_name_for_role(role) {
        "identity-administrator.ico" => include_bytes!("../assets/identity-icons/identity-administrator.ico"),
        "identity-founder.ico" => include_bytes!("../assets/identity-icons/identity-founder.ico"),
        "identity-director.ico" => include_bytes!("../assets/identity-icons/identity-director.ico"),
        "identity-vip.ico" => include_bytes!("../assets/identity-icons/identity-vip.ico"),
        _ => include_bytes!("../assets/identity-icons/identity-supreme.ico"),
    }
}

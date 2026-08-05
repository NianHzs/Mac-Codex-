use codex_plus_core::secret_store::{MEMBER_ACCESS_TOKEN_SECRET, SecretBackend, WindowsSecretBackend};
use serde::Serialize;

use crate::commands::{CommandResult, failed, ok};

const MEMBER_USERNAME_SECRET: &str = "member/username";
const MEMBER_PASSWORD_SECRET: &str = "member/password";

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberSessionPayload {
    pub access_token: String,
    pub username: String,
    pub password: String,
    pub remember_password: bool,
}

#[tauri::command]
pub fn load_member_session() -> CommandResult<MemberSessionPayload> {
    let backend = WindowsSecretBackend::default();
    match load_member_session_with_backend(&backend) {
        Ok(payload) => ok("会员登录状态已读取。", payload),
        Err(error) => failed(
            &format!("会员登录状态读取失败：{error}"),
            MemberSessionPayload::default(),
        ),
    }
}

#[tauri::command]
pub fn save_member_session(
    access_token: String,
    username: String,
    password: String,
    remember_password: bool,
) -> CommandResult<MemberSessionPayload> {
    let backend = WindowsSecretBackend::default();
    match save_member_session_with_backend(
        &backend,
        &access_token,
        &username,
        &password,
        remember_password,
    ) {
        Ok(payload) => ok("会员登录状态已安全保存。", payload),
        Err(error) => failed(
            &format!("会员登录状态保存失败：{error}"),
            MemberSessionPayload::default(),
        ),
    }
}

#[tauri::command]
pub fn clear_member_session() -> CommandResult<MemberSessionPayload> {
    let backend = WindowsSecretBackend::default();
    match clear_member_session_with_backend(&backend) {
        Ok(payload) => ok("会员登录状态已清除。", payload),
        Err(error) => failed(
            &format!("会员登录状态清除失败：{error}"),
            MemberSessionPayload::default(),
        ),
    }
}

pub(crate) fn load_member_session_with_backend(
    backend: &dyn SecretBackend,
) -> anyhow::Result<MemberSessionPayload> {
    let access_token = backend
        .get(MEMBER_ACCESS_TOKEN_SECRET)?
        .unwrap_or_default();
    let username = backend.get(MEMBER_USERNAME_SECRET)?.unwrap_or_default();
    let password = backend.get(MEMBER_PASSWORD_SECRET)?.unwrap_or_default();
    Ok(MemberSessionPayload {
        access_token,
        username,
        remember_password: !password.is_empty(),
        password,
    })
}

fn save_member_session_with_backend(
    backend: &dyn SecretBackend,
    access_token: &str,
    username: &str,
    password: &str,
    remember_password: bool,
) -> anyhow::Result<MemberSessionPayload> {
    let access_token = access_token.trim();
    let username = username.trim();
    anyhow::ensure!(!access_token.is_empty(), "访问令牌不能为空");
    anyhow::ensure!(!username.is_empty(), "用户名不能为空");
    if remember_password {
        anyhow::ensure!(!password.is_empty(), "记住密码时密码不能为空");
    }

    backend.set(MEMBER_ACCESS_TOKEN_SECRET, access_token)?;
    backend.set(MEMBER_USERNAME_SECRET, username)?;
    if remember_password {
        backend.set(MEMBER_PASSWORD_SECRET, password)?;
    } else {
        backend.delete(MEMBER_PASSWORD_SECRET)?;
    }
    load_member_session_with_backend(backend)
}

fn clear_member_session_with_backend(
    backend: &dyn SecretBackend,
) -> anyhow::Result<MemberSessionPayload> {
    crate::relay_tokens::clear_all_relay_tokens_with_backend(backend)?;
    backend.delete(MEMBER_ACCESS_TOKEN_SECRET)?;
    backend.delete(MEMBER_USERNAME_SECRET)?;
    backend.delete(MEMBER_PASSWORD_SECRET)?;
    Ok(MemberSessionPayload::default())
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use codex_plus_core::secret_store::{MemorySecretBackend, SecretBackend};

    use super::{
        clear_member_session_with_backend, load_member_session_with_backend,
        save_member_session_with_backend,
    };

    #[test]
    fn protected_member_session_remembers_password_only_when_requested() {
        let backend: Arc<dyn SecretBackend> = Arc::new(MemorySecretBackend::default());

        let saved = save_member_session_with_backend(
            backend.as_ref(),
            "access-token",
            "saleAdmin",
            "password-value",
            false,
        )
        .unwrap();
        assert_eq!(saved.access_token, "access-token");
        assert_eq!(saved.username, "saleAdmin");
        assert_eq!(saved.password, "");
        assert!(!saved.remember_password);

        let remembered = save_member_session_with_backend(
            backend.as_ref(),
            "new-access-token",
            "saleAdmin",
            "remembered-password",
            true,
        )
        .unwrap();
        assert_eq!(remembered.password, "remembered-password");
        assert!(remembered.remember_password);
        assert_eq!(load_member_session_with_backend(backend.as_ref()).unwrap(), remembered);

        let cleared = clear_member_session_with_backend(backend.as_ref()).unwrap();
        assert!(cleared.access_token.is_empty());
        assert!(load_member_session_with_backend(backend.as_ref())
            .unwrap()
            .access_token
            .is_empty());
    }
}

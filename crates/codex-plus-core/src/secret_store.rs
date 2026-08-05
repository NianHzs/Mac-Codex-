use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

const WINDOWS_CREDENTIAL_SERVICE: &str = "Codework AI客户端";
const SECRET_INVENTORY_FILE: &str = "secret-inventory.json";
pub const MEMBER_ACCESS_TOKEN_SECRET: &str = "member/access-token";

pub trait SecretBackend: Send + Sync {
    fn set(&self, key: &str, value: &str) -> anyhow::Result<()>;
    fn get(&self, key: &str) -> anyhow::Result<Option<String>>;
    fn delete(&self, key: &str) -> anyhow::Result<()>;
    fn list_keys(&self) -> anyhow::Result<Vec<String>>;
}

pub fn resolve_member_access_token(explicit_token: &str) -> anyhow::Result<Option<String>> {
    resolve_member_access_token_with_backend(explicit_token, &WindowsSecretBackend::default())
}

pub fn resolve_member_access_token_with_backend(
    explicit_token: &str,
    backend: &dyn SecretBackend,
) -> anyhow::Result<Option<String>> {
    let explicit_token = explicit_token.trim();
    if !explicit_token.is_empty() {
        return Ok(Some(explicit_token.to_string()));
    }
    Ok(backend
        .get(MEMBER_ACCESS_TOKEN_SECRET)?
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty()))
}

pub struct SecretStore<B: SecretBackend> {
    backend: B,
}

impl<B: SecretBackend> SecretStore<B> {
    pub fn new(backend: B) -> Self {
        Self { backend }
    }

    pub fn set(&self, key: &str, value: &str) -> anyhow::Result<()> {
        validate_secret_key(key)?;
        anyhow::ensure!(!value.is_empty(), "秘密值不能为空");
        self.backend.set(key.trim(), value)
    }

    pub fn get(&self, key: &str) -> anyhow::Result<Option<String>> {
        validate_secret_key(key)?;
        self.backend.get(key.trim())
    }

    pub fn delete(&self, key: &str) -> anyhow::Result<()> {
        validate_secret_key(key)?;
        self.backend.delete(key.trim())
    }

    pub fn inventory(&self) -> anyhow::Result<Vec<String>> {
        let mut keys = self.backend.list_keys()?;
        keys.sort();
        keys.dedup();
        Ok(keys)
    }
}

fn validate_secret_key(key: &str) -> anyhow::Result<()> {
    let key = key.trim();
    anyhow::ensure!(!key.is_empty(), "秘密键名不能为空");
    anyhow::ensure!(key.len() <= 160, "秘密键名过长");
    anyhow::ensure!(
        key.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'/' | b'.' | b'_' | b'-')
        }),
        "秘密键名包含不支持的字符"
    );
    Ok(())
}

#[derive(Default)]
pub struct MemorySecretBackend {
    values: Mutex<BTreeMap<String, String>>,
}

impl SecretBackend for MemorySecretBackend {
    fn set(&self, key: &str, value: &str) -> anyhow::Result<()> {
        self.values
            .lock()
            .map_err(|_| anyhow::anyhow!("内存秘密存储锁已损坏"))?
            .insert(key.to_string(), value.to_string());
        Ok(())
    }

    fn get(&self, key: &str) -> anyhow::Result<Option<String>> {
        Ok(self
            .values
            .lock()
            .map_err(|_| anyhow::anyhow!("内存秘密存储锁已损坏"))?
            .get(key)
            .cloned())
    }

    fn delete(&self, key: &str) -> anyhow::Result<()> {
        self.values
            .lock()
            .map_err(|_| anyhow::anyhow!("内存秘密存储锁已损坏"))?
            .remove(key);
        Ok(())
    }

    fn list_keys(&self) -> anyhow::Result<Vec<String>> {
        Ok(self
            .values
            .lock()
            .map_err(|_| anyhow::anyhow!("内存秘密存储锁已损坏"))?
            .keys()
            .cloned()
            .collect())
    }
}

pub struct WindowsSecretBackend {
    inventory_path: PathBuf,
    inventory_lock: Mutex<()>,
}

impl Default for WindowsSecretBackend {
    fn default() -> Self {
        Self::new(crate::paths::default_app_state_dir().join(SECRET_INVENTORY_FILE))
    }
}

impl WindowsSecretBackend {
    pub fn new(inventory_path: PathBuf) -> Self {
        Self {
            inventory_path,
            inventory_lock: Mutex::new(()),
        }
    }

    #[cfg(windows)]
    fn entry(&self, key: &str) -> anyhow::Result<keyring::Entry> {
        Ok(keyring::Entry::new(WINDOWS_CREDENTIAL_SERVICE, key)?)
    }

    fn update_inventory(&self, key: &str, present: bool) -> anyhow::Result<()> {
        let _guard = self
            .inventory_lock
            .lock()
            .map_err(|_| anyhow::anyhow!("秘密清单锁已损坏"))?;
        let mut keys: BTreeSet<String> = read_secret_inventory(&self.inventory_path)?
            .into_iter()
            .collect();
        if present {
            keys.insert(key.to_string());
        } else {
            keys.remove(key);
        }
        write_secret_inventory(&self.inventory_path, keys.into_iter().collect())
    }
}

#[cfg(windows)]
impl SecretBackend for WindowsSecretBackend {
    fn set(&self, key: &str, value: &str) -> anyhow::Result<()> {
        self.entry(key)?.set_password(value)?;
        if let Err(error) = self.update_inventory(key, true) {
            let _ = self.entry(key)?.delete_credential();
            return Err(error);
        }
        Ok(())
    }

    fn get(&self, key: &str) -> anyhow::Result<Option<String>> {
        match self.entry(key)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(error.into()),
        }
    }

    fn delete(&self, key: &str) -> anyhow::Result<()> {
        match self.entry(key)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => self.update_inventory(key, false),
            Err(error) => Err(error.into()),
        }
    }

    fn list_keys(&self) -> anyhow::Result<Vec<String>> {
        let _guard = self
            .inventory_lock
            .lock()
            .map_err(|_| anyhow::anyhow!("秘密清单锁已损坏"))?;
        read_secret_inventory(&self.inventory_path)
    }
}

#[cfg(not(windows))]
impl SecretBackend for WindowsSecretBackend {
    fn set(&self, _key: &str, _value: &str) -> anyhow::Result<()> {
        anyhow::bail!("当前平台不支持 Windows 安全凭据存储")
    }

    fn get(&self, _key: &str) -> anyhow::Result<Option<String>> {
        anyhow::bail!("当前平台不支持 Windows 安全凭据存储")
    }

    fn delete(&self, _key: &str) -> anyhow::Result<()> {
        anyhow::bail!("当前平台不支持 Windows 安全凭据存储")
    }

    fn list_keys(&self) -> anyhow::Result<Vec<String>> {
        anyhow::bail!("当前平台不支持 Windows 安全凭据存储")
    }
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SecretInventory {
    #[serde(default)]
    keys: Vec<String>,
}

fn read_secret_inventory(path: &Path) -> anyhow::Result<Vec<String>> {
    match std::fs::read_to_string(path) {
        Ok(contents) => Ok(serde_json::from_str::<SecretInventory>(&contents)?.keys),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(error.into()),
    }
}

fn write_secret_inventory(path: &Path, keys: Vec<String>) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let temporary_path = path.with_extension("json.tmp");
    let contents = serde_json::to_string_pretty(&SecretInventory { keys })?;
    std::fs::write(&temporary_path, format!("{contents}\n"))?;
    if path.exists() {
        std::fs::remove_file(path)?;
    }
    std::fs::rename(temporary_path, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        MEMBER_ACCESS_TOKEN_SECRET, MemorySecretBackend, SecretBackend, SecretStore,
        resolve_member_access_token_with_backend,
    };

    #[test]
    fn secret_store_sets_gets_and_deletes_without_returning_values_in_inventory() {
        let backend = MemorySecretBackend::default();
        let store = SecretStore::new(backend);

        store.set("member/access-token", "token-value").unwrap();

        assert_eq!(
            store.get("member/access-token").unwrap().as_deref(),
            Some("token-value")
        );
        assert_eq!(
            store.inventory().unwrap(),
            vec!["member/access-token".to_string()]
        );

        store.delete("member/access-token").unwrap();

        assert_eq!(store.get("member/access-token").unwrap(), None);
    }

    #[test]
    fn visual_theme_auth_falls_back_to_the_saved_member_session() {
        let backend = MemorySecretBackend::default();
        backend.set(MEMBER_ACCESS_TOKEN_SECRET, "saved-member-token").unwrap();

        assert_eq!(
            resolve_member_access_token_with_backend("theme-specific-token", &backend)
                .unwrap()
                .as_deref(),
            Some("theme-specific-token")
        );
        assert_eq!(
            resolve_member_access_token_with_backend("", &backend)
                .unwrap()
                .as_deref(),
            Some("saved-member-token")
        );
        backend.delete(MEMBER_ACCESS_TOKEN_SECRET).unwrap();
        assert_eq!(resolve_member_access_token_with_backend("", &backend).unwrap(), None);
    }
}

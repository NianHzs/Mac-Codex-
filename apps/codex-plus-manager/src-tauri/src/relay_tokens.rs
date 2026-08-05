use codex_plus_core::secret_store::SecretBackend;
use codex_plus_core::settings::{BackendSettings, RelayMode, RelayProfile, RelayProtocol};
use codex_plus_core::secret_store::WindowsSecretBackend;
use codex_plus_core::settings::SettingsStore;
use reqwest::header::{COOKIE, SET_COOKIE};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

const RELAY_TOKEN_SECRET_PREFIX: &str = "relay-token";
const RELAY_TOKEN_META_PREFIX: &str = "relay-token-meta";
const RELAY_TOKEN_CACHE_FILE: &str = "relay-token-cache.json";
const GPTPROXY_API_ROOT: &str = "https://gptproxy.site";
const CLIENT_RELAY_GROUPS: [&str; 3] = ["gpt-pro-额度计费", "gpt-额度计费", "临时低价分组"];

/// 客户端接管的分组：GPT 分组走硬编码白名单，国产模型 0.5X 分组走特征识别
/// （分组名关键字 + 模型 id），避免中转站后台改名后整条链路失效。
fn is_client_relay_group(metadata: &RelayTokenMetadata) -> bool {
    if CLIENT_RELAY_GROUPS.contains(&metadata.group.as_str()) {
        return true;
    }
    codex_plus_core::workbuddy::is_domestic_relay_group(&metadata.group, &metadata.models)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayTokenMetadata {
    pub id: String,
    pub name: String,
    pub active: bool,
    pub remain_quota: i64,
    pub used_quota: i64,
    pub unlimited_quota: bool,
    pub expired_time: i64,
    pub group: String,
    pub masked_key: String,
    #[serde(default)]
    pub models: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayTokenSyncSummary {
    pub refreshed_at_ms: u64,
    pub total_count: usize,
    pub usable_count: usize,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayWalletBalance {
    pub display: String,
    pub refreshed_at_ms: u64,
}

impl RelayTokenSyncSummary {
    fn from_tokens(tokens: &[RelayTokenMetadata]) -> Self {
        let now_seconds = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs() as i64)
            .unwrap_or_default();
        let refreshed_at_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis() as u64)
            .unwrap_or_default();
        Self::from_tokens_at(tokens, now_seconds, refreshed_at_ms)
    }

    fn from_tokens_at(tokens: &[RelayTokenMetadata], now_seconds: i64, refreshed_at_ms: u64) -> Self {
        Self {
            refreshed_at_ms,
            total_count: tokens.len(),
            usable_count: tokens
                .iter()
                .filter(|token| token.active && (token.expired_time <= 0 || token.expired_time > now_seconds))
                .count(),
        }
    }
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

fn wallet_balance_from_remote_payloads(
    profile: &Value,
    status: &Value,
    refreshed_at_ms: u64,
) -> anyhow::Result<RelayWalletBalance> {
    let quota = json_number_at_paths(profile, &[
        &["data", "quota"],
        &["data", "user", "quota"],
        &["user", "quota"],
        &["quota"],
    ])
    .ok_or_else(|| anyhow::anyhow!("中转站账户未返回钱包额度"))?;
    let quota_per_unit = json_number_at_paths(status, &[
        &["data", "quota_per_unit"],
        &["quota_per_unit"],
    ])
    .filter(|value| *value > 0.0)
    .ok_or_else(|| anyhow::anyhow!("中转站状态未返回有效额度单位"))?;
    let display_type = json_text_at_paths(status, &[
        &["data", "quota_display_type"],
        &["quota_display_type"],
    ])
    .to_ascii_uppercase();
    let (symbol, exchange_rate) = match display_type.as_str() {
        "CNY" => (
            "¥",
            json_number_at_paths(status, &[
                &["data", "usd_exchange_rate"],
                &["usd_exchange_rate"],
            ])
            .filter(|value| *value > 0.0)
            .ok_or_else(|| anyhow::anyhow!("中转站状态未返回人民币换算参数"))?,
        ),
        "CUSTOM" => (
            "",
            json_number_at_paths(status, &[
                &["data", "custom_currency_exchange_rate"],
                &["custom_currency_exchange_rate"],
            ])
            .filter(|value| *value > 0.0)
            .ok_or_else(|| anyhow::anyhow!("中转站状态未返回自定义货币换算参数"))?,
        ),
        "TOKENS" => ("", 1.0),
        _ => ("$", 1.0),
    };
    let amount = quota / quota_per_unit * exchange_rate;
    anyhow::ensure!(amount.is_finite() && amount >= 0.0, "中转站钱包额度无效");
    let custom_symbol = json_text_at_paths(status, &[
        &["data", "custom_currency_symbol"],
        &["custom_currency_symbol"],
    ]);
    let symbol = if display_type == "CUSTOM" { custom_symbol.as_str() } else { symbol };
    let display = if display_type == "TOKENS" {
        format!("{:.0}", amount)
    } else {
        format!("{symbol}{amount:.2}")
    };
    Ok(RelayWalletBalance { display, refreshed_at_ms })
}

fn relay_sync_success_message(wallet_available: bool) -> &'static str {
    if wallet_available {
        "中转站令牌与钱包余额已安全同步。"
    } else {
        "中转站令牌已安全同步；钱包余额暂时无法读取，请稍后刷新。"
    }
}

fn relay_sync_failure_message(error: &anyhow::Error) -> String {
    let detail = error.to_string();
    if detail.contains("中转站登录失败") {
        "中转站账号或密码校验未通过；请确认客户端登录账号与中转站账号一致后重试。".to_string()
    } else if detail.contains("令牌接口") || detail.contains("读取令牌完整密钥") {
        "中转站已登录，但令牌列表暂时无法读取；请稍后点击“刷新令牌”重试。".to_string()
    } else if detail.contains("账户接口") {
        "中转站登录已完成，但账户资料暂时无法读取；请稍后点击“刷新令牌”重试。".to_string()
    } else {
        format!("中转站令牌同步失败：{detail}")
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayTokenSyncPayload {
    pub account_id: String,
    pub tokens: Vec<RelayTokenMetadata>,
    #[serde(default)]
    pub summary: RelayTokenSyncSummary,
    #[serde(default)]
    pub wallet: Option<RelayWalletBalance>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayTokenConnectionPayload {
    pub latency_ms: u128,
    pub status_code: u16,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayTokenApplyPayload {
    pub profile_id: String,
    pub config_path: String,
    pub backup_path: Option<String>,
    pub configured: bool,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbuddyConfigPayload {
    /// 本次同步进 models.json 的模型 id（含新增与更新）。
    pub synced_models: Vec<String>,
    pub added: Vec<String>,
    pub updated: Vec<String>,
    pub unchanged: Vec<String>,
    pub config_path: String,
    pub backup_path: Option<String>,
    pub installed: bool,
    pub launched: bool,
    pub executable_path: Option<String>,
    pub download_url: Option<String>,
    /// 安装/启动环节需要提示给用户的补充说明。
    pub launch_message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct RemoteSession {
    account_id: String,
    access_token: String,
    cookie: String,
}

#[tauri::command]
pub async fn sync_relay_tokens(
    username: Option<String>,
    password: Option<String>,
) -> crate::commands::CommandResult<RelayTokenSyncPayload> {
    let backend = WindowsSecretBackend::default();
    let (username, password) = match (username.unwrap_or_default(), password.unwrap_or_default()) {
        (username, password) if !username.trim().is_empty() && !password.is_empty() => {
            (username.trim().to_string(), password)
        }
        _ => match crate::member_session::load_member_session_with_backend(&backend) {
            Ok(session) if !session.username.trim().is_empty() && !session.password.is_empty() => {
                (session.username, session.password)
            }
            Ok(_) => {
                return crate::commands::failed(
                    "请重新登录并勾选“记住密码”，才能安全同步中转站令牌。",
                    RelayTokenSyncPayload { account_id: String::new(), tokens: Vec::new(), ..RelayTokenSyncPayload::default() },
                );
            }
            Err(_) => {
                return crate::commands::failed(
                    "无法读取本机登录凭据，请重新登录后再试。",
                    RelayTokenSyncPayload { account_id: String::new(), tokens: Vec::new(), ..RelayTokenSyncPayload::default() },
                );
            }
        },
    };

    match fetch_remote_token_items(&username, &password).await {
        Ok((account_id, items, wallet)) => match store_tokens_with_backend(&backend, &account_id, &items) {
            Ok(tokens) => {
                let payload = RelayTokenSyncPayload {
                    account_id,
                    summary: RelayTokenSyncSummary::from_tokens(&tokens),
                    tokens,
                    wallet,
                };
                match store_cached_tokens(&payload) {
                    Ok(()) => crate::commands::ok(relay_sync_success_message(payload.wallet.is_some()), payload),
                    Err(_) => crate::commands::failed(
                        "令牌已保存到 Windows 凭据管理器，但无法写入本机列表缓存。",
                        payload,
                    ),
                }
            }
            Err(_) => crate::commands::failed(
                "令牌已读取，但无法保存到 Windows 凭据管理器。",
                RelayTokenSyncPayload { account_id: String::new(), tokens: Vec::new(), ..RelayTokenSyncPayload::default() },
            ),
        },
        Err(error) => crate::commands::failed(
            &relay_sync_failure_message(&error),
            RelayTokenSyncPayload { account_id: String::new(), tokens: Vec::new(), ..RelayTokenSyncPayload::default() },
        ),
    }
}

#[tauri::command]
pub fn load_cached_relay_tokens() -> crate::commands::CommandResult<RelayTokenSyncPayload> {
    match load_cached_tokens() {
        Ok(payload) if !payload.account_id.is_empty() => crate::commands::ok("已载入本机安全缓存的令牌列表。", payload),
        Ok(_) => crate::commands::ok("本机暂未缓存中转站令牌。", RelayTokenSyncPayload::default()),
        Err(_) => crate::commands::failed("无法读取本机令牌缓存，请点击刷新重新同步。", RelayTokenSyncPayload::default()),
    }
}

#[tauri::command]
pub async fn test_relay_token_connection(
    account_id: String,
    token_id: String,
) -> crate::commands::CommandResult<RelayTokenConnectionPayload> {
    let backend = WindowsSecretBackend::default();
    let result = async {
        let account_id = normalize_secret_component(&account_id, "账户 ID")?;
        let token_id = normalize_secret_component(&token_id, "令牌 ID")?;
        let api_key = backend
            .get(&relay_token_secret_key(&account_id, &token_id))?
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .ok_or_else(|| anyhow::anyhow!("本机没有该令牌，请点击刷新重新同步。"))?;
        let token = load_cached_tokens()?
            .tokens
            .into_iter()
            .find(|token| token.id == token_id)
            .ok_or_else(|| anyhow::anyhow!("令牌元数据不存在，请点击刷新令牌。"))?;
        let test_model = relay_token_test_model(&token);
        let profile = RelayProfile {
            id: format!("relay-token-test-{account_id}-{token_id}"),
            name: token.name,
            model: test_model.clone(),
            base_url: format!("{GPTPROXY_API_ROOT}/v1"),
            upstream_base_url: format!("{GPTPROXY_API_ROOT}/v1"),
            api_key,
            protocol: RelayProtocol::Responses,
            relay_mode: RelayMode::PureApi,
            test_model,
            ..RelayProfile::default()
        };
        let started = std::time::Instant::now();
        let result = codex_plus_core::relay_config::test_relay_profile(&profile, &profile.test_model).await?;
        anyhow::ensure!(result.http_status < 400, "上游连接失败 (HTTP {})", result.http_status);
        Ok::<_, anyhow::Error>(RelayTokenConnectionPayload { latency_ms: started.elapsed().as_millis(), status_code: result.http_status })
    }.await;
    match result {
        Ok(payload) => crate::commands::ok("连接正常。", payload),
        Err(error) => crate::commands::failed(
            &format!("连接测试失败：{error}"),
            RelayTokenConnectionPayload::default(),
        ),
    }
}

#[tauri::command]
pub fn apply_relay_token(
    account_id: String,
    token_id: String,
) -> crate::commands::CommandResult<RelayTokenApplyPayload> {
    let backend = WindowsSecretBackend::default();
    let store = SettingsStore::default();
    let result = (|| -> anyhow::Result<RelayTokenApplyPayload> {
        let mut settings = store.load()?;
        settings = apply_relay_token_to_settings_with_backend(&backend, settings, &account_id, &token_id)?;
        let profile = settings
            .relay_profiles
            .iter_mut()
            .find(|profile| profile.id == settings.active_relay_id)
            .ok_or_else(|| anyhow::anyhow!("未找到待应用的中转站令牌配置"))?;
        codex_plus_core::relay_config::normalize_relay_profile_for_storage(profile)?;
        let runtime_profile = profile.clone();
        let common_config = relay_combined_common_config(&settings);
        store.save(&settings)?;

        let home = codex_plus_core::relay_config::default_codex_home_dir();
        let applied = codex_plus_core::relay_config::apply_relay_profile_to_home_with_switch_rules(
            &home,
            &runtime_profile,
            &common_config,
        )?;
        let status = codex_plus_core::relay_config::relay_status_from_home(&home);
        Ok(RelayTokenApplyPayload {
            profile_id: runtime_profile.id,
            config_path: status.config_path,
            backup_path: applied.backup_path,
            configured: status.configured,
        })
    })();

    match result {
        Ok(payload) => crate::commands::ok("已设为当前中转站令牌。", payload),
        Err(_) => crate::commands::failed(
            "应用中转站令牌失败，请刷新令牌后重试。",
            RelayTokenApplyPayload {
                profile_id: String::new(),
                config_path: String::new(),
                backup_path: None,
                configured: false,
            },
        ),
    }
}

const WORKBUDDY_RELAY_BASE_URL: &str = "https://gptproxy.site/v1";

fn relay_token_usable(token: &RelayTokenMetadata, now_seconds: i64) -> bool {
    token.active && (token.expired_time <= 0 || token.expired_time > now_seconds)
}

/// 从缓存令牌里挑出国产分组的可用令牌，取出真实密钥后组装 WorkBuddy 模型配置。
/// 同一个模型只保留第一个可用令牌，避免重复写入。
fn collect_domestic_model_requests(
    backend: &dyn SecretBackend,
    payload: &RelayTokenSyncPayload,
    now_seconds: i64,
) -> anyhow::Result<Vec<codex_plus_core::workbuddy::WorkbuddyModelRequest>> {
    let account_id = normalize_secret_component(&payload.account_id, "账户 ID")?;
    let mut requests: Vec<codex_plus_core::workbuddy::WorkbuddyModelRequest> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    for token in &payload.tokens {
        if !codex_plus_core::workbuddy::is_domestic_relay_group(&token.group, &token.models) {
            continue;
        }
        if !relay_token_usable(token, now_seconds) {
            continue;
        }
        let token_id = match normalize_secret_component(&token.id, "令牌 ID") {
            Ok(value) => value,
            Err(_) => continue,
        };
        let secret_key = relay_token_secret_key(&account_id, &token_id);
        let api_key = match backend.get(&secret_key)? {
            Some(value) if !value.trim().is_empty() => value.trim().to_string(),
            _ => continue,
        };

        // models 为空表示该令牌不限本分组模型，按白名单全量放通。
        let models = codex_plus_core::workbuddy::domestic_relay_models_for_token(
            &token.group,
            &token.models,
        );
        for model in models {
            if !seen.insert(model.clone()) {
                continue;
            }
            requests.push(codex_plus_core::workbuddy::WorkbuddyModelRequest {
                id: model,
                base_url: WORKBUDDY_RELAY_BASE_URL.to_string(),
                api_key: api_key.clone(),
            });
        }
    }

    anyhow::ensure!(
        !requests.is_empty(),
        "未找到可用的国产模型令牌，请先刷新令牌列表"
    );
    Ok(requests)
}

/// 一键把国产模型 0.5X 分组同步进 WorkBuddy，并在检测到安装时顺带启动。
/// 只补齐缺失项、刷新地址与密钥，不覆盖用户已有的自定义配置。
#[tauri::command]
pub fn apply_workbuddy_relay_config() -> crate::commands::CommandResult<WorkbuddyConfigPayload> {
    let backend = WindowsSecretBackend::default();
    let now_seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default();

    let result = (|| -> anyhow::Result<WorkbuddyConfigPayload> {
        let cached = load_cached_tokens()?;
        anyhow::ensure!(
            !cached.account_id.is_empty(),
            "本机暂未缓存中转站令牌，请先刷新令牌列表"
        );
        let requests = collect_domestic_model_requests(&backend, &cached, now_seconds)?;
        let synced = codex_plus_core::workbuddy::sync_models_to_workbuddy(&requests)?;
        let installation = codex_plus_core::workbuddy::detect_workbuddy_installation();
        let launch = codex_plus_core::workbuddy::launch_workbuddy(&installation);

        let mut synced_models = synced.added.clone();
        synced_models.extend(synced.updated.iter().cloned());
        Ok(WorkbuddyConfigPayload {
            synced_models,
            added: synced.added,
            updated: synced.updated,
            unchanged: synced.unchanged,
            config_path: synced.config_path,
            backup_path: synced.backup_path,
            installed: installation.installed,
            launched: launch.launched,
            executable_path: launch.executable_path,
            download_url: launch.download_url,
            launch_message: launch.message,
        })
    })();

    match result {
        Ok(payload) => {
            let message = workbuddy_config_message(&payload);
            crate::commands::ok(&message, payload)
        }
        Err(error) => crate::commands::failed(
            &format!("一键配置 WorkBuddy 失败：{error}"),
            WorkbuddyConfigPayload::default(),
        ),
    }
}

fn workbuddy_config_message(payload: &WorkbuddyConfigPayload) -> String {
    let changed = payload.added.len() + payload.updated.len();
    let head = if changed == 0 {
        "WorkBuddy 已是最新配置，未做改动。".to_string()
    } else {
        format!(
            "已同步 {changed} 个国产模型到 WorkBuddy（新增 {}、更新 {}）。",
            payload.added.len(),
            payload.updated.len()
        )
    };
    let tail = if payload.launched {
        " 已启动 WorkBuddy。"
    } else if payload.installed {
        " WorkBuddy 已安装，但本次未能自动启动，请手动打开。"
    } else {
        " 未检测到 WorkBuddy，请先安装后再打开。"
    };
    format!("{head}{tail}")
}

pub fn mask_token_key(value: &str) -> String {
    let value = value.trim();
    let characters: Vec<char> = value.chars().collect();
    if characters.len() <= 8 {
        return "••••".to_string();
    }
    let prefix: String = characters.iter().take(4).collect();
    let suffix: String = characters
        .iter()
        .rev()
        .take(4)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    format!("{prefix}••••{suffix}")
}

pub fn sanitize_remote_token(value: &Value) -> anyhow::Result<RelayTokenMetadata> {
    let id = json_text(value, "id");
    let key = json_text(value, "key");
    anyhow::ensure!(!id.is_empty(), "令牌缺少 ID");
    anyhow::ensure!(!key.is_empty(), "令牌缺少密钥");

    let name = json_text(value, "name");
    Ok(RelayTokenMetadata {
        id: id.clone(),
        name: if name.is_empty() { format!("令牌 {id}") } else { name },
        active: json_i64(value, "status") == 1,
        remain_quota: json_i64(value, "remain_quota"),
        used_quota: json_i64(value, "used_quota"),
        unlimited_quota: value
            .get("unlimited_quota")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        expired_time: json_i64(value, "expired_time"),
        group: json_text(value, "group"),
        masked_key: mask_token_key(&key),
        models: extract_model_limits(value),
    })
}

pub fn store_tokens_with_backend(
    backend: &dyn SecretBackend,
    account_id: &str,
    tokens: &[Value],
) -> anyhow::Result<Vec<RelayTokenMetadata>> {
    let account_id = normalize_secret_component(account_id, "账户 ID")?;
    let mut stored = Vec::with_capacity(tokens.len());
    for token in tokens {
        let metadata = sanitize_remote_token(token)?;
        if !is_client_relay_group(&metadata) {
            continue;
        }
        let token_id = normalize_secret_component(&metadata.id, "令牌 ID")?;
        let key = json_text(token, "key");
        backend.set(&relay_token_secret_key(&account_id, &token_id), &key)?;
        stored.push(metadata);
    }
    Ok(stored)
}

fn relay_token_test_model(token: &RelayTokenMetadata) -> String {
    token
        .models
        .iter()
        .map(|model| model.trim())
        .find(|model| !model.is_empty())
        .unwrap_or("gpt-5.6-sol")
        .to_string()
}

fn relay_token_cache_path() -> std::path::PathBuf {
    codex_plus_core::paths::default_app_state_dir().join(RELAY_TOKEN_CACHE_FILE)
}

fn load_cached_tokens() -> anyhow::Result<RelayTokenSyncPayload> {
    load_cached_tokens_from_path(&relay_token_cache_path())
}

pub fn load_cached_tokens_from_path(path: &Path) -> anyhow::Result<RelayTokenSyncPayload> {
    match std::fs::read_to_string(path) {
        Ok(raw) => {
            let mut payload: RelayTokenSyncPayload = serde_json::from_str(&raw)?;
            if !payload.tokens.is_empty() && payload.summary.total_count == 0 {
                payload.summary = RelayTokenSyncSummary::from_tokens(&payload.tokens);
            }
            Ok(payload)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(RelayTokenSyncPayload::default()),
        Err(error) => Err(error.into()),
    }
}

fn store_cached_tokens(payload: &RelayTokenSyncPayload) -> anyhow::Result<()> {
    store_cached_payload_to_path(&relay_token_cache_path(), payload)
}

pub fn store_cached_tokens_to_path(
    path: &Path,
    account_id: &str,
    tokens: &[RelayTokenMetadata],
) -> anyhow::Result<()> {
    let account_id = normalize_secret_component(account_id, "账户 ID")?;
    let payload = RelayTokenSyncPayload {
        account_id,
        summary: RelayTokenSyncSummary::from_tokens(tokens),
        tokens: tokens.to_vec(),
        wallet: None,
    };
    store_cached_payload_to_path(path, &payload)
}

fn store_cached_payload_to_path(path: &Path, payload: &RelayTokenSyncPayload) -> anyhow::Result<()> {
    let cached = serde_json::to_vec_pretty(&payload)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let temporary = path.with_extension("json.tmp");
    std::fs::write(&temporary, cached)?;
    if path.exists() {
        std::fs::remove_file(path)?;
    }
    std::fs::rename(temporary, path)?;
    Ok(())
}

pub fn relay_token_secret_key(account_id: &str, token_id: &str) -> String {
    format!("{RELAY_TOKEN_SECRET_PREFIX}/{account_id}/{token_id}")
}

pub(crate) fn clear_all_relay_tokens_with_backend(
    backend: &dyn SecretBackend,
) -> anyhow::Result<()> {
    clear_all_relay_tokens_with_backend_and_cache_path(backend, &relay_token_cache_path())
}

pub(crate) fn clear_all_relay_tokens_with_backend_and_cache_path(
    backend: &dyn SecretBackend,
    cache_path: &Path,
) -> anyhow::Result<()> {
    let prefix = format!("{RELAY_TOKEN_SECRET_PREFIX}/");
    for key in backend.list_keys()? {
        if key.starts_with(&prefix)
            || key.starts_with(&format!("{RELAY_TOKEN_META_PREFIX}/"))
            || key.starts_with("relay/profile/gptproxy-token-") {
            backend.delete(&key)?;
        }
    }
    match std::fs::remove_file(cache_path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    Ok(())
}

pub fn apply_relay_token_to_settings_with_backend(
    backend: &dyn SecretBackend,
    mut settings: BackendSettings,
    account_id: &str,
    token_id: &str,
) -> anyhow::Result<BackendSettings> {
    let account_id = normalize_secret_component(account_id, "账户 ID")?;
    let token_id = normalize_secret_component(token_id, "令牌 ID")?;
    let secret_key = relay_token_secret_key(&account_id, &token_id);
    let api_key = backend
        .get(&secret_key)?
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| anyhow::anyhow!("未找到该令牌，请先刷新令牌列表"))?;
    let profile_id = managed_profile_id(&account_id, &token_id);
    let mut profile = settings
        .relay_profiles
        .iter()
        .find(|profile| profile.id == profile_id)
        .cloned()
        .unwrap_or_else(RelayProfile::default);
    profile.id = profile_id.clone();
    profile.name = format!("gptproxy · 令牌 {token_id}");
    profile.model = "gpt-5.6-sol".to_string();
    profile.base_url = "https://gptproxy.site/v1".to_string();
    profile.upstream_base_url = profile.base_url.clone();
    profile.api_key = api_key;
    profile.protocol = RelayProtocol::Responses;
    profile.relay_mode = RelayMode::PureApi;
    profile.official_mix_api_key = false;
    profile.test_model = "gpt-5.6-sol".to_string();
    if !profile.model_list.lines().any(|model| model.trim() == "gpt-5.6-sol") {
        profile.model_list = format!("gpt-5.6-sol\n{}", profile.model_list.trim());
    }

    if let Some(existing) = settings
        .relay_profiles
        .iter_mut()
        .find(|existing| existing.id == profile_id)
    {
        *existing = profile;
    } else {
        settings.relay_profiles.push(profile);
    }
    settings.active_relay_id = profile_id;
    settings.relay_profiles_enabled = true;
    settings.launch_mode = codex_plus_core::settings::LaunchMode::Relay;
    Ok(settings)
}

fn managed_profile_id(account_id: &str, token_id: &str) -> String {
    format!("gptproxy-token-{account_id}-{token_id}")
}

fn normalize_secret_component(value: &str, label: &str) -> anyhow::Result<String> {
    let value = value.trim();
    anyhow::ensure!(!value.is_empty(), "{label} 不能为空");
    anyhow::ensure!(
        value.len() <= 80
            && value
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-')),
        "{label} 格式无效"
    );
    Ok(value.to_string())
}

fn json_text(value: &Value, field: &str) -> String {
    value.get(field).map_or_else(String::new, |entry| match entry {
        Value::String(value) => value.trim().to_string(),
        Value::Number(value) => value.to_string(),
        _ => String::new(),
    })
}

fn json_i64(value: &Value, field: &str) -> i64 {
    value
        .get(field)
        .and_then(|entry| match entry {
            Value::Number(value) => value.as_i64().or_else(|| value.as_u64().and_then(|number| i64::try_from(number).ok())),
            Value::String(value) => value.trim().parse().ok(),
            _ => None,
        })
        .unwrap_or_default()
}

fn extract_model_limits(value: &Value) -> Vec<String> {
    let Some(models) = value.get("model_limits") else {
        return Vec::new();
    };
    let items = match models {
        Value::Array(items) => items.clone(),
        Value::String(raw) => serde_json::from_str::<Vec<Value>>(raw).unwrap_or_else(|_| {
            raw.split(',').map(|item| Value::String(item.trim().to_string())).collect()
        }),
        _ => Vec::new(),
    };
    let mut unique = std::collections::BTreeSet::new();
    for item in items {
        let name = match item {
            Value::String(value) => value.trim().to_string(),
            Value::Object(value) => value.get("model").or_else(|| value.get("id")).and_then(Value::as_str).unwrap_or_default().trim().to_string(),
            _ => String::new(),
        };
        if !name.is_empty() {
            unique.insert(name);
        }
    }
    unique.into_iter().collect()
}

fn remote_session_from_login_value(value: &Value, cookie: &str) -> anyhow::Result<RemoteSession> {
    let access_token = json_text_at_paths(value, &[
        &["data", "access_token"],
        &["data", "accessToken"],
        &["access_token"],
        &["accessToken"],
    ]);
    let account_id = json_text_at_paths(value, &[
        &["data", "user", "id"],
        &["data", "id"],
        &["user", "id"],
        &["id"],
    ]);
    anyhow::ensure!(
        !access_token.is_empty() || !cookie.trim().is_empty(),
        "中转站登录响应未包含可用会话"
    );
    Ok(RemoteSession {
        account_id,
        access_token,
        cookie: cookie.trim().to_string(),
    })
}

fn extract_token_items(value: &Value) -> anyhow::Result<Vec<Value>> {
    let items = value
        .pointer("/data/items")
        .or_else(|| value.get("items"))
        .and_then(Value::as_array)
        .ok_or_else(|| anyhow::anyhow!("中转站令牌列表响应无效"))?;
    Ok(items.clone())
}

fn json_text_at_paths(value: &Value, paths: &[&[&str]]) -> String {
    for path in paths {
        let mut cursor = value;
        for segment in *path {
            let Some(next) = cursor.get(*segment) else {
                cursor = &Value::Null;
                break;
            };
            cursor = next;
        }
        let text = match cursor {
            Value::String(value) => value.trim().to_string(),
            Value::Number(value) => value.to_string(),
            _ => String::new(),
        };
        if !text.is_empty() {
            return text;
        }
    }
    String::new()
}

fn json_number_at_paths(value: &Value, paths: &[&[&str]]) -> Option<f64> {
    for path in paths {
        let mut cursor = value;
        for segment in *path {
            let Some(next) = cursor.get(*segment) else {
                cursor = &Value::Null;
                break;
            };
            cursor = next;
        }
        let number = match cursor {
            Value::Number(value) => value.as_f64(),
            Value::String(value) => value.trim().parse::<f64>().ok(),
            _ => None,
        };
        if let Some(number) = number.filter(|number| number.is_finite()) {
            return Some(number);
        }
    }
    None
}

fn extract_full_token_key_response(value: &Value) -> anyhow::Result<String> {
    let key = json_text_at_paths(value, &[
        &["data", "key"],
        &["key"],
    ]);
    anyhow::ensure!(!key.is_empty(), "令牌完整密钥响应为空");
    Ok(if key.starts_with("sk-") {
        key
    } else {
        format!("sk-{key}")
    })
}

async fn fetch_full_token_key(
    client: &reqwest::Client,
    session: &RemoteSession,
    token_id: &str,
) -> anyhow::Result<String> {
    let token_id = normalize_secret_component(token_id, "令牌 ID")?;
    let response = authorized_request(
        client.post(format!("{GPTPROXY_API_ROOT}/api/token/{token_id}/key")),
        session,
    )
    .send()
    .await?;
    let status = response.status();
    let payload: Value = response.json().await?;
    anyhow::ensure!(
        status.is_success() && payload.get("success").and_then(Value::as_bool).unwrap_or(false),
        "读取令牌完整密钥失败 (HTTP {})",
        status.as_u16()
    );
    extract_full_token_key_response(&payload)
}

async fn hydrate_remote_token_keys(
    client: &reqwest::Client,
    session: &RemoteSession,
    mut items: Vec<Value>,
) -> anyhow::Result<Vec<Value>> {
    for item in &mut items {
        let metadata = sanitize_remote_token(item)?;
        if !is_client_relay_group(&metadata) {
            continue;
        }
        let key = fetch_full_token_key(client, session, &metadata.id).await?;
        let object = item
            .as_object_mut()
            .ok_or_else(|| anyhow::anyhow!("令牌数据格式无效"))?;
        object.insert("key".to_string(), Value::String(key));
    }
    Ok(items)
}

async fn fetch_remote_token_items(username: &str, password: &str) -> anyhow::Result<(String, Vec<Value>, Option<RelayWalletBalance>)> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()?;
    let response = client
        .post(format!("{GPTPROXY_API_ROOT}/api/user/login"))
        .json(&serde_json::json!({ "username": username.trim(), "password": password }))
        .send()
        .await?;
    let cookie = response_cookie_header(&response);
    let status = response.status();
    let login: Value = response.json().await?;
    anyhow::ensure!(status.is_success(), "中转站登录失败 (HTTP {})", status.as_u16());
    let mut session = remote_session_from_login_value(&login, &cookie)?;
    let profile = fetch_remote_user_profile(&client, &session).await.ok();
    if session.account_id.is_empty() {
        let profile = profile.as_ref().ok_or_else(|| anyhow::anyhow!(
            "中转站登录响应未包含用户 ID，且账户资料暂时无法读取"
        ))?;
        session.account_id = remote_user_id_from_profile(profile)?;
    }
    session.account_id = normalize_secret_component(&session.account_id, "账户 ID")?;

    let response = authorized_request(
        client.get(format!("{GPTPROXY_API_ROOT}/api/token/?p=0&size=100")),
        &session,
    )
    .send()
    .await?;
    let status = response.status();
    let payload: Value = response.json().await?;
    anyhow::ensure!(status.is_success(), "中转站令牌接口失败 (HTTP {})", status.as_u16());
    let items = hydrate_remote_token_keys(&client, &session, extract_token_items(&payload)?).await?;
    let wallet = match profile {
        Some(profile) => match client.get(format!("{GPTPROXY_API_ROOT}/api/status")).send().await {
            Ok(response) if response.status().is_success() => match response.json::<Value>().await {
                Ok(status) => wallet_balance_from_remote_payloads(&profile, &status, now_millis()).ok(),
                Err(_) => None,
            },
            _ => None,
        },
        None => None,
    };
    Ok((session.account_id, items, wallet))
}

async fn fetch_remote_user_profile(client: &reqwest::Client, session: &RemoteSession) -> anyhow::Result<Value> {
    let response = authorized_request(client.get(format!("{GPTPROXY_API_ROOT}/api/user/self")), session)
        .send()
        .await?;
    let status = response.status();
    let payload: Value = response.json().await?;
    anyhow::ensure!(status.is_success(), "中转站账户接口失败 (HTTP {})", status.as_u16());
    let account_id = json_text_at_paths(&payload, &[
        &["data", "id"],
        &["data", "user", "id"],
        &["user", "id"],
        &["id"],
    ]);
    anyhow::ensure!(!account_id.is_empty(), "中转站账户响应未包含用户 ID");
    Ok(payload)
}

fn remote_user_id_from_profile(payload: &Value) -> anyhow::Result<String> {
    let account_id = json_text_at_paths(payload, &[
        &["data", "id"],
        &["data", "user", "id"],
        &["user", "id"],
        &["id"],
    ]);
    anyhow::ensure!(!account_id.is_empty(), "Remote profile did not include an account ID");
    Ok(account_id)
}

fn authorized_request(
    request: reqwest::RequestBuilder,
    session: &RemoteSession,
) -> reqwest::RequestBuilder {
    let request = if session.access_token.is_empty() {
        request
    } else {
        request.bearer_auth(&session.access_token)
    };
    let request = if session.cookie.is_empty() {
        request
    } else {
        request.header(COOKIE, &session.cookie)
    };
    if session.account_id.is_empty() {
        request
    } else {
        request.header("New-Api-User", &session.account_id)
    }
}

fn response_cookie_header(response: &reqwest::Response) -> String {
    response
        .headers()
        .get_all(SET_COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .filter_map(|value| value.split(';').next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join("; ")
}

fn relay_combined_common_config(settings: &BackendSettings) -> String {
    [
        settings.relay_common_config_contents.trim(),
        settings.relay_context_config_contents.trim(),
    ]
    .into_iter()
    .filter(|section| !section.is_empty())
    .collect::<Vec<_>>()
    .join("\n\n")
}

#[cfg(test)]
mod tests {
    use codex_plus_core::secret_store::{MemorySecretBackend, SecretBackend};
    use codex_plus_core::settings::BackendSettings;
    use serde_json::json;

    use super::{apply_relay_token_to_settings_with_backend, clear_all_relay_tokens_with_backend_and_cache_path, extract_full_token_key_response, extract_token_items, load_cached_tokens_from_path, mask_token_key, relay_sync_success_message, relay_token_test_model, remote_session_from_login_value, sanitize_remote_token, store_cached_tokens_to_path, store_tokens_with_backend, wallet_balance_from_remote_payloads, RelayTokenMetadata, RelayTokenSyncSummary};

    #[test]
    fn masks_real_key_before_returning_token_metadata() {
        assert_eq!(mask_token_key("sk-abcdef1234567890"), "sk-a••••7890");

        let token = sanitize_remote_token(&json!({
            "id": 42,
            "name": "工作令牌",
            "key": "sk-abcdef1234567890",
            "status": 1,
            "remain_quota": 123456,
            "used_quota": 12,
            "unlimited_quota": false,
            "expired_time": -1,
            "group": "gpt-额度计费"
        }))
        .unwrap();
        let payload = serde_json::to_string(&token).unwrap();

        assert!(payload.contains("sk-a••••7890"));
        assert!(!payload.contains("sk-abcdef1234567890"));
        assert!(!payload.contains("\"key\""));
    }

    #[test]
    fn stores_real_key_only_in_secure_backend() {
        let backend = MemorySecretBackend::default();
        let tokens = vec![json!({
            "id": 42,
            "name": "工作令牌",
            "key": "sk-abcdef1234567890",
            "status": 1,
            "remain_quota": 123456,
            "used_quota": 12,
            "unlimited_quota": false,
            "expired_time": -1,
            "group": "gpt-额度计费"
        })];

        let public_tokens = store_tokens_with_backend(&backend, "user-7", &tokens).unwrap();

        assert_eq!(public_tokens.len(), 1);
        assert_eq!(backend.get("relay-token/user-7/42").unwrap().as_deref(), Some("sk-abcdef1234567890"));
        assert!(!serde_json::to_string(&public_tokens).unwrap().contains("sk-abcdef1234567890"));
    }

    #[test]
    fn stores_only_tokens_from_the_three_client_supported_groups() {
        let backend = MemorySecretBackend::default();
        let tokens = vec![
            json!({ "id": 1, "key": "sk-gpt", "status": 1, "group": "gpt-额度计费" }),
            json!({ "id": 2, "key": "sk-grok", "status": 1, "group": "grok-额度计费" }),
        ];

        let stored = store_tokens_with_backend(&backend, "user-7", &tokens).unwrap();

        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0].id, "1");
        assert_eq!(backend.get("relay-token/user-7/1").unwrap().as_deref(), Some("sk-gpt"));
        assert_eq!(backend.get("relay-token/user-7/2").unwrap(), None);
    }

    #[test]
    fn connection_test_uses_the_token_authorized_model_before_the_default_model() {
        let token = RelayTokenMetadata {
            id: "1".to_string(),
            name: "GPT".to_string(),
            active: true,
            remain_quota: 0,
            used_quota: 0,
            unlimited_quota: true,
            expired_time: -1,
            group: "gpt-额度计费".to_string(),
            masked_key: "sk-a••••1234".to_string(),
            models: vec!["gpt-5.6-terra".to_string()],
        };

        assert_eq!(relay_token_test_model(&token), "gpt-5.6-terra");
    }

    #[test]
    fn token_sync_summary_counts_only_active_nonexpired_tokens() {
        let active = RelayTokenMetadata {
            id: "1".to_string(),
            name: "GPT".to_string(),
            active: true,
            remain_quota: 0,
            used_quota: 0,
            unlimited_quota: true,
            expired_time: -1,
            group: "gpt".to_string(),
            masked_key: "sk-a***1".to_string(),
            models: Vec::new(),
        };
        let disabled = RelayTokenMetadata { id: "2".to_string(), active: false, ..active.clone() };
        let expired = RelayTokenMetadata { id: "3".to_string(), expired_time: 1, ..active.clone() };

        let summary = RelayTokenSyncSummary::from_tokens_at(&[active, disabled, expired], 100, 456);

        assert_eq!(summary.total_count, 3);
        assert_eq!(summary.usable_count, 1);
        assert_eq!(summary.refreshed_at_ms, 456);
    }

    #[test]
    fn wallet_balance_uses_the_remote_cny_display_settings() {
        let wallet = wallet_balance_from_remote_payloads(
            &json!({ "data": { "quota": 6_155_000 } }),
            &json!({ "data": { "quota_per_unit": 500_000, "usd_exchange_rate": 5, "quota_display_type": "CNY" } }),
            456,
        )
        .unwrap();

        assert_eq!(wallet.display, "¥61.55");
        assert_eq!(wallet.refreshed_at_ms, 456);
    }

    #[test]
    fn token_sync_remains_successful_when_the_optional_wallet_read_is_unavailable() {
        assert_eq!(
            relay_sync_success_message(true),
            "中转站令牌与钱包余额已安全同步。"
        );
        assert_eq!(
            relay_sync_success_message(false),
            "中转站令牌已安全同步；钱包余额暂时无法读取，请稍后刷新。"
        );
    }

    #[test]
    fn applying_token_creates_current_profile_without_serializing_real_key() {
        let backend = MemorySecretBackend::default();
        let tokens = vec![json!({
            "id": 42,
            "name": "工作令牌",
            "key": "sk-abcdef1234567890",
            "status": 1,
            "remain_quota": 123456,
            "used_quota": 12,
            "unlimited_quota": false,
            "expired_time": -1,
            "group": "gpt-额度计费"
        })];
        store_tokens_with_backend(&backend, "user-7", &tokens).unwrap();

        let settings = apply_relay_token_to_settings_with_backend(
            &backend,
            BackendSettings::default(),
            "user-7",
            "42",
        )
        .unwrap();
        let profile = settings
            .relay_profiles
            .iter()
            .find(|profile| profile.id == "gptproxy-token-user-7-42")
            .unwrap();

        assert_eq!(settings.active_relay_id, profile.id);
        assert_eq!(profile.base_url, "https://gptproxy.site/v1");
        assert_eq!(profile.api_key, "sk-abcdef1234567890");
        assert!(!serde_json::to_string(&settings).unwrap().contains("sk-abcdef1234567890"));
    }

    #[test]
    fn caches_safe_token_metadata_for_the_next_client_launch_without_storing_keys_in_the_cache() {
        let backend = MemorySecretBackend::default();
        let items = vec![json!({
            "id": 42,
            "name": "GPT Pro",
            "key": "sk-real-token-value",
            "status": 1,
            "remain_quota": 700000,
            "used_quota": 100000,
            "unlimited_quota": false,
            "expired_time": -1,
            "group": "gpt-pro-额度计费",
            "model_limits": ["gpt-5.6-sol", "gpt-5.6-terra"]
        })];

        let stored = store_tokens_with_backend(&backend, "user-7", &items).unwrap();
        let temp = tempfile::tempdir().unwrap();
        let cache_path = temp.path().join("relay-token-cache.json");
        store_cached_tokens_to_path(&cache_path, "user-7", &stored).unwrap();
        let cached = load_cached_tokens_from_path(&cache_path).unwrap();

        assert_eq!(cached.account_id, "user-7");
        assert_eq!(cached.tokens.len(), 1);
        assert_eq!(cached.tokens[0].masked_key, "sk-r••••alue");
        assert_eq!(cached.tokens[0].models, vec!["gpt-5.6-sol", "gpt-5.6-terra"]);
        let cache = std::fs::read_to_string(cache_path).unwrap();
        assert!(!cache.contains("sk-real-token-value"));
    }

    #[test]
    fn cached_tokens_without_a_summary_are_migrated_on_load() {
        let temp = tempfile::tempdir().unwrap();
        let cache_path = temp.path().join("relay-token-cache.json");
        std::fs::write(
            &cache_path,
            serde_json::to_vec(&json!({
                "accountId": "user-7",
                "tokens": [{
                    "id": "42",
                    "name": "旧缓存令牌",
                    "active": true,
                    "remainQuota": 123,
                    "usedQuota": 0,
                    "unlimitedQuota": false,
                    "expiredTime": -1,
                    "group": "gpt-额度计费",
                    "maskedKey": "sk-o••••ache",
                    "models": []
                }]
            }))
            .unwrap(),
        )
        .unwrap();

        let cached = load_cached_tokens_from_path(&cache_path).unwrap();

        assert_eq!(cached.summary.total_count, 1);
        assert_eq!(cached.summary.usable_count, 1);
    }

    #[test]
    fn parses_remote_session_and_only_extracts_token_items_from_data() {
        let session = remote_session_from_login_value(
            &json!({ "success": true, "data": { "access_token": "remote-access-token", "user": { "id": 7 } } }),
            "session=abc",
        )
        .unwrap();
        assert_eq!(session.account_id, "7");
        assert_eq!(session.access_token, "remote-access-token");

        let items = extract_token_items(&json!({
            "success": true,
            "data": { "page": 0, "items": [{ "id": 42, "key": "sk-real" }] }
        }))
        .unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["id"], 42);
    }

    #[test]
    fn resolves_the_complete_key_returned_by_the_token_copy_endpoint() {
        let key = extract_full_token_key_response(&json!({
            "success": true,
            "data": { "key": "dfTa_very_long_real_secret" }
        }))
        .unwrap();

        assert_eq!(key, "sk-dfTa_very_long_real_secret");
    }

    #[test]
    fn permits_login_without_user_id_so_the_self_endpoint_can_complete_the_session() {
        let session = remote_session_from_login_value(
            &json!({ "success": true, "data": { "access_token": "remote-access-token" } }),
            "session=abc",
        )
        .unwrap();
        assert!(session.account_id.is_empty());
    }

    #[test]
    fn logout_cleanup_removes_only_synced_relay_tokens() {
        let root = tempfile::tempdir().unwrap();
        let cache_path = root.path().join("relay-token-cache.json");
        let backend = MemorySecretBackend::default();
        backend.set("relay-token/user-7/42", "sk-real").unwrap();
        backend.set("relay/profile/gptproxy-token-user-7-42/api-key", "sk-real").unwrap();
        backend.set("member/access-token", "member-session").unwrap();

        clear_all_relay_tokens_with_backend_and_cache_path(&backend, &cache_path).unwrap();

        assert_eq!(backend.get("relay-token/user-7/42").unwrap(), None);
        assert_eq!(backend.get("relay/profile/gptproxy-token-user-7-42/api-key").unwrap(), None);
        assert_eq!(backend.get("member/access-token").unwrap().as_deref(), Some("member-session"));
    }

    #[test]
    fn logout_cleanup_uses_the_supplied_cache_path_without_touching_other_test_state() {
        let root = tempfile::tempdir().unwrap();
        let cache_path = root.path().join("relay-token-cache.json");
        std::fs::write(&cache_path, "safe-cache").unwrap();
        let backend = MemorySecretBackend::default();
        backend.set("relay-token/user-7/42", "sk-real").unwrap();

        clear_all_relay_tokens_with_backend_and_cache_path(&backend, &cache_path).unwrap();

        assert_eq!(backend.get("relay-token/user-7/42").unwrap(), None);
        assert!(!cache_path.exists());
    }
}

//! WorkBuddy 客户端联动：检测安装状态、把中转站国产模型分组写入 `~/.workbuddy/models.json`。
//!
//! 客户端只做「同步 + 检测」，不覆盖用户已经手工调过的自定义模型条目：
//! 同 id 的模型只补齐缺失字段并刷新接入地址与令牌，其余配置保持原样。

use anyhow::Context;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};

/// WorkBuddy 配置目录名（位于用户主目录下）。
const WORKBUDDY_CONFIG_DIR: &str = ".workbuddy";
/// 自定义模型清单文件名。
const WORKBUDDY_MODELS_FILE: &str = "models.json";
/// WorkBuddy 可执行文件名（Windows）。
const WORKBUDDY_EXECUTABLE_WINDOWS: &str = "WorkBuddy.exe";
/// 写入 models.json 的模型供应商标识，与 WorkBuddy 自定义模型面板一致。
const WORKBUDDY_CUSTOM_VENDOR: &str = "Custom";

/// 国产模型分组包含的模型 id。
///
/// 分组名在中转站后台可能被改动，因此识别以模型 id 为主、分组名为辅，
/// 避免因为一个硬编码字符串对不上就整条链路失效。
pub const DOMESTIC_RELAY_MODELS: [&str; 4] = [
    "glm-5.2",
    "deepseek-v4-pro",
    "deepseek-v4-flash",
    "qwen3.7-plus",
];

/// 国产模型分组名候选，命中任意一个即视为国产分组。
pub const DOMESTIC_RELAY_GROUP_HINTS: [&str; 3] = ["国产", "0.5x", "0.5X"];

/// 默认上下文与输出窗口，与 WorkBuddy 面板默认值保持一致。
const DEFAULT_MAX_INPUT_TOKENS: i64 = 131_072;
const DEFAULT_MAX_OUTPUT_TOKENS: i64 = 32_768;

/// 单个待写入 WorkBuddy 的模型定义。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbuddyModelRequest {
    pub id: String,
    pub base_url: String,
    pub api_key: String,
}

/// 写入结果，供前端展示。
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbuddySyncResult {
    /// models.json 的绝对路径。
    pub config_path: String,
    /// 新增的模型 id。
    pub added: Vec<String>,
    /// 更新了地址或令牌的模型 id。
    pub updated: Vec<String>,
    /// 已存在且无需改动的模型 id。
    pub unchanged: Vec<String>,
    /// 备份文件路径（原文件存在时才有）。
    pub backup_path: Option<String>,
}

/// WorkBuddy 安装检测结果。
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbuddyInstallation {
    pub installed: bool,
    /// 命中的可执行文件路径。
    pub executable_path: Option<String>,
    /// 配置目录是否已存在（存在说明至少启动过一次）。
    pub config_dir_exists: bool,
}

/// 判断某个中转站令牌是否属于国产模型分组。
pub fn is_domestic_relay_group(group: &str, models: &[String]) -> bool {
    if is_domestic_relay_group_name(group) {
        return true;
    }
    models.iter().any(|model| is_domestic_relay_model(model))
}

/// 判断单个模型 id 是否属于国产模型分组。
pub fn is_domestic_relay_model(model: &str) -> bool {
    let model = model.trim().to_ascii_lowercase();
    if model.is_empty() {
        return false;
    }
    DOMESTIC_RELAY_MODELS
        .iter()
        .any(|known| known.eq_ignore_ascii_case(&model))
}

/// 判断分组名本身是否表明这是国产分组（不看模型列表）。
pub fn is_domestic_relay_group_name(group: &str) -> bool {
    let group = group.trim();
    !group.is_empty()
        && DOMESTIC_RELAY_GROUP_HINTS
            .iter()
            .any(|hint| group.contains(hint))
}

/// 解析国产分组令牌实际可用的模型列表。
///
/// 中转站的 `models` 字段为空表示「该令牌不限本分组模型」，此时按白名单全量放通，
/// 否则界面上只会剩下后台恰好填了模型清单的那一个令牌所列的模型。
/// 分组名已经确认是国产分组时，显式列出的模型一律信任（中转站上新模型不必等客户端发版）；
/// 仅靠模型 id 命中白名单才归类的令牌，继续按白名单过滤，避免把 GPT 模型混进来。
pub fn domestic_relay_models_for_token(group: &str, models: &[String]) -> Vec<String> {
    let listed: Vec<String> = models
        .iter()
        .map(|model| model.trim())
        .filter(|model| !model.is_empty())
        .map(|model| model.to_string())
        .collect();

    if listed.is_empty() {
        return DOMESTIC_RELAY_MODELS
            .iter()
            .map(|model| model.to_string())
            .collect();
    }

    if is_domestic_relay_group_name(group) {
        return listed;
    }

    listed
        .into_iter()
        .filter(|model| is_domestic_relay_model(model))
        .collect()
}

/// WorkBuddy 配置目录（`~/.workbuddy`）。
pub fn default_workbuddy_config_dir() -> PathBuf {
    match directories::BaseDirs::new() {
        Some(dirs) => dirs.home_dir().join(WORKBUDDY_CONFIG_DIR),
        None => PathBuf::from(WORKBUDDY_CONFIG_DIR),
    }
}

/// WorkBuddy 自定义模型清单路径（`~/.workbuddy/models.json`）。
pub fn default_workbuddy_models_path() -> PathBuf {
    default_workbuddy_config_dir().join(WORKBUDDY_MODELS_FILE)
}

/// 检测 WorkBuddy 是否已安装。
pub fn detect_workbuddy_installation() -> WorkbuddyInstallation {
    detect_workbuddy_installation_in(&workbuddy_install_candidates(), &default_workbuddy_config_dir())
}

/// 可测版本：在给定候选路径中检测安装状态。
pub fn detect_workbuddy_installation_in(
    candidates: &[PathBuf],
    config_dir: &Path,
) -> WorkbuddyInstallation {
    let executable_path = candidates
        .iter()
        .find(|path| path.is_file())
        .map(|path| path.to_string_lossy().to_string());
    WorkbuddyInstallation {
        installed: executable_path.is_some(),
        executable_path,
        config_dir_exists: config_dir.is_dir(),
    }
}

/// 候选的 WorkBuddy 安装位置。
///
/// 用户完全可能把 WorkBuddy 装到任意盘的自定义目录（例如 `E:\workbuddy`），
/// 只靠默认目录白名单会误判成「未安装」，因此这里按可靠性从高到低依次收集：
/// 1. 正在运行的 WorkBuddy 进程映像路径（最可信，人已经在用了）；
/// 2. 注册表卸载项登记的安装位置 / 图标路径（安装器写的真实路径）；
/// 3. `PATH` 中可解析到的可执行文件；
/// 4. 常见默认安装目录（兜底，覆盖尚未启动过的全新安装）。
pub fn workbuddy_install_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    push_unique_candidate(&mut candidates, running_workbuddy_executables());
    push_unique_candidate(&mut candidates, registry_workbuddy_executables());
    push_unique_candidate(&mut candidates, path_env_workbuddy_executables());
    push_unique_candidate(&mut candidates, default_workbuddy_install_locations());
    candidates
}

/// 追加候选路径并去重，保持先后顺序（越靠前越可信）。
fn push_unique_candidate(candidates: &mut Vec<PathBuf>, incoming: Vec<PathBuf>) {
    for path in incoming {
        if !candidates.iter().any(|existing| existing == &path) {
            candidates.push(path);
        }
    }
}

/// 常见默认安装目录。
fn default_workbuddy_install_locations() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(dirs) = directories::BaseDirs::new() {
        let home = dirs.home_dir();
        candidates.push(
            home.join("AppData")
                .join("Local")
                .join("Programs")
                .join("WorkBuddy")
                .join(WORKBUDDY_EXECUTABLE_WINDOWS),
        );
        candidates.push(
            home.join("AppData")
                .join("Local")
                .join("WorkBuddy")
                .join(WORKBUDDY_EXECUTABLE_WINDOWS),
        );
    }
    for root in ["C:\\Program Files", "C:\\Program Files (x86)"] {
        candidates.push(
            Path::new(root)
                .join("WorkBuddy")
                .join(WORKBUDDY_EXECUTABLE_WINDOWS),
        );
    }
    candidates
}

/// 从正在运行的进程里取 WorkBuddy 可执行文件路径。
#[cfg(windows)]
fn running_workbuddy_executables() -> Vec<PathBuf> {
    let target = WORKBUDDY_EXECUTABLE_WINDOWS.to_ascii_lowercase();
    crate::windows_integration::enumerate_processes()
        .into_iter()
        .filter(|process| process.exe_file.to_ascii_lowercase() == target)
        .filter_map(|process| process.executable_path)
        .collect()
}

#[cfg(not(windows))]
fn running_workbuddy_executables() -> Vec<PathBuf> {
    Vec::new()
}

/// 从注册表卸载项里取 WorkBuddy 的安装位置。
///
/// `InstallLocation` 有可能为空（Electron 打包器时有时无），因此同时解析
/// `DisplayIcon`，它的形式通常是 `E:\workbuddy\WorkBuddy.exe,0`。
#[cfg(windows)]
fn registry_workbuddy_executables() -> Vec<PathBuf> {
    const UNINSTALL_ROOTS: [&str; 3] = [
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
    ];

    let mut results = Vec::new();
    for (index, root) in UNINSTALL_ROOTS.iter().enumerate() {
        // 前两个是机器级（HKLM），最后一个是用户级（HKCU）。
        let per_user = index == 2;
        for subkey in crate::windows_integration::enumerate_uninstall_subkeys(root, per_user) {
            let display_name =
                crate::windows_integration::read_uninstall_string(root, &subkey, "DisplayName", per_user)
                    .unwrap_or_default();
            if !display_name.to_ascii_lowercase().contains("workbuddy") {
                continue;
            }
            if let Some(location) = crate::windows_integration::read_uninstall_string(
                root,
                &subkey,
                "InstallLocation",
                per_user,
            ) {
                let location = location.trim().trim_matches('"');
                if !location.is_empty() {
                    results.push(Path::new(location).join(WORKBUDDY_EXECUTABLE_WINDOWS));
                }
            }
            if let Some(icon) = crate::windows_integration::read_uninstall_string(
                root,
                &subkey,
                "DisplayIcon",
                per_user,
            ) {
                if let Some(path) = executable_from_display_icon(&icon) {
                    results.push(path);
                }
            }
        }
    }
    results
}

#[cfg(not(windows))]
fn registry_workbuddy_executables() -> Vec<PathBuf> {
    Vec::new()
}

/// 从 `DisplayIcon` 值中解析出可执行文件路径，去掉尾部的 `,<index>` 图标序号与引号。
pub fn executable_from_display_icon(icon: &str) -> Option<PathBuf> {
    let icon = icon.trim().trim_matches('"').trim();
    if icon.is_empty() {
        return None;
    }
    // 只有当逗号之后是纯数字（图标序号）时才截断，避免误伤含逗号的目录名。
    let candidate = match icon.rsplit_once(',') {
        Some((head, tail)) if !tail.is_empty() && tail.trim().chars().all(|ch| ch.is_ascii_digit()) => head,
        _ => icon,
    };
    let candidate = candidate.trim().trim_matches('"').trim();
    if candidate.is_empty() {
        return None;
    }
    Some(PathBuf::from(candidate))
}

/// 从 `PATH` 环境变量里找 WorkBuddy 可执行文件。
fn path_env_workbuddy_executables() -> Vec<PathBuf> {
    let Some(path_env) = std::env::var_os("PATH") else {
        return Vec::new();
    };
    std::env::split_paths(&path_env)
        .map(|dir| dir.join(WORKBUDDY_EXECUTABLE_WINDOWS))
        .filter(|path| path.is_file())
        .collect()
}

/// WorkBuddy 官网下载地址，未安装时提示用户前往。
pub const WORKBUDDY_DOWNLOAD_URL: &str = "https://www.codebuddy.cn/workbuddy";

/// 启动 WorkBuddy 的结果。
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbuddyLaunchResult {
    /// 是否成功拉起进程。
    pub launched: bool,
    /// 实际启动的可执行文件路径。
    pub executable_path: Option<String>,
    /// 未启动时的说明，例如「未安装」。
    pub message: Option<String>,
    /// 未安装时给前端的下载地址。
    pub download_url: Option<String>,
}

/// 已安装则拉起 WorkBuddy，未安装则返回带下载地址的提示。
pub fn launch_workbuddy(installation: &WorkbuddyInstallation) -> WorkbuddyLaunchResult {
    let Some(executable) = installation.executable_path.as_deref() else {
        return WorkbuddyLaunchResult {
            launched: false,
            executable_path: None,
            message: Some("未检测到 WorkBuddy，请先安装后再一键配置".to_string()),
            download_url: Some(WORKBUDDY_DOWNLOAD_URL.to_string()),
        };
    };

    match spawn_detached(Path::new(executable)) {
        Ok(()) => WorkbuddyLaunchResult {
            launched: true,
            executable_path: Some(executable.to_string()),
            message: None,
            download_url: None,
        },
        Err(error) => WorkbuddyLaunchResult {
            launched: false,
            executable_path: Some(executable.to_string()),
            message: Some(format!("启动 WorkBuddy 失败：{error}")),
            download_url: None,
        },
    }
}

/// 脱离父进程启动，避免客户端退出时把 WorkBuddy 一起带走。
fn spawn_detached(executable: &Path) -> anyhow::Result<()> {
    let mut command = std::process::Command::new(executable);
    command
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    if let Some(parent) = executable.parent() {
        command.current_dir(parent);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(crate::windows_integration::CREATE_NO_WINDOW);
    }
    command
        .spawn()
        .with_context(|| format!("启动 {} 失败", executable.display()))?;
    Ok(())
}

/// 把国产模型分组写入默认的 WorkBuddy 配置。
pub fn sync_models_to_workbuddy(
    models: &[WorkbuddyModelRequest],
) -> anyhow::Result<WorkbuddySyncResult> {
    sync_models_to_workbuddy_at(&default_workbuddy_models_path(), models)
}

/// 可测版本：把国产模型分组写入指定路径的 models.json。
///
/// 合并规则：
/// - 文件不存在或内容为空 → 新建数组。
/// - 已存在同 id 条目 → 只更新 `url` / `apiKey`，补齐缺失的能力字段，其余保留。
/// - 不认识的条目 → 原样保留，顺序不变。
pub fn sync_models_to_workbuddy_at(
    path: &Path,
    models: &[WorkbuddyModelRequest],
) -> anyhow::Result<WorkbuddySyncResult> {
    anyhow::ensure!(!models.is_empty(), "没有可同步的模型");

    let existing_raw = match std::fs::read_to_string(path) {
        Ok(raw) => Some(raw),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => {
            return Err(error).with_context(|| format!("读取 {} 失败", path.display()));
        }
    };

    let mut entries = parse_existing_models(existing_raw.as_deref())
        .with_context(|| format!("解析 {} 失败", path.display()))?;

    let mut result = WorkbuddySyncResult {
        config_path: path.to_string_lossy().to_string(),
        ..Default::default()
    };

    for model in models {
        let id = model.id.trim();
        anyhow::ensure!(!id.is_empty(), "模型 id 不能为空");
        let base_url = model.base_url.trim();
        anyhow::ensure!(!base_url.is_empty(), "模型 {id} 缺少接入地址");
        let api_key = model.api_key.trim();
        anyhow::ensure!(!api_key.is_empty(), "模型 {id} 缺少令牌");

        match entries.iter_mut().find(|entry| entry_id(entry) == id) {
            Some(entry) => {
                if merge_existing_entry(entry, base_url, api_key) {
                    result.updated.push(id.to_string());
                } else {
                    result.unchanged.push(id.to_string());
                }
            }
            None => {
                entries.push(build_model_entry(id, base_url, api_key));
                result.added.push(id.to_string());
            }
        }
    }

    if result.added.is_empty() && result.updated.is_empty() {
        return Ok(result);
    }

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("创建目录 {} 失败", parent.display()))?;
    }

    if let Some(raw) = existing_raw.as_deref() {
        let backup = path.with_extension("json.bak");
        std::fs::write(&backup, raw)
            .with_context(|| format!("备份 {} 失败", backup.display()))?;
        result.backup_path = Some(backup.to_string_lossy().to_string());
    }

    let serialized = serde_json::to_string_pretty(&Value::Array(entries))?;
    std::fs::write(path, format!("{serialized}\n"))
        .with_context(|| format!("写入 {} 失败", path.display()))?;

    Ok(result)
}

fn parse_existing_models(raw: Option<&str>) -> anyhow::Result<Vec<Value>> {
    let Some(raw) = raw else {
        return Ok(Vec::new());
    };
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }
    match serde_json::from_str::<Value>(raw)? {
        Value::Array(items) => Ok(items),
        _ => anyhow::bail!("models.json 顶层必须是数组"),
    }
}

fn entry_id(entry: &Value) -> &str {
    entry.get("id").and_then(Value::as_str).unwrap_or_default().trim()
}

/// 更新已存在的条目，返回是否真的发生了改动。
fn merge_existing_entry(entry: &mut Value, base_url: &str, api_key: &str) -> bool {
    let Some(object) = entry.as_object_mut() else {
        return false;
    };
    let mut changed = false;

    if object.get("url").and_then(Value::as_str).unwrap_or_default() != base_url {
        object.insert("url".to_string(), Value::String(base_url.to_string()));
        changed = true;
    }
    if object.get("apiKey").and_then(Value::as_str).unwrap_or_default() != api_key {
        object.insert("apiKey".to_string(), Value::String(api_key.to_string()));
        changed = true;
    }

    // 只补齐缺失字段，已有值一律不动，避免覆盖用户手改的配置。
    for (key, value) in default_capability_fields() {
        if !object.contains_key(&key) {
            object.insert(key, value);
            changed = true;
        }
    }

    changed
}

fn build_model_entry(id: &str, base_url: &str, api_key: &str) -> Value {
    let mut object = Map::new();
    object.insert("id".to_string(), Value::String(id.to_string()));
    object.insert("name".to_string(), Value::String(id.to_string()));
    object.insert(
        "vendor".to_string(),
        Value::String(WORKBUDDY_CUSTOM_VENDOR.to_string()),
    );
    object.insert("url".to_string(), Value::String(base_url.to_string()));
    object.insert("apiKey".to_string(), Value::String(api_key.to_string()));
    for (key, value) in default_capability_fields() {
        object.insert(key, value);
    }
    Value::Object(object)
}

fn default_capability_fields() -> Vec<(String, Value)> {
    vec![
        ("supportsToolCall".to_string(), Value::Bool(true)),
        ("supportsImages".to_string(), Value::Bool(true)),
        ("supportsReasoning".to_string(), Value::Bool(true)),
        ("useCustomProtocol".to_string(), Value::Bool(false)),
        (
            "maxInputTokens".to_string(),
            Value::from(DEFAULT_MAX_INPUT_TOKENS),
        ),
        (
            "maxOutputTokens".to_string(),
            Value::from(DEFAULT_MAX_OUTPUT_TOKENS),
        ),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(id: &str) -> WorkbuddyModelRequest {
        WorkbuddyModelRequest {
            id: id.to_string(),
            base_url: "https://gptproxy.site/v1".to_string(),
            api_key: "sk-domestic".to_string(),
        }
    }

    fn read_entries(path: &Path) -> Vec<Value> {
        let raw = std::fs::read_to_string(path).expect("读取写入结果");
        match serde_json::from_str::<Value>(&raw).expect("解析写入结果") {
            Value::Array(items) => items,
            other => panic!("顶层不是数组: {other}"),
        }
    }

    #[test]
    fn detects_domestic_group_by_model_id() {
        assert!(is_domestic_relay_model("glm-5.2"));
        assert!(is_domestic_relay_model("DeepSeek-V4-Pro"));
        assert!(is_domestic_relay_model("qwen3.7-plus"));
        assert!(!is_domestic_relay_model("gpt-5.6-sol"));
        assert!(!is_domestic_relay_model(""));
    }

    #[test]
    fn detects_domestic_group_by_group_name_or_models() {
        assert!(is_domestic_relay_group("国产模型-额度计费", &[]));
        assert!(is_domestic_relay_group("低价0.5X分组", &[]));
        assert!(is_domestic_relay_group(
            "临时低价分组",
            &["deepseek-v4-flash".to_string()]
        ));
        assert!(!is_domestic_relay_group(
            "gpt-额度计费",
            &["gpt-5.6-sol".to_string()]
        ));
    }

    #[test]
    fn parses_executable_path_from_display_icon() {
        // 本机实际形态：安装器把图标序号拼在路径后面。
        assert_eq!(
            executable_from_display_icon(r"E:\workbuddy\WorkBuddy.exe,0"),
            Some(PathBuf::from(r"E:\workbuddy\WorkBuddy.exe"))
        );
        // 没有图标序号时原样返回。
        assert_eq!(
            executable_from_display_icon(r"D:\CodeBuddy CN\CodeBuddy CN.exe"),
            Some(PathBuf::from(r"D:\CodeBuddy CN\CodeBuddy CN.exe"))
        );
        // 外层引号要剥掉。
        assert_eq!(
            executable_from_display_icon("\"E:\\work buddy\\WorkBuddy.exe\",1"),
            Some(PathBuf::from(r"E:\work buddy\WorkBuddy.exe"))
        );
        // 目录名本身含逗号时不能被截断（逗号后不是纯数字）。
        assert_eq!(
            executable_from_display_icon(r"E:\Foo, Bar\WorkBuddy.exe"),
            Some(PathBuf::from(r"E:\Foo, Bar\WorkBuddy.exe"))
        );
        // 空值与只有图标序号的畸形值都判为「解析不出路径」。
        assert_eq!(executable_from_display_icon(""), None);
        assert_eq!(executable_from_display_icon("   "), None);
        assert_eq!(executable_from_display_icon(",0"), None);
    }

    #[test]
    fn install_candidates_keep_order_and_dedupe() {
        let mut candidates = Vec::new();
        push_unique_candidate(
            &mut candidates,
            vec![
                PathBuf::from(r"E:\workbuddy\WorkBuddy.exe"),
                PathBuf::from(r"E:\workbuddy\WorkBuddy.exe"),
            ],
        );
        push_unique_candidate(
            &mut candidates,
            vec![
                PathBuf::from(r"E:\workbuddy\WorkBuddy.exe"),
                PathBuf::from(r"C:\Program Files\WorkBuddy\WorkBuddy.exe"),
            ],
        );

        assert_eq!(
            candidates,
            vec![
                PathBuf::from(r"E:\workbuddy\WorkBuddy.exe"),
                PathBuf::from(r"C:\Program Files\WorkBuddy\WorkBuddy.exe"),
            ]
        );
    }

    #[test]
    fn detects_installation_in_custom_directory() {
        // 用户装在非默认盘时也要能检出来，这正是之前误判「未安装」的场景。
        let dir = tempfile::tempdir().expect("临时目录");
        let exe = dir.path().join("WorkBuddy.exe");
        std::fs::write(&exe, b"stub").expect("写入桩文件");

        let installation = detect_workbuddy_installation_in(
            &[
                PathBuf::from(r"C:\Program Files\WorkBuddy\WorkBuddy.exe"),
                exe.clone(),
            ],
            dir.path(),
        );

        assert!(installation.installed);
        assert_eq!(
            installation.executable_path.as_deref(),
            Some(exe.to_string_lossy().as_ref())
        );
        assert!(installation.config_dir_exists);
    }

    #[test]
    fn empty_model_list_falls_back_to_the_whole_domestic_whitelist() {
        // 中转站后台没填模型清单表示「不限本分组模型」，应放通全部四个。
        assert_eq!(
            domestic_relay_models_for_token("国产模型-额度计费", &[]),
            DOMESTIC_RELAY_MODELS.to_vec()
        );
        // 全是空白字符串同样视为未填写。
        assert_eq!(
            domestic_relay_models_for_token("国产模型-额度计费", &["".to_string(), "  ".to_string()]),
            DOMESTIC_RELAY_MODELS.to_vec()
        );
    }

    #[test]
    fn explicit_model_list_limits_the_domestic_group() {
        // 显式列出模型时只展示列出的那些。
        assert_eq!(
            domestic_relay_models_for_token("国产模型-额度计费", &["glm-5.2".to_string()]),
            vec!["glm-5.2".to_string()]
        );
        // 分组名已确认是国产分组时信任列表原样，中转站上新模型不必等客户端发版。
        assert_eq!(
            domestic_relay_models_for_token(
                "国产模型-额度计费",
                &["glm-5.2".to_string(), "kimi-k3".to_string()]
            ),
            vec!["glm-5.2".to_string(), "kimi-k3".to_string()]
        );
        // 仅靠模型 id 命中白名单归类的令牌继续过滤，避免 GPT 模型混进国产分组。
        assert_eq!(
            domestic_relay_models_for_token(
                "gpt-额度计费",
                &["gpt-5.6-sol".to_string(), "deepseek-v4-pro".to_string()]
            ),
            vec!["deepseek-v4-pro".to_string()]
        );
    }

    #[test]
    fn creates_models_file_when_missing() {
        let dir = tempfile::tempdir().expect("临时目录");
        let path = dir.path().join("nested").join("models.json");
        let models: Vec<_> = DOMESTIC_RELAY_MODELS.iter().map(|id| request(id)).collect();

        let result = sync_models_to_workbuddy_at(&path, &models).expect("写入成功");

        assert_eq!(result.added.len(), 4);
        assert!(result.updated.is_empty());
        assert!(result.backup_path.is_none());
        let entries = read_entries(&path);
        assert_eq!(entries.len(), 4);
        assert_eq!(entry_id(&entries[0]), "glm-5.2");
        assert_eq!(
            entries[0].get("vendor").and_then(Value::as_str),
            Some("Custom")
        );
        assert_eq!(
            entries[0].get("maxInputTokens").and_then(Value::as_i64),
            Some(DEFAULT_MAX_INPUT_TOKENS)
        );
    }

    #[test]
    fn preserves_unrelated_entries_and_custom_fields() {
        let dir = tempfile::tempdir().expect("临时目录");
        let path = dir.path().join("models.json");
        std::fs::write(
            &path,
            serde_json::to_string_pretty(&serde_json::json!([
                {
                    "id": "gpt-5.6-sol",
                    "name": "我改过的名字",
                    "vendor": "Custom",
                    "url": "https://gptproxy.site/v1",
                    "apiKey": "sk-gpt",
                    "temperature": 1
                },
                {
                    "id": "glm-5.2",
                    "name": "自定义显示名",
                    "vendor": "Custom",
                    "url": "https://old.example.com/v1",
                    "apiKey": "sk-old",
                    "reasoning": { "defaultEffort": "high" }
                }
            ]))
            .expect("序列化"),
        )
        .expect("写入初始文件");

        let result =
            sync_models_to_workbuddy_at(&path, &[request("glm-5.2"), request("qwen3.7-plus")])
                .expect("写入成功");

        assert_eq!(result.updated, vec!["glm-5.2".to_string()]);
        assert_eq!(result.added, vec!["qwen3.7-plus".to_string()]);
        assert!(result.backup_path.is_some());

        let entries = read_entries(&path);
        assert_eq!(entries.len(), 3);
        // 无关条目原样保留。
        assert_eq!(entry_id(&entries[0]), "gpt-5.6-sol");
        assert_eq!(
            entries[0].get("name").and_then(Value::as_str),
            Some("我改过的名字")
        );
        // 同 id 条目只刷新地址与令牌，用户自定义字段保留。
        let glm = &entries[1];
        assert_eq!(
            glm.get("name").and_then(Value::as_str),
            Some("自定义显示名")
        );
        assert_eq!(
            glm.get("url").and_then(Value::as_str),
            Some("https://gptproxy.site/v1")
        );
        assert_eq!(glm.get("apiKey").and_then(Value::as_str), Some("sk-domestic"));
        assert!(glm.get("reasoning").is_some());
    }

    #[test]
    fn reports_unchanged_and_skips_write() {
        let dir = tempfile::tempdir().expect("临时目录");
        let path = dir.path().join("models.json");
        sync_models_to_workbuddy_at(&path, &[request("glm-5.2")]).expect("首次写入");
        let first = std::fs::read_to_string(&path).expect("读取首次结果");

        let result = sync_models_to_workbuddy_at(&path, &[request("glm-5.2")]).expect("二次写入");

        assert_eq!(result.unchanged, vec!["glm-5.2".to_string()]);
        assert!(result.added.is_empty() && result.updated.is_empty());
        assert!(result.backup_path.is_none(), "无改动时不应产生备份");
        assert_eq!(
            std::fs::read_to_string(&path).expect("读取二次结果"),
            first,
            "无改动时文件内容不变"
        );
    }

    #[test]
    fn rejects_invalid_requests() {
        let dir = tempfile::tempdir().expect("临时目录");
        let path = dir.path().join("models.json");

        assert!(sync_models_to_workbuddy_at(&path, &[]).is_err());
        assert!(sync_models_to_workbuddy_at(
            &path,
            &[WorkbuddyModelRequest {
                id: "  ".to_string(),
                base_url: "https://gptproxy.site/v1".to_string(),
                api_key: "sk-x".to_string(),
            }]
        )
        .is_err());
        assert!(sync_models_to_workbuddy_at(
            &path,
            &[WorkbuddyModelRequest {
                id: "glm-5.2".to_string(),
                base_url: "https://gptproxy.site/v1".to_string(),
                api_key: "   ".to_string(),
            }]
        )
        .is_err());
    }

    #[test]
    fn rejects_non_array_config() {
        let dir = tempfile::tempdir().expect("临时目录");
        let path = dir.path().join("models.json");
        std::fs::write(&path, "{\"models\":[]}").expect("写入非数组配置");

        assert!(sync_models_to_workbuddy_at(&path, &[request("glm-5.2")]).is_err());
    }

    #[test]
    fn launch_returns_download_hint_when_not_installed() {
        let result = launch_workbuddy(&WorkbuddyInstallation {
            installed: false,
            executable_path: None,
            config_dir_exists: false,
        });

        assert!(!result.launched);
        assert_eq!(
            result.download_url.as_deref(),
            Some(WORKBUDDY_DOWNLOAD_URL)
        );
        assert!(result.message.is_some());
    }

    #[test]
    fn detects_installation_from_candidates() {
        let dir = tempfile::tempdir().expect("临时目录");
        let exe = dir.path().join("WorkBuddy.exe");
        let config_dir = dir.path().join(".workbuddy");

        let missing = detect_workbuddy_installation_in(&[exe.clone()], &config_dir);
        assert!(!missing.installed);
        assert!(!missing.config_dir_exists);

        std::fs::write(&exe, b"stub").expect("创建假可执行文件");
        std::fs::create_dir_all(&config_dir).expect("创建配置目录");
        let found = detect_workbuddy_installation_in(&[exe.clone()], &config_dir);
        assert!(found.installed);
        assert!(found.config_dir_exists);
        assert_eq!(found.executable_path, Some(exe.to_string_lossy().to_string()));
    }
}

# ♛Codework AI客户端 1.3.37 稳定安全基础版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 发布可验证、可回滚、可诊断的 1.3.37，并把敏感凭据从明文设置与 WebView localStorage 迁移到 Windows 受保护存储，同时建立曜石 UI 基础。

**Architecture:** 可信更新逻辑进入独立 Rust 模块，由核心清单类型、签名工具、管理端下载验证器和 NSIS 启动确认共同组成。敏感数据通过可注入的秘密存储接口写入 Windows Credential Manager，普通设置只保留非敏感字段；诊断、备份和 UI 通过类型化 Tauri 命令访问这些能力。

**Tech Stack:** Rust 2024、Tauri 2、React 19、TypeScript 5.8、Node test、NSIS、SHA-256、Ed25519、Windows Credential Manager、PowerShell 构建脚本。

---

## File map

### New files

- `crates/codex-plus-core/src/release_manifest.rs` — 清单规范化、哈希和 Ed25519 签名验证。
- `crates/codex-plus-core/src/bin/codework-release-sign.rs` — 生成发布密钥与签名清单的构建工具。
- `crates/codex-plus-core/src/secret_store.rs` — 可测试的秘密存储接口和 Windows Credential Manager 实现。
- `crates/codex-plus-core/src/config_backup.rs` — 非敏感设置备份、版本化恢复与迁移。
- `apps/codex-plus-manager/src-tauri/src/release_update.rs` — 更新检查、下载验证、待确认状态和安装启动。
- `apps/codex-plus-manager/src-tauri/src/health_check.rs` — 一键体检、脱敏诊断包和修复建议。
- `apps/codex-plus-manager/src-tauri/src/member_session.rs` — 官方账号会话与记住密码的安全存取命令。
- `apps/codex-plus-manager/src/health-check.ts` — 体检结果类型、排序与文案映射。
- `apps/codex-plus-manager/src/health-check.test.ts` — 体检前端逻辑测试。
- `apps/codex-plus-manager/src/obsidian-theme.ts` — 身份色、皮肤色和基础主题层级。
- `apps/codex-plus-manager/src/obsidian-theme.test.ts` — 三层主题优先级测试。
- `release-assets/codework-release-public-key.txt` — 可公开提交的 Ed25519 公钥。

### Modified files

- `Cargo.toml`、`Cargo.lock`、`crates/codex-plus-core/Cargo.toml` — 增加 Ed25519、随机数和 Credential Manager 依赖。
- `crates/codex-plus-core/src/lib.rs`、`crates/codex-plus-core/src/paths.rs` — 导出新模块与新增状态路径。
- `crates/codex-plus-core/src/settings.rs` — 提取、清除、恢复设置中的敏感字段。
- `apps/codex-plus-manager/src-tauri/src/commands.rs` — 删除已迁出的更新逻辑，接入备份与诊断命令。
- `apps/codex-plus-manager/src-tauri/src/lib.rs`、`apps/codex-plus-manager/src-tauri/src/main.rs` — 注册新命令并支持更新启动确认标记。
- `apps/codex-plus-manager/src/release.ts`、`apps/codex-plus-manager/src/release.test.ts` — 增加校验、回滚和错误阶段。
- `apps/codex-plus-manager/src/App.tsx` — 改用安全会话命令，增加体检页与 1.3.37 首批曜石页面。
- `apps/codex-plus-manager/src/styles.css` — 曜石变量、身份色变量与首批页面组件。
- `scripts/installer/windows/CodeworkCodexPlusPlus.nsi` — 备份旧 EXE、等待新版确认、超时回滚。
- `scripts/build-codework-windows.ps1` — 生成签名清单并校验四处版本一致性。
- `release-assets/codework-ai-client-windows.json` — 升级为签名清单格式。
- 所有版本文件 — 从 1.3.36 提升到 1.3.37。

---

### Task 1: 建立签名发布清单核心

**Files:**
- Create: `crates/codex-plus-core/src/release_manifest.rs`
- Create: `crates/codex-plus-core/src/bin/codework-release-sign.rs`
- Modify: `Cargo.toml`
- Modify: `crates/codex-plus-core/Cargo.toml`
- Modify: `crates/codex-plus-core/src/lib.rs`
- Test: `crates/codex-plus-core/src/release_manifest.rs`

- [ ] **Step 1: 写清单规范化与篡改测试**

在 `release_manifest.rs` 的测试模块建立固定测试密钥，并验证：合法签名通过；修改版本、下载地址、大小、哈希或发布时间后失败；版本号不是三段数字时失败。

```rust
#[test]
fn signed_manifest_rejects_every_signed_field_change() {
    let signing = SigningKey::from_bytes(&[7_u8; 32]);
    let mut manifest = fixture_manifest();
    manifest.sign_with(&signing);
    assert!(manifest.verify(&signing.verifying_key()).is_ok());

    manifest.size += 1;
    assert!(manifest.verify(&signing.verifying_key()).is_err());
}

#[test]
fn manifest_requires_three_part_versions_and_https_or_http_downloads() {
    let mut manifest = fixture_manifest();
    manifest.version = "1.3".into();
    assert!(manifest.validate_shape().is_err());
}
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
cargo test -p codex-plus-core release_manifest -- --nocapture
```

Expected: FAIL，因为 `release_manifest` 模块和类型尚不存在。

- [ ] **Step 3: 实现清单类型与规范化载荷**

实现以下公开接口。签名载荷必须是固定字段顺序的 UTF-8 文本，更新说明不参与签名，避免换行或中文序列化差异影响校验。

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SignedReleaseManifest {
    pub version: String,
    pub download_url: String,
    pub size: u64,
    pub sha256: String,
    pub signature: String,
    pub published_at: String,
    pub minimum_supported_version: String,
    #[serde(default)]
    pub mandatory: bool,
    #[serde(default)]
    pub notes: Vec<String>,
}

impl SignedReleaseManifest {
    pub fn signing_payload(&self) -> Vec<u8> {
        format!(
            "version={}\ndownloadUrl={}\nsize={}\nsha256={}\npublishedAt={}\nminimumSupportedVersion={}\nmandatory={}\n",
            self.version.trim(),
            self.download_url.trim(),
            self.size,
            self.sha256.trim().to_ascii_lowercase(),
            self.published_at.trim(),
            self.minimum_supported_version.trim(),
            self.mandatory,
        ).into_bytes()
    }

    pub fn validate_shape(&self) -> anyhow::Result<()>;
    pub fn sign_with(&mut self, signing_key: &SigningKey);
    pub fn verify(&self, public_key: &VerifyingKey) -> anyhow::Result<()>;
}

pub fn sha256_file(path: &Path) -> anyhow::Result<String>;
pub fn parse_release_version(value: &str) -> Option<[u32; 3]>;
```

在 workspace 增加：

```toml
ed25519-dalek = { version = "2", features = ["rand_core"] }
rand = "0.8"
```

- [ ] **Step 4: 实现签名命令行工具**

二进制支持两个子命令：

```text
codework-release-sign generate-key --private-key <path> --public-key <path>
codework-release-sign sign-manifest --private-key <path> --installer <path> --version <version> --download-url <url> --published-at <rfc3339> --minimum-supported-version <version> --notes-file <json> --output <json>
```

私钥文件只写入 32 字节种子的 Base64；公钥文件写入 32 字节公钥的 Base64。`sign-manifest` 从安装包计算大小和 SHA-256，生成 `SignedReleaseManifest`，签名后以 UTF-8 无 BOM JSON 输出。

- [ ] **Step 5: 运行核心测试与 CLI 冒烟测试**

Run:

```powershell
cargo test -p codex-plus-core release_manifest -- --nocapture
$tmp = Join-Path $env:TEMP 'codework-release-sign-test'
New-Item -ItemType Directory -Force $tmp | Out-Null
cargo run -p codex-plus-core --bin codework-release-sign -- generate-key --private-key "$tmp\private.key" --public-key "$tmp\public.key"
```

Expected: Rust tests PASS；两个密钥文件存在且均能 Base64 解码为 32 字节。

- [ ] **Step 6: 生成生产发布密钥并提交公钥**

Run:

```powershell
New-Item -ItemType Directory -Force 'D:\Codework Secrets' | Out-Null
cargo run -p codex-plus-core --bin codework-release-sign -- generate-key --private-key 'D:\Codework Secrets\release-signing.key' --public-key 'release-assets\codework-release-public-key.txt'
icacls 'D:\Codework Secrets\release-signing.key' /inheritance:r /grant:r "$env:USERNAME:(R,W)"
```

Expected: 私钥只存在于 `D:\Codework Secrets`；仓库只新增公钥文件。

- [ ] **Step 7: 提交**

```powershell
git add Cargo.toml Cargo.lock crates/codex-plus-core/Cargo.toml crates/codex-plus-core/src/lib.rs crates/codex-plus-core/src/release_manifest.rs crates/codex-plus-core/src/bin/codework-release-sign.rs release-assets/codework-release-public-key.txt
git commit -m "feat: add signed Codework release manifests"
```

---

### Task 2: 把管理端更新逻辑迁入独立模块

**Files:**
- Create: `apps/codex-plus-manager/src-tauri/src/release_update.rs`
- Modify: `apps/codex-plus-manager/src-tauri/src/commands.rs`
- Modify: `apps/codex-plus-manager/src-tauri/src/lib.rs`
- Test: `apps/codex-plus-manager/src-tauri/src/release_update.rs`

- [ ] **Step 1: 写载荷与版本状态测试**

```rust
#[test]
fn checked_release_exposes_integrity_metadata_without_exposing_signature() {
    let payload = payload_from_manifest("1.3.36", fixture_manifest(), None);
    assert_eq!(payload.integrity_status, "verified_manifest");
    assert_eq!(payload.expected_size, Some(15_332_386));
    assert!(payload.download_url.as_deref().unwrap().ends_with(".exe"));
}

#[test]
fn incomplete_update_keeps_target_and_rollback_information() {
    let pending = PendingCodeworkUpdate::new("1.3.37", "1.3.36");
    assert_eq!(pending.target_version, "1.3.37");
    assert_eq!(pending.previous_version, "1.3.36");
}
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
cargo test -p codex-plus-manager release_update --lib -- --nocapture
```

Expected: FAIL，因为模块和新增字段尚不存在。

- [ ] **Step 3: 迁移更新职责**

将以下内容从 `commands.rs` 移入 `release_update.rs`：清单 URL、进度事件、清单获取、版本比较、待确认状态、下载和安装器启动。导出：

```rust
pub const RELEASE_PROGRESS_EVENT: &str = "codework-release-progress";

#[tauri::command]
pub async fn check_codework_release() -> CommandResult<CodeworkReleasePayload>;

#[tauri::command]
pub async fn install_codework_release(app: tauri::AppHandle) -> CommandResult<CodeworkReleasePayload>;

pub fn reconcile_pending_codework_update() -> Option<PendingCodeworkUpdate>;
```

`CodeworkReleasePayload` 增加 `integrityStatus`、`expectedSize`、`sha256`、`mandatory`、`minimumSupportedVersion`、`rollbackAvailable` 和 `lastFailure`。签名原文不返回前端。将 `commands.rs` 中共享的 `CommandResult`、`ok` 和 `failed` 改为 `pub(crate)`，供独立命令模块复用。

- [ ] **Step 4: 注册命令并删除重复实现**

在 `lib.rs` 添加 `pub mod release_update;`，启动时调用 `release_update::reconcile_pending_codework_update()`，`invoke_handler!` 使用 `release_update::check_codework_release` 与 `release_update::install_codework_release`。从 `commands.rs` 删除旧实现和旧测试，保留共享 `CommandResult` 为 `pub(crate)`。

- [ ] **Step 5: 运行测试**

Run:

```powershell
cargo test -p codex-plus-manager release_update --lib -- --nocapture
cargo test -p codex-plus-manager --lib --jobs 1
```

Expected: 新模块测试 PASS；原管理端测试全部 PASS。

- [ ] **Step 6: 提交**

```powershell
git add apps/codex-plus-manager/src-tauri/src/release_update.rs apps/codex-plus-manager/src-tauri/src/commands.rs apps/codex-plus-manager/src-tauri/src/lib.rs
git commit -m "refactor: isolate Codework self update service"
```

---

### Task 3: 下载后强制校验大小、哈希和签名

**Files:**
- Modify: `apps/codex-plus-manager/src-tauri/src/release_update.rs`
- Modify: `apps/codex-plus-manager/src/release.ts`
- Modify: `apps/codex-plus-manager/src/release.test.ts`
- Modify: `apps/codex-plus-manager/src/App.tsx`

- [ ] **Step 1: 写损坏文件与错误阶段测试**

Rust 测试使用临时文件验证大小不符和哈希不符均返回错误。TypeScript 测试验证 `verifying` 与 `rollback` 阶段可显示，`integrity_failed` 不能显示“安装完成”。

```ts
it("shows verification before installation", () => {
  assert.deepStrictEqual(getCodeworkUpdateSteps("verifying"), [
    "downloading", "downloaded", "verifying", "installing", "closing", "relaunching",
  ]);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
node --test --experimental-strip-types apps/codex-plus-manager/src/release.test.ts
cargo test -p codex-plus-manager release_update --lib -- --nocapture
```

Expected: FAIL，阶段和校验函数尚不存在。

- [ ] **Step 3: 实现文件校验**

下载完成后、重命名 `.part` 文件前执行：

```rust
fn verify_downloaded_installer(path: &Path, manifest: &SignedReleaseManifest) -> anyhow::Result<()> {
    let actual_size = fs::metadata(path)?.len();
    anyhow::ensure!(actual_size == manifest.size, "安装包大小校验失败");
    let actual_sha256 = codex_plus_core::release_manifest::sha256_file(path)?;
    anyhow::ensure!(actual_sha256.eq_ignore_ascii_case(&manifest.sha256), "安装包哈希校验失败");
    manifest.verify(embedded_release_public_key()?)?;
    Ok(())
}
```

进度顺序为 `downloading → downloaded → verifying → installing → closing → relaunching`。校验失败时删除 `.part` 和旧临时安装包，清除待确认状态，返回“安装包校验失败，当前版本未受影响”。

- [ ] **Step 4: 更新前端状态与中文文案**

`CodeworkUpdateStage` 增加 `verifying`、`rollback` 和 `failed`。更新页显示清单完整性、安装包大小和失败原因，不展示原始签名。

- [ ] **Step 5: 运行测试与类型检查**

Run:

```powershell
node --test --experimental-strip-types apps/codex-plus-manager/src/release.test.ts
npm --prefix apps/codex-plus-manager run check
cargo test -p codex-plus-manager release_update --lib -- --nocapture
```

Expected: 全部 PASS。

- [ ] **Step 6: 提交**

```powershell
git add apps/codex-plus-manager/src-tauri/src/release_update.rs apps/codex-plus-manager/src/release.ts apps/codex-plus-manager/src/release.test.ts apps/codex-plus-manager/src/App.tsx
git commit -m "feat: verify downloaded client updates"
```

---

### Task 4: 安装器启动确认与自动回滚

**Files:**
- Modify: `scripts/installer/windows/CodeworkCodexPlusPlus.nsi`
- Modify: `apps/codex-plus-manager/src-tauri/src/main.rs`
- Modify: `apps/codex-plus-manager/src-tauri/src/lib.rs`
- Modify: `apps/codex-plus-manager/src-tauri/src/release_update.rs`
- Modify: `crates/codex-plus-core/src/paths.rs`
- Test: `apps/codex-plus-manager/src-tauri/tests/windows_subsystem.rs`

- [ ] **Step 1: 写安装器契约测试**

测试脚本必须包含旧 EXE 备份、`--confirm-update` 启动参数、确认文件等待循环、失败恢复和旧版重启；仍禁止对 manager 使用 `taskkill /T`。

```rust
#[test]
fn installer_waits_for_new_manager_and_restores_previous_binaries_on_timeout() {
    let script = include_str!("../../../../scripts/installer/windows/CodeworkCodexPlusPlus.nsi");
    assert!(script.contains("codework-codex-plus-plus-manager.exe.previous"));
    assert!(script.contains("--confirm-update"));
    assert!(script.contains("rollback_update"));
    assert!(!script.contains("manager.exe /F /T"));
}
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
cargo test -p codex-plus-manager installer_waits_for_new_manager --test windows_subsystem -- --nocapture
```

Expected: FAIL，NSIS 尚无确认和回滚逻辑。

- [ ] **Step 3: 增加状态路径与启动确认**

`paths.rs` 增加：

```rust
pub fn default_update_confirmation_path() -> PathBuf {
    default_app_state_dir().join("update-start-confirmed.json")
}

pub fn default_update_rollback_path() -> PathBuf {
    default_app_state_dir().join("update-rollback.json")
}
```

`main.rs` 解析 `--confirm-update <absolute-path>`，将路径传给 `codex_plus_manager_lib::run(marker)`。`lib.rs` 只在 Tauri 主窗口和托盘成功创建后原子写入：

```json
{"version":"1.3.37","confirmedAtMs":1784450000000}
```

- [ ] **Step 4: 实现 NSIS 备份与回滚**

安装前把两个旧 EXE 复制为 `.previous`；复制新版后启动：

```nsis
Exec '$"$INSTDIR\codework-codex-plus-plus-manager.exe$" --confirm-update $"$PROFILE\.codework-codex-plus-plus\update-start-confirmed.json$"'
```

最多等待 20 秒。确认文件存在则删除 `.previous`。超时则进入 `rollback_update`：结束新版 manager，删除新版两个 EXE，将 `.previous` 恢复为正式文件，写入 `update-rollback.json`，启动旧 manager，并以非零安装错误码退出。

- [ ] **Step 5: 运行测试与构建安装器**

Run:

```powershell
cargo test -p codex-plus-manager --test windows_subsystem -- --nocapture
& "$env:ProgramFiles(x86)\NSIS\makensis.exe" /INPUTCHARSET UTF8 /DVERSION=1.3.37 scripts\installer\windows\CodeworkCodexPlusPlus.nsi
```

Expected: 测试 PASS；NSIS 构建成功。

- [ ] **Step 6: 提交**

```powershell
git add scripts/installer/windows/CodeworkCodexPlusPlus.nsi apps/codex-plus-manager/src-tauri/src/main.rs apps/codex-plus-manager/src-tauri/src/lib.rs apps/codex-plus-manager/src-tauri/src/release_update.rs crates/codex-plus-core/src/paths.rs apps/codex-plus-manager/src-tauri/tests/windows_subsystem.rs
git commit -m "feat: rollback failed client updates"
```

---

### Task 5: 建立可测试的 Windows 安全秘密存储

**Files:**
- Create: `crates/codex-plus-core/src/secret_store.rs`
- Modify: `Cargo.toml`
- Modify: `crates/codex-plus-core/Cargo.toml`
- Modify: `crates/codex-plus-core/src/lib.rs`
- Test: `crates/codex-plus-core/src/secret_store.rs`

- [ ] **Step 1: 写内存后端测试**

```rust
#[test]
fn secret_store_sets_gets_and_deletes_without_returning_values_in_inventory() {
    let backend = MemorySecretBackend::default();
    let store = SecretStore::new(backend);
    store.set("member/access-token", "token-value").unwrap();
    assert_eq!(store.get("member/access-token").unwrap().as_deref(), Some("token-value"));
    assert_eq!(store.inventory().unwrap(), vec!["member/access-token".to_string()]);
    store.delete("member/access-token").unwrap();
    assert_eq!(store.get("member/access-token").unwrap(), None);
}
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
cargo test -p codex-plus-core secret_store -- --nocapture
```

Expected: FAIL，秘密存储模块尚不存在。

- [ ] **Step 3: 实现接口与 Windows 后端**

```rust
pub trait SecretBackend: Send + Sync {
    fn set(&self, key: &str, value: &str) -> anyhow::Result<()>;
    fn get(&self, key: &str) -> anyhow::Result<Option<String>>;
    fn delete(&self, key: &str) -> anyhow::Result<()>;
    fn list_keys(&self) -> anyhow::Result<Vec<String>>;
}

pub struct SecretStore<B: SecretBackend> { backend: B }
```

Windows 实现使用 `keyring::Entry`，服务名固定为 `Codework AI客户端`。另在应用状态目录保存只含键名的 `secret-inventory.json`，不得保存值。非 Windows 构建返回清晰的“不支持安全凭据存储”错误；测试使用 `MemorySecretBackend`。

Workspace 增加：

```toml
keyring = "3"
```

- [ ] **Step 4: 运行测试**

Run:

```powershell
cargo test -p codex-plus-core secret_store -- --nocapture
```

Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add Cargo.toml Cargo.lock crates/codex-plus-core/Cargo.toml crates/codex-plus-core/src/lib.rs crates/codex-plus-core/src/secret_store.rs
git commit -m "feat: add protected Windows secret storage"
```

---

### Task 6: 迁移设置、账号令牌和记住密码

**Files:**
- Create: `apps/codex-plus-manager/src-tauri/src/member_session.rs`
- Modify: `crates/codex-plus-core/src/settings.rs`
- Modify: `apps/codex-plus-manager/src-tauri/src/commands.rs`
- Modify: `apps/codex-plus-manager/src-tauri/src/lib.rs`
- Modify: `apps/codex-plus-manager/src/App.tsx`
- Modify: `apps/codex-plus-manager/src/member.ts`
- Test: `crates/codex-plus-core/src/settings.rs`
- Test: `apps/codex-plus-manager/src/member.test.ts`

- [ ] **Step 1: 写敏感字段提取与迁移测试**

测试覆盖全局 relay key、每个 profile 的 API key、stepwise key、主题会员令牌、账号 access token 和记住密码。普通设置序列化后不得出现 `sk-`、密码或令牌文本。

```rust
#[test]
fn persisted_settings_strip_all_known_secret_fields() {
    let settings = settings_with_secrets();
    let (public, secrets) = split_settings_secrets(settings);
    let json = serde_json::to_string(&public).unwrap();
    assert!(!json.contains("sk-secret"));
    assert_eq!(secrets.get("relay/profile/main/api-key").unwrap(), "sk-secret");
}
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
cargo test -p codex-plus-core persisted_settings_strip_all_known_secret_fields -- --nocapture
node --test --experimental-strip-types apps/codex-plus-manager/src/member.test.ts
```

Expected: Rust 新测试 FAIL；现有 member 测试保持 PASS。

- [ ] **Step 3: 实现设置拆分与恢复**

新增：

```rust
pub type SecretMap = BTreeMap<String, String>;

pub fn split_settings_secrets(mut settings: BackendSettings) -> (BackendSettings, SecretMap);
pub fn hydrate_settings_secrets(settings: BackendSettings, secrets: &SecretMap) -> BackendSettings;
```

秘密键名使用稳定路径，例如 `relay/profile/{id}/api-key`、`stepwise/api-key`、`theme/member-token`。`SettingsStore::save` 先把 secrets 全部写入安全存储，全部成功后才原子写入无秘密设置；`load` 读取普通设置后从安全存储恢复运行时结构。

- [ ] **Step 4: 增加安全会话命令**

`member_session.rs` 导出：

```rust
#[tauri::command]
pub fn load_member_session() -> CommandResult<MemberSessionPayload>;

#[tauri::command]
pub fn save_member_session(access_token: String, username: String, password: String, remember_password: bool) -> CommandResult<MemberSessionPayload>;

#[tauri::command]
pub fn clear_member_session() -> CommandResult<MemberSessionPayload>;
```

密码只有用户勾选“记住密码”时写入安全存储。前端启动后调用 `load_member_session`，不再从 localStorage 读取 access token 或密码。成功迁移后删除 `codework-member-access-token` 与 `codework-member-remembered-credentials-v1`。

- [ ] **Step 5: 运行迁移测试、类型检查与全量设置测试**

Run:

```powershell
cargo test -p codex-plus-core settings -- --nocapture
cargo test -p codex-plus-manager member_session --lib -- --nocapture
node --test --experimental-strip-types apps/codex-plus-manager/src/member.test.ts
npm --prefix apps/codex-plus-manager run check
```

Expected: 全部 PASS；设置测试中无明文敏感字段。

- [ ] **Step 6: 提交**

```powershell
git add crates/codex-plus-core/src/settings.rs apps/codex-plus-manager/src-tauri/src/member_session.rs apps/codex-plus-manager/src-tauri/src/commands.rs apps/codex-plus-manager/src-tauri/src/lib.rs apps/codex-plus-manager/src/App.tsx apps/codex-plus-manager/src/member.ts apps/codex-plus-manager/src/member.test.ts
git commit -m "feat: migrate client credentials to protected storage"
```

---

### Task 7: 配置备份与版本化恢复

**Files:**
- Create: `crates/codex-plus-core/src/config_backup.rs`
- Modify: `crates/codex-plus-core/src/lib.rs`
- Modify: `crates/codex-plus-core/src/paths.rs`
- Modify: `apps/codex-plus-manager/src-tauri/src/commands.rs`
- Modify: `apps/codex-plus-manager/src-tauri/src/lib.rs`
- Modify: `apps/codex-plus-manager/src/App.tsx`
- Test: `crates/codex-plus-core/src/config_backup.rs`

- [ ] **Step 1: 写无秘密备份和恢复预览测试**

```rust
#[test]
fn backup_excludes_secrets_and_reports_changed_sections_before_restore() {
    let backup = create_backup(&settings_with_secrets(), "1.3.37").unwrap();
    let json = serde_json::to_string(&backup).unwrap();
    assert!(!json.contains("sk-secret"));
    let preview = preview_restore(&BackendSettings::default(), &backup).unwrap();
    assert!(preview.changed_sections.contains(&"relayProfiles".to_string()));
}
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
cargo test -p codex-plus-core config_backup -- --nocapture
```

Expected: FAIL，模块尚不存在。

- [ ] **Step 3: 实现备份格式与原子恢复**

```rust
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigBackup {
    pub schema_version: u32,
    pub client_version: String,
    pub created_at_ms: u64,
    pub settings: BackendSettings,
}
```

备份目录为 `~/.codework-codex-plus-plus/backups`。恢复先解析、校验 schema、生成变更预览；用户确认后保存当前自动备份，再写入恢复设置。任何失败都保留恢复前设置。

- [ ] **Step 4: 增加 Tauri 命令与账户中心入口**

注册 `list_config_backups`、`create_config_backup`、`preview_config_restore` 和 `restore_config_backup`。账户中心显示最近备份、手动备份和恢复按钮；恢复必须二次确认。

- [ ] **Step 5: 运行测试与类型检查**

Run:

```powershell
cargo test -p codex-plus-core config_backup -- --nocapture
cargo test -p codex-plus-manager --lib --jobs 1
npm --prefix apps/codex-plus-manager run check
```

Expected: 全部 PASS。

- [ ] **Step 6: 提交**

```powershell
git add crates/codex-plus-core/src/config_backup.rs crates/codex-plus-core/src/lib.rs crates/codex-plus-core/src/paths.rs apps/codex-plus-manager/src-tauri/src/commands.rs apps/codex-plus-manager/src-tauri/src/lib.rs apps/codex-plus-manager/src/App.tsx
git commit -m "feat: add versioned client configuration backups"
```

---

### Task 8: 一键体检与脱敏诊断

**Files:**
- Create: `apps/codex-plus-manager/src-tauri/src/health_check.rs`
- Create: `apps/codex-plus-manager/src/health-check.ts`
- Create: `apps/codex-plus-manager/src/health-check.test.ts`
- Modify: `apps/codex-plus-manager/src-tauri/src/lib.rs`
- Modify: `apps/codex-plus-manager/src/App.tsx`
- Modify: `apps/codex-plus-manager/src/styles.css`

- [ ] **Step 1: 写健康项排序和脱敏测试**

```ts
it("orders failures before warnings and healthy checks", () => {
  const ordered = orderHealthChecks([
    { id: "network", status: "ok" },
    { id: "versions", status: "failed" },
    { id: "disk", status: "warning" },
  ] as HealthCheckItem[]);
  assert.deepStrictEqual(ordered.map((item) => item.id), ["versions", "disk", "network"]);
});
```

Rust 测试验证诊断包文本中的 `sk-`、Bearer token、password 和聊天正文被替换为 `[REDACTED]`。

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
node --test --experimental-strip-types apps/codex-plus-manager/src/health-check.test.ts
cargo test -p codex-plus-manager health_check --lib -- --nocapture
```

Expected: FAIL，新模块尚不存在。

- [ ] **Step 3: 实现体检项目**

`run_health_check` 返回：两个 EXE 版本、服务器清单、安装目录权限、磁盘空间、设置解析、秘密存储、账号服务、中转服务、主题服务和最近更新状态。每项结构为：

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthCheckItem {
    pub id: String,
    pub title: String,
    pub status: String,
    pub summary: String,
    pub action: Option<String>,
}
```

增加 `export_redacted_support_bundle`，只写入健康结果、版本、路径是否存在、脱敏日志和配置字段名，不写入配置值。

- [ ] **Step 4: 实现体检页面**

在维护页增加“全面体检”卡片：运行按钮、总体状态、失败优先列表、人话建议和导出诊断包按钮。网络失败不得阻塞本地项目检查。

- [ ] **Step 5: 运行测试和前端构建**

Run:

```powershell
node --test --experimental-strip-types apps/codex-plus-manager/src/health-check.test.ts
cargo test -p codex-plus-manager health_check --lib -- --nocapture
npm --prefix apps/codex-plus-manager run check
npm --prefix apps/codex-plus-manager run vite:build
```

Expected: 全部 PASS。

- [ ] **Step 6: 提交**

```powershell
git add apps/codex-plus-manager/src-tauri/src/health_check.rs apps/codex-plus-manager/src/health-check.ts apps/codex-plus-manager/src/health-check.test.ts apps/codex-plus-manager/src-tauri/src/lib.rs apps/codex-plus-manager/src/App.tsx apps/codex-plus-manager/src/styles.css
git commit -m "feat: add one click client health checks"
```

---

### Task 9: 建立曜石 UI 变量和首批页面

**Files:**
- Create: `apps/codex-plus-manager/src/obsidian-theme.ts`
- Create: `apps/codex-plus-manager/src/obsidian-theme.test.ts`
- Modify: `apps/codex-plus-manager/src/App.tsx`
- Modify: `apps/codex-plus-manager/src/styles.css`
- Modify: `apps/codex-plus-manager/src/client-skin.ts`

- [ ] **Step 1: 写三层主题优先级测试**

```ts
it("keeps identity accents above client skin accents", () => {
  assert.deepStrictEqual(resolveObsidianTheme({ skin: "pink", role: "admin" }), {
    base: "obsidian",
    skinAccent: "pink",
    identityAccent: "royal-blue",
  });
});

it("maps founder and vip identities to distinct accents", () => {
  assert.equal(resolveIdentityAccent("founder"), "dark-red");
  assert.equal(resolveIdentityAccent("supremeVip"), "gold");
  assert.equal(resolveIdentityAccent("vip"), "muted-cyan");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
node --test --experimental-strip-types apps/codex-plus-manager/src/obsidian-theme.test.ts
```

Expected: FAIL，主题解析模块尚不存在。

- [ ] **Step 3: 实现主题解析与 CSS 变量**

导出 `resolveObsidianTheme`、`resolveIdentityAccent` 和 `applyObsidianThemeToRoot`。根元素设置：

```text
data-codework-base="obsidian"
data-codework-skin="blue|pink|default"
data-codework-identity="founder|director|admin|supreme-vip|vip|member"
```

CSS 定义 `--cw-bg-*`、`--cw-surface-*`、`--cw-text-*`、`--cw-skin-accent` 和 `--cw-identity-accent`。身份皇冠和头像只能使用 identity accent；普通按钮和卡片高光使用 skin accent。

- [ ] **Step 4: 迁移 1.3.37 首批页面**

迁移登录页、首页、账户中心、版本更新和体检页。统一卡片层次、按钮、图标、输入框、加载、空状态、错误提示和二次确认。不得修改其业务请求或权限判断。

- [ ] **Step 5: 运行视觉契约、类型检查与构建**

Run:

```powershell
node --test --experimental-strip-types apps/codex-plus-manager/src/obsidian-theme.test.ts apps/codex-plus-manager/src/client-skin.test.ts apps/codex-plus-manager/src/visual-theme-contract.test.ts
npm --prefix apps/codex-plus-manager run check
npm --prefix apps/codex-plus-manager run vite:build
```

Expected: 全部 PASS；构建产物生成。

- [ ] **Step 6: 提交**

```powershell
git add apps/codex-plus-manager/src/obsidian-theme.ts apps/codex-plus-manager/src/obsidian-theme.test.ts apps/codex-plus-manager/src/client-skin.ts apps/codex-plus-manager/src/App.tsx apps/codex-plus-manager/src/styles.css
git commit -m "feat: introduce the obsidian identity design system"
```

---

### Task 10: 构建脚本生成签名清单并锁定版本一致性

**Files:**
- Modify: `scripts/build-codework-windows.ps1`
- Modify: `release-assets/codework-ai-client-windows.json`
- Modify: `apps/codex-plus-manager/src-tauri/src/release_update.rs`
- Test: `apps/codex-plus-manager/src-tauri/tests/windows_subsystem.rs`

- [ ] **Step 1: 写构建脚本契约测试**

测试必须验证构建脚本调用 `codework-release-sign sign-manifest`，要求私钥路径存在，并检查 Cargo、manager package、Tauri 配置、安装包和清单版本全部一致。

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
cargo test -p codex-plus-manager signed_release --test windows_subsystem -- --nocapture
```

Expected: FAIL，构建脚本尚未签名清单。

- [ ] **Step 3: 修改构建脚本**

构建脚本读取：

```powershell
$signingKey = $env:CODEWORK_RELEASE_SIGNING_KEY
if ([string]::IsNullOrWhiteSpace($signingKey)) {
    $signingKey = 'D:\Codework Secrets\release-signing.key'
}
if (-not (Test-Path -LiteralPath $signingKey)) {
    throw "Release signing key is unavailable: $signingKey"
}
```

安装包生成后调用签名工具，输出版本化清单和 `codework-ai-client-windows.json`。脚本随后重新解析清单，校验版本、大小和 SHA-256 与安装包一致。

- [ ] **Step 4: 更新客户端嵌入公钥与清单样例**

`release_update.rs` 通过 `include_str!("../../../../release-assets/codework-release-public-key.txt")` 读取公钥。仓库清单样例使用真实 1.3.37 构建结果，不保留空签名或伪造哈希。

- [ ] **Step 5: 运行测试**

Run:

```powershell
cargo test -p codex-plus-manager --test windows_subsystem -- --nocapture
```

Expected: PASS。

- [ ] **Step 6: 提交**

```powershell
git add scripts/build-codework-windows.ps1 release-assets/codework-ai-client-windows.json apps/codex-plus-manager/src-tauri/src/release_update.rs apps/codex-plus-manager/src-tauri/tests/windows_subsystem.rs
git commit -m "build: produce signed Codework release metadata"
```

---

### Task 11: 提升版本、全量验证、真实升级与发布

**Files:**
- Modify: `Cargo.toml`
- Modify: `Cargo.lock`
- Modify: `apps/codex-plus-manager/package.json`
- Modify: `apps/codex-plus-manager/package-lock.json`
- Modify: `apps/codex-plus-manager/src-tauri/tauri.conf.json`
- Modify: `scripts/build-codework-windows.ps1`
- Modify: `release-assets/codework-ai-client-windows.json`
- Create: `D:\Codework Releases\♛Codework AI客户端-1.3.37\*`（构建产物，不提交）

- [ ] **Step 1: 将所有版本源统一提升到 1.3.37**

同步 workspace、manager package、Tauri、构建脚本和发布清单。运行版本扫描，确认仓库运行路径中不存在仍应更新的 1.3.36 常量。

Run:

```powershell
rg -n '1\.3\.36' Cargo.toml Cargo.lock apps/codex-plus-manager/package.json apps/codex-plus-manager/package-lock.json apps/codex-plus-manager/src-tauri/tauri.conf.json scripts/build-codework-windows.ps1 release-assets/codework-ai-client-windows.json
```

Expected: 无输出。

- [ ] **Step 2: 运行完整测试**

Run:

```powershell
node --test --experimental-strip-types apps/codex-plus-manager/src/*.test.ts
npm --prefix apps/codex-plus-manager run check
cargo test --workspace --jobs 1
```

Expected: 0 failed。

- [ ] **Step 3: 构建 Windows 发布包**

Run:

```powershell
$env:CODEWORK_RELEASE_SIGNING_KEY = 'D:\Codework Secrets\release-signing.key'
powershell -ExecutionPolicy Bypass -File scripts\build-codework-windows.ps1
```

Expected: 构建成功；发布目录包含安装包、ZIP、更新说明、使用小贴士、版本化签名清单和最新版签名清单。

- [ ] **Step 4: 本机篡改拒绝测试**

复制安装包，修改一个字节，使用管理端验证函数或测试工具校验。

Expected: 原安装包 PASS；修改后的安装包 FAIL，且不会启动安装器。

- [ ] **Step 5: 从 1.3.36 真实覆盖升级到 1.3.37**

先确认本机两个 EXE 都是 1.3.36，再通过管理端版本更新入口完成更新。验证：旧进程退出、新安装器继续运行、两个 EXE 变为 1.3.37、新 manager 自动启动、确认标记成功、`.previous` 备份清理、账号与模型配置仍存在、待更新文件消失。

- [ ] **Step 6: 回滚演练**

使用测试构建让新版不写确认标记，运行静默更新。

Expected: 20 秒后恢复两个 1.3.36 EXE，旧 manager 自动启动，`update-rollback.json` 记录目标版本与原因。

- [ ] **Step 7: 上传服务器并原子切换最新版清单**

上传安装包、版本化清单和最新版清单到 `/opt/xiaoshuai-lottery`，复制到容器 `/app/data/downloads`。先发布版本化文件并从公网下载校验哈希，再覆盖 `codework-ai-client-windows.json`。

- [ ] **Step 8: 公网发布验证**

Run:

```powershell
$manifest = Invoke-RestMethod 'http://115.190.199.191:20080/downloads/codework-ai-client-windows.json'
if ($manifest.version -ne '1.3.37') { throw 'Public manifest version mismatch' }
$download = Join-Path $env:TEMP 'codework-ai-client-1.3.37-public.exe'
Invoke-WebRequest $manifest.downloadUrl -OutFile $download
if ((Get-FileHash $download -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.sha256.ToLowerInvariant()) { throw 'Public hash mismatch' }
```

Expected: 版本为 1.3.37；公网文件大小、SHA-256 和签名全部通过。

- [ ] **Step 9: 提交版本与发布元数据**

```powershell
git add Cargo.toml Cargo.lock apps/codex-plus-manager/package.json apps/codex-plus-manager/package-lock.json apps/codex-plus-manager/src-tauri/tauri.conf.json scripts/build-codework-windows.ps1 release-assets/codework-ai-client-windows.json
git commit -m "release: prepare Codework AI client 1.3.37"
```

---

## Final acceptance checklist

- [ ] 1.3.36 能通过客户端入口升级到 1.3.37。
- [ ] 下载包大小、SHA-256 或签名任一不符时拒绝安装。
- [ ] 新版未确认启动时自动恢复上一版。
- [ ] 两个 EXE、右上角版本和服务器清单均为 1.3.37。
- [ ] API Key、官方账号令牌、主题令牌和记住密码不再出现在明文设置或 localStorage。
- [ ] 原有模型、主题、账号和其他非敏感配置保留。
- [ ] 登录、首页、账户、更新和体检页使用曜石设计系统。
- [ ] 创始人、总监、管理员、至尊 VIP、普通 VIP 和普通用户身份色符合设计。
- [ ] 蓝粉客户端皮肤不覆盖身份皇冠；Codex 皮肤不影响客户端主题。
- [ ] 一键体检能识别版本不一致、磁盘不足、服务不可用和最近更新失败。
- [ ] 全部自动化测试、类型检查、构建、真实升级、回滚和公网验证通过。

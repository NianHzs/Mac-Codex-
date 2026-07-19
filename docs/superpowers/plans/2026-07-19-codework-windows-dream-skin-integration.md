# Codework Windows Dream Skin Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Embed the mature Windows Codex Dream Skin experience into the ♛Codework AI客户端 personalization page, with secure Store-app CDP injection, real theme verification, server-authorized remote themes, and no standalone tray or shortcut.

**Architecture:** Keep the upstream Dream Skin renderer and stylesheet as versioned, unmodified vendored assets. Add focused Rust modules for theme storage, secure CDP lifecycle and verification; expose them through Tauri commands; extend the existing theme service contract with revision and SHA-256 metadata; replace the current duplicate Codex-page theme path with one Dream Skin owner while leaving the manager blue/pink skin independent.

**Tech Stack:** Rust 2024, Tauri 2, existing Tokio CDP bridge, React 19 + TypeScript, Node test runner, existing `services/codework-theme-service`, SHA-256, Windows Store package activation.

---

## File map

### New files

- `crates/codex-plus-core/src/dream_skin.rs` — theme schema, local store, asset validation, lifecycle state and pure transition helpers.
- `crates/codex-plus-core/src/dream_skin_cdp.rs` — loopback Browser-ID CDP validation, early script registration, injection verification and cleanup.
- `crates/codex-plus-core/tests/dream_skin.rs` — store, schema, safety and state-machine tests.
- `apps/codex-plus-manager/src-tauri/src/dream_skin_commands.rs` — Tauri payloads and Windows command handlers.
- `apps/codex-plus-manager/src/dream-skin.ts` — UI-safe payload normalization, progress labels and view state helpers.
- `apps/codex-plus-manager/src/dream-skin.test.ts` — frontend contract tests.
- `assets/vendor/fei-away-codex-dream-skin/UPSTREAM.md` — pinned upstream source, revision, hashes, MIT/NOTICE acknowledgement.

### Modified files

- `crates/codex-plus-core/src/lib.rs` — export Dream Skin modules.
- `crates/codex-plus-core/src/assets.rs` — load only the pinned upstream renderer/CSS and a narrow Codework payload adapter.
- `crates/codex-plus-core/src/cdp.rs` — reject non-loopback or wrong-port WebSocket URLs.
- `crates/codex-plus-core/src/launcher.rs` — bind CDP to `127.0.0.1`, own a Browser ID, and let Dream Skin run before the generic bridge watchdog.
- `crates/codex-plus-core/src/paths.rs` — Dream Skin state/cache paths.
- `apps/codex-plus-manager/src-tauri/src/lib.rs` — register Dream Skin commands.
- `apps/codex-plus-manager/src-tauri/src/commands.rs` — retire old visual-theme-only commands after migration and preserve normal settings saves.
- `apps/codex-plus-manager/src/App.tsx` — replace the current Codex visual-theme screen behavior with the integrated Dream Skin actions and live progress.
- `apps/codex-plus-manager/src/visual-theme-contract.ts` — extend server theme metadata without mixing it with manager UI skin variables.
- `assets/inject/renderer-inject.js` — remove duplicate Codework Codex-page skin ownership; keep only the adapter call into the pinned Dream Skin runtime.
- `services/codework-theme-service/server.mjs` — expose revision, SHA-256 and expiry metadata only to authorized members.
- `services/codework-theme-service/server.test.mjs` — service authorization and resource-integrity tests.
- `THIRD_PARTY_NOTICES.txt` — preserve Dream Skin MIT attribution and the source/asset boundary.

### Preconditions

- Complete the current 1.3.37 protected-storage task before this plan begins. `theme/member-token` and the member access token must use the Windows secret backend; no theme token may persist in `settings.json` or browser localStorage.
- Use the existing isolated `codex/codework-distribution` worktree. Preserve unrelated user changes and stage only files named in each task.
- Do not bundle or publish third-party character/person images. The test fixtures and default theme must use an original or licensed image.

### Task 1: Pin and isolate the upstream Dream Skin renderer

**Files:**
- Modify: `assets/vendor/fei-away-codex-dream-skin/dream-skin.css`
- Modify: `assets/vendor/fei-away-codex-dream-skin/renderer-inject.js`
- Create: `assets/vendor/fei-away-codex-dream-skin/UPSTREAM.md`
- Modify: `THIRD_PARTY_NOTICES.txt`
- Modify: `crates/codex-plus-core/src/assets.rs`
- Test: `crates/codex-plus-core/src/assets.rs`

- [ ] **Step 1: Write the failing asset-boundary test**

Add this test to `crates/codex-plus-core/src/assets.rs`:

```rust
#[test]
fn dream_skin_assets_are_pinned_and_the_adapter_has_one_owner() {
    let script = injection_script(57321);
    assert!(include_str!("../../../assets/vendor/fei-away-codex-dream-skin/UPSTREAM.md")
        .contains("Codex Dream Skin"));
    assert!(script.contains("window.__CODEWORK_DREAM_SKIN_PAYLOAD__"));
    assert_eq!(script.matches("codework-dream-skin-style").count(), 1);
    assert!(!renderer_script().contains("setCodeworkVisualThemeTokens"));
}
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```powershell
cargo test -p codex-plus-core dream_skin_assets_are_pinned --jobs 1 -- --nocapture --test-threads=1
```

Expected: FAIL because the new payload symbol and single-owner boundary do not yet exist.

- [ ] **Step 3: Vendor the Windows upstream files without Codework edits**

Copy only the renderer and stylesheet from `C:\Users\19128\Desktop\codexSkin\windows\assets\`. Add `UPSTREAM.md` containing the exact upstream URL, source folder, SHA-256 of both files, MIT license notice, and a statement that character/person images are not vendored.

The adapter in `assets.rs` must expose only immutable serialized data:

```rust
"window.__CODEWORK_DREAM_SKIN_PAYLOAD__ = {};\n{}",
serde_json::to_string(&dream_skin_payload).expect("Dream Skin payload serializes"),
fei_away_dream_skin_runner(),
```

Do not append a second visual-theme renderer after the upstream runner.

- [ ] **Step 4: Remove the duplicate Codework Codex-page skin owner**

In `assets/inject/renderer-inject.js`, replace the existing Dream/character theme application entrypoint with one call that reads `window.__CODEWORK_DREAM_SKIN_PAYLOAD__`. Keep manager-only visual UI and identity code out of this file. The adapter must call upstream cleanup before applying a different `revision`.

- [ ] **Step 5: Run the asset test and syntax checks**

Run:

```powershell
cargo test -p codex-plus-core dream_skin_assets_are_pinned --jobs 1 -- --nocapture --test-threads=1
node --check assets/vendor/fei-away-codex-dream-skin/renderer-inject.js
node --check assets/inject/renderer-inject.js
```

Expected: all commands PASS.

- [ ] **Step 6: Commit the isolated upstream boundary**

```powershell
git add assets/vendor/fei-away-codex-dream-skin assets/inject/renderer-inject.js crates/codex-plus-core/src/assets.rs THIRD_PARTY_NOTICES.txt
git commit -m "feat: pin Dream Skin renderer assets"
```

### Task 2: Add a safe local Dream Skin store and state machine

**Files:**
- Create: `crates/codex-plus-core/src/dream_skin.rs`
- Modify: `crates/codex-plus-core/src/lib.rs`
- Modify: `crates/codex-plus-core/src/paths.rs`
- Test: `crates/codex-plus-core/src/dream_skin.rs`

- [ ] **Step 1: Write the failing store and transition tests**

Add these tests before implementation:

```rust
#[test]
fn theme_store_accepts_a_verified_asset_and_rejects_path_escape() {
    let root = tempfile::tempdir().unwrap();
    let store = DreamSkinStore::new(root.path().join("DreamSkin"));
    let asset = DreamSkinAsset::fixture("brand", b"verified-image", "image/png");
    store.commit_theme(&DreamSkinTheme::fixture("brand"), &asset).unwrap();
    assert!(store.theme_path("brand").join("theme.json").exists());
    assert!(store.commit_theme(&DreamSkinTheme::fixture("../escape"), &asset).is_err());
}

#[test]
fn apply_state_requires_verified_before_active_and_restore_clears_owner() {
    let prepared = DreamSkinStatus::Preparing;
    assert_eq!(prepared.advance(DreamSkinEvent::AssetsVerified).unwrap(), DreamSkinStatus::Applying);
    assert_eq!(DreamSkinStatus::Applying.advance(DreamSkinEvent::RendererVerified).unwrap(), DreamSkinStatus::Active);
    assert_eq!(DreamSkinStatus::Active.advance(DreamSkinEvent::Restore).unwrap(), DreamSkinStatus::Off);
}
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run:

```powershell
cargo test -p codex-plus-core dream_skin --jobs 1 -- --nocapture --test-threads=1
```

Expected: FAIL because `DreamSkinStore`, `DreamSkinTheme` and state types do not exist.

- [ ] **Step 3: Implement the schema and store**

Define only these public types:

```rust
pub struct DreamSkinTheme {
    pub id: String,
    pub revision: String,
    pub name: String,
    pub appearance: DreamAppearance,
    pub art: DreamSkinArt,
    pub asset_name: String,
    pub sha256: String,
}

pub enum DreamSkinStatus { Off, Preparing, RestartRequired, Applying, Verifying, Active, Paused, Failed }
pub enum DreamSkinEvent { AssetsVerified, RestartApproved, InjectionStarted, RendererVerified, Pause, Resume, Restore, Failed }
```

Store each theme under `default_app_state_dir()/DreamSkin`, validate theme IDs with `^[a-z][a-z0-9-]{0,63}$`, enforce 16 MB/16384px/50MP, verify SHA-256 before commit, reject reparse-point components on Windows, and use same-directory atomic replacement.

- [ ] **Step 4: Implement state transitions without UI strings**

`DreamSkinStatus::advance` must reject impossible paths such as `Off -> RendererVerified`, `Paused -> AssetsVerified`, and `Active -> InjectionStarted`. Return `anyhow::Error` with state/event names only; never include tokens, file contents or URLs.

- [ ] **Step 5: Run core store tests**

Run:

```powershell
cargo test -p codex-plus-core dream_skin --jobs 1 -- --nocapture --test-threads=1
```

Expected: PASS, including rejected path escape and invalid transitions.

- [ ] **Step 6: Commit the store**

```powershell
git add crates/codex-plus-core/src/dream_skin.rs crates/codex-plus-core/src/lib.rs crates/codex-plus-core/src/paths.rs
git commit -m "feat: add local Dream Skin store"
```

### Task 3: Harden CDP ownership and add Dream Skin early injection

**Files:**
- Create: `crates/codex-plus-core/src/dream_skin_cdp.rs`
- Modify: `crates/codex-plus-core/src/cdp.rs`
- Modify: `crates/codex-plus-core/src/launcher.rs`
- Modify: `crates/codex-plus-core/src/lib.rs`
- Test: `crates/codex-plus-core/tests/dream_skin.rs`
- Test: `crates/codex-plus-core/tests/launcher.rs`

- [ ] **Step 1: Write failing CDP URL and Browser-ID tests**

```rust
#[test]
fn dream_skin_rejects_remote_and_wrong_port_websocket_targets() {
    assert!(validate_dream_skin_websocket_url("ws://127.0.0.1:9335/devtools/page/a", 9335).is_ok());
    assert!(validate_dream_skin_websocket_url("ws://192.168.1.8:9335/devtools/page/a", 9335).is_err());
    assert!(validate_dream_skin_websocket_url("ws://127.0.0.1:9336/devtools/page/a", 9335).is_err());
}

#[test]
fn early_payload_contains_generation_guard_and_cleanup_marker() {
    let script = dream_skin_early_payload("theme-rev-7", "payload-json");
    assert!(script.contains("__CODEWORK_DREAM_SKIN_GENERATION__"));
    assert!(script.contains("restoreCodeworkDreamSkin"));
}
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run:

```powershell
cargo test -p codex-plus-core dream_skin_rejects_remote --test dream_skin -- --nocapture
```

Expected: FAIL because Dream Skin CDP validation is absent.

- [ ] **Step 3: Implement strict CDP validation**

Parse WebSocket URLs with `url::Url`. Accept only `ws`, `127.0.0.1` or `[::1]`, the requested port, and `/devtools/page/<id>` for page targets. Add `--remote-debugging-address=127.0.0.1` in `build_codex_arguments`; retain the existing `--remote-allow-origins` argument.

- [ ] **Step 4: Implement Browser-ID anchored early injection**

Create `DreamSkinCdpSession` that reads `/json/version`, stores the Browser ID from the browser debugger URL, validates it before every target enumeration, and registers `Page.addScriptToEvaluateOnNewDocument` before normal Runtime evaluation. `restore` must remove the returned script identifier and execute the upstream cleanup function on every verified main renderer.

- [ ] **Step 5: Integrate with the existing launcher without a second watchdog**

Replace the generic five-second Dream Skin reinjection branch with `DreamSkinCdpSession::ensure`. The session should reapply only when the marker/revision is absent, with capped backoff; it must stop if Browser ID changes or the debug port no longer belongs to the launch.

- [ ] **Step 6: Run launcher and CDP tests**

Run:

```powershell
cargo test -p codex-plus-core dream_skin --jobs 1 -- --nocapture --test-threads=1
cargo test -p codex-plus-core launcher --test launcher -- --nocapture
```

Expected: PASS. Existing launcher tests must still prove loopback arguments are present.

- [ ] **Step 7: Commit CDP integration**

```powershell
git add crates/codex-plus-core/src/dream_skin_cdp.rs crates/codex-plus-core/src/cdp.rs crates/codex-plus-core/src/launcher.rs crates/codex-plus-core/src/lib.rs crates/codex-plus-core/tests/dream_skin.rs crates/codex-plus-core/tests/launcher.rs
git commit -m "feat: add verified Dream Skin CDP lifecycle"
```

### Task 4: Extend the server theme contract with authorization and integrity

**Files:**
- Modify: `services/codework-theme-service/server.mjs`
- Modify: `services/codework-theme-service/server.test.mjs`
- Modify: `apps/codex-plus-manager/src/visual-theme-contract.ts`
- Modify: `apps/codex-plus-manager/src/visual-theme-contract.test.ts`

- [ ] **Step 1: Write failing server and browser-contract tests**

```js
it("returns hash metadata only for themes allowed to the verified member", async () => {
  const response = await request("/v1/themes/manifest", { authorization: "Bearer member-a" });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.allowedThemeIds, ["member-theme"]);
  assert.equal(response.body.themes[0].sha256, "a".repeat(64));
  assert.equal(response.body.authorizationExpiresAt, "2026-07-20T00:00:00.000Z");
});
```

```ts
it("rejects a theme manifest with a non-sha256 asset hash", () => {
  assert.equal(isThemeManifest({ version: "1", themes: [{ ...fixtureTheme, sha256: "short" }] }), false);
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run:

```powershell
node --test --experimental-strip-types apps/codex-plus-manager/src/visual-theme-contract.test.ts
node --test services/codework-theme-service/server.test.mjs
```

Expected: FAIL because the present contract lacks `sha256`, `revision` and authorization expiry.

- [ ] **Step 3: Implement the additive manifest fields**

Use this response shape:

```json
{
  "version": "2",
  "updatedAt": "2026-07-19T12:00:00.000Z",
  "authorizationExpiresAt": "2026-07-20T12:00:00.000Z",
  "allowedThemeIds": ["brand-obsidian", "member-theme"],
  "themes": [{
    "id": "member-theme",
    "revision": "2026-07-19-r3",
    "sha256": "64 lowercase hex characters",
    "assetBytes": 123456,
    "access": "restricted"
  }]
}
```

The service must derive `allowedThemeIds` only after `verifyMember` returns a member. Return 401 with no theme metadata for missing or invalid authorization. Keep asset endpoint authorization checks; do not expose a restricted asset merely because its filename is guessed.

- [ ] **Step 4: Extend the TypeScript validator**

Require a 64-character lowercase/uppercase SHA-256, safe revision, nonnegative integer byte count no larger than 16 MB, and a valid ISO-like expiry string. Keep `tier: "pro"` compatibility until the UI migration task replaces it with Codework access labels.

- [ ] **Step 5: Run service and contract tests**

Run:

```powershell
node --test services/codework-theme-service/server.test.mjs
node --test --experimental-strip-types apps/codex-plus-manager/src/visual-theme-contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the server contract**

```powershell
git add services/codework-theme-service/server.mjs services/codework-theme-service/server.test.mjs apps/codex-plus-manager/src/visual-theme-contract.ts apps/codex-plus-manager/src/visual-theme-contract.test.ts
git commit -m "feat: verify Dream Skin theme assets and grants"
```

### Task 5: Expose integrated Dream Skin operations to the manager

**Files:**
- Create: `apps/codex-plus-manager/src-tauri/src/dream_skin_commands.rs`
- Modify: `apps/codex-plus-manager/src-tauri/src/lib.rs`
- Modify: `apps/codex-plus-manager/src-tauri/src/commands.rs`
- Test: `apps/codex-plus-manager/src-tauri/src/dream_skin_commands.rs`

- [ ] **Step 1: Write failing command payload tests**

```rust
#[test]
fn apply_payload_requires_restart_only_for_a_non_debug_codex_session() {
    let state = DreamSkinRuntimeState::from_probe(DreamSkinProbe::NormalCodexRunning);
    assert_eq!(apply_payload_from_state(state).status, "restart_required");
    assert!(apply_payload_from_state(state).restart_required);
}

#[test]
fn restore_payload_never_serializes_access_tokens_or_asset_bytes() {
    let json = serde_json::to_string(&DreamSkinPayload::off()).unwrap();
    assert!(!json.contains("access-token"));
    assert!(!json.contains("data:image"));
}
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run:

```powershell
cargo test -p codex-plus-manager dream_skin_commands --lib --jobs 1 -- --nocapture --test-threads=1
```

Expected: FAIL because the command module does not exist.

- [ ] **Step 3: Implement command payloads and commands**

Create these commands:

```rust
#[tauri::command] pub async fn dream_skin_status() -> CommandResult<DreamSkinPayload>;
#[tauri::command] pub async fn sync_dream_skin_themes() -> CommandResult<DreamSkinManifestPayload>;
#[tauri::command] pub async fn apply_dream_skin(theme_id: String, allow_restart: bool) -> CommandResult<DreamSkinPayload>;
#[tauri::command] pub async fn pause_dream_skin() -> CommandResult<DreamSkinPayload>;
#[tauri::command] pub async fn resume_dream_skin() -> CommandResult<DreamSkinPayload>;
#[tauri::command] pub async fn restore_dream_skin() -> CommandResult<DreamSkinPayload>;
```

Read the member/theme token from protected storage through `SettingsStore::default().load()` only; do not accept it as a Tauri argument. Emit `codework-dream-skin-progress` with stages `checking`, `downloading`, `verifying_asset`, `restart_required`, `injecting`, `verifying_renderer`, `active`, `restoring`, and `failed`.

- [ ] **Step 4: Register commands and preserve existing settings behavior**

Add the commands to `tauri::generate_handler!`. Keep `save_visual_theme_settings` only as a migration bridge during this release; ordinary settings saves must preserve the active Dream Skin selection without writing tokens.

- [ ] **Step 5: Run command tests**

Run:

```powershell
cargo test -p codex-plus-manager dream_skin_commands --lib --jobs 1 -- --nocapture --test-threads=1
cargo test -p codex-plus-manager --lib --jobs 1
```

Expected: PASS.

- [ ] **Step 6: Commit the manager command layer**

```powershell
git add apps/codex-plus-manager/src-tauri/src/dream_skin_commands.rs apps/codex-plus-manager/src-tauri/src/commands.rs apps/codex-plus-manager/src-tauri/src/lib.rs
git commit -m "feat: control Dream Skin from Codework manager"
```

### Task 6: Replace the personalization screen with the integrated Dream Skin experience

**Files:**
- Create: `apps/codex-plus-manager/src/dream-skin.ts`
- Create: `apps/codex-plus-manager/src/dream-skin.test.ts`
- Modify: `apps/codex-plus-manager/src/App.tsx`
- Modify: `apps/codex-plus-manager/src/styles.css`
- Modify: `apps/codex-plus-manager/src/visual-theme-contract.ts`

- [ ] **Step 1: Write failing frontend behavior tests**

```ts
it("maps restart-required progress to a user confirmation action", () => {
  assert.deepStrictEqual(getDreamSkinActions("restart_required"), ["cancel", "restart_and_apply"]);
});

it("keeps manager blue-pink skin separate from Codex Dream Skin status", () => {
  assert.equal(resolveDreamSkinPanelTone("active", "pink"), "dream-active");
  assert.notEqual(resolveDreamSkinPanelTone("active", "pink"), "pink");
});
```

- [ ] **Step 2: Run tests and confirm they fail**

Run:

```powershell
node --test --experimental-strip-types apps/codex-plus-manager/src/dream-skin.test.ts
```

Expected: FAIL because no Dream Skin UI helper exists.

- [ ] **Step 3: Implement UI helpers and the page state**

Create `dream-skin.ts` with only pure functions for stage labels, primary actions, safe theme cards and panel tone. In `App.tsx`, replace direct visual-theme injection controls with state from `dream_skin_status` and progress events. The buttons must invoke only Tauri commands; the browser must not inject scripts, read image bytes, or decide authorization.

- [ ] **Step 4: Add the application flow**

Implement these UI paths:

- “立即应用” calls `apply_dream_skin(themeId, false)`.
- `restart_required` opens the existing confirmation dialog; confirmation calls `apply_dream_skin(themeId, true)`.
- “暂停皮肤”、“继续使用”和“恢复官方界面” call their matching Tauri commands.
- Resource progress shows `下载主题资源 → 校验资源 → 注入界面 → 验证原生控件`.
- A restricted theme is visibly locked and has no apply handler.
- Update the user-visible wording to explain that only Codex’s appearance changes; the client blue/pink skin is unaffected.

- [ ] **Step 5: Add scoped styling**

Use CSS names beginning with `.dream-skin-` for manager cards and progress components. Do not place `html`, `body`, global `button`, global color variables or Codework identity styles inside this page’s theme styles.

- [ ] **Step 6: Run frontend checks**

Run:

```powershell
node --test --experimental-strip-types apps/codex-plus-manager/src/dream-skin.test.ts apps/codex-plus-manager/src/visual-theme-contract.test.ts
npm --prefix apps/codex-plus-manager run check
npm --prefix apps/codex-plus-manager run vite:build
```

Expected: PASS.

- [ ] **Step 7: Commit the UI**

```powershell
git add apps/codex-plus-manager/src/dream-skin.ts apps/codex-plus-manager/src/dream-skin.test.ts apps/codex-plus-manager/src/App.tsx apps/codex-plus-manager/src/styles.css apps/codex-plus-manager/src/visual-theme-contract.ts
git commit -m "feat: integrate Dream Skin personalization controls"
```

### Task 7: Migrate existing visual themes and remove the legacy owner

**Files:**
- Modify: `apps/codex-plus-manager/src-tauri/src/commands.rs`
- Modify: `assets/inject/renderer-inject.js`
- Modify: `apps/codex-plus-manager/src/App.tsx`
- Modify: `apps/codex-plus-manager/src/visual-theme-contract.test.ts`
- Test: `crates/codex-plus-core/src/assets.rs`

- [ ] **Step 1: Write the failing migration contract tests**

```ts
it("maps existing character themes to a Dream Skin revision without changing access", () => {
  assert.deepStrictEqual(migrateVisualTheme({ id: "crayon-shinchan", access: "restricted" }), {
    id: "crayon-shinchan",
    access: "restricted",
    engine: "dream-skin",
  });
});
```

```rust
#[test]
fn injection_bundle_has_no_legacy_codework_visual_theme_owner() {
    let script = renderer_script();
    assert!(!script.contains("applyCodeworkCharacterTheme"));
    assert!(script.contains("__CODEWORK_DREAM_SKIN_PAYLOAD__"));
}
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run:

```powershell
node --test --experimental-strip-types apps/codex-plus-manager/src/visual-theme-contract.test.ts
cargo test -p codex-plus-core injection_bundle_has_no_legacy --jobs 1 -- --nocapture --test-threads=1
```

Expected: FAIL because the legacy and new owners coexist.

- [ ] **Step 3: Implement one-time settings migration**

When a user has `codexAppVisualThemeEnabled=true`, map its selected ID into the Dream Skin active-theme state if it appears in the verified manifest. Keep it disabled if no valid manifest asset/revision exists; never invent a local image URL. Preserve the selected ID for UI display and show a repair action.

- [ ] **Step 4: Delete only legacy Codex-page ownership**

Remove the old `applyCodeworkCharacterTheme`, old Dream palette injection and related duplicate global classes from `renderer-inject.js`. Do not remove manager-only profile cards, crowns, custom client skin, announcements, chat, or the visual theme service’s permission checks.

- [ ] **Step 5: Run migration tests and full frontend typecheck**

Run:

```powershell
node --test --experimental-strip-types apps/codex-plus-manager/src/visual-theme-contract.test.ts apps/codex-plus-manager/src/dream-skin.test.ts
cargo test -p codex-plus-core assets --jobs 1 -- --nocapture --test-threads=1
npm --prefix apps/codex-plus-manager run check
```

Expected: PASS.

- [ ] **Step 6: Commit the migration**

```powershell
git add apps/codex-plus-manager/src-tauri/src/commands.rs assets/inject/renderer-inject.js apps/codex-plus-manager/src/App.tsx apps/codex-plus-manager/src/visual-theme-contract.test.ts crates/codex-plus-core/src/assets.rs
git commit -m "refactor: migrate visual themes to Dream Skin"
```

### Task 8: Verify the complete Windows lifecycle and ship a test build

**Files:**
- Create: `docs/release/CodeworkAI客户端-DreamSkin更新说明.md`
- Modify: `scripts/build-codework-windows.ps1`
- Test: `crates/codex-plus-core/tests/dream_skin.rs`
- Test: `apps/codex-plus-manager/src/dream-skin.test.ts`

- [ ] **Step 1: Add a release contract test**

```rust
#[test]
fn packaged_windows_build_contains_pinned_dream_skin_assets_and_restore_path() {
    let script = include_str!("../../../scripts/build-codework-windows.ps1");
    assert!(script.contains("fei-away-codex-dream-skin"));
    assert!(script.contains("restore_dream_skin"));
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run:

```powershell
cargo test -p codex-plus-core packaged_windows_build_contains_pinned --test dream_skin -- --nocapture
```

Expected: FAIL until the release script includes the packaged assets and restore command.

- [ ] **Step 3: Include assets and update notes**

Ensure the Windows package includes the pinned vendor assets, upstream notices, and no unlicensed demo image. Add public update notes that describe optional personalization, one-time restart when needed, restore path, and the fact that themes do not alter accounts, conversations, API keys or official binaries.

- [ ] **Step 4: Run full automated verification serially**

Run:

```powershell
cargo test --workspace --jobs 1 -- --test-threads=1
node --test --experimental-strip-types apps/codex-plus-manager/src/*.test.ts
node --test services/codework-theme-service/server.test.mjs
npm --prefix apps/codex-plus-manager run check
npm --prefix apps/codex-plus-manager run vite:build
```

Expected: all PASS. If Windows page-file pressure occurs, keep `--jobs 1` and do not launch tests in parallel.

- [ ] **Step 5: Run manual Windows acceptance**

On a test account and a permitted theme, verify: apply while closed, apply while client-launched, restart-required confirmation, pause, resume, restore, refresh, route switching, sidebars, project selector, composer, task view, and an auxiliary window. Confirm that an unauthorized account cannot retrieve the restricted asset.

- [ ] **Step 6: Build the Windows installer and verify its contents**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-codework-windows.ps1
```

Expected: successful installer build with the versioned release manifest and no standalone Dream Skin shortcut, tray executable or PowerShell installer.

- [ ] **Step 7: Commit release preparation**

```powershell
git add docs/release/CodeworkAI客户端-DreamSkin更新说明.md scripts/build-codework-windows.ps1 crates/codex-plus-core/tests/dream_skin.rs
git commit -m "build: package integrated Windows Dream Skin"
```

## Final acceptance checklist

- [ ] Users control themes entirely from the Codework personalization page.
- [ ] The official Store Codex executable, WindowsApps, app.asar and code signature remain unchanged.
- [ ] Only a verified loopback Browser-ID-matched Codex renderer receives injection.
- [ ] Theme application verifies native sidebar, project selector and composer before reporting success.
- [ ] Pause and restore remove all injected assets and leave no independent tray/shortcut/runtime.
- [ ] Existing user theme selection migrates without showing duplicate or conflicting skins.
- [ ] Server authorization controls restricted themes and asset retrieval.
- [ ] Theme content can update by revision without a client installer update.
- [ ] Manager blue/pink skin, identity crowns, chat and other client UI remain visually and technically isolated.
- [ ] All automated checks and manual Windows acceptance pass before packaging.

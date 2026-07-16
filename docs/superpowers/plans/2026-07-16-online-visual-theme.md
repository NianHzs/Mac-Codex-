# 在线视觉个性化主题 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Codework Codex++ 的视觉个性化主题接到用户 1Panel 的公开主题清单服务，并安全地支持主题参数更新。

**Architecture:** 主题服务提供只含受限 token 的 JSON；React 管理器验证、缓存和显示该 JSON，注入器独立验证并将 token 编译为固定 CSS 模板。服务地址和主题 ID 保存在 BackendSettings，远端失败时回退内置主题。

**Tech Stack:** React 19、TypeScript、Rust serde、原生 Node.js HTTP、现有 Tauri 源码回归测试。

---

### Task 1: 主题清单 token 合约与设置字段

**Files:**

- Modify: `crates/codex-plus-core/src/settings.rs:298-301`
- Modify: `apps/codex-plus-manager/src/App.tsx:180-181,673-674`
- Modify: `services/codework-theme-service/themes/manifest.json`
- Test: `apps/codex-plus-manager/src-tauri/tests/windows_subsystem.rs`

- [ ] **Step 1: Write the failing test**: Assert the React and Rust service URL fields plus `tokens` and `background` in the manifest.
- [ ] **Step 2: Run test to verify it fails**: `$env:CARGO_TARGET_DIR='D:\\CodeworkBuildCache\\test-target'; cargo test -p codex-plus-manager --test windows_subsystem visual_theme_service_has_a_1panel_deployment_and_public_manifest -- --exact`.
- [ ] **Step 3: Write minimal implementation**: Add `codexAppVisualThemeServiceUrl` with an empty default in both settings structures and add valid token data to all four themes.
- [ ] **Step 4: Run test to verify it passes**: Run the Step 2 command and expect PASS.
- [ ] **Step 5: Commit**: `git add crates/codex-plus-core/src/settings.rs apps/codex-plus-manager/src/App.tsx services/codework-theme-service/themes/manifest.json apps/codex-plus-manager/src-tauri/tests/windows_subsystem.rs; git commit -m "feat: define online visual theme settings"`.

### Task 2: 管理器在线主题刷新与离线缓存

**Files:**

- Modify: `apps/codex-plus-manager/src/App.tsx:3191-3207`
- Test: `apps/codex-plus-manager/src-tauri/tests/windows_subsystem.rs`

- [ ] **Step 1: Write the failing test**: Assert `/v1/themes/manifest`, `codework-theme-manifest-cache`, and `isSafeThemeManifest` in the manager source.
- [ ] **Step 2: Run test to verify it fails**: `$env:CARGO_TARGET_DIR='D:\\CodeworkBuildCache\\test-target'; cargo test -p codex-plus-manager --test windows_subsystem visual_theme_pro_has_a_dedicated_route_and_safe_injection_settings -- --exact`.
- [ ] **Step 3: Write minimal implementation**: Add typed manifest validation and URL normalization; add service address input, refresh button, version/status, cache fallback and merged theme cards. Only valid themes can be rendered or selected.
- [ ] **Step 4: Run test to verify it passes**: Run Step 2 then `npm run check` from `apps/codex-plus-manager`.
- [ ] **Step 5: Commit**: `git add apps/codex-plus-manager/src/App.tsx apps/codex-plus-manager/src-tauri/tests/windows_subsystem.rs; git commit -m "feat: refresh online visual themes in manager"`.

### Task 3: 注入器安全在线应用与定时更新

**Files:**

- Modify: `assets/inject/renderer-inject.js:1215-1230,2115-2157`
- Test: `apps/codex-plus-manager/src-tauri/tests/windows_subsystem.rs`

- [ ] **Step 1: Write the failing test**: Assert `isSafeCodeworkThemeManifest`, `codeworkVisualThemeCssFromTokens`, and `/v1/themes/manifest` in the injector source.
- [ ] **Step 2: Run test to verify it fails**: `$env:CARGO_TARGET_DIR='D:\\CodeworkBuildCache\\test-target'; cargo test -p codex-plus-manager --test windows_subsystem visual_theme_pro_has_a_dedicated_route_and_safe_injection_settings -- --exact`.
- [ ] **Step 3: Write minimal implementation**: Use token-based built-ins, validate remote manifests before a fixed CSS template, load selected online themes after settings load and poll every five minutes. Remote CSS and scripts are never executed.
- [ ] **Step 4: Run test to verify it passes**: Run Step 2, `node --check services/codework-theme-service/server.mjs`, and `npm run check` in `apps/codex-plus-manager`.
- [ ] **Step 5: Commit**: `git add assets/inject/renderer-inject.js apps/codex-plus-manager/src-tauri/tests/windows_subsystem.rs; git commit -m "feat: safely refresh applied visual themes"`.

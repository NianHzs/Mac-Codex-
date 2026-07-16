# Codework 默认供应商预设 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将新安装的通用默认中转替换为 Codework AI 官方纯 API 预设，同时保持已有用户供应商不变。

**Architecture:** Rust 定义持久化默认和兼容回退，React 定义首次加载的表单默认。两端使用同一个 `codework-ai` ID、纯 API/Responses 协议、官方接口地址和统一模型列表。

**Tech Stack:** Rust serde、React/TypeScript、现有 Cargo 源码回归测试。

---

### Task 1: 默认预设与兼容回退

**Files:**

- Modify: `crates/codex-plus-core/src/settings.rs`
- Modify: `apps/codex-plus-manager/src/App.tsx`
- Modify: `apps/codex-plus-manager/src-tauri/tests/windows_subsystem.rs`

- [ ] **Step 1: Write failing tests**: Assert the Rust default profile is `codework-ai`, pure API, Responses, with the Codework URL and four model names; assert the manager defaults contain the same ID and model list.
- [ ] **Step 2: Verify red**: Run `$env:CARGO_TARGET_DIR='D:\\CodeworkBuildCache\\test-target'; cargo test -p codex-plus-core default_relay_profile_is_codework_ai --lib` and expect a failed assertion for the legacy default.
- [ ] **Step 3: Implement**: Change only fresh/default profiles and fallback construction to the Codework values. Do not add migration code that changes existing persisted profiles.
- [ ] **Step 4: Verify green**: Run the Rust test, the visual/source subsystem test, and `npm run check` in `apps/codex-plus-manager`.
- [ ] **Step 5: Commit**: `git add crates/codex-plus-core/src/settings.rs apps/codex-plus-manager/src/App.tsx apps/codex-plus-manager/src-tauri/tests/windows_subsystem.rs; git commit -m "feat: make Codework AI the default relay preset"`.

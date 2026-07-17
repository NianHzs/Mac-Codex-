# Skill 市场 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the third-party script marketplace with a Chinese, official Skill marketplace that securely installs Codex Skills.

**Architecture:** `skill_market` owns manifest parsing, download/hash verification, safe ZIP extraction, and installation inventory. Tauri exposes this to React; official source and packaging live in the repo while the client reads only the 1Panel mirror.

**Tech Stack:** Rust, reqwest, sha2, zip, Tauri 2, React 19, TypeScript, PowerShell.

---

### Task 1: Create the secure official Skill package module

**Files:**
- Create: `crates/codex-plus-core/src/skill_market.rs`
- Create: `crates/codex-plus-core/tests/skill_market.rs`
- Modify: `crates/codex-plus-core/src/lib.rs`

- [ ] **Step 1: Write a failing manifest parser test**

```rust
#[test]
fn parses_official_skill_manifest_and_rejects_incomplete_entries() {
    let ok = parse_skill_manifest(serde_json::json!({"version":1,"skills":[{
      "id":"smart-copywriter", "name":"智能文案助手", "description":"文案",
      "version":"1.0.0", "packageUrl":"https://example.invalid/a.zip",
      "sha256": "a".repeat(64)
    }]}));
    assert_eq!(ok.unwrap().skills[0].id, "smart-copywriter");
    assert!(parse_skill_manifest(serde_json::json!({"skills":[{"id":"bad"}]})).is_err());
}
```

- [ ] **Step 2: Verify RED**

Run: `cargo test -p codex-plus-core --test skill_market parses_official_skill_manifest_and_rejects_incomplete_entries --jobs 1`

Expected: FAIL because `skill_market` does not exist.

- [ ] **Step 3: Implement parser and manifest contract**

Add `SkillMarketManifest` and `MarketSkill` with id/name/description/version/author/tags/homepage/package_url/sha256. Require nonempty values, ID matching `[a-z0-9-]+`, valid HTTP(S) package URL and a 64-digit ASCII hex SHA-256. Set:

```rust
pub const DEFAULT_SKILL_MARKET_INDEX_URL: &str =
    "http://115.190.199.191:20080/downloads/codework-skills/index.json";
```

- [ ] **Step 4: Verify GREEN**

Run: `cargo test -p codex-plus-core --test skill_market parses_official_skill_manifest_and_rejects_incomplete_entries --jobs 1`

Expected: PASS.

- [ ] **Step 5: Write failing integrity and traversal tests**

```rust
#[test]
fn rejects_package_when_sha256_does_not_match() {
    assert!(verify_sha256(b"content", &"0".repeat(64)).is_err());
}

#[test]
fn rejects_zip_entry_that_escapes_skill_destination() {
    let archive = zip_bytes(&[("../outside.txt", b"bad")]);
    assert!(install_skill_archive(temp.path(), "smart-copywriter", &archive).is_err());
}
```

- [ ] **Step 6: Verify RED**

Run: `cargo test -p codex-plus-core --test skill_market --jobs 1`

Expected: FAIL because verification and extraction functions are missing.

- [ ] **Step 7: Implement safe atomic installation**

Implement `verify_sha256`, `install_skill_archive`, `installed_skill_versions`, and `install_market_skill`. Download first, verify before extraction, stage under `~/.codex/skills/.tmp/<id>-<timestamp>`, reject absolute/parent/symlink ZIP entries, require a root `SKILL.md`, then atomically replace `~/.codex/skills/<id>`. Store `.codework-skill.json` with id/version. Preserve the previous package whenever download, hash, or validation fails.

- [ ] **Step 8: Verify complete core test suite and commit**

Run: `cargo test -p codex-plus-core --test skill_market --jobs 1`

Expected: PASS.

```powershell
git add crates/codex-plus-core/src/skill_market.rs crates/codex-plus-core/src/lib.rs crates/codex-plus-core/tests/skill_market.rs
git commit -m "feat: add secure official skill installer"
```

### Task 2: Replace the Tauri Script endpoints with Skill endpoints

**Files:**
- Modify: `apps/codex-plus-manager/src-tauri/src/commands.rs:917,2103,3797`
- Modify: `apps/codex-plus-manager/src-tauri/src/lib.rs:96-97`
- Modify: `apps/codex-plus-manager/src/App.tsx:1408-1422`

- [ ] **Step 1: Write a failing installed-state command test**

Add a test creating temporary `CODEX_HOME/skills/smart-copywriter/.codework-skill.json`, then assert:

```rust
assert_eq!(payload.market["skills"][0]["name"], "智能文案助手");
assert_eq!(payload.market["skills"][0]["installed"], true);
assert_eq!(payload.market["skills"][0]["installedVersion"], "1.0.0");
```

- [ ] **Step 2: Verify RED**

Run: `cargo test -p codex-plus-manager skill_market_payload --jobs 1`

Expected: FAIL because command payload is script-oriented.

- [ ] **Step 3: Implement bridge contract**

Replace `ScriptMarketPayload`, `refresh_script_market`, and `install_market_script` with `SkillMarketPayload`, `refresh_skill_market`, and `install_market_skill`. The commands use `codex_home::default_codex_home_dir()`, fetch only `DEFAULT_SKILL_MARKET_INDEX_URL`, and return `skills`, `installed`, `installedVersion`, and `updateAvailable`. Do not accept a URL/path from the webview. Register only the new commands in `tauri::generate_handler![]`.

- [ ] **Step 4: Verify GREEN**

Run: `cargo test -p codex-plus-manager skill_market_payload --jobs 1; npm --prefix apps/codex-plus-manager run check`

Expected: PASS.

- [ ] **Step 5: Commit bridge code**

```powershell
git add apps/codex-plus-manager/src-tauri/src/commands.rs apps/codex-plus-manager/src-tauri/src/lib.rs apps/codex-plus-manager/src/App.tsx
git commit -m "feat: expose official skill market commands"
```

### Task 3: Render the Chinese Skill 市场

**Files:**
- Create: `apps/codex-plus-manager/src/skill-market.ts`
- Create: `apps/codex-plus-manager/src/skill-market.test.ts`
- Modify: `apps/codex-plus-manager/src/App.tsx:871,3881-3930`
- Modify: `apps/codex-plus-manager/src/i18n-en.ts`
- Modify: `apps/codex-plus-manager/src/styles.css`

- [ ] **Step 1: Write a failing action-label test**

```ts
import { describe, expect, it } from "vitest";
import { skillActionLabel } from "./skill-market";

it("shows 更新 when a newer Skill is available", () => {
  expect(skillActionLabel({ installed: true, updateAvailable: true })).toBe("更新");
});
```

- [ ] **Step 2: Verify RED**

Run: `npm --prefix apps/codex-plus-manager exec vitest run src/skill-market.test.ts`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement helper and UI**

Add `skillActionLabel` returning exactly `安装`, `已安装`, or `更新`. Rename the nav entry and screen to `Skill 市场`. Replace old GitHub/open-repository controls with refresh; render cards with Chinese name, description, tags, remote version, installed version, and install/update action. Remove old JS script rows from this page so JavaScript userscripts are never presented as Codex Skills.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm --prefix apps/codex-plus-manager exec vitest run src/skill-market.test.ts; npm --prefix apps/codex-plus-manager run check`

Expected: PASS.

```powershell
git add apps/codex-plus-manager/src/App.tsx apps/codex-plus-manager/src/i18n-en.ts apps/codex-plus-manager/src/styles.css apps/codex-plus-manager/src/skill-market.ts apps/codex-plus-manager/src/skill-market.test.ts
git commit -m "feat: add Chinese skill market interface"
```

### Task 4: Author and package six official Skills

**Files:**
- Create: `official-skills/{smart-copywriter,short-video-script,spreadsheet-data-assistant,file-organization-assistant,code-debugging-assistant,project-bootstrap-assistant}/SKILL.md`
- Create: `official-skills/index.template.json`
- Create: `scripts/build-official-skills.ps1`
- Create: `docs/release/codework-skill-market-publish.md`

- [ ] **Step 1: Write a failing generated-package test**

Create `crates/codex-plus-core/tests/official_skill_packages.rs` asserting every generated ZIP contains a root `SKILL.md` and the file-organization content contains `预览` and `确认`.

- [ ] **Step 2: Verify RED**

Run: `cargo test -p codex-plus-core --test official_skill_packages --jobs 1`

Expected: FAIL because packages do not exist.

- [ ] **Step 3: Author Skills and packaging script**

Each skill gets a Chinese title, triggers, practical output format and boundaries. `文件整理助手` requires a preview of affected paths and explicit user confirmation; it defaults to reversible moves and never deletes/overwrites by default. The PowerShell script creates `release-assets/codework-skills/<id>-<version>.zip`, computes SHA-256 with `Get-FileHash -Algorithm SHA256`, and writes `index.json` whose URLs start `/downloads/codework-skills/`.

- [ ] **Step 4: Verify GREEN and commit**

Run: `powershell -ExecutionPolicy Bypass -File scripts/build-official-skills.ps1; cargo test -p codex-plus-core --test official_skill_packages --jobs 1`

Expected: PASS.

```powershell
git add official-skills scripts/build-official-skills.ps1 docs/release/codework-skill-market-publish.md crates/codex-plus-core/tests/official_skill_packages.rs
git commit -m "feat: publish first official Codework skills"
```

### Task 5: Build, publish, and verify 1.3.17

**Files:**
- Modify: `Cargo.toml`, `apps/codex-plus-manager/package.json`, `apps/codex-plus-manager/src-tauri/tauri.conf.json`, `scripts/build-codework-windows.ps1`
- Generated: `D:/Codework Releases/♛Codework AI客户端-1.3.17/`

- [ ] **Step 1: Bump to 1.3.17 and add the Chinese release note**

Use: `新增 Skill 市场：可安装官方中文实用技能。`

- [ ] **Step 2: Run full focused checks**

Run: `cargo test -p codex-plus-core --test skill_market --test official_skill_packages --jobs 1; npm --prefix apps/codex-plus-manager run check`

Expected: PASS.

- [ ] **Step 3: Build installer**

Run: `powershell -ExecutionPolicy Bypass -File scripts/build-codework-windows.ps1 -Version 1.3.17`

Expected: `D:/Codework Releases/♛Codework AI客户端-1.3.17/` contains installer, ZIP, release notes, and tips.

- [ ] **Step 4: Publish server mirror**

Upload generated `index.json` and packages to `xiaoshuai-lottery:/app/data/downloads/codework-skills/` with mode `0644`; upload installer and update `/app/data/downloads/codework-ai-client-windows.json` to `1.3.17`.

- [ ] **Step 5: Verify live flow**

Run: `Invoke-WebRequest 'http://115.190.199.191:20080/downloads/codework-skills/index.json' | Select-Object -Expand Content`

Expected: six signed Skill entries. In the built app, install 智能文案助手 and verify `%USERPROFILE%/.codex/skills/smart-copywriter/SKILL.md` exists and is shown as `已安装` after refresh.

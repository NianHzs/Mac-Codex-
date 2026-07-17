# Codex Character Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver Kitty and Shin-chan full-page Codex themes that are granted per existing Codework user ID, survive Codex reloads, and safely return to native Codex when disabled or incompatible.

**Architecture:** The manager uses the existing Codework login token to request an entitlement-filtered manifest. The Tauri helper retains that token locally and proxies granted manifest and assets to the Codex renderer. The renderer inserts one scoped style layer using verified native landmarks, then removes it if any required landmark or asset cannot be loaded.

**Tech Stack:** React + TypeScript, Tauri/Rust, Node HTTP service, vanilla renderer injection, Vitest, Node test runner, Rust tests.

---

## File map

- Create: apps/codex-plus-manager/src/visual-theme-contract.ts and visual-theme-contract.test.ts — manifest validation, authorization view model and tests.
- Modify: apps/codex-plus-manager/src/App.tsx and member.ts — login session synchronization, locked cards and apply/reset.
- Modify: apps/codex-plus-manager/src-tauri/src/commands.rs and lib.rs — local theme-session command.
- Modify: crates/codex-plus-core/src/settings.rs and launcher.rs — token state plus local theme proxy.
- Modify: assets/inject/renderer-inject.js and crates/codex-plus-core/src/assets.rs — scoped Codex full-page visual layer.
- Modify: services/codework-theme-service/server.mjs and themes/manifest.json — entitlement-aware manifest and assets.
- Create: services/codework-theme-service/server.test.mjs, themes/grants.json, themes/assets/* — endpoint tests, user-ID grants, approved images.
- Modify: apps/codex-plus-manager/src-tauri/tests/windows_subsystem.rs — packaging assertions.

### Task 1: Define the restricted theme contract

**Files:**
- Create: apps/codex-plus-manager/src/visual-theme-contract.ts
- Create: apps/codex-plus-manager/src/visual-theme-contract.test.ts
- Modify: apps/codex-plus-manager/src/member.ts

- [ ] **Step 1: Write failing contract tests**

~~~ts
import { describe, expect, it } from "vitest";
import { isThemeManifest, themesVisibleToMember } from "./visual-theme-contract";

const kitty = {
  id: "hello-kitty-christmas", name: "凯蒂猫限定主题 · 圣诞小屋", tier: "pro", version: "1.0.0",
  access: "restricted", cssProfile: "character-hero-light",
  previewAsset: "kitty-christmas-thumb.jpg", heroAsset: "kitty-christmas.jpg",
  tokens: { background: "#FFF3F6", surface: "#FFFCFD", accent: "#CE4D78", border: "#F0D7DF", text: "#653A47", radius: 14, fontScale: 1 },
};
describe("character theme contract", () => {
  it("accepts an authorized theme", () => expect(isThemeManifest({ version: "1.1.0", themes: [kitty], allowedThemeIds: [kitty.id] })).toBe(true));
  it("marks a missing grant locked", () => expect(themesVisibleToMember({ version: "1.1.0", themes: [kitty], allowedThemeIds: [] })[0].authorized).toBe(false));
  it("rejects traversal assets", () => expect(isThemeManifest({ version: "1.1.0", themes: [{ ...kitty, heroAsset: "../secret.png" }], allowedThemeIds: [] })).toBe(false));
});
~~~

- [ ] **Step 2: Run the test to verify it fails**

Run: npm --prefix apps/codex-plus-manager test -- visual-theme-contract.test.ts

Expected: FAIL because the contract module does not exist.

- [ ] **Step 3: Implement the contract**

Export ThemeAccess, CharacterThemeProfile, VisualThemeTokens, VisualThemeItem, VisualThemeManifest, isThemeManifest and themesVisibleToMember. Assets must use this exact guard:

~~~ts
const safeAsset = (value: unknown) =>
  typeof value === "string" && /^[a-z0-9][a-z0-9._-]{0,127}\.(png|jpe?g|webp)$/i.test(value);
~~~

themesVisibleToMember returns each theme with authorized true only when access is public or allowedThemeIds includes its id. Add isThemeAccessToken to member.ts; accept trimmed strings from 16 through 4096 characters.

- [ ] **Step 4: Run the test to verify it passes**

Run: npm --prefix apps/codex-plus-manager test -- visual-theme-contract.test.ts

Expected: PASS with 3 tests.

- [ ] **Step 5: Commit**

~~~bash
git add apps/codex-plus-manager/src/visual-theme-contract.ts apps/codex-plus-manager/src/visual-theme-contract.test.ts apps/codex-plus-manager/src/member.ts
git commit -m "feat: define restricted character theme contract"
~~~

### Task 2: Authorize user IDs and serve allowed assets

**Files:**
- Modify: services/codework-theme-service/server.mjs
- Create: services/codework-theme-service/server.test.mjs
- Modify: services/codework-theme-service/themes/manifest.json
- Create: services/codework-theme-service/themes/grants.json
- Create: services/codework-theme-service/themes/assets/kitty-christmas.jpg
- Create: services/codework-theme-service/themes/assets/kitty-christmas-thumb.jpg
- Create: services/codework-theme-service/themes/assets/shinchan-collage.png
- Create: services/codework-theme-service/themes/assets/shinchan-collage-thumb.png

- [ ] **Step 1: Write failing Node tests**

~~~js
import test from "node:test";
import assert from "node:assert/strict";
import { createThemeService } from "./server.mjs";

test("manifest is filtered to member grants", async () => {
  const service = createThemeService({
    verifyMember: async token => token === "member-token" ? { userId: "u-1" } : null,
    grants: { "u-1": ["hello-kitty-christmas"] },
  });
  const result = await service.fetch("/v1/themes/manifest", { authorization: "Bearer member-token" });
  assert.deepEqual(result.body.allowedThemeIds, ["hello-kitty-christmas"]);
});

test("asset access is denied without a grant", async () => {
  const service = createThemeService({ verifyMember: async () => ({ userId: "u-2" }), grants: {} });
  assert.equal((await service.fetch("/v1/themes/assets/kitty-christmas.jpg", { authorization: "Bearer member-token" })).status, 403);
});
~~~

- [ ] **Step 2: Run tests to verify they fail**

Run: node --test services/codework-theme-service/server.test.mjs

Expected: FAIL because createThemeService is absent.

- [ ] **Step 3: Implement service authorization**

Export createThemeService. Read the Bearer token, call the existing lottery endpoint GET /api/client/me with that bearer, extract user.id, and look up themes/grants.json shaped as:

~~~json
{ "u-1": ["hello-kitty-christmas", "shinchan-energy"] }
~~~

Return a manifest containing allowedThemeIds. Protected asset requests must map each asset to its theme grant. Return 401 for a missing/rejected token, 403 for a valid ungranted user, and 404 for unknown assets. Reject every file name that fails Task 1's safe asset expression. Add Cache-Control: private, max-age=300 and Vary: Authorization.

Add the two theme records with access restricted, cssProfile character-hero-light, their hero and preview assets, and the approved light palettes. Copy the supplied Kitty Christmas-room source and Shin-chan collage source into themes/assets, preserving originals; generate separate resized thumbnail copies.

- [ ] **Step 4: Run service tests**

Run: node --test services/codework-theme-service/server.test.mjs

Expected: PASS with 2 tests.

- [ ] **Step 5: Commit**

~~~bash
git add services/codework-theme-service
git commit -m "feat: authorize character theme assets"
~~~

### Task 3: Add a local token-safe theme proxy

**Files:**
- Modify: crates/codex-plus-core/src/settings.rs
- Modify: crates/codex-plus-core/src/launcher.rs
- Modify: apps/codex-plus-manager/src-tauri/src/commands.rs
- Modify: apps/codex-plus-manager/src-tauri/src/lib.rs

- [ ] **Step 1: Write failing Rust tests**

~~~rust
#[test]
fn theme_asset_route_rejects_traversal() {
    assert!(is_safe_theme_asset_name("kitty-christmas.jpg"));
    assert!(!is_safe_theme_asset_name("../kitty-christmas.jpg"));
}

#[test]
fn theme_proxy_requires_member_token() {
    let settings = BackendSettings { codex_app_visual_theme_member_token: String::new(), ..BackendSettings::default() };
    assert_eq!(theme_proxy_authorization(&settings), None);
}
~~~

- [ ] **Step 2: Run tests to verify they fail**

Run: cargo test -p codex-plus-core theme_ --lib

Expected: FAIL because the proxy helpers do not exist.

- [ ] **Step 3: Implement settings and helper routes**

Add codex_app_visual_theme_member_token to BackendSettings with an empty default. Never serialize it into diagnostic events. Add Tauri command sync_visual_theme_member_session(access_token) that validates the token then saves it, or clears it when access_token is empty.

Add exactly two local helper routes:

~~~text
GET /theme/manifest
GET /theme/assets/<safe-file-name>
~~~

They read the stored token and forward it to the configured remote theme service. Forward only JSON for the manifest and PNG/JPEG/WebP for assets. Map upstream failure to local 401, 403 or 502. The renderer must use these helper routes and never receive the remote bearer token.

- [ ] **Step 4: Run helper checks**

Run: cargo test -p codex-plus-core theme_ --lib

Expected: PASS.

Run: cargo test -p codex-plus-manager-tauri --test windows_subsystem

Expected: PASS with sync_visual_theme_member_session registered.

- [ ] **Step 5: Commit**

~~~bash
git add crates/codex-plus-core/src/settings.rs crates/codex-plus-core/src/launcher.rs apps/codex-plus-manager/src-tauri/src/commands.rs apps/codex-plus-manager/src-tauri/src/lib.rs
git commit -m "feat: proxy authorized theme data locally"
~~~

### Task 4: Gate the theme cards and apply only authorized selections

**Files:**
- Modify: apps/codex-plus-manager/src/App.tsx
- Test: apps/codex-plus-manager/src/visual-theme-contract.test.ts

- [ ] **Step 1: Add failing UI-contract coverage**

~~~ts
it("does not allow applying a locked theme", () => {
  const [locked] = themesVisibleToMember({ version: "1.1.0", themes: [kitty], allowedThemeIds: [] });
  expect(locked.authorized).toBe(false);
});
~~~

- [ ] **Step 2: Run test to verify it fails**

Run: npm --prefix apps/codex-plus-manager test -- visual-theme-contract.test.ts

Expected: FAIL until VisualThemeScreen consumes authorized.

- [ ] **Step 3: Implement login sync and restricted cards**

When member login/profile refresh succeeds, invoke sync_visual_theme_member_session with the existing token. On logout or rejected profile, clear that session and disable a selected restricted theme. Refresh through the local helper instead of browser fetch. Render Kitty and Shin-chan preview images and an 立即应用 button only when authorized; otherwise render a locked placeholder with 限定主题 · 请联系管理员开通. apply(id) returns without saving settings when authorized is false. Restore official default removes the renderer choice after a successful save.

- [ ] **Step 4: Run manager checks**

Run: npm --prefix apps/codex-plus-manager test -- visual-theme-contract.test.ts

Expected: PASS.

Run: npm --prefix apps/codex-plus-manager run typecheck

Expected: PASS.

- [ ] **Step 5: Commit**

~~~bash
git add apps/codex-plus-manager/src/App.tsx apps/codex-plus-manager/src/visual-theme-contract.ts apps/codex-plus-manager/src/visual-theme-contract.test.ts
git commit -m "feat: gate character theme cards by entitlement"
~~~

### Task 5: Inject the approved full-page Codex skin with rollback

**Files:**
- Modify: assets/inject/renderer-inject.js
- Modify: crates/codex-plus-core/src/assets.rs

- [ ] **Step 1: Add a failing renderer assertion**

~~~rust
#[test]
fn character_theme_renderer_has_scoped_apply_and_restore_paths() {
    let script = renderer_script();
    assert!(script.contains("data-codework-character-theme"));
    assert!(script.contains("/theme/manifest"));
    assert!(script.contains("/theme/assets/"));
    assert!(script.contains("restoreCodeworkCharacterTheme"));
}
~~~

- [ ] **Step 2: Run it to verify it fails**

Run: cargo test -p codex-plus-core character_theme_renderer_has_scoped_apply_and_restore_paths --lib

Expected: FAIL because the layer does not exist.

- [ ] **Step 3: Implement scoped injection**

Create applyCodeworkCharacterTheme(theme) and restoreCodeworkCharacterTheme(). Apply inserts one style with id codework-character-theme-style and sets document.documentElement.dataset.codeworkCharacterTheme. Build the hero URL without exposing the bearer token:

~~~js
const heroUrl = helperBase + "/theme/assets/" + theme.heroAsset;
style.textContent = ":root[data-codework-character-theme=\"" + theme.id + "\"]{--cw-hero:url(\"" + heroUrl + "\")}";
~~~

Apply the approved light layout only after finding the native primary navigation, empty-home main landmark, native cards and composer. The Hero must use the supplied image behind a 0.90-to-0.20 white gradient, create shallow translucent feature cards, and leave all native controls reachable. On a conversation route remove the added Hero but retain sidebar and composer styling. Reapply through a 250 ms debounced MutationObserver and refresh manifest every five minutes. Any invalid profile, missing anchor, failed helper response or unsafe asset name calls restoreCodeworkCharacterTheme and preserves native Codex.

- [ ] **Step 4: Run renderer checks**

Run: cargo test -p codex-plus-core character_theme_renderer_has_scoped_apply_and_restore_paths --lib

Expected: PASS.

Run: cargo test -p codex-plus-core --lib

Expected: PASS.

- [ ] **Step 5: Commit**

~~~bash
git add assets/inject/renderer-inject.js crates/codex-plus-core/src/assets.rs
git commit -m "feat: inject reversible Codex character themes"
~~~

### Task 6: Package and verify against the approved previews

**Files:**
- Modify: apps/codex-plus-manager/src-tauri/tests/windows_subsystem.rs
- Modify: services/codework-theme-service/Dockerfile only if its current COPY rules omit theme assets.

- [ ] **Step 1: Add a failing package assertion**

~~~rust
#[test]
fn character_theme_assets_and_auth_service_ship() {
    let root = workspace_root();
    assert!(root.join("services/codework-theme-service/themes/assets/kitty-christmas.jpg").exists());
    assert!(root.join("services/codework-theme-service/themes/assets/shinchan-collage.png").exists());
    let server = std::fs::read_to_string(root.join("services/codework-theme-service/server.mjs")).unwrap();
    assert!(server.contains("/v1/themes/assets/"));
    assert!(server.contains("Authorization"));
}
~~~

- [ ] **Step 2: Run package test**

Run: cargo test -p codex-plus-manager-tauri --test windows_subsystem character_theme_assets_and_auth_service_ship

Expected: PASS after Tasks 2 through 5.

- [ ] **Step 3: Run the complete regression matrix**

~~~powershell
npm --prefix apps/codex-plus-manager run typecheck
npm --prefix apps/codex-plus-manager test -- visual-theme-contract.test.ts
node --test services/codework-theme-service/server.test.mjs
cargo test --workspace
npm --prefix apps/codex-plus-manager run tauri build
~~~

Expected: every command exits 0.

Manually verify: locked user; granted Kitty user; granted Shin-chan user; Codex restart; official-default restore; service unavailable after a cached theme. In every case Codex chat, model controls, login and native buttons remain usable. Compare both home pages against the approved preview: the supplied character artwork stays prominent and no text is covered.

- [ ] **Step 4: Commit verification**

~~~bash
git add apps/codex-plus-manager/src-tauri/tests/windows_subsystem.rs services/codework-theme-service/Dockerfile
git commit -m "test: verify character theme recovery and delivery"
~~~

# Kitty Cloud and Custom Dream Skin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add “凯蒂猫限定主题 · 云朵梦境” as the third restricted character theme and make local custom Dream Skin images load reliably without embedding multi-megabyte Base64 data in the Codex injection script.

**Architecture:** The third preset remains server-managed: the manager receives its manifest entry and preview through the authenticated theme service, while Codex loads the authorized hero asset through the existing loopback theme proxy. Local custom images use the existing loopback `/overlay/image` endpoint, create one page-scoped Blob URL, and send explicit success/failure diagnostics; the manager reads the latest matching runtime event after restart before declaring the theme active.

**Tech Stack:** React 19, TypeScript, Tauri 2, Rust, Node.js test runner, PowerShell/System.Drawing, Fei-Away Dream Skin runtime, 1Panel/Docker.

---

## File map

- `services/codework-theme-service/themes/assets/kitty-cloud-dream.png` — original 2848×1600 hero image supplied by the user.
- `services/codework-theme-service/themes/assets/kitty-cloud-dream-thumb.jpg` — lightweight card preview generated from the hero image.
- `services/codework-theme-service/themes/manifest.json` — third restricted theme metadata and palette.
- `services/codework-theme-service/themes/grants.json` — grants the third theme to the same member as the current two themes.
- `services/codework-theme-service/server.test.mjs` — theme-package and grant regression tests.
- `crates/codex-plus-core/src/assets.rs` — injection configuration containing metadata and loopback URL, not image bytes.
- `assets/inject/renderer-inject.js` — shared local-image loader, Blob URL lifecycle, Dream Skin diagnostics and error feedback.
- `crates/codex-plus-core/src/diagnostic_log.rs` — read the latest recent Dream Skin runtime event.
- `apps/codex-plus-manager/src-tauri/src/dream_skin_commands.rs` — expose runtime verification to the manager.
- `apps/codex-plus-manager/src/App.tsx` — restrict custom picker formats and verify runtime result after restart.
- `apps/codex-plus-manager/src/scoped-theme-contract.test.ts` — renderer contract tests.
- `apps/codex-plus-manager/src/visual-theme-interaction-contract.test.ts` — manager transition and picker contract tests.
- `apps/codex-plus-manager/src/visual-theme-contract.test.ts` — third-theme manifest contract tests.
- Version/release files: `Cargo.toml`, `Cargo.lock`, `apps/codex-plus-manager/package.json`, `apps/codex-plus-manager/package-lock.json`, `apps/codex-plus-manager/src-tauri/tauri.conf.json`, `scripts/build-codework-windows.ps1`, and signed files under `release-assets/`.

### Task 1: Add the third restricted theme package

**Files:**
- Create: `services/codework-theme-service/themes/assets/kitty-cloud-dream.png`
- Create: `services/codework-theme-service/themes/assets/kitty-cloud-dream-thumb.jpg`
- Modify: `services/codework-theme-service/themes/manifest.json`
- Modify: `services/codework-theme-service/themes/grants.json`
- Modify: `services/codework-theme-service/server.test.mjs`
- Modify: `apps/codex-plus-manager/src/visual-theme-contract.test.ts`

- [ ] **Step 1: Write the failing service test**

Replace the two-theme package assertion with a three-theme assertion:

```js
test("ships the three restricted character themes as Dream Skin packages", async () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const shipped = JSON.parse(await readFile(join(root, "themes", "manifest.json"), "utf8"));
  const grants = JSON.parse(await readFile(join(root, "themes", "grants.json"), "utf8"));
  const ids = ["hello-kitty-christmas", "shinchan-energy", "hello-kitty-cloud-dream"];

  for (const id of ids) {
    const theme = shipped.themes.find((candidate) => candidate.id === id);
    assert.equal(theme.access, "restricted");
    assert.equal(theme.cssProfile, "dream-skin-light");
    assert.equal(theme.art.layout, "card");
    assert.ok(grants["604"].includes(id));
  }

  const cloud = shipped.themes.find((theme) => theme.id === "hello-kitty-cloud-dream");
  assert.equal(cloud.name, "凯蒂猫限定主题 · 云朵梦境");
  assert.equal(cloud.heroAsset, "kitty-cloud-dream.png");
  assert.equal(cloud.previewAsset, "kitty-cloud-dream-thumb.jpg");
  assert.equal(cloud.sha256, "13bfa92e75c2150040f9e73f71bd14248e64cb63cfaadfc9d0b4139ce0f3306a");
  assert.equal(cloud.assetBytes, 2933895);
});
```

Add this contract case to `visual-theme-contract.test.ts`:

```ts
it("accepts the restricted Kitty cloud Dream Skin package", () => {
  const cloud = {
    id: "hello-kitty-cloud-dream",
    name: "凯蒂猫限定主题 · 云朵梦境",
    detail: "粉色云朵首页、凯蒂猫梦境主视觉与柔粉功能卡",
    tier: "pro" as const,
    version: "1.0.0",
    access: "restricted" as const,
    cssProfile: "dream-skin-light" as const,
    previewAsset: "kitty-cloud-dream-thumb.jpg",
    heroAsset: "kitty-cloud-dream.png",
    art: { focusX: 0.5, focusY: 0.52, safeArea: "left" as const, taskMode: "ambient" as const, layout: "card" as const },
    tokens: { background: "#FFF7FA", surface: "#FFFCFD", accent: "#D85B8C", border: "#F0D2DE", text: "#673B4A", radius: 18, fontScale: 1 },
  };
  assert.equal(isThemeManifest({ version: "3", themes: [cloud] }), true);
  assert.deepEqual(themePreviewAssetCandidates(cloud), ["kitty-cloud-dream-thumb.jpg", "kitty-cloud-dream.png"]);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run:

```powershell
node --test services\codework-theme-service\server.test.mjs
```

Expected: FAIL because `hello-kitty-cloud-dream` is absent.

- [ ] **Step 3: Copy the hero and generate the preview**

Run this deterministic asset preparation script:

```powershell
$source = 'E:\QQ恅紫\Tencent Files\1912867115\nt_qq\nt_data\Pic\2026-07\Ori\1c2d0956c6c850a72022a5538941e2b9.png'
$assetDir = 'services\codework-theme-service\themes\assets'
$hero = Join-Path $assetDir 'kitty-cloud-dream.png'
$thumb = Join-Path $assetDir 'kitty-cloud-dream-thumb.jpg'
Copy-Item -LiteralPath $source -Destination $hero -Force
Add-Type -AssemblyName System.Drawing
$image = [System.Drawing.Image]::FromFile($source)
$bitmap = [System.Drawing.Bitmap]::new(640, 360)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.DrawImage($image, 0, 0, 640, 360)
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
  $parameters = [System.Drawing.Imaging.EncoderParameters]::new(1)
  $parameters.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new([System.Drawing.Imaging.Encoder]::Quality, [long]88)
  $bitmap.Save($thumb, $codec, $parameters)
} finally {
  $graphics.Dispose(); $bitmap.Dispose(); $image.Dispose()
}
```

- [ ] **Step 4: Add the manifest and grant entries**

Append this theme object after `shinchan-energy` and add its ID to member `604`:

```json
{
  "id": "hello-kitty-cloud-dream",
  "name": "凯蒂猫限定主题 · 云朵梦境",
  "detail": "粉色云朵首页、凯蒂猫梦境主视觉与柔粉功能卡",
  "tier": "pro",
  "version": "1.0.0",
  "revision": "2026-07-20-r1",
  "sha256": "13bfa92e75c2150040f9e73f71bd14248e64cb63cfaadfc9d0b4139ce0f3306a",
  "assetBytes": 2933895,
  "access": "restricted",
  "cssProfile": "dream-skin-light",
  "art": { "focusX": 0.5, "focusY": 0.52, "safeArea": "left", "taskMode": "ambient", "layout": "card" },
  "previewAsset": "kitty-cloud-dream-thumb.jpg",
  "heroAsset": "kitty-cloud-dream.png",
  "tokens": { "background": "#FFF7FA", "surface": "#FFFCFD", "accent": "#D85B8C", "border": "#F0D2DE", "text": "#673B4A", "radius": 18, "fontScale": 1.0 }
}
```

- [ ] **Step 5: Run theme tests and confirm GREEN**

Run:

```powershell
node --test services\codework-theme-service\server.test.mjs apps\codex-plus-manager\src\visual-theme-contract.test.ts
```

Expected: all tests pass and the new theme validates.

- [ ] **Step 6: Commit the theme package**

```powershell
git add services/codework-theme-service/themes services/codework-theme-service/server.test.mjs apps/codex-plus-manager/src/visual-theme-contract.test.ts
git commit -m "feat: add kitty cloud Dream Skin theme"
```

### Task 2: Remove local image bytes from the injection payload

**Files:**
- Modify: `crates/codex-plus-core/src/assets.rs`
- Modify: `apps/codex-plus-manager/src/visual-theme-interaction-contract.test.ts`
- Modify: `apps/codex-plus-manager/src/App.tsx`

- [ ] **Step 1: Write failing Rust and TypeScript tests**

Add this Rust test to `assets.rs`:

```rust
#[test]
fn image_overlay_config_uses_loopback_url_without_embedding_image_bytes() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("wallpaper.png");
    std::fs::write(&path, b"large-local-wallpaper").unwrap();
    let settings = BackendSettings {
        codex_app_image_overlay_enabled: true,
        codex_app_image_overlay_path: path.to_string_lossy().to_string(),
        ..BackendSettings::default()
    };

    let config = image_overlay_config(57321, &settings);
    assert_eq!(config["enabled"], true);
    assert_eq!(config["dataUrl"], "");
    assert_eq!(config["imageUrl"], "http://127.0.0.1:57321/overlay/image");
    assert_eq!(config["contentType"], "image/png");
    assert!(!injection_script_with_settings(57321, &settings).contains("bGFyZ2UtbG9jYWwtd2FsbHBhcGVy"));
}
```

Add this manager contract assertion:

```ts
test("custom Dream Skin picker only offers formats supported by the runtime", () => {
  const app = readFileSync(resolve(import.meta.dirname, "./App.tsx"), "utf8");
  const picker = app.slice(app.indexOf("chooseImageOverlayPath"), app.indexOf("saveManualCodexAppPath"));
  assert.match(picker, /extensions: \["png", "jpg", "jpeg", "webp"\]/);
  assert.doesNotMatch(picker, /"gif"|"bmp"/);
});
```

- [ ] **Step 2: Run tests and confirm RED**

```powershell
$env:CARGO_TARGET_DIR = Join-Path $env:TEMP 'codework-cargo-1343-red'
cargo test -p codex-plus-core --lib image_overlay_config_uses_loopback_url_without_embedding_image_bytes --jobs 1
node --test apps\codex-plus-manager\src\visual-theme-interaction-contract.test.ts
```

Expected: Rust fails because `dataUrl` contains Base64 and TypeScript fails because GIF/BMP remain selectable.

- [ ] **Step 3: Implement metadata-only image configuration**

Change `image_overlay_config` to validate the file without reading its contents:

```rust
pub fn image_overlay_config(helper_port: u16, settings: &BackendSettings) -> Value {
    let path = Path::new(settings.codex_app_image_overlay_path.trim());
    let content_type = image_content_type(path).unwrap_or_default();
    let enabled = settings.codex_app_image_overlay_enabled
        && path.is_file()
        && matches!(content_type, "image/png" | "image/jpeg" | "image/webp");
    json!({
        "enabled": enabled,
        "opacity": f64::from(settings.codex_app_image_overlay_opacity.clamp(1, 100)) / 100.0,
        "fitMode": settings.codex_app_image_overlay_fit_mode.as_str(),
        "contentType": if enabled { content_type } else { "" },
        "dataUrl": "",
        "imageUrl": if enabled { format!("http://127.0.0.1:{helper_port}/overlay/image") } else { String::new() },
    })
}
```

Change the file picker extensions to:

```ts
filters: [{ name: t("图片"), extensions: ["png", "jpg", "jpeg", "webp"] }],
```

- [ ] **Step 4: Run tests and confirm GREEN**

Run the two commands from Step 2 again. Expected: both pass.

- [ ] **Step 5: Commit the payload boundary**

```powershell
git add crates/codex-plus-core/src/assets.rs apps/codex-plus-manager/src/App.tsx apps/codex-plus-manager/src/visual-theme-interaction-contract.test.ts
git commit -m "fix: load custom theme images through loopback helper"
```

### Task 3: Load the local wallpaper through one Blob URL

**Files:**
- Modify: `assets/inject/renderer-inject.js`
- Modify: `apps/codex-plus-manager/src/scoped-theme-contract.test.ts`
- Modify: `crates/codex-plus-core/src/assets.rs`

- [ ] **Step 1: Write the failing renderer contract test**

Add assertions that require the new loader and diagnostics:

```ts
test("custom Dream Skin fetches the loopback wallpaper and reports the runtime result", () => {
  const renderer = readFileSync(resolve(import.meta.dirname, "../../../assets/inject/renderer-inject.js"), "utf8");
  assert.match(renderer, /function loadCodexPlusLocalImageAsset\(/);
  assert.match(renderer, /fetch\(config\.imageUrl/);
  assert.match(renderer, /URL\.createObjectURL\(blob\)/);
  assert.match(renderer, /dream_skin_applied/);
  assert.match(renderer, /dream_skin_apply_failed/);
  assert.doesNotMatch(renderer.slice(renderer.indexOf('themeId === "custom-dream-skin"'), renderer.indexOf("function setCodexPlusSetting")), /overlay\.dataUrl/);
});
```

- [ ] **Step 2: Run the test and confirm RED**

```powershell
node --test apps\codex-plus-manager\src\scoped-theme-contract.test.ts
```

Expected: FAIL because the custom branch still reads `overlay.dataUrl`.

- [ ] **Step 3: Implement the shared loader**

Add a cached, safe local loader near `installCodexPlusImageOverlay`:

```js
let codexPlusLocalImagePromise = null;

function releaseCodexPlusLocalImageAsset() {
  if (window.__codexPlusImageOverlayBlobUrl) URL.revokeObjectURL(window.__codexPlusImageOverlayBlobUrl);
  window.__codexPlusImageOverlayBlobUrl = "";
  codexPlusLocalImagePromise = null;
}

function loadCodexPlusLocalImageAsset() {
  const config = window.__CODEX_PLUS_IMAGE_OVERLAY__ || {};
  if (!config.enabled || typeof config.imageUrl !== "string") return Promise.reject(new Error("本地壁纸未启用"));
  const parsed = new URL(config.imageUrl);
  if (parsed.hostname !== "127.0.0.1" || parsed.pathname !== "/overlay/image") return Promise.reject(new Error("本地壁纸地址无效"));
  if (window.__codexPlusImageOverlayBlobUrl) return Promise.resolve(window.__codexPlusImageOverlayBlobUrl);
  if (codexPlusLocalImagePromise) return codexPlusLocalImagePromise;
  codexPlusLocalImagePromise = fetch(config.imageUrl, { cache: "no-store", credentials: "omit" })
    .then((response) => {
      if (!response.ok) throw new Error(`本地壁纸读取失败（HTTP ${response.status}）`);
      const type = String(response.headers.get("content-type") || "").split(";")[0].toLowerCase();
      if (!["image/png", "image/jpeg", "image/webp"].includes(type)) throw new Error("本地壁纸格式不受支持");
      return response.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      window.__codexPlusImageOverlayBlobUrl = url;
      return url;
    })
    .catch((error) => {
      codexPlusLocalImagePromise = null;
      throw error;
    });
  return codexPlusLocalImagePromise;
}
```

Make the ordinary overlay await this loader unless custom Dream Skin is selected. Make the custom branch call `loadCodexPlusLocalImageAsset()` and pass the resulting Blob URL to `applyCodeworkDreamSkin`.

- [ ] **Step 4: Report runtime success and failure**

Inside `applyCodeworkDreamSkin`, emit:

```js
sendCodexPlusDiagnostic("dream_skin_applied", { themeId: theme.id, revision: payload.generation || theme.version || "runtime" });
```

Replace the silent catch with:

```js
}).catch((error) => {
  sendCodexPlusDiagnostic("dream_skin_apply_failed", {
    themeId: theme.id,
    message: String(error?.message || error || "主题渲染失败"),
  });
  restoreCodeworkDreamSkin();
});
```

- [ ] **Step 5: Run renderer and Rust regressions**

```powershell
node --test apps\codex-plus-manager\src\scoped-theme-contract.test.ts
$env:CARGO_TARGET_DIR = Join-Path $env:TEMP 'codework-cargo-1343-renderer'
cargo test -p codex-plus-core --lib assets::tests --jobs 1
```

Expected: all tests pass.

- [ ] **Step 6: Commit renderer changes**

```powershell
git add assets/inject/renderer-inject.js apps/codex-plus-manager/src/scoped-theme-contract.test.ts crates/codex-plus-core/src/assets.rs
git commit -m "fix: make custom Dream Skin rendering observable"
```

### Task 4: Verify the runtime result in the manager

**Files:**
- Modify: `crates/codex-plus-core/src/diagnostic_log.rs`
- Modify: `apps/codex-plus-manager/src-tauri/src/dream_skin_commands.rs`
- Modify: `apps/codex-plus-manager/src/App.tsx`
- Modify: `apps/codex-plus-manager/src/visual-theme-transition.ts`
- Modify: `apps/codex-plus-manager/src/visual-theme-transition.test.ts`

- [ ] **Step 1: Write failing diagnostic-reader tests**

Add a public runtime-event type and first write this test in `diagnostic_log.rs`:

```rust
#[test]
fn latest_dream_skin_runtime_event_returns_the_newest_matching_renderer_event() {
    let dir = tempfile::tempdir().unwrap();
    set_diagnostic_log_path_for_tests(Some(dir.path().join("diagnostics.log")));
    append_diagnostic_log("renderer.dream_skin_apply_failed", json!({
        "detail": { "themeId": "old-theme", "message": "old" }
    })).unwrap();
    append_diagnostic_log("renderer.dream_skin_applied", json!({
        "detail": { "themeId": "custom-dream-skin" }
    })).unwrap();

    let event = latest_dream_skin_runtime_event("custom-dream-skin", 60_000).unwrap();
    assert_eq!(event.state, "active");
    assert_eq!(event.theme_id, "custom-dream-skin");
    set_diagnostic_log_path_for_tests(None);
}
```

- [ ] **Step 2: Run the test and confirm RED**

```powershell
$env:CARGO_TARGET_DIR = Join-Path $env:TEMP 'codework-cargo-1343-status-red'
cargo test -p codex-plus-core --lib latest_dream_skin_runtime_event_returns_the_newest_matching_renderer_event --jobs 1
```

Expected: FAIL because the reader does not exist.

- [ ] **Step 3: Implement the reader and Tauri status command**

Derive `Deserialize` for `DiagnosticRecord` and add this reader:

```rust
#[derive(Debug, Clone, Serialize, serde::Deserialize, PartialEq, Eq)]
pub struct DreamSkinRuntimeEvent {
    pub state: String,
    pub theme_id: String,
    pub message: Option<String>,
    pub timestamp_ms: u64,
}

pub fn latest_dream_skin_runtime_event(theme_id: &str, max_age_ms: u64) -> Option<DreamSkinRuntimeEvent> {
    let contents = std::fs::read_to_string(diagnostic_log_path()).ok()?;
    let now = now_ms();
    for line in contents.lines().rev() {
        let Ok(record) = serde_json::from_str::<DiagnosticRecord>(line) else { continue };
        if now.saturating_sub(record.timestamp_ms) > max_age_ms { continue; }
        let state = match record.event.as_str() {
            "renderer.dream_skin_applied" => "active",
            "renderer.dream_skin_apply_failed" => "failed",
            _ => continue,
        };
        let detail = record.detail.get("detail").and_then(Value::as_object);
        let event_theme_id = detail.and_then(|value| value.get("themeId")).and_then(Value::as_str).unwrap_or("");
        if event_theme_id != theme_id { continue; }
        let message = detail.and_then(|value| value.get("message")).and_then(Value::as_str).map(str::to_string);
        return Some(DreamSkinRuntimeEvent {
            state: state.to_string(),
            theme_id: event_theme_id.to_string(),
            message,
            timestamp_ms: record.timestamp_ms,
        });
    }
    None
}
```

Return this payload from `dream_skin_status`:

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DreamSkinPayload {
    pub dream_skin_state: String,
    pub restart_required: bool,
    pub theme_id: Option<String>,
    pub message: Option<String>,
}
```

The command loads the current settings theme ID and maps the latest event to `active`, `failed`, or `pending`:

```rust
#[tauri::command]
pub fn dream_skin_status() -> crate::commands::CommandResult<DreamSkinPayload> {
    let settings = codex_plus_core::settings::SettingsStore::default().load().unwrap_or_default();
    let theme_id = settings.codex_app_visual_theme_id;
    let event = codex_plus_core::diagnostic_log::latest_dream_skin_runtime_event(&theme_id, 60_000);
    let payload = match event {
        Some(event) => DreamSkinPayload {
            dream_skin_state: event.state,
            restart_required: false,
            theme_id: Some(event.theme_id),
            message: event.message,
        },
        None => DreamSkinPayload {
            dream_skin_state: "pending".to_string(),
            restart_required: false,
            theme_id: Some(theme_id),
            message: None,
        },
    };
    crate::commands::ok("Dream Skin status loaded", payload)
}
```

- [ ] **Step 4: Write and run the failing frontend verification test**

Extend `visual-theme-transition.test.ts` with:

```ts
test("waits for the matching runtime result after restart", async () => {
  let checks = 0;
  const statuses: string[] = [];
  await runVisualThemeTransition(request(true), {
    cleanupLegacy: async () => ({ status: "ok" }),
    saveSettings: async () => true,
    restart: async () => true,
    verifyRuntime: async () => (++checks < 2 ? { state: "pending" } : { state: "active", themeId: "cyber-neon" }),
    setStatus: (value) => statuses.push(value),
  });
  assert.equal(checks, 2);
  assert.match(statuses.at(-1) || "", /已应用/);
});
```

Run:

```powershell
node --test apps\codex-plus-manager\src\visual-theme-transition.test.ts
```

Expected: FAIL because `verifyRuntime` is not supported.

- [ ] **Step 5: Implement bounded verification**

Add this dependency contract:

```ts
verifyRuntime?: (themeId: string) => Promise<{ state: "pending" | "active" | "failed"; themeId?: string; message?: string }>;
```

After restart, use this bounded verification block:

```ts
if (request.enabled && dependencies.verifyRuntime) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    dependencies.setStatus(`Codex 已重启，正在确认${request.displayName}…`);
    const runtime = await dependencies.verifyRuntime(request.themeId);
    if (runtime.state === "active" && runtime.themeId === request.themeId) {
      dependencies.setStatus(`${request.displayName}已应用`);
      return;
    }
    if (runtime.state === "failed" && (!runtime.themeId || runtime.themeId === request.themeId)) {
      throw new Error(runtime.message || "主题运行时加载失败");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  dependencies.setStatus("设置已保存，等待 Codex 完成主题加载");
  return;
}
dependencies.setStatus(request.enabled ? `${request.displayName}已应用` : "已恢复官方默认");
```

- [ ] **Step 6: Wire the Tauri command into `VisualThemeScreen`**

Pass a verifier that invokes `dream_skin_status` and maps `dreamSkinState`, `themeId`, and `message` to the TypeScript contract. Preserve the existing `saveSettingsValue(next, true)` path for `custom-dream-skin`.

- [ ] **Step 7: Run status tests and commit**

```powershell
$env:CARGO_TARGET_DIR = Join-Path $env:TEMP 'codework-cargo-1343-status'
cargo test -p codex-plus-core --lib diagnostic_log --jobs 1
cargo test -p codex-plus-manager --lib dream_skin --jobs 1
node --test apps\codex-plus-manager\src\visual-theme-transition.test.ts apps\codex-plus-manager\src\visual-theme-interaction-contract.test.ts
```

Expected: all tests pass.

```powershell
git add crates/codex-plus-core/src/diagnostic_log.rs apps/codex-plus-manager/src-tauri/src/dream_skin_commands.rs apps/codex-plus-manager/src/App.tsx apps/codex-plus-manager/src/visual-theme-transition.ts apps/codex-plus-manager/src/visual-theme-transition.test.ts
git commit -m "fix: verify Dream Skin runtime activation"
```

### Task 5: Full regression and real custom-image smoke test

**Files:**
- Test only; no planned production edits.

- [ ] **Step 1: Run frontend tests, typecheck and build**

```powershell
$frontendTests = Get-ChildItem 'apps\codex-plus-manager\src' -Filter '*.test.ts' | ForEach-Object FullName
node --test $frontendTests
Push-Location apps\codex-plus-manager
npm run check
npm run vite:build
Pop-Location
```

Expected: all tests pass, TypeScript exits 0, Vite builds successfully.

- [ ] **Step 2: Run Rust regressions in an isolated target directory**

```powershell
$env:CARGO_TARGET_DIR = Join-Path $env:TEMP 'codework-cargo-1343-full'
cargo test --workspace --exclude codex-plus-manager --jobs 1
cargo test -p codex-plus-manager --lib --jobs 1
```

Expected: zero failed tests.

- [ ] **Step 3: Run the app against the supplied wallpaper**

Save the user image path, select `custom-dream-skin`, restart Codex through the manager, and verify through CDP that:

```js
({
  theme: document.documentElement.getAttribute("data-codework-dream-skin"),
  hasArt: getComputedStyle(document.documentElement).getPropertyValue("--dream-art").includes("blob:"),
  headerPosition: getComputedStyle(document.querySelector("header.app-header-tint")).position,
  headerZ: getComputedStyle(document.querySelector("header.app-header-tint")).zIndex,
})
```

Expected: `theme === "custom-dream-skin"`, `hasArt === true`, `headerPosition === "fixed"`, and `headerZ === "30"`.

- [ ] **Step 4: Verify all three server themes in the manager**

Refresh the online themes and confirm the cards display:

- 凯蒂猫限定主题 · 圣诞小屋
- 蜡笔小新限定主题 · 元气涂鸦
- 凯蒂猫限定主题 · 云朵梦境

### Task 6: Build and sign version 1.3.43

**Files:**
- Modify: `Cargo.toml`
- Modify: `Cargo.lock`
- Modify: `apps/codex-plus-manager/package.json`
- Modify: `apps/codex-plus-manager/package-lock.json`
- Modify: `apps/codex-plus-manager/src-tauri/tauri.conf.json`
- Modify: `scripts/build-codework-windows.ps1`
- Create: `release-assets/codework-ai-client-1.3.43-notes.json`
- Create: `release-assets/codework-ai-client-1.3.43-windows-x64-setup.exe`
- Create: `release-assets/codework-ai-client-windows-1.3.43.json`
- Modify: `release-assets/codework-ai-client-windows.json`

- [ ] **Step 1: Bump all authoritative version fields**

Change `1.3.42` to `1.3.43` in the listed Cargo, npm, Tauri and build-script files. Run:

```powershell
rg -n '1\.3\.42' Cargo.toml Cargo.lock apps\codex-plus-manager\package.json apps\codex-plus-manager\package-lock.json apps\codex-plus-manager\src-tauri\tauri.conf.json scripts\build-codework-windows.ps1
```

Expected: no output after the bump.

- [ ] **Step 2: Create public notes**

Write `release-assets/codework-ai-client-1.3.43-notes.json`:

```json
[
  "新增凯蒂猫限定主题 · 云朵梦境。",
  "修复自定义大尺寸壁纸显示当前使用但未实际生效的问题。",
  "自定义壁纸改用本机安全通道加载，减少启动注入体积。",
  "新增主题运行结果检测与失败提示。",
  "继续修复主题侧边按钮、标题栏与文字层级兼容问题。"
]
```

- [ ] **Step 3: Build the installer**

```powershell
$env:CODEWORK_RELEASE_SIGNING_KEY = 'D:\Codework Secrets\release-signing.key'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-codework-windows.ps1
```

Expected: release build, tests and NSIS installer all exit 0.

Copy the generated installer into the stable release-assets name:

```powershell
$built = 'D:\Codework Releases\♛Codework AI客户端-1.3.43\♛Codework AI客户端-1.3.43-windows-x64-setup.exe'
Copy-Item -LiteralPath $built -Destination 'release-assets\codework-ai-client-1.3.43-windows-x64-setup.exe' -Force
```

- [ ] **Step 4: Sign versioned and latest manifests**

```powershell
$installer = 'release-assets\codework-ai-client-1.3.43-windows-x64-setup.exe'
$notes = 'release-assets\codework-ai-client-1.3.43-notes.json'
$publishedAt = [DateTimeOffset]::Now.ToString('o')
$url = 'http://115.190.199.191:20080/downloads/codework-ai-client-1.3.43-windows-x64-setup.exe'
cargo run -p codex-plus-core --bin codework-release-sign -- sign-manifest --private-key 'D:\Codework Secrets\release-signing.key' --installer $installer --version 1.3.43 --download-url $url --published-at $publishedAt --minimum-supported-version 1.3.20 --notes-file $notes --output 'release-assets\codework-ai-client-windows-1.3.43.json'
Copy-Item 'release-assets\codework-ai-client-windows-1.3.43.json' 'release-assets\codework-ai-client-windows.json' -Force
```

- [ ] **Step 5: Install silently and verify preservation**

Hash `%USERPROFILE%\.codework-codex-plus-plus\settings.json`, install with `/S`, and compare the hash afterward. Verify registry, manager executable and launcher executable all report `1.3.43`.

### Task 7: Deploy the theme service and automatic update

**Files:**
- Server: `/opt/xiaoshuai-lottery/services/codework-theme-service/themes/`
- Container: `xiaoshuai-lottery:/app/data/downloads/`

- [ ] **Step 1: Deploy theme-service files**

Upload the updated manifest, grants and two new assets to `/opt/xiaoshuai-lottery`, then run:

```sh
docker cp /opt/xiaoshuai-lottery/manifest.json codework-theme-service:/app/themes/manifest.json
docker cp /opt/xiaoshuai-lottery/grants.json codework-theme-service:/app/themes/grants.json
docker cp /opt/xiaoshuai-lottery/kitty-cloud-dream.png codework-theme-service:/app/themes/assets/kitty-cloud-dream.png
docker cp /opt/xiaoshuai-lottery/kitty-cloud-dream-thumb.jpg codework-theme-service:/app/themes/assets/kitty-cloud-dream-thumb.jpg
docker exec codework-theme-service chmod 0644 /app/themes/manifest.json /app/themes/grants.json /app/themes/assets/kitty-cloud-dream.png /app/themes/assets/kitty-cloud-dream-thumb.jpg
docker restart codework-theme-service
```

Verify an authenticated request returns `hello-kitty-cloud-dream` and both asset URLs return 200.

- [ ] **Step 2: Publish versioned update files first**

Copy these files to `/app/data/downloads/` with mode `0644`:

```text
codework-ai-client-1.3.43-windows-x64-setup.exe
codework-ai-client-windows-1.3.43.json
```

Download the public installer and confirm its SHA-256 matches the signed versioned manifest.

- [ ] **Step 3: Publish the latest manifest last**

Copy `codework-ai-client-windows.json` only after Step 2 succeeds. Verify:

```powershell
$manifest = Invoke-RestMethod ('http://115.190.199.191:20080/downloads/codework-ai-client-windows.json?ts=' + [DateTimeOffset]::Now.ToUnixTimeMilliseconds())
$manifest.version
$manifest.downloadUrl
```

Expected: version `1.3.43` and a URL ending in `codework-ai-client-1.3.43-windows-x64-setup.exe`.

- [ ] **Step 4: Final release verification**

Download the public installer, compare its length and SHA-256 with the signed manifest, then launch the installed manager and verify the local installed version is `1.3.43`.

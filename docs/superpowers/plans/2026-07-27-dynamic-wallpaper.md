# Dynamic Wallpaper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give official Dream Skins and the user's custom wallpaper a smooth, readable background motion layer in the Windows client.

**Architecture:** The renderer injection owns artwork URLs, lifecycle cleanup and the compact title-bar controls. Add a Codework-owned fixed motion layer beneath the client UI, persist one boolean toggle with the existing visual tuning data, and pause animation when the document is hidden. Existing surface/blur rules remain the reading layer.

**Tech Stack:** JavaScript renderer injection, CSS transform animation, Node `assert`/VM tests, PowerShell Windows packaging.

---

## File structure

- `assets/vendor/fei-away-codex-dream-skin/renderer-inject.js` — distribution renderer lifecycle, persisted toggle and motion DOM.
- `assets/vendor/fei-away-codex-dream-skin/dream-skin.css` — animated layer placement, readability and reduced-motion rules.
- `assets/vendor/fei-away-codex-dream-skin/windows-runtime/assets/renderer-inject.js` — byte-for-byte shipped renderer copy.
- `assets/vendor/fei-away-codex-dream-skin/windows-runtime/assets/dream-skin.css` — byte-for-byte shipped CSS copy.
- `assets/vendor/fei-away-codex-dream-skin/windows-runtime/tests/renderer-inject.test.mjs` — VM regression tests and copy-parity checks.

### Task 1: Prove the missing motion behavior with a failing test

**Files:**
- Modify: `assets/vendor/fei-away-codex-dream-skin/windows-runtime/tests/renderer-inject.test.mjs`

- [ ] **Step 1: Extend the VM fixture with visibility events and local storage**

Add fixture storage and a visibility listener map:

```js
const listeners = new Map();
const storage = new Map();

const document = {
  hidden: false,
  addEventListener(type, listener) { listeners.set(type, listener); },
  removeEventListener(type) { listeners.delete(type); },
  // retain the existing document methods
};

window: {
  localStorage: {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, value); },
  },
  matchMedia() { return { matches: osAppearance === "dark" }; },
},
```

Expose this test helper from `createFixture`:

```js
setDocumentHidden(value) {
  document.hidden = value;
  listeners.get("visibilitychange")?.();
},
```

- [ ] **Step 2: Add the red assertions**

Append this assertion after the existing collapsed-sidebar regression:

```js
const motion = createFixture({ shellPresent: true });
vm.runInNewContext(payload, motion.context);
assert.equal(motion.rootClasses.has("dream-motion-enabled"), true);
assert.equal(motion.nodes.has("codework-dream-motion-layer"), true);

motion.setDocumentHidden(true);
assert.equal(motion.rootClasses.has("dream-motion-paused"), true);
motion.setDocumentHidden(false);
assert.equal(motion.rootClasses.has("dream-motion-paused"), false);

assert.match(
  motion.nodes.get("codex-dream-skin-chrome").innerHTML,
  /data-dream-motion="toggle"/,
);
assert.equal(motion.context.window.__CODEX_DREAM_SKIN_STATE__.cleanup(), true);
assert.equal(motion.nodes.has("codework-dream-motion-layer"), false);
```

Add source-parity and CSS contract assertions near the existing CSS checks:

```js
const distributionRoot = path.resolve(windowsRoot, "..");
assert.equal(
  await fs.readFile(path.join(distributionRoot, "renderer-inject.js"), "utf8"),
  template,
);
assert.match(css, /#codework-dream-motion-layer[\s\S]*?animation:\s*codework-dream-wallpaper-drift/);
assert.match(css, /dream-motion-paused\s+#codework-dream-motion-layer[\s\S]*?animation-play-state:\s*paused/);
```

- [ ] **Step 3: Run the red test**

Run:

```powershell
node assets/vendor/fei-away-codex-dream-skin/windows-runtime/tests/renderer-inject.test.mjs
```

Expected: failure for the missing motion root class or motion layer, not a fixture error.

- [ ] **Step 4: Commit the red test**

```powershell
git add assets/vendor/fei-away-codex-dream-skin/windows-runtime/tests/renderer-inject.test.mjs
git commit -m "test: cover Dream Skin wallpaper motion"
```

### Task 2: Implement renderer lifecycle, pause state and user toggle

**Files:**
- Modify: `assets/vendor/fei-away-codex-dream-skin/renderer-inject.js`
- Modify: `assets/vendor/fei-away-codex-dream-skin/windows-runtime/assets/renderer-inject.js`

- [ ] **Step 1: Add motion constants and persist the enabled boolean**

Near `STYLE_ID` and `CHROME_ID`, add:

```js
const MOTION_ID = "codework-dream-motion-layer";
const MOTION_TOGGLE_KEY = "motion";
```

Extend `readTuning()` without changing the existing home/task defaults:

```js
return {
  home: clamp(stored.home ?? 4, 0, 18),
  task: clamp(stored.task ?? 8, 0, 18),
  motion: stored.motion !== false,
};
```

- [ ] **Step 2: Add a wallpaper-only layer**

Before `applyProfile`, add `applyMotion(root)`. It must create the layer only for enabled skins, copy the already-verified artwork URL and fit properties, never receive pointer input, and pause when the document is hidden:

```js
const applyMotion = (root) => {
  const enabled = tuning.motion !== false;
  let layer = document.getElementById(MOTION_ID);
  if (!enabled) {
    root.classList.remove("dream-motion-enabled", "dream-motion-paused");
    layer?.remove();
    return;
  }
  if (!layer || layer.parentElement !== document.body) {
    layer?.remove();
    layer = document.createElement("div");
    layer.id = MOTION_ID;
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);
  }
  layer.style.setProperty("--codework-motion-art", `url("${artUrl}")`);
  layer.style.setProperty("--codework-motion-position", root.style.getPropertyValue("--dream-art-position"));
  layer.style.setProperty("--codework-motion-fit", root.style.getPropertyValue("--dream-art-fit"));
  root.classList.add("dream-motion-enabled");
  root.classList.toggle("dream-motion-paused", document.hidden === true);
};
```

Call it after `applyProfile(root)` in `ensure`. In `clearSkinDom`, remove `MOTION_ID` and both motion classes.

- [ ] **Step 3: Handle visibility and persist toggle changes**

Register one `visibilitychange` listener after `ensure` is defined:

```js
const onVisibilityChange = () => {
  if (window[STATE_KEY]?.installToken !== installToken) return;
  applyMotion(document.documentElement);
};
document.addEventListener?.("visibilitychange", onVisibilityChange);
```

Save `onVisibilityChange` in the window state and call `document.removeEventListener?.("visibilitychange", state.onVisibilityChange)` in `cleanup`.

Add a focused setter instead of reusing the range-only `updateTuning`:

```js
const updateMotion = (root, enabled) => {
  tuning[MOTION_TOGGLE_KEY] = enabled !== false;
  applyMotion(root);
  try { window.localStorage?.setItem(TUNING_STORAGE_KEY, JSON.stringify(tuning)); } catch {}
};
```

- [ ] **Step 4: Add the compact toolbar checkbox**

Append this label inside `.codework-dream-tuning` in `chrome.innerHTML`:

```html
<label class="codework-dream-motion-control">动效
  <input data-dream-motion="toggle" type="checkbox" aria-label="动态壁纸">
</label>
```

After rendering the title bar, bind it separately from `input[data-dream-tuning]`:

```js
const motionToggle = chrome.querySelector?.('input[data-dream-motion="toggle"]');
motionToggle.checked = tuning.motion !== false;
motionToggle.addEventListener?.("change", () => updateMotion(root, motionToggle.checked));
```

- [ ] **Step 5: Mirror the renderer and turn the test green**

```powershell
Copy-Item assets/vendor/fei-away-codex-dream-skin/renderer-inject.js assets/vendor/fei-away-codex-dream-skin/windows-runtime/assets/renderer-inject.js -Force
node assets/vendor/fei-away-codex-dream-skin/windows-runtime/tests/renderer-inject.test.mjs
```

Expected: the test prints its existing PASS line.

- [ ] **Step 6: Commit the renderer behavior**

```powershell
git add assets/vendor/fei-away-codex-dream-skin/renderer-inject.js assets/vendor/fei-away-codex-dream-skin/windows-runtime/assets/renderer-inject.js assets/vendor/fei-away-codex-dream-skin/windows-runtime/tests/renderer-inject.test.mjs
git commit -m "feat: animate Dream Skin wallpaper layer"
```

### Task 3: Style the layer while preserving readable UI

**Files:**
- Modify: `assets/vendor/fei-away-codex-dream-skin/dream-skin.css`
- Modify: `assets/vendor/fei-away-codex-dream-skin/windows-runtime/assets/dream-skin.css`

- [ ] **Step 1: Add transform-only CSS motion**

After the base `body` rule, add:

```css
html.codex-dream-skin.dream-motion-enabled body {
  background-image: none !important;
  isolation: isolate;
}

#codework-dream-motion-layer {
  position: fixed;
  z-index: 0;
  inset: -5%;
  pointer-events: none;
  background-image: var(--codework-motion-art);
  background-repeat: no-repeat;
  background-position: var(--codework-motion-position);
  background-size: var(--codework-motion-fit);
  transform: scale(1.04) translate3d(-1.2%, -0.8%, 0);
  will-change: transform;
  animation: codework-dream-wallpaper-drift 18s ease-in-out infinite alternate;
}

html.codex-dream-skin.dream-motion-enabled body > :not(#codework-dream-motion-layer) {
  position: relative;
  z-index: 1;
}

@keyframes codework-dream-wallpaper-drift {
  to { transform: scale(1.09) translate3d(1.4%, 1%, 0); }
}

html.codex-dream-skin.dream-motion-paused #codework-dream-motion-layer {
  animation-play-state: paused;
}
```

- [ ] **Step 2: Suppress duplicate static artwork only in motion mode**

Add scoped overrides; retain existing blur and surface declarations:

```css
html.codex-dream-skin.dream-motion-enabled.dream-route-task main.main-surface,
html.codex-dream-skin.dream-motion-enabled .dream-task::before,
html.codex-dream-skin.dream-motion-enabled .dream-home > div:first-child > div:first-child > div:first-child {
  background-image: none !important;
}
```

Do not introduce global text-color rules, a forced black/white mode, or a pink overlay. The existing image analysis must continue to provide the custom-wallpaper accent.

- [ ] **Step 3: Style the checkbox and system accessibility fallback**

```css
.codework-dream-motion-control {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: inherit;
  font-size: 11px;
}

.codework-dream-motion-control input { accent-color: var(--dream-accent); }

@media (prefers-reduced-motion: reduce) {
  #codework-dream-motion-layer { animation: none !important; }
}
```

- [ ] **Step 4: Mirror CSS and run focused verification**

```powershell
Copy-Item assets/vendor/fei-away-codex-dream-skin/dream-skin.css assets/vendor/fei-away-codex-dream-skin/windows-runtime/assets/dream-skin.css -Force
node assets/vendor/fei-away-codex-dream-skin/windows-runtime/tests/renderer-inject.test.mjs
git diff --check
```

Expected: renderer test passes and `git diff --check` has no output.

- [ ] **Step 5: Commit the styles**

```powershell
git add assets/vendor/fei-away-codex-dream-skin/dream-skin.css assets/vendor/fei-away-codex-dream-skin/windows-runtime/assets/dream-skin.css
git commit -m "style: preserve readability with animated wallpapers"
```

### Task 4: Run Windows release verification

**Files:**
- Verify: `assets/vendor/fei-away-codex-dream-skin/windows-runtime/tests/run-tests.ps1`
- Verify: `apps/codex-plus-manager/package.json`
- Verify: `scripts/build-codework-windows.ps1`

- [ ] **Step 1: Run runtime and manager checks**

```powershell
powershell -ExecutionPolicy Bypass -File assets/vendor/fei-away-codex-dream-skin/windows-runtime/tests/run-tests.ps1
npm --prefix apps/codex-plus-manager run check
npm --prefix apps/codex-plus-manager run vite:build
```

Expected: all commands exit 0.

- [ ] **Step 2: Build the Windows installer**

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-codework-windows.ps1
```

Expected: the build prints `INSTALLER=` and creates the Windows setup executable under `dist/windows/`.

- [ ] **Step 3: Manually accept the build**

1. Apply 蜡笔小新, 凯蒂猫 and the current custom wallpaper.
2. Confirm only the background drifts; navigation, chat, title-bar identity and input remain stable and readable.
3. Toggle 动效 off: the same wallpaper remains static.
4. Hide and restore the left sidebar: active skin and motion state persist.
5. Switch home/task routes: no duplicate image, pale veil, opaque header or unclickable toolbar appears.
6. Defocus/refocus the app: the animation pauses then resumes.

## Plan self-review

- All spec requirements map to Tasks 1–4: all three wallpaper sources, original colour preservation, controls, focus pause, reduced-motion support, sidebar resilience and Windows verification.
- No incomplete placeholder markers remain.
- The same names are used throughout: `MOTION_ID`, `MOTION_TOGGLE_KEY`, `applyMotion`, `updateMotion`, `dream-motion-enabled` and `dream-motion-paused`.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const runner = readFileSync(resolve(root, "assets/vendor/fei-away-codex-dream-skin/renderer-inject.js"), "utf8");
const skinCss = readFileSync(resolve(root, "assets/vendor/fei-away-codex-dream-skin/dream-skin.css"), "utf8");
const app = readFileSync(resolve(root, "apps/codex-plus-manager/src/App.tsx"), "utf8");
const styles = readFileSync(resolve(root, "apps/codex-plus-manager/src/styles.css"), "utf8");

test("Dream Skin keeps the identity toolbar during transient Codex route rebuilds", () => {
  assert.doesNotMatch(runner, /if \(!shellMain\) \{\s*clearSkinDom\(\);/);
  const missingShellBranch = /if \(!shellMain\) \{([\s\S]*?)\n    \}/.exec(runner)?.[1];
  assert.ok(missingShellBranch, "missing shell branch should remain explicit");
  assert.match(missingShellBranch, /if \(!previous\?\.installed\) clearSkinDom\(\);/);
  assert.match(missingShellBranch, /return;/);
  assert.match(runner, /main\.main-surface[\s\S]{0,180}MainContentSurface/);
});

test("Dream Skin pins the client status toolbar to the title-bar safe zone", () => {
  assert.doesNotMatch(runner, /const nativeTitleBar = document\.querySelector\('\[class~="group\/application-menu-top-bar"\]'\);/);
  assert.match(skinCss, /top: var\(--codework-dream-chrome-top, 6px\);/);
  assert.match(skinCss, /max-width: calc\(100vw - 420px\);/);
});

test("Dream Skin adapts the current hashed Codex surface to the vendored CSS contract", () => {
  assert.match(runner, /shellMain\.classList\.add\("main-surface"\)/);
  assert.match(runner, /data-codework-dream-surface/);
  assert.match(skinCss, /dream-art-custom-cover main\.main-surface\.dream-task::before/);
});

test("Dream Skin toolbar sliders control readable veil percentages", () => {
  assert.match(runner, /--dream-home-veil/);
  assert.match(runner, /--dream-task-veil/);
  assert.match(runner, /aria-label="首页遮罩"/);
  assert.match(runner, /aria-label="对话遮罩"/);
  assert.doesNotMatch(runner, /input\.min = "0";\s*input\.max = "18";/);
  assert.match(skinCss, /dream-wallpaper-light[\s\S]*?text-token-foreground/);
});

test("dynamic custom wallpaper has exactly one artwork paint source", () => {
  assert.doesNotMatch(
    skinCss,
    /dream-art-custom-cover\.dream-route-task main\.main-surface \{\s*background-color: transparent !important;\s*background-image: var\(--dream-art\) !important;/,
  );
  assert.match(skinCss, /dream-motion-enabled body \{\s*background-image: none !important;/);
});

test("dynamic custom wallpaper clears the static body artwork before the motion layer paints", () => {
  assert.match(
    skinCss,
    /dream-motion-enabled\.dream-art-custom-cover body \{\s*background-image: none !important;/,
  );
});

test("motion stacking never repositions the fixed Codework status toolbar", () => {
  assert.match(
    skinCss,
    /body > :not\(\s*#codework-dream-motion-layer,\s*#codex-dream-skin-chrome\s*\)/,
  );
  assert.match(
    skinCss,
    /#codex-dream-skin-chrome \{\s*position: fixed !important;/,
  );
});

test("Dream Skin composer preserves readable model and action text", () => {
  assert.match(
    skinCss,
    /\.composer-surface-chrome :is\(button, \[role="button"\], \[class\*="text-"\], svg\) \{\s*color: var\(--dream-text\) !important;/,
  );
});

test("community and announcement editors use vertical field geometry", () => {
  assert.match(app, /Panel className="community-compose-panel"/);
  assert.match(styles, /\.announcement-editor > label\.field \{\s*display: grid;/);
});

test("visual theme cards retain the light reading surface in either client skin", () => {
  assert.match(app, /className="stack visual-theme-screen"/);
  assert.match(styles, /\.shell\[data-client-skin\] \.visual-theme-screen \.theme-card \{\s*background: var\(--reading-surface\) !important;/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const app = readFileSync(resolve(import.meta.dirname, "./App.tsx"), "utf8");
const screen = app.slice(app.indexOf("function VisualThemeScreen"), app.indexOf("function SettingsScreen"));

test("visual themes use the current Codework launcher instead of a second legacy injector", () => {
  assert.match(screen, /runVisualThemeTransition/);
  assert.match(screen, /restart: actions\.restart/);
  assert.doesNotMatch(screen, /restore_dream_skin/);
  assert.doesNotMatch(screen, /apply_dream_skin/);
});

test("custom Dream Skin persists the wallpaper and the selected visual theme", () => {
  assert.match(screen, /id === "custom-dream-skin"/);
  assert.match(screen, /actions\.saveSettingsValue\(next, true\)/);
  assert.match(screen, /actions\.saveVisualThemeSettings\(enabled, themeId, nextServiceUrl, true\)/);
});

test("custom Dream Skin explains the wide-screen wallpaper recommendation and automatic narrow-image fit", () => {
  assert.match(screen, /推荐 16:9（1920×1080 或 2560×1440）/);
  assert.match(screen, /3:2、4:3 和竖图会自动完整显示/);
});

test("theme controls expose progress and release their busy state", () => {
  assert.match(screen, /const \[applyingThemeId, setApplyingThemeId\]/);
  assert.match(screen, /finally \{\s*setApplyingThemeId\(null\)/);
  assert.match(screen, /themeOperationBusy/);
  assert.match(screen, /aria-live="polite"/);
});

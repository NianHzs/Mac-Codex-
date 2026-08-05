import assert from "node:assert/strict";
import test from "node:test";

import { createCustomDreamSkin, validateCustomDreamSkin } from "./custom-dream-skin.ts";

test("uses the custom wallpaper dominant color instead of forcing a pink accent", () => {
  const skin = createCustomDreamSkin({ dominant: "#2bb8a9", luma: 0.72 }, "wallpaper.png");
  assert.equal(skin.id, "custom-dream-skin");
  assert.equal(skin.heroAsset, "local-custom-wallpaper.png");
  assert.equal(skin.cssProfile, "dream-skin-light");
  assert.equal(skin.tokens.accent, "#2bb8a9");
  assert.notEqual(skin.tokens.background, "#fff7fa");
});

test("rejects custom art outside supported Dream Skin modes", () => {
  assert.equal(validateCustomDreamSkin({ art: { focusX: 0.5, focusY: 0.5, safeArea: "top", taskMode: "ambient" } }), false);
});

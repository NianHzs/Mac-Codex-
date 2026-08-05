import assert from "node:assert/strict";
import test from "node:test";

import { buildThemeFeedback } from "./theme-feedback.ts";
import type { VisualThemeItem, VisualThemeManifest } from "./visual-theme-contract.ts";

const tokens = {
  background: "#ffffff",
  surface: "#ffffff",
  accent: "#111111",
  border: "#dddddd",
  text: "#111111",
  radius: 12,
  fontScale: 1,
};

function theme(id: string, name: string, access: "public" | "restricted" = "restricted"): VisualThemeItem {
  return { id, name, tier: "pro", version: "1.0.0", access, tokens };
}

test("theme feedback reports loaded themes and the member's authorised limited themes", () => {
  const manifest: VisualThemeManifest = {
    version: "1.3.47",
    themes: [
      theme("official", "官方简洁", "public"),
      theme("hello-kitty-christmas", "凯蒂猫·圣诞小屋"),
      theme("shinchan-energy", "蜡笔小新·元气涂鸦"),
      theme("hello-kitty-cloud-dream", "凯蒂猫·云朵梦境"),
    ],
    allowedThemeIds: ["hello-kitty-christmas", "shinchan-energy", "hello-kitty-cloud-dream"],
  };

  assert.deepEqual(buildThemeFeedback(manifest), {
    onlineThemeCount: 4,
    authorisedRestrictedNames: ["凯蒂猫·圣诞小屋", "蜡笔小新·元气涂鸦", "凯蒂猫·云朵梦境"],
    cloudDreamAvailable: true,
  });
});

test("theme feedback flags an older online manifest that does not contain cloud dream", () => {
  const manifest: VisualThemeManifest = {
    version: "1.2.0",
    themes: [theme("hello-kitty-christmas", "凯蒂猫·圣诞小屋")],
    allowedThemeIds: ["hello-kitty-christmas"],
  };

  assert.equal(buildThemeFeedback(manifest).cloudDreamAvailable, false);
});

test("theme feedback has an empty state before an online manifest is loaded", () => {
  assert.deepEqual(buildThemeFeedback(null), {
    onlineThemeCount: 0,
    authorisedRestrictedNames: [],
    cloudDreamAvailable: false,
  });
});

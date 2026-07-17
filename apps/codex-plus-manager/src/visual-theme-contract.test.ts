import assert from "node:assert";
import { describe, it } from "node:test";
import { isThemeAccessToken, isThemeManifest, themesVisibleToMember } from "./visual-theme-contract.ts";

const kittyTheme = {
  id: "hello-kitty-christmas",
  name: "凯蒂猫限定主题 · 圣诞小屋",
  tier: "pro" as const,
  version: "1.0.0",
  access: "restricted" as const,
  cssProfile: "character-hero-light" as const,
  previewAsset: "kitty-christmas-thumb.jpg",
  heroAsset: "kitty-christmas.jpg",
  tokens: {
    background: "#FFF3F6", surface: "#FFFCFD", accent: "#CE4D78", border: "#F0D7DF", text: "#653A47", radius: 14, fontScale: 1,
  },
};

describe("character theme contract", () => {
  it("accepts an authorized character theme", () => {
    assert.strictEqual(isThemeManifest({ version: "1.1.0", themes: [kittyTheme], allowedThemeIds: [kittyTheme.id] }), true);
  });

  it("marks a restricted theme locked when the member has no grant", () => {
    const [theme] = themesVisibleToMember({ version: "1.1.0", themes: [kittyTheme], allowedThemeIds: [] });
    assert.strictEqual(theme.authorized, false);
  });

  it("rejects a character theme with an asset traversal path", () => {
    assert.strictEqual(
      isThemeManifest({ version: "1.1.0", themes: [{ ...kittyTheme, heroAsset: "../secret.png" }], allowedThemeIds: [] }),
      false,
    );
  });

  it("accepts only plausible theme session tokens", () => {
    assert.strictEqual(isThemeAccessToken("x".repeat(16)), true);
    assert.strictEqual(isThemeAccessToken("short"), false);
    assert.strictEqual(isThemeAccessToken("x".repeat(4097)), false);
  });
});

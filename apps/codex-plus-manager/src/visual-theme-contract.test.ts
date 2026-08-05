import assert from "node:assert";
import { describe, it } from "node:test";
import { isAppliedVisualTheme, isThemeManifest, themePreviewAssetCandidates } from "./visual-theme-contract.ts";

describe("applied visual theme", () => {
  it("requires enabled state, matching ID and authorization", () => {
    assert.equal(isAppliedVisualTheme({ enabled: true, selectedId: "shin-chan", item: { id: "shin-chan", authorized: true } }), true);
    assert.equal(isAppliedVisualTheme({ enabled: true, selectedId: "shin-chan", item: { id: "shin-chan", authorized: false } }), false);
    assert.equal(isAppliedVisualTheme({ enabled: false, selectedId: "shin-chan", item: { id: "shin-chan", authorized: true } }), false);
  });
});

describe("Dream Skin visual themes", () => {
  const baseTheme = {
    id: "kitty-room",
    name: "凯蒂猫限定主题 · 圣诞小屋",
    tier: "pro" as const,
    version: "1.0.0",
    access: "restricted" as const,
    heroAsset: "kitty-room.jpg",
    tokens: {
      background: "#fff3f7",
      surface: "#fffdfd",
      accent: "#dc5c91",
      border: "#efcada",
      text: "#71344d",
      radius: 18,
      fontScale: 1,
    },
  };

  it("accepts Dream Skin art metadata with a safe text area", () => {
    assert.equal(isThemeManifest({
      version: "1.0.0",
      themes: [{
        ...baseTheme,
        cssProfile: "dream-skin-light",
        art: { focusX: 0.72, focusY: 0.45, safeArea: "left", taskMode: "ambient", layout: "card" },
      }],
    }), true);
  });

  it("rejects Dream Skin art outside the safe coordinate range", () => {
    assert.equal(isThemeManifest({
      version: "1.0.0",
      themes: [{
        ...baseTheme,
        cssProfile: "dream-skin-light",
        art: { focusX: 2, focusY: 0.45, safeArea: "left", taskMode: "ambient" },
      }],
    }), false);
  });

  it("accepts a fixed card layout so curated themes do not depend on image aspect ratio", () => {
    assert.equal(isThemeManifest({
      version: "1.0.0",
      themes: [{
        ...baseTheme,
        cssProfile: "dream-skin-light",
        art: { focusX: 0.72, focusY: 0.45, safeArea: "left", taskMode: "ambient", layout: "card" },
      }],
    }), true);
  });

  it("rejects a theme manifest with a non-SHA256 asset hash", () => {
    assert.equal(isThemeManifest({
      version: "2",
      authorizationExpiresAt: "2026-07-20T00:00:00.000Z",
      themes: [{
        ...baseTheme,
        cssProfile: "dream-skin-light",
        art: { focusX: 0.72, focusY: 0.45, safeArea: "left", taskMode: "ambient" },
        revision: "2026-07-19-r3",
        sha256: "short",
        assetBytes: 1234,
      }],
    }), false);
  });

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
});

describe("theme previews", () => {
  it("falls back to the hero artwork when a restricted preview cannot be loaded", () => {
    assert.deepEqual(
      themePreviewAssetCandidates({ previewAsset: "shinchan-collage-thumb.png", heroAsset: "shinchan-collage.png" }),
      ["shinchan-collage-thumb.png", "shinchan-collage.png"],
    );
  });
});

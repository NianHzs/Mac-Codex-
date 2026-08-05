import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import { createThemeService } from "./server.mjs";

const manifest = {
  version: "1.1.0",
  themes: [
    { id: "hello-kitty-christmas", access: "restricted", heroAsset: "kitty-christmas.jpg" },
    { id: "shinchan-energy", access: "restricted", heroAsset: "shinchan-collage.png" },
  ],
};

test("returns only authenticated member grants in the manifest", async () => {
  const service = createThemeService({
    manifest,
    grants: { "u-1": ["hello-kitty-christmas"] },
    verifyMember: async (token) => token === "member-token" ? { userId: "u-1" } : null,
    readAsset: async () => Buffer.from("asset"),
  });

  const result = await service.handle({ method: "GET", url: "/v1/themes/manifest", authorization: "Bearer member-token" });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.allowedThemeIds, ["hello-kitty-christmas"]);
});

test("returns integrity metadata only for themes allowed to the verified member", async () => {
  const service = createThemeService({
    manifest: {
      version: "2",
      updatedAt: "2026-07-19T12:00:00.000Z",
      themes: [
        { id: "member-theme", access: "restricted", revision: "2026-07-19-r3", sha256: "a".repeat(64), assetBytes: 1234, heroAsset: "member-theme.png" },
        { id: "other-theme", access: "restricted", revision: "2026-07-19-r3", sha256: "b".repeat(64), assetBytes: 1234, heroAsset: "other-theme.png" },
      ],
    },
    grants: { "u-1": ["member-theme"] },
    verifyMember: async (token) => token === "member-a" ? { userId: "u-1" } : null,
    readAsset: async () => Buffer.from("asset"),
  });

  const result = await service.handle({ method: "GET", url: "/v1/themes/manifest", authorization: "Bearer member-a" });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.allowedThemeIds, ["member-theme"]);
  assert.deepEqual(result.body.themes.map((theme) => theme.id), ["member-theme"]);
  assert.equal(result.body.themes[0].sha256, "a".repeat(64));
  assert.equal(typeof result.body.authorizationExpiresAt, "string");
});

test("prefers a verified member's live lottery grants over the legacy grant file", async () => {
  const service = createThemeService({
    manifest,
    grants: { 'u-1': ['hello-kitty-christmas'] },
    verifyMember: async () => ({ userId: 'u-1', themeIds: ['shinchan-energy'] }),
    readAsset: async () => Buffer.from('asset'),
  });

  const result = await service.handle({ method: 'GET', url: '/v1/themes/manifest', authorization: 'Bearer member-token' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.allowedThemeIds, ['shinchan-energy']);
  assert.deepEqual(result.body.themes.map((theme) => theme.id), ['shinchan-energy']);
});

test("refuses a protected asset without a matching grant", async () => {
  const service = createThemeService({
    manifest,
    grants: {},
    verifyMember: async () => ({ userId: "u-2" }),
    readAsset: async () => Buffer.from("asset"),
  });

  const result = await service.handle({ method: "GET", url: "/v1/themes/assets/kitty-christmas.jpg", authorization: "Bearer member-token" });
  assert.equal(result.status, 403);
});

test("refuses traversal filenames before reading an asset", async () => {
  const service = createThemeService({ manifest, grants: { "u-1": ["hello-kitty-christmas"] }, verifyMember: async () => ({ userId: "u-1" }), readAsset: async () => { throw new Error("must not read"); } });
  const result = await service.handle({ method: "GET", url: "/v1/themes/assets/..%2Fsecret.png", authorization: "Bearer member-token" });
  assert.equal(result.status, 404);
});

test("ships the three restricted character themes as Dream Skin packages", async () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const shipped = JSON.parse(await readFile(join(root, "themes", "manifest.json"), "utf8"));
  const grants = JSON.parse(await readFile(join(root, "themes", "grants.json"), "utf8"));
  const ids = ["hello-kitty-christmas", "shinchan-energy", "hello-kitty-cloud-dream"];
  for (const id of ids) {
    const theme = shipped.themes.find((candidate) => candidate.id === id);
    assert.equal(theme.access, "restricted");
    assert.equal(theme.cssProfile, "dream-skin-light");
    assert.deepEqual(Object.keys(theme.art).sort(), ["focusX", "focusY", "layout", "safeArea", "taskMode"]);
    assert.equal(theme.art.layout, "card");
    assert.ok(grants["604"].includes(id));
  }

  const cloud = shipped.themes.find((theme) => theme.id === "hello-kitty-cloud-dream");
  assert.equal(cloud.name, "凯蒂猫限定主题 · 云朵梦境");
  assert.equal(cloud.heroAsset, "kitty-cloud-dream.jpg");
  assert.equal(cloud.previewAsset, "kitty-cloud-dream.jpg");
  assert.equal(cloud.sha256, "2a3a6444212e86585354102703b056eaa4fef7f6fd8c1177f2afe87ee1ffc65a");
  assert.equal(cloud.assetBytes, 1572991);
});

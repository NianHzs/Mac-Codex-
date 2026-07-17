import assert from "node:assert/strict";
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

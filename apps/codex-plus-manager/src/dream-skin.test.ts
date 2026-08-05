import assert from "node:assert/strict";
import test from "node:test";
import { getDreamSkinActions, resolveDreamSkinPanelTone } from "./dream-skin.ts";

test("maps restart-required progress to a user confirmation action", () => {
    assert.deepEqual(getDreamSkinActions("restart_required"), ["cancel", "restart_and_apply"]);
});

test("keeps a managed active skin recoverable through reapply and restore", () => {
  assert.deepEqual(getDreamSkinActions("active"), ["reapply", "restore"]);
});

test("keeps manager blue-pink skin separate from Codex Dream Skin status", () => {
  assert.equal(resolveDreamSkinPanelTone("active", "pink"), "dream-active");
  assert.notEqual(resolveDreamSkinPanelTone("active", "pink"), "pink");
});

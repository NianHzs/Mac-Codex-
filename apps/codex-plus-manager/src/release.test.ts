import assert from "node:assert";
import { describe, it } from "node:test";
import {
  getAvailableCodeworkRelease,
  getCodeworkReleaseDisplay,
  getCodeworkUpdateStageLabel,
  getCodeworkUpdateSteps,
} from "./release.ts";

describe("Codework release availability", () => {
  it("returns the newest release only for a successful available update", () => {
    assert.deepStrictEqual(
      getAvailableCodeworkRelease({ status: "ok", available: true, latestVersion: "1.3.2" }),
      { latestVersion: "1.3.2" },
    );
  });

  it("does not show an update for the current version or a failed check", () => {
    assert.strictEqual(getAvailableCodeworkRelease({ status: "ok", available: false, latestVersion: "1.3.2" }), null);
    assert.strictEqual(getAvailableCodeworkRelease({ status: "failed", available: true, latestVersion: "1.3.2" }), null);
  });

  it("maps the real self-update handoff into visible progress steps", () => {
    assert.deepStrictEqual(
      getCodeworkUpdateSteps("closing"),
      ["downloading", "downloaded", "verifying", "installing", "closing", "relaunching"],
    );
  });

  it("shows verification before installation", () => {
    assert.deepStrictEqual(
      getCodeworkUpdateSteps("verifying"),
      ["downloading", "downloaded", "verifying", "installing", "closing", "relaunching"],
    );
  });

  it("never labels an integrity failure as an installed update", () => {
    assert.strictEqual(getCodeworkUpdateStageLabel("integrity_failed"), "安装包校验失败，当前版本未受影响");
    assert.notStrictEqual(getCodeworkUpdateStageLabel("integrity_failed"), "安装完成");
  });

  it("never reports an old running manager as installed", () => {
    assert.deepStrictEqual(
      getCodeworkReleaseDisplay({ currentVersion: "1.3.20", latestVersion: "1.3.22" }),
      { state: "update_available", runningVersion: "1.3.20" },
    );
  });

  it("reports an incomplete pending update instead of a completed install", () => {
    assert.equal(
      getCodeworkReleaseDisplay({
        currentVersion: "1.3.23",
        latestVersion: "1.3.24",
        pendingTargetVersion: "1.3.24",
      }).state,
      "update_incomplete",
    );
  });
});

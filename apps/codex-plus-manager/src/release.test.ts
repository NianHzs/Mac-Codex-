import assert from "node:assert";
import { describe, it } from "node:test";
import { getAvailableCodeworkRelease, getCodeworkUpdateSteps } from "./release.ts";

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
      ["downloading", "downloaded", "installing", "closing", "relaunching"],
    );
  });
});

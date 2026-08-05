import assert from "node:assert/strict";
import test from "node:test";

import { runVisualThemeTransition } from "./visual-theme-transition.ts";

function request(enabled = true) {
  return {
    enabled,
    themeId: enabled ? "cyber-neon" : "shinchan-energy",
    serviceUrl: "http://themes.test",
    displayName: enabled ? "Cyber neon" : "Official default",
  };
}

test("theme transition saves settings and restarts the current Codework runtime", async () => {
  const calls: string[] = [];
  await runVisualThemeTransition(request(), {
    saveSettings: async () => { calls.push("save"); return true; },
    restart: async () => { calls.push("restart"); return true; },
    setStatus: () => {},
  });
  assert.deepEqual(calls, ["save", "restart"]);
});

test("settings failure stops before restart", async () => {
  const calls: string[] = [];
  await assert.rejects(
    runVisualThemeTransition(request(), {
      saveSettings: async () => { calls.push("save"); return false; },
      restart: async () => { calls.push("restart"); return true; },
      setStatus: () => {},
    }),
  );
  assert.deepEqual(calls, ["save"]);
});

test("restart failure happens only after settings persist", async () => {
  const calls: string[] = [];
  await assert.rejects(
    runVisualThemeTransition(request(false), {
      saveSettings: async () => { calls.push("save"); return true; },
      restart: async () => { calls.push("restart"); return false; },
      setStatus: () => {},
    }),
  );
  assert.deepEqual(calls, ["save", "restart"]);
});

test("waits for the matching renderer runtime result after restart", async () => {
  let checks = 0;
  await runVisualThemeTransition(request(true), {
    saveSettings: async () => true,
    restart: async () => true,
    verifyRuntime: async () => (++checks < 2
      ? { state: "pending" as const }
      : { state: "active" as const, themeId: "cyber-neon" }),
    setStatus: () => {},
  });
  assert.equal(checks, 2);
});

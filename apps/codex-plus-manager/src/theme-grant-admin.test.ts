import assert from "node:assert/strict";
import test from "node:test";

import { canSaveThemeGrant, normalizeThemeGrantIds } from "./theme-grant-admin.ts";

test("theme grant selections are deduplicated in the shipped theme order", () => {
  assert.deepEqual(normalizeThemeGrantIds(["shinchan-energy", "shinchan-energy", "hello-kitty-christmas"]), [
    "hello-kitty-christmas",
    "shinchan-energy",
  ]);
});

test("theme grants can only be saved for a resolved member", () => {
  assert.equal(canSaveThemeGrant(null, ["shinchan-energy"]), false);
  assert.equal(canSaveThemeGrant({ userId: "609", username: "Member" }, []), true);
  assert.equal(canSaveThemeGrant({ userId: "609", username: "Member" }, ["shinchan-energy"]), true);
});

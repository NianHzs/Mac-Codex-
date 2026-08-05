import assert from "node:assert/strict";
import test from "node:test";

import { groupNavigationItems, navigationGroupExpanded, toggleNavigationGroup } from "./navigation-groups.ts";

const items = [
  { id: "overview", group: "workspace" as const },
  { id: "announcements", group: "community" as const },
  { id: "announcementManagement", group: "community" as const, adminOnly: true },
  { id: "relay", group: "clientTools" as const },
  { id: "context", group: "codexTools" as const },
];

test("navigation hides administrator-only routes for regular members", () => {
  const groups = groupNavigationItems(items, "overview", false);

  assert.deepEqual(groups.flatMap((group) => group.items.map((item) => item.id)), [
    "overview",
    "announcements",
    "relay",
    "context",
  ]);
});

test("the group containing the active route is expanded", () => {
  const groups = groupNavigationItems(items, "context", true);

  assert.equal(groups.find((group) => group.id === "codexTools")?.expanded, true);
  assert.equal(groups.find((group) => group.id === "clientTools")?.expanded, false);
});

test("a normally collapsed tool group opens when its header is clicked", () => {
  const collapsed = new Set<"clientTools">();
  assert.equal(navigationGroupExpanded(false, "clientTools", collapsed), false);

  const opened = toggleNavigationGroup(false, "clientTools", collapsed);
  assert.equal(navigationGroupExpanded(false, "clientTools", opened), true);

  const closed = toggleNavigationGroup(false, "clientTools", opened);
  assert.equal(navigationGroupExpanded(false, "clientTools", closed), false);
});

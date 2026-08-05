import assert from "node:assert/strict";
import test from "node:test";

import { buildNotificationSummary } from "./notification-summary.ts";

test("notifications prioritise a new client release before community events", () => {
  const items = buildNotificationSummary({ latestVersion: "1.3.46", unreadAnnouncements: 2, unreadMessages: 4 });

  assert.deepEqual(items.map((item) => item.id), ["update", "announcements", "messages"]);
  assert.equal(items[0]?.route, "updates");
  assert.equal(items[2]?.detail, "4 条未读私聊");
});

test("notifications omit inactive categories", () => {
  assert.deepEqual(buildNotificationSummary({ latestVersion: null, unreadAnnouncements: 0, unreadMessages: 0 }), []);
});

import assert from "node:assert";
import { describe, it } from "node:test";
import { announcementReadKey, isAnnouncementUnread, normalizeAnnouncement, normalizeAnnouncementFeed } from "./announcement.ts";

describe("client announcements", () => {
  it("treats a newer revision as unread after the previous revision was acknowledged", () => {
    const announcement = normalizeAnnouncement({
      id: "notice-1",
      title: "Service notice",
      body: "Updated",
      priority: "important",
      status: "published",
      isPinned: false,
      revision: 2,
      createdAt: "2026-07-17T12:00:00.000Z",
      updatedAt: "2026-07-17T12:00:00.000Z",
      publishedAt: "2026-07-17T12:00:00.000Z",
    });
    assert.ok(announcement);
    assert.equal(announcementReadKey(announcement), "notice-1:2");
    assert.equal(isAnnouncementUnread(announcement, new Set(["notice-1:1"])), true);
    assert.equal(isAnnouncementUnread(announcement, new Set(["notice-1:2"])), false);
  });

  it("keeps only valid records and places pinned announcements first", () => {
    const feed = normalizeAnnouncementFeed({
      canManage: true,
      announcements: [
        { id: "normal", title: "Normal", body: "Text", priority: "normal", status: "published", isPinned: false, revision: 1, createdAt: "2026-07-17T10:00:00.000Z", updatedAt: "2026-07-17T10:00:00.000Z", publishedAt: "2026-07-17T10:00:00.000Z" },
        { id: "pinned", title: "Pinned", body: "Text", priority: "urgent", status: "published", isPinned: true, revision: 1, createdAt: "2026-07-17T09:00:00.000Z", updatedAt: "2026-07-17T09:00:00.000Z", publishedAt: "2026-07-17T09:00:00.000Z" },
        { id: "invalid", title: "", body: "Text" },
      ],
    });
    assert.ok(feed);
    assert.equal(feed.canManage, true);
    assert.deepEqual(feed.announcements.map((announcement) => announcement.id), ["pinned", "normal"]);
  });
});

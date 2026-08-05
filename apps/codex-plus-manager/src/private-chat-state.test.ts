import assert from "node:assert";
import { it } from "node:test";
import {
  applyVerifiedFriendProfiles,
  canDeliverChatNudge,
  getFriendSearchFeedback,
  getLatestConversationScrollTop,
  getPrivateChatAttachmentValidation,
  getPrivateChatReadReceipt,
  getPresenceUpdateFeedback,
  shouldNotifyIncomingMessage,
  toggleEmojiFavorite,
} from "./private-chat-state.ts";

it("keeps the server friend name instead of overwriting it with a stale local search cache", () => {
  const friends = applyVerifiedFriendProfiles(
    [{ userId: "677", username: "677", unreadCount: 0, status: "online", identityLabel: null, isDefaultContact: false }],
    [{ userId: "677", username: "saleAdmin", display: "s*******n" }],
  );

  assert.equal(friends[0]?.username, "677");
});

it("explains when a registered friend search has no match", () => {
  assert.equal(getFriendSearchFeedback(null), "未找到该官方注册用户，请核对用户名或用户 ID。");
});

it("names the saved presence state instead of showing a technical response", () => {
  assert.equal(getPresenceUpdateFeedback("do_not_disturb"), "在线状态已切换为请勿打扰。");
});

it("only alerts for newly arrived unread messages while online", () => {
  assert.equal(shouldNotifyIncomingMessage("online", 0, 1), true);
  assert.equal(shouldNotifyIncomingMessage("do_not_disturb", 0, 1), false);
  assert.equal(shouldNotifyIncomingMessage("online", 1, 1), false);
});

it("delivers a chat nudge only when the recipient is online", () => {
  assert.equal(canDeliverChatNudge("online"), true);
  assert.equal(canDeliverChatNudge("do_not_disturb"), false);
  assert.equal(canDeliverChatNudge("offline"), false);
  assert.equal(canDeliverChatNudge("invisible"), false);
});

it("opens a chat at the latest message instead of the top", () => {
  assert.equal(getLatestConversationScrollTop(840, 280), 560);
});

it("shows a receipt only for the current user's sent messages", () => {
  assert.equal(getPrivateChatReadReceipt({ senderUserId: "self", readAt: 1 }, "self"), "已读");
  assert.equal(getPrivateChatReadReceipt({ senderUserId: "self", readAt: null }, "self"), "未读");
  assert.equal(getPrivateChatReadReceipt({ senderUserId: "friend", readAt: 1 }, "self"), "");
});

it("accepts pasted images and videos within the private chat size limit", () => {
  assert.deepEqual(getPrivateChatAttachmentValidation({ type: "image/png", size: 1024 }), { ok: true });
  assert.deepEqual(getPrivateChatAttachmentValidation({ type: "video/mp4", size: 1024 }), { ok: true });
  assert.equal(getPrivateChatAttachmentValidation({ type: "application/pdf", size: 1024 }).ok, false);
  assert.equal(getPrivateChatAttachmentValidation({ type: "video/mp4", size: 31 * 1024 * 1024 }).ok, false);
});

it("adds a favorite emoji once, removes it on the next click, and keeps the list bounded", () => {
  assert.deepEqual(toggleEmojiFavorite(["😊"], "🔥", 3), ["😊", "🔥"]);
  assert.deepEqual(toggleEmojiFavorite(["😊", "🔥"], "😊", 3), ["🔥"]);
  assert.deepEqual(toggleEmojiFavorite(["😊", "🔥", "🎉"], "❤️", 3), ["🔥", "🎉", "❤️"]);
});

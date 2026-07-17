import type { FriendSearchResult } from "./private-chat";

export function getFriendSearchFeedback(result: FriendSearchResult | null) {
  return result
    ? "已找到官方注册用户，可发送好友申请。"
    : "未找到该官方注册用户，请核对用户名或用户 ID。";
}

export function getPresenceUpdateFeedback(status: "online" | "offline" | "do_not_disturb" | "invisible") {
  const label = {
    online: "在线",
    offline: "离线",
    do_not_disturb: "请勿打扰",
    invisible: "隐身",
  }[status];
  return `在线状态已切换为${label}。`;
}

export function shouldNotifyIncomingMessage(status: "online" | "offline" | "do_not_disturb" | "invisible", previousUnread: number, currentUnread: number) {
  return status === "online" && currentUnread > previousUnread;
}

export function toggleEmojiFavorite(current: string[], emoji: string, limit = 12) {
  const normalized = emoji.trim();
  if (!normalized) return current;
  if (current.includes(normalized)) return current.filter((value) => value !== normalized);
  return [...current, normalized].slice(-Math.max(1, limit));
}

export function getLatestConversationScrollTop(scrollHeight: number, clientHeight: number) {
  return Math.max(0, scrollHeight - clientHeight);
}

export function getPrivateChatReadReceipt(message: { senderUserId: string; readAt?: number | null }, selfId: string) {
  if (message.senderUserId !== selfId) return "";
  return message.readAt ? "已读" : "未读";
}

const PRIVATE_CHAT_ATTACHMENT_MAX_BYTES = 30 * 1024 * 1024;

export function getPrivateChatAttachmentValidation(file: { type: string; size: number }) {
  if (!(file.type.startsWith("image/") || file.type.startsWith("video/"))) {
    return { ok: false as const, message: "仅支持图片或视频" };
  }
  if (file.size > PRIVATE_CHAT_ATTACHMENT_MAX_BYTES) {
    return { ok: false as const, message: "单个图片或视频不能超过 30 MB" };
  }
  return { ok: true as const };
}

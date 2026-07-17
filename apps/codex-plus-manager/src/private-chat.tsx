import { useEffect, useRef, useState } from "react";
import { Bell, Check, ChevronDown, Clock3, Crown, ImagePlus, MessageCircle, Paperclip, Search, Send, ShieldCheck, Smile, Star, UserPlus, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getFriendSearchFeedback,
  getLatestConversationScrollTop,
  getPrivateChatAttachmentValidation,
  getPrivateChatReadReceipt,
  toggleEmojiFavorite,
} from "./private-chat-state";

export type PresenceStatus = "online" | "offline" | "do_not_disturb" | "invisible";
export type ChatFriend = { userId: string; username: string; unreadCount: number; status: PresenceStatus; identityLabel: string | null; isDefaultContact: boolean };
export type ChatMessage = {
  id: string; senderUserId: string; recipientUserId: string; content: string; createdAt: number; readAt?: number | null;
  attachmentUrl?: string | null; attachmentName?: string | null; attachmentMimeType?: string | null; attachmentSize?: number | null;
};
export type ChatAttachmentInput = { dataBase64: string; fileName: string; mimeType: string };
export type IncomingFriendRequest = { id: string; requesterUserId: string; requesterUsername: string };
export type OutgoingFriendRequest = { id: string; recipientUserId: string; recipientUsername: string };
export type FriendSearchResult = { userId: string; username: string; display: string };

const presenceLabels: Record<PresenceStatus, string> = { online: "在线", offline: "离线", do_not_disturb: "请勿打扰", invisible: "隐身" };
const presenceOrder: PresenceStatus[] = ["online", "do_not_disturb", "invisible", "offline"];
const defaultEmojiChoices = ["😊", "😂", "😍", "😎", "🤔", "😭", "👍", "👏", "🙏", "🤝", "🔥", "🎉", "✨", "❤️", "💯", "💬", "👋", "😴"];

function emojiFavoritesStorageKey(userId: string) {
  return `codework.private-chat.emoji-favorites.${userId}`;
}

function messageTime(value: number) {
  return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("无法读取附件"));
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] || "");
    reader.readAsDataURL(file);
  });
}

export function PrivateChat({
  friends, requests, outgoingRequests, selfId, selfIsAdmin = false, selfStatus, messages, notificationPulse,
  onLoadMessages, onSend, onSendAttachment, onRespond, onRequest, onCancelRequest, onSearch, onPresenceChange,
}: {
  friends: ChatFriend[]; requests: IncomingFriendRequest[]; outgoingRequests: OutgoingFriendRequest[]; selfId: string; selfIsAdmin?: boolean; selfStatus: PresenceStatus; messages: ChatMessage[]; notificationPulse: number;
  onLoadMessages: (id: string) => void; onSend: (id: string, text: string) => void; onSendAttachment: (id: string, attachment: ChatAttachmentInput) => Promise<void>; onRespond: (id: string, accept: boolean) => void; onRequest: (id: string, username: string) => Promise<void>; onCancelRequest: (id: string) => Promise<void>; onSearch: (query: string) => Promise<FriendSearchResult | null>; onPresenceChange: (status: PresenceStatus) => Promise<void>;
}) {
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState<ChatFriend | null>(null);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [searchResult, setSearchResult] = useState<FriendSearchResult | null>(null);
  const [searchFeedback, setSearchFeedback] = useState("");
  const [searching, setSearching] = useState(false);
  const [presenceMenuOpen, setPresenceMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [pulsing, setPulsing] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<(ChatAttachmentInput & { previewUrl: string }) | null>(null);
  const [attachmentError, setAttachmentError] = useState("");
  const [attachmentSending, setAttachmentSending] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [favoriteEmojis, setFavoriteEmojis] = useState<string[]>([]);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!notificationPulse) return;
    setPulsing(false);
    const frame = requestAnimationFrame(() => setPulsing(true));
    const timer = window.setTimeout(() => setPulsing(false), 950);
    return () => { cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, [notificationPulse]);

  const activeMessages = active ? messages.filter((message) => message.senderUserId === active.userId || message.recipientUserId === active.userId) : [];
  useEffect(() => {
    if (!active) return;
    onLoadMessages(active.userId);
    const timer = window.setInterval(() => onLoadMessages(active.userId), 5000);
    return () => window.clearInterval(timer);
  }, [active?.userId]);
  useEffect(() => {
    if (!active || !messagesRef.current) return;
    const node = messagesRef.current;
    const frame = requestAnimationFrame(() => { node.scrollTop = getLatestConversationScrollTop(node.scrollHeight, node.clientHeight); });
    return () => cancelAnimationFrame(frame);
  }, [active?.userId, activeMessages.length]);
  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(emojiFavoritesStorageKey(selfId)) || "[]");
      setFavoriteEmojis(Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string").slice(-12) : []);
    } catch {
      setFavoriteEmojis([]);
    }
  }, [selfId]);

  const pendingRequest = searchResult ? outgoingRequests.find((item) => item.recipientUserId === searchResult.userId) : null;
  const selectFriend = (friend: ChatFriend) => { setActive(friend); onLoadMessages(friend.userId); };
  const searchFriend = async () => {
    if (!search.trim() || searching) return;
    setSearching(true);
    try {
      const result = await onSearch(search.trim());
      setSearchResult(result);
      setSearchFeedback(getFriendSearchFeedback(result));
    } finally {
      setSearching(false);
    }
  };
  const updatePresence = (status: PresenceStatus) => {
    setPresenceMenuOpen(false);
    void onPresenceChange(status);
  };
  const clearAttachment = () => {
    if (pendingAttachment) URL.revokeObjectURL(pendingAttachment.previewUrl);
    setPendingAttachment(null);
    setAttachmentError("");
  };
  const attachFile = async (file: File | undefined) => {
    if (!file) return;
    const validation = getPrivateChatAttachmentValidation(file);
    if (!validation.ok) {
      setAttachmentError(validation.message);
      return;
    }
    try {
      if (pendingAttachment) URL.revokeObjectURL(pendingAttachment.previewUrl);
      setPendingAttachment({ dataBase64: await readFileAsBase64(file), fileName: file.name || "附件", mimeType: file.type, previewUrl: URL.createObjectURL(file) });
      setAttachmentError("");
    } catch {
      setAttachmentError("附件读取失败，请重新选择");
    }
  };
  const sendAttachment = async () => {
    if (!active || !pendingAttachment || attachmentSending) return;
    setAttachmentSending(true);
    try {
      await onSendAttachment(active.userId, pendingAttachment);
      clearAttachment();
    } finally {
      setAttachmentSending(false);
    }
  };
  const insertEmoji = (emoji: string) => {
    setDraft((current) => `${current}${emoji}`);
    setEmojiPickerOpen(false);
  };
  const changeEmojiFavorite = (emoji: string) => {
    setFavoriteEmojis((current) => {
      const next = toggleEmojiFavorite(current, emoji);
      window.localStorage.setItem(emojiFavoritesStorageKey(selfId), JSON.stringify(next));
      return next;
    });
  };

  if (!open) return <Button className={`private-chat-bubble ${pulsing ? "is-pulsing" : ""}`} onClick={() => setOpen(true)} size="icon" title="打开聊天"><MessageCircle />{friends.reduce((total, friend) => total + friend.unreadCount, 0) ? <b>{friends.reduce((total, friend) => total + friend.unreadCount, 0)}</b> : null}</Button>;

  return <>
    <aside className={`private-chat-float ${pulsing ? "is-pulsing" : ""}`}>
      <header>
        <strong><Crown className="h-4 w-4" /> 消息</strong>
        <div className="private-chat-header-actions">
          <button className="private-chat-notification-button" onClick={() => setNotificationsOpen((value) => !value)} type="button"><Bell className="h-4 w-4" /> 好友通知{requests.length ? <b>{requests.length}</b> : null}</button>
          <span className="private-chat-self-status">
            <button aria-expanded={presenceMenuOpen} className="private-chat-status-trigger" onClick={() => setPresenceMenuOpen((value) => !value)} type="button"><i className={`presence-dot ${selfStatus}`} />{presenceLabels[selfStatus]}<ChevronDown className="h-3.5 w-3.5" /></button>
            {presenceMenuOpen ? <div className="private-chat-status-menu">{presenceOrder.map((status) => <button className={status === selfStatus ? "active" : ""} key={status} onClick={() => updatePresence(status)} type="button"><i className={`presence-dot ${status}`} />{presenceLabels[status]}{status === selfStatus ? <Check className="h-3.5 w-3.5" /> : null}</button>)}</div> : null}
          </span>
          <Button onClick={() => setOpen(false)} size="icon" variant="ghost" title="隐藏聊天"><X /></Button>
        </div>
      </header>
      {notificationsOpen ? <section className="private-chat-notifications"><h3>好友通知</h3>{requests.length ? requests.map((request) => <div className="private-chat-notification-card" key={request.id}><span><strong>{request.requesterUsername}</strong><small>请求添加你为好友</small></span><div><Button onClick={() => onRespond(request.id, true)} size="sm">同意</Button><Button onClick={() => onRespond(request.id, false)} size="sm" variant="ghost">拒绝</Button></div></div>) : <p>暂无待处理的好友申请</p>}{outgoingRequests.map((request) => <div className="private-chat-notification-card outgoing" key={request.id}><span><strong>{request.recipientUsername}</strong><small>申请等待对方处理</small></span><Button onClick={() => void onCancelRequest(request.recipientUserId)} size="sm" variant="ghost">取消申请</Button></div>)}</section> : null}
      <div className="private-chat-compose"><Input placeholder="输入用户名或用户 ID" value={search} onChange={(event) => setSearch(event.target.value)} /><Button disabled={!search.trim() || searching} onClick={() => void searchFriend()}><Search className="h-4 w-4" /> {searching ? "搜索中" : "搜索"}</Button></div>
      {searchFeedback ? <p className={`private-chat-search-feedback ${searchResult ? "found" : "empty"}`}>{searchFeedback}</p> : null}
      {searchResult ? <div className="private-chat-friend search-result"><span><strong>{searchResult.display}</strong><small>{pendingRequest ? "好友申请等待处理" : "已找到平台注册用户"}</small></span>{pendingRequest ? <Button onClick={() => void onCancelRequest(searchResult.userId)} size="sm" variant="ghost"><Clock3 className="h-4 w-4" />取消申请</Button> : <Button onClick={() => void onRequest(searchResult.userId, searchResult.username)} size="sm"><UserPlus className="h-4 w-4" />添加</Button>}</div> : null}
      {friends.length ? friends.map((friend) => <button className={`private-chat-friend ${friend.isDefaultContact ? "is-platform" : ""}`} key={friend.userId} onClick={() => selectFriend(friend)} type="button"><span className="private-chat-friend-title"><i className={`presence-dot ${friend.status}`} /><span><strong>{friend.identityLabel || friend.username}</strong>{friend.identityLabel ? <small>{friend.username}</small> : null}</span></span>{friend.unreadCount ? <b>{friend.unreadCount}</b> : <small>{presenceLabels[friend.status]}</small>}</button>) : <div className="private-chat-empty"><ShieldCheck className="h-4 w-4" /><p>{selfIsAdmin ? "有会员向你发送消息后，会在这里显示联系人" : "暂无好友，可搜索平台已注册的用户"}</p></div>}
    </aside>
    {active ? <section className="private-chat-dialog"><header><strong>{active.identityLabel || active.username}</strong><Button onClick={() => { clearAttachment(); setActive(null); }} size="icon" variant="ghost" title="关闭对话"><X /></Button></header><div className="private-chat-messages" ref={messagesRef}>{activeMessages.length ? activeMessages.map((message) => { const own = message.senderUserId === selfId; const receipt = getPrivateChatReadReceipt(message, selfId); return <div className={`private-chat-message-row ${own ? "self" : "peer"}`} key={message.id}><span className={own && selfIsAdmin ? "private-chat-avatar admin" : active.isDefaultContact ? "private-chat-avatar platform" : "private-chat-avatar"}>{own ? (selfIsAdmin ? <Crown aria-hidden="true" className="h-4 w-4" /> : <ShieldCheck aria-hidden="true" className="h-4 w-4" />) : (active.isDefaultContact ? <Crown aria-hidden="true" className="h-4 w-4" /> : <UserRound aria-hidden="true" className="h-4 w-4" />)}</span><div className="private-chat-message">{message.content ? <p>{message.content}</p> : null}{message.attachmentUrl && message.attachmentMimeType?.startsWith("image/") ? <img alt={message.attachmentName || "聊天图片"} className="private-chat-message-media" src={message.attachmentUrl} /> : null}{message.attachmentUrl && message.attachmentMimeType?.startsWith("video/") ? <video className="private-chat-message-media" controls src={message.attachmentUrl} /> : null}<footer><time>{messageTime(message.createdAt)}</time>{receipt ? <small className={`private-chat-receipt ${receipt === "已读" ? "read" : ""}`}>{receipt}</small> : null}</footer></div></div>; }) : <div className="empty">开始和对方聊天吧</div>}</div>{pendingAttachment ? <div className="private-chat-attachment-preview"><span><ImagePlus className="h-4 w-4" />{pendingAttachment.fileName}</span>{pendingAttachment.mimeType.startsWith("image/") ? <img alt="待发送图片" src={pendingAttachment.previewUrl} /> : <video controls src={pendingAttachment.previewUrl} />}<Button onClick={clearAttachment} size="icon" variant="ghost" title="移除附件"><X /></Button></div> : null}{attachmentError ? <p className="private-chat-attachment-error">{attachmentError}</p> : null}<div className="private-chat-compose private-chat-input-row"><input accept="image/*,video/*" className="sr-only" onChange={(event) => { void attachFile(event.target.files?.[0]); event.currentTarget.value = ""; }} ref={fileInputRef} type="file" /><Button onClick={() => fileInputRef.current?.click()} size="icon" title="发送图片或视频" type="button" variant="ghost"><Paperclip className="h-4 w-4" /></Button><Button onClick={() => setEmojiPickerOpen((value) => !value)} size="icon" title="表情" type="button" variant="ghost"><Smile className="h-4 w-4" /></Button>{emojiPickerOpen ? <div className="private-chat-emoji-picker"><header><strong>表情</strong><span>点击发送，星标收藏</span></header><div className="private-chat-emoji-favorites">{favoriteEmojis.length ? favoriteEmojis.map((emoji) => <button key={`favorite-${emoji}`} onClick={() => insertEmoji(emoji)} title="发送收藏表情" type="button">{emoji}</button>) : <small>还没有收藏表情</small>}</div><div className="private-chat-emoji-grid">{defaultEmojiChoices.map((emoji) => <span key={emoji}><button onClick={() => insertEmoji(emoji)} title={`发送 ${emoji}`} type="button">{emoji}</button><button className={favoriteEmojis.includes(emoji) ? "favorite" : ""} onClick={() => changeEmojiFavorite(emoji)} title="收藏或取消收藏" type="button"><Star className="h-3 w-3" /></button></span>)}</div></div> : null}<Input onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && draft.trim()) { event.preventDefault(); onSend(active.userId, draft); setDraft(""); } }} onPaste={(event) => { const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/") || item.type.startsWith("video/")); if (file) { event.preventDefault(); void attachFile(file); } }} placeholder="输入消息，按 Enter 发送；可粘贴图片或视频" value={draft} /><Button disabled={attachmentSending ? !pendingAttachment : !draft.trim() && !pendingAttachment} onClick={() => { if (pendingAttachment) { void sendAttachment(); return; } if (draft.trim()) { onSend(active.userId, draft); setDraft(""); } }}><Send className="h-4 w-4" />{attachmentSending ? "发送中" : "发送"}</Button></div></section> : null}
  </>;
}

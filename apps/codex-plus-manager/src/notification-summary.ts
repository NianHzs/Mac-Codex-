export type NotificationRoute = "updates" | "announcements" | "community";

export type WorkspaceNotification = {
  id: "update" | "announcements" | "messages";
  route: NotificationRoute;
  title: string;
  detail: string;
};

export function buildNotificationSummary({
  latestVersion,
  unreadAnnouncements,
  unreadMessages,
}: {
  latestVersion: string | null;
  unreadAnnouncements: number;
  unreadMessages: number;
}): WorkspaceNotification[] {
  const notifications: WorkspaceNotification[] = [];
  if (latestVersion) notifications.push({ id: "update", route: "updates", title: `发现新版本 ${latestVersion}`, detail: "客户端配置会在更新后保留" });
  if (unreadAnnouncements > 0) notifications.push({ id: "announcements", route: "announcements", title: `${unreadAnnouncements} 条未读公告`, detail: "点击查看平台最新通知" });
  if (unreadMessages > 0) notifications.push({ id: "messages", route: "community", title: "收到新私聊", detail: `${unreadMessages} 条未读私聊` });
  return notifications;
}

export type AnnouncementPriority = "normal" | "important" | "urgent";

export type ClientAnnouncement = {
  id: string;
  title: string;
  body: string;
  priority: AnnouncementPriority;
  status: "draft" | "published" | "withdrawn";
  isPinned: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
  withdrawnAt: string | null;
};

export type AnnouncementFeed = {
  announcements: ClientAnnouncement[];
  canManage: boolean;
};

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function normalizeAnnouncement(value: unknown): ClientAnnouncement | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = stringOrNull(record.id);
  const title = stringOrNull(record.title);
  const body = stringOrNull(record.body);
  const priority = record.priority;
  const status = record.status;
  const revision = record.revision;
  const createdAt = stringOrNull(record.createdAt);
  const updatedAt = stringOrNull(record.updatedAt);
  if (!id || !title || !body || !createdAt || !updatedAt || typeof revision !== "number" || !Number.isInteger(revision) || revision <= 0) return null;
  if (priority !== "normal" && priority !== "important" && priority !== "urgent") return null;
  if (status !== "draft" && status !== "published" && status !== "withdrawn") return null;
  return {
    id,
    title,
    body,
    priority,
    status,
    isPinned: Boolean(record.isPinned),
    revision,
    createdAt,
    updatedAt,
    publishedAt: stringOrNull(record.publishedAt),
    startsAt: stringOrNull(record.startsAt),
    endsAt: stringOrNull(record.endsAt),
    withdrawnAt: stringOrNull(record.withdrawnAt),
  };
}

export function normalizeAnnouncementFeed(value: unknown): AnnouncementFeed | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.announcements) || typeof record.canManage !== "boolean") return null;
  const announcements = record.announcements
    .map(normalizeAnnouncement)
    .filter((announcement): announcement is ClientAnnouncement => announcement !== null)
    .sort((left, right) => Number(right.isPinned) - Number(left.isPinned) || (right.publishedAt || right.updatedAt).localeCompare(left.publishedAt || left.updatedAt));
  return { announcements, canManage: record.canManage };
}

export function announcementReadKey(announcement: Pick<ClientAnnouncement, "id" | "revision">): string {
  return `${announcement.id}:${announcement.revision}`;
}

export function isAnnouncementUnread(announcement: ClientAnnouncement, readKeys: ReadonlySet<string>): boolean {
  return !readKeys.has(announcementReadKey(announcement));
}

export const MEMBER_ACCESS_TOKEN_KEY = "codework-member-access-token";
export const MEMBER_REMEMBERED_CREDENTIALS_KEY = "codework-member-remembered-credentials-v1";

export type MemberTier = "vip" | "supreme";
export type MemberRole = "administrator" | "founder" | "director" | "supreme" | "vip";

export type MemberProfile = {
  userId: string;
  username: string;
  tier: MemberTier;
  activeRole: MemberRole;
  actualAdmin: boolean;
};

export type MemberActivity = {
  campaign: {
    id: string;
    title: string;
    endsAt: number;
  } | null;
  remainingChances: number;
  portalPath: string;
};

export type RememberedMemberCredentials = {
  username: string;
  password: string;
};

export function readRememberedMemberCredentials(value: string | null): RememberedMemberCredentials | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const username = typeof parsed.username === "string" ? parsed.username.trim() : "";
    const password = typeof parsed.password === "string" ? parsed.password : "";
    if (!username || !password) return null;
    return { username, password };
  } catch {
    return null;
  }
}

export function normalizeMemberProfile(value: unknown): MemberProfile | null {
  if (!value || typeof value !== "object") return null;
  const profile = value as Record<string, unknown>;
  const user = profile.user && typeof profile.user === "object" ? profile.user as Record<string, unknown> : null;
  const entitlements = profile.entitlements && typeof profile.entitlements === "object" ? profile.entitlements as Record<string, unknown> : null;
  const userId = typeof profile.userId === "string" ? profile.userId.trim() : typeof user?.id === "string" ? user.id.trim() : "";
  const username = typeof profile.username === "string" ? profile.username.trim() : typeof user?.username === "string" ? user.username.trim() : "";
  const tier = typeof profile.tier === "string"
    ? profile.tier.trim().toLowerCase()
    : typeof entitlements?.tier === "string"
      ? entitlements.tier.trim().toLowerCase()
      : "";
  if (!userId || !username || (tier !== "vip" && tier !== "supreme")) return null;
  const identity = profile.identity && typeof profile.identity === "object" ? profile.identity as Record<string, unknown> : null;
  const candidateRole = typeof identity?.activeRole === "string"
    ? identity.activeRole.trim().toLowerCase()
    : typeof profile.activeRole === "string"
      ? profile.activeRole.trim().toLowerCase()
      : tier;
  const activeRole: MemberRole = ["administrator", "founder", "director", "supreme", "vip"].includes(candidateRole)
    ? candidateRole as MemberRole
    : tier;
  const actualAdmin = identity?.actualAdmin === true
    || profile.actualAdmin === true
    || profile.isAdmin === true
    || username.trim().toLowerCase() === "saleadmin";
  return { userId, username, tier, activeRole, actualAdmin };
}

export function getMemberRolePresentation(role: MemberRole) {
  return ({
    administrator: { label: "平台执掌者", tone: "administrator" },
    founder: { label: "创始人", tone: "founder" },
    director: { label: "总监", tone: "director" },
    supreme: { label: "至尊 VIP", tone: "supreme" },
    vip: { label: "普通 VIP", tone: "vip" },
  } as const)[role];
}

export function getMemberIdentityDisplay(profile: MemberProfile) {
  return getMemberRolePresentation(profile.activeRole);
}

export function normalizeMemberActivity(value: unknown): MemberActivity | null {
  if (!value || typeof value !== "object") return null;
  const activity = value as Record<string, unknown>;
  const remainingChances = activity.remainingChances;
  const portalPath = typeof activity.portalPath === "string" ? activity.portalPath.trim() : "";
  if (typeof remainingChances !== "number" || !Number.isInteger(remainingChances) || remainingChances < 0) return null;
  if (portalPath !== "/" && portalPath !== "/vip") return null;
  if (activity.campaign === null) return { campaign: null, remainingChances, portalPath };
  if (!activity.campaign || typeof activity.campaign !== "object") return null;
  const campaign = activity.campaign as Record<string, unknown>;
  const id = typeof campaign.id === "string" ? campaign.id.trim() : "";
  const title = typeof campaign.title === "string" ? campaign.title.trim() : "";
  const rawEndsAt = campaign.endsAt;
  const endsAt = typeof rawEndsAt === "number" ? rawEndsAt : typeof rawEndsAt === "string" ? Date.parse(rawEndsAt) : NaN;
  if (!id || !title || !Number.isInteger(endsAt) || endsAt <= 0) return null;
  return { campaign: { id, title, endsAt }, remainingChances, portalPath };
}

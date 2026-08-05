import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, UserAttentionType } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import {
  getAvailableCodeworkRelease,
  getCodeworkReleaseDisplay,
  getCodeworkUpdateStageLabel,
  getCodeworkUpdateSteps,
} from "./release";
import { PrivateChat, type ChatFriend, type ChatMessage, type IncomingFriendRequest, type OutgoingFriendRequest, type FriendSearchResult, type PresenceStatus } from "./private-chat";
import { applyVerifiedFriendProfiles, getPresenceUpdateFeedback, shouldNotifyIncomingMessage } from "./private-chat-state";
import { CLIENT_SKIN_STORAGE_KEY, clientSkinVariables, readInitialClientSkin } from "./client-skin";
import { isAnnouncementUnread, normalizeAnnouncementFeed, type AnnouncementFeed, type ClientAnnouncement } from "./announcement";
import { getCommunityDeleteConfirmation } from "./community-state";
import { skillActionLabel, skillUsageGuideRows, type SkillUsageGuide } from "./skill-market";
import { domesticRelayGroupLabel, domesticRelayTokens, formatRelayQuota, groupRelayModels, relayTokenCanApply, relayTokenStatus, walletBalanceDisplay, type RelayTokenView } from "./relay-token-state";
import {
  ArrowLeft,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Crown,
  Download,
  Edit3,
  GripVertical,
  Info,
  ExternalLink,
  Gift,
  Hammer,
  KeyRound,
  Languages,
  LayoutDashboard,
  MessageCircle,
  FileCode2,
  Moon,
  Palette,
  Network,
  Power,
  PowerOff,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Search,
  Settings,
  ShieldCheck,
  ShieldAlert,
  Stethoscope,
  Sun,
  TestTube,
  Trash2,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { ProviderPresetSelector } from "@/components/ProviderPresetSelector";
import {
  CODEWORK_API_BASE_URL,
  CODEWORK_ACTIVITY_PORTAL_URL,
  CODEWORK_CLIENT_DOWNLOAD_URL,
  CODEWORK_FORGOT_PASSWORD_URL,
  CODEWORK_OFFICIAL_ACCOUNT_LABEL,
  CODEWORK_PRODUCT_NAME,
  CODEWORK_PROVIDER_NAME,
  CODEWORK_QQ_GROUP_URL,
  CODEWORK_QQ_QR_URL,
  CODEWORK_REGISTER_URL,
  CODEWORK_WECHAT_QR_URL,
} from "./codework";
import type { PresetPatch } from "@/components/ProviderPresetSelector";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { Badge as UiBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  mergeModelWindowRows,
  modelWindowRowsFromProfile,
  serializeModelWindowRows,
  type ModelWindowRow,
} from "./model-windows";
import { getLanguage, t, tf, toggleLanguage } from "@/i18n";
import {
  MEMBER_ACCESS_TOKEN_KEY,
  MEMBER_REMEMBERED_CREDENTIALS_KEY,
  normalizeMemberActivity,
  normalizeMemberProfile,
  getMemberIdentityDisplay,
  getMemberRolePresentation,
  readRememberedMemberCredentials,
  type MemberActivity,
  type MemberProfile,
  type MemberRole,
} from "./member";
import { isAppliedVisualTheme, isThemeManifest, themePreviewAssetCandidates, themesVisibleToMember, type VisualThemeItem, type VisualThemeManifest } from "./visual-theme-contract";
import { buildThemeFeedback } from "./theme-feedback";
import { createCustomDreamSkin } from "./custom-dream-skin";
import { runVisualThemeTransition } from "./visual-theme-transition";
import { groupNavigationItems, navigationGroupExpanded, toggleNavigationGroup, type NavigationGroupId } from "./navigation-groups";
import { buildNotificationSummary } from "./notification-summary";
import {
  canSaveThemeGrant,
  normalizeThemeGrantIds,
  restrictedThemeOptions,
  type ThemeGrantMember,
} from "./theme-grant-admin";

type Status = "ok" | "failed" | "not_implemented" | "not_checked" | string;
const ANNOUNCEMENT_READ_STORAGE_KEY = "codework-announcement-read-revisions";
const VERIFIED_FRIEND_PROFILE_STORAGE_KEY = "codework-verified-friend-profiles";

function readVerifiedFriendProfiles(): FriendSearchResult[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(VERIFIED_FRIEND_PROFILE_STORAGE_KEY) || "[]");
    return Array.isArray(value)
      ? value.filter((item): item is FriendSearchResult => typeof item?.userId === "string" && typeof item?.username === "string" && typeof item?.display === "string").slice(-200)
      : [];
  } catch {
    return [];
  }
}

type CommandResult<T> = T & {
  status: Status;
  message: string;
};

type ThemeGrantMemberRecord = ThemeGrantMember & { themeIds: string[] };

type DreamSkinStatusResult = CommandResult<{
  dreamSkinState: "pending" | "active" | "failed" | string;
  restartRequired: boolean;
  themeId: string | null;
  runtimeMessage: string | null;
}>;

type PathState = {
  status: string;
  path: string | null;
};

type LaunchStatus = {
  status: string;
  message: string;
  started_at_ms: number;
  debug_port: number | null;
  helper_port: number | null;
  codex_app: string | null;
};

type OverviewResult = CommandResult<{
  codex_app: PathState;
  codex_version: string | null;
  silent_shortcut: PathState;
  management_shortcut: PathState;
  latest_launch: LaunchStatus | null;
  current_version: string;
  update_status: string;
  settings_path: string;
  logs_path: string;
}>;

type PluginMarketplaceRepairResult = CommandResult<{
  codexHome: string;
  marketplaceRoot?: string | null;
  initialized: boolean;
  configured: boolean;
  needsRepair: boolean;
}>;

type CodeworkReleaseResult = CommandResult<{
  available: boolean;
  currentVersion: string;
  latestVersion: string | null;
  downloadUrl: string | null;
  notes: string[];
  pendingTargetVersion: string | null;
  integrityStatus: string;
  expectedSize: number | null;
  sha256: string | null;
  mandatory: boolean;
  minimumSupportedVersion: string | null;
  rollbackAvailable: boolean;
  lastFailure: string | null;
  updateState: "idle" | "pending_confirmation" | string;
  recoveryAction: boolean;
}>;

type ChatGptInstallResult = CommandResult<{
  installed: boolean;
  wingetAvailable: boolean;
  storeProductId: string | null;
  shortcutCreated: boolean;
}>;

type CommunityComment = {
  id: string;
  authorUserId: string;
  authorUsername: string;
  content: string;
  createdAt: number;
  likeCount: number;
  likedByCurrentUser: boolean;
  replies: Array<{ id: string; authorUserId: string; authorUsername: string; content: string; createdAt: number }>;
};

function playIncomingMessageChime() {
  try {
    const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    const context = new AudioContextConstructor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1320, context.currentTime + 0.11);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.09, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.24);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.25);
    oscillator.addEventListener("ended", () => void context.close());
  } catch {
    // Notification sound is an enhancement and must not interrupt message delivery.
  }
}

type CommunityResult = CommandResult<{
  comments: CommunityComment[];
  canModerate: boolean;
}>;

type InstallerProgress = {
  stage: string;
  downloadedBytes?: number;
  totalBytes?: number;
  percent?: number;
  error?: string;
};

type MemberProfileResult = CommandResult<MemberProfile>;

type MemberLoginResult = CommandResult<{
  accessToken: string;
  profile: MemberProfile;
}>;

type MemberSessionResult = CommandResult<{
  accessToken: string;
  username: string;
  password: string;
  rememberPassword: boolean;
}>;

type MemberActivityResult = CommandResult<MemberActivity>;
type AnnouncementResult = CommandResult<AnnouncementFeed>;

type MemberPortalLinkResult = CommandResult<{
  portalUrl: string;
}>;

type PluginMarketplaceStatusResult = CommandResult<{
  codexHome: string;
  marketplaceRoot?: string | null;
  configRegistered: boolean;
  needsRepair: boolean;
}>;

type RemotePluginMarketplaceResult = CommandResult<{
  codexHome: string;
  marketplaceRoot?: string | null;
  configRegistered: boolean;
  needsRepair: boolean;
  pluginCount: number;
  skillCount: number;
}>;

type BackendSettings = {
  codexAppPath: string;
  codexExtraArgs: string[];
  providerSyncEnabled: boolean;
  providerSyncSavedProviders: string[];
  providerSyncManualProviders: string[];
  providerSyncLastSelectedProvider: string;
  relayProfilesEnabled: boolean;
  enhancementsEnabled: boolean;
  computerUseGuardEnabled: boolean;
  codexAppPluginMarketplaceUnlock: boolean;
  codexAppPluginAutoExpand: boolean;
  codexAppModelWhitelistUnlock: boolean;
  codexAppSessionDelete: boolean;
  codexAppMarkdownExport: boolean;
  codexAppPasteFix: boolean;
  codexAppForceChineseLocale: boolean;
  codexAppFastStartup: boolean;
  codexAppProjectMove: boolean;
  codexAppThreadIdBadge: boolean;
  codexAppConversationView: boolean;
  codexAppThreadScrollRestore: boolean;
  codexAppZedRemoteOpen: boolean;
  zedRemoteOpenStrategy: ZedOpenStrategy;
  zedRemoteProjectRegistryEnabled: boolean;
  zedRemoteSyncToZedSettings: boolean;
  codexAppUpstreamWorktreeCreate: boolean;
  codexAppNativeMenuPlacement: boolean;
  codexAppNativeMenuLocalization: boolean;
  codexAppServiceTierControls: boolean;
  codexAppStepwiseEnabled: boolean;
  codexAppStepwiseDirectSend: boolean;
  codexAppStepwiseBaseUrl: string;
  codexAppStepwiseApiKey: string;
  codexAppStepwiseApiKeyEnv: string;
  codexAppStepwiseModel: string;
  codexAppStepwiseMaxItems: number;
  codexAppStepwiseMaxInputChars: number;
  codexAppStepwiseMaxOutputTokens: number;
  codexAppStepwiseTimeoutMs: number;
  codexAppImageOverlayEnabled: boolean;
  codexAppImageOverlayPath: string;
  codexAppImageOverlayOpacity: number;
  codexAppImageOverlayFitMode: ImageOverlayFitMode;
  codexAppVisualThemeEnabled: boolean;
  codexAppVisualThemeId: string;
  codexAppVisualThemeServiceUrl: string;
  codexGoalsEnabled: boolean;
  launchMode: LaunchMode;
  relayBaseUrl: string;
  relayApiKey: string;
  relayProfiles: RelayProfile[];
  aggregateRelayProfiles: AggregateRelayProfile[];
  activeAggregateRelayId: string;
  relayCommonConfigContents: string;
  relayContextConfigContents: string;
  activeRelayId: string;
  relayTestModel: string;
};

type ZedOpenStrategy = "addToFocusedWorkspace" | "reuseWindow" | "newWindow" | "default";
type LaunchMode = "patch" | "relay";
type ImageOverlayFitMode = "fill" | "fit" | "stretch" | "tile" | "center";

export type RelayProfile = {
  id: string;
  name: string;
  model: string;
  baseUrl: string;
  upstreamBaseUrl: string;
  apiKey: string;
  protocol: RelayProtocol;
  relayMode: RelayMode;
  officialMixApiKey: boolean;
  testModel: string;
  configContents: string;
  authContents: string;
  useCommonConfig: boolean;
  contextSelection: RelayContextSelection;
  contextSelectionInitialized: boolean;
  contextWindow: string;
  autoCompactLimit: string;
  modelList: string;
  modelWindows: string;
  userAgent: string;
  aggregate?: RelayAggregateConfig | null;
};

type RelayAggregateStrategy = "failover" | "conversationRoundRobin" | "requestRoundRobin" | "weightedRoundRobin";
type RelayAggregateMember = {
  profileId: string;
  weight: number;
};
type RelayAggregateConfig = {
  strategy: RelayAggregateStrategy;
  members: RelayAggregateMember[];
};
type AggregateRelayMember = {
  relayId: string;
  weight: number;
};
type AggregateRelayProfile = {
  id: string;
  name: string;
  strategy: RelayAggregateStrategy;
  members: AggregateRelayMember[];
};

type RelayContextSelection = {
  mcpServers: string[];
  skills: string[];
  plugins: string[];
};

type ContextKind = "mcp" | "skill" | "plugin";

type CodexContextEntry = {
  id: string;
  kind: ContextKind;
  title: string;
  summary: string;
  tomlBody: string;
  enabled: boolean;
};

type CodexContextEntries = {
  mcpServers: CodexContextEntry[];
  skills: CodexContextEntry[];
  plugins: CodexContextEntry[];
};

type RelayProtocol = "responses" | "chatCompletions";
type RelayMode = "official" | "mixedApi" | "pureApi" | "aggregate";
const PROTOCOL_PROXY_BASE_URL = "http://127.0.0.1:57321/v1";
const CHAT_UPSTREAM_BASE_URL_KEY = "codex_plus_chat_base_url";

const emptyContextSelection = (): RelayContextSelection => ({
  mcpServers: [],
  skills: [],
  plugins: [],
});

type UserScriptInventory = {
  enabled?: boolean;
  scripts?: Array<{
    key: string;
    name: string;
    source: string;
    enabled: boolean;
    status: string;
    error: string;
    market_id?: string;
    version?: string;
    installed?: boolean;
    source_url?: string;
    homepage?: string;
  }>;
};

type SettingsResult = CommandResult<{
  settings: BackendSettings;
  settings_path: string;
  user_scripts: UserScriptInventory;
}>;

type RelayResult = CommandResult<{
  authenticated: boolean;
  authSource: string;
  accountLabel: string | null;
  configPath: string;
  configured: boolean;
  requiresOpenaiAuth: boolean;
  hasBearerToken: boolean;
  backupPath: string | null;
}>;

type RelayPayload = Omit<RelayResult, "status" | "message">;

type RelayFilesResult = CommandResult<{
  configPath: string;
  authPath: string;
  configContents: string;
  authContents: string;
}>;

type LocalSession = {
  id: string;
  title: string;
  cwd: string;
  modelProvider: string;
  archived: boolean;
  updatedAtMs: number | null;
  rolloutPath: string;
  dbPath: string;
};

type LocalSessionsResult = CommandResult<{
  dbPath: string;
  dbPaths: string[];
  sessions: LocalSession[];
}>;

type ZedRemoteProject = {
  id: string;
  label: string;
  hostId: string;
  ssh: {
    user: string;
    host: string;
    port: number | null;
  };
  path: string;
  url: string;
  source: "currentThread" | "codexRemoteProject" | "threadWorkspaceHint" | "sqliteThreadCwd" | "recent" | string;
  lastOpenedAtMs: number | null;
  isCurrent: boolean;
};

type ZedRemoteProjectsResult = CommandResult<{
  projects: ZedRemoteProject[];
}>;

type ZedRemoteOpenResult = CommandResult<{
  url: string;
  strategy: ZedOpenStrategy;
}>;

type DeleteLocalSessionResult = CommandResult<{
  status: string;
  session_id: string;
  message: string;
  undo_token: string | null;
  backup_path: string | null;
}>;

type ContextEntriesResult = CommandResult<{
  settings: BackendSettings;
  entries: CodexContextEntries;
}>;

type LiveContextEntriesResult = CommandResult<{
  entries: CodexContextEntries;
}>;

type ExtractRelayCommonConfigResult = CommandResult<{
  commonConfigContents: string;
  profileConfigContents: string;
}>;

type RelaySwitchResult = CommandResult<{
  settings: BackendSettings;
  settingsPath: string;
  user_scripts: unknown;
  relay: RelayPayload;
}>;

type SettingsBackfillResult = CommandResult<{
  settings: BackendSettings;
}>;

type RelayProfileTestResult = CommandResult<{
  httpStatus: number;
  endpoint: string;
  responsePreview: string;
}>;

type StepwiseTestResult = CommandResult<{
  itemCount: number;
  error: string;
}>;

type RelayProfileModelsResult = CommandResult<{
  models: string[];
  endpoint: string;
}>;

type ProviderDoctorCheck = {
  id: string;
  title: string;
  status: Status;
  detail: string;
};

type ProviderDoctorResult = CommandResult<{
  profileName: string;
  model: string;
  summary: string;
  recommendation: string;
  checks: ProviderDoctorCheck[];
}>;

type CcsProviderImport = {
  sourceId: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  protocol: RelayProtocol;
  configContents: string;
  authContents: string;
};

type CcsProvidersResult = CommandResult<{
  dbPath: string;
  providers: CcsProviderImport[];
}>;

type ProviderImportRequest = {
  name: string;
  baseUrl: string;
  apiKey: string;
  wireApi: string;
  relayMode: string;
  configContents: string;
  authContents: string;
};

type PendingProviderImportResult = CommandResult<{
  pending: ProviderImportRequest | null;
}>;

type EnvConflict = {
  name: string;
  source: "process" | "user" | string;
  valuePresent: boolean;
};

type EnvConflictsResult = CommandResult<{
  conflicts: EnvConflict[];
}>;

type RemoveEnvConflictsResult = CommandResult<{
  removed: Array<{
    name: string;
    removedProcess: boolean;
    removedUser: boolean;
  }>;
  backupPath: string | null;
  remaining: EnvConflict[];
}>;

type ProviderSyncPayload = {
  syncStatus?: string;
  targetProvider?: string;
  changedSessionFiles?: number;
  skippedLockedRolloutFiles?: string[];
  sqliteRowsUpdated?: number;
  sqliteProviderRowsUpdated?: number;
  sqliteUserEventRowsUpdated?: number;
  sqliteCwdRowsUpdated?: number;
  updatedWorkspaceRoots?: number;
  encryptedContentWarning?: string | null;
};

type ProviderSyncTargetSource = "config" | "rollout" | "sqlite" | "manual";

type ProviderSyncTargetOption = {
  id: string;
  sources: ProviderSyncTargetSource[];
  isCurrentProvider: boolean;
  isManual: boolean;
  isSaved: boolean;
};

type ProviderSyncTargetsPayload = {
  currentProvider: string;
  targets: ProviderSyncTargetOption[];
};

type ProviderSyncTargetsResult = CommandResult<ProviderSyncTargetsPayload>;

type ProviderSyncProgress = {
  active: boolean;
  percent: number;
  message: string;
  result: CommandResult<ProviderSyncPayload> | null;
};

type TaskProgress = {
  active: boolean;
  percent: number;
  message: string;
};

type LogsResult = CommandResult<{
  path: string;
  text: string;
  lines: number;
}>;

type DiagnosticsResult = CommandResult<{
  report: string;
}>;

type WatcherResult = CommandResult<{
  enabled: boolean;
  disabled_flag: string;
}>;

type InstallResult = CommandResult<{
  silent_shortcut: { installed: boolean; path: string | null };
  management_shortcut: { installed: boolean; path: string | null };
}>;

type SkillMarketItem = {
  id: string;
  name: string;
  description: string;
  usage?: SkillUsageGuide;
  version: string;
  author: string;
  tags: string[];
  homepage: string;
  installed: boolean;
  installedVersion: string;
  updateAvailable: boolean;
};

type SkillMarketResult = CommandResult<{
  market: {
    status: string;
    message: string;
    indexUrl: string;
    updatedAt: string;
    skills: SkillMarketItem[];
  };
}>;

type RelayTokenMetadata = RelayTokenView & {
  name: string;
  usedQuota: number;
  group: string;
  maskedKey: string;
  models: string[];
};

type RelayTokenSyncResult = CommandResult<{
  accountId: string;
  tokens: RelayTokenMetadata[];
  summary: {
    refreshedAtMs: number;
    totalCount: number;
    usableCount: number;
  };
  wallet?: {
    display: string;
    refreshedAtMs: number;
  } | null;
}>;

type RelayTokenApplyResult = CommandResult<{
  profileId: string;
  configPath: string;
  backupPath: string | null;
  configured: boolean;
}>;

type RelayTokenConnectionResult = CommandResult<{
  latencyMs: number;
  statusCode: number;
}>;

type WorkbuddyConfigResult = CommandResult<{
  syncedModels: string[];
  added: string[];
  updated: string[];
  unchanged: string[];
  configPath: string;
  backupPath: string | null;
  installed: boolean;
  launched: boolean;
  executablePath: string | null;
  downloadUrl: string | null;
  launchMessage: string | null;
}>;

function providerSyncProgressMessage(result: CommandResult<ProviderSyncPayload>): string {
  const changed = result.changedSessionFiles ?? 0;
  const rows = result.sqliteRowsUpdated ?? 0;
  const target = result.targetProvider || t("当前 provider");
  const skipped = result.skippedLockedRolloutFiles?.length ?? 0;
  const skippedText = skipped ? tf("，跳过 {0} 个占用文件", [skipped]) : "";
  return tf("已同步到 {0}：修复 {1} 个会话文件，更新 {2} 行索引{3}。", [target, changed, rows, skippedText]);
}

const providerSyncSourceLabels: Record<ProviderSyncTargetSource, string> = {
  config: t("配置"),
  rollout: t("会话"),
  sqlite: t("索引"),
  manual: t("手动"),
};

function providerSyncTargetLabel(target: ProviderSyncTargetOption): string {
  const labels = target.sources.map((source) => providerSyncSourceLabels[source]).filter(Boolean);
  const current = target.isCurrentProvider ? [t("当前")] : [];
  return [...labels, ...current].join(" / ") || t("发现");
}

type Route = "overview" | "account" | "activity" | "community" | "announcements" | "announcementManagement" | "updates" | "downloadChatGpt" | "relay" | "sessions" | "context" | "enhance" | "visualTheme" | "zedRemote" | "userScripts" | "maintenance" | "about" | "settings";
type Theme = "dark" | "light";

type VisualThemeManifestCache = Record<string, VisualThemeManifest>;

const VISUAL_THEME_CACHE_KEY = "codework-theme-manifest-cache";
const visualThemeTokenKeys = ["background", "surface", "accent", "border", "text", "radius", "fontScale"] as const;
const visualThemeItemKeys = ["id", "name", "detail", "tier", "version", "access", "cssProfile", "previewAsset", "heroAsset", "art", "tokens"] as const;
const visualThemeManifestKeys = ["version", "updatedAt", "themes"] as const;

const builtInVisualThemes: VisualThemeItem[] = [
  {
    id: "cyber-neon", name: "赛博霓虹", detail: "青绿色高对比与科技感", tier: "pro", version: "builtin",
    tokens: { background: "#0B1020", surface: "#141B34", accent: "#00E5FF", border: "#2A3C66", text: "#E6F1FF", radius: 8, fontScale: 1 },
  },
  {
    id: "glass-lilac", name: "玻璃紫晶", detail: "半透明紫色玻璃质感", tier: "pro", version: "builtin",
    tokens: { background: "#1A1427", surface: "#2B1D45", accent: "#C084FC", border: "#5B3A82", text: "#F5EFFF", radius: 16, fontScale: 1 },
  },
  {
    id: "midnight-blue", name: "午夜深蓝", detail: "沉稳的深蓝工作界面", tier: "pro", version: "builtin",
    tokens: { background: "#0B162A", surface: "#10233F", accent: "#4DA3FF", border: "#294B73", text: "#EAF3FF", radius: 6, fontScale: 0.95 },
  },
  {
    id: "warm-paper", name: "暖调纸感", detail: "温暖低饱和的阅读风格", tier: "pro", version: "builtin",
    tokens: { background: "#F4EBDD", surface: "#FFF9F0", accent: "#B66A3C", border: "#D7BFA5", text: "#3C2B20", radius: 12, fontScale: 1.05 },
  },
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isSafeThemeText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 80 && !/[\u0000-\u001F\u007F-\u009F]/.test(value);
}

function isSafeThemeVersion(value: unknown): value is string {
  return typeof value === "string" && /^[0-9A-Za-z][0-9A-Za-z._-]{0,31}$/.test(value);
}

function isSafeThemeManifest(value: unknown): value is VisualThemeManifest {
  if (isThemeManifest(value)) return true;
  if (!isPlainObject(value) || !hasOnlyKeys(value, visualThemeManifestKeys)) return false;
  if (!isSafeThemeVersion(value.version) || !Array.isArray(value.themes)) return false;
  if (value.updatedAt !== undefined && !isSafeThemeText(value.updatedAt)) return false;

  return value.themes.every((theme) => {
    if (!isPlainObject(theme) || !hasOnlyKeys(theme, visualThemeItemKeys)) return false;
    if (typeof theme.id !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(theme.id)) return false;
    if (!isSafeThemeText(theme.name)) return false;
    if (theme.detail !== undefined && !isSafeThemeText(theme.detail)) return false;
    if (theme.tier !== "pro" || !isSafeThemeVersion(theme.version)) return false;
    if (theme.access !== undefined && theme.access !== "public" && theme.access !== "restricted") return false;
    if (theme.cssProfile !== undefined && theme.cssProfile !== "character-hero-light" && theme.cssProfile !== "dream-skin-light") return false;
    if (theme.previewAsset !== undefined && (typeof theme.previewAsset !== "string" || !/^[a-z0-9][a-z0-9._-]{0,127}\.(png|jpe?g|webp)$/i.test(theme.previewAsset))) return false;
    if (theme.heroAsset !== undefined && (typeof theme.heroAsset !== "string" || !/^[a-z0-9][a-z0-9._-]{0,127}\.(png|jpe?g|webp)$/i.test(theme.heroAsset))) return false;
    if (theme.art !== undefined && (!isPlainObject(theme.art)
      || !hasOnlyKeys(theme.art, ["focusX", "focusY", "safeArea", "taskMode", "layout"])
      || typeof theme.art.focusX !== "number" || theme.art.focusX < 0 || theme.art.focusX > 1
      || typeof theme.art.focusY !== "number" || theme.art.focusY < 0 || theme.art.focusY > 1
      || !["left", "right", "center", "none"].includes(String(theme.art.safeArea))
      || !["ambient", "banner", "off"].includes(String(theme.art.taskMode))
      || (theme.art.layout !== undefined && !["auto", "card", "immersive"].includes(String(theme.art.layout))))) return false;
    if (!isPlainObject(theme.tokens) || !hasOnlyKeys(theme.tokens, visualThemeTokenKeys)) return false;

    const tokens = theme.tokens;
    return [tokens.background, tokens.surface, tokens.accent, tokens.border, tokens.text]
      .every((color) => typeof color === "string" && /^#[0-9A-Fa-f]{6}$/.test(color))
      && Number.isInteger(tokens.radius) && typeof tokens.radius === "number" && tokens.radius >= 0 && tokens.radius <= 32
      && typeof tokens.fontScale === "number" && Number.isFinite(tokens.fontScale) && tokens.fontScale >= 0.8 && tokens.fontScale <= 1.3;
  });
}

function normalizeThemeServiceUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    parsed.hash = "";
    parsed.search = "";
    parsed.username = "";
    parsed.password = "";
    const pathname = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol}//${parsed.host}${pathname}`;
  } catch {
    return null;
  }
}

function readVisualThemeManifestCache(serviceUrl: string): VisualThemeManifest | null {
  if (typeof window === "undefined") return null;
  const normalizedUrl = normalizeThemeServiceUrl(serviceUrl);
  if (!normalizedUrl) return null;
  try {
    const raw = window.localStorage.getItem(VISUAL_THEME_CACHE_KEY);
    if (!raw) return null;
    const cache: unknown = JSON.parse(raw);
    if (!isPlainObject(cache) || !isSafeThemeManifest(cache[normalizedUrl])) return null;
    return cache[normalizedUrl];
  } catch {
    return null;
  }
}

function writeVisualThemeManifestCache(serviceUrl: string, manifest: VisualThemeManifest) {
  const normalizedUrl = normalizeThemeServiceUrl(serviceUrl);
  if (typeof window === "undefined" || !normalizedUrl || !isSafeThemeManifest(manifest)) return;
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(VISUAL_THEME_CACHE_KEY) || "{}");
    const cache: VisualThemeManifestCache = {};
    if (isPlainObject(raw)) {
      Object.entries(raw).forEach(([url, item]) => {
        if (normalizeThemeServiceUrl(url) === url && isSafeThemeManifest(item)) cache[url] = item;
      });
    }
    cache[normalizedUrl] = manifest;
    window.localStorage.setItem(VISUAL_THEME_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage can be disabled; online themes remain usable for this session.
  }
}

const routes: Array<{ id: Route; label: string; icon: LucideIcon; group: NavigationGroupId; badge?: string; adminOnly?: boolean }> = [
  { id: "overview", label: t("概览"), icon: LayoutDashboard, group: "workspace" },
  { id: "account", label: "账户中心", icon: Crown, group: "community" },
  { id: "activity", label: "活动中心", icon: Gift, group: "community" },
  { id: "community", label: "超话", icon: MessageCircle, group: "community" },
  { id: "announcements", label: "公告中心", icon: Bell, group: "community" },
  { id: "announcementManagement", label: "公告管理", icon: Edit3, group: "community", adminOnly: true },
  { id: "updates", label: "版本更新", icon: Download, group: "clientTools" },
  { id: "downloadChatGpt", label: "下载官方 ChatGPT", icon: Download, group: "clientTools" },
  { id: "visualTheme", label: "视觉个性化", icon: Palette, group: "clientTools", badge: "PRO" },
  { id: "userScripts", label: "Skill 市场", icon: FileCode2, group: "clientTools" },
  { id: "relay", label: t("供应商配置"), icon: KeyRound, group: "codexTools" },
  { id: "sessions", label: t("会话管理"), icon: MessageCircle, group: "codexTools" },
  { id: "context", label: t("工具与插件"), icon: Network, group: "codexTools" },
  { id: "enhance", label: t("Codex增强"), icon: Hammer, group: "codexTools" },
  { id: "zedRemote", label: t("Zed 远程项目"), icon: ExternalLink, group: "codexTools" },
  { id: "maintenance", label: t("安装维护"), icon: Wrench, group: "system" },
  { id: "about", label: t("关于"), icon: Info, group: "system" },
  { id: "settings", label: t("设置"), icon: Settings, group: "system" },
];

const defaultSettings: BackendSettings = {
  codexAppPath: "",
  codexExtraArgs: [],
  providerSyncEnabled: false,
  providerSyncSavedProviders: [],
  providerSyncManualProviders: [],
  providerSyncLastSelectedProvider: "",
  relayProfilesEnabled: true,
  enhancementsEnabled: true,
  computerUseGuardEnabled: false,
  codexAppPluginMarketplaceUnlock: true,
  codexAppPluginAutoExpand: true,
  codexAppModelWhitelistUnlock: true,
  codexAppSessionDelete: true,
  codexAppMarkdownExport: true,
  codexAppPasteFix: false,
  codexAppForceChineseLocale: true,
  codexAppFastStartup: false,
  codexAppProjectMove: true,
  codexAppThreadIdBadge: false,
  codexAppConversationView: false,
  codexAppThreadScrollRestore: true,
  codexAppZedRemoteOpen: true,
  zedRemoteOpenStrategy: "addToFocusedWorkspace",
  zedRemoteProjectRegistryEnabled: true,
  zedRemoteSyncToZedSettings: false,
  codexAppUpstreamWorktreeCreate: true,
  codexAppNativeMenuPlacement: true,
  codexAppNativeMenuLocalization: true,
  codexAppServiceTierControls: false,
  codexAppStepwiseEnabled: false,
  codexAppStepwiseDirectSend: false,
  codexAppStepwiseBaseUrl: "",
  codexAppStepwiseApiKey: "",
  codexAppStepwiseApiKeyEnv: "CODEX_STEPWISE_API_KEY",
  codexAppStepwiseModel: "",
  codexAppStepwiseMaxItems: 6,
  codexAppStepwiseMaxInputChars: 6000,
  codexAppStepwiseMaxOutputTokens: 500,
  codexAppStepwiseTimeoutMs: 8000,
  codexAppImageOverlayEnabled: false,
  codexAppImageOverlayPath: "",
  codexAppImageOverlayOpacity: 35,
  codexAppImageOverlayFitMode: "fit",
  codexAppVisualThemeEnabled: false,
  codexAppVisualThemeId: "cyber-neon",
  codexAppVisualThemeServiceUrl: "http://115.190.199.191:28080",
  codexGoalsEnabled: false,
  launchMode: "patch",
  relayBaseUrl: CODEWORK_API_BASE_URL,
  relayApiKey: "",
  relayProfiles: [
    {
      id: "codework-ai",
      name: "Codework AI 官方中转",
      model: "gpt-5.6-sol",
      baseUrl: CODEWORK_API_BASE_URL,
      upstreamBaseUrl: CODEWORK_API_BASE_URL,
      apiKey: "",
      protocol: "responses",
      relayMode: "pureApi",
      officialMixApiKey: false,
      testModel: "gpt-5.6-sol",
      configContents: `model_provider = "custom"
model = "gpt-5.6-sol"

[model_providers]

[model_providers.custom]
name = "custom"
wire_api = "responses"
requires_openai_auth = true
base_url = "${CODEWORK_API_BASE_URL}"
`,
      authContents: "",
      useCommonConfig: true,
      contextSelection: emptyContextSelection(),
      contextSelectionInitialized: true,
      contextWindow: "",
      autoCompactLimit: "",
      modelList: "gpt-5.6-sol\ngpt-5.6-terra\ngpt-5.6-luna\ngpt-5.5",
      modelWindows: "",
      userAgent: "",
    },
  ],
  relayCommonConfigContents: "",
  relayContextConfigContents: "",
  activeRelayId: "codework-ai",
  aggregateRelayProfiles: [],
  activeAggregateRelayId: "",
  relayTestModel: "gpt-5.6-sol",
};

export function App() {
  const [theme, setTheme] = useState<Theme>(() => loadInitialTheme());
  const [clientSkin, setClientSkin] = useState(() => readInitialClientSkin(window.localStorage));
  const [route, setRoute] = useState<Route>(() => loadInitialRoute());
  const [collapsedNavigationGroups, setCollapsedNavigationGroups] = useState<Set<NavigationGroupId>>(() => new Set());
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);
  const [notice, setNotice] = useState<{ title: string; message: string; status?: Status } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmText: string;
    cancelText: string;
    resolve: (confirmed: boolean) => void;
  } | null>(null);
  const [overview, setOverview] = useState<OverviewResult | null>(null);
  const [settings, setSettings] = useState<SettingsResult | null>(null);
  const [relay, setRelay] = useState<RelayResult | null>(null);
  const [relayFiles, setRelayFiles] = useState<RelayFilesResult | null>(null);
  const [relayTokenSync, setRelayTokenSync] = useState<RelayTokenSyncResult | null>(null);
  const [relayTokenSyncing, setRelayTokenSyncing] = useState(false);
  const [workbuddyConfiguring, setWorkbuddyConfiguring] = useState(false);
  const [envConflicts, setEnvConflicts] = useState<EnvConflictsResult | null>(null);
  const [ccsProviders, setCcsProviders] = useState<CcsProvidersResult | null>(null);
  const [pendingProviderImport, setPendingProviderImport] = useState<ProviderImportRequest | null>(null);
  const [localSessions, setLocalSessions] = useState<LocalSessionsResult | null>(null);
  const [zedRemoteProjects, setZedRemoteProjects] = useState<ZedRemoteProjectsResult | null>(null);
  const [liveContextEntries, setLiveContextEntries] = useState<CodexContextEntries | null>(null);
  const [logs, setLogs] = useState<LogsResult | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);
  const [watcher, setWatcher] = useState<WatcherResult | null>(null);
  const [skillMarket, setSkillMarket] = useState<SkillMarketResult | null>(null);
  const [launchForm, setLaunchForm] = useState({
    appPath: "",
    debugPort: "9229",
    helperPort: "57321",
  });
  const prevLaunchStatusRef = useRef<string | null>(null);
  const [settingsForm, setSettingsForm] = useState<BackendSettings>({ ...defaultSettings });
  const [providerSyncProgress, setProviderSyncProgress] = useState<ProviderSyncProgress>({
    active: false,
    percent: 0,
    message: t("尚未运行历史会话修复。"),
    result: null,
  });
  const [pluginMarketplaceProgress, setPluginMarketplaceProgress] = useState<TaskProgress>({
    active: false,
    percent: 0,
    message: t("尚未运行插件市场修复。"),
  });
  const [remotePluginMarketplace, setRemotePluginMarketplace] = useState<RemotePluginMarketplaceResult | null>(null);
  const [remotePluginMarketplaceProgress, setRemotePluginMarketplaceProgress] = useState<TaskProgress>({
    active: false,
    percent: 0,
    message: t("尚未检查官方远端插件缓存。"),
  });
  const [providerSyncTargets, setProviderSyncTargets] = useState<ProviderSyncTargetsResult | null>(null);
  const [selectedProviderSyncTarget, setSelectedProviderSyncTarget] = useState("");
  const [removeOwnedData, setRemoveOwnedData] = useState(false);
  const [relaySwitching, setRelaySwitching] = useState(false);
  const [memberProfile, setMemberProfile] = useState<MemberProfile | null>(null);
  const [chatFriends, setChatFriends] = useState<ChatFriend[]>([]);
  const [verifiedFriendProfiles, setVerifiedFriendProfiles] = useState<FriendSearchResult[]>(readVerifiedFriendProfiles);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [incomingFriendRequests, setIncomingFriendRequests] = useState<IncomingFriendRequest[]>([]);
  const [outgoingFriendRequests, setOutgoingFriendRequests] = useState<OutgoingFriendRequest[]>([]);
  const [chatSelfStatus, setChatSelfStatus] = useState<PresenceStatus>("online");
  const [chatNotificationPulse, setChatNotificationPulse] = useState(0);
  const chatUnreadCountsRef = useRef<Map<string, number>>(new Map());
  const chatPresenceRef = useRef<PresenceStatus>("online");
  const chatInitializedRef = useRef(false);
  const [memberActivity, setMemberActivity] = useState<MemberActivity | null>(null);
  const [memberAccessToken, setMemberAccessToken] = useState("");
  const [memberRememberedUsername, setMemberRememberedUsername] = useState("");
  const [memberRememberedPassword, setMemberRememberedPassword] = useState("");
  const [memberRememberPassword, setMemberRememberPassword] = useState(false);
  const [memberGateReady, setMemberGateReady] = useState(false);
  const [memberLoginApproved, setMemberLoginApproved] = useState(false);
  const [releaseResult, setReleaseResult] = useState<CodeworkReleaseResult | null>(null);
  const [releaseProgress, setReleaseProgress] = useState<InstallerProgress | null>(null);
  const [releaseLastCheckedAt, setReleaseLastCheckedAt] = useState<number | null>(null);
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string | null>(null);
  const [chatGptResult, setChatGptResult] = useState<ChatGptInstallResult | null>(null);
  const [chatGptProgress, setChatGptProgress] = useState<InstallerProgress | null>(null);
  const [community, setCommunity] = useState<CommunityResult | null>(null);
  const [communityDraft, setCommunityDraft] = useState("");
  const [announcementFeed, setAnnouncementFeed] = useState<AnnouncementFeed | null>(null);
  const [announcementReadKeys, setAnnouncementReadKeys] = useState<Set<string>>(() => {
    try {
      const value = JSON.parse(window.localStorage.getItem(ANNOUNCEMENT_READ_STORAGE_KEY) || "[]");
      return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
    } catch { return new Set(); }
  });
  const [dismissedAnnouncementIds, setDismissedAnnouncementIds] = useState<Set<string>>(() => new Set());
  const [announcementDraft, setAnnouncementDraft] = useState<{ title: string; body: string; priority: "normal" | "important" | "urgent"; isPinned: boolean }>({ title: "", body: "", priority: "normal", isPinned: false });
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<string | null>(null);

  const call = <T,>(command: string, args?: Record<string, unknown>) => invoke<T>(command, args);
  const availableRelease = getAvailableCodeworkRelease(releaseResult);
  const activeMemberIdentity = memberProfile ? getMemberIdentityDisplay(memberProfile) : null;
  const showWorkspaceUpdateNotice = availableRelease?.latestVersion !== dismissedUpdateVersion;
  const unreadAnnouncementCount = announcementFeed?.announcements.filter((announcement) => isAnnouncementUnread(announcement, announcementReadKeys)).length ?? 0;
  const unreadMessageCount = chatFriends.reduce((count, friend) => count + Math.max(0, friend.unreadCount || 0), 0);
  const latestAnnouncement = announcementFeed?.announcements.find((announcement) => !dismissedAnnouncementIds.has(announcement.id)) ?? null;
  const navigationGroups = groupNavigationItems(routes, route, Boolean(memberProfile?.actualAdmin));
  const workspaceNotifications = buildNotificationSummary({ latestVersion: availableRelease?.latestVersion ?? null, unreadAnnouncements: unreadAnnouncementCount, unreadMessages: unreadMessageCount });

  const markAnnouncementRead = (announcement: ClientAnnouncement) => {
    const key = `${announcement.id}:${announcement.revision}`;
    setAnnouncementReadKeys((current) => {
      const next = new Set(current).add(key);
      window.localStorage.setItem(ANNOUNCEMENT_READ_STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const logDiagnostic = (event: string, detail: Record<string, unknown> = {}) => {
    void invoke("write_diagnostic_event", { event, detail }).catch(() => {});
  };

  const run = async <T,>(task: () => Promise<T>): Promise<T | null> => {
    try {
      return await task();
    } catch (error) {
      showNotice(t("调用失败"), stringifyError(error), "failed");
      return null;
    }
  };

  const refreshMemberProfile = async (candidateAccessToken?: string) => {
    const accessToken = (candidateAccessToken ?? memberAccessToken).trim();
    if (!accessToken) {
      void call("sync_visual_theme_member_session", { accessToken: "" }).catch(() => {});
      setMemberProfile(null);
      setMemberLoginApproved(false);
      return null;
    }
    try {
      const result = await call<MemberProfileResult>("client_profile", { accessToken });
      const profile = isSuccessStatus(result.status) ? normalizeMemberProfile(result) : null;
      if (!profile) {
        void call("clear_member_session").catch(() => {});
        setMemberAccessToken("");
        void call("sync_visual_theme_member_session", { accessToken: "" }).catch(() => {});
        setMemberProfile(null);
        setMemberLoginApproved(false);
        return null;
      }
      setMemberProfile(profile);
      setMemberLoginApproved(true);
      void call("sync_visual_theme_member_session", { accessToken }).catch(() => {});
      void call("sync_client_identity_window_icon", { activeRole: profile.activeRole }).catch(() => {});
      return profile;
    } catch {
      void call("clear_member_session").catch(() => {});
      setMemberAccessToken("");
      void call("sync_visual_theme_member_session", { accessToken: "" }).catch(() => {});
      setMemberProfile(null);
      setMemberLoginApproved(false);
      return null;
    }
  };

  const changeMemberRole = async (activeRole: MemberRole) => {
    const accessToken = memberAccessToken.trim();
    if (!accessToken || !memberProfile?.actualAdmin) return;
    const result = await run(() => call<CommandResult<{ identity: { activeRole: MemberRole; actualAdmin: boolean } }>>("update_client_active_role", { accessToken, activeRole }));
    if (!result || !isSuccessStatus(result.status)) return;
    setMemberProfile((current) => current ? { ...current, activeRole: result.identity.activeRole, actualAdmin: result.identity.actualAdmin } : current);
    const iconResult = await run(() => call<CommandResult<{ applied: boolean }>>("sync_client_identity_window_icon", { activeRole: result.identity.activeRole }));
    if (iconResult && !isSuccessStatus(iconResult.status)) showNotice("身份皇冠", iconResult.message, iconResult.status);
    await refreshMemberActivity();
  };

  const searchThemeGrantMember = async (query: string): Promise<ThemeGrantMemberRecord | null> => {
    const accessToken = memberAccessToken.trim();
    if (!accessToken || !memberProfile?.actualAdmin) return null;
    const result = await run(() => call<CommandResult<{ member: ThemeGrantMemberRecord | null }>>(
      "search_theme_grant_member",
      { accessToken, query },
    ));
    if (!result) return null;
    if (!isSuccessStatus(result.status)) {
      showNotice("主题授权管理", result.message, result.status);
      return null;
    }
    return result.member;
  };

  const saveThemeGrant = async (
    member: ThemeGrantMember,
    themeIds: string[],
  ): Promise<ThemeGrantMemberRecord | null> => {
    const accessToken = memberAccessToken.trim();
    if (!accessToken || !memberProfile?.actualAdmin) return null;
    const result = await run(() => call<CommandResult<{ member: ThemeGrantMemberRecord }>>(
      "save_theme_grants",
      { accessToken, userId: member.userId, themeIds: normalizeThemeGrantIds(themeIds) },
    ));
    if (!result) return null;
    if (!isSuccessStatus(result.status)) {
      showNotice("主题授权管理", result.message, result.status);
      return null;
    }
    showNotice("主题授权管理", "授权已实时保存，用户刷新个性化页即可看到新主题。", "ok");
    return result.member;
  };

  const checkCodeworkRelease = async () => {
    setReleaseProgress({ stage: "checking" });
    const result = await run(() => call<CodeworkReleaseResult>("check_codework_release"));
    if (result) {
      setReleaseResult(result);
      setReleaseLastCheckedAt(Date.now());
    }
    setReleaseProgress(null);
    return result;
  };

  const installCodeworkRelease = async () => {
    const confirmed = await confirmSessionDelete("发现新版本", "将下载 Codework 官方安装包。下载完成后客户端会自动退出、静默覆盖安装并重新启动，已有配置会保留。现在开始更新吗？");
    if (!confirmed) return;
    setReleaseProgress({ stage: "downloading", downloadedBytes: 0 });
    const result = await run(() => call<CodeworkReleaseResult>("install_codework_release"));
    if (result) setReleaseResult(result);
  };

  const refreshChatGptStatus = async () => {
    setChatGptProgress({ stage: "checking" });
    const result = await run(() => call<ChatGptInstallResult>("get_chatgpt_install_status"));
    if (result) setChatGptResult(result);
    setChatGptProgress(null);
    return result;
  };

  const installOfficialChatGpt = async () => {
    const confirmed = await confirmSessionDelete("安装官方 ChatGPT", "将通过 Microsoft Store 官方渠道安装 OpenAI 的 ChatGPT。系统可能要求登录 Microsoft Store 或确认许可。现在开始吗？");
    if (!confirmed) return;
    setChatGptProgress({ stage: "installing" });
    const result = await run(() => call<ChatGptInstallResult>("install_official_chatgpt"));
    if (result) setChatGptResult(result);
  };

  const refreshMemberActivity = async (candidateAccessToken?: string) => {
    const accessToken = (candidateAccessToken ?? memberAccessToken).trim();
    if (!accessToken) {
      setMemberActivity(null);
      return null;
    }
    try {
      const result = await call<MemberActivityResult>("client_activity", { accessToken });
      const activity = isSuccessStatus(result.status) ? normalizeMemberActivity(result) : null;
      setMemberActivity(activity);
      return activity;
    } catch {
      setMemberActivity(null);
      return null;
    }
  };

  const refreshCommunity = async () => {
    const accessToken = memberAccessToken.trim();
    if (!accessToken) {
      setCommunity(null);
      return null;
    }
    const result = await run(() => call<CommunityResult>("community_comments", { accessToken }));
    if (result) setCommunity(result);
    return result;
  };

  const refreshPrivateFriends = async (candidateAccessToken?: string) => {
    const accessToken = (candidateAccessToken ?? memberAccessToken).trim();
    if (!accessToken) return;
    const result = await run(() => call<CommandResult<{ friends: ChatFriend[]; incomingRequests: IncomingFriendRequest[]; outgoingRequests: OutgoingFriendRequest[]; selfStatus: PresenceStatus }>>("list_private_friends", { accessToken }));
    if (result && isSuccessStatus(result.status)) {
      const friends = applyVerifiedFriendProfiles(result.friends, verifiedFriendProfiles);
      const nextUnreadCounts = new Map(friends.map((friend) => [friend.userId, friend.unreadCount]));
      const notifyingFriend = friends.find((friend) => shouldNotifyIncomingMessage(chatPresenceRef.current, chatUnreadCountsRef.current.get(friend.userId) ?? 0, friend.unreadCount));
      if (chatInitializedRef.current && notifyingFriend) {
        setChatNotificationPulse((value) => value + 1);
        void getCurrentWindow().requestUserAttention(UserAttentionType.Informational).catch(() => {});
        playIncomingMessageChime();
        showNotice("新消息", `${notifyingFriend.identityLabel || notifyingFriend.username} 发来一条新消息`, "ok");
      }
      chatUnreadCountsRef.current = nextUnreadCounts;
      chatInitializedRef.current = true;
      setChatFriends(friends);
      setIncomingFriendRequests(result.incomingRequests);
      setOutgoingFriendRequests(result.outgoingRequests ?? []);
      setChatSelfStatus(result.selfStatus);
    }
  };
  const changePrivatePresence = async (status: PresenceStatus) => {
    const accessToken = memberAccessToken.trim();
    if (!accessToken) return;
    const previousStatus = chatSelfStatus;
    setChatSelfStatus(status);
    const result = await run(() => call<CommandResult<{ status: PresenceStatus }>>("update_private_presence", { accessToken, status }));
    if (result && isSuccessStatus(result.status)) {
      setChatSelfStatus(result.status);
      showNotice("在线状态", getPresenceUpdateFeedback(result.status), "ok");
    } else {
      setChatSelfStatus(previousStatus);
      if (result) showNotice("在线状态", result.message, result.status);
    }
  };
  const loadPrivateMessages = async (friendUserId: string) => {
    const accessToken = memberAccessToken.trim();
    if (!accessToken) return;
    const result = await run(() => call<CommandResult<{ messages: ChatMessage[] }>>("load_private_messages", { accessToken, friendUserId }));
    if (result && isSuccessStatus(result.status)) setChatMessages(result.messages);
  };
  const sendPrivateMessage = async (friendUserId: string, content: string) => {
    const accessToken = memberAccessToken.trim();
    if (!accessToken) return;
    const result = await run(() => call<CommandResult<{ message: ChatMessage }>>("send_private_message", { accessToken, friendUserId, content }));
    if (result && isSuccessStatus(result.status)) await loadPrivateMessages(friendUserId);
  };
  const sendPrivateAttachment = async (friendUserId: string, attachment: { dataBase64: string; fileName: string; mimeType: string }) => {
    const accessToken = memberAccessToken.trim();
    if (!accessToken) return;
    const result = await run(() => call<CommandResult<{ message: ChatMessage }>>("send_private_attachment", {
      accessToken,
      friendUserId,
      dataBase64: attachment.dataBase64,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
    }));
    if (result && isSuccessStatus(result.status)) await loadPrivateMessages(friendUserId);
  };
  const respondToFriendRequest = async (requestId: string, accept: boolean) => {
    const accessToken = memberAccessToken.trim();
    if (!accessToken) return;
    const result = await run(() => call<CommandResult<unknown>>("respond_to_friend_request", { accessToken, requestId, accept }));
    if (result && isSuccessStatus(result.status)) await refreshPrivateFriends();
  };
  const requestFriend = async (userId: string, username: string) => {
    const accessToken = memberAccessToken.trim();
    if (!accessToken) return;
    const result = await run(() => call<CommandResult<unknown>>("send_friend_request", { accessToken, userId, username }));
    if (result && isSuccessStatus(result.status)) {
      await refreshPrivateFriends();
      showNotice("好友申请", "已发送好友申请", "ok");
    }
  };
  const cancelFriendRequest = async (friendUserId: string) => {
    const accessToken = memberAccessToken.trim();
    if (!accessToken) return;
    const result = await run(() => call<CommandResult<{ cancelled: boolean }>>("cancel_friend_request", { accessToken, friendUserId }));
    if (result && isSuccessStatus(result.status)) {
      await refreshPrivateFriends();
      showNotice("好友申请", "已取消好友申请", "ok");
    } else if (result) showNotice("好友申请", result.message, result.status);
  };
  const searchFriend = async (query: string): Promise<FriendSearchResult | null> => {
    const accessToken = memberAccessToken.trim();
    if (!accessToken) return null;
    const result = await run(() => call<CommandResult<{ result: FriendSearchResult | null }>>("search_registered_friend", { accessToken, query }));
    if (result && isSuccessStatus(result.status)) {
      if (result.result) {
        setVerifiedFriendProfiles((current) => {
          const next = [...current.filter((item) => item.userId !== result.result!.userId), result.result!].slice(-200);
          window.localStorage.setItem(VERIFIED_FRIEND_PROFILE_STORAGE_KEY, JSON.stringify(next));
          setChatFriends((friends) => applyVerifiedFriendProfiles(friends, next));
          return next;
        });
      }
      return result.result;
    }
    if (result) showNotice("搜索好友", result.message, result.status);
    return null;
  };

  const refreshAnnouncements = async (candidateAccessToken?: string) => {
    const accessToken = (candidateAccessToken ?? memberAccessToken).trim();
    if (!accessToken) {
      setAnnouncementFeed(null);
      return null;
    }
    const result = await run(() => call<AnnouncementResult>("client_announcements", { accessToken }));
    const feed = result && isSuccessStatus(result.status) ? normalizeAnnouncementFeed(result) : null;
    if (feed) setAnnouncementFeed(feed);
    return feed;
  };

  const saveAnnouncement = async () => {
    const accessToken = memberAccessToken.trim();
    if (!accessToken || !announcementFeed?.canManage) return;
    const result = await run(() => call<CommandResult<{ announcement: ClientAnnouncement }>>("save_client_announcement", {
      accessToken,
      announcementId: editingAnnouncementId,
      payload: { ...announcementDraft, status: "published" },
    }));
    if (result && isSuccessStatus(result.status)) {
      setAnnouncementDraft({ title: "", body: "", priority: "normal", isPinned: false });
      setEditingAnnouncementId(null);
      await refreshAnnouncements();
    } else if (result) showNotice("公告管理", result.message, result.status);
  };

  const editAnnouncement = (announcement: ClientAnnouncement) => {
    setEditingAnnouncementId(announcement.id);
    setAnnouncementDraft({ title: announcement.title, body: announcement.body, priority: announcement.priority, isPinned: announcement.isPinned });
    void navigate("announcementManagement");
  };

  const withdrawAnnouncement = async (announcementId: string) => {
    const accessToken = memberAccessToken.trim();
    if (!accessToken || !announcementFeed?.canManage) return;
    const result = await run(() => call<CommandResult<{ announcement: ClientAnnouncement }>>("withdraw_client_announcement", { accessToken, announcementId }));
    if (result && isSuccessStatus(result.status)) await refreshAnnouncements();
    else if (result) showNotice("公告管理", result.message, result.status);
  };

  const publishCommunityComment = async () => {
    const accessToken = memberAccessToken.trim();
    const content = communityDraft.trim();
    if (!accessToken || !content) return;
    const result = await run(() => call<CommandResult<{ comment: CommunityComment }>>("post_community_comment", { accessToken, content }));
    if (result && isSuccessStatus(result.status)) {
      setCommunityDraft("");
      await refreshCommunity();
    } else if (result) showNotice("超话", result.message, result.status);
  };

  const removeCommunityComment = async (commentId: string) => {
    const accessToken = memberAccessToken.trim();
    if (!accessToken) return;
    const confirmation = getCommunityDeleteConfirmation();
    if (!(await confirmSessionDelete(confirmation.title, confirmation.message))) return;
    const result = await run(() => call<CommandResult<{ deleted: boolean }>>("delete_community_comment", { accessToken, commentId }));
    if (result && isSuccessStatus(result.status)) await refreshCommunity();
    else if (result) showNotice("超话", result.message, result.status);
  };

  const toggleCommunityLike = async (commentId: string) => {
    const accessToken = memberAccessToken.trim();
    if (!accessToken) return;
    const result = await run(() => call<CommandResult<unknown>>("toggle_community_comment_like", { accessToken, commentId }));
    if (result && isSuccessStatus(result.status)) await refreshCommunity();
  };

  const replyCommunityComment = async (commentId: string, content: string) => {
    const accessToken = memberAccessToken.trim();
    if (!accessToken || !content.trim()) return;
    const result = await run(() => call<CommandResult<unknown>>("reply_to_community_comment", { accessToken, commentId, content: content.trim() }));
    if (result && isSuccessStatus(result.status)) await refreshCommunity();
  };

  const loginMember = async (username: string, password: string, rememberPassword = false) => {
    const result = await run(() => call<MemberLoginResult>("client_login", { username, password }));
    if (!result || !isSuccessStatus(result.status)) {
      if (result) showNotice("账户登录", result.message, result.status);
      return false;
    }
    const accessToken = result.accessToken?.trim();
    const profile = normalizeMemberProfile(result.profile);
    if (!accessToken || !profile) {
      showNotice("账户登录", "会员身份数据无效，请稍后重试。", "failed");
      return false;
    }
    const savedSession = await run(() => call<MemberSessionResult>("save_member_session", {
      accessToken,
      username: username.trim(),
      password,
      rememberPassword,
    }));
    if (!savedSession || !isSuccessStatus(savedSession.status)) {
      if (savedSession) showNotice("账户安全", savedSession.message, savedSession.status);
      return false;
    }
    setMemberAccessToken(accessToken);
    setMemberRememberedUsername(savedSession.username);
    setMemberRememberedPassword(savedSession.password);
    setMemberRememberPassword(savedSession.rememberPassword);
    setMemberProfile(profile);
    setMemberLoginApproved(true);
    setRoute("account");
    void refreshMemberActivity(accessToken);
    void refreshAnnouncements(accessToken);
    void refreshPrivateFriends(accessToken);
    void syncRelayTokens(true, { username: username.trim(), password });
    showNotice("账户登录", profile.tier === "supreme" ? "至尊 VIP 身份已核验。" : "普通 VIP 身份已核验。", "ok");
    return true;
  };

  const logoutMember = () => {
    void call("clear_member_session").catch(() => {});
    setMemberAccessToken("");
    setMemberRememberedUsername("");
    setMemberRememberedPassword("");
    setMemberRememberPassword(false);
    setMemberProfile(null);
    setMemberActivity(null);
    setRelayTokenSync(null);
    setAnnouncementFeed(null);
    setMemberLoginApproved(false);
  };

  const refreshOverview = async (silent = false) => {
    const result = await run(() => call<OverviewResult>("load_overview"));
    if (result) {
      // 崩溃检测：进程从运行状态变为停止/失败 → 弹出通知
      const prev = prevLaunchStatusRef.current;
      const current = result.latest_launch?.status;
      if (prev && prev === "running" && current && (current === "stopped" || current === "failed" || current === "crashed")) {
        showNotice(t("Codex 意外停止"), tf("进程状态：{0}。是否要重新启动？", [current]), "failed");
      }
      prevLaunchStatusRef.current = current ?? null;
      setOverview(result);
      if (!silent) showResultNotice(t("概览已检查"), result, { silentSuccess: true });
    }
  };

  const refreshSettings = async (silent = false) => {
    const result = await run(() => call<SettingsResult>("load_settings"));
    if (result) {
      setSettings(result);
      const normalized = normalizeSettings(result.settings);
      setSettingsForm(normalized);
      setLaunchForm((current) => ({
        ...current,
        appPath: current.appPath || result.settings.codexAppPath || "",
      }));
      if (!silent) showResultNotice(t("设置已加载"), result, { silentSuccess: true });
      return normalized;
    }
    return null;
  };

  const refreshSkillMarket = async (silent = false) => {
    const result = await run(() => call<SkillMarketResult>("refresh_skill_market"));
    if (result) {
      setSkillMarket(result);
      if (!silent || !isSuccessStatus(result.status)) showResultNotice("Skill 市场", result, { silentSuccess: true });
    }
  };

  const installMarketSkill = async (id: string) => {
    const result = await run(() => call<SkillMarketResult>("install_market_skill", { id }));
    if (result) {
      setSkillMarket(result);
      showResultNotice("Skill 市场", result);
    }
  };

  const setUserScriptEnabled = async (key: string, enabled: boolean) => {
    const result = await run(() => call<SettingsResult>("set_user_script_enabled", { key, enabled }));
    if (result) {
      setSettings(result);
      showResultNotice(t("本地脚本"), result);
    }
  };

  const deleteUserScript = async (key: string) => {
    const script = settings?.user_scripts?.scripts?.find((item) => item.key === key);
    const name = script?.name || key;
    if (!window.confirm(tf("删除脚本“{0}”？此操作会移除本地脚本文件。", [name]))) return;
    const result = await run(() => call<SettingsResult>("delete_user_script", { key }));
    if (result) {
      setSettings(result);
      showResultNotice(t("本地脚本"), result);
    }
  };

  const refreshRelay = async (silent = false) => {
    const result = await run(() => call<RelayResult>("relay_status"));
    if (result) {
      setRelay(result);
      if (!silent) showResultNotice(t("登录状态"), result, { silentSuccess: true });
    }
  };

  const refreshRelayFiles = async (silent = false) => {
    const result = await run(() => call<RelayFilesResult>("read_relay_files"));
    if (result) {
      setRelayFiles(result);
      if (!silent) showResultNotice(t("配置文件"), result, { silentSuccess: true });
    }
    return result;
  };

  const refreshEnvConflicts = async (silent = false) => {
    const result = await run(() => call<EnvConflictsResult>("check_env_conflicts"));
    if (result) {
      setEnvConflicts(result);
      if (!silent || !isSuccessStatus(result.status)) showResultNotice(t("环境变量检测"), result, { silentSuccess: true });
    }
    return result;
  };

  const removeEnvConflicts = async (names: string[]) => {
    const uniqueNames = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
    if (!uniqueNames.length) return;
    if (!window.confirm(tf("删除这些环境变量？\n\n{0}\n\n删除前会写入备份。", [uniqueNames.join("\n")]))) return;
    const result = await run(() => call<RemoveEnvConflictsResult>("remove_env_conflicts", { request: { names: uniqueNames } }));
    if (result) {
      setEnvConflicts({
        status: result.status,
        message: result.message,
        conflicts: result.remaining,
      });
      showNotice(t("环境变量清理"), result.message, result.status);
    }
  };

  const refreshCcsProviders = async (silent = false) => {
    const result = await run(() => call<CcsProvidersResult>("load_ccs_providers"));
    if (result) {
      setCcsProviders(result);
      if (!silent || !isSuccessStatus(result.status)) showResultNotice(t("cc-switch 导入"), result, { silentSuccess: true });
    }
    return result;
  };

  const importCcsProviders = async () => {
    const result = await run(() => call<SettingsResult>("import_ccs_providers"));
    if (result) {
      setSettings(result);
      setSettingsForm(normalizeSettings(result.settings));
      showResultNotice(t("cc-switch 导入"), result);
      await refreshCcsProviders(true);
    }
  };

  const refreshPendingProviderImport = async (silent = true) => {
    const result = await run(() => call<PendingProviderImportResult>("load_pending_provider_import"));
    if (result) {
      setPendingProviderImport(result.pending);
      if (!silent && !isSuccessStatus(result.status)) showResultNotice(t("Codex++ 导入"), result, { silentSuccess: true });
    }
    return result;
  };

  const confirmPendingProviderImport = async () => {
    const result = await run(() => call<SettingsResult>("confirm_pending_provider_import"));
    if (result) {
      setPendingProviderImport(null);
      setSettings(result);
      setSettingsForm(normalizeSettings(result.settings));
      showResultNotice(t("Codex++ 导入"), result);
      await refreshCcsProviders(true);
    }
  };

  const dismissPendingProviderImport = async () => {
    const result = await run(() => call<PendingProviderImportResult>("dismiss_pending_provider_import"));
    if (result) {
      setPendingProviderImport(null);
      showResultNotice(t("Codex++ 导入"), result, { silentSuccess: true });
    }
  };

  const refreshLocalSessions = async (silent = false) => {
    const result = await run(() => call<LocalSessionsResult>("list_local_sessions"));
    if (result) {
      setLocalSessions(result);
      if (!silent || !isSuccessStatus(result.status)) showResultNotice(t("会话管理"), result, { silentSuccess: true });
    }
    return result;
  };

  const refreshZedRemoteProjects = async (silent = false) => {
    const result = await run(() => call<ZedRemoteProjectsResult>("list_zed_remote_projects"));
    if (result) {
      setZedRemoteProjects(result);
      if (!silent || !isSuccessStatus(result.status)) showResultNotice(t("Zed 远程项目"), result, { silentSuccess: true });
    }
    return result;
  };

  const openZedRemoteProject = async (
    project: ZedRemoteProject,
    strategy: ZedOpenStrategy = settingsForm.zedRemoteOpenStrategy || "addToFocusedWorkspace",
  ) => {
    const result = await run(() =>
      call<ZedRemoteOpenResult>("open_zed_remote", {
        payload: {
          ssh: project.ssh,
          hostId: project.hostId,
          path: project.path,
          strategy,
          remember: settingsForm.zedRemoteProjectRegistryEnabled !== false,
        },
      }),
    );
    if (result) {
      showResultNotice(t("Zed 远程打开"), result);
      await refreshZedRemoteProjects(true);
    }
  };

  const forgetZedRemoteProject = async (project: ZedRemoteProject) => {
    const result = await run(() => call<ZedRemoteProjectsResult>("forget_zed_remote_project", { id: project.id }));
    if (result) {
      setZedRemoteProjects(result);
      showResultNotice(t("Zed 远程项目"), result);
    }
  };

  const requestDeleteLocalSession = (session: LocalSession) =>
    call<DeleteLocalSessionResult>("delete_local_session", {
      request: { sessionId: session.id, title: session.title, dbPath: session.dbPath },
    });

  const confirmSessionDelete = (title: string, message: string) =>
    new Promise<boolean>((resolve) => {
      setConfirmDialog({
        title,
        message,
        confirmText: t("确认删除"),
        cancelText: t("取消"),
        resolve,
      });
    });

  useEffect(() => {
    let unlistenRelease: (() => void) | undefined;
    let unlistenChatGpt: (() => void) | undefined;
    void listen<InstallerProgress>("codework-release-progress", (event) => setReleaseProgress(event.payload)).then((dispose) => { unlistenRelease = dispose; });
    void listen<InstallerProgress>("chatgpt-install-progress", (event) => setChatGptProgress(event.payload)).then((dispose) => { unlistenChatGpt = dispose; });
    void checkCodeworkRelease();
    const releaseTimer = window.setInterval(() => void checkCodeworkRelease(), 6 * 60 * 60 * 1000);
    return () => {
      unlistenRelease?.();
      unlistenChatGpt?.();
      window.clearInterval(releaseTimer);
    };
  }, []);

  const deleteLocalSession = async (session: LocalSession) => {
    const title = session.title || session.id;
    const confirmed = await confirmSessionDelete(t("删除会话"), tf("删除会话“{0}”？此操作会删除本地数据库记录和 rollout 文件，并创建备份。", [title]));
    if (!confirmed) return;
    const result = await run(() => requestDeleteLocalSession(session));
    if (result) {
      showResultNotice(t("会话删除"), result);
      await refreshLocalSessions(true);
    }
  };

  const deleteLocalSessions = async (sessions: LocalSession[]) => {
    const uniqueSessions = Array.from(new Map(sessions.map((session) => [session.id, session])).values());
    if (!uniqueSessions.length) {
      showNotice(t("批量删除会话"), t("请先选择要删除的会话。"), "failed");
      return;
    }
    const preview = uniqueSessions
      .slice(0, 6)
      .map((session) => `- ${truncateSessionDeletePreview(session.title || session.id)}`)
      .join("\n");
    const extraCount = uniqueSessions.length > 6 ? tf("\n...以及另外 {0} 个会话", [uniqueSessions.length - 6]) : "";
    const confirmed = await confirmSessionDelete(
      t("批量删除会话"),
      tf("删除选中的 {0} 个会话？此操作会删除本地数据库记录和 rollout 文件，并为每个会话创建备份。\n\n{1}{2}", [uniqueSessions.length, preview, extraCount]),
    );
    if (!confirmed) return;

    let succeeded = 0;
    const failed: string[] = [];
    for (const session of uniqueSessions) {
      const result = await run(() => requestDeleteLocalSession(session));
      if (result && isSuccessStatus(result.status)) {
        succeeded += 1;
      } else {
        failed.push(session.title || session.id);
      }
    }

    if (failed.length) {
      showNotice(
        t("批量删除会话"),
        tf("已删除 {0} 个，失败 {1} 个：{2}", [succeeded, failed.length, failed.slice(0, 3).map(truncateSessionDeletePreview).join(t("、"))]),
        succeeded ? "ok" : "failed",
      );
    } else {
      showNotice(t("批量删除会话"), tf("已删除 {0} 个会话。", [succeeded]), "ok");
    }
    await refreshLocalSessions(true);
  };

  const refreshLiveContextEntries = async (silent = false) => {
    const result = await run(() => call<LiveContextEntriesResult>("read_live_context_entries"));
    if (result) {
      setLiveContextEntries(result.entries);
      if (!silent || !isSuccessStatus(result.status)) showResultNotice(t("工具与插件"), result, { silentSuccess: true });
    }
    return result;
  };

  const syncLiveContextEntries = async (next: BackendSettings, silent = false) => {
    const result = await run(() => call<LiveContextEntriesResult>("sync_live_context_entries", { request: { settings: next } }));
    if (result) {
      setLiveContextEntries(result.entries);
      if (!silent || !isSuccessStatus(result.status)) showResultNotice(t("工具与插件"), result, { silentSuccess: true });
    }
    return result;
  };

  const refreshLogs = async (silent = false) => {
    const result = await run(() => call<LogsResult>("read_latest_logs", { request: { lines: 240 } }));
    if (result) {
      setLogs(result);
      if (!silent) showResultNotice(t("日志已刷新"), result, { silentSuccess: true });
    }
  };

  const refreshDiagnostics = async (silent = false) => {
    const result = await run(() => call<DiagnosticsResult>("copy_diagnostics"));
    if (result) {
      setDiagnostics(result);
      if (!silent) showResultNotice(t("诊断已生成"), result, { silentSuccess: true });
    }
  };

  const refreshWatcher = async (silent = false) => {
    const result = await run(() => call<WatcherResult>("load_watcher_state"));
    if (result) {
      setWatcher(result);
      if (!silent) showResultNotice(t("Watcher 状态"), result, { silentSuccess: true });
    }
  };

  const navigate = async (next: Route) => {
    setRoute(next);
    if (next === "overview") await refreshOverview(true);
    if (next === "account") await refreshMemberProfile();
    if (next === "activity") await refreshMemberActivity();
    if (next === "community") await refreshCommunity();
    if (next === "announcements" || next === "announcementManagement") await refreshAnnouncements();
    if (next === "relay") {
      await refreshSettings(true);
      await refreshRelay(true);
      await refreshRelayFiles(true);
      await refreshEnvConflicts(true);
      await refreshCcsProviders(true);
    }
    if (next === "sessions") {
      await refreshSettings(true);
      await refreshLocalSessions(true);
      await refreshProviderSyncTargets(true);
    }
    if (next === "zedRemote") {
      await refreshSettings(true);
      await refreshZedRemoteProjects(true);
    }
    if (next === "context") {
      await refreshSettings(true);
      await refreshRelayFiles(true);
      await refreshLiveContextEntries(true);
    }
    if (next === "settings") await refreshSettings(true);
    if (next === "userScripts") {
      await refreshSkillMarket(true);
    }
    if (next === "about") {
      await refreshOverview(true);
      await refreshLogs(true);
      await refreshDiagnostics(true);
    }
    if (next === "maintenance") {
      await refreshOverview(true);
      await refreshWatcher(true);
    }
  };

  const launch = async () => {
    const result = await launchCommand("launch_codex_plus");
    if (result) {
      showNotice(t("启动任务"), result.message, result.status);
      await refreshOverview(true);
    }
  };

  const restart = async () => {
    const result = await launchCommand("restart_codex_plus");
    if (!result) return false;
    showNotice(t("重启 Codex++"), result.message, result.status);
    await refreshOverview(true);
    return isSuccessStatus(result.status);
  };

  const launchCommand = async (command: "launch_codex_plus" | "restart_codex_plus") => {
    const result = await run(() =>
      call<CommandResult<Record<string, unknown>>>(command, {
        request: {
          appPath: launchForm.appPath,
          debugPort: numberOrDefault(launchForm.debugPort, 9229),
          helperPort: numberOrDefault(launchForm.helperPort, 57321),
        },
      }),
    );
    return result;
  };

  const repairPluginMarketplace = async () => {
    if (pluginMarketplaceProgress.active) return;
    setPluginMarketplaceProgress({ active: true, percent: 8, message: t("正在检查本地插件市场…") });
    const progressTimer = window.setInterval(() => {
      setPluginMarketplaceProgress((current) => {
        if (!current.active) return current;
        const nextPercent = Math.min(92, current.percent + 9);
        const message =
          nextPercent < 28
            ? t("正在连接 openai/plugins…")
            : nextPercent < 62
              ? t("正在下载插件市场快照…")
              : nextPercent < 84
                ? t("正在解压并校验插件文件…")
                : t("正在写入 Codex 配置…");
        return { ...current, percent: nextPercent, message };
      });
    }, 500);
    try {
      const result = await run(() => call<PluginMarketplaceRepairResult>("repair_plugin_marketplace"));
      if (result) {
        setPluginMarketplaceProgress({
          active: false,
          percent: 100,
          message: result.message,
        });
        showNotice(t("插件市场修复"), result.message, result.status);
      } else {
        setPluginMarketplaceProgress({
          active: false,
          percent: 100,
          message: t("插件市场修复失败，请查看错误提示后重试。"),
        });
      }
    } finally {
      window.clearInterval(progressTimer);
    }
  };

  const refreshRemotePluginMarketplace = async (silent = false) => {
    const result = await run(() => call<RemotePluginMarketplaceResult>("remote_plugin_marketplace_status"));
    if (result) {
      setRemotePluginMarketplace(result);
      if (!silent) {
        setRemotePluginMarketplaceProgress({
          active: false,
          percent: 100,
          message: result.message,
        });
      }
      if (!silent) showNotice(t("官方远端插件缓存"), result.message, result.status);
    }
    return result;
  };

  const repairRemotePluginMarketplace = async () => {
    if (remotePluginMarketplaceProgress.active) return;
    setRemotePluginMarketplaceProgress({
      active: true,
      percent: 18,
      message: t("正在检查内置官方远端插件缓存…"),
    });
    const progressTimer = window.setInterval(() => {
      setRemotePluginMarketplaceProgress((current) => {
        if (!current.active) return current;
        const nextPercent = Math.min(92, current.percent + 18);
        const message =
          nextPercent < 50
            ? t("正在释放内置远端插件快照…")
            : nextPercent < 78
              ? t("正在注册官方远端插件市场…")
              : t("正在刷新官方远端插件缓存状态…");
        return { ...current, percent: nextPercent, message };
      });
    }, 450);
    try {
      const result = await run(() => call<RemotePluginMarketplaceResult>("repair_remote_plugin_marketplace"));
      if (result) {
        setRemotePluginMarketplace(result);
        setRemotePluginMarketplaceProgress({
          active: false,
          percent: 100,
          message: result.message,
        });
        showNotice(t("官方远端插件缓存"), result.message, result.status);
      } else {
        setRemotePluginMarketplaceProgress({
          active: false,
          percent: 100,
          message: t("官方远端插件缓存修复失败，请查看错误提示后重试。"),
        });
      }
    } finally {
      window.clearInterval(progressTimer);
    }
  };

  const installEntrypoints = async () => {
    const result = await run(() => call<InstallResult>("install_entrypoints"));
    if (result) {
      showNotice(t("入口安装"), result.message, result.status);
      await refreshOverview(true);
    }
  };

  const uninstallEntrypoints = async () => {
    const result = await run(() =>
      call<InstallResult>("uninstall_entrypoints", {
        options: { removeOwnedData },
      }),
    );
    if (result) {
      showNotice(t("入口卸载"), result.message, result.status);
      await refreshOverview(true);
    }
  };

  const repairShortcuts = async () => {
    const result = await run(() => call<InstallResult>("repair_shortcuts"));
    if (result) {
      showNotice(t("快捷方式修复"), result.message, result.status);
      await refreshOverview(true);
    }
  };

  const watcherAction = async (command: string) => {
    const result = await run(() => call<WatcherResult>(command));
    if (result) {
      setWatcher(result);
      showNotice(t("Watcher 操作"), result.message, result.status);
    }
  };

  const saveSettings = async () => {
    const next = normalizeSettings(settingsForm);
    const result = await run(() => call<SettingsResult>("save_settings", { settings: next }));
    if (result) {
      setSettings(result);
      setSettingsForm(normalizeSettings(result.settings));
      showNotice(t("设置保存"), result.message, result.status);
    }
  };

  const saveSettingsValue = async (next: BackendSettings, silent = true) => {
    const normalized = normalizeSettings(next);
    setSettingsForm(normalized);
    const result = await run(() => call<SettingsResult>("save_settings", { settings: normalized }));
    if (result) {
      setSettings(result);
      setSettingsForm(normalizeSettings(result.settings));
      if (!silent || !isSuccessStatus(result.status)) showNotice(t("设置保存"), result.message, result.status);
    }
    return !!result && isSuccessStatus(result.status);
  };

  const resetSettings = async () => {
    const result = await run(() => call<SettingsResult>("reset_settings"));
    if (result) {
      setSettings(result);
      setSettingsForm(normalizeSettings(result.settings));
      showNotice(t("设置重置"), result.message, result.status);
    }
  };

  const resetImageOverlaySettings = async () => {
    const result = await run(() => call<SettingsResult>("reset_image_overlay_settings"));
    if (result) {
      setSettings(result);
      setSettingsForm(normalizeSettings(result.settings));
      showNotice(t("图片覆盖层"), result.message, result.status);
    }
  };

  const refreshProviderSyncTargets = async (silent = false) => {
    const result = await run(() => call<ProviderSyncTargetsResult>("load_provider_sync_targets"));
    if (result) {
      setProviderSyncTargets(result);
      const targets = result.targets ?? [];
      const saved = settingsForm.providerSyncLastSelectedProvider;
      const preferred =
        targets.find((target) => target.id === saved)?.id ||
        targets.find((target) => target.isCurrentProvider)?.id ||
        targets[0]?.id ||
        "openai";
      setSelectedProviderSyncTarget((current) => (targets.some((target) => target.id === current) ? current : preferred));
      if (!silent && !isSuccessStatus(result.status)) showNotice(t("Provider 同步目标"), result.message, result.status);
    }
    return result;
  };

  const syncProvidersNow = async () => {
    if (providerSyncProgress.active) return;
    setProviderSyncProgress({
      active: true,
      percent: 12,
      message: selectedProviderSyncTarget ? tf("正在同步到 {0}…", [selectedProviderSyncTarget]) : t("正在扫描历史会话与索引…"),
      result: null,
    });
    const progressTimer = window.setInterval(() => {
      setProviderSyncProgress((current) => {
        if (!current.active) return current;
        return {
          ...current,
          percent: Math.min(88, current.percent + 8),
          message: current.percent < 40 ? t("正在检查会话 provider 标记…") : t("正在写入修复与备份…"),
        };
      });
    }, 350);
    try {
      const targetProvider = selectedProviderSyncTarget || undefined;
      const result = await run(() =>
        call<CommandResult<ProviderSyncPayload>>("sync_providers_now", { targetProvider }),
      );
      if (result) {
        setProviderSyncProgress({
          active: false,
          percent: 100,
          message: providerSyncProgressMessage(result),
          result,
        });
        if (targetProvider) {
          const next = {
            ...settingsForm,
            providerSyncLastSelectedProvider: targetProvider,
            providerSyncSavedProviders: Array.from(
              new Set([...(settingsForm.providerSyncSavedProviders ?? []), targetProvider]),
            ).sort(),
          };
          setSettingsForm(next);
        }
        await refreshProviderSyncTargets(true);
        showNotice(t("历史会话修复"), result.message, result.status);
      } else {
        setProviderSyncProgress({
          active: false,
          percent: 100,
          message: t("历史会话修复失败，请查看错误提示后重试。"),
          result: null,
        });
      }
    } finally {
      window.clearInterval(progressTimer);
    }
  };

  const applyRelayInjection = async (silent = false) => {
    const settingsResult = await run(() => call<SettingsResult>("save_settings", { settings: settingsForm }));
    if (settingsResult) {
      setSettings(settingsResult);
      setSettingsForm(normalizeSettings(settingsResult.settings));
      if (!isSuccessStatus(settingsResult.status)) {
        showNotice(t("设置保存"), settingsResult.message, settingsResult.status);
        return false;
      }
    } else {
      return false;
    }
    const result = await run(() => call<RelayResult>("apply_relay_injection"));
    if (result) {
      setRelay(result);
      await refreshRelayFiles(true);
      if (!silent || !isSuccessStatus(result.status)) showNotice(t("官方混入 API Key"), result.message, result.status);
    }
    return !!result && isSuccessStatus(result.status) && result.configured;
  };

  const saveLaunchMode = async (launchMode: LaunchMode, silent = false, baseSettings: BackendSettings = settingsForm) => {
    const next = { ...baseSettings, launchMode };
    setSettingsForm(next);
    const result = await run(() => call<SettingsResult>("save_settings", { settings: next }));
    if (result) {
      setSettings(result);
      setSettingsForm(normalizeSettings(result.settings));
      if (!silent) showNotice(t("Codex增强模式"), result.message, result.status);
    }
    return result;
  };

  const applyPureApiInjection = async (silent = false) => {
    const settingsResult = await run(() => call<SettingsResult>("save_settings", { settings: settingsForm }));
    if (settingsResult) {
      setSettings(settingsResult);
      setSettingsForm(normalizeSettings(settingsResult.settings));
      if (!isSuccessStatus(settingsResult.status)) {
        showNotice(t("设置保存"), settingsResult.message, settingsResult.status);
        return false;
      }
    } else {
      return false;
    }
    const result = await run(() => call<RelayResult>("apply_pure_api_injection"));
    if (result) {
      setRelay(result);
      await refreshRelayFiles(true);
      if (!silent || !isSuccessStatus(result.status)) showNotice(t("纯 API 模式"), result.message, result.status);
    }
    return !!result && isSuccessStatus(result.status) && result.configured;
  };

  const clearRelayInjection = async (silent = false) => {
    const result = await run(() => call<RelayResult>("clear_relay_injection"));
    if (result) {
      setRelay(result);
      await refreshRelayFiles(true);
      if (!silent || !isSuccessStatus(result.status)) showNotice(t("官方登录模式"), result.message, result.status);
    }
    return !!result && isSuccessStatus(result.status) && !result.configured;
  };

  const saveRelayFile = async (kind: "config" | "auth", contents: string, silent = false) => {
    const result = await run(() => call<RelayFilesResult>("save_relay_file", { request: { kind, contents } }));
    if (result) {
      setRelayFiles(result);
      if (!silent || !isSuccessStatus(result.status)) {
        showNotice(kind === "config" ? "config.toml" : "auth.json", result.message, result.status);
      }
      await refreshRelay(true);
    }
  };

  const upsertContextEntry = async (next: BackendSettings, kind: ContextKind, id: string, tomlBody: string) => {
    const result = await run(() =>
      call<ContextEntriesResult>("upsert_context_entry", {
        request: { settings: next, kind, id, tomlBody },
      }),
    );
    if (!result) return null;
    let normalized = normalizeSettings(result.settings);
    const saveResult = await run(() => call<SettingsResult>("save_settings", { settings: normalized }));
    if (saveResult) {
      setSettings(saveResult);
      normalized = normalizeSettings(saveResult.settings);
    }
    setSettingsForm(normalized);
    if (!isSuccessStatus(result.status)) showResultNotice(t("工具与插件"), result);
    return normalized;
  };

  const deleteContextEntry = async (next: BackendSettings, kind: ContextKind, id: string) => {
    const result = await run(() =>
      call<ContextEntriesResult>("delete_context_entry", {
        request: { settings: next, kind, id },
      }),
    );
    if (!result) return null;
    let normalized = normalizeSettings(result.settings);
    const saveResult = await run(() => call<SettingsResult>("save_settings", { settings: normalized }));
    if (saveResult) {
      setSettings(saveResult);
      normalized = normalizeSettings(saveResult.settings);
    }
    setSettingsForm(normalized);
    if (!isSuccessStatus(result.status)) showResultNotice(t("工具与插件"), result);
    return normalized;
  };

  const extractRelayCommonConfig = async (configContents: string) => {
    const result = await run(() =>
      call<ExtractRelayCommonConfigResult>("extract_relay_common_config", {
        request: { configContents },
      }),
    );
    if (result) showResultNotice(t("通用配置文件"), result);
    return result && isSuccessStatus(result.status) ? result : null;
  };

  const testRelayProfile = async (profile: RelayProfile) => {
    const result = await run(() => call<RelayProfileTestResult>("test_relay_profile", { profile }));
    if (result) showNotice(t("供应商测试"), result.message, result.status);
  };

  const diagnoseRelayProfile = async (profile: RelayProfile) => {
    const result = await run(() => call<ProviderDoctorResult>("diagnose_relay_profile", { profile }));
    if (result) showNotice("Provider Doctor", result.message, result.status);
    return result ?? null;
  };

  const syncRelayTokens = async (silent = false, credentials?: { username: string; password: string }) => {
    if (relayTokenSyncing) return null;
    setRelayTokenSyncing(true);
    try {
      const result = await run(() => call<RelayTokenSyncResult>("sync_relay_tokens", credentials));
      if (result) {
        setRelayTokenSync((current) => isSuccessStatus(result.status) ? result : current ?? result);
        if (!silent) showNotice("中转站令牌", result.message, result.status);
      }
      return result ?? null;
    } finally {
      setRelayTokenSyncing(false);
    }
  };

  const applyRelayToken = async (accountId: string, tokenId: string) => {
    const result = await run(() => call<RelayTokenApplyResult>("apply_relay_token", { accountId, tokenId }));
    if (!result) return;
    showNotice("中转站令牌", result.message, result.status);
    if (isSuccessStatus(result.status)) {
      await refreshSettings(true);
      await refreshRelay(true);
      await refreshRelayFiles(true);
    }
  };

  const testRelayTokenConnection = async (accountId: string, tokenId: string) => {
    const result = await run(() => call<RelayTokenConnectionResult>("test_relay_token_connection", { accountId, tokenId }));
    if (result) showNotice("中转站连接", result.message, result.status);
    return result ?? null;
  };

  const applyWorkbuddyRelayConfig = async () => {
    if (workbuddyConfiguring) return null;
    setWorkbuddyConfiguring(true);
    try {
      const result = await run(() => call<WorkbuddyConfigResult>("apply_workbuddy_relay_config"));
      if (result) showNotice("WorkBuddy 一键配置", result.message, result.status);
      return result ?? null;
    } finally {
      setWorkbuddyConfiguring(false);
    }
  };

  const testStepwiseSettings = async (settings: BackendSettings) => {
    const result = await run(() => call<StepwiseTestResult>("test_stepwise_settings", { settings }));
    if (result) showNotice("Stepwise 测试", result.message, result.status);
  };

  const fetchRelayProfileModels = async (profile: RelayProfile) => {
    const result = await run(() => call<RelayProfileModelsResult>("fetch_relay_profile_models", { profile }));
    if (result) showNotice(t("模型列表"), result.message, result.status);
    return result && isSuccessStatus(result.status) ? result.models : null;
  };

  const switchOfficialMode = async () => {
    const switched = await clearRelayInjection(true);
    if (!switched) return;
    const result = await saveLaunchMode("relay", true);
    if (result) showNotice(t("官方登录模式"), t("已切回官方登录；Codex增强已设为兼容增强。"), result.status);
  };

  const switchPureApiMode = async () => {
    const switched = await applyPureApiInjection(true);
    if (!switched) return;
    const result = await saveLaunchMode("patch", true);
    if (result) showNotice(t("纯 API 模式"), t("已切换到纯 API；Codex增强已设为完整增强。"), result.status);
  };

  const switchRelayProfile = async (next: BackendSettings, previousActiveRelayId = settingsForm.activeRelayId) => {
    if (relaySwitching) {
      showNotice(t("供应商切换中"), t("上一次切换还没有完成，请稍后再试。"), "failed");
      return;
    }
    let switchSettings = normalizeSettings(next);
    if (!switchSettings.relayProfilesEnabled) {
      showNotice(t("供应商配置已关闭"), t("当前不会写入 Codex config.toml / auth.json。打开供应商配置总开关后再切换。"), "failed");
      return;
    }
    const targetBeforeSnapshot = activeRelayProfile(switchSettings);
    logDiagnostic("switchRelayProfile.start", {
      currentRelayId: settingsForm.activeRelayId,
      targetRelayId: switchSettings.activeRelayId,
      targetRelayName: targetBeforeSnapshot.name,
      targetRelayMode: targetBeforeSnapshot.relayMode,
    });
    const selectedBeforeSave = activeRelayProfile(switchSettings);
    const validationError = relayProfileSwitchValidation(selectedBeforeSave);
    if (validationError) {
      logDiagnostic("switchRelayProfile.validation_failed", {
        targetRelayId: selectedBeforeSave.id,
        targetRelayName: selectedBeforeSave.name,
        error: validationError,
      });
      showNotice(t("供应商配置可能不正确"), validationError, "failed");
      return;
    }
    switchSettings = await snapshotActiveRelayFilesBeforeSwitch(switchSettings, previousActiveRelayId);
    const selectedAfterSave = activeRelayProfile(switchSettings);
    const command = relayProfileSwitchCommand(selectedAfterSave);

    logDiagnostic("switchRelayProfile.apply_start", {
      targetRelayId: selectedAfterSave.id,
      targetRelayName: selectedAfterSave.name,
      previousActiveRelayId,
      command,
    });
    setRelaySwitching(true);
    try {
      const result = await run(() =>
        call<RelaySwitchResult>("switch_relay_profile", {
          request: { settings: switchSettings, previousActiveRelayId },
        }),
      );
      if (!result) {
        logDiagnostic("switchRelayProfile.apply_no_result", {
          targetRelayId: selectedAfterSave.id,
        });
        return;
      }
      const selectedSettings = normalizeSettings(result.settings);
      setSettings({
        status: result.status,
        message: result.message,
        settings: selectedSettings,
        settings_path: result.settingsPath,
        user_scripts: result.user_scripts as UserScriptInventory,
      });
      setSettingsForm(selectedSettings);
      setRelay({
        status: result.status,
        message: result.message,
        ...result.relay,
      });
      await refreshRelayFiles(true);
      if (!isSuccessStatus(result.status)) {
        logDiagnostic("switchRelayProfile.apply_failed", {
          targetRelayId: selectedAfterSave.id,
          status: result.status,
          message: result.message,
          activeRelayId: selectedSettings.activeRelayId,
        });
        showNotice(t("供应商切换"), result.message, result.status);
        return;
      }
      const currentSelected = activeRelayProfile(selectedSettings);
      logDiagnostic("switchRelayProfile.ok", {
        targetRelayId: currentSelected.id,
        launchMode: selectedSettings.launchMode,
        status: result.status,
      });
      showNotice(t("供应商切换"), relayProfileModeSwitchedText(currentSelected), result.status);
    } finally {
      setRelaySwitching(false);
    }
  };

  const snapshotActiveRelayFilesBeforeSwitch = async (
    next: BackendSettings,
    previousActiveRelayId: string,
  ): Promise<BackendSettings> => {
    const profileId = previousActiveRelayId.trim();
    if (!profileId) return next;
    const result = await run(() =>
      call<SettingsBackfillResult>("backfill_relay_profile_from_live", {
        request: { settings: next, profileId },
      }),
    );
    if (!result) return next;
    const normalized = normalizeSettings(result.settings);
    if (!isSuccessStatus(result.status)) {
      showNotice(t("供应商切换"), result.message, result.status);
      return next;
    }
    return normalized;
  };

  const copyText = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      showNotice(t("复制失败"), stringifyError(error), "failed");
    }
  };

  const openExternalUrl = async (url: string) => {
    const result = await run(() => call<CommandResult<Record<string, unknown>>>("open_external_url", { url }));
    if (result) {
      showResultNotice(t("打开链接"), result, { silentSuccess: true });
    }
  };

  const saveVisualThemeSettings = async (
    enabled: boolean,
    themeId: string,
    serviceUrl: string,
    silent = true,
  ) => {
    const result = await run(() => call<SettingsResult>("save_visual_theme_settings", {
      enabled,
      themeId,
      serviceUrl,
    }));
    if (result) {
      setSettings(result);
      setSettingsForm(normalizeSettings(result.settings));
      if (!silent || !isSuccessStatus(result.status)) showNotice(t("设置保存"), result.message, result.status);
    }
    return !!result && isSuccessStatus(result.status);
  };

  const openMemberActivityPortal = async () => {
    const accessToken = memberAccessToken.trim();
    if (!accessToken) {
      showNotice("需要登录", "请先登录 ♛Codework AI 官方账号，再进入活动官网。", "failed");
      return;
    }
    const result = await run(() => call<MemberPortalLinkResult>("client_portal_link", { accessToken }));
    if (!result || !isSuccessStatus(result.status)) {
      showResultNotice("活动官网", result ?? { status: "failed", message: "活动登录跳转暂时不可用。" });
      return;
    }
    await openExternalUrl(result.portalUrl);
  };

  const showNotice = (title: string, message: string, status?: Status) => {
    setNotice({ title, message: t(message), status });
  };

  const exitManagerApp = async () => {
    await call<void>("manager_exit_app");
  };

  const hideManagerToTray = async () => {
    await call<void>("manager_hide_to_tray");
  };

  const showResultNotice = (
    title: string,
    result: Pick<CommandResult<unknown>, "message" | "status">,
    options: { silentSuccess?: boolean } = {},
  ) => {
    if (options.silentSuccess && isSuccessStatus(result.status)) return;
    showNotice(title, result.message, result.status);
  };

  useEffect(() => {
    void (async () => {
      await refreshOverview(true);
      await refreshSettings(true);
      await refreshRelay(true);
      await refreshEnvConflicts(true);
      await refreshProviderSyncTargets(true);
      await refreshPendingProviderImport(true);
      await refreshRemotePluginMarketplace(true);
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let session = await call<MemberSessionResult>("load_member_session");
        const legacyAccessToken = window.localStorage.getItem(MEMBER_ACCESS_TOKEN_KEY)?.trim() ?? "";
        const legacyCredentials = readRememberedMemberCredentials(
          window.localStorage.getItem(MEMBER_REMEMBERED_CREDENTIALS_KEY),
        );
        window.localStorage.removeItem(MEMBER_ACCESS_TOKEN_KEY);
        window.localStorage.removeItem(MEMBER_REMEMBERED_CREDENTIALS_KEY);

        if ((!isSuccessStatus(session.status) || !session.accessToken.trim()) && legacyAccessToken) {
          session = await call<MemberSessionResult>("save_member_session", {
            accessToken: legacyAccessToken,
            username: legacyCredentials?.username ?? "legacy-member",
            password: legacyCredentials?.password ?? "",
            rememberPassword: Boolean(legacyCredentials),
          });
        }
        if (cancelled) return;

        const accessToken = isSuccessStatus(session.status) ? session.accessToken.trim() : "";
        setMemberAccessToken(accessToken);
        setMemberRememberedUsername(session.username || legacyCredentials?.username || "");
        setMemberRememberedPassword(session.password || legacyCredentials?.password || "");
        setMemberRememberPassword(session.rememberPassword || Boolean(legacyCredentials));
        if (accessToken) {
          const cachedRelayTokens = await call<RelayTokenSyncResult>("load_cached_relay_tokens");
          if (!cancelled && isSuccessStatus(cachedRelayTokens.status) && cachedRelayTokens.tokens.length) {
            setRelayTokenSync(cachedRelayTokens);
          }
          await refreshMemberProfile(accessToken);
          if (session.rememberPassword) void syncRelayTokens(true);
        }
      } catch (error) {
        if (!cancelled) showNotice("账户安全", stringifyError(error), "failed");
      } finally {
        if (!cancelled) setMemberGateReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!memberAccessToken.trim() || !memberRememberPassword) return;
    const timer = window.setInterval(() => void syncRelayTokens(true), 10 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [memberAccessToken, memberRememberPassword]);

  useEffect(() => {
    chatPresenceRef.current = chatSelfStatus;
  }, [chatSelfStatus]);

  useEffect(() => {
    if (!memberLoginApproved) return;
    void refreshPrivateFriends();
    const timer = window.setInterval(() => void refreshPrivateFriends(), 8000);
    return () => window.clearInterval(timer);
  }, [memberAccessToken, memberLoginApproved]);

  useEffect(() => {
    void refreshAnnouncements();
    const timer = window.setInterval(() => void refreshAnnouncements(), 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [memberAccessToken]);

  useEffect(() => {
    if (getLanguage() === "en") {
      void invoke("update_tray_labels", {
        showLabel: "Show window",
        quitLabel: "Quit",
        windowTitle: "Codex++ Manager",
      });
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshPendingProviderImport(true);
    }, 1200);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
    window.localStorage.setItem("codex-plus-theme", theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(CLIENT_SKIN_STORAGE_KEY, clientSkin);
  }, [clientSkin]);

  const saveCodexAppPath = async (appPath: string) => {
    const next = { ...settingsForm, codexAppPath: appPath };
    const result = await run(() => call<SettingsResult>("save_settings", { settings: next }));
    if (result) {
      setSettings(result);
      const normalized = normalizeSettings(result.settings);
      setSettingsForm(normalized);
      setLaunchForm((current) => ({ ...current, appPath: normalized.codexAppPath }));
      await refreshOverview(true);
    }
    return result;
  };

  const actions = useMemo(
    () => ({
      refreshCurrent: () => navigate(route),
      launch,
      restart,
      repairPluginMarketplace,
      refreshRemotePluginMarketplace,
      repairRemotePluginMarketplace,
      installEntrypoints,
      uninstallEntrypoints,
      repairShortcuts,
      saveSettings,
      saveSettingsValue,
      saveVisualThemeSettings,
      refreshSettings,
      resetSettings,
      resetImageOverlaySettings,
      chooseCodexAppPath: async (mode: "folder" | "file") => {
        let selected: unknown;
        try {
          selected = await open(
            mode === "folder"
              ? { directory: true, multiple: false, title: t("选择 Codex 应用目录") }
              : {
                  directory: false,
                  multiple: false,
                  title: t("选择 Codex.exe 或 Codex.app"),
                  filters: [{ name: t("Codex 应用"), extensions: ["exe", "app"] }],
                },
          );
        } catch (error) {
          // Surface plugin failures (e.g. missing capability permission) so the
          // buttons no longer appear unresponsive — see #345.
          const message = error instanceof Error ? error.message : String(error);
          showNotice(t("Codex 应用路径"), tf("打开选择器失败：{0}", [message]), "failed");
          return;
        }
        if (typeof selected === "string" && selected.trim()) {
          const result = await saveCodexAppPath(selected.trim());
          if (result) {
            showNotice(t("Codex 应用路径"), t("应用路径已保存，之后启动会自动复用。"), result.status);
          }
        }
      },
      clearCodexAppPath: async () => {
        const next = { ...settingsForm, codexAppPath: "" };
        const result = await run(() => call<SettingsResult>("save_settings", { settings: next }));
        if (result) {
          setSettings(result);
          setSettingsForm(normalizeSettings(result.settings));
          setLaunchForm((current) => ({ ...current, appPath: "" }));
          showNotice(t("Codex 应用路径"), t("已清除保存路径，后续启动会回到自动探测。"), result.status);
          await refreshOverview(true);
        }
      },
      chooseImageOverlayPath: async () => {
        let selected: unknown;
        try {
          selected = await open({
            directory: false,
            multiple: false,
            title: t("选择覆盖图片"),
            filters: [{ name: t("图片"), extensions: ["png", "jpg", "jpeg", "webp"] }],
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          showNotice(t("图片覆盖层"), tf("打开选择器失败：{0}", [message]), "failed");
          return;
        }
        if (typeof selected === "string" && selected.trim()) {
          setSettingsForm((current) => ({
            ...current,
            codexAppImageOverlayEnabled: true,
            codexAppImageOverlayPath: selected.trim(),
          }));
        }
      },
      saveManualCodexAppPath: async () => {
        const appPath = launchForm.appPath.trim();
        if (!appPath) {
          showNotice(t("Codex 应用路径"), t("请先填写或选择应用路径。"), "failed");
          return;
        }
        const result = await saveCodexAppPath(appPath);
        if (result) {
          showNotice(t("Codex 应用路径"), t("应用路径已保存，之后启动会自动复用。"), result.status);
        }
      },
      syncProvidersNow,
      refreshProviderSyncTargets,
      setProviderSyncTarget: (provider: string) => {
        setSelectedProviderSyncTarget(provider);
        setSettingsForm((current) => ({ ...current, providerSyncLastSelectedProvider: provider }));
      },
      setLaunchMode: async (launchMode: LaunchMode) => {
        await saveLaunchMode(launchMode);
      },
      refreshRelay,
      refreshRelayFiles,
      refreshEnvConflicts,
      removeEnvConflicts,
      refreshCcsProviders,
      importCcsProviders,
      refreshLiveContextEntries,
      syncLiveContextEntries,
      refreshSkillMarket,
      installMarketSkill,
      setUserScriptEnabled,
      deleteUserScript,
      refreshLocalSessions,
      deleteLocalSession,
      deleteLocalSessions,
      refreshZedRemoteProjects,
      openZedRemoteProject,
      forgetZedRemoteProject,
      openExternalUrl,
      applyRelayInjection,
      applyPureApiInjection,
      clearRelayInjection,
      saveRelayFile,
      upsertContextEntry,
      deleteContextEntry,
      extractRelayCommonConfig,
      testRelayProfile,
      diagnoseRelayProfile,
      testStepwiseSettings,
      fetchRelayProfileModels,
      switchRelayProfile,
      relaySwitching,
      switchOfficialMode,
      switchPureApiMode,
      refreshLogs,
      refreshDiagnostics,
      showMessage: async (title: string, message: string, status?: Status) => showNotice(title, message, status),
      copyLogs: () => copyText(logs?.text ?? "", t("日志已复制。")),
      copyDiagnostics: () => copyText(diagnostics?.report ?? "", t("诊断报告已复制。")),
      goLogs: () => navigate("about"),
      checkHealth: async () => {
        await refreshOverview(true);
        await refreshRelay(true);
        await refreshWatcher(true);
        await refreshDiagnostics(true);
        await checkCodeworkRelease();
        showNotice(t("检查完成"), t("已刷新 Codex 应用、入口和 Watcher 状态。"), "ok");
      },
      installWatcher: () => watcherAction("install_watcher"),
      uninstallWatcher: () => watcherAction("uninstall_watcher"),
      enableWatcher: () => watcherAction("enable_watcher"),
      disableWatcher: () => watcherAction("disable_watcher"),
      toggleTheme: () => setTheme((current) => (current === "dark" ? "light" : "dark")),
    }),
    [route, launchForm, settingsForm, settings, removeOwnedData, logs, diagnostics, theme, relayFiles, localSessions, zedRemoteProjects, selectedProviderSyncTarget, envConflicts, ccsProviders],
  );

  return (
    <div className={`shell ${theme}`} data-client-skin={clientSkin} style={clientSkinVariables(clientSkin) as CSSProperties}>
      <aside className="sidebar">
        <div className="brand">
          <div className={`brand-mark ${activeMemberIdentity?.tone ?? "guest"}`}><Crown aria-label="Codework 身份皇冠" className="brand-crown" /></div>
          <div className="brand-copy">
            <div className="brand-title-row">
              <div className="brand-title">{CODEWORK_PRODUCT_NAME}</div>
            </div>
            <div className="brand-subtitle">{t("管理控制台")}</div>
          </div>
        </div>
        <nav className="nav">
          {navigationGroups.map((group) => {
            const expanded = navigationGroupExpanded(group.expanded, group.id, collapsedNavigationGroups);
            return (
              <section className={`nav-group ${expanded ? "expanded" : "collapsed"}`} key={group.id}>
                <button
                  aria-expanded={expanded}
                  className="nav-group-toggle"
                  onClick={() => setCollapsedNavigationGroups((current) =>
                    toggleNavigationGroup(group.expanded, group.id, current),
                  )}
                  type="button"
                >
                  <span>{group.label}</span><span aria-hidden="true">{expanded ? "⌄" : "›"}</span>
                </button>
                {expanded ? group.items.map((item) => {
                  const routeItem = routes.find((candidate) => candidate.id === item.id);
                  if (!routeItem) return null;
                  const Icon = routeItem.icon;
                  const updateBadge = routeItem.id === "updates" ? (availableRelease ? `NEW ${availableRelease.latestVersion}` : releaseResult?.currentVersion ?? overview?.current_version ?? "") : routeItem.badge;
                  return (
                    <button
                      className={`nav-item ${route === routeItem.id ? "active" : ""}`}
                      key={routeItem.id}
                      onClick={() => void navigate(routeItem.id)}
                      title={routeItem.label}
                      type="button"
                    >
                      <span className="nav-icon"><Icon className="h-4 w-4" aria-hidden="true" /></span>
                      <span className="nav-label">{routeItem.label}</span>
                      {routeItem.id === "announcements" && unreadAnnouncementCount ? <span className="nav-update-dot announcement-unread-dot" aria-label="有未读公告" /> : null}
                      {routeItem.id === "updates" && availableRelease ? <span className="nav-update-dot" aria-label="发现新版本" /> : null}
                      {updateBadge ? <span className={`nav-badge ${routeItem.id === "updates" && availableRelease ? "update-available" : ""}`}>{updateBadge}</span> : null}
                    </button>
                  );
                }) : null}
              </section>
            );
          })}
        </nav>
        <div className="client-skin-switcher" aria-label="客户端皮肤">
          <span>客户端皮肤</span>
          <div>
            <button className={clientSkin === "blue" ? "active blue" : "blue"} onClick={() => setClientSkin("blue")} type="button">蓝</button>
            <button className={clientSkin === "pink" ? "active pink" : "pink"} onClick={() => setClientSkin("pink")} type="button">粉</button>
          </div>
        </div>
        <div className="sidebar-copyright">© 2026 Xiaoshuai</div>
      </aside>
      <main className="workspace">
        <header className="topbar" key={`topbar-${route}`}>
          <div>
            <h1>{routeTitle(route)}</h1>
            <p>{routeSubtitle(route)}</p>
          </div>
          <div className="topbar-actions">
            <div className="notification-center">
              <Button
                aria-expanded={notificationCenterOpen}
                onClick={() => setNotificationCenterOpen((open) => !open)}
                size="icon"
                title="通知中心"
                variant="outline"
              >
                <Bell className="h-4 w-4" />
                {workspaceNotifications.length ? <span className="notification-count">{workspaceNotifications.length}</span> : null}
              </Button>
              {notificationCenterOpen ? (
                <section className="notification-popover" aria-label="通知中心">
                  <div><strong>通知中心</strong><span>{workspaceNotifications.length ? "需要关注的事项" : "暂时没有需要处理的提醒"}</span></div>
                  {workspaceNotifications.length ? workspaceNotifications.map((item) => (
                    <button
                      className="notification-entry"
                      key={item.id}
                      onClick={() => {
                        if (item.id === "announcements" && latestAnnouncement) markAnnouncementRead(latestAnnouncement);
                        setNotificationCenterOpen(false);
                        void navigate(item.route as Route);
                      }}
                      type="button"
                    >
                      <strong>{item.title}</strong><span>{item.detail}</span>
                    </button>
                  )) : <p className="notification-empty">新版本、公告和未读私聊会集中显示在这里。</p>}
                </section>
              ) : null}
            </div>
            <Button
              onClick={() => toggleLanguage()}
              size="icon"
              title={getLanguage() === "en" ? t("切换到中文") : t("切换到英文")}
              variant="outline"
            >
              <Languages className="h-4 w-4" />
            </Button>
            <Button
              onClick={actions.toggleTheme}
              size="icon"
              title={theme === "dark" ? t("切换到浅色") : t("切换到深色")}
              variant="outline"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <button className={`member-badge ${memberProfile?.activeRole ?? "guest"}`} onClick={() => void navigate("account")} type="button">
              <Crown className="h-4 w-4" aria-hidden="true" />
              <span>{memberProfile ? `${memberProfile.username} · ${activeMemberIdentity?.label}` : "会员登录"}</span>
            </button>
            <Button onClick={() => void actions.restart()} title={t("重启 Codex++")} variant="outline">
              <Rocket className="h-4 w-4" />
              {t("重启 Codex++")}
            </Button>
            <Button onClick={() => void actions.refreshCurrent()} size="icon" title={t("刷新当前页面")} variant="outline">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </header>
        {showWorkspaceUpdateNotice && availableRelease ? (
          <section className="workspace-update-notice" aria-label="客户端更新提醒">
            <div className="workspace-update-icon"><Download className="h-5 w-5" aria-hidden="true" /></div>
            <div className="workspace-update-copy">
              <strong>发现新版本 {availableRelease.latestVersion}</strong>
              <span>现可立即更新，更新后将保留本机配置。</span>
            </div>
            <div className="workspace-update-actions">
              <Button onClick={() => void navigate("updates")}><Download className="h-4 w-4" />立即查看</Button>
              <button className="workspace-update-dismiss" onClick={() => setDismissedUpdateVersion(availableRelease.latestVersion)} type="button">稍后提醒</button>
            </div>
          </section>
        ) : null}
        {latestAnnouncement ? (
          <section className={`workspace-announcement ${latestAnnouncement.priority}`} aria-label="客户端公告">
            <Bell className="h-4 w-4" aria-hidden="true" />
            <div><strong>{latestAnnouncement.title}</strong><span>{latestAnnouncement.body}</span></div>
            <Button onClick={() => { markAnnouncementRead(latestAnnouncement); void navigate("announcements"); }} size="sm" variant="outline">查看</Button>
            <button className="workspace-update-dismiss" onClick={() => setDismissedAnnouncementIds((current) => new Set(current).add(latestAnnouncement.id))} type="button">稍后</button>
          </section>
        ) : null}
        <section className="screen" key={route}>
          {route === "overview" ? (
            <OverviewScreen
              overview={overview}
              pluginMarketplaceProgress={pluginMarketplaceProgress}
              actions={actions}
            />
          ) : null}
          {route === "account" ? (
            <MemberAccountScreen
              profile={memberProfile}
              onLogin={loginMember}
              onLogout={logoutMember}
              onRefresh={refreshMemberProfile}
              onChangeActiveRole={changeMemberRole}
              onSearchThemeGrantMember={searchThemeGrantMember}
              onSaveThemeGrant={saveThemeGrant}
            />
          ) : null}
          {route === "activity" ? <ActivityCenterScreen activity={memberActivity} onOpenPortal={openMemberActivityPortal} onRefresh={refreshMemberActivity} /> : null}
          {route === "community" ? <CommunityScreen community={community} profile={memberProfile} draft={communityDraft} onDraftChange={setCommunityDraft} onPublish={publishCommunityComment} onDelete={removeCommunityComment} onLike={toggleCommunityLike} onReply={replyCommunityComment} onRefresh={refreshCommunity} /> : null}
          {route === "announcements" ? <AnnouncementCenterScreen feed={announcementFeed} onRead={markAnnouncementRead} onRefresh={refreshAnnouncements} /> : null}
          {route === "announcementManagement" && announcementFeed?.canManage ? <AnnouncementManagementScreen draft={announcementDraft} editingId={editingAnnouncementId} feed={announcementFeed} onDraftChange={setAnnouncementDraft} onEdit={editAnnouncement} onPublish={saveAnnouncement} onWithdraw={withdrawAnnouncement} /> : null}
          {route === "updates" ? <ReleaseNotesScreen lastCheckedAt={releaseLastCheckedAt} release={releaseResult} progress={releaseProgress} onCheck={checkCodeworkRelease} onInstall={installCodeworkRelease} /> : null}
          {route === "downloadChatGpt" ? <OfficialChatGptScreen result={chatGptResult} progress={chatGptProgress} onRefresh={refreshChatGptStatus} onInstall={installOfficialChatGpt} /> : null}
          {route === "relay" ? (
            <RelayScreen
              settings={settings}
              relayFiles={relayFiles}
              envConflicts={envConflicts}
              ccsProviders={ccsProviders}
              relayTokenSync={relayTokenSync}
              relayTokenSyncing={relayTokenSyncing}
              workbuddyConfiguring={workbuddyConfiguring}
              onApplyWorkbuddyConfig={applyWorkbuddyRelayConfig}
              memberLoggedIn={Boolean(memberAccessToken.trim())}
              activeProfileId={settings?.settings.activeRelayId || ""}
              onSyncRelayTokens={syncRelayTokens}
              onApplyRelayToken={applyRelayToken}
              onTestRelayToken={testRelayTokenConnection}
              form={settingsForm}
              onFormChange={setSettingsForm}
              actions={actions}
            />
          ) : null}
          {route === "sessions" ? (
            <SessionsScreen
              settings={settings}
              form={settingsForm}
              sessions={localSessions}
              providerSyncProgress={providerSyncProgress}
              providerSyncTargets={providerSyncTargets}
              selectedProviderSyncTarget={selectedProviderSyncTarget}
              onFormChange={setSettingsForm}
              actions={actions}
            />
          ) : null}
          {route === "context" ? (
            <ContextScreen
              form={settingsForm}
              liveEntries={liveContextEntries}
              relayFiles={relayFiles}
              onFormChange={setSettingsForm}
              actions={actions}
            />
          ) : null}
          {route === "enhance" ? (
            <EnhanceScreen
              form={settingsForm}
              pluginMarketplaceProgress={pluginMarketplaceProgress}
              remotePluginMarketplace={remotePluginMarketplace}
              remotePluginMarketplaceProgress={remotePluginMarketplaceProgress}
              onFormChange={setSettingsForm}
              actions={actions}
            />
          ) : null}
          {route === "visualTheme" ? <VisualThemeScreen form={settingsForm} onFormChange={setSettingsForm} actions={actions} /> : null}
          {route === "zedRemote" ? (
            <ZedRemoteScreen projects={zedRemoteProjects} form={settingsForm} onFormChange={setSettingsForm} actions={actions} />
          ) : null}
          {route === "userScripts" ? <UserScriptsScreen market={skillMarket} actions={actions} /> : null}
          {route === "maintenance" ? (
            <MaintenanceScreen
              overview={overview}
              watcher={watcher}
              settings={settings}
              launchForm={launchForm}
              onLaunchFormChange={setLaunchForm}
              removeOwnedData={removeOwnedData}
              onRemoveOwnedDataChange={setRemoveOwnedData}
              actions={actions}
            />
          ) : null}
          {route === "about" ? (
            <AboutScreen
              overview={overview}
              logs={logs}
              diagnostics={diagnostics}
              actions={actions}
            />
          ) : null}
          {route === "settings" ? (
            <SettingsScreen settings={settings} theme={theme} form={settingsForm} onFormChange={setSettingsForm} actions={actions} />
          ) : null}
        </section>
      </main>
      {notice ? (
        <NoticeDialog
          key={`${notice.title}-${notice.message}-${notice.status ?? ""}`}
          notice={notice}
          onClose={() => setNotice(null)}
        />
      ) : null}
      {confirmDialog ? (
        <ConfirmDialog
          confirm={confirmDialog}
          onCancel={() => {
            confirmDialog.resolve(false);
            setConfirmDialog(null);
          }}
          onConfirm={() => {
            confirmDialog.resolve(true);
            setConfirmDialog(null);
          }}
        />
      ) : null}
      {pendingProviderImport ? (
        <PendingProviderImportDialog
          request={pendingProviderImport}
          onConfirm={() => void confirmPendingProviderImport()}
          onDismiss={() => void dismissPendingProviderImport()}
        />
      ) : null}
       {memberLoginApproved && memberProfile ? <PrivateChat friends={chatFriends} messages={chatMessages} notificationPulse={chatNotificationPulse} onCancelRequest={cancelFriendRequest} onLoadMessages={(id) => void loadPrivateMessages(id)} onPresenceChange={changePrivatePresence} onRequest={requestFriend} onRespond={(id, accept) => void respondToFriendRequest(id, accept)} onSearch={searchFriend} onSend={(id, content) => void sendPrivateMessage(id, content)} onSendAttachment={(id, attachment) => sendPrivateAttachment(id, attachment)} outgoingRequests={outgoingFriendRequests} requests={incomingFriendRequests} selfId={memberProfile.userId} selfIsAdmin={memberProfile.actualAdmin} selfStatus={chatSelfStatus} /> : null}
      <MemberLoginGate
        initialPassword={memberRememberedPassword}
        initialRememberPassword={memberRememberPassword}
        initialUsername={memberRememberedUsername}
        loading={!memberGateReady}
        onLogin={loginMember}
        onOpenExternalUrl={actions.openExternalUrl}
        visible={!memberLoginApproved}
      />
    </div>
  );
}

type Actions = {
  refreshCurrent: () => Promise<void>;
  launch: () => Promise<void>;
  restart: () => Promise<boolean>;
  repairPluginMarketplace: () => Promise<void>;
  refreshRemotePluginMarketplace: (silent?: boolean) => Promise<RemotePluginMarketplaceResult | null>;
  repairRemotePluginMarketplace: () => Promise<void>;
  installEntrypoints: () => Promise<void>;
  uninstallEntrypoints: () => Promise<void>;
  repairShortcuts: () => Promise<void>;
  saveSettings: () => Promise<void>;
  saveSettingsValue: (settings: BackendSettings, silent?: boolean) => Promise<boolean>;
  saveVisualThemeSettings: (enabled: boolean, themeId: string, serviceUrl: string, silent?: boolean) => Promise<boolean>;
  refreshSettings: (silent?: boolean) => Promise<BackendSettings | null>;
  resetSettings: () => Promise<void>;
  resetImageOverlaySettings: () => Promise<void>;
  chooseCodexAppPath: (mode: "folder" | "file") => Promise<void>;
  clearCodexAppPath: () => Promise<void>;
  chooseImageOverlayPath: () => Promise<void>;
  saveManualCodexAppPath: () => Promise<void>;
  syncProvidersNow: () => Promise<void>;
  refreshProviderSyncTargets: (silent?: boolean) => Promise<ProviderSyncTargetsResult | null>;
  setProviderSyncTarget: (provider: string) => void;
  setLaunchMode: (launchMode: LaunchMode) => Promise<void>;
  refreshRelay: () => Promise<void>;
  refreshRelayFiles: () => Promise<RelayFilesResult | null>;
  refreshEnvConflicts: (silent?: boolean) => Promise<EnvConflictsResult | null>;
  removeEnvConflicts: (names: string[]) => Promise<void>;
  refreshCcsProviders: (silent?: boolean) => Promise<CcsProvidersResult | null>;
  importCcsProviders: () => Promise<void>;
  refreshLiveContextEntries: () => Promise<LiveContextEntriesResult | null>;
  syncLiveContextEntries: (settings: BackendSettings, silent?: boolean) => Promise<LiveContextEntriesResult | null>;
  refreshSkillMarket: () => Promise<void>;
  installMarketSkill: (id: string) => Promise<void>;
  setUserScriptEnabled: (key: string, enabled: boolean) => Promise<void>;
  deleteUserScript: (key: string) => Promise<void>;
  refreshLocalSessions: () => Promise<LocalSessionsResult | null>;
  deleteLocalSession: (session: LocalSession) => Promise<void>;
  deleteLocalSessions: (sessions: LocalSession[]) => Promise<void>;
  refreshZedRemoteProjects: () => Promise<ZedRemoteProjectsResult | null>;
  openZedRemoteProject: (project: ZedRemoteProject, strategy?: ZedOpenStrategy) => Promise<void>;
  forgetZedRemoteProject: (project: ZedRemoteProject) => Promise<void>;
  openExternalUrl: (url: string) => Promise<void>;
  applyRelayInjection: () => Promise<boolean>;
  applyPureApiInjection: () => Promise<boolean>;
  clearRelayInjection: () => Promise<boolean>;
  saveRelayFile: (kind: "config" | "auth", contents: string, silent?: boolean) => Promise<void>;
  upsertContextEntry: (
    settings: BackendSettings,
    kind: ContextKind,
    id: string,
    tomlBody: string,
  ) => Promise<BackendSettings | null>;
  deleteContextEntry: (settings: BackendSettings, kind: ContextKind, id: string) => Promise<BackendSettings | null>;
  extractRelayCommonConfig: (configContents: string) => Promise<ExtractRelayCommonConfigResult | null>;
  testRelayProfile: (profile: RelayProfile) => Promise<void>;
  diagnoseRelayProfile: (profile: RelayProfile) => Promise<ProviderDoctorResult | null>;
  testStepwiseSettings: (settings: BackendSettings) => Promise<void>;
  fetchRelayProfileModels: (profile: RelayProfile) => Promise<string[] | null>;
  switchRelayProfile: (settings: BackendSettings, previousActiveRelayId?: string) => Promise<void>;
  relaySwitching: boolean;
  switchOfficialMode: () => Promise<void>;
  switchPureApiMode: () => Promise<void>;
  refreshLogs: () => Promise<void>;
  refreshDiagnostics: () => Promise<void>;
  showMessage: (title: string, message: string, status?: Status) => Promise<void>;
  copyLogs: () => Promise<void>;
  copyDiagnostics: () => Promise<void>;
  goLogs: () => Promise<void>;
  installWatcher: () => Promise<void>;
  uninstallWatcher: () => Promise<void>;
  enableWatcher: () => Promise<void>;
  disableWatcher: () => Promise<void>;
  toggleTheme: () => void;
  checkHealth: () => Promise<void>;
};

function MemberAccountScreen({
  profile,
  onLogin,
  onLogout,
  onRefresh,
  onChangeActiveRole,
  onSearchThemeGrantMember,
  onSaveThemeGrant,
}: {
  profile: MemberProfile | null;
  onLogin: (username: string, password: string) => Promise<boolean>;
  onLogout: () => void;
  onRefresh: () => Promise<MemberProfile | null>;
  onChangeActiveRole: (role: MemberRole) => Promise<void>;
  onSearchThemeGrantMember: (query: string) => Promise<ThemeGrantMemberRecord | null>;
  onSaveThemeGrant: (member: ThemeGrantMember, themeIds: string[]) => Promise<ThemeGrantMemberRecord | null>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const rolePresentation = profile ? getMemberRolePresentation(profile.activeRole) : null;
  const roleOptions: MemberRole[] = ["administrator", "founder", "director", "supreme", "vip"];

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const loggedIn = await onLogin(username, password);
      if (loggedIn) setPassword("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Panel className={`member-identity-card ${profile?.activeRole ?? "guest"}`}>
        <CardContent>
          <div className="member-identity-layout">
            <div className={`member-crown-wrap ${rolePresentation?.tone ?? "guest"}`}><Crown className="member-crown" aria-hidden="true" /></div>
            <div>
              <p className="eyebrow">Codework 会员身份</p>
              <h2>{profile ? (rolePresentation?.label ?? "会员") : "登录以核验会员身份"}</h2>
              <p>
                {profile
                  ? `${profile.username} · 身份来自抽奖系统现有资格规则。`
                  : "登录后会从抽奖系统核验会员资格；视觉个性化 Pro 不参与此身份判断。"}
              </p>
            </div>
            {profile && rolePresentation ? <span className={`member-tier-chip ${rolePresentation.tone}`}>{rolePresentation.label}</span> : null}
          </div>
        </CardContent>
      </Panel>
      {profile?.actualAdmin ? (
        <Panel className={`identity-switch-card ${profile.activeRole}`}>
          <CardHead title="管理员身份体验转换" detail="管理员专属：切换后会真实同步到服务器身份展示，同时保留管理员管理权限。" />
          <CardContent>
            <div className="identity-switch-layout">
              <div>
                <p className="eyebrow">CURRENT IDENTITY</p>
                <h3>{rolePresentation?.label ?? "平台执掌者"}</h3>
                <p>这里沿用抽奖系统的身份体验：创始人偏暗红质感，总监偏银蓝质感，至尊 VIP 为金色皇冠，普通 VIP 为蓝色皇冠。</p>
              </div>
              <div className="identity-role-grid">
                {roleOptions.map((role) => {
                  const item = getMemberRolePresentation(role);
                  return (
                    <Button
                      className={`identity-role-button ${item.tone}`}
                      key={role}
                      onClick={() => void onChangeActiveRole(role)}
                      size="sm"
                      variant={profile.activeRole === role ? "default" : "outline"}
                    >
                      {item.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Panel>
      ) : null}
      {profile?.actualAdmin ? (
        <ThemeGrantAdminPanel
          onSearch={onSearchThemeGrantMember}
          onSave={onSaveThemeGrant}
        />
      ) : null}
      {profile ? (
        <Panel>
          <CardHead title="已登录账户" detail="客户端只保存登录令牌，不保存密码；打开客户端时会自动重新核验。" />
          <CardContent>
            <div className="member-details">
              <div><span>账户</span><strong>{profile.username}</strong></div>
              <div><span>身份</span><strong>{rolePresentation ? `${rolePresentation.label} · 当前展示身份` : "会员身份"}</strong></div>
            </div>
            <Toolbar>
              <Button onClick={() => void onRefresh()} variant="outline"><RefreshCw className="h-4 w-4" />重新核验</Button>
              <Button onClick={onLogout} variant="outline">退出登录</Button>
            </Toolbar>
          </CardContent>
        </Panel>
      ) : (
        <Panel>
          <CardHead title="账户登录" detail="使用抽奖系统已有账户登录，不会跳转浏览器。" />
          <CardContent>
            <form className="member-login-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
              <Field label="账号">
                <Input autoComplete="username" onChange={(event) => setUsername(event.target.value)} placeholder="输入抽奖系统账号" value={username} />
              </Field>
              <Field label="密码">
                <Input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} placeholder="输入密码" type="password" value={password} />
              </Field>
              <Toolbar>
                <Button disabled={submitting || !username.trim() || !password} type="submit">
                  <Crown className="h-4 w-4" />{submitting ? "正在核验…" : "登录并核验身份"}
                </Button>
              </Toolbar>
            </form>
          </CardContent>
        </Panel>
      )}
    </>
  );
}

function ThemeGrantAdminPanel({
  onSearch,
  onSave,
}: {
  onSearch: (query: string) => Promise<ThemeGrantMemberRecord | null>;
  onSave: (member: ThemeGrantMember, themeIds: string[]) => Promise<ThemeGrantMemberRecord | null>;
}) {
  const [query, setQuery] = useState("");
  const [member, setMember] = useState<ThemeGrantMemberRecord | null>(null);
  const [themeIds, setThemeIds] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  const search = async () => {
    const value = query.trim();
    if (!value || searching) return;
    setSearching(true);
    setFeedback("");
    try {
      const resolved = await onSearch(value);
      setMember(resolved);
      setThemeIds(normalizeThemeGrantIds(resolved?.themeIds || []));
      setFeedback(resolved ? "已找到该官方账号，可调整其限定主题授权。" : "未找到该官方账号，请核对用户名或用户 ID。");
    } finally {
      setSearching(false);
    }
  };

  const toggleTheme = (themeId: string, checked: boolean) => {
    setThemeIds((current) => normalizeThemeGrantIds(checked ? [...current, themeId] : current.filter((id) => id !== themeId)));
  };

  const save = async (nextThemeIds = themeIds) => {
    if (!member || saving || !canSaveThemeGrant(member, nextThemeIds)) return;
    setSaving(true);
    setFeedback("");
    try {
      const saved = await onSave(member, normalizeThemeGrantIds(nextThemeIds));
      if (!saved) return;
      setMember(saved);
      setThemeIds(normalizeThemeGrantIds(saved.themeIds));
      setFeedback(saved.themeIds.length ? "授权已保存，用户刷新个性化页面即可使用。" : "已撤销该账号的全部限定主题授权。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel className="theme-grant-admin-card">
      <CardHead title="主题授权管理" detail="管理员专属：为已注册的官方账号一键发放或撤销限定个性化主题，保存后实时生效。" />
      <CardContent>
        <div className="theme-grant-search-row">
          <Input
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void search(); } }}
            placeholder="输入官方账号用户名或用户 ID"
            value={query}
          />
          <Button disabled={searching || !query.trim()} onClick={() => void search()} type="button" variant="outline">
            <RefreshCw className="h-4 w-4" />{searching ? "查询中…" : "查询账号"}
          </Button>
        </div>
        {member ? (
          <div className="theme-grant-member">
            <div><span>已选账号</span><strong>{member.username}</strong></div>
            <code>ID {member.userId}</code>
          </div>
        ) : null}
        <div className="theme-grant-options" aria-disabled={!member}>
          {restrictedThemeOptions.map((theme) => (
            <label className={`theme-grant-option ${themeIds.includes(theme.id) ? "selected" : ""}`} key={theme.id}>
              <input
                checked={themeIds.includes(theme.id)}
                disabled={!member || saving}
                onChange={(event) => toggleTheme(theme.id, event.target.checked)}
                type="checkbox"
              />
              <span>{theme.label}</span>
            </label>
          ))}
        </div>
        {feedback ? <p className="theme-grant-feedback">{feedback}</p> : null}
        <Toolbar>
          <Button disabled={!canSaveThemeGrant(member, themeIds) || saving} onClick={() => void save()} type="button">
            <Save className="h-4 w-4" />{saving ? "保存中…" : "保存授权"}
          </Button>
          <Button disabled={!member || saving || themeIds.length === 0} onClick={() => void save([])} type="button" variant="outline">
            <Trash2 className="h-4 w-4" />撤销全部
          </Button>
        </Toolbar>
      </CardContent>
    </Panel>
  );
}

function MemberLoginGate({
  initialPassword,
  initialRememberPassword,
  initialUsername,
  loading,
  onLogin,
  onOpenExternalUrl,
  visible,
}: {
  initialPassword: string;
  initialRememberPassword: boolean;
  initialUsername: string;
  loading: boolean;
  onLogin: (username: string, password: string, rememberPassword?: boolean) => Promise<boolean>;
  onOpenExternalUrl: (url: string) => Promise<void>;
  visible: boolean;
}) {
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState(initialPassword);
  const [rememberPassword, setRememberPassword] = useState(initialRememberPassword);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (submitting) return;
    setUsername(initialUsername);
    setPassword(initialPassword);
    setRememberPassword(initialRememberPassword);
  }, [initialPassword, initialRememberPassword, initialUsername, submitting]);

  if (!visible && !loading) return null;

  const submit = async () => {
    if (submitting || loading) return;
    setError("");
    setSubmitting(true);
    try {
      const loggedIn = await onLogin(username, password, rememberPassword);
      if (!loggedIn) {
        setError("账号、密码或会员身份核验未通过，请重试。");
        return;
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="member-login-backdrop" role="dialog" aria-modal="true" aria-label="Codework 会员登录">
      <div className="member-login-shell">
        <section className="member-login-showcase" aria-label="Codework AI 官方入口">
          <p className="eyebrow">CODEWORK AI 内部技术应用</p>
          <h1>登录后进入会员活动中心</h1>
          <p>使用 ♛Codework AI 官方账号完成身份验证，同步查看活动、会员身份和客户端更新。</p>
            <div className="member-login-showcase-links">
            <Button onClick={() => void onOpenExternalUrl(CODEWORK_REGISTER_URL)} type="button">
              打开官方网站
            </Button>
            <Button onClick={() => void onOpenExternalUrl(CODEWORK_QQ_GROUP_URL)} type="button" variant="outline">
              加入 QQ 群
            </Button>
            </div>
          <div className="member-login-qr-grid">
            <button type="button" onClick={() => void onOpenExternalUrl(CODEWORK_QQ_QR_URL)}>
              <img src={CODEWORK_QQ_QR_URL} alt="Codework AI QQ 群二维码" />
              <span>QQ 群二维码</span>
            </button>
            <button type="button" onClick={() => void onOpenExternalUrl(CODEWORK_WECHAT_QR_URL)}>
              <img src={CODEWORK_WECHAT_QR_URL} alt="Codework AI 微信交流群二维码" />
              <span>微信交流群二维码</span>
            </button>
          </div>
          <small>没有官方账号？<button className="member-login-inline-link" type="button" onClick={() => void onOpenExternalUrl(CODEWORK_REGISTER_URL)}>立即注册</button></small>
        </section>
        <div className="member-login-card">
          <div className="member-login-crown"><Crown aria-hidden="true" /></div>
          <p className="eyebrow">{CODEWORK_PRODUCT_NAME}</p>
          <h2>{loading ? "正在核验登录状态" : "官方账号验证"}</h2>
          <p className="member-login-intro">
            {loading ? "请稍候，正在安全读取已保存的登录令牌。" : "验证成功后进入客户端；勾选后才会在本机保留本次账号和密码。"}
          </p>
          {loading ? <div className="member-login-loading">正在加载…</div> : (
            <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
              <Field label={CODEWORK_OFFICIAL_ACCOUNT_LABEL}>
                <Input autoComplete="username" autoFocus onChange={(event) => setUsername(event.target.value)} placeholder="请输入 Codework AI 官方账号" value={username} />
              </Field>
              <Field label="官方账号密码">
                <Input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} placeholder="请输入官方账号密码" type="password" value={password} />
              </Field>
              <div className="member-login-options">
                <label><input checked={rememberPassword} onChange={(event) => setRememberPassword(event.target.checked)} type="checkbox" />记住密码</label>
                <button type="button" onClick={() => void onOpenExternalUrl(CODEWORK_FORGOT_PASSWORD_URL)}>忘记密码？</button>
              </div>
              {error ? <p className="member-login-error">{error}</p> : null}
              <Button className="member-login-submit" disabled={submitting || !username.trim() || !password} type="submit">
                <Crown className="h-4 w-4" />{submitting ? "正在验证…" : "验证并进入客户端"}
              </Button>
              <p className="member-login-register">还没有账号？<button type="button" onClick={() => void onOpenExternalUrl(CODEWORK_REGISTER_URL)}>立即注册</button></p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function ActivityCenterScreen({
  activity,
  onOpenPortal,
  onRefresh,
}: {
  activity: MemberActivity | null;
  onOpenPortal: () => Promise<void>;
  onRefresh: () => Promise<MemberActivity | null>;
}) {
  const campaign = activity?.campaign ?? null;
  return (
    <>
      <Panel className="activity-hero">
        <CardContent>
          <div className="activity-hero-layout">
            <div className="activity-gift-wrap"><Gift aria-hidden="true" /></div>
            <div>
              <p className="eyebrow">CODEWORK ACTIVITY</p>
              <h2>{campaign?.title ?? "活动中心"}</h2>
              <p>{campaign ? "已同步到当前正在进行的活动，点击按钮会在浏览器打开已登录的活动官网。" : "活动内容由服务器统一更新，点击按钮会在浏览器打开已登录的活动官网。"}</p>
            </div>
            <Button onClick={() => void onRefresh()} variant="outline"><RefreshCw className="h-4 w-4" />刷新公告</Button>
          </div>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title="当前活动" detail="客户端显示活动摘要；点击进入活动官网会自动带上登录态，不需要重复输入账号密码。" />
        <CardContent>
          <div className="activity-details">
            <div><span>活动名称</span><strong>{campaign?.title ?? "活动官网实时内容"}</strong></div>
            <div><span>公告状态</span><strong>{campaign ? "正在进行" : "以官网页面为准"}</strong></div>
            <div><span>剩余次数</span><strong>{activity ? `${activity.remainingChances} 次` : "登录后同步"}</strong></div>
            <div><span>结束时间</span><strong>{campaign ? formatTime(campaign.endsAt) : "以活动官网为准"}</strong></div>
          </div>
          <div className="activity-open-card">
            <div className="activity-open-orb" aria-hidden="true"><Rocket className="h-6 w-6" /></div>
            <div className="activity-open-content">
              <div className="activity-open-trust"><CheckCircle2 className="h-4 w-4" />活动入口已为你准备好</div>
              <h3>进入完整活动会场</h3>
              <p>自动带上当前登录身份，直接进入官方活动页，不用重复输入账号和密码。</p>
              <div className="activity-open-benefits" aria-label="活动入口权益">
                <span>免重复登录</span>
                <span>官方安全跳转</span>
              </div>
            </div>
            <Button className="activity-open-button" onClick={() => void onOpenPortal()}>
              <span><strong>进入活动官网</strong><small>浏览器安全打开</small></span>
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Panel>
    </>
  );
}

function CommunityScreen({
  community,
  profile,
  draft,
  onDraftChange,
  onPublish,
  onDelete,
  onLike,
  onReply,
  onRefresh,
}: {
  community: CommunityResult | null;
  profile: MemberProfile | null;
  draft: string;
  onDraftChange: (value: string) => void;
  onPublish: () => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onLike: (id: string) => Promise<void>;
  onReply: (id: string, content: string) => Promise<void>;
  onRefresh: () => Promise<unknown>;
}) {
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const canModerate = Boolean(community?.canModerate) && Boolean(profile?.actualAdmin);
  const experienceRole: "administrator" | "founder" | "member" | "vip" = "administrator";
  const onExperienceRoleChange = (_role: "administrator" | "founder" | "member" | "vip") => {};
  const roles: Array<["administrator" | "founder" | "member" | "vip", string, string]> = [
    ["administrator", "管理员", "完整管理视图"], ["founder", "创始人", "专属身份视图"],
    ["member", "普通会员", "普通用户视图"], ["vip", "至尊 VIP", "VIP 身份视图"],
  ];
  return <>
    <Panel className="activity-hero"><CardContent><div className="activity-hero-layout"><div className="activity-gift-wrap"><MessageCircle aria-hidden="true" /></div><div><p className="eyebrow">CODEWORK COMMUNITY</p><h2>超话</h2><p>登录用户可以分享想法、交流使用体验；评论会显示发布时间。</p></div><Button onClick={() => void onRefresh()} variant="outline"><RefreshCw className="h-4 w-4" />刷新</Button></div></CardContent></Panel>
    <Panel className="community-compose-panel"><CardHead title="发布超话" detail={profile ? `当前账号：${profile.username}` : "请先登录官方账号"} /><CardContent><Textarea value={draft} onChange={(event) => onDraftChange(event.target.value)} maxLength={500} placeholder="说点什么，最多 500 字…" /><div className="release-actions"><Button disabled={!profile || !draft.trim()} onClick={() => void onPublish()}><MessageCircle className="h-4 w-4" />发布</Button></div></CardContent></Panel>
    <Panel><CardHead title="最新超话" detail="昵称已脱敏，支持点赞和回复。" /><CardContent><div className="community-comment-list">{community?.comments?.length ? community.comments.map((comment) => { const canDelete = canModerate || comment.authorUserId === profile?.userId; const reply = replyDrafts[comment.id] ?? ""; return <article className="community-comment" key={comment.id}><div><strong>{comment.authorUsername}</strong><time>{formatTime(comment.createdAt)}</time></div><p>{comment.content}</p><div className="release-actions"><Button onClick={() => void onLike(comment.id)} size="sm" variant="outline">👍 {comment.likeCount}</Button>{canDelete ? <Button onClick={() => void onDelete(comment.id)} size="sm" variant="outline"><Trash2 className="h-4 w-4" />删除</Button> : null}</div>{comment.replies.length ? <div className="community-replies">{comment.replies.map((reply) => <p key={reply.id}><strong>{reply.authorUsername}</strong>：{reply.content}</p>)}</div> : null}<div className="community-reply-box"><Input value={reply} maxLength={500} placeholder="回复这条超话" onChange={(event) => setReplyDrafts({ ...replyDrafts, [comment.id]: event.target.value })} /><Button disabled={!reply.trim()} onClick={() => { void onReply(comment.id, reply); setReplyDrafts({ ...replyDrafts, [comment.id]: "" }); }} size="sm">回复</Button></div></article>; }) : <div className="empty">暂无超话，发布第一条吧。</div>}</div></CardContent></Panel>
  </>;
}

function AnnouncementCenterScreen({ feed, onRead, onRefresh }: { feed: AnnouncementFeed | null; onRead: (announcement: ClientAnnouncement) => void; onRefresh: () => Promise<unknown> }) {
  return <>
    <Panel className="activity-hero"><CardContent><div className="activity-hero-layout"><div className="activity-gift-wrap"><Bell aria-hidden="true" /></div><div><p className="eyebrow">CODEWORK NOTICE</p><h2>公告中心</h2><p>平台通知会自动同步到客户端，不需要重新安装。</p></div><Button onClick={() => void onRefresh()} variant="outline"><RefreshCw className="h-4 w-4" />刷新</Button></div></CardContent></Panel>
    <Panel><CardHead title="最新公告" detail="已读状态只保存在当前电脑，不影响其他设备。" /><CardContent><div className="announcement-list">{feed?.announcements.length ? feed.announcements.map((announcement) => <article className={`announcement-card ${announcement.priority}`} key={`${announcement.id}:${announcement.revision}`} onClick={() => onRead(announcement)}><div><strong>{announcement.title}</strong><time>{announcement.publishedAt ? formatTime(new Date(announcement.publishedAt).getTime()) : "草稿"}</time></div><p>{announcement.body}</p><small>{announcement.isPinned ? "置顶公告" : "平台公告"} · 第 {announcement.revision} 版</small></article>) : <div className="empty">暂无公告</div>}</div></CardContent></Panel>
  </>;
}

function AnnouncementManagementScreen({ draft, editingId, feed, onDraftChange, onEdit, onPublish, onWithdraw }: { draft: { title: string; body: string; priority: "normal" | "important" | "urgent"; isPinned: boolean }; editingId: string | null; feed: AnnouncementFeed; onDraftChange: (draft: { title: string; body: string; priority: "normal" | "important" | "urgent"; isPinned: boolean }) => void; onEdit: (announcement: ClientAnnouncement) => void; onPublish: () => Promise<void>; onWithdraw: (id: string) => Promise<void> }) {
  return <>
    <Panel className="activity-hero"><CardContent><div className="activity-hero-layout"><div className="activity-gift-wrap"><Edit3 aria-hidden="true" /></div><div><p className="eyebrow">ADMIN ONLY</p><h2>公告管理</h2><p>发布后，所有客户端启动或定时刷新时都会自动同步。</p></div><UiBadge>{feed.announcements.length} 条已发布</UiBadge></div></CardContent></Panel>
    <Panel><CardHead title={editingId ? "编辑公告" : "发布公告"} detail="普通公告为细横幅；重要和紧急公告会使用更醒目的颜色。" /><CardContent><div className="announcement-editor"><Field label="标题"><Input maxLength={80} onChange={(event) => onDraftChange({ ...draft, title: event.target.value })} value={draft.title} /></Field><Field label="内容"><Textarea maxLength={2000} onChange={(event) => onDraftChange({ ...draft, body: event.target.value })} value={draft.body} /></Field><label>公告等级<select onChange={(event) => onDraftChange({ ...draft, priority: event.target.value as typeof draft.priority })} value={draft.priority}><option value="normal">普通</option><option value="important">重要</option><option value="urgent">紧急</option></select></label><label><input checked={draft.isPinned} onChange={(event) => onDraftChange({ ...draft, isPinned: event.target.checked })} type="checkbox" />置顶显示</label><div className="release-actions"><Button disabled={!draft.title.trim() || !draft.body.trim()} onClick={() => void onPublish()}><Bell className="h-4 w-4" />{editingId ? "保存修改" : "立即发布"}</Button></div></div></CardContent></Panel>
    <Panel><CardHead title="已发布公告" detail="可再次编辑、调整置顶或撤回。" /><CardContent><div className="announcement-list">{feed.announcements.map((announcement) => <article className={`announcement-card ${announcement.priority}`} key={announcement.id}><div><strong>{announcement.title}</strong><time>第 {announcement.revision} 版</time></div><p>{announcement.body}</p><div className="release-actions"><Button onClick={() => onEdit(announcement)} size="sm" variant="outline"><Edit3 className="h-4 w-4" />编辑</Button><Button onClick={() => void onWithdraw(announcement.id)} size="sm" variant="outline"><Trash2 className="h-4 w-4" />撤回</Button></div></article>)}</div></CardContent></Panel>
  </>;
}

function formatInstallStage(stage?: string) {
  if (stage === "creatingShortcut") return "正在创建桌面快捷方式";
  if (stage === "completed") return "已完成";
  return getCodeworkUpdateStageLabel(stage);
}

function ReleaseNotesScreen({
  lastCheckedAt,
  release,
  progress,
  onCheck,
  onInstall,
}: {
  lastCheckedAt: number | null;
  release: CodeworkReleaseResult | null;
  progress: InstallerProgress | null;
  onCheck: () => Promise<unknown>;
  onInstall: () => Promise<void>;
}) {
  const available = isSuccessStatus(release?.status) && Boolean(release?.available);
  const releaseDisplay = release?.currentVersion && release?.latestVersion
    ? getCodeworkReleaseDisplay({ currentVersion: release.currentVersion, latestVersion: release.latestVersion, pendingTargetVersion: release.pendingTargetVersion })
    : null;
  const updateIncomplete = release?.updateState === "pending_confirmation" || releaseDisplay?.state === "update_incomplete";
  const updateActionable = available || Boolean(release?.recoveryAction) || updateIncomplete;
  const percentage = progress?.percent;
  const updateSteps = getCodeworkUpdateSteps(progress?.stage);
  const currentUpdateStep = progress ? Math.max(0, updateSteps.indexOf(progress.stage as typeof updateSteps[number])) : -1;
  const integrityVerified = release?.integrityStatus === "verified_manifest";
  return (
    <>
      <Panel className="release-hero">
        <CardContent>
          <div className="release-hero-layout">
            <div className="release-mark"><Download aria-hidden="true" /></div>
            <div>
              <p className="eyebrow">CODEWORK AI CLIENT</p>
              <h2>正在运行的管理端 {releaseDisplay?.runningVersion ?? release?.currentVersion ?? "读取中"}</h2>
              <p>{updateIncomplete ? `上一次安装未确认完成：当前仍是 ${release?.currentVersion}，可重新更新，原有配置会保留。` : available ? `发现新版本 ${release?.latestVersion}，点击后将自动下载、覆盖安装并重启新版。` : "启动时会自动检测新版本；暂不更新不影响继续使用。"}</p>
            </div>
            <span className="release-current-chip">{updateIncomplete ? "安装未完成" : available ? "发现新版本" : "已是最新版本"}</span>
          </div>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title={available ? `新版本 ${release?.latestVersion}` : "版本更新"} detail="一键更新会保留本机供应商和客户端配置，安装结束后自动启动新版。" />
        <CardContent>
          {updateIncomplete ? <p className="muted-copy">上一次更新未能确认管理端已经替换完成。请点击“重新更新”，客户端会先退出管理端再覆盖安装。</p> : null}
          {release ? <div className="release-actions"><UiBadge>{integrityVerified ? "发布清单签名已验证" : "等待完整性验证"}</UiBadge>{release.expectedSize ? <span className="muted-copy">安装包 {formatBytes(release.expectedSize)}</span> : null}{release.sha256 ? <span className="muted-copy">SHA-256 已提供</span> : null}{release.mandatory ? <UiBadge>重要更新</UiBadge> : null}</div> : null}
          <p className="release-check-summary">{lastCheckedAt ? `上次检测：${formatTime(lastCheckedAt)}` : "尚未手动检测；客户端启动时会自动检测一次。"}</p>
          {release?.lastFailure ? <p className="muted-copy">上次更新失败原因：{release.lastFailure}</p> : null}
          {release?.notes?.length ? <ul className="release-note-list">{release.notes.map((note) => <li key={note}>{note}</li>)}</ul> : <p className="muted-copy">点击“重新检测”即可读取最新版本与更新说明。</p>}
          <div className="release-actions">
            <Button onClick={() => void onCheck()} variant="outline"><RefreshCw className="h-4 w-4" />重新检测</Button>
            {updateActionable ? <Button onClick={() => void onInstall()}><Download className="h-4 w-4" />{updateIncomplete ? "重新更新" : "立即更新"}</Button> : null}
          </div>
          {progress ? <div className="release-progress"><strong>{formatInstallStage(progress.stage)}</strong><span>{percentage !== undefined ? `${percentage}% · ` : ""}{formatBytes(progress.downloadedBytes ?? 0)}{progress.totalBytes ? ` / ${formatBytes(progress.totalBytes)}` : ""}</span><div><i style={{ width: `${percentage ?? 12}%` }} /></div></div> : null}
          {progress ? <ol className="release-step-list">{updateSteps.map((stage, index) => <li className={index <= currentUpdateStep ? "active" : ""} key={stage}>{formatInstallStage(stage)}</li>)}</ol> : null}
        </CardContent>
      </Panel>
    </>
  );
}

function OfficialChatGptScreen({
  result,
  progress,
  onRefresh,
  onInstall,
}: {
  result: ChatGptInstallResult | null;
  progress: InstallerProgress | null;
  onRefresh: () => Promise<unknown>;
  onInstall: () => Promise<void>;
}) {
  const installed = isSuccessStatus(result?.status) && Boolean(result?.installed);
  const canInstall = result?.wingetAvailable !== false;
  const steps = [
    ["checking", "检测官方来源"],
    ["installing", "Microsoft Store 安装"],
    ["creatingShortcut", "创建桌面快捷方式"],
    ["completed", "完成"],
  ] as const;
  const activeIndex = Math.max(0, steps.findIndex(([stage]) => stage === progress?.stage));
  const progressWidth = progress ? `${Math.max(18, ((activeIndex + 1) / steps.length) * 100)}%` : "0%";
  return (
    <>
      <Panel className="release-hero">
        <CardContent><div className="release-hero-layout"><div className="release-mark"><Download aria-hidden="true" /></div><div><p className="eyebrow">MICROSOFT STORE</p><h2>下载官方 ChatGPT</h2><p>仅通过 Microsoft Store 安装 OpenAI 官方 ChatGPT，不下载或分发第三方安装包。</p></div><span className="release-current-chip">{installed ? "已安装" : "官方来源"}</span></div></CardContent>
      </Panel>
      <Panel>
        <CardHead title={installed ? "官方 ChatGPT 已可使用" : "准备安装"} detail={installed ? (result?.shortcutCreated ? "桌面快捷方式已创建。" : "可重新执行以创建桌面快捷方式。") : "开始前，客户端会确认 Microsoft Store 的发布者为 OpenAI。"} />
        <CardContent>
          {!result?.wingetAvailable ? <p className="muted-copy">未检测到 Microsoft Store 安装组件（winget）。请先更新 Microsoft Store 或 App Installer。</p> : null}
          <div className="release-actions"><Button onClick={() => void onRefresh()} variant="outline"><RefreshCw className="h-4 w-4" />检测状态</Button><Button disabled={!canInstall} onClick={() => void onInstall()}><Download className="h-4 w-4" />{installed ? "创建桌面快捷方式" : "通过 Microsoft Store 安装"}</Button></div>
          {progress ? <div className="release-progress chatgpt-install-progress"><strong>{steps[activeIndex]?.[1] ?? "准备安装"}</strong><span>正在使用 Microsoft Store 官方渠道安装；如系统弹出确认，请按提示继续。</span><div><i style={{ width: progressWidth }} /></div><ol>{steps.map(([stage, label], index) => <li className={index <= activeIndex ? "active" : ""} key={stage}>{label}</li>)}</ol></div> : null}
        </CardContent>
      </Panel>
    </>
  );
}

function OverviewScreen({
  overview,
  pluginMarketplaceProgress,
  actions,
}: {
  overview: OverviewResult | null;
  pluginMarketplaceProgress: TaskProgress;
  actions: Actions;
}) {
  const health = healthItems(overview);
  return (
    <>
      <Panel className="codework-overview">
        <CardContent>
          <div className="codework-overview-layout">
            <div className="codework-overview-main">
              <div className="codework-overview-mark">
                <Network className="h-5 w-5" />
              </div>
              <div>
                <span className="eyebrow">{t("推荐服务")}</span>
                <h2>{CODEWORK_PROVIDER_NAME}</h2>
                <p>
                  {t("Codework AI 提供 OpenAI 兼容接口。注册后请在供应商配置中填写你自己的 API 令牌。")}
                </p>
              </div>
            </div>
            <div className="codework-overview-side">
              <div className="codework-model-tags">
                <span>OpenAI Compatible</span>
                <span>用户自备令牌</span>
                <span>一键预设</span>
              </div>
              <Button onClick={() => void actions.openExternalUrl(CODEWORK_REGISTER_URL)}>
                <ExternalLink className="h-4 w-4" />
                {t("打开 Codework AI")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title={t("健康检查")} detail={t("概览只展示关键问题，具体配置在对应页面处理")} />
        <CardContent>
          <div className="health-grid">
            <div className={`health-item ${overview?.codex_version ? "ok" : "needs-fix"}`}>
              {overview?.codex_version ? <CheckCircle2 className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
              <div>
                <strong>{t("Codex 版本")}</strong>
                <span>{overview?.codex_version ?? t("未检测到 Codex 应用版本。")}</span>
              </div>
              <Badge status={overview?.codex_version ? "ok" : "not_checked"} />
            </div>
            {health.map((item) => (
              <div className={`health-item ${item.ok ? "ok" : "needs-fix"}`} key={item.title}>
                {item.ok ? <CheckCircle2 className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </div>
                <Badge status={item.status} />
              </div>
            ))}
          </div>
          <Toolbar>
            <Button onClick={() => void actions.checkHealth()}>
              <RefreshCw className="h-4 w-4" />
              {t("检查")}
            </Button>
            <Button variant="secondary" onClick={() => void actions.repairShortcuts()}>
              <Wrench className="h-4 w-4" />
              {t("修复入口")}
            </Button>
            <Button disabled={pluginMarketplaceProgress.active} variant="secondary" onClick={() => void actions.repairPluginMarketplace()}>
              {pluginMarketplaceProgress.active ? t("正在修复…") : t("修复插件市场")}
            </Button>
          </Toolbar>
          <TaskProgressBox progress={pluginMarketplaceProgress} title={t("插件市场修复进度")} />
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title={t("最近启动")} detail={overview?.logs_path ?? t("暂无状态文件")} />
        <CardContent>
          <LatestLaunch status={overview?.latest_launch ?? null} />
          <Toolbar>
            <Button onClick={() => void actions.launch()}>
              <Rocket className="h-4 w-4" />
              {t("启动 Codex++")}
            </Button>
            <Button variant="secondary" onClick={() => void actions.goLogs()}>
              {t("打开关于")}
            </Button>
          </Toolbar>
        </CardContent>
      </Panel>
    </>
  );
}

function RelayScreen({
  settings: _settings,
  relayFiles,
  envConflicts,
  ccsProviders,
  relayTokenSync,
  relayTokenSyncing,
  workbuddyConfiguring,
  onApplyWorkbuddyConfig,
  memberLoggedIn,
  activeProfileId,
  onSyncRelayTokens,
  onApplyRelayToken,
  onTestRelayToken,
  form,
  onFormChange,
  actions,
}: {
  settings: SettingsResult | null;
  relayFiles: RelayFilesResult | null;
  envConflicts: EnvConflictsResult | null;
  ccsProviders: CcsProvidersResult | null;
  relayTokenSync: RelayTokenSyncResult | null;
  relayTokenSyncing: boolean;
  workbuddyConfiguring: boolean;
  onApplyWorkbuddyConfig: () => Promise<WorkbuddyConfigResult | null>;
  memberLoggedIn: boolean;
  activeProfileId: string;
  onSyncRelayTokens: (silent?: boolean) => Promise<RelayTokenSyncResult | null>;
  onApplyRelayToken: (accountId: string, tokenId: string) => Promise<void>;
  onTestRelayToken: (accountId: string, tokenId: string) => Promise<RelayTokenConnectionResult | null>;
  form: BackendSettings;
  onFormChange: (value: BackendSettings) => void;
  actions: Actions;
}) {
  const normalized = normalizeSettings(form);
  const [detailProfileId, setDetailProfileId] = useState<string | null>(null);
  const [newProfileDraft, setNewProfileDraft] = useState<RelayProfile | null>(null);
  const [thirdPartyImportOpen, setThirdPartyImportOpen] = useState(false);
  const detailProfile = newProfileDraft || (detailProfileId
    ? normalized.relayProfiles.find((profile) => profile.id === detailProfileId) || null
    : null);
  const isNewProfile = !!newProfileDraft;
  const saveRelaySettings = async (next: BackendSettings) => {
    onFormChange(next);
    await actions.saveSettingsValue(next, true);
  };
  const createNewAggregateProfile = () => {
    const draft = createAggregateRelayProfile(normalized);
    setDetailProfileId(null);
    setNewProfileDraft(draft);
    if (!normalizeAggregateConfig(draft.aggregate, aggregateMemberCandidates(normalized, draft.id)).members.length) {
      void actions.showMessage(
        t("添加聚合供应商"),
        t("已打开聚合供应商详情；请先添加或完善至少 1 个普通 API 供应商的 Base URL / Key，再勾选为成员。"),
        "failed",
      );
    }
  };
  const editRelayProfile = async (profileId: string) => {
    setNewProfileDraft(null);
    setDetailProfileId(
      normalized.relayProfiles.some((item) => item.id === profileId) ? profileId : null,
    );
  };
  useEffect(() => {
    if (!newProfileDraft && detailProfileId && !normalized.relayProfiles.some((profile) => profile.id === detailProfileId)) {
      setDetailProfileId(null);
    }
  }, [detailProfileId, newProfileDraft, normalized.relayProfiles]);
  useEffect(() => {
    if (!newProfileDraft && detailProfileId === normalized.activeRelayId) {
      void actions.refreshRelayFiles();
    }
  }, [detailProfileId, newProfileDraft, normalized.activeRelayId]);
  const openThirdPartyImport = () => {
    setThirdPartyImportOpen((open) => !open);
    if (!ccsProviders) void actions.refreshCcsProviders(true);
  };

  if (detailProfile) {
    return (
      <RelayProfileDetail
        profile={detailProfile}
        relayFiles={!isNewProfile && detailProfile.id === normalized.activeRelayId ? relayFiles : null}
        form={normalized}
        isNew={isNewProfile}
        onBack={() => {
          setNewProfileDraft(null);
          setDetailProfileId(null);
        }}
        onFormChange={saveRelaySettings}
        onSaved={() => {
          setNewProfileDraft(null);
          setDetailProfileId(null);
        }}
        actions={actions}
      />
    );
  }

  return (
    <>
      <RelayTokenPanel
        memberLoggedIn={memberLoggedIn}
        sync={relayTokenSync}
        syncing={relayTokenSyncing}
        activeProfileId={activeProfileId}
        onApply={onApplyRelayToken}
        onRefresh={onSyncRelayTokens}
        onTestRelayToken={onTestRelayToken}
        workbuddyConfiguring={workbuddyConfiguring}
        onApplyWorkbuddyConfig={onApplyWorkbuddyConfig}
      />
      <Panel>
        <CardHead title={t("供应商列表")} detail={tf("{0} 个供应商配置；可拖动排序，点编辑进入详情", [normalized.relayProfiles.length])} />
        <CardContent>
          <EnvConflictNotice envConflicts={envConflicts} actions={actions} />
          <label className="switch-row relay-master-switch">
            <input
              checked={normalized.relayProfilesEnabled}
              onChange={(event) => {
                const next = { ...normalized, relayProfilesEnabled: event.currentTarget.checked };
                void saveRelaySettings(next);
              }}
              type="checkbox"
            />
            <span>
              <strong>{t("启用供应商配置切换")}</strong>
              <small>{t("关闭后本工具不会在手动切换时写入 Codex 的 config.toml / auth.json；启动 Codex 时始终不会自动改这些文件。")}</small>
            </span>
          </label>
          <div className="relay-add-row">
            <Button
              variant="secondary"
              onClick={() => {
                setNewProfileDraft(createRelayProfile(normalized));
                setDetailProfileId(null);
              }}
            >
              <Plus className="h-4 w-4" />
              {t("添加供应商")}
            </Button>
            <Button
              variant="secondary"
              onClick={createNewAggregateProfile}
            >
              <Plus className="h-4 w-4" />
              {t("添加聚合供应商")}
            </Button>
            <div className="third-party-import">
              <Button
                onClick={openThirdPartyImport}
                variant="secondary"
              >
                <Download className="h-4 w-4" />
                {t("从第三方导入")}
              </Button>
              {thirdPartyImportOpen ? (
                <div className="third-party-import-menu">
                  <button
                    disabled={!ccsProviders?.providers.length}
                    onClick={() => {
                      setThirdPartyImportOpen(false);
                      void actions.importCcsProviders();
                    }}
                    type="button"
                  >
                    <strong>ccswitch</strong>
                    <span>{ccsProviderSummary(ccsProviders)}</span>
                  </button>
                  <button
                    onClick={() => void actions.refreshCcsProviders()}
                    type="button"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {t("刷新列表")}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <RelayProfileList
            form={normalized}
            onEdit={(profileId) => void editRelayProfile(profileId)}
            onFormChange={saveRelaySettings}
            disabled={!normalized.relayProfilesEnabled || actions.relaySwitching}
            actions={actions}
          />
        </CardContent>
      </Panel>
    </>
  );
}

function RelayTokenPanel({
  memberLoggedIn,
  sync,
  syncing,
  activeProfileId,
  onApply,
  onRefresh,
  onTestRelayToken,
  workbuddyConfiguring,
  onApplyWorkbuddyConfig,
}: {
  memberLoggedIn: boolean;
  sync: RelayTokenSyncResult | null;
  syncing: boolean;
  activeProfileId: string;
  onApply: (accountId: string, tokenId: string) => Promise<void>;
  onRefresh: (silent?: boolean) => Promise<RelayTokenSyncResult | null>;
  onTestRelayToken: (accountId: string, tokenId: string) => Promise<RelayTokenConnectionResult | null>;
  workbuddyConfiguring: boolean;
  onApplyWorkbuddyConfig: () => Promise<WorkbuddyConfigResult | null>;
}) {
  const tokens = sync && isSuccessStatus(sync.status) ? sync.tokens : [];
  const wallet = sync && isSuccessStatus(sync.status) ? sync.wallet : null;
  const [modelSearch, setModelSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const [applyingTokenId, setApplyingTokenId] = useState("");
  const [testingTokenId, setTestingTokenId] = useState("");
  const [connectionSummary, setConnectionSummary] = useState<Record<string, string>>({});
  const [workbuddySummary, setWorkbuddySummary] = useState<WorkbuddyConfigResult | null>(null);
  const modelGroups = useMemo(() => groupRelayModels(tokens), [tokens]);
  const normalizedSearch = modelSearch.trim().toLowerCase();
  const hasDomesticTokens = useMemo(() => domesticRelayTokens(tokens).length > 0, [tokens]);
  const applyWorkbuddy = async () => {
    if (workbuddyConfiguring) return;
    const result = await onApplyWorkbuddyConfig();
    if (result) setWorkbuddySummary(result);
  };
  const applyToken = async (tokenId: string) => {
    if (!sync?.accountId || applyingTokenId) return;
    setApplyingTokenId(tokenId);
    try { await onApply(sync.accountId, tokenId); } finally { setApplyingTokenId(""); }
  };
  const testToken = async (tokenId: string) => {
    if (!sync?.accountId || testingTokenId) return;
    setTestingTokenId(tokenId);
    try {
      const result = await onTestRelayToken(sync.accountId, tokenId);
      if (result) setConnectionSummary((current) => ({
        ...current,
        [tokenId]: isSuccessStatus(result.status) ? `${result.latencyMs} ms · HTTP ${result.statusCode}` : result.message,
      }));
    } finally { setTestingTokenId(""); }
  };
  return (
    <Panel>
      <CardHead title="中转站令牌" detail="登录后直接从 gptproxy.site 安全同步；界面仅显示掩码，真实令牌保存在 Windows 凭据管理器。" />
      <CardContent>
        {tokens.length || wallet ? (
          <>
        <div className="relay-token-total">
          <span>中转站钱包余额</span>
          <strong>{walletBalanceDisplay(wallet)}</strong>
          {wallet ? (
            <small>{`上次刷新 ${formatTime(wallet.refreshedAtMs)}`}</small>
          ) : (
            <small>旧缓存暂不显示余额，点击“刷新令牌”即可同步当前钱包余额。</small>
          )}
          <small>仅显示当前登录中转站账户的钱包余额，不统计令牌额度。</small>
        </div>
        {tokens.length ? (
        <div className="relay-model-center" aria-label="模型中心">
          <div className="relay-model-center-head">
            <div>
              <strong>模型中心</strong>
              <small>仅展示三个授权分组；展开查看本令牌实际授权的模型。</small>
            </div>
            <label className="relay-model-search">
              <Search className="h-4 w-4" />
              <input value={modelSearch} onChange={(event) => setModelSearch(event.target.value)} placeholder="搜索模型" />
            </label>
          </div>
          <div className="relay-model-groups">
            {modelGroups.map((item) => {
              const visibleModels = normalizedSearch
                ? item.models.filter((model) => model.toLowerCase().includes(normalizedSearch))
                : item.models;
              const expanded = expandedGroups.has(item.group) || Boolean(normalizedSearch);
              return (
                <section className="relay-model-group" key={item.group}>
                  <button
                    className="relay-model-group-toggle"
                    type="button"
                    onClick={() => setExpandedGroups((current) => {
                      const next = new Set(current);
                      if (next.has(item.group)) next.delete(item.group); else next.add(item.group);
                      return next;
                    })}
                    aria-expanded={expanded}
                  >
                    {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span>{item.group}</span>
                    <UiBadge>{visibleModels.length} 个模型</UiBadge>
                  </button>
                  {expanded ? (
                    <div className="relay-model-chips">
                      {visibleModels.length ? visibleModels.map((model) => <span key={model}>{model}</span>) : <small>该令牌未授权此分组模型。</small>}
                    </div>
                  ) : null}
                  {item.group === domesticRelayGroupLabel ? (
                    <div className="relay-workbuddy-actions">
                      <div>
                        <small>一键把该分组同步进 WorkBuddy 自定义模型；只补齐缺失项与刷新密钥，不覆盖你已有的配置。</small>
                        {workbuddySummary ? (
                          <small className={isSuccessStatus(workbuddySummary.status) ? "" : "text-error"}>
                            {workbuddySummary.message}
                            {isSuccessStatus(workbuddySummary.status) && workbuddySummary.configPath
                              ? ` · ${workbuddySummary.configPath}`
                              : ""}
                          </small>
                        ) : null}
                        {workbuddySummary && isSuccessStatus(workbuddySummary.status) && !workbuddySummary.installed && workbuddySummary.downloadUrl ? (
                          <small>
                            {`未检测到 WorkBuddy，可前往 ${workbuddySummary.downloadUrl} 安装后再打开。`}
                          </small>
                        ) : null}
                      </div>
                      <Button
                        disabled={!hasDomesticTokens || workbuddyConfiguring}
                        onClick={() => void applyWorkbuddy()}
                        variant="secondary"
                      >
                        <RefreshCw className={workbuddyConfiguring ? "h-4 w-4 spin" : "h-4 w-4"} />
                        {workbuddyConfiguring ? "配置中" : "一键配置 WorkBuddy"}
                      </Button>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </div>
        ) : null}
          </>
        ) : null}
        <div className="relay-token-toolbar">
          <div>
            <strong>{memberLoggedIn ? "已登录客户端账户" : "请先登录客户端账户"}</strong>
            <small>{sync && !isSuccessStatus(sync.status) ? sync.message : tokens.length ? `已同步 ${tokens.length} 个令牌` : "点击刷新读取你自己的令牌列表"}</small>
          </div>
          <Button disabled={!memberLoggedIn || syncing} onClick={() => void onRefresh(false)} variant="secondary">
            <RefreshCw className={syncing ? "h-4 w-4 spin" : "h-4 w-4"} />
            {syncing ? "同步中" : "刷新令牌"}
          </Button>
        </div>
        {tokens.length ? (
          <div className="relay-token-list">
            {tokens.map((token) => {
              const usable = relayTokenCanApply(token);
              return (
                <div className="relay-token-row" key={token.id}>
                  <div className="relay-token-main">
                    <div className="relay-token-title">
                      <strong>{token.name || `令牌 ${token.id}`}</strong>
                      <UiBadge>{relayTokenStatus(token)}</UiBadge>
                    </div>
                    <span>{token.maskedKey} · {token.group || "默认分组"}</span>
                    <small>可用额度：{formatRelayQuota(token)} · {formatRelayTokenExpiry(token.expiredTime)}{connectionSummary[token.id] ? ` · ${connectionSummary[token.id]}` : ""}</small>
                  </div>
                  <div className="relay-token-actions">
                    <Button disabled={!usable || Boolean(applyingTokenId)} onClick={() => void applyToken(token.id)} size="sm" className={activeProfileId === `gptproxy-token-${sync?.accountId}-${token.id}` ? "relay-token-current" : ""}>
                      {applyingTokenId === token.id ? "正在应用…" : activeProfileId === `gptproxy-token-${sync?.accountId}-${token.id}` ? "当前使用中 ✓" : usable ? "设为当前令牌" : relayTokenStatus(token)}
                    </Button>
                    <Button disabled={!usable || Boolean(testingTokenId)} onClick={() => void testToken(token.id)} size="sm" variant="secondary">
                      {testingTokenId === token.id ? "测试中…" : "测试连接"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Panel>
  );
}

function formatRelayTokenExpiry(expiredTime: number): string {
  if (!expiredTime || expiredTime < 0) return "永久有效";
  return `到期：${new Date(expiredTime * 1000).toLocaleDateString("zh-CN")}`;
}

function EnvConflictNotice({
  envConflicts,
  actions,
}: {
  envConflicts: EnvConflictsResult | null;
  actions: Actions;
}) {
  const conflicts = envConflicts?.conflicts ?? [];
  if (!conflicts.length) return null;
  const names = Array.from(new Set(conflicts.map((conflict) => conflict.name))).sort();
  return (
    <div className="env-conflict-notice">
      <div className="env-conflict-icon">
        <ShieldAlert className="h-4 w-4" />
      </div>
      <div className="env-conflict-body">
        <strong>{t("检测到 OPENAI 环境变量")}</strong>
        <p>{t("这些变量可能覆盖当前供应商写入的 config.toml / auth.json；CODEX_HOME 不会被清理。")}</p>
        <div className="env-conflict-tags">
          {conflicts.map((conflict) => (
            <span key={`${conflict.source}-${conflict.name}`}>
              {conflict.name}
              <small>{envConflictSourceLabel(conflict.source)}</small>
            </span>
          ))}
        </div>
      </div>
      <div className="env-conflict-actions">
        <Button onClick={() => void actions.removeEnvConflicts(names)} size="sm">
          <Trash2 className="h-4 w-4" />
          {t("删除")}
        </Button>
        <Button onClick={() => void actions.refreshEnvConflicts(false)} size="sm" variant="secondary">
          <RefreshCw className="h-4 w-4" />
          {t("检测")}
        </Button>
      </div>
    </div>
  );
}

function envConflictSourceLabel(source: string): string {
  if (source === "process") return t("当前进程");
  if (source === "user") return t("用户环境");
  return source || t("环境变量");
}

function EnhanceScreen({
  form,
  pluginMarketplaceProgress,
  remotePluginMarketplace,
  remotePluginMarketplaceProgress,
  onFormChange,
  actions,
}: {
  form: BackendSettings;
  pluginMarketplaceProgress: TaskProgress;
  remotePluginMarketplace: RemotePluginMarketplaceResult | null;
  remotePluginMarketplaceProgress: TaskProgress;
  onFormChange: (value: BackendSettings) => void;
  actions: Actions;
}) {
  const setEnhanceFlag = (key: keyof BackendSettings, value: boolean) => onFormChange({ ...form, [key]: value });
  const masterEnabled = form.enhancementsEnabled;
  const patchMode = form.launchMode === "patch";
  const remoteMarketplaceStatus = remotePluginMarketplace?.marketplaceRoot
    ? remotePluginMarketplace.configRegistered
      ? t("已注册")
      : t("已缓存未注册")
    : t("未发现缓存");
  const remoteMarketplaceSummary = remotePluginMarketplace?.marketplaceRoot
    ? tf("已缓存 {0} 个插件 / {1} 个技能。", [
        String(remotePluginMarketplace.pluginCount),
        String(remotePluginMarketplace.skillCount),
      ])
    : t("未发现本地缓存；点击按钮会从 Codex++ 内置快照释放并注册，无需官方账号预缓存。");
  return (
    <>
      <Panel>
        <CardHead title={t("Codex增强")} detail={t("会话删除、导出、项目移动和用户脚本等界面能力")} />
        <CardContent>
          <label className="switch-row">
            <input
              checked={form.enhancementsEnabled}
              onChange={(event) => onFormChange({ ...form, enhancementsEnabled: event.currentTarget.checked })}
              type="checkbox"
            />
            <span>
              <strong>{t("启用 Codex增强")}</strong>
              <small>{t("关闭后会停用删除、导出、项目移动、插件相关和菜单位置增强。")}</small>
            </span>
          </label>
          <label className="switch-row">
            <input
              checked={form.computerUseGuardEnabled}
              onChange={(event) => onFormChange({ ...form, computerUseGuardEnabled: event.currentTarget.checked })}
              type="checkbox"
            />
            <span>
              <strong>{t("启用 Windows Computer Use Guard")}</strong>
              <small>{t("默认关闭；开启后启动 Codex 时会自动保留官方 Computer Use 插件所需的 config.toml、bundled 插件和 notify 配置。")}</small>
            </span>
          </label>
          <ModeSelector launchMode={form.launchMode} actions={actions} />
          {form.launchMode === "relay" ? (
            <div className="hint-line">
              <ShieldCheck className="h-4 w-4" />
              <span>{t("当前为兼容增强模式，插件市场解锁不会启用；其他页面功能仍可用。")}</span>
            </div>
          ) : null}
          <div className="enhance-feature-groups">
            <FeatureGroup title={t("插件与模型")} detail={t("管理插件市场、模型列表和服务档位相关增强。")}>
              <FeatureToggle title={t("插件市场解锁")} detail={t("API Key 模式下扩展插件市场请求，尽量显示完整插件列表；官方/混合模式通常不需要。")} checked={form.codexAppPluginMarketplaceUnlock} disabled={!masterEnabled || !patchMode} onChange={(value) => setEnhanceFlag("codexAppPluginMarketplaceUnlock", value)} />
              <FeatureToggle title={t("插件列表全量展示")} detail={t("进入插件页后自动连续展开“更多”，尽量一次显示完整插件列表。")} checked={form.codexAppPluginAutoExpand} disabled={!masterEnabled || !patchMode} onChange={(value) => setEnhanceFlag("codexAppPluginAutoExpand", value)} />
              <FeatureToggle title={t("模型白名单解锁")} detail={t("从环境变量和 config.toml 的 /v1/models 拉取模型并补进模型列表。")} checked={form.codexAppModelWhitelistUnlock} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppModelWhitelistUnlock", value)} />
              <FeatureToggle title={t("Fast 按钮")} detail={t("显示服务模式切换按钮；Fast 仅支持 gpt-5.4 / gpt-5.5，其他模型按 Standard 发送。")} checked={form.codexAppServiceTierControls} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppServiceTierControls", value)} />
              <div className="feature-action-row">
                <div>
                  <strong>{t("官方远端插件缓存")}</strong>
                  <small>{t("使用 Codex++ 内置快照补齐远端插件，API 模式也可显示和安装 Product Design 插件。")}</small>
                  <small>{remoteMarketplaceSummary}</small>
                </div>
                <Badge status={remotePluginMarketplace?.configRegistered ? "ok" : "not_checked"} />
                <Button
                  disabled={remotePluginMarketplaceProgress.active}
                  onClick={() => void actions.repairRemotePluginMarketplace()}
                  variant="secondary"
                >
                  {remotePluginMarketplaceProgress.active ? t("正在处理…") : t("释放并注册内置缓存")}
                </Button>
                <Button
                  disabled={remotePluginMarketplaceProgress.active}
                  onClick={() => void actions.refreshRemotePluginMarketplace()}
                  variant="outline"
                >
                  {t("刷新")}
                </Button>
                <span className="feature-action-status">{remoteMarketplaceStatus}</span>
              </div>
            </FeatureGroup>
            <FeatureGroup title={t("对话与输入")} detail={t("调整会话管理、输入行为和对话阅读体验。")}>
              <FeatureToggle title={t("会话删除")} detail={t("在会话列表悬停显示删除按钮，并支持撤销。")} checked={form.codexAppSessionDelete} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppSessionDelete", value)} />
              <FeatureToggle title={t("Markdown 导出")} detail={t("在会话列表显示导出按钮，导出带时间戳的 Markdown。")} checked={form.codexAppMarkdownExport} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppMarkdownExport", value)} />
              <FeatureToggle title={t("粘贴修复")} detail={t("从 Word 等富文本粘贴到 Codex composer 时只保留纯文本，避免被识别为图片/文件附件。需重启 Codex 才生效。")} checked={form.codexAppPasteFix} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppPasteFix", value)} />
              <FeatureToggle title={t("会话项目移动")} detail={t("把会话移动到普通对话或其他本地项目。")} checked={form.codexAppProjectMove} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppProjectMove", value)} />
              <FeatureToggle title={t("会话 ID 标识")} detail={t("在侧边栏会话标题前显示短 ID 和 UUIDv7 创建时间，方便定位历史会话。")} checked={form.codexAppThreadIdBadge} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppThreadIdBadge", value)} />
              <FeatureToggle title={t("对话居中宽度")} detail={t("把主对话和输入框限制到固定最大宽度，适合大屏阅读。")} checked={form.codexAppConversationView} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppConversationView", value)} />
              <FeatureToggle title={t("切换对话保留位置")} detail={t("切换 thread 时恢复上一次浏览位置。")} checked={form.codexAppThreadScrollRestore} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppThreadScrollRestore", value)} />
            </FeatureGroup>
            <FeatureGroup title="Stepwise" detail={t("基于当前对话生成下一步建议，使用独立 API 配置。")}>
              <FeatureToggle title="Stepwise" detail={t("在 Codex 页面显示可拖动的后续建议浮层；建议由单独配置的 Stepwise API 生成。")} checked={form.codexAppStepwiseEnabled} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppStepwiseEnabled", value)} />
              <FeatureToggle title={t("Stepwise 直接发送")} detail={t("点击建议后自动发送；关闭时只填入输入框。")} checked={form.codexAppStepwiseDirectSend} disabled={!masterEnabled || !form.codexAppStepwiseEnabled} onChange={(value) => setEnhanceFlag("codexAppStepwiseDirectSend", value)} />
            </FeatureGroup>
            <FeatureGroup title={t("界面与启动")} detail={t("控制语言、启动速度和 Codex 原生界面调整。")}>
              <FeatureToggle title={t("强制中文界面")} detail={t("强制启用 Codex App 内置 zh-CN 语言包，避免 Statsig/VPN 不通时回退英文。需重启 Codex 才能完整生效。")} checked={form.codexAppForceChineseLocale} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppForceChineseLocale", value)} />
              <FeatureToggle title={t("快速启动")} detail={t("默认关闭；无 VPN 时可开启，让 Statsig 初始化快速失败，减少启动时长。需重启 Codex 才生效。")} checked={form.codexAppFastStartup} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppFastStartup", value)} />
              <FeatureToggle title={t("原生菜单栏位置")} detail={t("把 Codex++ 菜单插入 Codex 顶部原生菜单栏。")} checked={form.codexAppNativeMenuPlacement} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppNativeMenuPlacement", value)} />
              <FeatureToggle title={t("原生菜单汉化")} detail={t("启动时通过本地主进程调试端口汉化 Codex 原生菜单；不修改安装包。需重启 Codex 才生效。")} checked={form.codexAppNativeMenuLocalization} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppNativeMenuLocalization", value)} />
            </FeatureGroup>
            <FeatureGroup title={t("远程项目")} detail={t("连接 Zed Remote 和 upstream worktree 辅助能力。")}>
              <FeatureToggle title="Zed Remote open" detail={t("远程 SSH 文件引用可直接用 Zed Remote Development 打开。")} checked={form.codexAppZedRemoteOpen} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppZedRemoteOpen", value)} />
              <FeatureToggle title={t("Zed 项目记录")} detail={t("维护 Codex++ 自己的远程项目最近列表。")} checked={form.zedRemoteProjectRegistryEnabled} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("zedRemoteProjectRegistryEnabled", value)} />
              <FeatureToggle title={t("同步 Zed settings")} detail={t("高级选项，默认关闭；当前实现不主动改写 Zed settings。")} checked={form.zedRemoteSyncToZedSettings} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("zedRemoteSyncToZedSettings", value)} />
              <FeatureToggle title="Upstream worktree" detail={t("从最新 upstream 分支创建 Git worktree。")} checked={form.codexAppUpstreamWorktreeCreate} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppUpstreamWorktreeCreate", value)} />
            </FeatureGroup>
          </div>
          <div className="hint-line">
            <Wrench className="h-4 w-4" />
            <span>{t("新机器没有本地插件市场时，可从 openai/plugins 初始化到当前 CODEX_HOME。")}</span>
            <Button disabled={pluginMarketplaceProgress.active} variant="secondary" onClick={() => void actions.repairPluginMarketplace()}>
              {pluginMarketplaceProgress.active ? t("正在修复…") : t("修复插件市场")}
            </Button>
          </div>
          <TaskProgressBox progress={pluginMarketplaceProgress} title={t("插件市场修复进度")} />
          <TaskProgressBox progress={remotePluginMarketplaceProgress} title={t("官方远端插件缓存进度")} />
          <div className="zed-remote-settings">
            <Field label={t("Zed 默认打开策略")}>
              <select
                className="select-input"
                disabled={!masterEnabled}
                onChange={(event) => onFormChange({ ...form, zedRemoteOpenStrategy: event.currentTarget.value as ZedOpenStrategy })}
                value={form.zedRemoteOpenStrategy}
              >
                <option value="addToFocusedWorkspace">{t("加入当前工作区")}</option>
                <option value="reuseWindow">{t("复用窗口")}</option>
                <option value="newWindow">{t("新窗口")}</option>
                <option value="default">{t("Zed 默认行为")}</option>
              </select>
            </Field>
          </div>
          <div className="hint-line">
            <Info className="h-4 w-4" />
            <span>{t("如果使用官方模式或官方混入 API 模式，通常不需要开启插件市场解锁。")}</span>
          </div>
          <Toolbar>
            <Button onClick={() => void actions.saveSettings()}>{t("保存增强设置")}</Button>
          </Toolbar>
        </CardContent>
      </Panel>
    </>
  );
}

function ZedRemoteScreen({
  projects,
  form,
  onFormChange,
  actions,
}: {
  projects: ZedRemoteProjectsResult | null;
  form: BackendSettings;
  onFormChange: (value: BackendSettings) => void;
  actions: Actions;
}) {
  const allProjects = projects?.projects ?? [];
  const currentProjects = allProjects.filter((project) => project.isCurrent);
  const currentIds = new Set(currentProjects.map((project) => project.id));
  const recentProjects = allProjects.filter((project) => !currentIds.has(project.id) && (project.source === "recent" || project.lastOpenedAtMs));
  const recentIds = new Set(recentProjects.map((project) => project.id));
  const discoveredProjects = allProjects.filter((project) => !currentIds.has(project.id) && !recentIds.has(project.id));
  const copyUrl = async (project: ZedRemoteProject) => {
    try {
      await navigator.clipboard.writeText(project.url);
      await actions.showMessage("Zed Remote URL", t("ssh:// URL 已复制。"), "ok");
    } catch (error) {
      await actions.showMessage(t("复制失败"), stringifyError(error), "failed");
    }
  };
  return (
    <>
      <Panel>
        <CardHead title={t("Zed 远程项目")} detail={tf("{0} 个 Codex++ 可识别项目，默认策略：{1}", [allProjects.length, zedStrategyLabel(form.zedRemoteOpenStrategy)])} />
        <CardContent>
          <div className="metric-list">
            <Metric label="Current" value={String(currentProjects.length)} />
            <Metric label="Recent" value={String(recentProjects.length)} />
            <Metric label="Discovered" value={String(discoveredProjects.length)} />
          </div>
          <div className="zed-remote-settings">
            <Field label={t("默认打开策略")}>
              <select
                className="select-input"
                onChange={(event) => onFormChange({ ...form, zedRemoteOpenStrategy: event.currentTarget.value as ZedOpenStrategy })}
                value={form.zedRemoteOpenStrategy}
              >
                <option value="addToFocusedWorkspace">{t("加入当前工作区")}</option>
                <option value="reuseWindow">{t("复用窗口")}</option>
                <option value="newWindow">{t("新窗口")}</option>
                <option value="default">{t("Zed 默认行为")}</option>
              </select>
            </Field>
            <label className="switch-row compact">
              <input
                checked={form.zedRemoteProjectRegistryEnabled}
                onChange={(event) => onFormChange({ ...form, zedRemoteProjectRegistryEnabled: event.currentTarget.checked })}
                type="checkbox"
              />
              <span>
                <strong>{t("记录最近打开")}</strong>
                <small>{t("保存到 Codex++ state，不改写 Zed settings。")}</small>
              </span>
            </label>
          </div>
          <Toolbar>
            <Button onClick={() => void actions.refreshZedRemoteProjects()}>
              <RefreshCw className="h-4 w-4" />
              {t("刷新项目")}
            </Button>
            <Button variant="secondary" onClick={() => void actions.saveSettingsValue(form, false)}>
              <Save className="h-4 w-4" />
              {t("保存策略")}
            </Button>
          </Toolbar>
        </CardContent>
      </Panel>
      <ZedRemoteProjectSection title="Current" projects={currentProjects} actions={actions} onCopyUrl={copyUrl} />
      <ZedRemoteProjectSection title="Recent" projects={recentProjects} actions={actions} onCopyUrl={copyUrl} />
      <ZedRemoteProjectSection title="Discovered from Codex" projects={discoveredProjects} actions={actions} onCopyUrl={copyUrl} />
    </>
  );
}

function ZedRemoteProjectSection({
  title,
  projects,
  actions,
  onCopyUrl,
}: {
  title: string;
  projects: ZedRemoteProject[];
  actions: Actions;
  onCopyUrl: (project: ZedRemoteProject) => Promise<void>;
}) {
  return (
    <Panel>
      <CardHead title={title} detail={tf("{0} 个项目", [projects.length])} />
      <CardContent>
        {projects.length ? (
          <div className="zed-remote-project-list">
            {projects.map((project) => (
              <div className="zed-remote-project-row" key={project.id}>
                <div className="zed-remote-project-main">
                  <div>
                    <strong>{project.label}</strong>
                    <span>{zedRemoteHostLabel(project)}</span>
                  </div>
                  <code>{project.path}</code>
                  <small>
                    {zedRemoteSourceLabel(project.source)}
                    {project.lastOpenedAtMs ? ` · ${formatTime(project.lastOpenedAtMs)}` : ""}
                  </small>
                </div>
                <div className="zed-remote-project-actions">
                  <Button onClick={() => void actions.openZedRemoteProject(project, "addToFocusedWorkspace")} size="sm">
                    <ExternalLink className="h-4 w-4" />
                    {t("加入当前工作区")}
                  </Button>
                  <Button onClick={() => void actions.openZedRemoteProject(project, "reuseWindow")} size="sm" variant="outline">
                    {t("复用窗口")}
                  </Button>
                  <Button onClick={() => void actions.openZedRemoteProject(project, "newWindow")} size="sm" variant="outline">
                    {t("新窗口")}
                  </Button>
                  <Button onClick={() => void onCopyUrl(project)} size="icon" title={t("复制 ssh:// URL")} variant="ghost">
                    <Copy className="h-4 w-4" />
                  </Button>
                  {project.source === "recent" ? (
                    <Button onClick={() => void actions.forgetZedRemoteProject(project)} size="icon" title={t("移除最近记录")} variant="ghost">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">{t("暂无项目。")}</div>
        )}
      </CardContent>
    </Panel>
  );
}

function UserScriptsScreen({ market, actions }: { market: SkillMarketResult | null; actions: Actions }) {
  const skills = market?.market.skills ?? [];
  const installedCount = skills.filter((skill) => skill.installed).length;
  return (
    <>
      <Panel>
        <CardHead title="Skill 市场" detail={tf("{0} 个官方 Skill，已安装 {1} 个", [skills.length, installedCount])} />
        <CardContent>
          <div className="metric-list">
            <Metric label={t("市场状态")} value={market?.market.message ?? t("尚未刷新")} />
            <Metric label="官方 Skill" value={tf("{0} 个", [skills.length])} />
            <Metric label={t("已安装")} value={tf("{0} 个", [installedCount])} />
            <Metric label="安装位置" value="~/.codex/skills" />
          </div>
          <Toolbar>
            <Button onClick={() => void actions.refreshSkillMarket()}>
              <RefreshCw className="h-4 w-4" />
              刷新 Skill 市场
            </Button>
          </Toolbar>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title="官方 Skill" detail={market?.market.updatedAt ? tf("清单更新时间：{0}", [market.market.updatedAt]) : "从官方服务加载"} />
        <CardContent>
          {skills.length ? (
            <div className="script-market-grid">
              {skills.map((skill) => (
                <SkillMarketCard key={skill.id} skill={skill} actions={actions} />
              ))}
            </div>
          ) : (
            <div className="empty">{market?.status === "failed" ? market.message : "点击刷新 Skill 市场加载官方技能。"}</div>
          )}
        </CardContent>
      </Panel>
    </>
  );
}

function SessionsScreen({
  settings,
  form,
  sessions,
  providerSyncProgress,
  providerSyncTargets,
  selectedProviderSyncTarget,
  onFormChange,
  actions,
}: {
  settings: SettingsResult | null;
  form: BackendSettings;
  sessions: LocalSessionsResult | null;
  providerSyncProgress: ProviderSyncProgress;
  providerSyncTargets: ProviderSyncTargetsResult | null;
  selectedProviderSyncTarget: string;
  onFormChange: (value: BackendSettings) => void;
  actions: Actions;
}) {
  const items = sessions?.sessions ?? [];
  const activeCount = items.filter((item) => !item.archived).length;
  const archivedCount = items.length - activeCount;
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(() => new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const selectedSessions = useMemo(() => items.filter((session) => selectedSessionIds.has(session.id)), [items, selectedSessionIds]);
  const selectedCount = selectedSessions.length;
  const allSelected = items.length > 0 && selectedCount === items.length;

  useEffect(() => {
    const itemIds = new Set(items.map((session) => session.id));
    setSelectedSessionIds((current) => {
      const next = new Set(Array.from(current).filter((id) => itemIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [items]);

  const toggleSessionSelection = (sessionId: string, checked: boolean) => {
    setSelectedSessionIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(sessionId);
      } else {
        next.delete(sessionId);
      }
      return next;
    });
  };

  const selectAllSessions = () => {
    setSelectionMode(true);
    setSelectedSessionIds(new Set(items.map((session) => session.id)));
  };

  const clearSelectedSessions = () => setSelectedSessionIds(new Set());

  const deleteSelectedSessions = async () => {
    if (!selectionMode) {
      setSelectionMode(true);
      return;
    }
    setBulkDeleting(true);
    try {
      await actions.deleteLocalSessions(selectedSessions);
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <>
      <Panel>
        <CardHead title={t("会话管理")} detail={t("读取 Codex 本地 SQLite 会话库，会删除数据库记录和对应 rollout 文件")} />
        <CardContent>
          <div className="metric-list">
            <Metric label={t("会话总数")} value={tf("{0} 个", [items.length])} />
            <Metric label={t("未归档")} value={tf("{0} 个", [activeCount])} />
            <Metric label={t("已归档")} value={tf("{0} 个", [archivedCount])} />
            <Metric label={t("数据库")} value={sessions?.dbPath ?? "~/.codex/sqlite/*.db"} />
          </div>
          <div className="form-row">
            <Field label={t("同步目标")}>
              <select
                className="select-input"
                disabled={providerSyncProgress.active || !(providerSyncTargets?.targets ?? []).length}
                value={selectedProviderSyncTarget}
                onChange={(event) => actions.setProviderSyncTarget(event.currentTarget.value)}
              >
                {(providerSyncTargets?.targets ?? []).map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.id}{t("（")}{providerSyncTargetLabel(target)}{t("）")}
                  </option>
                ))}
                {!(providerSyncTargets?.targets ?? []).length ? <option value="">{t("当前配置 provider")}</option> : null}
              </select>
            </Field>
          </div>
          <Toolbar>
            <Button onClick={() => void actions.refreshLocalSessions()}>
              <RefreshCw className="h-4 w-4" />
              {t("刷新会话")}
            </Button>
            <Button disabled={providerSyncProgress.active} onClick={() => void actions.syncProvidersNow()} variant="outline">
              <RefreshCw className="h-4 w-4" />
              {providerSyncProgress.active ? t("正在修复…") : t("立刻修复历史会话")}
            </Button>
          </Toolbar>
          <div className="provider-sync-progress" data-active={providerSyncProgress.active}>
            <div className="provider-sync-progress-head">
              <strong>{providerSyncProgress.active ? t("正在修复历史会话") : t("历史会话修复进度")}</strong>
              <span>{providerSyncProgress.percent}%</span>
            </div>
            <div
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={providerSyncProgress.percent}
              className="provider-sync-progress-bar"
              role="progressbar"
            >
              <div className="provider-sync-progress-fill" style={{ width: `${providerSyncProgress.percent}%` }} />
            </div>
            <small>{providerSyncProgress.message}</small>
          </div>
          <div className="hint-line">
            <Info className="h-4 w-4" />
            <span>{t("删除会创建本地备份；如果 Codex App 正在使用该会话，建议先关闭对应会话窗口再操作。")}</span>
          </div>
          <label className="switch-row">
            <input
              checked={form.providerSyncEnabled}
              onChange={(event) => onFormChange({ ...form, providerSyncEnabled: event.currentTarget.checked })}
              type="checkbox"
            />
            <span>
              <strong>{t("启动前自动修复历史会话")}</strong>
              <small>{t("开启后，通过 Codex++ 启动 Codex 前自动整理一次旧对话的归属标记。")}</small>
            </span>
          </label>
          <Toolbar>
            <Button onClick={() => void actions.saveSettings()}>{t("保存自动修复设置")}</Button>
          </Toolbar>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title={t("本地会话")} detail={items.length ? t("按更新时间倒序显示") : t("点击刷新会话读取本地数据库")} />
        <CardContent>
          {items.length ? (
            <>
              <div className="session-list-toolbar">
                <span className="session-selection-summary">{t("已选择")} {selectedCount} / {items.length} {t("个会话")}</span>
                <div className="session-selection-actions">
                  <Button disabled={allSelected || bulkDeleting} onClick={selectAllSessions} size="sm" variant="outline">
                    {t("全选当前列表")}
                  </Button>
                  <Button disabled={!selectedCount || bulkDeleting} onClick={clearSelectedSessions} size="sm" variant="outline">
                    {t("清空选择")}
                  </Button>
                  <Button disabled={(selectionMode && !selectedCount) || bulkDeleting} onClick={() => void deleteSelectedSessions()} size="sm" variant="outline">
                    {selectionMode ? <Trash2 className="h-4 w-4" /> : null}
                    {selectionMode ? (bulkDeleting ? t("正在删除…") : t("删除已选")) : t("多选")}
                  </Button>
                </div>
              </div>
              <div className="session-list">
                {items.map((session) => {
                  const selected = selectedSessionIds.has(session.id);
                  return (
                    <div className="session-row" data-selection-mode={selectionMode} data-selected={selected} key={session.id}>
                      {selectionMode ? (
                        <label className="session-select" title={t("选择会话")}>
                          <input
                            aria-label={tf("选择会话 {0}", [session.title || session.id])}
                            checked={selected}
                            onChange={(event) => toggleSessionSelection(session.id, event.currentTarget.checked)}
                            type="checkbox"
                          />
                        </label>
                      ) : null}
                      <div className="session-main">
                        <strong>{session.title || t("未命名会话")}</strong>
                        <span>{session.id}</span>
                        <small>{session.cwd || t("未记录项目路径")}</small>
                      </div>
                      <div className="session-meta">
                        <Badge status={session.archived ? "archived" : "ok"} />
                        <span>{session.modelProvider || t("provider 未记录")}</span>
                        <span>{formatTime(session.updatedAtMs ?? 0)}</span>
                      </div>
                      <Button className="session-delete-button" variant="outline" onClick={() => void actions.deleteLocalSession(session)}>
                        <Trash2 className="h-4 w-4" />
                        {t("删除")}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="empty">{t("未读取到本地会话，或当前 SQLite 会话库不存在。")}</div>
          )}
        </CardContent>
      </Panel>
    </>
  );
}

function MaintenanceScreen({
  overview,
  watcher,
  settings,
  launchForm,
  onLaunchFormChange,
  removeOwnedData,
  onRemoveOwnedDataChange,
  actions,
}: {
  overview: OverviewResult | null;
  watcher: WatcherResult | null;
  settings: SettingsResult | null;
  launchForm: { appPath: string; debugPort: string; helperPort: string };
  onLaunchFormChange: (next: { appPath: string; debugPort: string; helperPort: string }) => void;
  removeOwnedData: boolean;
  onRemoveOwnedDataChange: (value: boolean) => void;
  actions: Actions;
}) {
  const savedCodexAppPath = settings?.settings.codexAppPath ?? "";
  return (
    <>
      <Panel>
        <CardHead title={t("检查与修复")} detail={t("检查入口、Codex 应用和 Watcher 状态")} />
        <CardContent>
          <div className="status-table">
            <StatusRow title={t("Codex 应用")} status={overview?.codex_app.status} path={overview?.codex_app.path} />
            <StatusRow title={t("静默启动入口")} status={overview?.silent_shortcut.status} path={overview?.silent_shortcut.path} />
            <StatusRow title={t("管理控制台入口")} status={overview?.management_shortcut.status} path={overview?.management_shortcut.path} />
            <StatusRow title={t("Watcher 自动接管")} status={watcher?.enabled ? "ok" : "disabled"} path={watcher?.disabled_flag} />
          </div>
          <Toolbar>
            <Button onClick={() => void actions.checkHealth()}>{t("检查")}</Button>
            <Button variant="secondary" onClick={() => void actions.repairShortcuts()}>{t("修复快捷方式")}</Button>
          </Toolbar>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title={t("入口管理")} detail={t("快捷方式写入系统实际桌面位置，不使用写死桌面路径")} />
        <CardContent>
          <label className="check-row">
            <input checked={removeOwnedData} onChange={(event) => onRemoveOwnedDataChange(event.currentTarget.checked)} type="checkbox" />
            <span>{t("卸载时移除 Codex++ 托管数据")}</span>
          </label>
          <Toolbar>
            <Button onClick={() => void actions.installEntrypoints()}>{t("安装入口")}</Button>
            <Button variant="secondary" onClick={() => void actions.uninstallEntrypoints()}>{t("卸载入口")}</Button>
            <Button variant="secondary" onClick={() => void actions.repairShortcuts()}>{t("修复入口")}</Button>
          </Toolbar>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title={t("自动接管")} detail={t("Watcher 用于保持 Codex++ 接管状态")} />
        <CardContent>
          <Toolbar>
            <Button variant="secondary" onClick={() => void actions.installWatcher()}>{t("安装 watcher")}</Button>
            <Button variant="secondary" onClick={() => void actions.uninstallWatcher()}>{t("移除 watcher")}</Button>
            <Button variant="secondary" onClick={() => void actions.enableWatcher()}>{t("启用")}</Button>
            <Button variant="secondary" onClick={() => void actions.disableWatcher()}>{t("禁用")}</Button>
          </Toolbar>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title={t("Codex 应用路径")} detail={t("免安装版或解包版只需要选择一次，之后静默启动会自动复用")} />
        <CardContent>
          <div className="status-table">
            <StatusRow title={t("保存路径")} status={savedCodexAppPath ? "ok" : "not_checked"} path={savedCodexAppPath || null} />
            <StatusRow title={t("当前识别")} status={overview?.codex_app.status} path={overview?.codex_app.path} />
          </div>
          <Field label={t("保存的应用路径")}>
            <Input
              value={settings?.settings.codexAppPath ?? ""}
              placeholder={t("选择 Codex.exe、Codex.app、app 目录或解包目录")}
              readOnly
            />
          </Field>
          <Toolbar>
            <Button onClick={() => void actions.chooseCodexAppPath("folder")}>{t("选择应用目录")}</Button>
            <Button variant="secondary" onClick={() => void actions.chooseCodexAppPath("file")}>{t("选择 Codex.exe")}</Button>
            <Button variant="secondary" onClick={() => void actions.clearCodexAppPath()}>{t("清除保存路径")}</Button>
          </Toolbar>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title={t("手动启动")} detail={t("应用路径留空时使用已保存路径；没有保存路径时使用自动探测")} />
        <CardContent>
          <Field label={t("应用路径覆盖")}>
            <Input
              value={launchForm.appPath}
              onChange={(event) => onLaunchFormChange({ ...launchForm, appPath: event.currentTarget.value })}
              placeholder={savedCodexAppPath || t("例如 C:\\Program Files\\WindowsApps\\OpenAI.Codex...\\app")}
            />
          </Field>
          <div className="form-row">
            <Field label={t("Debug 端口")}>
              <Input
                value={launchForm.debugPort}
                onChange={(event) => onLaunchFormChange({ ...launchForm, debugPort: event.currentTarget.value })}
              />
            </Field>
            <Field label={t("Helper 端口")}>
              <Input
                value={launchForm.helperPort}
                onChange={(event) => onLaunchFormChange({ ...launchForm, helperPort: event.currentTarget.value })}
              />
            </Field>
          </div>
          <Toolbar>
            <Button onClick={() => void actions.launch()}>{t("启动 Codex++")}</Button>
            <Button variant="secondary" onClick={() => void actions.saveManualCodexAppPath()}>
              {t("保存为默认路径")}
            </Button>
          </Toolbar>
        </CardContent>
      </Panel>
    </>
  );
}

function AboutScreen({
  overview,
  logs,
  diagnostics,
  actions,
}: {
  overview: OverviewResult | null;
  logs: LogsResult | null;
  diagnostics: DiagnosticsResult | null;
  actions: Actions;
}) {
  return (
    <>
      <Panel>
        <CardHead title={t("关于 ♛Codework AI客户端")} detail={t("本地 Codex 增强、管理工具和安装包维护")} />
        <CardContent>
          <div className="metric-list">
            <Metric label={t("♛Codework AI客户端版本")} value={overview?.current_version ?? "-"} />
            <Metric label={t("Codex 版本")} value={overview?.codex_version ?? t("未检测到")} />
            <Metric label="客户端下载地址" value={CODEWORK_CLIENT_DOWNLOAD_URL} />
          </div>
          <Toolbar>
            <Button onClick={() => void actions.openExternalUrl(CODEWORK_CLIENT_DOWNLOAD_URL)} variant="secondary">
              <ExternalLink className="h-4 w-4" />
              打开客户端下载页
            </Button>
          </Toolbar>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title={t("版本更新")} detail={t("Codework 独立分发版")} />
        <CardContent>
          <div className="empty">{t("此版本不连接原版更新服务；新版本由 Codework 重新发布安装包。")}</div>
        </CardContent>
      </Panel>
      <LogsPanel logs={logs} actions={actions} />
      <DiagnosticsPanel diagnostics={diagnostics} actions={actions} />
    </>
  );
}

function VisualThemeScreen({ form, onFormChange, actions }: { form: BackendSettings; onFormChange: (next: BackendSettings) => void; actions: Actions }) {
  const [serviceUrl, setServiceUrl] = useState(form.codexAppVisualThemeServiceUrl);
  const serviceUrlDraftRef = useRef(form.codexAppVisualThemeServiceUrl);
  const lastSavedThemeServiceUrlRef = useRef(form.codexAppVisualThemeServiceUrl);
  const [onlineManifest, setOnlineManifest] = useState<VisualThemeManifest | null>(() => {
    return readVisualThemeManifestCache(form.codexAppVisualThemeServiceUrl);
  });
  const [serviceStatus, setServiceStatus] = useState(onlineManifest ? "已使用缓存主题" : "使用本地主题");
  const [applyingThemeId, setApplyingThemeId] = useState<string | null>(null);
  const [isRestoringTheme, setIsRestoringTheme] = useState(false);
  const mountedRef = useRef(true);
  const requestRef = useRef(0);
  const initialRefreshRef = useRef<string | null>(null);
  const [previewAssets, setPreviewAssets] = useState<Record<string, string>>({});
  const themeOperationBusy = applyingThemeId !== null || isRestoringTheme;
  const customDreamSkin = useMemo(
    () => form.codexAppImageOverlayEnabled && form.codexAppImageOverlayPath.trim()
      ? createCustomDreamSkin({ dominant: "#f6aac4", luma: 0.72 }, form.codexAppImageOverlayPath)
      : null,
    [form.codexAppImageOverlayEnabled, form.codexAppImageOverlayPath],
  );
  const setServiceUrlDraft = (next: string) => {
    serviceUrlDraftRef.current = next;
    setServiceUrl(next);
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshOnlineThemes = useCallback(async (inputUrl: string) => {
    const requestId = ++requestRef.current;
    const normalizedUrl = normalizeThemeServiceUrl(inputUrl);
    if (!normalizedUrl) {
      setServiceStatus("主题服务地址仅支持 http 或 https");
      return;
    }

    setServiceStatus("正在刷新在线主题…");
    try {
      const result = await invoke<CommandResult<VisualThemeManifest>>("load_visual_theme_manifest");
      if (!isSuccessStatus(result.status)) throw new Error(result.message || "主题服务响应异常");
      const { status: _status, message: _message, ...manifest } = result;
      if (!isSafeThemeManifest(manifest)) throw new Error("主题清单未通过安全校验");
      if (mountedRef.current && requestRef.current === requestId) {
        writeVisualThemeManifestCache(normalizedUrl, manifest);
        setOnlineManifest(manifest);
        setServiceStatus("在线主题已刷新");
      }
    } catch {
      if (mountedRef.current && requestRef.current === requestId) {
        const cachedManifest = readVisualThemeManifestCache(normalizedUrl);
        setOnlineManifest(cachedManifest);
        setServiceStatus(cachedManifest ? "在线主题不可用，已使用缓存主题" : "在线主题不可用，已使用本地主题");
      }
    }
  }, []);

  useEffect(() => {
    const savedUrl = form.codexAppVisualThemeServiceUrl;
    if (serviceUrlDraftRef.current === lastSavedThemeServiceUrlRef.current) setServiceUrlDraft(savedUrl);
    lastSavedThemeServiceUrlRef.current = savedUrl;
  }, [form.codexAppVisualThemeServiceUrl]);

  useEffect(() => {
    const normalizedUrl = normalizeThemeServiceUrl(form.codexAppVisualThemeServiceUrl);
    if (!normalizedUrl || initialRefreshRef.current !== null) return;
    initialRefreshRef.current = normalizedUrl;
    void refreshOnlineThemes(normalizedUrl);
  }, [form.codexAppVisualThemeServiceUrl, refreshOnlineThemes]);

  const themes = useMemo(() => {
    const merged = new Map(builtInVisualThemes.map((theme) => [theme.id, theme]));
    onlineManifest?.themes.forEach((theme) => merged.set(theme.id, theme));
    if (customDreamSkin) merged.set(customDreamSkin.id, customDreamSkin);
    return themesVisibleToMember({
      version: onlineManifest?.version ?? "builtin",
      updatedAt: onlineManifest?.updatedAt,
      themes: [...merged.values()],
      allowedThemeIds: onlineManifest?.allowedThemeIds,
    });
  }, [customDreamSkin, onlineManifest]);
  const themeFeedback = useMemo(() => buildThemeFeedback(onlineManifest), [onlineManifest]);

  useEffect(() => {
    let disposed = false;
    const pending = themes.filter((theme) => theme.authorized && theme.previewAsset && !previewAssets[theme.previewAsset]);
    if (!pending.length) return;
    void Promise.all(pending.map(async (theme) => {
      for (const assetName of themePreviewAssetCandidates(theme)) {
        try {
          const result = await invoke<CommandResult<{ dataUri: string }>>("load_visual_theme_asset", { assetName });
          if (isSuccessStatus(result.status) && typeof result.dataUri === "string") return [theme.previewAsset!, result.dataUri] as const;
        } catch {
        }
      }
      return null;
    })).then((loaded) => {
      if (disposed) return;
      const next = Object.fromEntries(loaded.filter((item): item is readonly [string, string] => item !== null));
      if (Object.keys(next).length) setPreviewAssets((current) => ({ ...current, ...next }));
    });
    return () => { disposed = true; };
  }, [previewAssets, themes]);

  const saveServiceUrl = async () => {
    const normalizedUrl = normalizeThemeServiceUrl(serviceUrl);
    if (serviceUrl.trim() && !normalizedUrl) {
      setServiceStatus("主题服务地址仅支持 http 或 https");
      return;
    }
    const next = { ...form, codexAppVisualThemeServiceUrl: normalizedUrl ?? "" };
    onFormChange(next);
    setServiceUrlDraft(normalizedUrl ?? "");
    await actions.saveVisualThemeSettings(
      next.codexAppVisualThemeEnabled,
      next.codexAppVisualThemeId,
      next.codexAppVisualThemeServiceUrl,
      false,
    );
    if (mountedRef.current) setServiceStatus("主题服务地址已保存");
  };

  const apply = async (id: string) => {
    if (themeOperationBusy) return;
    const normalizedUrl = normalizeThemeServiceUrl(serviceUrl);
    if (serviceUrl.trim() && !normalizedUrl) {
      setServiceStatus("主题服务地址仅支持 http 或 https");
      return;
    }
    const selectedTheme = themes.find((theme) => theme.id === id);
    if (!selectedTheme?.authorized) {
      setServiceStatus("限定主题 · 请联系管理员开通");
      return;
    }
    const next = {
      ...form,
      codexAppVisualThemeServiceUrl: normalizedUrl ?? "",
      codexAppVisualThemeEnabled: true,
      codexAppVisualThemeId: id,
    };
    setApplyingThemeId(id);
    try {
      await runVisualThemeTransition({
        enabled: true,
        themeId: id,
        serviceUrl: normalizedUrl ?? "",
        displayName: selectedTheme.name,
      }, {
        saveSettings: id === "custom-dream-skin"
          ? async (enabled, themeId, nextServiceUrl) => {
            const saved = await actions.saveSettingsValue(next, true);
            return saved && actions.saveVisualThemeSettings(enabled, themeId, nextServiceUrl, true);
          }
          : (enabled, themeId, nextServiceUrl) => actions.saveVisualThemeSettings(enabled, themeId, nextServiceUrl, false),
        restart: actions.restart,
        verifyRuntime: async (themeId, sinceMs) => {
          try {
            const result = await invoke<DreamSkinStatusResult>("dream_skin_status", { sinceMs });
            if (!isSuccessStatus(result.status)) return { state: "pending" as const, themeId };
            const state = result.dreamSkinState === "active"
              ? "active"
              : result.dreamSkinState === "failed"
                ? "failed"
                : "pending";
            return {
              state,
              themeId: result.themeId ?? undefined,
              message: result.runtimeMessage ?? undefined,
            };
          } catch {
            return { state: "pending" as const, themeId };
          }
        },
        setStatus: setServiceStatus,
      });
      onFormChange(next);
    } catch (error) {
      setServiceStatus(stringifyError(error));
    } finally {
      setApplyingThemeId(null);
    }
  };

  const restoreOfficialTheme = async () => {
    if (themeOperationBusy) return;
    const next = { ...form, codexAppVisualThemeEnabled: false };
    setIsRestoringTheme(true);
    try {
      await runVisualThemeTransition({
        enabled: false,
        themeId: next.codexAppVisualThemeId,
        serviceUrl: next.codexAppVisualThemeServiceUrl,
        displayName: "官方默认",
      }, {
        saveSettings: (enabled, themeId, nextServiceUrl) => actions.saveVisualThemeSettings(enabled, themeId, nextServiceUrl, false),
        restart: actions.restart,
        setStatus: setServiceStatus,
      });
      onFormChange(next);
    } catch (error) {
      setServiceStatus(stringifyError(error));
    } finally {
      setIsRestoringTheme(false);
    }
  };

  return <div className="stack visual-theme-screen">
    <Panel>
      <CardHead title="视觉个性化 Pro" detail="主题会在重启 Codex++ 后立即应用；可从在线主题服务安全刷新。" />
      <CardContent>
        <Field label="主题服务地址">
          <Input value={serviceUrl} onChange={(event) => setServiceUrlDraft(event.currentTarget.value)} placeholder="http://服务器公网IP:28080" />
        </Field>
        <div className="actions">
          <Button disabled={themeOperationBusy} variant="secondary" onClick={() => void saveServiceUrl()}>保存服务地址</Button>
          <Button disabled={themeOperationBusy} variant="secondary" onClick={() => void refreshOnlineThemes(serviceUrl)}>刷新在线主题</Button>
        </div>
        <div className={themeOperationBusy ? "theme-operation-status busy" : "theme-operation-status"} role="status" aria-live="polite">
          <span className="theme-operation-indicator" aria-hidden="true" />
          <span>服务状态：{serviceStatus}</span>
        </div>
        {onlineManifest ? <p className="muted">在线版本：{onlineManifest.version} · {onlineManifest.updatedAt ?? "未提供更新时间"}</p> : null}
        {serviceStatus.includes("本地") || serviceStatus.includes("缓存") ? <p className="muted">网络失败时已使用本地/缓存主题。</p> : null}
        <Card className="theme-card">
          <CardHeader>
            <CardTitle>主题同步反馈</CardTitle>
            <CardDescription>刷新在线主题后，这里会直接显示本次账号可用的主题和云端同步结果。</CardDescription>
          </CardHeader>
          <CardContent>
            {onlineManifest ? <div className="stack compact-stack">
              <p className="muted">在线已加载：{themeFeedback.onlineThemeCount} 款主题</p>
              <p className="muted">已授权限定主题：{themeFeedback.authorisedRestrictedNames.length ? themeFeedback.authorisedRestrictedNames.join("、") : "当前账号尚未获得限定主题授权"}</p>
              <p className="muted">云端梦境：{themeFeedback.cloudDreamAvailable ? "已同步到主题清单，可直接应用" : "未出现在当前清单。请点击“刷新在线主题”；若仍未出现，请确认服务端已更新且账号已授权。"}</p>
            </div> : <p className="muted">尚未获得在线主题清单。请检查主题服务地址后点击“刷新在线主题”。</p>}
            {serviceStatus.includes("本地") || serviceStatus.includes("缓存") ? <p className="muted">当前显示的是本地/缓存结果，建议网络恢复后重新刷新，确认云端梦境和授权状态。</p> : null}
          </CardContent>
        </Card>
        <Card className="theme-card custom-dream-skin-card">
          <CardHeader>
            <CardTitle>自定义皮肤</CardTitle>
            <CardDescription>选择本地壁纸后生成 Dream Skin 浅色沉浸主题；图片只保留在你的电脑。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="actions">
              <Button disabled={themeOperationBusy} variant="secondary" onClick={() => void actions.chooseImageOverlayPath()}>选择本地壁纸</Button>
              <Button disabled={themeOperationBusy || !customDreamSkin} onClick={() => customDreamSkin && void apply(customDreamSkin.id)}>{applyingThemeId === "custom-dream-skin" ? "正在应用…" : "应用自定义皮肤"}</Button>
            </div>
            <p className="muted">{customDreamSkin ? `已选择：${form.codexAppImageOverlayPath}` : "支持 PNG、JPG、JPEG、WebP；请使用没有界面文字的壁纸。"}</p>
            <p className="muted">推荐 16:9（1920×1080 或 2560×1440）；3:2、4:3 和竖图会自动完整显示，左右以主题底色自然补齐。</p>
          </CardContent>
        </Card>
        <div className="theme-grid">
          {themes.map((item) => {
            const builtInDetail = builtInVisualThemes.find((theme) => theme.id === item.id)?.detail;
            const applied = isAppliedVisualTheme({ enabled: form.codexAppVisualThemeEnabled, selectedId: form.codexAppVisualThemeId, item });
            return <Card key={item.id} className={applied ? "theme-card selected" : "theme-card"}>
              {item.previewAsset && previewAssets[item.previewAsset] ? <div className="theme-card-preview"><img alt={`${item.name} 主题预览`} src={previewAssets[item.previewAsset]} /></div> : null}
              <CardHeader><CardTitle>{item.name}</CardTitle><CardDescription>{item.detail ?? builtInDetail ?? "在线 Pro 主题"}</CardDescription></CardHeader>
              <CardContent><Button disabled={themeOperationBusy || !item.authorized} onClick={() => void apply(item.id)}>{!item.authorized ? "限定主题 · 请联系管理员开通" : applyingThemeId === item.id ? "正在应用…" : applied ? "重新应用" : "立即应用"}</Button></CardContent>
            </Card>;
          })}
        </div>
        <div className="actions">
          <Button disabled={themeOperationBusy} variant="secondary" onClick={() => void restoreOfficialTheme()}>{isRestoringTheme ? "正在恢复…" : "恢复官方默认"}</Button>
        </div>
      </CardContent>
    </Panel>
  </div>;
}

function SettingsScreen({
  settings,
  theme,
  form,
  onFormChange,
  actions,
}: {
  settings: SettingsResult | null;
  theme: Theme;
  form: BackendSettings;
  onFormChange: (value: BackendSettings) => void;
  actions: Actions;
}) {
  return (
    <>
      <Panel>
        <CardHead title={t("基础设置")} detail={settings?.settings_path ?? ""} />
        <CardContent>
          <div className="theme-row">
            <div>
              <strong>{t("界面主题")}</strong>
              <span>{t("当前为")}{theme === "dark" ? t("深色") : t("浅色")}{t("模式。")}</span>
            </div>
            <Button variant="secondary" onClick={actions.toggleTheme}>{t("切换主题")}</Button>
          </div>
          <Field label={t("供应商测试模型")}>
            <Input
              value={form.relayTestModel}
              onChange={(event) => onFormChange({ ...form, relayTestModel: event.currentTarget.value })}
              placeholder={t("例如 gpt-5.4-mini")}
            />
          </Field>
          <div className="settings-block stepwise-settings-block">
            <div className="section-title">Stepwise</div>
            <div className="stepwise-settings-section">{t("连接")}</div>
            <div className="form-row">
              <Field label="Base URL">
                <Input
                  value={form.codexAppStepwiseBaseUrl}
                  onChange={(event) => onFormChange({ ...form, codexAppStepwiseBaseUrl: event.currentTarget.value })}
                  placeholder="https://api.example.com/v1"
                />
              </Field>
              <Field label="Model">
                <Input
                  value={form.codexAppStepwiseModel}
                  onChange={(event) => onFormChange({ ...form, codexAppStepwiseModel: event.currentTarget.value })}
                  placeholder={t("例如 gpt-5.4-mini")}
                />
              </Field>
            </div>
            <Field label="API Key">
              <Input
                type="password"
                value={form.codexAppStepwiseApiKey}
                onChange={(event) => onFormChange({ ...form, codexAppStepwiseApiKey: event.currentTarget.value })}
              />
            </Field>
            <details className="stepwise-advanced">
              <summary>{t("高级参数")}</summary>
              <div className="form-row">
                <Field label={t("API Key 环境变量")}>
                  <Input
                    value={form.codexAppStepwiseApiKeyEnv}
                    onChange={(event) => onFormChange({ ...form, codexAppStepwiseApiKeyEnv: event.currentTarget.value })}
                  />
                </Field>
                <Field label={t("最多建议数")}>
                  <Input
                    max={6}
                    min={0}
                    type="number"
                    value={form.codexAppStepwiseMaxItems}
                    onChange={(event) =>
                      onFormChange({ ...form, codexAppStepwiseMaxItems: clampNumber(Number(event.currentTarget.value), 0, 6) })
                    }
                  />
                </Field>
              </div>
              <div className="form-row">
                <Field label={t("超时毫秒")}>
                  <Input
                    min={1000}
                    type="number"
                    value={form.codexAppStepwiseTimeoutMs}
                    onChange={(event) =>
                      onFormChange({ ...form, codexAppStepwiseTimeoutMs: clampNumber(Number(event.currentTarget.value), 1000, 60000) })
                    }
                  />
                </Field>
                <Field label={t("最大输入字符")}>
                  <Input
                    min={1000}
                    type="number"
                    value={form.codexAppStepwiseMaxInputChars}
                    onChange={(event) =>
                      onFormChange({ ...form, codexAppStepwiseMaxInputChars: clampNumber(Number(event.currentTarget.value), 1000, 24000) })
                    }
                  />
                </Field>
              </div>
              <Field label={t("最大输出 tokens")}>
                <Input
                  min={100}
                  type="number"
                  value={form.codexAppStepwiseMaxOutputTokens}
                  onChange={(event) =>
                    onFormChange({ ...form, codexAppStepwiseMaxOutputTokens: clampNumber(Number(event.currentTarget.value), 100, 4000) })
                  }
                />
              </Field>
            </details>
            <div className="toolbar stepwise-settings-actions">
              <Button variant="secondary" onClick={() => void actions.testStepwiseSettings(form)}>{t("测试连接")}</Button>
              <Button onClick={() => void actions.saveSettings()}>{t("保存设置")}</Button>
            </div>
          </div>
          <div className="settings-block">
            <label className="check-row">
              <input
                checked={form.codexAppImageOverlayEnabled}
                onChange={(event) =>
                  onFormChange({ ...form, codexAppImageOverlayEnabled: event.currentTarget.checked })
                }
                type="checkbox"
              />
              <span>{t("启用 Codex 图片覆盖层")}</span>
            </label>
            <div className="form-row">
              <Field label={t("覆盖图片")}>
                <Input
                  value={form.codexAppImageOverlayPath}
                  onChange={(event) => onFormChange({ ...form, codexAppImageOverlayPath: event.currentTarget.value })}
                  placeholder={t("选择 png / jpg / webp / gif / bmp")}
                />
              </Field>
              <Toolbar>
                <Button variant="secondary" onClick={() => void actions.chooseImageOverlayPath()}>
                  {t("选择图片")}
                </Button>
              </Toolbar>
            </div>
            <Field label={tf("透明度 {0}%", [form.codexAppImageOverlayOpacity])}>
              <Input
                min={1}
                max={100}
                type="range"
                value={form.codexAppImageOverlayOpacity}
                onChange={(event) =>
                  onFormChange({
                    ...form,
                    codexAppImageOverlayOpacity: clampNumber(Number(event.currentTarget.value), 1, 100),
                  })
                }
              />
            </Field>
            <Field label={t("背景适配方式")}>
              <select
                className="select-input"
                value={form.codexAppImageOverlayFitMode}
                onChange={(event) =>
                  onFormChange({
                    ...form,
                    codexAppImageOverlayFitMode: event.currentTarget.value as ImageOverlayFitMode,
                  })
                }
              >
                <option value="fill">{t("填充")}</option>
                <option value="fit">{t("适应")}</option>
                <option value="stretch">{t("拉伸")}</option>
                <option value="tile">{t("平铺")}</option>
                <option value="center">{t("居中")}</option>
              </select>
            </Field>
          </div>
          <Toolbar>
            <Button onClick={() => void actions.saveSettings()}>{t("保存设置")}</Button>
            <Button variant="secondary" onClick={() => void actions.resetImageOverlaySettings()}>
              {t("重置背景")}
            </Button>
          </Toolbar>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title={t("Codex 启动参数")} detail={t("启动 Codex App 时追加到默认 CDP 参数后。留空则保持默认启动行为。")} />
        <CardContent>
          <Field label={t("额外参数")}>
            <Textarea
              className="launch-args-input"
              placeholder="--force_high_performance_gpu"
              spellCheck={false}
              value={codexExtraArgsToInput(form.codexExtraArgs)}
              onChange={(event) =>
                onFormChange({
                  ...form,
                  codexExtraArgs: inputToCodexExtraArgs(event.currentTarget.value),
                })
              }
            />
          </Field>
          <p className="field-hint">{t("每行一个参数，例如 --force_high_performance_gpu。不需要填写 open 或 --args。")}</p>
          <Toolbar>
            <Button onClick={() => void actions.saveSettings()}>{t("保存设置")}</Button>
          </Toolbar>
        </CardContent>
      </Panel>
    </>
  );
}

function LogsPanel({ logs, actions }: { logs: LogsResult | null; actions: Actions }) {
  const lines = splitLogLines(logs?.text ?? "");
  return (
    <Panel>
      <CardHead title={t("最近日志")} detail={logs?.path ?? ""} />
      <CardContent>
        <div className="log-lines">
          {lines.length ? (
            lines.map((line, index) => (
              <div className="log-line" key={`${index}-${line.slice(0, 12)}`}>
                <span>{index + 1}</span>
                <code>{line || " "}</code>
              </div>
            ))
          ) : (
            <div className="empty">{t("暂无日志。")}</div>
          )}
        </div>
        <Toolbar>
          <Button onClick={() => void actions.refreshLogs()}>{t("刷新")}</Button>
          <Button variant="secondary" onClick={() => void actions.copyLogs()}>
            {t("复制")}
          </Button>
        </Toolbar>
      </CardContent>
    </Panel>
  );
}

function DiagnosticsPanel({ diagnostics, actions }: { diagnostics: DiagnosticsResult | null; actions: Actions }) {
  return (
    <Panel>
      <CardHead title={t("诊断报告")} detail={t("包含版本、状态摘要和平台信息，可安全发送给售后")} />
      <CardContent>
        <p className="muted-copy">报告只包含版本、运行状态和功能开关摘要；不会包含 API Key、登录令牌、密码或完整配置内容。</p>
        <Textarea className="log-view tall" readOnly value={diagnostics?.report ?? t("尚未生成诊断报告。")} />
        <Toolbar>
          <Button onClick={() => void actions.refreshDiagnostics()}>{t("重新生成")}</Button>
          <Button variant="secondary" onClick={() => void actions.copyDiagnostics()}>
            {t("复制报告")}
          </Button>
        </Toolbar>
      </CardContent>
    </Panel>
  );
}

function RelayProfileList({
  form,
  onFormChange,
  onEdit,
  disabled = false,
  actions,
}: {
  form: BackendSettings;
  onFormChange: (value: BackendSettings) => void;
  onEdit: (id: string) => void;
  disabled?: boolean;
  actions: Actions;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const next = reorderRelayProfiles(form, String(active.id), String(over.id));
    if (next !== form) onFormChange(next);
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={form.relayProfiles.map((profile) => profile.id)} strategy={verticalListSortingStrategy}>
        <div className="relay-profile-list">
          {form.relayProfiles.map((profile, index) => (
            <SortableRelayProfileCard
              actions={actions}
              form={form}
              index={index}
              key={profile.id}
              onEdit={onEdit}
              onFormChange={onFormChange}
              disabled={disabled}
              profile={profile}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableRelayProfileCard({
  form,
  profile,
  index,
  onFormChange,
  onEdit,
  disabled = false,
  actions,
}: {
  form: BackendSettings;
  profile: RelayProfile;
  index: number;
  onFormChange: (value: BackendSettings) => void;
  onEdit: (id: string) => void;
  disabled?: boolean;
  actions: Actions;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: profile.id });
  const active = profile.id === form.activeRelayId;
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      className={`relay-profile-card ${active ? "active" : ""} ${isDragging ? "dragging" : ""}`}
      data-relay-profile-id={profile.id}
      key={profile.id}
      onKeyDown={(event) => {
        if (event.key === "Enter") onEdit(profile.id);
      }}
      ref={setNodeRef}
      style={style}
      tabIndex={0}
    >
      <button
        aria-label={t("拖动排序")}
        className="relay-drag"
        title={t("拖动排序")}
        type="button"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="relay-index" title={profile.name || t("未命名供应商")}>
        {providerInitial(profile.name)}
      </span>
      <span className="relay-summary">
        <strong>{profile.name || t("未命名供应商")}</strong>
        <small>{relayModeLabel(profile.relayMode)} · {relayProtocolLabel(profile.protocol)} · {relayProfileConfigBrief(profile)}</small>
      </span>
      <span className="relay-card-actions">
        <Button
          className={`relay-use-button ${active ? "active" : ""}`}
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            if (disabled) return;
            const previousActiveRelayId = form.activeRelayId;
            const next = syncLegacyRelayFields({ ...form, activeRelayId: profile.id });
            void actions.switchRelayProfile(next, previousActiveRelayId);
          }}
          size="sm"
          title={disabled ? t("供应商切换不可用") : active ? t("当前正在使用") : t("设为当前")}
          variant={active ? "secondary" : "outline"}
        >
          <CheckCircle2 className="h-4 w-4" />
          {active ? t("使用中") : t("使用")}
        </Button>
        <span className="relay-card-extra">
          <Button
            disabled={isAggregateRelayProfile(profile)}
            onClick={(event) => {
              event.stopPropagation();
              if (isAggregateRelayProfile(profile)) return;
              void actions.testRelayProfile(profile);
            }}
            size="icon"
            title={isAggregateRelayProfile(profile) ? t("聚合供应商会在真实对话中轮转成员，请测试成员供应商") : t("发送 hi 测试")}
            variant="ghost"
          >
            <TestTube className="h-4 w-4" />
          </Button>
          <Button
            onClick={(event) => {
              event.stopPropagation();
              onEdit(profile.id);
            }}
            size="icon"
            title={t("编辑")}
            variant="ghost"
          >
            <Edit3 className="h-4 w-4" />
          </Button>
          <Button
            onClick={(event) => {
              event.stopPropagation();
              onFormChange(duplicateRelayProfile(form, profile.id));
            }}
            size="icon"
            title={t("复制")}
            variant="ghost"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            disabled={form.relayProfiles.length <= 1}
            onClick={(event) => {
              event.stopPropagation();
              onFormChange(removeRelayProfile(form, profile.id));
            }}
            size="icon"
            title={t("删除供应商")}
            variant="ghost"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </span>
      </span>
    </div>
  );
}

function SkillMarketCard({ skill, actions }: { skill: SkillMarketItem; actions: Actions }) {
  const [showUsage, setShowUsage] = useState(false);
  const status = skill.updateAvailable ? "可更新" : skill.installed ? tf("已安装 {0}", [skill.installedVersion]) : "未安装";
  const usageRows = skillUsageGuideRows(skill.usage);
  return (
    <div className="script-market-card">
      <div className="script-market-title">
        <div>
          <strong>{skill.name}</strong>
          <span>{skill.author || "Codework AI 官方"}</span>
        </div>
        <UiBadge variant={skill.updateAvailable ? "default" : skill.installed ? "secondary" : "outline"}>{status}</UiBadge>
      </div>
      <p className="script-market-description">{skill.description || "暂无功能说明"}</p>
      <div className="script-market-tags">
        <span className="script-market-tag">v{skill.version}</span>
        {skill.tags.map((tag) => (
          <span className="script-market-tag" key={tag}>{tag}</span>
        ))}
      </div>
      <div className="script-market-actions">
        <Button onClick={() => void actions.installMarketSkill(skill.id)} size="sm" disabled={skill.installed && !skill.updateAvailable}>
          <Download className="h-4 w-4" />
          {skillActionLabel(skill)}
        </Button>
        {usageRows.length ? (
          <Button onClick={() => setShowUsage((current) => !current)} size="sm" variant="secondary">
            <Info className="h-4 w-4" />
            {showUsage ? "收起说明" : "使用说明"}
          </Button>
        ) : null}
        {skill.homepage ? (
          <Button onClick={() => void actions.openExternalUrl(skill.homepage)} size="sm" variant="secondary">
            <ExternalLink className="h-4 w-4" />
            {t("主页")}
          </Button>
        ) : null}
      </div>
      {showUsage && usageRows.length ? (
        <div className="skill-usage-guide">
          {usageRows.map(([label, value]) => (
            <div key={label}>
              <strong>{label}</strong>
              <span>{value}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RelayProfileDetail({
  profile,
  relayFiles,
  form,
  isNew = false,
  onBack,
  onFormChange,
  onSaved,
  actions,
}: {
  profile: RelayProfile;
  relayFiles: RelayFilesResult | null;
  form: BackendSettings;
  isNew?: boolean;
  onBack: () => void;
  onFormChange: (value: BackendSettings) => void | Promise<void>;
  onSaved?: () => void;
  actions: Actions;
}) {
  const [draft, setDraft] = useState<RelayProfile>(profile);
  const [modelWindowRows, setModelWindowRows] = useState<ModelWindowRow[]>(
    modelWindowRowsFromProfile(profile.modelList, profile.modelWindows || ""),
  );
  const isActive = !isNew && profile.id === form.activeRelayId;
  const profileUsesLiveFiles = relayProfileUsesLiveFiles(profile);
  useEffect(() => {
    const nextDraft = isAggregateRelayProfile(profile)
      ? normalizeAggregateRelayProfile(profile, form)
      : deriveRelayProfileFromFiles(
          isActive && profileUsesLiveFiles && relayFiles
            ? {
              ...profile,
              configContents: relayFiles.configContents,
              authContents: relayFiles.authContents,
            }
            : profile,
        );
    setDraft(nextDraft);
    setModelWindowRows(modelWindowRowsFromProfile(nextDraft.modelList, nextDraft.modelWindows || ""));
  }, [profile.id, profile.modelList, profile.modelWindows, profileUsesLiveFiles, isActive, isNew, relayFiles?.configContents, relayFiles?.authContents]);
  const validationError = isAggregateRelayProfile(draft) ? aggregateRelayProfileValidation(draft) : null;
  const draftWithModelRows = () => {
    const serializedRows = serializeModelWindowRows(modelWindowRows);
    return { ...draft, modelList: serializedRows.modelList, modelWindows: serializedRows.modelWindows };
  };
  const saveDraft = async () => {
    if (validationError) return;
    const draftWithWindows = draftWithModelRows();
    const normalizedDraft = isAggregateRelayProfile(draftWithWindows) ? normalizeAggregateRelayProfile(draftWithWindows, form) : deriveRelayProfileFromFiles(draftWithWindows);
    const next = isNew
      ? addRelayProfile(form, normalizedDraft)
      : updateRelayProfile(form, profile.id, normalizedDraft);
    await onFormChange(next);
    if (isActive && relayProfileUsesLiveFiles(normalizedDraft)) {
      await actions.saveRelayFile(
        "config",
        effectiveRelayConfigPreview(normalizedDraft, form, normalizedDraft),
        true,
      );
      await actions.saveRelayFile("auth", normalizedDraft.authContents, true);
    }
    onSaved?.();
  };
  const switchDraft = () => {
    if (isNew || !form.relayProfilesEnabled) return;
    const draftWithWindows = draftWithModelRows();
    const normalizedDraft = isAggregateRelayProfile(draftWithWindows) ? normalizeAggregateRelayProfile(draftWithWindows, form) : deriveRelayProfileFromFiles(draftWithWindows);
    const previousActiveRelayId = form.activeRelayId;
    const next = syncLegacyRelayFields({
      ...form,
      relayProfiles: form.relayProfiles.map((item) => (item.id === profile.id ? normalizedDraft : item)),
      activeRelayId: profile.id,
    });
    void actions.switchRelayProfile(next, previousActiveRelayId);
  };
  return (
    <div className="relay-detail-page" key={profile.id}>
      <div className="relay-detail-sticky">
        <Toolbar>
          <Button onClick={onBack} variant="secondary">
            <ArrowLeft className="h-4 w-4" />
            {t("返回列表")}
          </Button>
          <Button disabled={!!validationError} onClick={() => void saveDraft()} title={validationError || t("保存")}>
            <Save className="h-4 w-4" />
            {t("保存")}
          </Button>
        </Toolbar>
      </div>
        <RelayProfileEditor profile={draft} form={form} isNew={isNew} onProfileChange={setDraft} onSwitch={switchDraft} actions={actions} modelWindowRows={modelWindowRows} setModelWindowRows={setModelWindowRows} />
      {isAggregateRelayProfile(draft) ? null : (
      <RelayFileEditors
        contextProfile={profile}
        profile={draft}
        form={form}
        isActive={isActive}
        profileId={profile.id}
        onFormChange={onFormChange}
        onProfileChange={setDraft}
        actions={actions}
      />
      )}
    </div>
  );
}

function ContextScreen({
  form,
  liveEntries,
  relayFiles,
  onFormChange,
  actions,
}: {
  form: BackendSettings;
  liveEntries: CodexContextEntries | null;
  relayFiles: RelayFilesResult | null;
  onFormChange: (value: BackendSettings) => void;
  actions: Actions;
}) {
  return (
    <Panel fill>
      <CardHead title={t("Codex 工具与插件")} detail={t("独立管理 Codex 的 MCP、Skills、Plugins；切换任意供应商都会带上。")} />
      <CardContent>
        <RelayContextManager
          form={normalizeSettings(form)}
          liveEntries={liveEntries}
          relayFiles={relayFiles}
          onFormChange={onFormChange}
          actions={actions}
        />
      </CardContent>
    </Panel>
  );
}

function RelayProfileEditor({
  profile,
  form,
  isNew = false,
  onProfileChange,
  onSwitch,
  actions,
  modelWindowRows,
  setModelWindowRows,
}: {
  profile: RelayProfile;
  form: BackendSettings;
  isNew?: boolean;
  onProfileChange: (value: RelayProfile) => void;
  onSwitch: () => void;
  actions: Actions;
  modelWindowRows: ModelWindowRow[];
  setModelWindowRows: (value: ModelWindowRow[]) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [doctorResult, setDoctorResult] = useState<ProviderDoctorResult | null>(null);
  const [doctorOpen, setDoctorOpen] = useState(false);
  const [doctorRunning, setDoctorRunning] = useState(false);
  if (isAggregateRelayProfile(profile)) {
    return (
      <AggregateRelayProfileEditor
        profile={profile}
        form={form}
        isNew={isNew}
        onProfileChange={onProfileChange}
      />
    );
  }

  const showApiFields = profile.relayMode !== "official" || profile.officialMixApiKey;
  const updateDraft = (patch: Partial<RelayProfile>) => {
    onProfileChange(applyRelayProfilePatchToFiles(profile, patch, { allowGenerateFiles: isNew }));
  };
  const updateModelWindowRow = (index: number, patch: Partial<ModelWindowRow>) => {
    setModelWindowRows(
      modelWindowRows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  };
  const removeModelWindowRow = (index: number) => {
    const nextRows = modelWindowRows.filter((_, rowIndex) => rowIndex !== index);
    setModelWindowRows(nextRows.length ? nextRows : [{ model: "", window: "" }]);
  };
  const addModelWindowRows = (rows: ModelWindowRow[]) => {
    setModelWindowRows(mergeModelWindowRows(modelWindowRows, rows));
  };
  const runProviderDoctor = async () => {
    setDoctorOpen(true);
    setDoctorRunning(true);
    setDoctorResult(null);
    const serializedRows = serializeModelWindowRows(modelWindowRows);
    const result = await actions.diagnoseRelayProfile(
      deriveRelayProfileFromFiles({
        ...profile,
        modelList: serializedRows.modelList,
        modelWindows: serializedRows.modelWindows,
      }),
    );
    setDoctorResult(result);
    setDoctorRunning(false);
  };
  return (
    <div className="relay-profile-editor">
      <div className="relay-editor-head">
        <div>
          <strong>{profile.name || t("未命名供应商")}</strong>
          <span>{relayProfileEditorStatus(profile, form, isNew)}</span>
        </div>
        {isNew ? null : (
          <Button
            disabled={!form.relayProfilesEnabled || actions.relaySwitching}
            onClick={onSwitch}
            title={!form.relayProfilesEnabled ? t("供应商配置总开关已关闭") : actions.relaySwitching ? t("供应商切换中") : undefined}
            variant={profile.id === form.activeRelayId ? "secondary" : "default"}
          >
            {actions.relaySwitching ? t("切换中") : profile.id === form.activeRelayId ? t("使用中") : t("设为当前")}
          </Button>
        )}
      </div>
      {isNew ? (
        <ProviderPresetSelector
          onSelect={(patch: PresetPatch) => {
            updateDraft(patch as unknown as Partial<RelayProfile>);
          }}
        />
      ) : null}
      <div className="relay-fields">
        <Field className="relay-field-name" label={t("名称")}>
          <Input
            value={profile.name}
            onChange={(event) => updateDraft({ name: event.currentTarget.value })}
          />
        </Field>
        <Field className="relay-field-mode" label={t("接入模式")}>
          <select
            className="field-select"
            value={profile.relayMode}
            onChange={(event) => {
              const relayMode = event.currentTarget.value as RelayMode;
              updateDraft(relayMode === "official" ? { relayMode, officialMixApiKey: false } : { relayMode });
            }}
          >
            <option value="official">{t("官方登录")}</option>
            <option value="pureApi">{t("纯 API")}</option>
          </select>
        </Field>
        <Field className="relay-field-config-model" label={t("配置模型")}>
          <Input
            value={profile.model}
            onChange={(event) => updateDraft({ model: event.currentTarget.value })}
            placeholder={t("例如 deepseek-v4-pro")}
          />
          <p className="field-hint">
            {t("默认启动 Codex 时使用的模型名，请勿带后缀；上下文窗口请在下方「模型列表」中按模型单独配置。")}
          </p>
        </Field>
        <Field className="relay-field-goals" label={t("Codex 目标")}>
          <label className="inline-check">
            <input
              checked={configHasCodexGoalsFeature(profile.configContents)}
              onChange={(event) =>
                updateDraft({
                  configContents: setCodexGoalsFeatureInConfig(profile.configContents, event.currentTarget.checked),
                })
              }
              type="checkbox"
            />
            <span>{t("启用目标功能")}</span>
          </label>
        </Field>
        <div className="relay-advanced-toggle">
          <Button
            aria-expanded={showAdvanced}
            onClick={() => setShowAdvanced((current) => !current)}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Settings className="h-4 w-4" />
            {t("更多选项")}
          </Button>
        </div>
        {showAdvanced ? (
          <div className="relay-advanced-fields">
            <Field className="relay-field-test-model" label={t("测试模型")}>
              <Input
                value={profile.testModel}
                onChange={(event) => updateDraft({ testModel: event.currentTarget.value })}
                placeholder={tf("留空使用默认：{0}", [form.relayTestModel || defaultSettings.relayTestModel])}
              />
            </Field>
            <Field className="relay-field-context-window" label={t("上下文大小")}>
              <Input
                inputMode="numeric"
                value={profile.contextWindow}
                onChange={(event) => updateDraft({ contextWindow: event.currentTarget.value.replace(/[^\d]/g, "") })}
                placeholder={t("留空不改写，例如 200000")}
              />
            </Field>
            <Field className="relay-field-auto-compact" label={t("压缩上下文大小")}>
              <Input
                inputMode="numeric"
                value={profile.autoCompactLimit}
                onChange={(event) => updateDraft({ autoCompactLimit: event.currentTarget.value.replace(/[^\d]/g, "") })}
                placeholder={t("留空不改写，例如 160000")}
              />
            </Field>
          </div>
        ) : null}
        {profile.relayMode === "official" ? (
          <Field className="relay-field-official-key" label="API Key">
            <label className="inline-check">
              <input
                checked={profile.officialMixApiKey}
                onChange={(event) => updateDraft({ officialMixApiKey: event.currentTarget.checked })}
                type="checkbox"
              />
              <span>{t("混入 API KEY")}</span>
            </label>
          </Field>
        ) : null}
        {showApiFields ? (
          <div className="relay-api-fields">
            <Field className="relay-field-base-url" label="Base URL">
              <Input
                value={profile.baseUrl}
                onChange={(event) => updateDraft({ baseUrl: event.currentTarget.value })}
                placeholder={t("填写中转服务 Base URL")}
              />
            </Field>
            <Field className="relay-field-key" label="Key">
              <Input
                type="password"
                value={profile.apiKey}
                onChange={(event) => updateDraft({ apiKey: event.currentTarget.value })}
                placeholder={t("输入中转服务的 API Key")}
              />
            </Field>
            <Field className="relay-field-protocol" label={t("上游协议")}>
              <div className="protocol-options">
                <button
                  className={`protocol-option ${profile.protocol === "responses" ? "active" : ""}`}
                  onClick={() => updateDraft({ protocol: "responses" })}
                  type="button"
                >
                  Responses API
                </button>
                <button
                  className={`protocol-option ${profile.protocol === "chatCompletions" ? "active" : ""}`}
                  onClick={() => updateDraft({ protocol: "chatCompletions" })}
                  type="button"
                >
                  Chat Completions
                </button>
              </div>
            </Field>
          </div>
        ) : null}
        {showApiFields ? (
          <div className="provider-doctor">
            <div className="provider-doctor-head">
              <div>
                <strong>Provider Doctor</strong>
                <span>{t("检查配置、模型列表和一次真实请求，定位供应商不可用原因。")}</span>
              </div>
              <Button onClick={() => void runProviderDoctor()} size="sm" type="button" variant="secondary">
                <Stethoscope className="h-4 w-4" />
                {t("诊断供应商")}
              </Button>
            </div>
            <span>{doctorResult?.summary ?? t("点击后会打开诊断弹框，按步骤检查供应商。")}</span>
          </div>
        ) : null}
        {showApiFields ? (
          <Field className="relay-field-model-list" label={t("模型列表")}>
            <div className="relay-model-row-editor">
              <div className="relay-model-row relay-model-row-head">
                <span>{t("模型名称")}</span>
                <span>{t("上下文窗口")}</span>
                <span />
              </div>
              {modelWindowRows.map((row, index) => (
                <div className="relay-model-row" key={`${index}-${row.model}`}>
                  <Input
                    value={row.model}
                    onChange={(event) => updateModelWindowRow(index, { model: event.currentTarget.value })}
                    placeholder="deepseek/deepseek-v4-flash"
                  />
                  <Input
                    value={row.window}
                    onChange={(event) => updateModelWindowRow(index, { window: event.currentTarget.value })}
                    placeholder="1M"
                  />
                  <Button
                    aria-label={t("删除模型")}
                    onClick={() => removeModelWindowRow(index)}
                    size="icon"
                    title={t("删除模型")}
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="relay-model-list-tools">
              <Button
                onClick={() => setModelWindowRows([...modelWindowRows, { model: "", window: "" }])}
                size="sm"
                type="button"
                variant="secondary"
              >
                <Plus className="h-4 w-4" />
                {t("添加模型")}
              </Button>
              <Button
                onClick={async () => {
                  const serializedRows = serializeModelWindowRows(modelWindowRows);
                  const models = await actions.fetchRelayProfileModels({
                    ...profile,
                    modelList: serializedRows.modelList,
                    modelWindows: serializedRows.modelWindows,
                  });
                  if (models?.length) {
                    addModelWindowRows(models.map((model) => ({ model, window: "" })));
                  }
                }}
                size="sm"
                type="button"
                variant="secondary"
              >
                <Download className="h-4 w-4" />
                {t("从上游获取")}
              </Button>
            </div>
            <p className="field-hint">
              {t("每行一个模型；上下文窗口可填")} <code>1M</code>{t("、")}<code>200K</code> {t("或")} <code>1000000</code>{t("，留空表示使用 Codex 默认长度。")}
            </p>
          </Field>
        ) : null}
        {showApiFields ? (
          <Field className="relay-field-user-agent" label="User-Agent">
            <Input
              value={profile.userAgent}
              onChange={(event) => updateDraft({ userAgent: event.currentTarget.value })}
              placeholder={t("留空使用默认值")}
            />
          </Field>
        ) : null}
      </div>
      {showApiFields && profile.protocol === "chatCompletions" ? (
        <div className="hint-line relay-protocol-hint">
          <MessageCircle className="h-4 w-4" />
          <span>{t("此上游会通过本地 127.0.0.1:57321 转成 Responses API，需要从 Codex++ 启动 Codex。")}</span>
        </div>
      ) : null}
      <div className="hint-line relay-protocol-hint">
        <ShieldCheck className="h-4 w-4" />
        <span>{relayProfileModeHelp(profile)}</span>
      </div>
      {doctorOpen ? (
        <ProviderDoctorModal
          result={doctorResult}
          running={doctorRunning}
          onClose={() => {
            if (!doctorRunning) setDoctorOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function AggregateRelayProfileEditor({
  profile,
  form,
  isNew = false,
  onProfileChange,
}: {
  profile: RelayProfile;
  form: BackendSettings;
  isNew?: boolean;
  onProfileChange: (value: RelayProfile) => void;
}) {
  const candidates = aggregateMemberCandidates(form, profile.id);
  const aggregate = normalizeAggregateConfig(profile.aggregate, candidates);
  const memberIds = new Set(aggregate.members.map((member) => member.profileId));
  const updateAggregate = (nextAggregate: RelayAggregateConfig) => {
    onProfileChange(normalizeAggregateRelayProfile({ ...profile, aggregate: nextAggregate }, form));
  };
  const toggleMember = (profileId: string, checked: boolean) => {
    const members = checked
      ? [...aggregate.members, { profileId, weight: 1 }]
      : aggregate.members.filter((member) => member.profileId !== profileId);
    updateAggregate({ ...aggregate, members });
  };
  const updateWeight = (profileId: string, weight: number) => {
    updateAggregate({
      ...aggregate,
      members: aggregate.members.map((member) =>
        member.profileId === profileId ? { ...member, weight: clampAggregateWeight(weight) } : member,
      ),
    });
  };
  const totalWeight = aggregate.members.reduce((total, member) => total + clampAggregateWeight(member.weight), 0);

  return (
    <div className="relay-profile-editor aggregate-editor">
      <div className="relay-editor-head">
        <div>
          <strong>{profile.name || t("未命名聚合供应商")}</strong>
          <span>{isNew ? t("选择已有供应商作为成员，保存后写入 settings payload") : t("聚合配置只引用已有供应商，不复制 Key 和配置文件")}</span>
        </div>
        <UiBadge variant="secondary">{t("聚合")}</UiBadge>
      </div>
      <div className="relay-fields aggregate-fields">
        <Field className="relay-field-name" label={t("名称")}>
          <Input
            value={profile.name}
            onChange={(event) => onProfileChange({ ...profile, name: event.currentTarget.value })}
            placeholder={t("例如 主力聚合池")}
          />
        </Field>
        <Field className="relay-field-test-model" label={t("测试模型")}>
          <Input
            value={profile.testModel}
            onChange={(event) => onProfileChange({ ...profile, testModel: event.currentTarget.value })}
            placeholder={tf("留空使用默认：{0}", [form.relayTestModel || defaultSettings.relayTestModel])}
          />
        </Field>
        <Field className="aggregate-strategy-field" label={t("聚合策略")}>
          <select
            className="field-select"
            value={aggregate.strategy}
            onChange={(event) => updateAggregate({ ...aggregate, strategy: event.currentTarget.value as RelayAggregateStrategy })}
          >
            {aggregateStrategyOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="aggregate-strategy-grid">
        {aggregateStrategyOptions.map((option) => (
          <button
            className={`mode-option aggregate-strategy-option ${aggregate.strategy === option.value ? "active" : ""}`}
            key={option.value}
            onClick={() => updateAggregate({ ...aggregate, strategy: option.value })}
            type="button"
          >
            <strong>{option.label}</strong>
            <span>{option.description}</span>
          </button>
        ))}
      </div>
      <div className="aggregate-members">
        <div className="aggregate-members-head">
          <div>
            <strong>{t("成员供应商")}</strong>
            <span>{t("只能勾选已填写 Base URL / Key 的 API 供应商，聚合供应商不会作为成员。")}</span>
          </div>
          <UiBadge variant="outline">{aggregate.members.length} / {candidates.length}</UiBadge>
        </div>
        {candidates.length ? (
          <div className="aggregate-member-list">
            {candidates.map((candidate) => {
              const member = aggregate.members.find((item) => item.profileId === candidate.id);
              const checked = memberIds.has(candidate.id);
              return (
                <label className={`aggregate-member-row ${checked ? "selected" : ""}`} key={candidate.id}>
                  <input
                    checked={checked}
                    onChange={(event) => toggleMember(candidate.id, event.currentTarget.checked)}
                    type="checkbox"
                  />
                  <span className="aggregate-member-summary">
                    <strong>{candidate.name || t("未命名供应商")}</strong>
                    <small>{relayModeLabel(candidate.relayMode)} · {relayProtocolLabel(candidate.protocol)} · {relayProfileConfigBrief(candidate)}</small>
                  </span>
                  <span className="aggregate-weight-box">
                    <span>{t("权重")}</span>
                    <Input
                      disabled={!checked}
                      min={1}
                      onChange={(event) => updateWeight(candidate.id, Number.parseInt(event.currentTarget.value, 10))}
                      type="number"
                      value={String(member?.weight ?? 1)}
                    />
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <div className="empty">{t("先添加至少 1 个已填写 Base URL / Key 的 API 供应商，再创建聚合供应商。")}</div>
        )}
      </div>
      <div className="relay-grid compact aggregate-preview">
        <Metric label={t("策略")} value={aggregateStrategyLabel(aggregate.strategy)} />
        <Metric label={t("成员数量")} value={tf("{0} 个", [aggregate.members.length])} />
        <Metric label={t("总权重")} value={`${totalWeight}`} />
        <Metric label={t("序列化字段")} value="aggregate.strategy / aggregate.members" />
      </div>
      <div className="hint-line relay-protocol-hint">
        <ShieldCheck className="h-4 w-4" />
        <span>{aggregateStrategyHelp(aggregate.strategy)}</span>
      </div>
    </div>
  );
}

function RelayContextManager({
  form,
  liveEntries,
  relayFiles,
  onFormChange,
  actions,
}: {
  form: BackendSettings;
  liveEntries: CodexContextEntries | null;
  relayFiles: RelayFilesResult | null;
  onFormChange: (value: BackendSettings) => void;
  actions: Actions;
}) {
  const entries = contextEntriesWithLiveEntries(form, liveEntries);
  const [activeKind, setActiveKind] = useState<ContextKind>("mcp");
  const [editor, setEditor] = useState<{ kind: ContextKind; entry?: CodexContextEntry } | null>(null);
  const visibleEntries = contextEntriesByKind(entries, activeKind);
  const label = contextKindLabel(activeKind);

  const saveEntry = async (kind: ContextKind, id: string, tomlBody: string) => {
    const next = await actions.upsertContextEntry(form, kind, id, tomlBody);
    if (!next) return;
    onFormChange(next);
    setEditor(null);
  };

  const toggleContextEntryEnabled = async (entry: CodexContextEntry) => {
    const nextBody = setContextEntryEnabled(entry.tomlBody, !entry.enabled);
    const next = await actions.upsertContextEntry(form, entry.kind, entry.id, nextBody);
    if (!next) return;
    onFormChange(next);
    const syncResult = await actions.syncLiveContextEntries(next, true);
    if (syncResult && isSuccessStatus(syncResult.status)) {
      void actions.refreshRelayFiles();
    }
  };

  const deleteEntry = async (entry: CodexContextEntry) => {
    const next = await actions.deleteContextEntry(form, entry.kind, entry.id);
    if (!next) return;
    onFormChange(next);
  };

  return (
    <div className="relay-context-panel">
      <div className="relay-context-head">
        <div>
          <strong>{t("Codex 工具与插件")}</strong>
          <span>{t("MCP、Skills、Plugins 作为全局配置独立管理，切换任意供应商都会合并。")}</span>
        </div>
        <div className="relay-context-head-actions">
          <Button onClick={() => setEditor({ kind: activeKind })} size="sm" variant="secondary">
            <Plus className="h-4 w-4" />
            {t("新增")}{label}
          </Button>
        </div>
      </div>
      <div className="segmented">
        {contextKindOptions.map((option) => (
          <button
            className={activeKind === option.kind ? "active" : ""}
            key={option.kind}
            onClick={() => setActiveKind(option.kind)}
            type="button"
          >
            <span>{option.label}</span>
            <small>{contextEntriesByKind(entries, option.kind).length}</small>
          </button>
        ))}
      </div>
      <div className="relay-context-summary">
        {t("当前共有")} {visibleEntries.length} {t("个")}{label}{t("；这些条目独立于供应商保存，会写入所有供应商切换后的 config.toml。")}
      </div>
      <div className="relay-context-list">
        {visibleEntries.length ? (
          visibleEntries.map((entry) => (
            <div className="relay-context-row" key={`${entry.kind}-${entry.id}`}>
              <strong className="context-title">{entry.title || entry.id}</strong>
              <div className="relay-context-actions">
                <button
                  aria-checked={entry.enabled}
                  aria-label={`contextEnabledSwitch-${entry.kind}-${entry.id}`}
                  className={`context-enabled-switch ${entry.enabled ? "active" : ""}`}
                  onClick={() => void toggleContextEntryEnabled(entry)}
                  role="switch"
                  title={entry.enabled ? t("禁用此扩展项") : t("启用此扩展项")}
                  type="button"
                >
                  <span className="context-switch-track" aria-hidden="true">
                    <span className="context-switch-thumb" />
                  </span>
                </button>
                <Button onClick={() => setEditor({ kind: entry.kind, entry })} size="icon" title={t("编辑扩展项")} variant="ghost">
                  <Edit3 className="h-4 w-4" />
                </Button>
                <Button
                  className="relay-context-delete"
                  onClick={() => void deleteEntry(entry)}
                  size="icon"
                  title={t("删除扩展项")}
                  variant="ghost"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        ) : (
          <div className="empty">{t("暂无")}{label}{t("，可以从通用配置文件或这里新增。")}</div>
        )}
      </div>
      {editor ? (
        <ContextEntryEditor
          entry={editor.entry}
          kind={editor.kind}
          onCancel={() => setEditor(null)}
          onSave={(kind, id, tomlBody) => void saveEntry(kind, id, tomlBody)}
        />
      ) : null}
    </div>
  );
}

function ContextEntryEditor({
  kind,
  entry,
  onCancel,
  onSave,
}: {
  kind: ContextKind;
  entry?: CodexContextEntry;
  onCancel: () => void;
  onSave: (kind: ContextKind, id: string, tomlBody: string) => void;
}) {
  const [draftKind, setDraftKind] = useState<ContextKind>(entry?.kind ?? kind);
  const [id, setId] = useState(entry?.id ?? "");
  const [tomlBody, setTomlBody] = useState(entry?.tomlBody ?? "");
  const canSave = id.trim().length > 0;

  return (
    <div className="context-editor">
      <div className="context-editor-fields">
        <Field label={t("类型")}>
          <select
            className="field-select"
            disabled={!!entry}
            value={draftKind}
            onChange={(event) => setDraftKind(event.currentTarget.value as ContextKind)}
          >
            {contextKindOptions.map((option) => (
              <option key={option.kind} value={option.kind}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="ID">
          <Input
            disabled={!!entry}
            value={id}
            onChange={(event) => setId(event.currentTarget.value.trim())}
            placeholder={t("例如 context7")}
          />
        </Field>
      </div>
      <Field label={t("TOML 配置体")}>
        <Textarea
          className="context-editor-textarea"
          value={tomlBody}
          onChange={(event) => setTomlBody(event.currentTarget.value)}
          placeholder={t("只填写表头下面的内容，例如：\ncommand = \"npx\"\nargs = [\"-y\", \"@upstash/context7-mcp\"]")}
          spellCheck={false}
        />
      </Field>
      <Toolbar>
        <Button disabled={!canSave} onClick={() => onSave(draftKind, id.trim(), tomlBody)} size="sm">
          <Save className="h-4 w-4" />
          {t("保存扩展项")}
        </Button>
        <Button onClick={onCancel} size="sm" variant="secondary">{t("取消")}</Button>
      </Toolbar>
    </div>
  );
}

function SyncedTextarea({
  value,
  onValueChange,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}) {
  const [localValue, setLocalValue] = useState(value);
  const isFocusedRef = useRef(false);
  const latestExternalValueRef = useRef(value);

  useEffect(() => {
    latestExternalValueRef.current = value;
    if (!isFocusedRef.current) {
      setLocalValue(value);
    }
  }, [value]);

  return (
    <Textarea
      className={className}
      value={localValue}
      onBlur={() => {
        isFocusedRef.current = false;
        setLocalValue(latestExternalValueRef.current);
      }}
      onChange={(event) => {
        const next = event.currentTarget.value;
        setLocalValue(next);
        onValueChange(next);
      }}
      onFocus={() => {
        isFocusedRef.current = true;
      }}
      spellCheck={false}
    />
  );
}

function RelayFileEditors({
  contextProfile,
  profile,
  form,
  isActive,
  profileId,
  onFormChange,
  onProfileChange,
  actions,
}: {
  contextProfile: RelayProfile;
  profile: RelayProfile;
  form: BackendSettings;
  isActive: boolean;
  profileId: string;
  onFormChange: (value: BackendSettings) => void;
  onProfileChange: (value: RelayProfile) => void;
  actions: Actions;
}) {
  const configPreview = effectiveRelayConfigPreview(profile, form, contextProfile);
  const entries = contextEntriesForProfile(form, contextProfile);
  return (
    <div className="relay-file-grid">
      <div className="relay-file-panel">
        <div className="relay-file-head">
          <div>
            <strong>{t("config.toml 预览")}</strong>
            <span>{isActive ? t("当前供应商切换后会写入的预览；上下文开关变化会立即反映") : t("切换到此供应商时会写入的预览；上下文开关变化会立即反映")}</span>
          </div>
        </div>
        <SyncedTextarea
          className="relay-file-textarea"
          value={configPreview}
          onValueChange={(value) => {
            const withoutCommon = stripCommonConfigTextFallback(
              value,
              relayCombinedCommonConfig(form),
            );
            const configContents = stripContextEntriesFromConfig(withoutCommon, entries);
            onProfileChange(deriveRelayProfileFromFiles({
              ...profile,
              configContents,
            }));
          }}
        />
      </div>
      <div className="relay-file-panel">
        <div className="relay-file-head">
          <div>
            <strong>{t("通用配置文件")}</strong>
            <span>{t("只保留非 MCP、Skills、Plugins 的跨供应商配置；工具与插件在独立页面管理。")}</span>
          </div>
          <Button
            onClick={async () => {
              const extracted = await actions.extractRelayCommonConfig(profile.configContents || "");
              if (!extracted) return;
              const split = splitContextConfigText(extracted.commonConfigContents || "");
              if (!split.common.trim() && !split.context.trim()) {
                await actions.showMessage(t("通用配置文件"), t("当前供应商 config.toml 里没有可提取的通用配置。"), "failed");
                return;
              }
              const promotedProfile = {
                ...profile,
                configContents: extracted.profileConfigContents,
              };
              const next = syncLegacyRelayFields({
                ...form,
                relayCommonConfigContents: split.common,
                relayContextConfigContents: joinTomlSectionsRootFirst([form.relayContextConfigContents || "", split.context]),
                relayProfiles: form.relayProfiles.map((item) => (item.id === profileId ? promotedProfile : item)),
              });
              onFormChange(next);
              onProfileChange(promotedProfile);
              await actions.saveSettingsValue(next, false);
            }}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Download className="h-4 w-4" />
            {t("提取当前供应商配置")}
          </Button>
        </div>
        <SyncedTextarea
          className="relay-file-textarea"
          value={form.relayCommonConfigContents}
          onValueChange={(value) => onFormChange({ ...form, relayCommonConfigContents: value })}
        />
      </div>
      <div className="relay-file-panel">
        <div className="relay-file-head">
          <div>
            <strong>auth.json</strong>
            <span>{isActive ? t("当前使用中：打开时从 ~/.codex/auth.json 回填，保存后会作为此供应商 auth 存档") : t("切换到此供应商时会写入 ~/.codex/auth.json")}</span>
          </div>
        </div>
        <SyncedTextarea
          className="relay-file-textarea"
          value={profile.authContents}
          onValueChange={(value) => onProfileChange(deriveRelayProfileFromFiles({ ...profile, authContents: value }))}
        />
      </div>
    </div>
  );
}

function ProviderDoctorModal({
  result,
  running,
  onClose,
}: {
  result: ProviderDoctorResult | null;
  running: boolean;
  onClose: () => void;
}) {
  const steps = providerDoctorSteps(result, running);
  const doneCount = steps.filter((step) => step.state === "ok" || step.state === "warning" || step.state === "failed").length;
  const progress = Math.round((doneCount / steps.length) * 100);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card provider-doctor-modal">
        <div className="modal-head">
          <div>
            <h2>Provider Doctor</h2>
            <p>{running ? t("正在诊断供应商，请稍候。") : result?.summary ?? t("诊断已完成。")}</p>
          </div>
          <UiBadge variant={result && !isSuccessStatus(result.status) ? "outline" : "secondary"}>
            {running ? t("诊断中") : result && !isSuccessStatus(result.status) ? t("异常") : t("完成")}
          </UiBadge>
        </div>
        <div className="provider-doctor-progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} role="progressbar">
          <div style={{ width: `${progress}%` }} />
        </div>
        <div className="provider-doctor-step-list">
          {steps.map((step) => (
            <div className={`provider-doctor-step ${step.state}`} key={step.id}>
              <span className="provider-doctor-step-icon">
                {step.state === "running" ? (
                  <RefreshCw className="h-4 w-4" />
                ) : step.state === "ok" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : step.state === "warning" ? (
                  <ShieldAlert className="h-4 w-4" />
                ) : step.state === "failed" ? (
                  <Info className="h-4 w-4" />
                ) : (
                  <span />
                )}
              </span>
              <div>
                <strong>{step.title}</strong>
                <small>{step.detail}</small>
              </div>
            </div>
          ))}
        </div>
        {result?.recommendation ? <p className="provider-doctor-recommendation">{result.recommendation}</p> : null}
        <div className="modal-actions">
          <Button disabled={running} onClick={onClose} variant="secondary">
            {running ? t("诊断中") : t("关闭")}
          </Button>
        </div>
      </div>
    </div>
  );
}

type ProviderDoctorStepState = "pending" | "running" | "ok" | "warning" | "failed";

function providerDoctorSteps(
  result: ProviderDoctorResult | null,
  running: boolean,
): Array<{ id: string; title: string; detail: string; state: ProviderDoctorStepState }> {
  const base = [
    { id: "config", title: t("配置完整性"), pending: t("等待检查 Base URL / API Key。") },
    { id: "models", title: t("模型列表"), pending: t("等待检查 /v1/models。") },
    { id: "request", title: t("真实请求"), pending: t("等待发送一次测试请求。") },
    { id: "recommendation", title: t("处理建议"), pending: t("等待生成建议。") },
  ];
  if (!result) {
    return base.map((step, index) => ({
      id: step.id,
      title: step.title,
      detail: index === 0 && running ? t("正在检查配置完整性…") : step.pending,
      state: index === 0 && running ? "running" : "pending",
    }));
  }
  const checks = new Map(result.checks.map((check) => [check.id, check]));
  return base.map((step) => {
    if (step.id === "recommendation") {
      return {
        id: step.id,
        title: step.title,
        detail: result.recommendation || step.pending,
        state: result.status === "failed" ? "warning" : "ok",
      };
    }
    const check = checks.get(step.id);
    if (!check) {
      return {
        id: step.id,
        title: step.title,
        detail: step.id === "models" || step.id === "request" ? t("该步骤未执行。") : step.pending,
        state: "pending",
      };
    }
    return {
      id: step.id,
      title: check.title || step.title,
      detail: check.detail,
      state: check.status === "ok" ? "ok" : check.status === "warning" ? "warning" : "failed",
    };
  });
}

function ModeSelector({ launchMode, actions }: { launchMode: LaunchMode; actions: Actions }) {
  return (
    <div className="mode-grid">
      <button
        className={`mode-option ${launchMode === "relay" ? "active" : ""}`}
        onClick={() => void actions.setLaunchMode("relay")}
        type="button"
      >
        <strong>{t("兼容增强")}</strong>
        <span>{t("适合官方登录或官方混入 API Key；保留会话删除、导出、项目移动和用户脚本，关闭插件市场相关增强。")}</span>
      </button>
      <button
        className={`mode-option ${launchMode === "patch" ? "active" : ""}`}
        onClick={() => void actions.setLaunchMode("patch")}
        type="button"
      >
        <strong>{t("完整增强")}</strong>
        <span>{t("适合纯 API；启用插件市场、会话删除导出、项目移动等全部页面能力。")}</span>
      </button>
    </div>
  );
}

function FeatureItem({ title, detail, enabled }: { title: string; detail: string; enabled: boolean }) {
  return (
    <div className="feature-item">
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <Badge status={enabled ? "ok" : "disabled"} />
    </div>
  );
}

function FeatureGroup({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return (
    <section className="feature-group">
      <div className="feature-group-head">
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      <div className="feature-switch-grid">{children}</div>
    </section>
  );
}

function FeatureToggle({
  title,
  detail,
  checked,
  disabled = false,
  onChange,
}: {
  title: string;
  detail: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={`feature-toggle ${disabled ? "disabled" : ""}`}>
      <input
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
        type="checkbox"
      />
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <Badge status={!disabled && checked ? "ok" : "disabled"} />
    </label>
  );
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function GuideList({ items }: { items: string[] }) {
  return (
    <div className="guide-list">
      {items.map((item, index) => (
        <div className="guide-step" key={item}>
          <span>{index + 1}</span>
          <p>{item}</p>
        </div>
      ))}
    </div>
  );
}

function NoticeDialog({
  notice,
  onClose,
}: {
  notice: { title: string; message: string; status?: Status };
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 4200);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      <div className={`toast-card ${notice.status === "failed" ? "failed" : ""}`}>
        <div className="toast-progress" />
        <div className="toast-icon">
          {notice.status === "failed" ? <Bell className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
        </div>
        <div className="toast-body">
          <h2>{notice.title}</h2>
          <p>{notice.message}</p>
        </div>
        <button className="toast-close" onClick={onClose} type="button">×</button>
      </div>
    </div>
  );
}

function ConfirmDialog({
  confirm,
  onConfirm,
  onCancel,
}: {
  confirm: { title: string; message: string; confirmText: string; cancelText: string };
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <h2>{confirm.title}</h2>
            <p className="modal-message">{confirm.message}</p>
          </div>
          <button className="toast-close" onClick={onCancel} type="button">×</button>
        </div>
        <Toolbar>
          <Button onClick={onConfirm}>
            <Trash2 className="h-4 w-4" />
            {confirm.confirmText}
          </Button>
          <Button onClick={onCancel} variant="secondary">{confirm.cancelText}</Button>
        </Toolbar>
      </div>
    </div>
  );
}

function PendingProviderImportDialog({
  request,
  onConfirm,
  onDismiss,
}: {
  request: ProviderImportRequest;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card provider-import-modal">
        <div className="modal-head">
          <div>
            <h2>{t("导入 Codex++ 供应商")}</h2>
            <p>{t("检测到来自网页的供应商配置导入请求，确认后会写入本机 Codex++ 管理工具。")}</p>
          </div>
          <button className="toast-close" onClick={onDismiss} type="button">×</button>
        </div>
        <div className="metric-list">
          <Metric label={t("名称")} value={request.name || t("未命名供应商")} />
          <Metric label="Base URL" value={request.baseUrl || t("未填写")} />
          <Metric label={t("协议")} value={providerImportWireApiLabel(request.wireApi)} />
          <Metric label={t("模式")} value={providerImportRelayModeLabel(request.relayMode)} />
          <Metric label="API Key" value={maskSecret(request.apiKey)} />
        </div>
        <Toolbar>
          <Button onClick={onConfirm}>
            <Download className="h-4 w-4" />
            {t("确认导入")}
          </Button>
          <Button onClick={onDismiss} variant="secondary">{t("取消")}</Button>
        </Toolbar>
      </div>
    </div>
  );
}

function TaskProgressBox({ progress, title, completedTitle = t("上次修复结果") }: { progress: TaskProgress; title: string; completedTitle?: string }) {
  if (!progress.active && progress.percent <= 0) return null;
  return (
    <div className="provider-sync-progress task-progress" data-active={progress.active}>
      <div className="provider-sync-progress-head">
        <strong>{progress.active ? title : completedTitle}</strong>
        <span>{progress.percent}%</span>
      </div>
      <div
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={progress.percent}
        className="provider-sync-progress-bar"
        role="progressbar"
      >
        <div className="provider-sync-progress-fill" style={{ width: `${progress.percent}%` }} />
      </div>
      <small>{progress.message}</small>
    </div>
  );
}

function Panel({ children, fill = false, className = "" }: { children: React.ReactNode; fill?: boolean; className?: string }) {
  return (
    <Card className={`panel ${fill ? "fill" : ""} ${className}`}>
      {children}
    </Card>
  );
}

function CardHead({ title, detail }: { title: string; detail: string }) {
  return (
    <CardHeader className="panel-head">
      <CardTitle>{title}</CardTitle>
      <CardDescription>{detail}</CardDescription>
    </CardHeader>
  );
}

function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="toolbar">{children}</div>;
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <Label className={`field ${className}`}>
      <span>{label}</span>
      {children}
    </Label>
  );
}

function StatusRow({ title, status = "unknown", path }: { title: string; status?: string; path?: string | null }) {
  return (
    <div className="status-row">
      <span>{title}</span>
      <Badge status={status} />
      <code>{path || t("未记录路径")}</code>
    </div>
  );
}

function Badge({ status }: { status: string }) {
  return <UiBadge className={statusClass(status)} variant="secondary">{statusLabel(status)}</UiBadge>;
}

function LatestLaunch({ status }: { status: LaunchStatus | null }) {
  if (!status) return <div className="empty">{t("暂无启动状态。")}</div>;
  return (
    <div className="metric-list">
      <Metric label={t("状态")} value={status.status} />
      <Metric label={t("消息")} value={status.message} />
      <Metric label="Debug" value={String(status.debug_port ?? "-")} />
      <Metric label="Helper" value={String(status.helper_port ?? "-")} />
      <Metric label={t("时间")} value={formatTime(status.started_at_ms)} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ScriptRow({ script, actions }: { script: NonNullable<UserScriptInventory["scripts"]>[number]; actions: Actions }) {
  const source = script.market_id ? tf("市场 · {0}", [script.version || t("未知版本")]) : script.source === "builtin" ? t("内置") : t("用户");
  const canDelete = script.source === "user";
  return (
    <div className="table-row">
      <span>{script.name}</span>
      <span>{source}</span>
      <span>{script.enabled ? t("启用") : t("关闭")}</span>
      <span>{script.status}</span>
      <div className="script-row-actions">
        <Button onClick={() => void actions.setUserScriptEnabled(script.key, !script.enabled)} size="sm" variant="secondary">
          {script.enabled ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
          {script.enabled ? t("禁用") : t("启用")}
        </Button>
        {canDelete ? (
          <Button onClick={() => void actions.deleteUserScript(script.key)} size="sm" variant="outline">
            <Trash2 className="h-4 w-4" />
            {t("删除")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function routeTitle(route: Route) {
  return routes.find((item) => item.id === route)?.label ?? t("概览");
}

function routeSubtitle(route: Route) {
  const subtitles: Record<Route, string> = {
    announcements: "查看平台自动同步的最新公告与历史通知。",
    announcementManagement: "管理员可发布、置顶和维护客户端公告。",
    overview: t("检查问题、启动与快速修复"),
    account: "登录 ♛Codework AI 官方账号，核验普通 VIP 或至尊 VIP 身份",
    activity: "查看抽奖系统同步的会员活动与参与次数",
    community: "发布和查看 Codework 超话，管理员可维护全部评论",
    updates: "查看客户端版本、更新内容与覆盖安装说明",
    downloadChatGpt: "通过 Microsoft Store 安装 OpenAI 官方 ChatGPT，并创建桌面快捷方式。",
    relay: t("管理 API 供应商、协议、Key 与配置文件"),
    sessions: t("查看、删除和修复 Codex 本地会话"),
    context: t("独立管理 MCP、Skills、Plugins"),
    enhance: t("会话删除、导出、项目移动和脚本能力"),
    zedRemote: t("管理 Codex SSH 项目并加入 Zed workspace"),
    userScripts: t("内置和用户自定义脚本清单"),
    maintenance: t("入口安装、修复、Watcher 与手动启动"),
    about: t("版本信息、上游源码、日志与诊断"),
    visualTheme: "一键切换 Codex 的视觉主题与界面风格",
    settings: t("主题和启动参数"),
  };
  return subtitles[route];
}

const contextKindOptions: Array<{ kind: ContextKind; label: string; tableName: string }> = [
  { kind: "mcp", label: "MCP", tableName: "mcp_servers" },
  { kind: "skill", label: "Skills", tableName: "skills" },
  { kind: "plugin", label: t("插件"), tableName: "plugins" },
];

function contextKindLabel(kind: ContextKind) {
  return contextKindOptions.find((option) => option.kind === kind)?.label ?? t("扩展项");
}

function contextEntriesFromSettings(settings: BackendSettings): CodexContextEntries {
  const commonConfig = normalizeDuplicateTomlTables(settings.relayContextConfigContents || "");
  return {
    mcpServers: parseContextEntries(commonConfig, "mcp", "mcp_servers"),
    skills: parseContextEntries(commonConfig, "skill", "skills"),
    plugins: parseContextEntries(commonConfig, "plugin", "plugins"),
  };
}

function contextEntriesWithLiveEntries(settings: BackendSettings, liveEntries: CodexContextEntries | null): CodexContextEntries {
  const commonEntries = contextEntriesFromSettings(settings);
  if (!liveEntries) return commonEntries;
  const liveByKind: Record<ContextKind, Map<string, CodexContextEntry>> = {
    mcp: new Map(liveEntries.mcpServers.map((entry) => [entry.id, entry])),
    skill: new Map(liveEntries.skills.map((entry) => [entry.id, entry])),
    plugin: new Map(liveEntries.plugins.map((entry) => [entry.id, entry])),
  };
  return {
    mcpServers: mergeLiveContextEntries(commonEntries.mcpServers, liveByKind.mcp),
    skills: mergeLiveContextEntries(commonEntries.skills, liveByKind.skill),
    plugins: mergeLiveContextEntries(commonEntries.plugins, liveByKind.plugin),
  };
}

function mergeLiveContextEntries(entries: CodexContextEntry[], liveEntries: Map<string, CodexContextEntry>): CodexContextEntry[] {
  const uniqueEntries = dedupeContextEntryList(entries);
  const merged = uniqueEntries.map((entry) => {
    const live = liveEntries.get(entry.id);
    return withLiveEntryState(entry, live);
  });
  const knownIds = new Set(uniqueEntries.map((entry) => entry.id));
  for (const liveEntry of liveEntries.values()) {
    if (!knownIds.has(liveEntry.id)) merged.push(liveEntry);
  }
  return merged;
}

function withLiveEntryState(entry: CodexContextEntry, live?: CodexContextEntry): CodexContextEntry {
  return live ? { ...entry, enabled: live.enabled } : { ...entry, enabled: false };
}

function contextEntriesForProfile(settings: BackendSettings, profile: RelayProfile): CodexContextEntries {
  return filterContextEntriesBySelection(contextEntriesFromSettings(settings), profile.contextSelection);
}

function contextEntriesFromConfig(configContents: string): CodexContextEntries {
  return {
    mcpServers: parseContextEntries(configContents, "mcp", "mcp_servers"),
    skills: parseContextEntries(configContents, "skill", "skills"),
    plugins: parseContextEntries(configContents, "plugin", "plugins"),
  };
}

function mergeContextEntries(primary: CodexContextEntries, secondary: CodexContextEntries): CodexContextEntries {
  return {
    mcpServers: mergeContextEntryList(primary.mcpServers, secondary.mcpServers),
    skills: mergeContextEntryList(primary.skills, secondary.skills),
    plugins: mergeContextEntryList(primary.plugins, secondary.plugins),
  };
}

function mergeContextEntryList(primary: CodexContextEntry[], secondary: CodexContextEntry[]): CodexContextEntry[] {
  return dedupeContextEntryList([...primary, ...secondary]);
}

function dedupeContextEntryList(entries: CodexContextEntry[]): CodexContextEntry[] {
  const byId = new Map<string, CodexContextEntry>();
  for (const entry of entries) {
    byId.set(entry.id, entry);
  }
  return Array.from(byId.values());
}

function parseContextEntries(commonConfig: string, kind: ContextKind, tableName: string): CodexContextEntry[] {
  const anyHeaderPattern = /^\s*\[[^\]]+\]\s*$/;
  const entries = new Map<string, CodexContextEntry>();
  let currentId: string | null = null;
  let body: string[] = [];

  const flush = () => {
    if (!currentId) return;
    const tomlBody = ensureTrailingNewline(body.join("\n").trimEnd());
    entries.set(currentId, {
      id: currentId,
      kind,
      title: currentId,
      summary: contextEntrySummary(tomlBody),
      tomlBody,
      enabled: contextEntryEnabled(tomlBody),
    });
  };

  for (const line of commonConfig.split(/\r?\n/)) {
    const path = tomlTablePathFromLine(line);
    if (path?.[0] === tableName && path.length >= 2) {
      const id = path[1];
      if (currentId === id && path.length > 2) {
        body.push(`[${path.slice(2).map(tomlKey).join(".")}]`);
        continue;
      }
      flush();
      currentId = id;
      body = [];
      continue;
    }
    if (currentId && anyHeaderPattern.test(line)) {
      flush();
      currentId = null;
      body = [];
      continue;
    }
    if (currentId) body.push(line);
  }
  flush();

  return Array.from(entries.values());
}

function tomlTablePathFromLine(line: string): string[] | null {
  const match = /^\s*\[([^\]]+)\]\s*$/.exec(line);
  if (!match) return null;
  return parseTomlDottedPath(match[1].trim());
}

function parseTomlDottedPath(path: string): string[] | null {
  const parts: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const char of path) {
    if (quote) {
      if (quote === '"' && escaping) {
        current += char;
        escaping = false;
      } else if (quote === '"' && char === "\\") {
        escaping = true;
      } else if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ".") {
      if (!current.trim()) return null;
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (quote || escaping || !current.trim()) return null;
  parts.push(current.trim());
  return parts;
}

function contextEntrySummary(tomlBody: string) {
  return tomlBody
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#") && !/^enabled\s*=/.test(line))
    ?.slice(0, 96) ?? "";
}

function contextEntryEnabled(tomlBody: string) {
  return !tomlBody.split(/\r?\n/).some((line) => /^\s*enabled\s*=\s*false\s*(#.*)?$/i.test(line));
}

function setContextEntryEnabled(tomlBody: string, enabled: boolean) {
  const lines = tomlBody.trimEnd().split(/\r?\n/);
  const nextValue = `enabled = ${enabled ? "true" : "false"}`;
  let replaced = false;
  const next = lines.map((line) => {
    if (/^\s*enabled\s*=/.test(line)) {
      replaced = true;
      return nextValue;
    }
    return line;
  });
  if (!replaced) next.unshift(nextValue);
  return ensureTrailingNewline(next.join("\n").trimEnd());
}

function ensureTrailingNewline(value: string) {
  return value.trim() ? `${value}\n` : "";
}

function unquoteTomlKey(key: string) {
  if (key.length >= 2 && ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'")))) {
    return key.slice(1, -1);
  }
  return key;
}

function contextEntriesByKind(entries: CodexContextEntries, kind: ContextKind): CodexContextEntry[] {
  if (kind === "mcp") return dedupeContextEntryList(entries.mcpServers);
  if (kind === "skill") return dedupeContextEntryList(entries.skills);
  return dedupeContextEntryList(entries.plugins);
}

function filterContextEntriesBySelection(entries: CodexContextEntries, selection: RelayContextSelection): CodexContextEntries {
  const selected = {
    mcp: new Set(selection.mcpServers.map((id) => id.trim()).filter(Boolean)),
    skill: new Set(selection.skills.map((id) => id.trim()).filter(Boolean)),
    plugin: new Set(selection.plugins.map((id) => id.trim()).filter(Boolean)),
  };
  return {
    mcpServers: entries.mcpServers.filter((entry) => selected.mcp.has(entry.id)),
    skills: entries.skills.filter((entry) => selected.skill.has(entry.id)),
    plugins: entries.plugins.filter((entry) => selected.plugin.has(entry.id)),
  };
}

function configHasCodexGoalsFeature(configContents: string): boolean {
  let inFeatures = false;
  for (const line of configContents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^\[features\]$/.test(trimmed)) {
      inFeatures = true;
      continue;
    }
    if (inFeatures && /^\[[^\]]+\]$/.test(trimmed)) {
      inFeatures = false;
    }
    if (inFeatures && /^goals\s*=\s*true\b/.test(trimmed)) {
      return true;
    }
  }
  return false;
}

function setCodexGoalsFeatureInConfig(configContents: string, enabled: boolean): string {
  const lines = configContents.split(/\r?\n/);
  const next: string[] = [];
  let inFeatures = false;
  let sawFeatures = false;
  let featuresHasGoals = false;

  const maybeInsertGoals = () => {
    if (enabled && sawFeatures && !featuresHasGoals) {
      next.push("goals = true");
      featuresHasGoals = true;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\[features\]$/.test(trimmed)) {
      if (inFeatures) maybeInsertGoals();
      inFeatures = true;
      sawFeatures = true;
      featuresHasGoals = false;
      next.push(line);
      continue;
    }
    if (inFeatures && /^\[[^\]]+\]$/.test(trimmed)) {
      maybeInsertGoals();
      inFeatures = false;
    }
    if (inFeatures && /^goals\s*=/.test(trimmed)) {
      if (enabled && !featuresHasGoals) {
        next.push("goals = true");
        featuresHasGoals = true;
      }
      continue;
    }
    next.push(line);
  }

  if (inFeatures) maybeInsertGoals();
  if (enabled && !sawFeatures) {
    const trimmed = ensureTrailingNewline(next.join("\n").trimEnd());
    return joinTomlSections([trimmed, "[features]\ngoals = true"]);
  }

  return ensureTrailingNewline(next.join("\n").trimEnd());
}

function effectiveRelayConfigPreview(profile: RelayProfile, settings: BackendSettings, contextProfile = profile): string {
  const entries = contextEntriesForProfile(settings, contextProfile);
  const isolatedConfig = stripContextEntriesFromConfig(profile.configContents, entries);
  const configWithLimits = applyContextLimitPreview(isolatedConfig, profile);
  return joinTomlSectionsRootFirst([configWithLimits, settings.relayCommonConfigContents || "", selectedContextConfigToml(entries)]);
}

function selectedContextConfigToml(entries: CodexContextEntries): string {
  const sections: string[] = [];
  for (const option of contextKindOptions) {
    for (const entry of dedupeContextEntryList(contextEntriesByKind(entries, option.kind))) {
      if (!entry.enabled) continue;
      sections.push(contextEntryToTomlSection(option.tableName, entry));
    }
  }
  return ensureTrailingNewline(sections.join("\n\n"));
}

function allContextConfigToml(entries: CodexContextEntries): string {
  const sections: string[] = [];
  for (const option of contextKindOptions) {
    for (const entry of dedupeContextEntryList(contextEntriesByKind(entries, option.kind))) {
      sections.push(contextEntryToTomlSection(option.tableName, entry));
    }
  }
  return ensureTrailingNewline(sections.join("\n\n"));
}

function contextEntryToTomlSection(tableName: string, entry: CodexContextEntry): string {
  const parentHeader = `[${tableName}.${tomlKey(entry.id)}]`;
  const body = entry.tomlBody
    .trimEnd()
    .split(/\r?\n/)
    .map((line) => relativeContextSubtableToAbsolute(line, tableName, entry.id))
    .join("\n");
  return `${parentHeader}\n${body}`;
}

function relativeContextSubtableToAbsolute(line: string, tableName: string, id: string): string {
  const match = /^\s*\[([^\]]+)\]\s*$/.exec(line);
  if (!match) return line;
  const subtable = match[1].trim();
  if (!subtable || subtable.includes(".")) return line;
  return `[${tableName}.${tomlKey(id)}.${tomlKey(subtable)}]`;
}

function syncLiveConfigContextState(liveConfigContents: string, settings: BackendSettings): string {
  const entries = contextEntriesFromSettings(settings);
  const withoutManaged = stripContextEntriesFromConfig(liveConfigContents, entries);
  return joinTomlSectionsRootFirst([withoutManaged, selectedContextConfigToml(entries)]);
}

function relayCombinedCommonConfig(settings: BackendSettings): string {
  return joinTomlSectionsRootFirst([settings.relayCommonConfigContents || "", settings.relayContextConfigContents || ""]);
}

function splitContextConfigText(configContents: string): { common: string; context: string } {
  const entries = contextEntriesFromConfig(configContents);
  return {
    common: stripContextEntriesFromConfig(configContents, entries),
    context: allContextConfigToml(entries),
  };
}

function stripContextEntriesFromConfig(configContents: string, entries: CodexContextEntries): string {
  const knownIds: Record<ContextKind, Set<string>> = {
    mcp: new Set(entries.mcpServers.map((entry) => entry.id)),
    skill: new Set(entries.skills.map((entry) => entry.id)),
    plugin: new Set(entries.plugins.map((entry) => entry.id)),
  };
  const lines = configContents.split(/\r?\n/);
  const kept: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const contextHeader = contextHeaderFromLine(line);
    if (contextHeader) {
      skipping = knownIds[contextHeader.kind].has(contextHeader.id);
    } else if (/^\s*\[[^\]]+\]\s*$/.test(line)) {
      skipping = false;
    }
    if (!skipping) kept.push(line);
  }

  return ensureTrailingNewline(kept.join("\n").trimEnd());
}

function stripCommonConfigTextFallback(configContents: string, commonConfig: string): string {
  const anchors = commonConfigAnchors(commonConfig);
  if (!anchors.rootKeys.size && !anchors.tableHeaders.size) return ensureTrailingNewline(configContents.trimEnd());

  const kept: string[] = [];
  let skippingTable = false;

  for (const line of configContents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^\[[^\]]+\]$/.test(trimmed)) {
      skippingTable = anchors.tableHeaders.has(trimmed);
      if (skippingTable) continue;
    }
    if (skippingTable) continue;
    const key = tomlRootKeyFromLine(trimmed);
    if (key && anchors.rootKeys.has(key)) continue;
    kept.push(line);
  }

  return ensureTrailingNewline(kept.join("\n").trimEnd());
}

function commonConfigAnchors(commonConfig: string): { rootKeys: Set<string>; tableHeaders: Set<string> } {
  const rootKeys = new Set<string>();
  const tableHeaders = new Set<string>();
  let inRoot = true;

  for (const line of commonConfig.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^\[[^\]]+\]$/.test(trimmed)) {
      inRoot = false;
      tableHeaders.add(trimmed);
      continue;
    }
    if (inRoot) {
      const key = tomlRootKeyFromLine(trimmed);
      if (key) rootKeys.add(key);
    }
  }

  return { rootKeys, tableHeaders };
}

function tomlRootKeyFromLine(line: string): string | null {
  if (!line || line.startsWith("#")) return null;
  const index = line.indexOf("=");
  if (index < 0) return null;
  const key = line.slice(0, index).trim();
  return key || null;
}

function contextHeaderFromLine(line: string): { kind: ContextKind; id: string } | null {
  const path = tomlTablePathFromLine(line);
  if (!path || path.length !== 2) return null;
  const option = contextKindOptions.find((item) => item.tableName === path[0]);
  return option ? { kind: option.kind, id: path[1] } : null;
}

function applyContextLimitPreview(configContents: string, profile: RelayProfile): string {
  const replacements: Array<[string, string]> = [
    ["model_context_window", profile.contextWindow],
    ["model_auto_compact_token_limit", profile.autoCompactLimit],
  ];
  let lines = configContents.split(/\r?\n/);

  for (const [key, value] of replacements) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    let replaced = false;
    lines = lines.map((line) => {
      if (!replaced && new RegExp(`^\\s*${key}\\s*=`).test(line)) {
        replaced = true;
        return `${key} = ${trimmed}`;
      }
      return line;
    });
    if (!replaced) {
      const firstTable = lines.findIndex((line) => /^\s*\[[^\]]+\]\s*$/.test(line));
      const insertAt = firstTable >= 0 ? firstTable : lines.length;
      lines.splice(insertAt, 0, `${key} = ${trimmed}`);
    }
  }

  return ensureTrailingNewline(lines.join("\n").trimEnd());
}

function removeRootTomlKey(contents: string, key: string): string {
  const lines: string[] = [];
  let inRoot = true;
  for (const line of contents.split(/\r?\n/)) {
    if (/^\s*\[[^\]]+\]\s*$/.test(line)) inRoot = false;
    if (inRoot && new RegExp(`^\\s*${key}\\s*=`).test(line)) continue;
    lines.push(line);
  }
  return ensureTrailingNewline(lines.join("\n").trimEnd());
}

function joinTomlSections(sections: string[]): string {
  return ensureTrailingNewline(
    sections
      .map((section) => section.trim())
      .filter(Boolean)
      .join("\n\n"),
  );
}

function joinTomlSectionsRootFirst(sections: string[]): string {
  const rootParts: string[] = [];
  const tableParts: string[] = [];

  for (const section of sections) {
    const { root, tables } = splitTomlRootAndTables(section);
    if (root.trim()) rootParts.push(root.trim());
    if (tables.trim()) tableParts.push(tables.trim());
  }

  return normalizeDuplicateTomlTables(joinTomlSections([...dedupeTomlRootLines(rootParts), ...tableParts]));
}

function normalizeDuplicateTomlTables(contents: string): string {
  const seenHeaders = new Set<string>();
  const kept: string[] = [];
  let skipping = false;

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^\[[^\]]+\]$/.test(trimmed)) {
      skipping = seenHeaders.has(trimmed);
      seenHeaders.add(trimmed);
      if (skipping) continue;
    }
    if (!skipping) kept.push(line);
  }

  return ensureTrailingNewline(kept.join("\n").trimEnd());
}

function dedupeTomlRootLines(rootParts: string[]): string[] {
  const rootLines = rootParts
    .join("\n")
    .split(/\r?\n/)
    .map((line) => line.trimEnd());
  const rootSeen = new Set<string>();
  const kept: string[] = [];

  for (let index = rootLines.length - 1; index >= 0; index -= 1) {
    const line = rootLines[index];
    const key = tomlRootKeyFromLine(line.trim());
    if (key) {
      if (rootSeen.has(key)) continue;
      rootSeen.add(key);
    }
    kept.push(line);
  }

  const normalized = kept.reverse().join("\n").trim();
  return normalized ? [normalized] : [];
}

function splitTomlRootAndTables(section: string): { root: string; tables: string } {
  const lines = section.trim().split(/\r?\n/);
  const firstTable = lines.findIndex((line) => /^\s*\[[^\]]+\]\s*$/.test(line));
  if (firstTable < 0) return { root: lines.join("\n"), tables: "" };
  return {
    root: lines.slice(0, firstTable).join("\n"),
    tables: lines.slice(firstTable).join("\n"),
  };
}

function tomlKey(key: string): string {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : `"${tomlString(key)}"`;
}

function contextSelectionIds(selection: RelayContextSelection, kind: ContextKind): string[] {
  if (kind === "mcp") return selection.mcpServers;
  if (kind === "skill") return selection.skills;
  return selection.plugins;
}

function setContextSelectionId(selection: RelayContextSelection, kind: ContextKind, id: string, checked: boolean): RelayContextSelection {
  const next = {
    mcpServers: [...selection.mcpServers],
    skills: [...selection.skills],
    plugins: [...selection.plugins],
  };
  const list = contextSelectionIds(next, kind);
  const normalizedId = id.trim();
  const exists = list.includes(normalizedId);
  if (checked && normalizedId && !exists) list.push(normalizedId);
  if (!checked && exists) list.splice(list.indexOf(normalizedId), 1);
  return next;
}

function removeContextSelectionFromSettings(settings: BackendSettings, kind: ContextKind, id: string): BackendSettings {
  return {
    ...settings,
    relayProfiles: settings.relayProfiles.map((profile) => ({
      ...profile,
      contextSelection: setContextSelectionId(profile.contextSelection, kind, id, false),
    })),
  };
}

function contextSelectionForAllEntries(settings: BackendSettings): RelayContextSelection {
  const entries = contextEntriesFromSettings(settings);
  return {
    mcpServers: entries.mcpServers.map((entry) => entry.id),
    skills: entries.skills.map((entry) => entry.id),
    plugins: entries.plugins.map((entry) => entry.id),
  };
}

function relayProfileEditorStatus(profile: RelayProfile, form: BackendSettings, isNew: boolean) {
  if (isNew) return t("新建供应商需要先保存到列表");
  if (!form.relayProfilesEnabled) return t("供应商配置总开关已关闭；当前只保存配置，不写入 Codex live 文件");
  return profile.id === form.activeRelayId ? t("当前正在使用") : t("编辑后保存列表，再切换模式时会使用新配置");
}

function providerInitial(name: string) {
  const trimmed = (name || t("供应商")).trim();
  return Array.from(trimmed)[0]?.toUpperCase() || t("供");
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    found: t("已找到"),
    missing: t("缺失"),
    installed: t("已安装"),
    ok: t("正常"),
    running: t("运行中"),
    failed: t("失败"),
    archived: t("已归档"),
    accepted: t("已受理"),
    not_checked: t("未检查"),
    not_implemented: t("未实现"),
    disabled: t("已禁用"),
    unknown: t("未知"),
  };
  return labels[status] ?? status;
}

function statusClass(status: string) {
  if (["found", "installed", "ok", "running"].includes(status)) return "good";
  if (["failed", "missing"].includes(status)) return "bad";
  return "warn";
}

function isSuccessStatus(status?: Status) {
  return status === "ok" || status === "accepted";
}

function truncateSessionDeletePreview(value: string) {
  const normalized = value.trim();
  return normalized.length > 20 ? `${normalized.slice(0, 20)}...` : normalized;
}

function healthItems(overview: OverviewResult | null) {
  return [
    {
      title: t("Codex 应用"),
      status: overview?.codex_app.status ?? "not_checked",
      ok: overview?.codex_app.status === "found",
      detail: overview?.codex_app.path || t("尚未检查 Codex 应用路径。"),
    },
    {
      title: t("静默启动入口"),
      status: overview?.silent_shortcut.status ?? "not_checked",
      ok: overview?.silent_shortcut.status === "installed",
      detail: overview?.silent_shortcut.path || t("缺少 Codex++ 静默启动快捷方式时可在安装维护页修复。"),
    },
    {
      title: t("管理工具入口"),
      status: overview?.management_shortcut.status ?? "not_checked",
      ok: overview?.management_shortcut.status === "installed",
      detail: overview?.management_shortcut.path || t("缺少管理工具快捷方式时可在安装维护页修复。"),
    },
  ];
}

function normalizeSettings(settings: BackendSettings): BackendSettings {
  const backendAggregates = new Map(
    (settings.aggregateRelayProfiles ?? []).map((aggregate) => [aggregate.id, aggregate] as const),
  );
  const splitCommon = splitContextConfigText(settings.relayCommonConfigContents || "");
  const relayCommonConfigContents = splitCommon.common;
  const relayContextConfigContents = joinTomlSectionsRootFirst([
    settings.relayContextConfigContents || "",
    splitCommon.context,
  ]);
  const defaultContextSelection = contextSelectionForAllEntries({
    ...settings,
    relayCommonConfigContents,
    relayContextConfigContents,
  });
  const profiles =
    settings.relayProfiles?.length
      ? settings.relayProfiles.map((profile) =>
          normalizeRelayProfile(hydrateAggregateRelayProfile(profile, backendAggregates.get(profile.id)), defaultContextSelection),
        )
      : [
          {
            id: "codework-ai",
            name: "Codework AI 官方中转",
            model: "gpt-5.6-sol",
            baseUrl: CODEWORK_API_BASE_URL,
            upstreamBaseUrl: CODEWORK_API_BASE_URL,
            apiKey: settings.relayApiKey || "",
            protocol: "responses" as RelayProtocol,
            relayMode: "pureApi" as RelayMode,
            officialMixApiKey: false,
            testModel: "gpt-5.6-sol",
            configContents: `model_provider = "custom"
model = "gpt-5.6-sol"

[model_providers]

[model_providers.custom]
name = "custom"
wire_api = "responses"
requires_openai_auth = true
base_url = "${CODEWORK_API_BASE_URL}"
`,
            authContents: "",
            useCommonConfig: true,
            contextSelection: defaultContextSelection,
            contextSelectionInitialized: true,
            contextWindow: "",
            autoCompactLimit: "",
            modelList: "gpt-5.6-sol\ngpt-5.6-terra\ngpt-5.6-luna\ngpt-5.5",
            modelWindows: "",
            userAgent: "",
          },
        ];
  const activeRelayId = profiles.some((profile) => profile.id === settings.activeRelayId)
    ? settings.activeRelayId
    : profiles[0]?.id || defaultSettings.activeRelayId;
  return syncLegacyRelayFields({
    ...defaultSettings,
    ...settings,
    relayProfilesEnabled: settings.relayProfilesEnabled !== false,
    computerUseGuardEnabled: settings.computerUseGuardEnabled === true,
    codexAppImageOverlayOpacity: clampNumber(settings.codexAppImageOverlayOpacity || 35, 1, 100),
    codexAppImageOverlayFitMode: normalizeImageOverlayFitMode(settings.codexAppImageOverlayFitMode),
    codexAppStepwiseMaxItems: clampNumber(settings.codexAppStepwiseMaxItems ?? 6, 0, 6),
    codexAppStepwiseMaxInputChars: clampNumber(settings.codexAppStepwiseMaxInputChars || 6000, 1000, 24000),
    codexAppStepwiseMaxOutputTokens: clampNumber(settings.codexAppStepwiseMaxOutputTokens || 500, 100, 4000),
    codexAppStepwiseTimeoutMs: clampNumber(settings.codexAppStepwiseTimeoutMs || 8000, 1000, 60000),
    relayCommonConfigContents,
    relayContextConfigContents,
    relayProfiles: profiles,
    activeRelayId,
  });
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizeImageOverlayFitMode(value: string | undefined): ImageOverlayFitMode {
  return value === "fill" || value === "fit" || value === "stretch" || value === "tile" || value === "center"
    ? value
    : "fit";
}

function codexExtraArgsToInput(args: string[] | undefined) {
  return (args ?? []).join("\n");
}

function inputToCodexExtraArgs(value: string) {
  return value === "" ? [] : value.split(/\r?\n/);
}

function normalizeRelayProfile(profile: RelayProfile, defaultContextSelection = emptyContextSelection()): RelayProfile {
  const legacyMixedApi = profile.relayMode === "mixedApi";
  if (profile.relayMode === "aggregate" || profile.aggregate) {
    return normalizeAggregateRelayProfile(
      {
        ...profile,
        model: profile.model || "",
        baseUrl: "",
        upstreamBaseUrl: "",
        apiKey: "",
        protocol: "responses",
        relayMode: "aggregate",
        officialMixApiKey: false,
        testModel: profile.testModel || "",
        configContents: "",
        authContents: "",
        useCommonConfig: profile.useCommonConfig !== false,
        contextSelection: profile.contextSelectionInitialized
          ? normalizeContextSelection(profile.contextSelection)
          : normalizeContextSelection(undefined, defaultContextSelection),
        contextSelectionInitialized: true,
        contextWindow: "",
        autoCompactLimit: "",
        modelList: "",
        modelWindows: "",
      },
      null,
    );
  }
  const relayMode = normalizeRelayMode(profile.relayMode);
  const officialMixApiKey = profile.officialMixApiKey === true || legacyMixedApi;
  let normalized: RelayProfile = {
    ...profile,
    model: profile.model || "",
    baseUrl: profile.baseUrl || defaultSettings.relayBaseUrl,
    upstreamBaseUrl: profile.upstreamBaseUrl || profile.baseUrl || "",
    apiKey: profile.apiKey || "",
    protocol: profile.protocol === "chatCompletions" ? "chatCompletions" : "responses",
    relayMode,
    officialMixApiKey,
    testModel: profile.testModel || "",
    configContents: relayMode === "official" && !officialMixApiKey ? "" : profile.configContents || "",
    authContents: relayMode === "official" && !officialMixApiKey ? buildOfficialRelayAuthJson(profile.authContents || "") : profile.authContents || "",
    useCommonConfig: profile.useCommonConfig !== false,
    contextSelection: profile.contextSelectionInitialized
      ? normalizeContextSelection(profile.contextSelection)
      : normalizeContextSelection(undefined, defaultContextSelection),
    contextSelectionInitialized: true,
    contextWindow: profile.contextWindow || "",
    autoCompactLimit: profile.autoCompactLimit || "",
    modelList: profile.modelList || "",
    modelWindows: profile.modelWindows || "",
    userAgent: profile.userAgent || "",
    aggregate: null,
  };
  return relayProfileUsesLiveFiles(normalized) ? deriveRelayProfileFromFiles(normalized) : normalized;
}

function hydrateAggregateRelayProfile(profile: RelayProfile, aggregate: AggregateRelayProfile | undefined): RelayProfile {
  if (!aggregate) return profile;
  return {
    ...profile,
    name: profile.name || aggregate.name,
    relayMode: "aggregate",
    aggregate: {
      strategy: aggregate.strategy,
      members: aggregate.members.map((member) => ({
        profileId: member.relayId,
        weight: clampAggregateWeight(member.weight),
      })),
    },
  };
}

function activeRelayProfile(settings: BackendSettings): RelayProfile {
  return (
    settings.relayProfiles.find((profile) => profile.id === settings.activeRelayId) ||
    settings.relayProfiles[0] ||
    defaultSettings.relayProfiles[0]
  );
}

function relayProtocolLabel(protocol: RelayProtocol): string {
  return protocol === "chatCompletions" ? t("Chat Completions 转 Responses") : "Responses API";
}

function ccsProviderSummary(result: CcsProvidersResult | null): string {
  if (!result) return t("读取 ~/.cc-switch/cc-switch.db");
  if (!isSuccessStatus(result.status)) return result.message || t("读取 cc-switch 供应商失败。");
  const count = result.providers.length;
  return count ? tf("发现 {0} 个 Codex 供应商", [count]) : t("未发现可导入供应商");
}

function normalizeRelayMode(mode: RelayMode | undefined): RelayMode {
  if (mode === "aggregate") return mode;
  if (mode === "pureApi") return mode;
  return "official";
}

function normalizeContextSelection(
  selection?: Partial<RelayContextSelection>,
  fallback: RelayContextSelection = emptyContextSelection(),
): RelayContextSelection {
  if (!selection) {
    return {
      mcpServers: [...fallback.mcpServers],
      skills: [...fallback.skills],
      plugins: [...fallback.plugins],
    };
  }
  return {
    mcpServers: Array.isArray(selection?.mcpServers) ? selection.mcpServers.map(String) : [],
    skills: Array.isArray(selection?.skills) ? selection.skills.map(String) : [],
    plugins: Array.isArray(selection?.plugins) ? selection.plugins.map(String) : [],
  };
}

function relayModeLabel(mode: RelayMode): string {
  if (mode === "aggregate") return t("聚合供应商");
  if (mode === "pureApi") return t("纯 API");
  return t("官方登录");
}

function providerImportWireApiLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "chat" || normalized === "chat_completions" || normalized === "chat-completions") {
    return "Chat Completions";
  }
  return "Responses";
}

function providerImportRelayModeLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "official") return t("官方登录");
  if (normalized === "mixedapi" || normalized === "mixed-api" || normalized === "mixed_api") return t("混入 API");
  if (normalized === "aggregate") return t("聚合供应商");
  return t("纯 API");
}

function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return t("未填写");
  if (trimmed.length <= 10) return `${trimmed.slice(0, 2)}…${trimmed.slice(-2)}`;
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}

function relayProfileConfigBrief(profile: RelayProfile): string {
  if (isAggregateRelayProfile(profile)) {
    const aggregate = normalizeAggregateConfig(profile.aggregate, []);
    return tf("{0} · {1} 个成员", [aggregateStrategyLabel(aggregate.strategy), aggregate.members.length]);
  }
  if (profile.relayMode === "official") return profile.officialMixApiKey ? t("混入 API Key") : t("不写 API 文件");
  return profile.baseUrl || t("未填写 URL");
}

function relayProfileModeHelp(profile: RelayProfile): string {
  if (isAggregateRelayProfile(profile)) {
    return t("聚合供应商只保存成员和策略配置，成员来自已有 API 供应商；切为当前后会通过本地协议代理轮转请求。");
  }
  if (profile.relayMode === "official") {
    if (profile.officialMixApiKey) {
      return t("此供应商会保留官方登录模式，并把请求混入当前 API Key；Codex增强仍使用兼容模式。");
    }
    return t("此供应商会切回官方登录模式，使用 ChatGPT 官方账号，不写入 API Key。");
  }
  if (profile.relayMode === "pureApi") {
    return t("此供应商会同时写入 config.toml 和 auth.json；API Key 也会注入到 provider bearer token。");
  }
  return t("此供应商会保留官方登录模式，并把请求混入当前 API Key；Codex增强仍使用兼容模式。");
}

function relayProfileReadinessText(profile: RelayProfile, relay: RelayResult | null): string {
  if (isAggregateRelayProfile(profile)) {
    const aggregate = normalizeAggregateConfig(profile.aggregate, []);
    return tf("聚合供应商已配置为{0}，包含 {1} 个成员；真实对话会走本地代理轮转。", [aggregateStrategyLabel(aggregate.strategy), aggregate.members.length]);
  }
  if (profile.relayMode === "official") {
    if (profile.officialMixApiKey) {
      const hasApiFields = profile.baseUrl.trim() && profile.apiKey.trim();
      if (!relay?.authenticated && !hasApiFields) return t("当前未登录官方账号，也未配置混入 API 的 Base URL / Key。");
      if (!relay?.authenticated) return t("当前未登录官方账号；官方登录混入 API Key 需要先登录官方账号。");
      if (!hasApiFields) return t("当前还没有填写混入 API 的 Base URL / Key。");
      return tf("官方登录已就绪：{0}，会混入当前 API Key。", [relay.accountLabel || t("已登录")]);
    }
    return relay?.authenticated
      ? tf("官方账号已登录：{0}。", [relay.accountLabel || relay.authSource || t("已检测")])
      : t("当前未登录官方账号；切到官方登录模式后仍需要先在 Codex/ChatGPT 登录。");
  }
  const hasFiles = profile.configContents.trim() && profile.authContents.trim();
  if (!hasFiles) return t("当前供应商还没有完整 config.toml / API Key 存档。");
  if (relay && !relay.configured) return t("纯 API 配置未完整写入：请检查此供应商是否有 OPENAI_API_KEY，且 config.toml 是否包含 model_provider / provider / base_url。");
  return t("纯 API 就绪：会同时写入 config.toml 和 auth.json。");
}

function relayProfileSwitchCommand(profile: RelayProfile): "clear_relay_injection" | "apply_relay_injection" | "apply_pure_api_injection" {
  if (isAggregateRelayProfile(profile)) return "apply_relay_injection";
  if (profile.relayMode === "pureApi") return "apply_pure_api_injection";
  if (profile.relayMode === "official" && !profile.officialMixApiKey) return "clear_relay_injection";
  if (profile.configContents.trim()) return "apply_relay_injection";
  return profile.officialMixApiKey ? "apply_relay_injection" : "clear_relay_injection";
}
function relayProfileModeSwitchedText(profile: RelayProfile): string {
  if (isAggregateRelayProfile(profile)) return t("已切换到聚合供应商；真实对话会按所选策略轮转成员。");
  if (profile.relayMode === "pureApi") return t("已按此供应商切换到纯 API；Codex增强已设为完整增强。");
  if (profile.officialMixApiKey) return t("已按此供应商使用官方登录，并混入 API Key；Codex增强已设为兼容增强。");
  return t("已按此供应商切回官方登录；Codex增强已设为兼容增强。");
}

function withGeneratedRelayFiles(profile: RelayProfile): RelayProfile {
  if (isAggregateRelayProfile(profile)) {
    return { ...profile, configContents: "", authContents: "", aggregate: normalizeAggregateConfig(profile.aggregate, []) };
  }
  if (profile.relayMode === "official") {
    return {
      ...profile,
      configContents: profile.officialMixApiKey ? buildRelayConfigToml(profile, { includeBearerToken: true }) : "",
      authContents: profile.authContents || "",
    };
  }
  return {
    ...profile,
    configContents: buildRelayConfigToml(profile, { includeBearerToken: false }),
    authContents: buildRelayAuthJson(profile),
  };
}

function buildRelayConfigToml(
  profile: Pick<RelayProfile, "model" | "baseUrl" | "upstreamBaseUrl" | "apiKey" | "protocol">,
  options: { includeBearerToken: boolean },
): string {
  const baseUrl = profile.protocol === "chatCompletions" ? PROTOCOL_PROXY_BASE_URL : profile.baseUrl.trim();
  const apiKey = profile.apiKey.trim();
  const rootLines = [
    profile.model.trim() ? `model = "${tomlString(profile.model.trim())}"` : null,
    'model_provider = "custom"',
    "",
  ].filter((line): line is string => line !== null);
  return [
    ...rootLines,
    "[model_providers.custom]",
    'name = "custom"',
    'wire_api = "responses"',
    "requires_openai_auth = true",
    `base_url = "${tomlString(baseUrl)}"`,
    options.includeBearerToken && apiKey ? `experimental_bearer_token = "${tomlString(apiKey)}"` : null,
    "",
  ].filter((line): line is string => line !== null).join("\n");
}

function buildRelayAuthJson(profile: Pick<RelayProfile, "apiKey">): string {
  return `${JSON.stringify({ OPENAI_API_KEY: profile.apiKey.trim() }, null, 2)}\n`;
}

function buildOfficialRelayAuthJson(contents: string): string {
  const trimmed = contents.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "";
    delete parsed.OPENAI_API_KEY;
    return `${JSON.stringify(parsed, null, 2)}\n`;
  } catch {
    return "";
  }
}

function deriveRelayProfileFromFiles(profile: RelayProfile): RelayProfile {
  if (isAggregateRelayProfile(profile)) {
    return normalizeAggregateRelayProfile(profile, null);
  }
  const configContents = profile.configContents || "";
  const authContents = profile.relayMode === "official" ? buildOfficialRelayAuthJson(profile.authContents || "") : profile.authContents || "";
  const configBaseUrl = codexBaseUrlFromConfig(configContents);
  const chatUpstreamBaseUrl = rootTomlStringValue(configContents, CHAT_UPSTREAM_BASE_URL_KEY);
  const isProxyConfig = configBaseUrl === PROTOCOL_PROXY_BASE_URL;
  const upstreamBaseUrl = profile.upstreamBaseUrl || chatUpstreamBaseUrl || (configBaseUrl && !isProxyConfig ? configBaseUrl : profile.baseUrl || "");
  const configApiKey = codexExperimentalBearerTokenFromConfig(configContents);
  const configModel = codexModelFromConfig(configContents);
  // 如果用户输入了带后缀的模型名，优先保留在界面的「配置模型」字段中；
  // config.toml 里实际写的是剥离后缀的 slug（由 applyRelayProfilePatchToFiles 处理）。
  const model = /\[.+\]$/.test(profile.model.trim()) ? profile.model.trim() : configModel;
  return {
    ...profile,
    model,
    baseUrl: upstreamBaseUrl,
    upstreamBaseUrl,
    apiKey: profile.relayMode === "official"
      ? configApiKey || profile.apiKey || ""
      : codexApiKeyFromAuth(authContents) || configApiKey || "",
    contextWindow: codexTopLevelIntFromConfig(configContents, "model_context_window"),
    autoCompactLimit: codexTopLevelIntFromConfig(configContents, "model_auto_compact_token_limit"),
    configContents,
    authContents,
  };
}

function applyRelayProfilePatchToFiles(
  profile: RelayProfile,
  patch: Partial<RelayProfile>,
  options: { allowGenerateFiles?: boolean } = {},
): RelayProfile {
  let next: RelayProfile = { ...profile, ...patch };
  if (isAggregateRelayProfile(next)) {
    return normalizeAggregateRelayProfile(next, null);
  }
  const shouldHaveFiles =
    next.relayMode !== "official" || next.officialMixApiKey || next.configContents.trim() || next.authContents.trim();
  const needsAuthFile = next.relayMode === "pureApi";
  if (options.allowGenerateFiles && shouldHaveFiles && (!next.configContents.trim() || (needsAuthFile && !next.authContents.trim()))) {
    next = withGeneratedRelayFiles(next);
  }

  if ("model" in patch) {
    // 模型后缀（如 [1M]）仅供 CodexPlusPlus 内部使用，写入 config.toml 前需剥离，
    // 否则 codex 会按带后缀的字符串去匹配 catalog slug，导致窗口回退到默认值。
    const { slug } = parseModelSuffix(patch.model || "");
    next.configContents = setRootTomlStringKey(next.configContents, "model", slug);
  }
  if ("apiKey" in patch) {
    if (next.relayMode === "pureApi") {
      next.authContents = setAuthOpenAiApiKey(next.authContents, patch.apiKey || "");
      next.configContents = removeCodexExperimentalBearerToken(next.configContents);
    } else {
      next.configContents = setCodexExperimentalBearerToken(next.configContents, patch.apiKey || "");
    }
  }
  if ("baseUrl" in patch) {
    next.upstreamBaseUrl = patch.baseUrl || "";
  }
  if ("upstreamBaseUrl" in patch) {
    next.baseUrl = patch.upstreamBaseUrl || "";
  }
  if ("baseUrl" in patch || "upstreamBaseUrl" in patch || "protocol" in patch) {
    const baseUrlForConfig = next.protocol === "chatCompletions" ? PROTOCOL_PROXY_BASE_URL : next.upstreamBaseUrl || next.baseUrl;
    next.configContents = setCodexProviderStringKey(next.configContents, "base_url", baseUrlForConfig);
    next.configContents = removeRootTomlKey(next.configContents, CHAT_UPSTREAM_BASE_URL_KEY);
  }
  if ("contextWindow" in patch) {
    next.configContents = setRootTomlIntKey(next.configContents, "model_context_window", patch.contextWindow || "");
  }
  if ("autoCompactLimit" in patch) {
    next.configContents = setRootTomlIntKey(
      next.configContents,
      "model_auto_compact_token_limit",
      patch.autoCompactLimit || "",
    );
  }
  if ("relayMode" in patch || "officialMixApiKey" in patch) {
    if (next.relayMode === "official" && !next.officialMixApiKey) {
      next.configContents = "";
      next.authContents = buildOfficialRelayAuthJson(next.authContents);
    } else if (options.allowGenerateFiles && (!next.configContents.trim() || (next.relayMode === "pureApi" && !next.authContents.trim()))) {
      next = withGeneratedRelayFiles(next);
    }
  }

  return deriveRelayProfileFromFiles(next);
}

function codexModelFromConfig(contents: string): string {
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("[")) break;
    const match = /^model\s*=\s*(["'])(.*)\1\s*$/.exec(trimmed);
    if (match) return match[2].replace(/\\(["'\\])/g, "$1");
  }
  return "";
}

/// 解析模型后缀语法，如 deepseek-v4-flash[1M] -> { slug: "deepseek-v4-flash", window: 1000000 }
/// 非法或没有后缀时返回原串作为 slug。
function parseModelSuffix(raw: string): { slug: string; window?: number } {
  const trimmed = raw.trim();
  const match = /^(.*?)\[(\d+(?:[KkMm])?)\]$/.exec(trimmed);
  if (!match) return { slug: trimmed };
  const inner = match[2];
  const numPart = inner.replace(/[KkMm]$/, "");
  const multiplier = inner.endsWith("K") || inner.endsWith("k") ? 1_000
    : inner.endsWith("M") || inner.endsWith("m") ? 1_000_000
    : 1;
  const window = Number.parseInt(numPart, 10) * multiplier;
  if (!Number.isFinite(window) || window <= 0) return { slug: trimmed };
  return { slug: match[1].trim(), window };
}

function codexBaseUrlFromConfig(contents: string): string {
  return codexProviderStringFromConfig(contents, "base_url");
}

function codexExperimentalBearerTokenFromConfig(contents: string): string {
  return codexProviderStringFromConfig(contents, "experimental_bearer_token");
}

function codexProviderStringFromConfig(contents: string, key: string): string {
  const provider = rootTomlStringValue(contents, "model_provider");
  const targetSection = provider ? `model_providers.${provider}` : "";
  const lines = contents.split(/\r?\n/);
  let currentSection = "";
  const matches: string[] = [];

  for (const line of lines) {
    const section = tomlSectionName(line);
    if (section !== null) {
      currentSection = section;
      continue;
    }
    const value = tomlStringAssignmentValue(line, key);
    if (value === null) continue;
    if (targetSection && currentSection === targetSection) return value;
    if (!currentSection || !currentSection.startsWith("model_providers.")) matches.push(value);
  }

  return matches.length === 1 ? matches[0] : "";
}

function codexApiKeyFromAuth(contents: string): string {
  try {
    const parsed = JSON.parse(contents || "{}") as { OPENAI_API_KEY?: unknown };
    return typeof parsed.OPENAI_API_KEY === "string" ? parsed.OPENAI_API_KEY : "";
  } catch {
    return "";
  }
}

function codexTopLevelIntFromConfig(contents: string, key: string): string {
  const topLevel = splitTomlRootAndTables(contents).root;
  const pattern = new RegExp(`^\\s*${key}\\s*=\\s*(\\d+)\\s*(?:#.*)?$`);
  for (const line of topLevel.split(/\r?\n/)) {
    const match = pattern.exec(line);
    if (match) return match[1];
  }
  return "";
}

function rootTomlStringValue(contents: string, key: string): string {
  const topLevel = splitTomlRootAndTables(contents).root;
  for (const line of topLevel.split(/\r?\n/)) {
    const value = tomlStringAssignmentValue(line, key);
    if (value !== null) return value;
  }
  return "";
}

function tomlSectionName(line: string): string | null {
  const match = /^\s*\[([^\]]+)\]\s*$/.exec(line);
  return match ? match[1].trim() : null;
}

function tomlStringAssignmentValue(line: string, key: string): string | null {
  const match = new RegExp(`^\\s*${key}\\s*=\\s*([\"'])(.*)\\1\\s*(?:#.*)?$`).exec(line.trim());
  if (!match) return null;
  return match[2].replace(/\\(["'\\])/g, "$1");
}

function setAuthOpenAiApiKey(contents: string, apiKey: string): string {
  let parsed: Record<string, unknown> = {};
  try {
    const value = JSON.parse(contents || "{}");
    if (value && typeof value === "object" && !Array.isArray(value)) parsed = value as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  parsed.OPENAI_API_KEY = apiKey.trim();
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

function setRootTomlStringKey(contents: string, key: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return removeRootTomlKey(contents, key);
  return setRootTomlLine(contents, key, `${key} = "${tomlString(trimmed)}"`);
}

function setRootTomlIntKey(contents: string, key: string, value: string): string {
  const trimmed = value.replace(/[^\d]/g, "");
  if (!trimmed) return removeRootTomlKey(contents, key);
  return setRootTomlLine(contents, key, `${key} = ${trimmed}`);
}

function setRootTomlLine(contents: string, key: string, lineText: string): string {
  const lines = contents.split(/\r?\n/);
  const firstTable = lines.findIndex((line) => /^\s*\[[^\]]+\]\s*$/.test(line));
  const rootEnd = firstTable >= 0 ? firstTable : lines.length;
  for (let index = 0; index < rootEnd; index += 1) {
    if (new RegExp(`^\\s*${key}\\s*=`).test(lines[index])) {
      lines[index] = lineText;
      return ensureTrailingNewline(lines.join("\n").trimEnd());
    }
  }
  const insertAt = key === "model" ? 0 : rootEnd;
  lines.splice(insertAt, 0, lineText);
  return ensureTrailingNewline(lines.join("\n").trimEnd());
}

function setCodexProviderStringKey(contents: string, key: string, value: string): string {
  const provider = rootTomlStringValue(contents, "model_provider") || "custom";
  let next = contents;
  if (!rootTomlStringValue(next, "model_provider")) {
    next = setRootTomlStringKey(next, "model_provider", provider);
  }
  next = ensureCodexProviderDefaults(next, provider);
  return setTomlSectionStringKey(next, `model_providers.${provider}`, key, value);
}

function setCodexExperimentalBearerToken(contents: string, apiKey: string): string {
  const trimmed = apiKey.trim();
  return trimmed
    ? setCodexProviderStringKey(contents, "experimental_bearer_token", trimmed)
    : removeCodexExperimentalBearerToken(contents);
}

function removeCodexExperimentalBearerToken(contents: string): string {
  const provider = rootTomlStringValue(contents, "model_provider") || "custom";
  return removeTomlSectionKey(contents, `model_providers.${provider}`, "experimental_bearer_token");
}

function ensureCodexProviderDefaults(contents: string, provider: string): string {
  let next = contents;
  const section = `model_providers.${provider}`;
  next = setTomlSectionStringKey(next, section, "name", provider);
  next = setTomlSectionStringKey(next, section, "wire_api", "responses");
  return setTomlSectionBoolKey(next, section, "requires_openai_auth", true);
}

function setTomlSectionBoolKey(contents: string, sectionName: string, key: string, value: boolean): string {
  return setTomlSectionRawKey(contents, sectionName, key, value ? "true" : "false");
}

function setTomlSectionStringKey(contents: string, sectionName: string, key: string, value: string): string {
  return setTomlSectionRawKey(contents, sectionName, key, `"${tomlString(value.trim())}"`);
}

function setTomlSectionRawKey(contents: string, sectionName: string, key: string, value: string): string {
  const lines = contents.split(/\r?\n/);
  let sectionStart = -1;
  let sectionEnd = lines.length;
  for (let index = 0; index < lines.length; index += 1) {
    const section = tomlSectionName(lines[index]);
    if (section === null) continue;
    if (sectionStart >= 0) {
      sectionEnd = index;
      break;
    }
    if (section === sectionName) sectionStart = index;
  }
  if (sectionStart < 0) {
    const prefix = ensureTrailingNewline(lines.join("\n").trimEnd()).trimEnd();
    return joinTomlSections([prefix, `[${sectionName}]\n${key} = ${value}`]);
  }
  const replacement = `${key} = ${value}`;
  for (let index = sectionStart + 1; index < sectionEnd; index += 1) {
    if (new RegExp(`^\\s*${key}\\s*=`).test(lines[index])) {
      lines[index] = replacement;
      return ensureTrailingNewline(lines.join("\n").trimEnd());
    }
  }
  let insertAt = sectionEnd;
  while (insertAt > sectionStart + 1 && lines[insertAt - 1].trim() === "") insertAt -= 1;
  lines.splice(insertAt, 0, replacement);
  return ensureTrailingNewline(lines.join("\n").trimEnd());
}

function removeTomlSectionKey(contents: string, sectionName: string, key: string): string {
  const lines = contents.split(/\r?\n/);
  let sectionStart = -1;
  let sectionEnd = lines.length;
  for (let index = 0; index < lines.length; index += 1) {
    const section = tomlSectionName(lines[index]);
    if (section === null) continue;
    if (sectionStart >= 0) {
      sectionEnd = index;
      break;
    }
    if (section === sectionName) sectionStart = index;
  }
  if (sectionStart < 0) return contents;
  const next = lines.filter((line, index) => {
    if (index <= sectionStart || index >= sectionEnd) return true;
    return !new RegExp(`^\\s*${key}\\s*=`).test(line);
  });
  return ensureTrailingNewline(next.join("\n").trimEnd());
}

function relayProfileSwitchValidation(profile: RelayProfile): string | null {
  if (isAggregateRelayProfile(profile)) {
    return aggregateRelayProfileValidation(profile);
  }
  if (profile.relayMode === "official" && !profile.officialMixApiKey) return null;
  if (!profile.configContents.trim()) {
    return tf("供应商「{0}」缺少独立 config.toml，已停止切换，避免继续显示上一套配置文件。请先在该供应商详情里保存 config.toml。", [profile.name || profile.id]);
  }
  if (profile.relayMode !== "official" || !authJsonHasOpenAiApiKey(profile.authContents)) return null;
  return t("官方混合 API 不应在 auth.json 中保存 OPENAI_API_KEY。请清理此供应商的 auth.json 后再切换。");
}

function relayProfileUsesLiveFiles(profile: RelayProfile): boolean {
  return profile.relayMode !== "official" || profile.officialMixApiKey;
}

function authJsonHasOpenAiApiKey(contents: string): boolean {
  const trimmed = contents.trim();
  if (!trimmed) return false;
  try {
    const value = JSON.parse(trimmed);
    return !!value && typeof value === "object" && typeof value.OPENAI_API_KEY === "string" && value.OPENAI_API_KEY.trim().length > 0;
  } catch {
    return /"OPENAI_API_KEY"\s*:/.test(trimmed);
  }
}

function tomlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function syncLegacyRelayFields(settings: BackendSettings): BackendSettings {
  const relayProfiles = settings.relayProfiles.map((profile) =>
    isAggregateRelayProfile(profile) ? normalizeAggregateRelayProfile(profile, { ...settings, relayProfiles: settings.relayProfiles }) : deriveRelayProfileFromFiles(profile),
  );
  const active = activeRelayProfile({ ...settings, relayProfiles });
  const aggregateRelayProfiles = normalizeAggregateProfilesFromRelayProfiles(relayProfiles);
  const activeAggregateRelayId = isAggregateRelayProfile(active) ? active.id : "";
  return {
    ...settings,
    relayProfiles,
    activeRelayId: active.id,
    relayBaseUrl: isAggregateRelayProfile(active) ? PROTOCOL_PROXY_BASE_URL : active.baseUrl,
    relayApiKey: active.apiKey,
    aggregateRelayProfiles,
    activeAggregateRelayId,
  };
}

function normalizeAggregateProfilesFromRelayProfiles(profiles: RelayProfile[]): AggregateRelayProfile[] {
  const candidates = profiles.filter((profile) => !isAggregateRelayProfile(profile));
  return profiles.filter(isAggregateRelayProfile).map((profile) => {
    const aggregate = normalizeAggregateConfig(profile.aggregate, candidates);
    return {
      id: profile.id,
      name: profile.name || t("聚合供应商"),
      strategy: aggregate.strategy,
      members: aggregate.members.map((member) => ({
        relayId: member.profileId,
        weight: clampAggregateWeight(member.weight),
      })),
    };
  });
}
function updateRelayProfile(settings: BackendSettings, id: string, patch: Partial<RelayProfile>): BackendSettings {
  if (patch.relayMode === "aggregate" || patch.aggregate) {
    return syncLegacyRelayFields({
      ...settings,
      relayProfiles: settings.relayProfiles.map((profile) =>
        profile.id === id ? normalizeAggregateRelayProfile({ ...profile, ...patch }, settings) : profile,
      ),
    });
  }
  return syncLegacyRelayFields({
    ...settings,
    relayProfiles: settings.relayProfiles.map((profile) => {
      if (profile.id !== id) return profile;
      return deriveRelayProfileFromFiles({ ...profile, ...patch });
    }),
  });
}

function createRelayProfile(settings: BackendSettings): RelayProfile {
  const id = `relay-${Date.now().toString(36)}`;
  const contextSelection = contextSelectionForAllEntries(settings);
  const next = {
    id,
    name: tf("供应商 {0}", [settings.relayProfiles.length + 1]),
    model: "",
    baseUrl: defaultSettings.relayBaseUrl,
    upstreamBaseUrl: defaultSettings.relayBaseUrl,
    apiKey: "",
    protocol: "responses" as RelayProtocol,
    relayMode: "official" as RelayMode,
    officialMixApiKey: false,
    testModel: "",
    configContents: "",
    authContents: "",
    useCommonConfig: true,
    contextSelection,
    contextSelectionInitialized: true,
    contextWindow: "",
    autoCompactLimit: "",
    modelList: "",
    modelWindows: "",
    userAgent: "",
  };
  return withGeneratedRelayFiles(next);
}

function createAggregateRelayProfile(settings: BackendSettings): RelayProfile {
  const id = `aggregate-${Date.now().toString(36)}`;
  const contextSelection = contextSelectionForAllEntries(settings);
  const candidates = aggregateMemberCandidates(settings, id);
  return normalizeAggregateRelayProfile(
    {
      id,
      name: tf("聚合供应商 {0}", [settings.relayProfiles.filter(isAggregateRelayProfile).length + 1]),
      model: "",
      baseUrl: "",
      upstreamBaseUrl: "",
      apiKey: "",
      protocol: "responses",
      relayMode: "aggregate",
      officialMixApiKey: false,
      testModel: "",
      configContents: "",
      authContents: "",
      useCommonConfig: true,
      contextSelection,
      contextSelectionInitialized: true,
      contextWindow: "",
      autoCompactLimit: "",
      modelList: "",
      modelWindows: "",
      userAgent: "",
      aggregate: {
        strategy: "failover",
        members: candidates.slice(0, 1).map((profile) => ({ profileId: profile.id, weight: 1 })),
      },
    },
    settings,
  );
}

function addRelayProfile(settings: BackendSettings, profile: RelayProfile): BackendSettings {
  const nextWithFiles = isAggregateRelayProfile(profile)
    ? normalizeAggregateRelayProfile(profile, settings)
    : deriveRelayProfileFromFiles(
        profile.configContents.trim() || profile.authContents.trim() ? profile : withGeneratedRelayFiles(profile),
      );
  const activeId = settings.relayProfiles.some((item) => item.id === settings.activeRelayId)
    ? settings.activeRelayId
    : activeRelayProfile(settings).id;
  return syncLegacyRelayFields({
    ...settings,
    relayProfiles: [...settings.relayProfiles, nextWithFiles],
    activeRelayId: activeId,
  });
}

function duplicateRelayProfile(settings: BackendSettings, id: string): BackendSettings {
  const sourceIndex = settings.relayProfiles.findIndex((profile) => profile.id === id);
  const source = settings.relayProfiles[sourceIndex] || activeRelayProfile(settings);
  const nextId = `relay-${Date.now().toString(36)}`;
  const next = {
    ...source,
    id: nextId,
    name: tf("{0} 副本", [source.name || t("未命名供应商")]),
  };
  const normalizedNext = isAggregateRelayProfile(next) ? normalizeAggregateRelayProfile(next, settings) : next;
  const relayProfiles = [...settings.relayProfiles];
  relayProfiles.splice(sourceIndex >= 0 ? sourceIndex + 1 : relayProfiles.length, 0, normalizedNext);
  return syncLegacyRelayFields({
    ...settings,
    relayProfiles,
  });
}

function reorderRelayProfiles(settings: BackendSettings, sourceId: string, targetId: string): BackendSettings {
  if (sourceId === targetId) return settings;
  const sourceIndex = settings.relayProfiles.findIndex((profile) => profile.id === sourceId);
  const targetIndex = settings.relayProfiles.findIndex((profile) => profile.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return settings;
  const relayProfiles = [...settings.relayProfiles];
  const [moved] = relayProfiles.splice(sourceIndex, 1);
  relayProfiles.splice(targetIndex, 0, moved);
  return syncLegacyRelayFields({
    ...settings,
    relayProfiles,
  });
}

function removeRelayProfile(settings: BackendSettings, id: string): BackendSettings {
  const profiles = settings.relayProfiles.filter((profile) => profile.id !== id);
  const scrubbedProfiles = profiles.map((profile) =>
    isAggregateRelayProfile(profile)
      ? normalizeAggregateRelayProfile(
          {
            ...profile,
            aggregate: {
              ...normalizeAggregateConfig(profile.aggregate, []),
              members: normalizeAggregateConfig(profile.aggregate, []).members.filter((member) => member.profileId !== id),
            },
          },
          { ...settings, relayProfiles: profiles },
        )
      : profile,
  );
  return syncLegacyRelayFields({
    ...settings,
    relayProfiles: scrubbedProfiles.length ? scrubbedProfiles : defaultSettings.relayProfiles,
    activeRelayId: settings.activeRelayId === id ? scrubbedProfiles[0]?.id || "default" : settings.activeRelayId,
  });
}

const aggregateStrategyOptions: Array<{ value: RelayAggregateStrategy; label: string; description: string }> = [
  {
    value: "failover",
    label: t("失败切换"),
    description: t("按成员顺序请求，失败后切到下一个供应商。"),
  },
  {
    value: "conversationRoundRobin",
    label: t("按对话轮转"),
    description: t("同一对话保持一个成员，不同对话依次分配。"),
  },
  {
    value: "requestRoundRobin",
    label: t("按请求轮转"),
    description: t("每次请求按成员顺序切换，适合均匀摊请求量。"),
  },
  {
    value: "weightedRoundRobin",
    label: t("权重轮转"),
    description: t("按成员权重分配请求，权重越高承担越多。"),
  },
];

function isAggregateRelayProfile(profile: Pick<RelayProfile, "relayMode" | "aggregate">): boolean {
  return profile.relayMode === "aggregate" || !!profile.aggregate;
}

function normalizeAggregateRelayProfile(profile: RelayProfile, settings: BackendSettings | null): RelayProfile {
  const candidates = settings ? aggregateMemberCandidates(settings, profile.id) : [];
  const aggregate = normalizeAggregateConfig(profile.aggregate, candidates);
  return {
    ...profile,
    baseUrl: "",
    upstreamBaseUrl: "",
    apiKey: "",
    protocol: "responses",
    relayMode: "aggregate",
    officialMixApiKey: false,
    configContents: "",
    authContents: "",
    aggregate,
  };
}

function normalizeAggregateConfig(
  aggregate: RelayAggregateConfig | null | undefined,
  candidates: RelayProfile[],
): RelayAggregateConfig {
  const candidateIds = new Set(candidates.map((profile) => profile.id));
  const seen = new Set<string>();
  const strategy: RelayAggregateStrategy =
    aggregate?.strategy && aggregateStrategyOptions.some((option) => option.value === aggregate.strategy)
      ? aggregate.strategy
      : "failover";
  const members = (aggregate?.members ?? [])
    .filter((member) => member.profileId && !seen.has(member.profileId))
    .filter((member) => !candidateIds.size || candidateIds.has(member.profileId))
    .map((member) => {
      seen.add(member.profileId);
      return { profileId: member.profileId, weight: clampAggregateWeight(member.weight) };
    });
  return { strategy, members };
}

function aggregateMemberCandidates(settings: BackendSettings, aggregateId: string): RelayProfile[] {
  return settings.relayProfiles.filter(
    (profile) => profile.id !== aggregateId && !isAggregateRelayProfile(profile) && isApiRelayProfile(profile),
  );
}

function isApiRelayProfile(profile: RelayProfile): boolean {
  return Boolean(profile.baseUrl.trim() && profile.apiKey.trim());
}

function clampAggregateWeight(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(999, Math.round(value)));
}

function aggregateStrategyLabel(strategy: RelayAggregateStrategy): string {
  return aggregateStrategyOptions.find((option) => option.value === strategy)?.label ?? t("失败切换");
}

function aggregateStrategyHelp(strategy: RelayAggregateStrategy): string {
  if (strategy === "failover") return t("失败切换会保留成员顺序，优先使用第一个可用供应商。");
  if (strategy === "conversationRoundRobin") return t("按对话轮转会让同一对话尽量保持固定成员，降低上下文漂移。");
  if (strategy === "requestRoundRobin") return t("按请求轮转会逐请求切换成员，适合供应商能力接近的场景。");
  return t("权重轮转会读取每个成员的权重值，权重越高的成员获得更多请求。");
}

function aggregateRelayProfileValidation(profile: RelayProfile): string | null {
  const aggregate = normalizeAggregateConfig(profile.aggregate, []);
  return aggregate.members.length >= 1 ? null : t("聚合供应商至少需要勾选 1 个已填写 Base URL / Key 的 API 供应商。");
}

function numberOrDefault(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function splitLogLines(text: string) {
  return text.trimEnd().split(/\r?\n/).filter((line, index, lines) => line.length > 0 || index < lines.length - 1);
}

function zedStrategyLabel(strategy: ZedOpenStrategy) {
  if (strategy === "reuseWindow") return t("复用窗口");
  if (strategy === "newWindow") return t("新窗口");
  if (strategy === "default") return t("Zed 默认行为");
  return t("加入当前工作区");
}

function zedRemoteHostLabel(project: ZedRemoteProject) {
  const user = project.ssh.user ? `${project.ssh.user}@` : "";
  const port = project.ssh.port ? `:${project.ssh.port}` : "";
  return `${user}${project.ssh.host}${port}`;
}

function zedRemoteSourceLabel(source: string) {
  if (source === "currentThread") return t("当前会话");
  if (source === "codexRemoteProject") return "Codex remote project";
  if (source === "threadWorkspaceHint") return "Thread workspace hint";
  if (source === "sqliteThreadCwd") return "SQLite cwd";
  if (source === "recent") return t("最近打开");
  return source || t("未知来源");
}

function formatTime(value: number) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN");
}

function formatDuration(startedAtMs: number): string {
  if (!startedAtMs) return "-";
  const elapsed = Date.now() - startedAtMs;
  if (elapsed < 0) return formatTime(startedAtMs);
  const mins = Math.floor(elapsed / 60000);
  if (mins < 1) return t("刚刚启动");
  if (mins < 60) return tf("已运行 {0} 分钟", [mins]);
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return tf("已运行 {0} 小时 {1} 分钟", [hours, remainMins]);
}

function stringifyError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function loadInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.localStorage.getItem("codex-plus-theme") === "light" ? "light" : "dark";
}

function loadInitialRoute(): Route {
  if (typeof window === "undefined") return "overview";
  if (window.location.hash === "#about") {
    return "about";
  }
  return "overview";
}
// 頨思遢雿?

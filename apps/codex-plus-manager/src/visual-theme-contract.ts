export type VisualThemeTokens = {
  background: string;
  surface: string;
  accent: string;
  border: string;
  text: string;
  radius: number;
  fontScale: number;
};

export type DreamSkinArt = {
  focusX: number;
  focusY: number;
  safeArea: "left" | "right" | "center" | "none";
  taskMode: "ambient" | "banner" | "off";
  layout?: "auto" | "card" | "immersive";
};

export type VisualThemeItem = {
  id: string;
  name: string;
  detail?: string;
  tier: "pro";
  version: string;
  revision?: string;
  sha256?: string;
  assetBytes?: number;
  access?: "public" | "restricted";
  cssProfile?: "character-hero-light" | "dream-skin-light";
  art?: DreamSkinArt;
  previewAsset?: string;
  heroAsset?: string;
  tokens: VisualThemeTokens;
};

export type VisualThemeManifest = {
  version: string;
  updatedAt?: string;
  authorizationExpiresAt?: string;
  themes: VisualThemeItem[];
  allowedThemeIds?: string[];
};

export type VisibleVisualTheme = VisualThemeItem & { authorized: boolean };

export function isAppliedVisualTheme(input: {
  enabled: boolean;
  selectedId: string;
  item: Pick<VisibleVisualTheme, "id" | "authorized">;
}) {
  return input.enabled && input.selectedId === input.item.id && input.item.authorized;
}

const safeAsset = (value: unknown) =>
  typeof value === "string" && /^[a-z0-9][a-z0-9._-]{0,127}\.(png|jpe?g|webp)$/i.test(value);
const safeColor = (value: unknown) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
const safeId = (value: unknown) => typeof value === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(value);
const safeVersion = (value: unknown) => typeof value === "string" && /^[0-9A-Za-z][0-9A-Za-z._-]{0,31}$/.test(value);
const safeSha256 = (value: unknown) => typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
const safeDreamSkinArt = (value: unknown): value is DreamSkinArt => {
  if (!isRecord(value)) return false;
  return typeof value.focusX === "number" && Number.isFinite(value.focusX) && value.focusX >= 0 && value.focusX <= 1
    && typeof value.focusY === "number" && Number.isFinite(value.focusY) && value.focusY >= 0 && value.focusY <= 1
    && ["left", "right", "center", "none"].includes(String(value.safeArea))
    && ["ambient", "banner", "off"].includes(String(value.taskMode))
    && (value.layout === undefined || ["auto", "card", "immersive"].includes(String(value.layout)));
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTheme(value: unknown): value is VisualThemeItem {
  if (!isRecord(value) || !safeId(value.id) || typeof value.name !== "string" || value.name.trim().length === 0 || value.tier !== "pro" || !safeVersion(value.version)) return false;
  if (value.access !== undefined && value.access !== "public" && value.access !== "restricted") return false;
  if (value.cssProfile !== undefined && value.cssProfile !== "character-hero-light" && value.cssProfile !== "dream-skin-light") return false;
  if (value.art !== undefined && !safeDreamSkinArt(value.art)) return false;
  if (value.previewAsset !== undefined && !safeAsset(value.previewAsset)) return false;
  if (value.heroAsset !== undefined && !safeAsset(value.heroAsset)) return false;
  if (value.revision !== undefined && !safeVersion(value.revision)) return false;
  if (value.sha256 !== undefined && !safeSha256(value.sha256)) return false;
  if (value.assetBytes !== undefined && (!Number.isInteger(value.assetBytes) || typeof value.assetBytes !== "number" || value.assetBytes < 0 || value.assetBytes > 16 * 1024 * 1024)) return false;
  if (!isRecord(value.tokens)) return false;
  const { background, surface, accent, border, text, radius, fontScale } = value.tokens;
  return [background, surface, accent, border, text].every(safeColor)
    && Number.isInteger(radius) && typeof radius === "number" && radius >= 0 && radius <= 32
    && typeof fontScale === "number" && Number.isFinite(fontScale) && fontScale >= 0.8 && fontScale <= 1.3;
}

export function isThemeManifest(value: unknown): value is VisualThemeManifest {
  if (!isRecord(value) || !safeVersion(value.version) || !Array.isArray(value.themes)) return false;
  if (value.updatedAt !== undefined && (typeof value.updatedAt !== "string" || value.updatedAt.length > 80)) return false;
  if (value.authorizationExpiresAt !== undefined && (typeof value.authorizationExpiresAt !== "string" || Number.isNaN(Date.parse(value.authorizationExpiresAt)))) return false;
  if (value.allowedThemeIds !== undefined && (!Array.isArray(value.allowedThemeIds) || !value.allowedThemeIds.every(safeId))) return false;
  return value.themes.every(isTheme);
}

export function themesVisibleToMember(manifest: VisualThemeManifest): VisibleVisualTheme[] {
  const allowed = new Set(manifest.allowedThemeIds ?? []);
  return manifest.themes.map((theme) => ({ ...theme, authorized: theme.access !== "restricted" || allowed.has(theme.id) }));
}

export function themePreviewAssetCandidates(theme: Pick<VisualThemeItem, "previewAsset" | "heroAsset">): string[] {
  return [...new Set([theme.previewAsset, theme.heroAsset].filter((asset): asset is string => typeof asset === "string" && asset.length > 0))];
}

export function isThemeAccessToken(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 16 && value.trim().length <= 4096;
}

export type VisualThemeTokens = {
  background: string;
  surface: string;
  accent: string;
  border: string;
  text: string;
  radius: number;
  fontScale: number;
};

export type VisualThemeItem = {
  id: string;
  name: string;
  detail?: string;
  tier: "pro";
  version: string;
  access?: "public" | "restricted";
  cssProfile?: "character-hero-light";
  previewAsset?: string;
  heroAsset?: string;
  tokens: VisualThemeTokens;
};

export type VisualThemeManifest = {
  version: string;
  updatedAt?: string;
  themes: VisualThemeItem[];
  allowedThemeIds?: string[];
};

export type VisibleVisualTheme = VisualThemeItem & { authorized: boolean };

const safeAsset = (value: unknown) =>
  typeof value === "string" && /^[a-z0-9][a-z0-9._-]{0,127}\.(png|jpe?g|webp)$/i.test(value);
const safeColor = (value: unknown) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
const safeId = (value: unknown) => typeof value === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(value);
const safeVersion = (value: unknown) => typeof value === "string" && /^[0-9A-Za-z][0-9A-Za-z._-]{0,31}$/.test(value);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTheme(value: unknown): value is VisualThemeItem {
  if (!isRecord(value) || !safeId(value.id) || typeof value.name !== "string" || value.name.trim().length === 0 || value.tier !== "pro" || !safeVersion(value.version)) return false;
  if (value.access !== undefined && value.access !== "public" && value.access !== "restricted") return false;
  if (value.cssProfile !== undefined && value.cssProfile !== "character-hero-light") return false;
  if (value.previewAsset !== undefined && !safeAsset(value.previewAsset)) return false;
  if (value.heroAsset !== undefined && !safeAsset(value.heroAsset)) return false;
  if (!isRecord(value.tokens)) return false;
  const { background, surface, accent, border, text, radius, fontScale } = value.tokens;
  return [background, surface, accent, border, text].every(safeColor)
    && Number.isInteger(radius) && typeof radius === "number" && radius >= 0 && radius <= 32
    && typeof fontScale === "number" && Number.isFinite(fontScale) && fontScale >= 0.8 && fontScale <= 1.3;
}

export function isThemeManifest(value: unknown): value is VisualThemeManifest {
  if (!isRecord(value) || !safeVersion(value.version) || !Array.isArray(value.themes)) return false;
  if (value.updatedAt !== undefined && (typeof value.updatedAt !== "string" || value.updatedAt.length > 80)) return false;
  if (value.allowedThemeIds !== undefined && (!Array.isArray(value.allowedThemeIds) || !value.allowedThemeIds.every(safeId))) return false;
  return value.themes.every(isTheme);
}

export function themesVisibleToMember(manifest: VisualThemeManifest): VisibleVisualTheme[] {
  const allowed = new Set(manifest.allowedThemeIds ?? []);
  return manifest.themes.map((theme) => ({ ...theme, authorized: theme.access !== "restricted" || allowed.has(theme.id) }));
}

export function isThemeAccessToken(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 16 && value.trim().length <= 4096;
}

import type { DreamSkinArt, VisualThemeItem } from "./visual-theme-contract.ts";

export type CustomWallpaperProfile = { dominant: string; luma: number };

function readableWallpaperAccent(dominant: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(dominant.trim());
  if (!match) return "#3d7fda";
  const channels = [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16));
  const linear = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  if (luminance <= 0.48) return `#${match[1].toLowerCase()}`;
  return `#${channels.map((channel) => Math.round(channel * 0.7).toString(16).padStart(2, "0")).join("")}`;
}

export function validateCustomDreamSkin(value: unknown): value is { art: DreamSkinArt } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const art = (value as { art?: unknown }).art;
  if (!art || typeof art !== "object" || Array.isArray(art)) return false;
  const candidate = art as Partial<DreamSkinArt>;
  return typeof candidate.focusX === "number" && Number.isFinite(candidate.focusX) && candidate.focusX >= 0 && candidate.focusX <= 1
    && typeof candidate.focusY === "number" && Number.isFinite(candidate.focusY) && candidate.focusY >= 0 && candidate.focusY <= 1
    && ["left", "right", "center", "none"].includes(String(candidate.safeArea))
    && ["ambient", "banner", "off"].includes(String(candidate.taskMode));
}

export function createCustomDreamSkin(profile: CustomWallpaperProfile, sourceName: string): VisualThemeItem {
  const light = profile.luma >= 0.52;
  const accent = readableWallpaperAccent(profile.dominant);
  const extension = /\.(png|jpe?g|webp)$/i.exec(sourceName)?.[1]?.toLowerCase() || "png";
  return {
    id: "custom-dream-skin",
    name: "自定义 Dream Skin",
    detail: "使用本地壁纸生成的浅色沉浸式 Codex 主题",
    tier: "pro",
    version: "1.0.0",
    access: "public",
    cssProfile: "dream-skin-light",
    heroAsset: `local-custom-wallpaper.${extension === "jpeg" ? "jpg" : extension}`,
    art: { focusX: 0.5, focusY: 0.45, safeArea: "left", taskMode: "ambient" },
    tokens: light
      ? { background: "#f7faf8", surface: "#ffffff", accent, border: "#d7e0dc", text: "#26332e", radius: 18, fontScale: 1 }
      : { background: "#1b2224", surface: "#242d30", accent, border: "#536166", text: "#f3f8f7", radius: 18, fontScale: 1 },
  };
}

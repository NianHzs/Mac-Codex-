import type { VisualThemeManifest } from "./visual-theme-contract.ts";

export type ThemeFeedback = {
  onlineThemeCount: number;
  authorisedRestrictedNames: string[];
  cloudDreamAvailable: boolean;
};

export function buildThemeFeedback(manifest: VisualThemeManifest | null): ThemeFeedback {
  if (!manifest) {
    return {
      onlineThemeCount: 0,
      authorisedRestrictedNames: [],
      cloudDreamAvailable: false,
    };
  }

  const allowedThemeIds = new Set(manifest.allowedThemeIds ?? []);
  return {
    onlineThemeCount: manifest.themes.length,
    authorisedRestrictedNames: manifest.themes
      .filter((theme) => theme.access === "restricted" && allowedThemeIds.has(theme.id))
      .map((theme) => theme.name),
    cloudDreamAvailable: manifest.themes.some((theme) => theme.id === "hello-kitty-cloud-dream"),
  };
}

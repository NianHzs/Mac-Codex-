const forbiddenThemeTargets = new Set(["html", "body", "#root", "aside"]);

export function isForbiddenThemeTarget(selector: string) {
  return forbiddenThemeTargets.has(selector.trim());
}

export function themeScopeSelector(selector: string) {
  if (isForbiddenThemeTarget(selector)) throw new Error(`Theme target is not allowed: ${selector}`);
  return `${selector}[data-codework-theme-scope]`;
}

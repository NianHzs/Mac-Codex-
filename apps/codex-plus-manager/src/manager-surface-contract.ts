export const protectedManagerSurfaceSelectors = [
  ".workspace",
  ".topbar",
  ".panel",
  ".card",
  ".private-chat-dialog",
  ".notification-popover",
] as const;

export const managerReadingVariables = [
  "--reading-surface: rgb(248 252 255 / 0.84)",
  "--reading-surface-strong: rgb(255 255 255 / 0.94)",
  "--reading-text: #13253a",
  "--chrome-surface: rgb(241 248 255 / 0.80)",
  "--chrome-text: #0e2238",
].join(";");

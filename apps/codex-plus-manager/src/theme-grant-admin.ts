export const restrictedThemeOptions = [
  { id: "hello-kitty-christmas", label: "凯蒂猫 · 圣诞限定" },
  { id: "shinchan-energy", label: "蜡笔小新 · 元气限定" },
  { id: "hello-kitty-cloud-dream", label: "凯蒂猫 · 云端梦境限定" },
] as const;

export type ThemeGrantMember = { userId: string; username: string };

const allowedIds = new Set(restrictedThemeOptions.map((theme) => theme.id));

export function normalizeThemeGrantIds(themeIds: readonly string[]): string[] {
  const selected = new Set(themeIds.filter((id) => allowedIds.has(id as typeof restrictedThemeOptions[number]["id"])));
  return restrictedThemeOptions.filter((theme) => selected.has(theme.id)).map((theme) => theme.id);
}

export function canSaveThemeGrant(member: ThemeGrantMember | null, _themeIds: readonly string[]): boolean {
  return Boolean(member?.userId && member.username);
}

export type NavigationGroupId = "workspace" | "community" | "clientTools" | "codexTools" | "system";

export type NavigationItem<T extends string = string> = {
  id: T;
  group: NavigationGroupId;
  adminOnly?: boolean;
};

export type NavigationGroup<T extends string = string> = {
  id: NavigationGroupId;
  label: string;
  expanded: boolean;
  items: NavigationItem<T>[];
};

const groupLabels: Record<NavigationGroupId, string> = {
  workspace: "工作台",
  community: "账户与社区",
  clientTools: "客户端工具",
  codexTools: "Codex 工具",
  system: "系统",
};

const defaultExpanded = new Set<NavigationGroupId>(["workspace", "community"]);
const orderedGroups: NavigationGroupId[] = ["workspace", "community", "clientTools", "codexTools", "system"];

export function navigationGroupExpanded<T extends NavigationGroupId>(
  defaultExpanded: boolean,
  id: T,
  toggledGroups: ReadonlySet<T>,
): boolean {
  return defaultExpanded ? !toggledGroups.has(id) : toggledGroups.has(id);
}

export function toggleNavigationGroup<T extends NavigationGroupId>(
  _defaultExpanded: boolean,
  id: T,
  toggledGroups: ReadonlySet<T>,
): Set<T> {
  const next = new Set(toggledGroups);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function groupNavigationItems<T extends string>(
  items: readonly NavigationItem<T>[],
  activeRoute: T,
  actualAdmin: boolean,
): NavigationGroup<T>[] {
  return orderedGroups.flatMap((id) => {
    const visibleItems = items.filter((item) => item.group === id && (!item.adminOnly || actualAdmin));
    if (!visibleItems.length) return [];
    return [{
      id,
      label: groupLabels[id],
      expanded: defaultExpanded.has(id) || visibleItems.some((item) => item.id === activeRoute),
      items: visibleItems,
    }];
  });
}

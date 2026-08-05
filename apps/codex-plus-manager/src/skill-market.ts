export type SkillInstallState = {
  installed: boolean;
  updateAvailable: boolean;
};

export type SkillUsageGuide = {
  scenarios: string;
  trigger: string;
  output: string;
  notice: string;
};

export function skillUsageGuideRows(usage?: Partial<SkillUsageGuide> | null): Array<[string, string]> {
  return [
    ["适用场景", usage?.scenarios ?? ""],
    ["如何使用", usage?.trigger ?? ""],
    ["输出内容", usage?.output ?? ""],
    ["使用提醒", usage?.notice ?? ""],
  ].filter((row): row is [string, string] => Boolean(row[1]?.trim()));
}

export function skillActionLabel(skill: SkillInstallState): "安装" | "已安装" | "更新" {
  if (skill.updateAvailable) return "更新";
  return skill.installed ? "已安装" : "安装";
}

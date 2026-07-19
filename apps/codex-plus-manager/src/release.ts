export type CodeworkReleaseStatus = "ok" | "accepted" | "failed" | "not_checked" | string;

export type CodeworkReleaseSummary = {
  status?: CodeworkReleaseStatus;
  available?: boolean;
  latestVersion?: string | null;
};

export type AvailableCodeworkRelease = {
  latestVersion: string;
};

export type CodeworkReleaseDisplay = {
  state: "up_to_date" | "update_available" | "update_incomplete";
  runningVersion: string;
};

export type CodeworkUpdateStage =
  | "checking"
  | "downloading"
  | "downloaded"
  | "verifying"
  | "installing"
  | "closing"
  | "relaunching"
  | "rollback"
  | "failed"
  | "integrity_failed";

const codeworkUpdateStages: CodeworkUpdateStage[] = [
  "downloading",
  "downloaded",
  "verifying",
  "installing",
  "closing",
  "relaunching",
];

const codeworkUpdateStageLabels: Record<CodeworkUpdateStage, string> = {
  checking: "正在检测",
  downloading: "正在下载",
  downloaded: "下载完成",
  verifying: "正在校验安装包签名与完整性",
  installing: "正在覆盖安装，完成后自动重启",
  closing: "正在关闭旧客户端",
  relaunching: "正在启动新版客户端",
  rollback: "正在恢复更新前版本",
  failed: "更新失败，当前版本未受影响",
  integrity_failed: "安装包校验失败，当前版本未受影响",
};

export function getAvailableCodeworkRelease(release: CodeworkReleaseSummary | null | undefined): AvailableCodeworkRelease | null {
  const latestVersion = typeof release?.latestVersion === "string" ? release.latestVersion.trim() : "";
  if (!release?.available || !latestVersion || (release.status !== "ok" && release.status !== "accepted")) return null;
  return { latestVersion };
}

export function getCodeworkReleaseDisplay(input: { currentVersion: string; latestVersion: string; pendingTargetVersion?: string | null }): CodeworkReleaseDisplay {
  const runningVersion = input.currentVersion.trim();
  const pendingTargetVersion = input.pendingTargetVersion?.trim();
  if (pendingTargetVersion && pendingTargetVersion !== runningVersion) {
    return { state: "update_incomplete", runningVersion };
  }
  return {
    state: runningVersion === input.latestVersion.trim() ? "up_to_date" : "update_available",
    runningVersion,
  };
}

export function getCodeworkUpdateSteps(stage: string | null | undefined): CodeworkUpdateStage[] {
  if (stage === "checking") return ["checking"];
  if (stage === "rollback") return ["rollback"];
  return [...codeworkUpdateStages];
}

export function getCodeworkUpdateStageLabel(stage: string | null | undefined): string {
  if (stage && stage in codeworkUpdateStageLabels) {
    return codeworkUpdateStageLabels[stage as CodeworkUpdateStage];
  }
  return "等待操作";
}

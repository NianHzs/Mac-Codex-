export type CodeworkReleaseStatus = "ok" | "accepted" | "failed" | "not_checked" | string;

export type CodeworkReleaseSummary = {
  status?: CodeworkReleaseStatus;
  available?: boolean;
  latestVersion?: string | null;
};

export type AvailableCodeworkRelease = {
  latestVersion: string;
};

export type CodeworkUpdateStage = "checking" | "downloading" | "downloaded" | "installing" | "closing" | "relaunching";

const codeworkUpdateStages: CodeworkUpdateStage[] = ["downloading", "downloaded", "installing", "closing", "relaunching"];

export function getAvailableCodeworkRelease(release: CodeworkReleaseSummary | null | undefined): AvailableCodeworkRelease | null {
  const latestVersion = typeof release?.latestVersion === "string" ? release.latestVersion.trim() : "";
  if (!release?.available || !latestVersion || (release.status !== "ok" && release.status !== "accepted")) return null;
  return { latestVersion };
}

export function getCodeworkUpdateSteps(stage: string | null | undefined): CodeworkUpdateStage[] {
  if (stage === "checking") return ["checking"];
  return [...codeworkUpdateStages];
}

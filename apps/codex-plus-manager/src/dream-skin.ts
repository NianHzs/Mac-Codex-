export type DreamSkinStage = "off" | "checking" | "downloading" | "verifying_asset" | "restart_required" | "injecting" | "verifying_renderer" | "active" | "paused" | "failed";
export type DreamSkinAction = "apply" | "cancel" | "restart_and_apply" | "reapply" | "pause" | "resume" | "restore" | "retry";

export function getDreamSkinActions(stage: DreamSkinStage): DreamSkinAction[] {
  switch (stage) {
    case "restart_required": return ["cancel", "restart_and_apply"];
    case "active": return ["reapply", "restore"];
    case "paused": return ["resume", "restore"];
    case "failed": return ["retry", "restore"];
    case "off": return ["apply"];
    default: return ["cancel"];
  }
}

export function resolveDreamSkinPanelTone(stage: DreamSkinStage, _clientSkin: "blue" | "pink"): string {
  return stage === "active" ? "dream-active" : stage === "failed" ? "dream-failed" : "dream-neutral";
}

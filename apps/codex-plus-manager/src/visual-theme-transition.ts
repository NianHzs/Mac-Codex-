export type VisualThemeTransitionRequest = {
  enabled: boolean;
  themeId: string;
  serviceUrl: string;
  displayName: string;
};

export type VisualThemeTransitionDependencies = {
  saveSettings: (enabled: boolean, themeId: string, serviceUrl: string) => Promise<boolean>;
  restart: () => Promise<boolean>;
  verifyRuntime?: (themeId: string, sinceMs: number) => Promise<{
    state: "pending" | "active" | "failed";
    themeId?: string;
    message?: string;
  }>;
  setStatus: (value: string) => void;
};

export async function runVisualThemeTransition(
  request: VisualThemeTransitionRequest,
  dependencies: VisualThemeTransitionDependencies,
): Promise<void> {
  const transitionStartedAt = Date.now();
  dependencies.setStatus(`正在保存${request.displayName}主题设置…`);
  const saved = await dependencies.saveSettings(request.enabled, request.themeId, request.serviceUrl);
  if (!saved) throw new Error("主题设置保存失败");

  dependencies.setStatus("正在重启当前 Codework 客户端以应用主题…");
  const restarted = await dependencies.restart();
  if (!restarted) throw new Error("主题设置已保存，但重启 Codework 客户端失败");

  if (request.enabled && dependencies.verifyRuntime) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      dependencies.setStatus(`正在等待 Codework 应用${request.displayName}主题…`);
      const runtime = await dependencies.verifyRuntime(request.themeId, transitionStartedAt);
      if (runtime.state === "active" && runtime.themeId === request.themeId) {
        dependencies.setStatus(`${request.displayName}已应用`);
        return;
      }
      if (runtime.state === "failed" && (!runtime.themeId || runtime.themeId === request.themeId)) {
        throw new Error(runtime.message || "主题渲染失败");
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    dependencies.setStatus("设置已保存，等待 Codework 完成主题加载");
    return;
  }

  dependencies.setStatus(request.enabled ? `${request.displayName}已应用` : "已恢复官方默认");
}

export type RelayTokenView = {
  id: string;
  active: boolean;
  unlimitedQuota: boolean;
  expiredTime: number;
  remainQuota: number;
  group?: string;
  models?: string[];
};

export const supportedRelayGroups = ["gpt-pro-额度计费", "gpt-额度计费", "临时低价分组"] as const;
const supportedRelayGroupSet = new Set<string>(supportedRelayGroups);

/// 国产模型 0.5X 分组的展示名，中转站真实分组名可能变动，前端只用它做归类标签。
export const domesticRelayGroupLabel = "国产模型 0.5X";

/// 国产分组包含的模型 id，与 Rust 侧 DOMESTIC_RELAY_MODELS 保持一致。
export const domesticRelayModels = ["glm-5.2", "deepseek-v4-pro", "deepseek-v4-flash", "qwen3.7-plus"] as const;
const domesticRelayModelSet = new Set<string>(domesticRelayModels);

/// 国产分组名关键字，与 Rust 侧 DOMESTIC_RELAY_GROUP_HINTS 保持一致（比较时统一转小写）。
const domesticRelayGroupHints = ["国产", "0.5x"] as const;

export type RelayModelGroup = {
  group: (typeof supportedRelayGroups)[number] | typeof domesticRelayGroupLabel;
  models: string[];
};

export function isDomesticRelayModel(model: string): boolean {
  return domesticRelayModelSet.has(model.trim().toLowerCase());
}

/// 仅看分组名判断是否为国产分组，与 Rust 侧 is_domestic_relay_group_name 对齐。
export function isDomesticRelayGroupName(group: string | undefined): boolean {
  const normalized = (group || "").trim().toLowerCase();
  return normalized.length > 0 && domesticRelayGroupHints.some((hint) => normalized.includes(hint));
}

export function isDomesticRelayToken(token: RelayTokenView): boolean {
  if (isDomesticRelayGroupName(token.group)) return true;
  return (token.models || []).some((model) => isDomesticRelayModel(model));
}

/// 解析国产分组令牌实际可用的模型列表，与 Rust 侧 domestic_relay_models_for_token 对齐。
///
/// `models` 为空表示中转站没有限制该令牌可用模型，此时按白名单全量放通；
/// 显式列出模型时只展示列出的那些。分组名已确认是国产分组时信任列表原样，
/// 中转站上新模型不必等客户端发版；仅靠模型 id 命中白名单归类的令牌继续过滤，
/// 避免把 GPT 模型混进国产分组。
export function domesticRelayModelsForToken(token: RelayTokenView): string[] {
  const listed = (token.models || []).map((model) => model.trim()).filter((model) => model.length > 0);

  if (listed.length === 0) return [...domesticRelayModels];
  if (isDomesticRelayGroupName(token.group)) return listed;
  return listed.filter((model) => isDomesticRelayModel(model));
}

/// 客户端接管的令牌：GPT 白名单分组 + 国产模型分组。
export function isSupportedRelayToken(token: RelayTokenView): boolean {
  return supportedRelayGroupSet.has(token.group || "") || isDomesticRelayToken(token);
}

export function relayTokenCanApply(token: RelayTokenView, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  return token.active && (token.expiredTime <= 0 || token.expiredTime > nowSeconds);
}

export function relayTokenStatus(token: RelayTokenView, nowSeconds = Math.floor(Date.now() / 1000)): string {
  if (!token.active) return "已停用";
  if (token.expiredTime > 0 && token.expiredTime <= nowSeconds) return "已过期";
  return "可用";
}

export function formatRelayQuota(token: RelayTokenView): string {
  if (token.unlimitedQuota) return "不限";
  return new Intl.NumberFormat("zh-CN").format(Math.max(0, token.remainQuota || 0));
}

export function walletBalanceDisplay(wallet: { display?: string } | null | undefined): string {
  return wallet?.display?.trim() || "—";
}

export function totalAvailableRelayQuota(tokens: RelayTokenView[], nowSeconds = Math.floor(Date.now() / 1000)): number {
  return tokens
    .filter((token) => isSupportedRelayToken(token) && relayTokenCanApply(token, nowSeconds) && !token.unlimitedQuota)
    .reduce((total, token) => total + Math.max(0, token.remainQuota || 0), 0);
}

export function groupRelayModels(tokens: RelayTokenView[]): RelayModelGroup[] {
  const groups: RelayModelGroup[] = supportedRelayGroups.map((group) => {
    const models = new Set<string>();
    for (const token of tokens) {
      if (token.group !== group) continue;
      for (const model of token.models || []) {
        const normalized = model.trim();
        // 国产模型即使挂在 GPT 分组名下也归到国产分组，避免重复展示。
        if (normalized && !isDomesticRelayModel(normalized)) models.add(normalized);
      }
    }
    return { group, models: [...models].sort((left, right) => left.localeCompare(right)) };
  });

  const domesticModels = new Set<string>();
  for (const token of tokens) {
    if (!isDomesticRelayToken(token)) continue;
    for (const model of domesticRelayModelsForToken(token)) {
      domesticModels.add(model);
    }
  }
  groups.push({
    group: domesticRelayGroupLabel,
    models: [...domesticModels].sort((left, right) => left.localeCompare(right)),
  });

  return groups;
}

/// 收集国产分组下可用的令牌，供「一键配置 WorkBuddy」使用。
export function domesticRelayTokens(
  tokens: RelayTokenView[],
  nowSeconds = Math.floor(Date.now() / 1000),
): RelayTokenView[] {
  return tokens.filter((token) => isDomesticRelayToken(token) && relayTokenCanApply(token, nowSeconds));
}

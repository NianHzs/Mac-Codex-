import assert from "node:assert/strict";
import test from "node:test";

import { domesticRelayModels, domesticRelayModelsForToken, domesticRelayTokens, formatRelayQuota, groupRelayModels, isDomesticRelayModel, isDomesticRelayToken, isSupportedRelayToken, relayTokenCanApply, relayTokenStatus, totalAvailableRelayQuota, walletBalanceDisplay } from "./relay-token-state.ts";

test("active non-expired relay token can be applied and exposes a Chinese status", () => {
  const token = {
    id: "42",
    active: true,
    unlimitedQuota: false,
    expiredTime: -1,
    remainQuota: 123456,
  };

  assert.equal(relayTokenCanApply(token, 1_720_000_000), true);
  assert.equal(relayTokenStatus(token, 1_720_000_000), "可用");
  assert.equal(formatRelayQuota(token), "123,456");
});

test("disabled and expired relay tokens cannot be applied", () => {
  const disabled = { id: "1", active: false, unlimitedQuota: false, expiredTime: -1, remainQuota: 0 };
  const expired = { id: "2", active: true, unlimitedQuota: false, expiredTime: 1_700_000_000, remainQuota: 0 };

  assert.equal(relayTokenCanApply(disabled, 1_720_000_000), false);
  assert.equal(relayTokenStatus(disabled, 1_720_000_000), "已停用");
  assert.equal(relayTokenCanApply(expired, 1_720_000_000), false);
  assert.equal(relayTokenStatus(expired, 1_720_000_000), "已过期");
});

test("total quota counts only active non-expired tokens in the three supported groups", () => {
  const tokens = [
    { id: "1", active: true, unlimitedQuota: false, expiredTime: -1, remainQuota: 1200, group: "gpt-pro-额度计费" },
    { id: "2", active: true, unlimitedQuota: false, expiredTime: -1, remainQuota: 800, group: "gpt-额度计费" },
    { id: "3", active: true, unlimitedQuota: false, expiredTime: -1, remainQuota: 500, group: "其他分组" },
    { id: "4", active: false, unlimitedQuota: false, expiredTime: -1, remainQuota: 600, group: "临时低价分组" },
  ];
  assert.equal(totalAvailableRelayQuota(tokens, 1_720_000_000), 2000);
});

test("wallet balance display prefers the synchronized middle-station wallet value", () => {
  assert.equal(walletBalanceDisplay({ display: "¥61.55" }), "¥61.55");
  assert.equal(walletBalanceDisplay(null), "—");
});

test("groups only supported relay models and de-duplicates entries for the model center", () => {
  const groups = groupRelayModels([
    {
      id: "1", active: true, unlimitedQuota: false, expiredTime: -1, remainQuota: 1,
      group: "gpt-pro-额度计费", models: ["gpt-5.6-sol", "gpt-5.6-sol", "gpt-5.6-terra"],
    },
    {
      id: "2", active: true, unlimitedQuota: false, expiredTime: -1, remainQuota: 1,
      group: "临时低价分组", models: ["grok-4.5"],
    },
    {
      id: "3", active: true, unlimitedQuota: false, expiredTime: -1, remainQuota: 1,
      group: "其他分组", models: ["should-not-be-shown"],
    },
  ]);

  assert.deepEqual(groups, [
    { group: "gpt-pro-额度计费", models: ["gpt-5.6-sol", "gpt-5.6-terra"] },
    { group: "gpt-额度计费", models: [] },
    { group: "临时低价分组", models: ["grok-4.5"] },
    { group: "国产模型 0.5X", models: [] },
  ]);
});

test("recognizes the domestic 0.5X group by model ids even when the remote group is renamed", () => {
  const renamed = {
    id: "9", active: true, unlimitedQuota: false, expiredTime: -1, remainQuota: 1,
    group: "随便改的名字", models: ["glm-5.2", "qwen3.7-plus"],
  };

  assert.equal(isDomesticRelayToken(renamed), true);
  assert.equal(isSupportedRelayToken(renamed), true);
  assert.deepEqual(domesticRelayTokens([renamed]).map((token) => token.id), ["9"]);
  assert.deepEqual(groupRelayModels([renamed]), [
    { group: "gpt-pro-额度计费", models: [] },
    { group: "gpt-额度计费", models: [] },
    { group: "临时低价分组", models: [] },
    { group: "国产模型 0.5X", models: ["glm-5.2", "qwen3.7-plus"] },
  ]);
});

test("keeps domestic models out of the gpt groups and skips unrelated groups", () => {
  const mixed = {
    id: "10", active: true, unlimitedQuota: false, expiredTime: -1, remainQuota: 1,
    group: "gpt-额度计费", models: ["gpt-5.6-sol", "deepseek-v4-pro"],
  };

  assert.deepEqual(groupRelayModels([mixed]), [
    { group: "gpt-pro-额度计费", models: [] },
    { group: "gpt-额度计费", models: ["gpt-5.6-sol"] },
    { group: "临时低价分组", models: [] },
    { group: "国产模型 0.5X", models: ["deepseek-v4-pro"] },
  ]);
  assert.equal(isDomesticRelayModel("deepseek-v4-flash"), true);
  assert.equal(isDomesticRelayModel("gpt-5.6-sol"), false);
});

test("domestic token without an explicit model list unlocks the whole whitelist", () => {
  // 中转站后台没填模型清单表示「不限本分组模型」，四个模型都要显示。
  const unrestricted = {
    id: "11", active: true, unlimitedQuota: true, expiredTime: -1, remainQuota: 0,
    group: "国产模型-额度计费", models: [] as string[],
  };

  assert.deepEqual(domesticRelayModelsForToken(unrestricted).sort(), [...domesticRelayModels].sort());
  assert.deepEqual(groupRelayModels([unrestricted]), [
    { group: "gpt-pro-额度计费", models: [] },
    { group: "gpt-额度计费", models: [] },
    { group: "临时低价分组", models: [] },
    { group: "国产模型 0.5X", models: ["deepseek-v4-flash", "deepseek-v4-pro", "glm-5.2", "qwen3.7-plus"] },
  ]);
});

test("domestic token with an explicit model list only shows the listed models", () => {
  const restricted = {
    id: "12", active: true, unlimitedQuota: false, expiredTime: -1, remainQuota: 1,
    group: "国产模型-额度计费", models: ["glm-5.2"],
  };

  assert.deepEqual(domesticRelayModelsForToken(restricted), ["glm-5.2"]);
  // 分组名已确认是国产分组时信任列表原样，中转站上新模型不必等客户端发版。
  assert.deepEqual(
    domesticRelayModelsForToken({ ...restricted, models: ["glm-5.2", "kimi-k3"] }),
    ["glm-5.2", "kimi-k3"],
  );
  // 仅靠模型 id 命中白名单归类的令牌继续过滤，避免 GPT 模型混进国产分组。
  assert.deepEqual(
    domesticRelayModelsForToken({ ...restricted, group: "gpt-额度计费", models: ["gpt-5.6-sol", "deepseek-v4-pro"] }),
    ["deepseek-v4-pro"],
  );
});

test("mixed domestic tokens merge the unrestricted whitelist with explicitly listed models", () => {
  // 本机中转站真实数据形态：同一分组下「国产」令牌 models 为空、「智普GLM-5.2」只列一个模型。
  const groups = groupRelayModels([
    {
      id: "13", active: true, unlimitedQuota: true, expiredTime: -1, remainQuota: 0,
      group: "国产模型-额度计费", models: [],
    },
    {
      id: "14", active: true, unlimitedQuota: false, expiredTime: -1, remainQuota: 100,
      group: "国产模型-额度计费", models: ["glm-5.2"],
    },
  ]);

  assert.deepEqual(groups[3], {
    group: "国产模型 0.5X",
    models: ["deepseek-v4-flash", "deepseek-v4-pro", "glm-5.2", "qwen3.7-plus"],
  });
});

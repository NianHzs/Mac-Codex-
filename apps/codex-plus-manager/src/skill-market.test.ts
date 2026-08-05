import assert from "node:assert";
import { describe, it } from "node:test";
import { skillActionLabel, skillUsageGuideRows } from "./skill-market.ts";

describe("Skill market actions", () => {
  it("shows 更新 when a newer Skill is available", () => {
    assert.strictEqual(skillActionLabel({ installed: true, updateAvailable: true }), "更新");
  });

  it("shows 已安装 only when the installed version is current", () => {
    assert.strictEqual(skillActionLabel({ installed: true, updateAvailable: false }), "已安装");
  });

  it("shows 安装 for an uninstalled Skill", () => {
    assert.strictEqual(skillActionLabel({ installed: false, updateAvailable: false }), "安装");
  });
});

describe("Skill usage guide", () => {
  it("renders the four remotely managed usage sections in a stable order", () => {
    assert.deepStrictEqual(skillUsageGuideRows({
      scenarios: "宣传文案",
      trigger: "说出请使用智能文案助手",
      output: "标题和正文",
      notice: "发布前确认",
    }), [
      ["适用场景", "宣传文案"],
      ["如何使用", "说出请使用智能文案助手"],
      ["输出内容", "标题和正文"],
      ["使用提醒", "发布前确认"],
    ]);
  });
});

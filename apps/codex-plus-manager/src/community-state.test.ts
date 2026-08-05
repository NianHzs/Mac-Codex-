import assert from "node:assert";
import { it } from "node:test";
import { getCommunityDeleteConfirmation } from "./community-state.ts";

it("requires an explicit confirmation before removing a community comment", () => {
  assert.deepStrictEqual(getCommunityDeleteConfirmation(), {
    title: "删除超话",
    message: "确定删除这条超话吗？删除后无法恢复。",
  });
});

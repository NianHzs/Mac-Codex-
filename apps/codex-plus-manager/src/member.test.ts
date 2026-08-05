import assert from "node:assert";
import fs from "node:fs";
import { describe, it } from "node:test";
import { getMemberIdentityDisplay, getMemberRolePresentation, normalizeMemberActivity, normalizeMemberProfile } from "./member.ts";

describe("member identity", () => {
  it("accepts the lottery system's supreme tier without any Pro entitlement", () => {
    assert.deepStrictEqual(
      normalizeMemberProfile({ userId: "609", username: "Member", tier: "supreme" }),
      { userId: "609", username: "Member", tier: "supreme", activeRole: "supreme", actualAdmin: false },
    );
  });

  it("rejects an unrelated visual-theme Pro tier", () => {
    assert.strictEqual(
      normalizeMemberProfile({ userId: "609", username: "Member", tier: "pro" }),
      null,
    );
  });

  it("accepts the server /api/client/me profile shape", () => {
    assert.deepStrictEqual(
      normalizeMemberProfile({
        user: { id: "604", username: "saleAdmin" },
        entitlements: { tier: "supreme" },
        identity: { activeRole: "administrator", actualAdmin: true },
      }),
      { userId: "604", username: "saleAdmin", tier: "supreme", activeRole: "administrator", actualAdmin: true },
    );
  });

  it("accepts the Tauri command profile payload with administrator identity", () => {
    assert.deepStrictEqual(
      normalizeMemberProfile({
        userId: "604",
        username: "saleAdmin",
        tier: "supreme",
        activeRole: "administrator",
        actualAdmin: true,
      }),
      { userId: "604", username: "saleAdmin", tier: "supreme", activeRole: "administrator", actualAdmin: true },
    );
  });
});

it("keeps member credentials out of persistent browser storage", () => {
  const appSource = fs.readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(appSource, /localStorage\.setItem\(MEMBER_ACCESS_TOKEN_KEY/);
  assert.doesNotMatch(appSource, /localStorage\.setItem\(MEMBER_REMEMBERED_CREDENTIALS_KEY/);
  assert.ok(
    (appSource.match(/localStorage\.getItem\(MEMBER_ACCESS_TOKEN_KEY/g) ?? []).length <= 1,
    "access token may only be read once for legacy migration",
  );
  assert.ok(
    (appSource.match(/localStorage\.getItem\(MEMBER_REMEMBERED_CREDENTIALS_KEY/g) ?? []).length <= 1,
    "remembered credentials may only be read once for legacy migration",
  );
});

it("uses the persisted founder presentation instead of a local preview", () => {
  assert.deepStrictEqual(getMemberRolePresentation("founder"), { label: "创始人", tone: "founder" });
});

it("uses active display role for every member-facing label and crown tone", () => {
  assert.deepStrictEqual(
    getMemberIdentityDisplay({ userId: "604", username: "saleAdmin", tier: "supreme", activeRole: "director", actualAdmin: true }),
    { label: "总监", tone: "director" },
  );
});

describe("member activity", () => {
  it("accepts the lottery campaign returned for an authenticated member", () => {
    assert.deepStrictEqual(
      normalizeMemberActivity({
        campaign: { id: "summer", title: "夏日福利活动", endsAt: 1780000000000 },
        remainingChances: 3,
        portalPath: "/vip",
      }),
      {
        campaign: { id: "summer", title: "夏日福利活动", endsAt: 1780000000000 },
        remainingChances: 3,
        portalPath: "/vip",
      },
    );
  });

  it("accepts active campaigns when the server returns ISO timestamps", () => {
    assert.deepStrictEqual(
      normalizeMemberActivity({
        campaign: { id: "vip", title: "新一期至尊VIP抽奖", endsAt: "2026-07-21T12:00:00.000Z" },
        remainingChances: 5,
        portalPath: "/vip",
      }),
      {
        campaign: { id: "vip", title: "新一期至尊VIP抽奖", endsAt: Date.parse("2026-07-21T12:00:00.000Z") },
        remainingChances: 5,
        portalPath: "/vip",
      },
    );
  });
});

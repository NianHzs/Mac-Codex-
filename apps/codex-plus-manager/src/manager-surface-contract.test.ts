import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { managerReadingVariables, protectedManagerSurfaceSelectors } from "./manager-surface-contract.ts";

test("reading layers stay independent from wallpaper and identity colours", () => {
  assert.deepEqual(protectedManagerSurfaceSelectors, [
    ".workspace",
    ".topbar",
    ".panel",
    ".card",
    ".private-chat-dialog",
    ".notification-popover",
  ]);

  for (const token of ["--reading-surface", "--reading-surface-strong", "--reading-text", "--chrome-surface", "--chrome-text"]) {
    assert.match(managerReadingVariables, new RegExp(`${token}:`));
  }

  assert.doesNotMatch(managerReadingVariables, /--member-(?:founder|director|administrator|supreme|vip)-tone/);
});

test("manager shell uses semantic reading layers instead of a fixed dark overlay", () => {
  const css = readFileSync(resolve(import.meta.dirname, "styles.css"), "utf8");
  const polish = css.slice(css.indexOf("/* Codework sky-light visual system */"));

  assert.match(polish, /\.shell\[data-client-skin\]/);
  assert.match(polish, /background:\s*var\(--reading-surface\)/);
  assert.match(polish, /\.topbar[\s\S]*?var\(--chrome-surface\)/);
  assert.match(polish, /\.brand-mark\.administrator[\s\S]*?#75c7ff/);
  assert.doesNotMatch(polish, /#102a42|#091a2a/);
});

test("chat and overlay controls receive opaque reading surfaces", () => {
  const css = readFileSync(resolve(import.meta.dirname, "styles.css"), "utf8");
  const polish = css.slice(css.indexOf("/* Codework sky-light visual system */"));

  for (const selector of [".private-chat-float", ".private-chat-dialog", ".private-chat-messages", ".notification-popover", ".private-chat-status-menu"]) {
    const escaped = selector.replace(".", "\\.");
    assert.match(polish, new RegExp(`${escaped}[\\s\\S]{0,360}var\\(--reading-surface`));
  }

  assert.match(polish, /\.private-chat-message-row\.self[\s\S]{0,360}--brand-accent/);
});

test("notification controls stay readable inside the skinned top bar", () => {
  const css = readFileSync(resolve(import.meta.dirname, "styles.css"), "utf8");
  const polish = css.slice(css.indexOf("/* Codework sky-light visual system */"));

  assert.match(polish, /\.notification-center\s*>\s*button[\s\S]{0,360}var\(--reading-surface-strong\)/);
  assert.match(polish, /\.notification-center\s*>\s*button\[aria-expanded="true"\][\s\S]{0,360}--brand-accent/);
  assert.match(polish, /\.notification-popover\s*>\s*div\s*>\s*span[\s\S]{0,360}var\(--reading-text\)/);
});

test("notification popover renders above animated screen content", () => {
  const css = readFileSync(resolve(import.meta.dirname, "styles.css"), "utf8");

  assert.match(css, /\.topbar\s*\{[\s\S]{0,420}position:\s*relative;[\s\S]{0,420}z-index:\s*40;/);
  assert.match(css, /\.screen\s*\{[\s\S]{0,420}z-index:\s*0;/);
  assert.match(css, /\.notification-popover\s*\{[\s\S]{0,420}z-index:\s*60;/);
});

test("activity handoff has one premium browser entry instead of duplicate buttons", () => {
  const app = readFileSync(resolve(import.meta.dirname, "App.tsx"), "utf8");
  const css = readFileSync(resolve(import.meta.dirname, "styles.css"), "utf8");

  assert.doesNotMatch(app, /variant="secondary"><ExternalLink[^>]*\/>进入活动官网<\//);
  assert.match(app, /activity-open-trust/);
  assert.match(app, /活动入口已为你准备好/);
  assert.match(css, /\.activity-open-card[\s\S]{0,460}linear-gradient/);
  assert.match(css, /\.activity-open-trust[\s\S]{0,360}border-radius:\s*999px/);
  assert.match(css, /\.activity-open-button[\s\S]{0,420}box-shadow/);
});

test("member verification starts with the same sky reading hierarchy", () => {
  const css = readFileSync(resolve(import.meta.dirname, "styles.css"), "utf8");
  const polish = css.slice(css.indexOf("/* Codework sky-light visual system */"));

  assert.match(polish, /\.member-login-backdrop[\s\S]{0,420}#eaf6ff/);
  assert.match(polish, /\.member-login-card[\s\S]{0,420}--reading-text/);
  assert.match(polish, /\.member-login-showcase[\s\S]{0,420}#12314b/);
});

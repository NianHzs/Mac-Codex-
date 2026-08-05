import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { isForbiddenThemeTarget, themeScopeSelector } from "./scoped-theme-contract.ts";

test("theme scope never targets document chrome or navigation", () => {
  assert.equal(isForbiddenThemeTarget("html"), true);
  assert.equal(isForbiddenThemeTarget("body"), true);
  assert.equal(isForbiddenThemeTarget("#root"), true);
  assert.equal(isForbiddenThemeTarget("aside"), true);
  assert.equal(isForbiddenThemeTarget("main"), false);
  assert.equal(themeScopeSelector("main"), "main[data-codework-theme-scope]");
});

test("character theme stylesheet does not paint document chrome or navigation", () => {
  const renderer = readFileSync(resolve(import.meta.dirname, "../../../assets/inject/renderer-inject.js"), "utf8");
  const characterTheme = renderer.slice(renderer.indexOf("function codeworkCharacterThemeCss"), renderer.indexOf("function setCodeworkCharacterThemeStyle"));
  assert.doesNotMatch(characterTheme, /html\[data-codework-character-theme\]/);
  assert.doesNotMatch(characterTheme, /body\[data-codework-character-theme\] aside/);
  assert.match(characterTheme, /\[data-codework-theme-scope\]/);
});

test("Dream Skin delegates rendering to the vendored Fei-Away runtime instead of maintaining a second CSS implementation", () => {
  const renderer = readFileSync(resolve(import.meta.dirname, "../../../assets/inject/renderer-inject.js"), "utf8");
  const assets = readFileSync(resolve(import.meta.dirname, "../../../crates/codex-plus-core/src/assets.rs"), "utf8");
  const runtime = readFileSync(resolve(import.meta.dirname, "../../../assets/vendor/fei-away-codex-dream-skin/renderer-inject.js"), "utf8");
  const runtimeDistribution = readFileSync(resolve(import.meta.dirname, "../../../assets/vendor/fei-away-codex-dream-skin/windows-runtime/assets/renderer-inject.js"), "utf8");
  const css = readFileSync(resolve(import.meta.dirname, "../../../assets/vendor/fei-away-codex-dream-skin/dream-skin.css"), "utf8");
  const cssDistribution = readFileSync(resolve(import.meta.dirname, "../../../assets/vendor/fei-away-codex-dream-skin/windows-runtime/assets/dream-skin.css"), "utf8");
  assert.match(renderer, /__CODEX_PLUS_DREAM_SKIN_RUN__/);
  assert.match(renderer, /__CODEX_PLUS_DREAM_SKIN_CSS__/);
  assert.doesNotMatch(renderer, /new Function\("cssText", "artDataUrl", "rawConfig"/);
  assert.match(renderer, /function codeworkDreamSkinPaletteCss/);
  assert.match(renderer, /codework-dream-skin-palette-style/);
  assert.match(renderer, /appearance: "light"/);
  assert.match(renderer, /dream-task \[class\*="text-token-"\]/);
  assert.match(renderer, /codework-dream-layout-card/);
  assert.match(renderer, /--text-primary/);
  assert.match(renderer, /--color-token-foreground/);
  assert.match(renderer, /--color-token-text-primary/);
  assert.match(renderer, /--color-text-foreground/);
  assert.match(renderer, /--vscode-foreground/);
  assert.match(renderer, /--color-token-dropdown-background/);
  assert.match(renderer, /--color-token-dropdown-foreground/);
  assert.match(renderer, /--color-token-border-default/);
  assert.match(renderer, /background-image:none!important/);
  assert.match(renderer, /theme\.art\?\.layout/);
  assert.match(renderer, /codeworkCuratedDreamSkinIds/);
  assert.match(renderer, /codeworkCuratedDreamSkinIds\.has\(theme\.id\)/);
  assert.match(renderer, /layout: cardLayout \? "card" : theme\.art\?\.layout/);
  assert.equal(
    createHash("sha256").update(runtime).digest("hex"),
    "a9df220104ffce40c92927def17ef11d56c887c14f19a13c4ead326336ea0e5a",
  );
  assert.equal(runtimeDistribution, runtime, "The packaged Windows runtime must use the same renderer as the embedded client asset.");
  assert.equal(cssDistribution, css, "The packaged Windows runtime must use the same CSS as the embedded client asset.");
  assert.match(runtime, /find\(isElementVisible\)/, "A hidden home icon must not make task routes look like home.");
  assert.match(runtime, /customWallpaper \|\| !narrowArt \? "cover" : "contain"/, "Custom wallpaper must preserve cover after reload.");
  assert.match(css, /transform: translateX\(20px\)/, "Desktop task content keeps the requested 20px right offset.");
  assert.match(css, /--dream-content-foreground: rgb\(255 255 255 \/ \.96\)/, "Conversation prose remains white over artwork.");
  assert.match(css, /--dream-status-surface: linear-gradient\(90deg, rgb\(14 17 24 \/ \.64\)/, "Tool and thinking states receive a local dark reading surface.");
  assert.match(renderer, /const taskCandidates = \[\.\.\.document\.querySelectorAll\('\[role="main"\]'\)\]/);
  assert.match(renderer, /shellMain\?\.classList\.toggle\("dream-task", !home && taskCandidates\.length === 0\)/);
  assert.match(renderer, /dream-task \[class\*="text-"\]/);
  assert.doesNotMatch(renderer, /aside:not\(\.app-shell-left-panel\)/,
    "The native browser and right-side drawers must retain their own visibility and interaction styles.");
  assert.doesNotMatch(renderer, /function codeworkDreamSkinCss/);
  assert.match(assets, /FEI_AWAY_DREAM_SKIN_CSS/);
  assert.match(assets, /FEI_AWAY_DREAM_SKIN_RUNTIME/);
});

test("Codework installs its palette adapter around the pinned Dream Skin runtime", () => {
  const renderer = readFileSync(resolve(import.meta.dirname, "../../../assets/inject/renderer-inject.js"), "utf8");
  assert.match(renderer, /style\.id = "codework-dream-skin-palette-style"/);
  assert.match(renderer, /style\.textContent = codeworkDreamSkinPaletteCss\(theme\)/);
  assert.match(renderer, /setCodeworkDreamSkinPaletteStyle\(theme\)/);
});

test("Dream Skin preserves native task header control layout and visibility", () => {
  const renderer = readFileSync(resolve(import.meta.dirname, "../../../assets/inject/renderer-inject.js"), "utf8");
  const palette = renderer.slice(
    renderer.indexOf("function codeworkDreamSkinPaletteCss"),
    renderer.indexOf("function setCodeworkDreamSkinPaletteStyle"),
  );
  assert.match(palette, /main\.main-surface[\s\S]{0,240}aria-haspopup="menu"/);
  assert.doesNotMatch(palette, /visibility:\s*visible\s*!important/);
  assert.doesNotMatch(palette, /opacity:\s*1\s*!important/);
  assert.doesNotMatch(palette, /pointer-events:\s*auto\s*!important/);
  assert.doesNotMatch(palette, /z-index:\s*[1-9]\d*\s*!important/);
});

test("Dream Skin owns the title-bar identity surface without a duplicate legacy menu", () => {
  const renderer = readFileSync(resolve(import.meta.dirname, "../../../assets/inject/renderer-inject.js"), "utf8");
  const installMenu = renderer.slice(renderer.indexOf("function installCodexPlusMenu"), renderer.indexOf("function patchPluginMarketplaceRequestParams"));
  assert.match(installMenu, /window\.__CODEX_DREAM_SKIN_STATE__\?\.installed\s*===\s*true/);
  assert.match(installMenu, /existing\?\.remove\(\)/);
});

test("Dream Skin keeps curated task headers readable without blocking custom wallpaper", () => {
  const css = readFileSync(resolve(import.meta.dirname, "../../../assets/vendor/fei-away-codex-dream-skin/dream-skin.css"), "utf8");
  const taskHeaderStart = css.indexOf("html.codex-dream-skin.dream-art-wide main.main-surface > header.app-header-tint {");
  const taskHeaderRule = taskHeaderStart >= 0
    ? css.slice(taskHeaderStart, css.indexOf("}", taskHeaderStart) + 1)
    : "";
  const customHeaderStart = css.indexOf("html.codex-dream-skin.dream-art-custom-cover main.main-surface > header.app-header-tint {");
  const customHeaderRule = customHeaderStart >= 0
    ? css.slice(customHeaderStart, css.indexOf("}", customHeaderStart) + 1)
    : "";
  assert.match(css, /--dream-task-header-surface:/);
  assert.match(css, /--dream-task-composer-surface:/);
  assert.match(
    css,
    /dream-art-wide main\.main-surface > header\.app-header-tint[\s\S]*?background:\s*var\(--dream-task-header-surface\)\s*!important/,
    "Curated wide artwork retains its readable task-header surface.",
  );
  assert.doesNotMatch(taskHeaderRule, /background:\s*transparent\s*!important/);
  assert.match(customHeaderRule, /background:\s*transparent\s*!important/,
    "A custom wallpaper must not receive an opaque header strip that hides the art.");
  assert.match(
    css,
    /dream-art-wide \.composer-surface-chrome\s*\{[\s\S]*?background:\s*var\(--dream-task-composer-surface\)\s*!important/,
    "The composer must have a distinct readable surface rather than a washed-out white overlay.",
  );
});

test("custom wide wallpaper keeps the navigation rail readable instead of exposing the artwork beneath every row", () => {
  const css = readFileSync(resolve(import.meta.dirname, "../../../assets/vendor/fei-away-codex-dream-skin/dream-skin.css"), "utf8");
  const sidebarStart = css.indexOf("html.codex-dream-skin.dream-art-custom-cover.dream-art-wide aside.app-shell-left-panel {");
  const sidebarRule = sidebarStart >= 0 ? css.slice(sidebarStart, css.indexOf("}", sidebarStart) + 1) : "";

  assert.match(sidebarRule, /color-mix\(in srgb, #111827 72%, transparent\)/);
  assert.match(sidebarRule, /backdrop-filter:\s*blur\(18px\) saturate\(\.94\)/);
});

test("light custom wallpaper uses a dark foreground for unframed workspace text while preserving dark-panel treatment", () => {
  const css = readFileSync(resolve(import.meta.dirname, "../../../assets/vendor/fei-away-codex-dream-skin/dream-skin.css"), "utf8");

  assert.match(css, /dream-wallpaper-light[\s\S]*?--dream-light-wallpaper-foreground:\s*rgb\(48 37 43\)/);
  assert.match(css, /dream-wallpaper-light[\s\S]*?\[class\*="application-menu-top-bar"\][\s\S]*?color:\s*var\(--dream-light-wallpaper-foreground\) !important/);
  assert.match(css, /dream-wallpaper-light[\s\S]*?main\.main-surface[\s\S]*?\[class\*="text-token-conversation-summary"\][\s\S]*?color:\s*var\(--dream-light-wallpaper-foreground\) !important/);
});

test("custom Dream Skin reads the local wallpaper through the native bridge and reports the runtime result", () => {
  const renderer = readFileSync(resolve(import.meta.dirname, "../../../assets/inject/renderer-inject.js"), "utf8");
  const apply = renderer.slice(renderer.indexOf("function applyCodeworkVisualTheme"), renderer.indexOf("function setCodexPlusSetting"));
  assert.match(apply, /themeId === "custom-dream-skin"/);
  assert.match(renderer, /function loadCodexPlusLocalImageAsset\(/);
  assert.match(renderer, /__codexSessionDeleteBridge\("\/overlay\/image-data", \{\}\)/);
  assert.match(renderer, /atob\(/);
  assert.match(renderer, /new Blob\(/);
  assert.match(renderer, /URL\.createObjectURL\(blob\)/);
  assert.doesNotMatch(renderer, /fetch\(config\.imageUrl/);
  assert.match(renderer, /dream_skin_applied/);
  assert.match(renderer, /dream_skin_apply_failed/);
  assert.doesNotMatch(apply, /overlay\.dataUrl/);
});

test("custom Dream Skin lets the renderer derive the wallpaper accent instead of pinning pink", () => {
  const renderer = readFileSync(resolve(import.meta.dirname, "../../../assets/inject/renderer-inject.js"), "utf8");
  const customSkinStart = renderer.indexOf('id: "custom-dream-skin"');
  const customSkinEnd = renderer.indexOf('}, localImageUrl);', customSkinStart);
  const customSkin = renderer.slice(customSkinStart, customSkinEnd);

  assert.doesNotMatch(customSkin, /#c74477/i);
  assert.match(
    renderer,
    /palette:\s*theme\.id === "custom-dream-skin"\s*\?\s*\{\}\s*:\s*\{ accent: theme\.tokens\.accent \}/,
    "The local wallpaper must be analysed by the Dream Skin runtime rather than receiving a fixed palette override.",
  );
});

test("custom Dream Skin fills the workspace while curated narrow artwork preserves its composition", () => {
  const renderer = readFileSync(resolve(import.meta.dirname, "../../../assets/inject/renderer-inject.js"), "utf8");
  const runtime = readFileSync(resolve(import.meta.dirname, "../../../assets/vendor/fei-away-codex-dream-skin/renderer-inject.js"), "utf8");
  const css = readFileSync(resolve(import.meta.dirname, "../../../assets/vendor/fei-away-codex-dream-skin/dream-skin.css"), "utf8");

  assert.match(renderer, /customWallpaper:\s*theme\.id === "custom-dream-skin"/);
  assert.match(runtime, /dream-art-custom-cover/);
  assert.match(runtime, /customWallpaper \|\| !narrowArt \? "cover" : "contain"/);
  assert.match(css, /html\.codex-dream-skin\.dream-art-narrow\s*\{[\s\S]*?--dream-art-fit:\s*contain/);
});

test("custom Dream Skin uses stable route classes to cover the whole workspace", () => {
  const renderer = readFileSync(resolve(import.meta.dirname, "../../../assets/inject/renderer-inject.js"), "utf8");
  const runtime = readFileSync(resolve(import.meta.dirname, "../../../assets/vendor/fei-away-codex-dream-skin/renderer-inject.js"), "utf8");
  const css = readFileSync(resolve(import.meta.dirname, "../../../assets/vendor/fei-away-codex-dream-skin/dream-skin.css"), "utf8");
  const palette = renderer.slice(
    renderer.indexOf("function codeworkDreamSkinPaletteCss"),
    renderer.indexOf("function setCodeworkDreamSkinPaletteStyle"),
  );

  assert.match(runtime, /root\.classList\.toggle\("dream-route-home", Boolean\(home\)\)/);
  assert.match(runtime, /root\.classList\.toggle\("dream-route-task", !home\)/);
  assert.match(css, /dream-art-custom-cover\.dream-route-home\s+body[\s\S]*?background-size:\s*cover/);
  assert.match(css, /dream-art-custom-cover\.dream-route-home\s+main\.main-surface[\s\S]*?background:\s*transparent\s*!important/);
  assert.match(
    css,
    /dream-art-custom-cover\.dream-route-task\s+main\.main-surface[\s\S]*?background:\s*transparent\s*!important/,
    "Task routes keep the artwork on the body layer only, so a moving wallpaper cannot ghost against a second surface image.",
  );
  assert.match(palette, /const welcomeOverlay = isCustom/);
  assert.match(palette, /color-mix\(in srgb,\$\{surface\} 20%,transparent\)/);
});

test("Dream Skin text mode controls conversation prose instead of a frozen palette colour", () => {
  const renderer = readFileSync(resolve(import.meta.dirname, "../../../assets/inject/renderer-inject.js"), "utf8");
  const palette = renderer.slice(
    renderer.indexOf("function codeworkDreamSkinPaletteCss"),
    renderer.indexOf("function setCodeworkDreamSkinPaletteStyle"),
  );

  assert.match(palette, /\.dream-task \[data-message-author-role\] \*,[\s\S]*?color:var\(--dream-text\) !important/);
  assert.match(palette, /\.dream-task \.markdown \*,[\s\S]*?color:var\(--dream-text\) !important/);
  assert.match(palette, /\.dream-task :is\(\.prose,\.markdown,\[data-message-author-role\]\)[\s\S]*?color:var\(--dream-text\) !important/);
});

test("Dream Skin restores native text treatment and has no global text-mode control", () => {
  const runtime = readFileSync(resolve(import.meta.dirname, "../../../assets/vendor/fei-away-codex-dream-skin/renderer-inject.js"), "utf8");
  const renderer = readFileSync(resolve(import.meta.dirname, "../../../assets/inject/renderer-inject.js"), "utf8");
  const palette = renderer.slice(
    renderer.indexOf("function codeworkDreamSkinPaletteCss"),
    renderer.indexOf("function setCodeworkDreamSkinPaletteStyle"),
  );
  assert.doesNotMatch(runtime, /TEXT_MODE_TEXT_PROPERTIES/);
  assert.doesNotMatch(runtime, /TEXT_MODE_MUTED_PROPERTIES/);
  assert.doesNotMatch(runtime, /data-dream-text-mode/);
  assert.doesNotMatch(runtime, /applyTextMode/);
  assert.doesNotMatch(palette, /aside\.app-shell-left-panel :is\(span,p,a,\[role="treeitem"\],\[class\*="text-"\]\) \{ color:var\(--dream-text\) !important; \}/);
});

test("Dream Skin keeps the collapsed-sidebar recovery control readable", () => {
  const css = readFileSync(resolve(import.meta.dirname, "../../../assets/vendor/fei-away-codex-dream-skin/dream-skin.css"), "utf8");

  assert.match(
    css,
    /aside\.app-shell-left-panel button :is\(span,\s*\[class\*="text-token"\],\s*\[class\*="text-"\]\)\s*\{[\s\S]*?color:\s*var\(--dream-text\) !important/,
    "The native \u201cShow more\u201d/expand control must inherit the sidebar contrast colour instead of its pale token colour.",
  );
});

test("Dream Skin keeps the home surface through Codex's delayed welcome rerender", () => {
  const runtime = readFileSync(resolve(import.meta.dirname, "../../../assets/vendor/fei-away-codex-dream-skin/renderer-inject.js"), "utf8");
  const css = readFileSync(resolve(import.meta.dirname, "../../../assets/vendor/fei-away-codex-dream-skin/dream-skin.css"), "utf8");

  assert.match(runtime, /function findHomeSurface\(\)/);
  assert.match(runtime, /const home = findHomeSurface\(\);/);
  assert.match(runtime, /homeIcon\?\.parentElement\?\.parentElement/);
  assert.doesNotMatch(
    css,
    /\.dream-home > div:first-child > div:first-child > div:first-child > div:nth-child\(2\)\s*\{[\s\S]*?top:\s*100%\s*!important/,
    "A delayed Codex home rerender can change this child; it must not be absolutely pushed beneath the viewport.",
  );
});

test("Dream Skin task header uses a dark accent-aware reading surface over vivid custom wallpaper", () => {
  const css = readFileSync(resolve(import.meta.dirname, "../../../assets/vendor/fei-away-codex-dream-skin/dream-skin.css"), "utf8");

  assert.match(css, /--dream-task-header-surface:\s*color-mix\(in oklab, oklch\(0\.24 0\.035 25\)/);
  assert.match(css, /--dream-task-header-text:\s*#fff8f4/);
  assert.match(css, /main\.main-surface > header\.app-header-tint\s*\{[\s\S]*?color:\s*var\(--dream-task-header-text\) !important/);
});

test("Dream Skin manifest validation accepts the explicit card layout", () => {
  const renderer = readFileSync(resolve(import.meta.dirname, "../../../assets/inject/renderer-inject.js"), "utf8");
  const validator = renderer.slice(renderer.indexOf("function isSafeCodeworkDreamSkinArt"), renderer.indexOf("function codeworkVisualThemeCssFromTokens"));
  assert.match(validator, /"layout"/);
  assert.match(validator, /\["auto", "card", "immersive"\]/);
});

test("Dream Skin paints the project welcome card when Codex omits a role-main wrapper", () => {
  const renderer = readFileSync(resolve(import.meta.dirname, "../../../assets/inject/renderer-inject.js"), "utf8");
  const palette = renderer.slice(
    renderer.indexOf("function codeworkDreamSkinPaletteCss"),
    renderer.indexOf("function setCodeworkDreamSkinPaletteStyle"),
  );

  assert.match(renderer, /function findCodeworkDreamSkinWelcomeSurface/);
  assert.match(renderer, /data-codework-dream-welcome/);
  assert.match(palette, /\[data-codework-dream-welcome="true"\]/);
});

test("Dream Skin palette never recolours Codework chrome or role identity", () => {
  const renderer = readFileSync(resolve(import.meta.dirname, "../../../assets/inject/renderer-inject.js"), "utf8");
  const palette = renderer.slice(
    renderer.indexOf("function codeworkDreamSkinPaletteCss"),
    renderer.indexOf("function setCodeworkDreamSkinPaletteStyle"),
  );

  assert.doesNotMatch(palette, /\.member-badge|\.brand-mark|\.member-crown-wrap|\.private-chat/);
  assert.match(palette, /main\.main-surface/);
  assert.match(palette, /--dream-surface-raised:/);
});

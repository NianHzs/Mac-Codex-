import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const windowsRoot = path.resolve(here, "..");
const distributionRoot = path.resolve(windowsRoot, "..");
const template = await fs.readFile(path.join(windowsRoot, "assets", "renderer-inject.js"), "utf8");
const css = await fs.readFile(path.join(windowsRoot, "assets", "dream-skin.css"), "utf8");
const buildPayload = (config = {}, artDataUrl = "data:image/png;base64,AA==") => template
  .replace("__DREAM_CSS_JSON__", JSON.stringify(".fixture { color: blue; }"))
  .replace("__DREAM_ART_JSON__", JSON.stringify(artDataUrl))
  .replace("__DREAM_THEME_JSON__", JSON.stringify(config));
const payload = buildPayload();

assert.equal(
  await fs.readFile(path.join(distributionRoot, "renderer-inject.js"), "utf8"),
  template,
  "The shipped runtime renderer must match the distribution renderer.",
);

assert.doesNotMatch(
  css,
  /main\.main-surface\s*>\s*header\.app-header-tint\s*\{[^}]*\b(?:position|z-index)\s*:/,
  "The skin must preserve Codex's native fixed header so the side-panel toggle remains reachable.",
);

assert.match(
  css,
  /html\.codex-dream-skin\.dream-art-wide\s+main\.main-surface\.dream-home-shell\s*\{[\s\S]*?background:\s*transparent\s*!important/,
  "The home canvas must show the wallpaper at its original strength instead of washing it out with a full-window white veil.",
);

assert.doesNotMatch(
  css,
  /html\.codex-dream-skin\.dream-theme-light\s+\[class\*="text-token"\][\s\S]*?color:\s*#111827\s*!important/,
  "Wallpaper readability must be fixed by the surface layer, not by forcing every Codex token to black.",
);

assert.doesNotMatch(
  css,
  /html\.codex-dream-skin\s+main\.main-surface\s*\{[^}]*overflow:\s*hidden\s*!important/,
  "The native task rail can extend outside the main surface, so Dream Skin must not clip it with a global overflow:hidden rule.",
);

assert.match(
  css,
  /#codex-dream-skin-chrome\s*\{[\s\S]*?position:\s*fixed[\s\S]*?top:\s*var\(--codework-dream-chrome-top,\s*6px\)[\s\S]*?left:\s*var\(--codework-dream-chrome-left,\s*50%\)[\s\S]*?transform:\s*translateX\(-50%\)[\s\S]*?z-index:\s*2147483000/,
  "The Codework identity badge must use measured native title-bar coordinates instead of a fixed top offset.",
);

assert.match(
  css,
  /html\.codex-dream-skin\.dream-art-narrow[\s\S]*?--dream-art-fit:\s*contain[\s\S]*?--dream-art-backdrop-fit:\s*cover/,
  "Portrait and 3:2 wallpapers must preserve their full composition while a backdrop fills the wide workspace.",
);

const narrowArtworkStart = css.indexOf("html.codex-dream-skin.dream-art-narrow");
const narrowArtworkCss = css.slice(narrowArtworkStart, css.indexOf("html.codex-dream-skin.dream-art-wide", narrowArtworkStart));
const narrowHomeSurfaceStart = narrowArtworkCss.indexOf("html.codex-dream-skin.dream-art-narrow main.main-surface.dream-home-shell {");
const narrowHomeSurfaceRule = narrowHomeSurfaceStart >= 0
  ? narrowArtworkCss.slice(narrowHomeSurfaceStart, narrowArtworkCss.indexOf("}", narrowHomeSurfaceStart) + 1)
  : "";
const narrowTaskSurfaceStart = narrowArtworkCss.indexOf("html.codex-dream-skin.dream-art-narrow:is(.dream-task-ambient, .dream-task-banner) main.main-surface:not(.dream-home-shell) {");
const narrowTaskSurfaceRule = narrowTaskSurfaceStart >= 0
  ? narrowArtworkCss.slice(narrowTaskSurfaceStart, narrowArtworkCss.indexOf("}", narrowTaskSurfaceStart) + 1)
  : "";
assert.match(
  narrowHomeSurfaceRule,
  /var\(--dream-home-veil\)/,
  "The home transparency slider must control the narrow-wallpaper reading layer.",
);
assert.match(
  narrowTaskSurfaceRule,
  /var\(--dream-task-veil\)/,
  "The conversation transparency slider must control the narrow-wallpaper reading layer.",
);
assert.match(
  narrowHomeSurfaceRule,
  /backdrop-filter:\s*blur\(var\(--dream-home-blur\)\)/,
  "The home slider must control the home wallpaper blur intensity.",
);
assert.match(
  narrowTaskSurfaceRule,
  /backdrop-filter:\s*blur\(var\(--dream-task-blur\)\)/,
  "The conversation slider must control the conversation wallpaper blur intensity.",
);
assert.match(
  css,
  /--dream-home-blur:\s*4px[\s\S]*?--dream-task-blur:\s*8px/,
  "Dream Skin must provide comfortable blur defaults before the user adjusts either slider.",
);
assert.match(
  css,
  /#codework-dream-motion-layer\s*\{[\s\S]*?animation:\s*codework-dream-wallpaper-drift/,
  "Dream Skin must animate an isolated wallpaper-only layer instead of animating client content.",
);
assert.match(
  css,
  /dream-motion-paused\s+#codework-dream-motion-layer\s*\{[\s\S]*?animation-play-state:\s*paused/,
  "Dream Skin must pause wallpaper motion while the client is hidden.",
);
assert.match(
  css,
  /dream-motion-enabled body\s*\{[\s\S]*?background-image:\s*none\s*!important[\s\S]*?isolation:\s*isolate/,
  "Motion mode must replace the static body artwork instead of drawing a duplicate image over it.",
);
assert.match(
  css,
  /dream-motion-enabled body > :not\(#codework-dream-motion-layer(?:, #codex-dream-skin-chrome)?\)\s*\{[\s\S]*?z-index:\s*1/,
  "The animated wallpaper layer must stay below the client controls and content.",
);
assert.match(
  css,
  /\.codework-dream-motion-control\s*\{[\s\S]*?display:\s*inline-flex[\s\S]*?align-items:\s*center/,
  "The motion switch must stay compact and aligned in the existing title-bar toolbar.",
);
assert.match(
  css,
  /@media \(prefers-reduced-motion: reduce\)[\s\S]*?#codework-dream-motion-layer\s*\{[\s\S]*?animation:\s*none/,
  "Dream Skin must honor the operating system reduced-motion preference.",
);

assert.doesNotMatch(css, /dream-text-force-(?:dark|light)/,
  "Dream Skin must restore its native text treatment instead of forcing a black/white text mode.");
assert.doesNotMatch(css, /codework-dream-text-mode/,
  "The removed text-mode button must not leave title-bar CSS behind.");

assert.match(
  css,
  /#codex-dream-skin-chrome\s*\{[\s\S]*?pointer-events:\s*auto\s*!important[\s\S]*?-webkit-app-region:\s*no-drag\s*!important/,
  "The title-bar controls must accept pointer input instead of behaving like a decorative overlay.",
);

assert.match(
  css,
  /#codex-dream-skin-chrome\s*\{[\s\S]*?flex-wrap:\s*nowrap[\s\S]*?white-space:\s*nowrap/,
  "The Dream Skin title bar must never wrap its product label or text-mode button into multiple lines.",
);
assert.match(
  css,
  /#codex-dream-skin-chrome\s*>\s*\*\s*\{[\s\S]*?flex:\s*0\s+0\s+auto[\s\S]*?white-space:\s*nowrap/,
  "Every title-bar control must keep its intrinsic width instead of shrinking into a broken vertical label.",
);

assert.match(
  css,
  /--dream-task-immersive-edge:\s*color-mix\(in oklab, oklch\(0\.18 0\.02 30\) 34%, transparent\)[\s\S]*?--dream-task-immersive-mid:\s*color-mix\(in oklab, oklch\(0\.18 0\.02 30\) 22%, transparent\)[\s\S]*?--dream-task-immersive-far:\s*color-mix\(in oklab, oklch\(0\.18 0\.02 30\) 10%, transparent\)/,
  "Conversation routes must use a restrained dark reading layer instead of a high-opacity pale veil that washes out the selected wallpaper.",
);

assert.match(
  css,
  /dream-art-custom-cover\.dream-route-home[\s\S]*?backdrop-filter:\s*none\s*!important/,
  "A transient welcome-route mount must not blur the custom wallpaper before Codex settles the initial screen.",
);

function createFixture({
  shellPresent,
  staleSkin = false,
  homePresent = false,
  utilityPresent = false,
  shellAppearance = "dark",
  computedColorScheme = "",
  osAppearance = "light",
  runtimeClientVersion = null,
  analysisFixture = null,
  titleBarRect = null,
  legacyMenuPresent = false,
}) {
  const nodes = new Map();
  const rootClasses = new Set(staleSkin ? ["codex-dream-skin"] : []);
  const rootStyles = new Map(staleSkin ? [["--dream-art", "url(\"blob:stale\")"]] : []);
  const revokedUrls = [];
  const observers = [];
  const listeners = new Map();
  const storage = new Map();
  let objectUrlCount = 0;
  let hasShell = shellPresent;
  let hasSidebar = shellPresent;
  let root;

  const queueRootClassMutation = () => {
    for (const observer of observers) {
      if (observer.target !== root || !observer.options?.attributes) continue;
      if (observer.options.attributeFilter && !observer.options.attributeFilter.includes("class")) continue;
      observer.records.push({ type: "attributes", attributeName: "class", target: root });
    }
  };
  const makeClassList = (classes = new Set(), onMutation = () => {}) => ({
    add(...values) {
      let changed = false;
      for (const value of values) {
        if (!classes.has(value)) { classes.add(value); changed = true; }
      }
      if (changed) onMutation();
    },
    remove(...values) {
      let changed = false;
      for (const value of values) changed = classes.delete(value) || changed;
      if (changed) onMutation();
    },
    toggle(value, enabled) {
      const changed = enabled ? !classes.has(value) : classes.has(value);
      if (enabled) classes.add(value);
      else classes.delete(value);
      if (changed) onMutation();
    },
    contains(value) { return classes.has(value); },
  });

  root = {
    className: shellAppearance,
    clientWidth: 1440,
    clientHeight: 900,
    classList: makeClassList(rootClasses, queueRootClassMutation),
    getAttribute() { return null; },
    style: {
      setProperty(key, value) { rootStyles.set(key, value); },
      getPropertyValue(key) { return rootStyles.get(key) || ""; },
      removeProperty(key) { rootStyles.delete(key); },
    },
    appendChild(node) {
      node.parentElement = root;
      nodes.set(node.id, node);
    },
  };
  const body = {
    className: "",
    getAttribute() { return null; },
    appendChild(node) {
      node.parentElement = body;
      nodes.set(node.id, node);
    },
  };
  const routeClasses = new Set();
  const utilityClasses = new Set();
  const utilityNode = { classList: makeClassList(utilityClasses) };
  const shellMain = {
    classList: makeClassList(routeClasses),
    setAttribute() {},
    removeAttribute() {},
    getBoundingClientRect() {
      return { left: 290, top: 36, width: 990, height: 784 };
    },
  };
  const nativeTitleBar = titleBarRect ? {
    getBoundingClientRect() { return titleBarRect; },
  } : null;
  shellMain.querySelectorAll = (selector) => {
    if (selector === '[class*="_homeUtilityBar_"]' && utilityPresent) return [utilityNode];
    return [];
  };
  const routeMain = shellMain;
  const homeIcon = {
    isConnected: true,
    getBoundingClientRect() {
      return { left: 420, top: 230, width: 48, height: 48, right: 468, bottom: 278 };
    },
    closest(selector) {
      return selector === '[role="main"]' || selector.includes('main') ? routeMain : null;
    },
  };
  const staleHome = { classList: makeClassList(new Set(["dream-home"])) };
  const staleShell = { classList: makeClassList(new Set(["dream-home-shell"])) };

  const createElement = (tagName) => {
    if (tagName === "canvas" && analysisFixture) {
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            drawImage() {},
            getImageData() { return { data: analysisFixture.pixels }; },
          };
        },
      };
    }
    const inlineStyles = new Map();
    return {
      id: "",
      dataset: {},
      style: {
        setProperty(key, value) { inlineStyles.set(key, value); },
        getPropertyValue(key) { return inlineStyles.get(key) || ""; },
      },
      classList: makeClassList(),
      parentElement: null,
      textContent: "",
      innerHTML: "",
      setAttribute() {},
      remove() { nodes.delete(this.id); },
    };
  };
  if (legacyMenuPresent) {
    const legacyMenu = createElement("div");
    legacyMenu.id = "codex-plus-menu";
    nodes.set(legacyMenu.id, legacyMenu);
  }
  if (staleSkin) {
    const style = createElement();
    style.id = "codex-dream-skin-style";
    nodes.set(style.id, style);
    const chrome = createElement();
    chrome.id = "codex-dream-skin-chrome";
    nodes.set(chrome.id, chrome);
  }

  const document = {
    documentElement: root,
    head: root,
    body,
    hidden: false,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
    createElement,
    getElementById(id) { return nodes.get(id) ?? null; },
    querySelector(selector) {
      if (selector === 'main.main-surface, main[role="main"], main[class*="MainContentSurface"]'
        || selector === "main.main-surface" || selector === "main[role=\"main\"]" || selector === 'main[class*="MainContentSurface"]') {
        return hasShell ? shellMain : null;
      }
      if (selector === "aside.app-shell-left-panel") return hasSidebar ? {} : null;
      if (selector === '[class~="group/application-menu-top-bar"]') return nativeTitleBar;
      if (selector === '[role="main"]:has([data-testid="home-icon"])') {
        return hasShell && homePresent ? routeMain : null;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'main.main-surface, main[role="main"], main[class*="MainContentSurface"]') return hasShell ? [shellMain] : [];
      if (selector === '[role="main"]') return hasShell ? [routeMain] : [];
      if (selector === '[data-testid="home-icon"]') return hasShell && homePresent ? [homeIcon] : [];
      if (selector === ".dream-task") return routeClasses.has("dream-task") ? [routeMain] : [];
      if (selector === ".dream-home-utility") {
        return utilityClasses.has("dream-home-utility") ? [utilityNode] : [];
      }
      if (!staleSkin) return [];
      if (selector === ".dream-home") return [staleHome];
      if (selector === ".dream-home-shell") return [staleShell];
      return [];
    },
  };
  const context = {
    window: {
      matchMedia() { return { matches: osAppearance === "dark" }; },
      localStorage: {
        getItem(key) { return storage.get(key) ?? null; },
        setItem(key, value) { storage.set(key, value); },
      },
      ...(runtimeClientVersion ? { __CODEX_PLUS_VERSION__: runtimeClientVersion } : {}),
    },
    document,
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        this.records = [];
        this.target = null;
        this.options = null;
        observers.push(this);
      }
      observe(target, options = {}) {
        this.target = target;
        this.options = options;
      }
      disconnect() {
        this.target = null;
        this.records = [];
      }
      takeRecords() {
        const records = this.records;
        this.records = [];
        return records;
      }
    },
    URL: {
      createObjectURL() { objectUrlCount += 1; return `blob:fixture-${objectUrlCount}`; },
      revokeObjectURL(value) { revokedUrls.push(value); },
    },
    Blob,
    Uint8Array,
    atob,
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: () => 2,
    clearTimeout: () => {},
    getComputedStyle() { return { colorScheme: computedColorScheme }; },
  };
  if (analysisFixture) {
    context.Image = class {
      naturalWidth = analysisFixture.naturalWidth;
      naturalHeight = analysisFixture.naturalHeight;
      set src(_) { this.onload(); }
    };
  }

  return {
    context,
    nodes,
    observers,
    rootClasses,
    rootStyles,
    revokedUrls,
    routeClasses,
    utilityClasses,
    setShellPresent(value) { hasShell = value; },
    setSidebarPresent(value) { hasSidebar = value; },
    setHomePresent(value) { homePresent = value; },
    setDocumentHidden(value) {
      document.hidden = value;
      listeners.get("visibilitychange")?.();
    },
  };
}

const main = createFixture({ shellPresent: true });
const mainResult = vm.runInNewContext(payload, main.context);
assert.equal(mainResult.installed, true);
assert.equal(main.rootClasses.has("codex-dream-skin"), true);
assert.equal(main.rootStyles.get("--dream-art"), 'url("blob:fixture-1")');
assert.equal(main.nodes.has("codex-dream-skin-style"), true);
assert.equal(main.nodes.has("codex-dream-skin-chrome"), true);
assert.equal(main.rootClasses.has("dream-theme-dark"), true);
assert.equal(main.rootClasses.has("dream-art-standard"), true);
assert.equal(main.rootClasses.has("dream-route-task"), true);
assert.equal(main.rootClasses.has("dream-task-ambient"), true);
assert.equal(main.routeClasses.has("dream-task"), true);
assert.equal(main.context.window.__CODEX_DREAM_SKIN_STATE__.cleanup(), true);
assert.equal(main.rootClasses.has("codex-dream-skin"), false);
assert.equal(main.rootClasses.has("dream-theme-dark"), false);
assert.equal(main.nodes.has("codex-dream-skin-style"), false);
assert.equal(main.nodes.has("codex-dream-skin-chrome"), false);
assert.deepEqual(main.revokedUrls, ["blob:fixture-1"]);

const collapsedSidebar = createFixture({ shellPresent: true });
vm.runInNewContext(payload, collapsedSidebar.context);
collapsedSidebar.setSidebarPresent(false);
collapsedSidebar.context.window.__CODEX_DREAM_SKIN_STATE__.ensure();
assert.equal(
  collapsedSidebar.rootClasses.has("codex-dream-skin"),
  true,
  "Collapsing the native left sidebar must not remove the active Dream Skin from the document.",
);
assert.equal(
  collapsedSidebar.nodes.has("codex-dream-skin-style"),
  true,
  "The injected Dream Skin stylesheet must remain mounted while the sidebar is collapsed.",
);

const motion = createFixture({ shellPresent: true });
vm.runInNewContext(payload, motion.context);
assert.equal(
  motion.rootClasses.has("dream-motion-enabled"),
  true,
  "Dream Skin must create a moving wallpaper layer for active themes.",
);
assert.equal(
  motion.nodes.has("codework-dream-motion-layer"),
  true,
  "Dream Skin must mount the wallpaper-only motion layer while active.",
);
motion.setDocumentHidden(true);
assert.equal(
  motion.rootClasses.has("dream-motion-paused"),
  true,
  "Wallpaper motion must pause when the client document is hidden.",
);
motion.setDocumentHidden(false);
assert.equal(
  motion.rootClasses.has("dream-motion-paused"),
  false,
  "Wallpaper motion must resume when the client document becomes visible.",
);
assert.match(
  motion.nodes.get("codex-dream-skin-chrome").innerHTML,
  /data-dream-motion="toggle"/,
  "The title bar must expose a persisted wallpaper-motion toggle.",
);
assert.equal(motion.context.window.__CODEX_DREAM_SKIN_STATE__.cleanup(), true);
assert.equal(
  motion.nodes.has("codework-dream-motion-layer"),
  false,
  "Dream Skin cleanup must remove the injected wallpaper motion layer.",
);

const legacyMenu = createFixture({ shellPresent: true, legacyMenuPresent: true });
vm.runInNewContext(payload, legacyMenu.context);
assert.equal(
  legacyMenu.nodes.has("codex-plus-menu"),
  false,
  "Dream Skin must remove the legacy floating Codework badge so two crown/version controls cannot overlap.",
);

const customWallpaper = createFixture({ shellPresent: true });
const customWallpaperResult = vm.runInNewContext(
  buildPayload({ customWallpaper: true }, "blob:codework-local-custom-wallpaper"),
  customWallpaper.context,
);
assert.equal(customWallpaperResult.installed, true);
assert.equal(
  customWallpaper.context.window.__CODEX_DREAM_SKIN_STATE__.artUrl,
  "blob:codework-local-custom-wallpaper",
  "A Codework local wallpaper blob must bypass Base64 decoding.",
);
assert.equal(
  customWallpaper.rootClasses.has("dream-art-custom-cover"),
  true,
  "A local custom wallpaper must retain its custom-cover marker so the full-canvas, transparent-header rules apply.",
);
assert.equal(customWallpaper.context.window.__CODEX_DREAM_SKIN_STATE__.cleanup(), true);
assert.deepEqual(
  customWallpaper.revokedUrls,
  [],
  "The Dream Skin runner must not revoke the local wallpaper cache it does not own.",
);

const palePixels = new Uint8ClampedArray(48 * 48 * 4);
for (let index = 0; index < palePixels.length; index += 4) {
  palePixels[index] = 248;
  palePixels[index + 1] = 232;
  palePixels[index + 2] = 221;
  palePixels[index + 3] = 255;
}
const paleCustomWallpaper = createFixture({
  shellPresent: true,
  analysisFixture: { naturalWidth: 1600, naturalHeight: 1000, pixels: palePixels },
});
vm.runInNewContext(
  buildPayload({ customWallpaper: true }, "blob:codework-pale-custom-wallpaper"),
  paleCustomWallpaper.context,
);
await Promise.resolve();
assert.equal(
  paleCustomWallpaper.rootClasses.has("dream-wallpaper-light"),
  true,
  "A pale custom wallpaper must opt into the local readable-foreground layer even when Codex itself is in dark mode.",
);
assert.match(
  css,
  /dream-art-custom-cover\.dream-wallpaper-light[\s\S]*?\.composer-surface-chrome[\s\S]*?background:\s*rgb\(255 250 247 \/ \.88\)\s*!important/,
  "Pale custom wallpaper composers must receive an opaque-enough warm surface instead of inheriting a dark-mode white-text control.",
);
assert.match(
  css,
  /dream-art-custom-cover\.dream-wallpaper-light[\s\S]*?\.composer-surface-chrome\s*:is\(textarea, \[contenteditable="true"\],[\s\S]*?color:\s*rgb\(31 29 34\)\s*!important/,
  "Pale custom wallpaper composer text must use a dark readable foreground without touching global Codex tokens.",
);

const reinjected = createFixture({ shellPresent: true });
vm.runInNewContext(payload, reinjected.context);
const firstState = reinjected.context.window.__CODEX_DREAM_SKIN_STATE__;
vm.runInNewContext(payload, reinjected.context);
const secondState = reinjected.context.window.__CODEX_DREAM_SKIN_STATE__;
assert.notEqual(secondState.installToken, firstState.installToken);
assert.equal(secondState.artUrl, "blob:fixture-2");
assert.equal(reinjected.rootStyles.get("--dream-art"), 'url("blob:fixture-2")');
assert.deepEqual(reinjected.revokedUrls, ["blob:fixture-1"]);
assert.equal(firstState.cleanup(), false);
assert.equal(secondState.cleanup(), true);

const auxiliary = createFixture({ shellPresent: false, staleSkin: true });
const auxiliaryResult = vm.runInNewContext(payload, auxiliary.context);
assert.equal(auxiliaryResult.installed, true);
assert.equal(auxiliary.rootClasses.has("codex-dream-skin"), false);
assert.equal(auxiliary.rootStyles.has("--dream-art"), false);
assert.equal(auxiliary.nodes.has("codex-dream-skin-style"), false);
assert.equal(auxiliary.nodes.has("codex-dream-skin-chrome"), false);

auxiliary.setShellPresent(true);
auxiliary.context.window.__CODEX_DREAM_SKIN_STATE__.ensure();
assert.equal(auxiliary.rootClasses.has("codex-dream-skin"), true);
assert.equal(auxiliary.nodes.has("codex-dream-skin-style"), true);
assert.equal(auxiliary.nodes.has("codex-dream-skin-chrome"), true);

const configured = createFixture({
  shellPresent: true,
  homePresent: true,
  utilityPresent: true,
});
const configuredPayload = buildPayload({
  appearance: "light",
  palette: { accent: "#d45a70" },
  art: { focusX: .15, focusY: .8, safeArea: "right", taskMode: "off" },
});
const configuredResult = vm.runInNewContext(configuredPayload, configured.context);
assert.equal(configuredResult.adaptive, true);
assert.equal(configured.rootClasses.has("dream-theme-light"), true);
assert.equal(configured.rootClasses.has("dream-theme-dark"), false);
assert.equal(configured.rootClasses.has("dream-focus-left"), true);
assert.equal(configured.rootClasses.has("dream-safe-right"), true);
assert.equal(configured.rootClasses.has("dream-task-off"), true);
assert.equal(configured.rootStyles.get("--dream-art-position"), "15% 80%");
assert.equal(configured.rootStyles.get("--dream-accent"), "#d45a70");
assert.equal(configured.routeClasses.has("dream-home"), true);
assert.equal(configured.routeClasses.has("dream-task"), false);
assert.equal(configured.rootClasses.has("dream-route-home"), true);
assert.equal(configured.rootClasses.has("dream-route-task"), false);
assert.equal(configured.utilityClasses.has("dream-home-utility"), true);
assert.equal(configured.context.window.__CODEX_DREAM_SKIN_STATE__.cleanup(), true);
assert.equal(configured.utilityClasses.has("dream-home-utility"), false);

const transientHomeMarker = createFixture({ shellPresent: true, homePresent: true });
vm.runInNewContext(payload, transientHomeMarker.context);
transientHomeMarker.setHomePresent(false);
transientHomeMarker.context.window.__CODEX_DREAM_SKIN_STATE__.ensure();
assert.equal(transientHomeMarker.rootClasses.has("dream-route-home"), true,
  "A transient missing home marker must retain the completed home frame instead of flashing into task layout.");

assert.match(css, /app-shell-left-panel\s*>\s*:first-child[\s\S]*backdrop-filter/,
  "The left header must receive its own readable contrast surface.");
assert.match(css, /app-header-tint[\s\S]*aria-controls[\s\S]*pointer-events:\s*auto/,
  "The native header controls, including the right side-panel trigger, must stay visible and clickable.");
assert.match(
  css,
  /main\.main-surface\s*>\s*\[class\*="_Header_"\][\s\S]*inset-inline-start:\s*0(?:px)?\s*!important/,
  "The generated native task header must clear its legacy sidebar-width inset, keeping the right side-panel trigger inside the window.",
);
assert.match(
  css,
  /main\.main-surface\s*>\s*\[class\*="_Header_"\][\s\S]*z-index:\s*5\s*!important[\s\S]*pointer-events:\s*auto\s*!important/,
  "The generated task header must sit above the main viewport so its native right-drawer buttons receive pointer clicks.",
);

assert.match(
  css,
  /\[aria-pressed\][\s\S]*?color:\s*rgb\(31 41 55\)\s*!important[\s\S]*?background:\s*color-mix\(in srgb, white 72%, transparent\)\s*!important/,
  "The native right side-panel launcher must remain visible on bright custom wallpapers instead of inheriting a translucent white icon.",
);

assert.match(
  css,
  /\[class\*="_ApplicationMenuTopBar_"\][\s\S]*?background:\s*rgb\(15 23 42\s*\/\s*\.72\)\s*!important[\s\S]*?backdrop-filter:\s*blur\(14px\)/,
  "The actual hashed application-menu bar must receive a readable glass surface on custom wallpapers.",
);

assert.match(
  css,
  /dream-art-custom-cover\.dream-route-task[\s\S]*?main\.main-surface[\s\S]*?background:\s*linear-gradient\(90deg, rgb\(11 18 31\s*\/\s*\.48\)[\s\S]*?backdrop-filter:\s*blur\(6px\)/,
  "Bright custom wallpapers must provide a restrained full conversation reading veil without replacing messages with opaque cards.",
);

assert.match(
  css,
  /dream-art-custom-cover\.dream-route-task[\s\S]*?aside\.app-shell-left-panel[\s\S]*?background:\s*linear-gradient\(180deg, rgb\(15 23 42\s*\/\s*\.76\)[\s\S]*?backdrop-filter:\s*blur\(16px\)/,
  "The custom-wallpaper task route must override the more-specific legacy sidebar gradient with a neutral readable surface.",
);

assert.match(
  css,
  /dream-art-custom-cover\.dream-route-task\s+\.composer-surface-chrome[\s\S]*?background:\s*linear-gradient\(135deg, rgb\(15 23 42\s*\/\s*\.84\)/,
  "The composer must use a refined dark glass surface instead of a large white block over light artwork.",
);
const customComposerLayerRule = css.match(
  /html\.codex-dream-skin\.dream-art-custom-cover\s+\.composer-surface-chrome\s+:is\([\s\S]*?\.ProseMirror\s*\n\s*\)\s*\{[\s\S]*?\n\s*\}/,
)?.[0] ?? "";
assert.match(
  customComposerLayerRule,
  /color:\s*rgb\(248 250 252\s*\/\s*\.96\)\s*!important/,
  "The layered custom-wallpaper editor rule must keep typed ProseMirror text white on the dark glass composer.",
);

const branded = createFixture({ shellPresent: true });
vm.runInNewContext(buildPayload({ appearance: "light", clientVersion: "1.3.61" }), branded.context);
const brandChrome = branded.nodes.get("codex-dream-skin-chrome");
assert.match(brandChrome.innerHTML, /codework-dream-crown">♛/);
assert.match(brandChrome.innerHTML, />Codework AI客户端</);
assert.match(brandChrome.innerHTML, /1\.3\.61/);
assert.match(brandChrome.innerHTML, /data-dream-tuning="home"/,
  "The title bar must expose a compact home transparency control.");
assert.match(brandChrome.innerHTML, /data-dream-tuning="task"/,
  "The title bar must expose a compact conversation transparency control.");
assert.doesNotMatch(brandChrome.innerHTML, /data-dream-text-mode="toggle"/,
  "The title bar must not expose the removed black/white text toggle.");
assert.equal(branded.rootClasses.has("dream-text-force-dark"), false,
  "The runtime must not add a global forced-text class.");
assert.equal(branded.rootClasses.has("dream-theme-light"), true);
assert.equal(branded.rootStyles.has("--dream-text"), false,
  "The runtime must leave the native Dream Skin foreground token unforced.");
assert.equal(branded.rootStyles.has("--color-token-foreground"), false,
  "The runtime must leave Codex foreground tokens untouched.");
assert.match(
  css,
  /dream-art-custom-cover\.dream-route-home\s+body[\s\S]*?background-size:\s*cover/,
  "Custom wallpaper coverage must use the stable root route class.",
);
assert.match(
  css,
  /dream-art-custom-cover\s+main\.main-surface > header\.app-header-tint\s*\{[\s\S]*?background:\s*transparent\s*!important/,
  "Custom wallpaper task headers must stay transparent instead of hiding the image.",
);
assert.match(
  css,
  /dream-art-custom-cover\.dream-art-wide[\s\S]*?aside\.app-shell-left-panel\s*\{[\s\S]*?background:\s*color-mix\(in srgb, #111827 72%, transparent\)\s*!important/,
  "A wide custom wallpaper must override the legacy tinted sidebar with a neutral translucent layer.",
);
assert.match(
  css,
  /dream-art-custom-cover\.dream-art-wide[\s\S]*?main\.main-surface > header\.app-header-tint[\s\S]*?\{[\s\S]*?background:\s*transparent\s*!important/,
  "A wide custom wallpaper must override the later wide-art header rule so no opaque strip covers its top edge.",
);

const versionFreshness = createFixture({ shellPresent: true, runtimeClientVersion: "1.3.63" });
vm.runInNewContext(buildPayload({ appearance: "light", clientVersion: "1.3.61" }), versionFreshness.context);
assert.match(
  versionFreshness.nodes.get("codex-dream-skin-chrome").innerHTML,
  /v1\.3\.63/,
  "The title badge must prefer the running Codework client version over a stale saved-theme value.",
);
assert.equal(branded.rootClasses.has("dream-theme-dark"), false);

const titleBarAligned = createFixture({
  shellPresent: true,
  titleBarRect: { left: 0, top: 18, width: 1280, height: 36 },
});
vm.runInNewContext(payload, titleBarAligned.context);
const alignedChrome = titleBarAligned.nodes.get("codex-dream-skin-chrome");
assert.equal(alignedChrome.style.getPropertyValue("--codework-dream-chrome-top"), "");
assert.equal(alignedChrome.style.getPropertyValue("--codework-dream-chrome-left"), "");

const analysisPixels = new Uint8ClampedArray(48 * 12 * 4);
for (let index = 0; index < 48 * 12; index += 1) {
  const offset = index * 4;
  const x = index % 48;
  const subject = x >= 34 && x <= 42;
  analysisPixels[offset] = subject ? 210 : 246;
  analysisPixels[offset + 1] = subject ? 84 : 239;
  analysisPixels[offset + 2] = subject ? 112 : 237;
  analysisPixels[offset + 3] = 255;
}
const analyzed = createFixture({
  shellPresent: true,
  analysisFixture: { naturalWidth: 1200, naturalHeight: 400, pixels: analysisPixels },
});
vm.runInNewContext(payload, analyzed.context);
await Promise.resolve();
assert.equal(analyzed.rootClasses.has("dream-theme-dark"), true);
assert.equal(analyzed.rootClasses.has("dream-theme-light"), false);
assert.equal(analyzed.rootClasses.has("dream-art-wide"), true);
assert.equal(analyzed.rootClasses.has("dream-task-banner"), true);
assert.equal(analyzed.rootClasses.has("dream-safe-left"), true);
assert.notEqual(analyzed.rootStyles.get("--dream-accent"), "rgb(216 104 119)");

const tealDominantPixels = new Uint8ClampedArray(48 * 12 * 4);
for (let index = 0; index < 48 * 12; index += 1) {
  const offset = index * 4;
  const teal = index < 48 * 12 * .6;
  tealDominantPixels[offset] = teal ? 20 : 218;
  tealDominantPixels[offset + 1] = teal ? 142 : 94;
  tealDominantPixels[offset + 2] = teal ? 151 : 124;
  tealDominantPixels[offset + 3] = 255;
}
const tealDominant = createFixture({
  shellPresent: true,
  analysisFixture: { naturalWidth: 1600, naturalHeight: 900, pixels: tealDominantPixels },
});
vm.runInNewContext(payload, tealDominant.context);
await Promise.resolve();
assert.equal(
  tealDominant.rootStyles.get("--dream-accent"),
  "rgb(20 142 151)",
  "Auto-selected custom wallpaper accents must use the strongest color family instead of blending into the old pink bias.",
);

const standardArt = createFixture({
  shellPresent: true,
  analysisFixture: { naturalWidth: 800, naturalHeight: 800, pixels: analysisPixels },
});
vm.runInNewContext(payload, standardArt.context);
await Promise.resolve();
assert.equal(standardArt.rootClasses.has("dream-art-narrow"), true);
assert.equal(standardArt.rootClasses.has("dream-art-standard"), false);
assert.equal(standardArt.rootClasses.has("dream-task-ambient"), true);
assert.equal(standardArt.rootClasses.has("dream-task-banner"), false);

const narrowArt = createFixture({
  shellPresent: true,
  analysisFixture: { naturalWidth: 1536, naturalHeight: 1024, pixels: analysisPixels },
});
vm.runInNewContext(payload, narrowArt.context);
await Promise.resolve();
assert.equal(narrowArt.rootClasses.has("dream-art-narrow"), true);
assert.equal(narrowArt.rootClasses.has("dream-art-standard"), false);

const mediumWide = createFixture({
  shellPresent: true,
  analysisFixture: { naturalWidth: 2100, naturalHeight: 1000, pixels: analysisPixels },
});
vm.runInNewContext(payload, mediumWide.context);
await Promise.resolve();
assert.equal(mediumWide.rootClasses.has("dream-art-wide"), true);
assert.equal(mediumWide.rootClasses.has("dream-task-ambient"), true);
assert.equal(mediumWide.rootClasses.has("dream-task-banner"), false);

const nativeLight = createFixture({ shellPresent: true, shellAppearance: "light" });
vm.runInNewContext(payload, nativeLight.context);
assert.equal(nativeLight.rootClasses.has("dream-theme-light"), true);
assert.equal(nativeLight.rootClasses.has("dream-theme-dark"), false);

const nativeComputedDark = createFixture({
  shellPresent: true,
  shellAppearance: "",
  computedColorScheme: "dark",
  osAppearance: "light",
});
vm.runInNewContext(payload, nativeComputedDark.context);
assert.equal(nativeComputedDark.rootClasses.has("dream-theme-dark"), true);
assert.equal(nativeComputedDark.rootClasses.has("dream-theme-light"), false);
nativeComputedDark.context.window.__CODEX_DREAM_SKIN_STATE__.ensure();
assert.equal(nativeComputedDark.rootClasses.has("dream-theme-dark"), true);
const nativeObserver = nativeComputedDark.observers[0];
nativeObserver.takeRecords();
nativeComputedDark.context.window.__CODEX_DREAM_SKIN_STATE__.ensure();
assert.equal(nativeObserver.takeRecords().length, 0,
  "Sampling the native computed color-scheme must not queue a self-triggering root mutation pass.");

const metadataWide = createFixture({ shellPresent: true });
vm.runInNewContext(buildPayload({ artMetadata: { ratio: 16 / 9 } }), metadataWide.context);
assert.equal(metadataWide.rootClasses.has("dream-art-wide"), true);
assert.equal(metadataWide.rootClasses.has("dream-art-standard"), false);

console.log("PASS: renderer applies adaptive theme metadata and preserves transparent auxiliary windows.");

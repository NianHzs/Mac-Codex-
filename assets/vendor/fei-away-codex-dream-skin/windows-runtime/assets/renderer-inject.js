((cssText, artDataUrl, rawConfig) => {
  const STATE_KEY = "__CODEX_DREAM_SKIN_STATE__";
  const STYLE_ID = "codex-dream-skin-style";
  const CHROME_ID = "codex-dream-skin-chrome";
  const MOTION_ID = "codework-dream-motion-layer";
  const TUNING_STORAGE_KEY = "codework.dream-skin.tuning.v2";
  const ROOT_CLASSES = [
    "codex-dream-skin",
    "dream-theme-light",
    "dream-theme-dark",
    "dream-art-wide",
    "dream-art-narrow",
    "dream-art-standard",
    "dream-art-custom-cover",
    "dream-wallpaper-light",
    "dream-route-home",
    "dream-route-task",
    "dream-focus-left",
    "dream-focus-center",
    "dream-focus-right",
    "dream-safe-left",
    "dream-safe-center",
    "dream-safe-right",
    "dream-safe-none",
    "dream-task-ambient",
    "dream-task-banner",
    "dream-task-off",
    "dream-motion-enabled",
    "dream-motion-paused",
  ];
  const LEGACY_TEXT_CLASSES = ["dream-text-force-dark", "dream-text-force-light"];
  const ROOT_PROPERTIES = [
    "--dream-art",
    "--dream-art-position",
    "--dream-art-fit",
    "--dream-art-backdrop-fit",
    "--dream-home-blur",
    "--dream-task-blur",
    "--dream-focus-x",
    "--dream-focus-y",
    "--dream-accent",
    "--dream-accent-ink",
    "--dream-image-luma",
    "--dream-text",
    "--dream-text-muted",
    "--text-primary",
    "--text-secondary",
    "--text-tertiary",
    "--token-text-primary",
    "--token-text-secondary",
    "--token-text-tertiary",
    "--color-token-foreground",
    "--color-token-text-primary",
    "--color-text-foreground",
    "--color-text-foreground-secondary",
    "--color-text-foreground-tertiary",
    "--color-token-description-foreground",
    "--vscode-foreground",
    "--color-token-dropdown-foreground",
    "--vscode-dropdown-foreground",
  ];
  const HOME_UTILITY_CLASS = "dream-home-utility";
  // Codex 1.3.91 renamed the main surface class to a generated CSS-module
  // name. Keep the stable legacy selector while accepting the current class
  // and the semantic role used by newer builds.
  const MAIN_SURFACE_SELECTOR =
    'main.main-surface, main[role="main"], main[class*="MainContentSurface"]';
  const findShellMain = () => document.querySelector(MAIN_SURFACE_SELECTOR);
  const installToken = {};
  let samplingNativeShell = false;
  const routeState = { home: null, missingSince: 0, settleTimer: null };
  let observer = null;
  window.__CODEX_DREAM_SKIN_DISABLED__ = false;

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value)));
  const readTuning = () => {
    try {
      const stored = JSON.parse(window.localStorage?.getItem(TUNING_STORAGE_KEY) || "{}");
      return {
        home: clamp(stored.home ?? 4, 0, 18),
        task: clamp(stored.task ?? 8, 0, 18),
        motion: stored.motion !== false,
      };
    } catch {
      return { home: 4, task: 8, motion: true };
    }
  };
  let tuning = readTuning();
  const LEGACY_TEXT_PROPERTIES = [
    "--dream-text",
    "--text-primary",
    "--token-text-primary",
    "--color-token-foreground",
    "--color-token-text-primary",
    "--color-text-foreground",
    "--vscode-foreground",
    "--color-token-dropdown-foreground",
    "--vscode-dropdown-foreground",
  ];
  const clearLegacyTextOverrides = (root) => {
    root?.classList.remove(...LEGACY_TEXT_CLASSES);
    for (const property of LEGACY_TEXT_PROPERTIES) root?.style.removeProperty(property);
  };
  function isElementVisible(element) {
    if (!element?.isConnected) return false;
    const style = window.getComputedStyle?.(element);
    if (style && (style.display === "none" || style.visibility === "hidden")) return false;
    if (typeof element.getBoundingClientRect !== "function") return false;
    const rect = element.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const viewportWidth = Number(window.innerWidth) || document.documentElement?.clientWidth || 0;
    const viewportHeight = Number(window.innerHeight) || document.documentElement?.clientHeight || 0;
    return rect.right > 0 && rect.bottom > 0 && rect.left < viewportWidth && rect.top < viewportHeight;
  }
  function findHomeSurface() {
    const homeIcon = [...document.querySelectorAll('[data-testid="home-icon"]')].find(isElementVisible);
    if (!homeIcon) return null;
    const direct = homeIcon.closest?.('[role="main"]');
    if (direct && isElementVisible(direct)) return direct;

    // Codex replaces the welcome route in two passes. During the second pass
    // it briefly loses role=main while retaining its stable home marker.
    // Treat that visible welcome surface as home instead of switching to the
    // task layout and leaving the screen empty until the next rerender.
    const scopedHomeIcon = document.querySelector(
      `${MAIN_SURFACE_SELECTOR} [data-testid="home-icon"]`,
    );
    const inferred = (scopedHomeIcon && isElementVisible(scopedHomeIcon) ? scopedHomeIcon : homeIcon)?.closest?.(MAIN_SURFACE_SELECTOR)
      || homeIcon?.closest?.('[role="main"]')
      || homeIcon?.parentElement?.parentElement;
    return inferred && inferred.isConnected !== false ? inferred : null;
  }
  const findStableHomeSurface = () => {
    const home = findHomeSurface();
    if (home) {
      routeState.home = home;
      routeState.missingSince = 0;
      if (routeState.settleTimer) clearTimeout(routeState.settleTimer);
      routeState.settleTimer = null;
      return home;
    }
    if (!routeState.home || routeState.home.isConnected === false) return null;
    if (!routeState.missingSince) {
      routeState.missingSince = Date.now();
      routeState.settleTimer = setTimeout(() => {
        routeState.settleTimer = null;
        scheduleEnsure();
      }, 520);
    }
    if (Date.now() - routeState.missingSince < 520) return routeState.home;
    routeState.home = null;
    routeState.missingSince = 0;
    return null;
  };
  const applyTuning = (root) => {
    root.style.setProperty("--dream-home-blur", `${Math.round(tuning.home)}px`);
    root.style.setProperty("--dream-task-blur", `${Math.round(tuning.task)}px`);
  };
  const updateTuning = (root, key, value) => {
    if (key !== "home" && key !== "task") return;
    tuning[key] = clamp(value, 0, 18);
    applyTuning(root);
    try {
      window.localStorage?.setItem(TUNING_STORAGE_KEY, JSON.stringify(tuning));
    } catch {}
  };
  const applyMotion = (root) => {
    const enabled = tuning.motion !== false;
    let layer = document.getElementById(MOTION_ID);
    if (!enabled) {
      root.classList.remove("dream-motion-enabled", "dream-motion-paused");
      layer?.remove();
      return;
    }
    if (!layer || layer.parentElement !== document.body) {
      layer?.remove();
      layer = document.createElement("div");
      layer.id = MOTION_ID;
      layer.setAttribute("aria-hidden", "true");
      document.body.appendChild(layer);
    }
    root.classList.add("dream-motion-enabled");
    root.classList.toggle("dream-motion-paused", document.hidden === true);
  };
  const updateMotion = (root, enabled) => {
    tuning.motion = enabled !== false;
    applyMotion(root);
    try {
      window.localStorage?.setItem(TUNING_STORAGE_KEY, JSON.stringify(tuning));
    } catch {}
  };
  const luminance = (red, green, blue) => {
    const linear = [red, green, blue].map((value) => {
      const channel = value / 255;
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    });
    return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
  };
  const defaultProfile = {
    appearance: "dark",
    accent: [108, 131, 142],
    focusX: .5,
    focusY: .5,
    aspect: 1.6,
    measured: false,
    luma: .32,
    safeArea: "center",
  };

  const normalizeConfig = (value) => {
    const config = value && typeof value === "object" ? value : {};
    const art = config.art && typeof config.art === "object" ? config.art : {};
    const hasNumber = (candidate) =>
      (typeof candidate === "number" || (typeof candidate === "string" && candidate.trim() !== "")) &&
      Number.isFinite(Number(candidate));
    const requestedAccent = typeof config?.palette?.accent === "string"
      ? config.palette.accent.trim()
      : "";
    const safeAccent = /^(?:#[\da-f]{3,8}|(?:rgb|hsl|oklch|oklab)\([^;{}]{1,96}\))$/i.test(requestedAccent)
      ? requestedAccent
      : null;
    const appearance = ["auto", "light", "dark"].includes(config.appearance)
      ? config.appearance
      : "auto";
    const safeArea = ["auto", "left", "right", "center", "none"].includes(art.safeArea)
      ? art.safeArea
      : "auto";
    const taskMode = ["auto", "ambient", "banner", "off"].includes(art.taskMode)
      ? art.taskMode
      : "auto";
    const runtimeClientVersion = typeof window.__CODEX_PLUS_VERSION__ === "string"
      ? window.__CODEX_PLUS_VERSION__.trim()
      : "";
    const requestedClientVersion = typeof config.clientVersion === "string"
      ? config.clientVersion.trim()
      : "";
    const clientVersion = /^\d+(?:\.\d+){1,3}$/.test(runtimeClientVersion)
      ? runtimeClientVersion
      : /^\d+(?:\.\d+){1,3}$/.test(requestedClientVersion)
        ? requestedClientVersion
        : "—";
    const metadataRatio = Number(config?.artMetadata?.ratio);
    return {
      appearance,
      safeArea,
      taskMode,
      customWallpaper: config.customWallpaper === true,
      clientVersion,
      focusX: hasNumber(art.focusX) ? clamp(art.focusX) : null,
      focusY: hasNumber(art.focusY) ? clamp(art.focusY) : null,
      accent: safeAccent,
      initialAspect: Number.isFinite(metadataRatio) && metadataRatio > 0 ? metadataRatio : null,
    };
  };

  const previous = window[STATE_KEY];
  if (previous?.observer) previous.observer.disconnect();
  if (previous?.timer) clearInterval(previous.timer);
  if (previous?.scheduler?.timeout) clearTimeout(previous.scheduler.timeout);
  if (previous?.ownsArtUrl && previous?.artUrl) URL.revokeObjectURL(previous.artUrl);
  const ownsArtUrl = !artDataUrl.startsWith("blob:");
  const artUrl = ownsArtUrl ? (() => {
    const comma = artDataUrl.indexOf(",");
    const binary = atob(artDataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const mime = /^data:([^;,]+)/.exec(artDataUrl)?.[1] || "image/png";
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  })() : artDataUrl;
  const config = normalizeConfig(rawConfig);
  let profile = {
    ...defaultProfile,
    aspect: config.initialAspect ?? defaultProfile.aspect,
    measured: config.initialAspect !== null,
  };
  const existingStyle = document.getElementById(STYLE_ID);
  if (existingStyle) {
    existingStyle.textContent = cssText;
    existingStyle.dataset.dreamVersion = "4";
  }

  const analyzeArt = () => new Promise((resolve) => {
    if (typeof Image !== "function") {
      resolve(defaultProfile);
      return;
    }
    const image = new Image();
    image.onload = () => {
      try {
        const width = 48;
        const height = Math.max(12, Math.round(width * image.naturalHeight / image.naturalWidth));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext?.("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas is unavailable");
        context.drawImage(image, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height).data;
        let count = 0;
        let totalRed = 0;
        let totalGreen = 0;
        let totalBlue = 0;
        let totalBrightness = 0;
        const samples = [];
        const sampleMap = new Array(width * height);
        for (let offset = 0; offset < pixels.length; offset += 4) {
          if (pixels[offset + 3] < 96) continue;
          const red = pixels[offset];
          const green = pixels[offset + 1];
          const blue = pixels[offset + 2];
          const light = (.2126 * red + .7152 * green + .0722 * blue) / 255;
          const sample = { red, green, blue, light, index: offset / 4 };
          samples.push(sample);
          sampleMap[sample.index] = sample;
          totalRed += red;
          totalGreen += green;
          totalBlue += blue;
          totalBrightness += light;
          count += 1;
        }
        if (!count) throw new Error("Image contains no opaque pixels");
        const average = [totalRed / count, totalGreen / count, totalBlue / count];
        const averageBrightness = totalBrightness / count;
        const information = (start, end) => {
          let total = 0;
          let totalSquared = 0;
          let edges = 0;
          let edgeCount = 0;
          let sampleCount = 0;
          for (let y = 0; y < height; y += 1) {
            for (let x = start; x < end; x += 1) {
              const sample = sampleMap[y * width + x];
              if (!sample) continue;
              total += sample.light;
              totalSquared += sample.light * sample.light;
              sampleCount += 1;
              const previousSample = x > start ? sampleMap[y * width + x - 1] : null;
              const above = y > 0 ? sampleMap[(y - 1) * width + x] : null;
              if (previousSample) { edges += Math.abs(sample.light - previousSample.light); edgeCount += 1; }
              if (above) { edges += Math.abs(sample.light - above.light); edgeCount += 1; }
            }
          }
          const mean = sampleCount ? total / sampleCount : 0;
          const variance = sampleCount ? Math.max(0, totalSquared / sampleCount - mean * mean) : 1;
          return Math.sqrt(variance) * .58 + (edgeCount ? edges / edgeCount : 1) * .42;
        };
        const zoneWidth = Math.max(1, Math.floor(width * .38));
        const leftInformation = information(0, zoneWidth);
        const rightInformation = information(width - zoneWidth, width);
        let safeArea = "center";
        if (leftInformation < rightInformation * .86) safeArea = "left";
        else if (rightInformation < leftInformation * .86) safeArea = "right";
        let focusWeight = 0;
        let focusX = 0;
        let focusY = 0;
        let accentWeight = 0;
        let accent = [0, 0, 0];
        const accentFamilies = Array.from({ length: 12 }, () => ({ weight: 0, red: 0, green: 0, blue: 0 }));
        for (const sample of samples) {
          const x = sample.index % width;
          const y = Math.floor(sample.index / width);
          const difference = Math.sqrt(
            (sample.red - average[0]) ** 2 +
            (sample.green - average[1]) ** 2 +
            (sample.blue - average[2]) ** 2,
          ) / 441.7;
          const saliency = .03 + difference ** 1.35;
          focusX += (x / Math.max(1, width - 1)) * saliency;
          focusY += (y / Math.max(1, height - 1)) * saliency;
          focusWeight += saliency;
          const max = Math.max(sample.red, sample.green, sample.blue);
          const min = Math.min(sample.red, sample.green, sample.blue);
          const saturation = max ? (max - min) / max : 0;
          const usableLight = 1 - Math.min(1, Math.abs(sample.light - .46) / .54);
          const weight = saturation ** 2 * (.15 + usableLight);
          accent[0] += sample.red * weight;
          accent[1] += sample.green * weight;
          accent[2] += sample.blue * weight;
          accentWeight += weight;
          if (saturation >= .18 && weight > 0) {
            const delta = max - min;
            let hue = 0;
            if (delta > 0) {
              if (max === sample.red) hue = ((sample.green - sample.blue) / delta) % 6;
              else if (max === sample.green) hue = (sample.blue - sample.red) / delta + 2;
              else hue = (sample.red - sample.green) / delta + 4;
              hue = (hue * 60 + 360) % 360;
            }
            const family = accentFamilies[Math.min(11, Math.floor(hue / 30))];
            family.weight += weight;
            family.red += sample.red * weight;
            family.green += sample.green * weight;
            family.blue += sample.blue * weight;
          }
        }
        const dominantFamily = accentFamilies.reduce((winner, family) => family.weight > winner.weight ? family : winner, accentFamilies[0]);
        const resolvedAccent = dominantFamily.weight > 1
          ? [dominantFamily.red, dominantFamily.green, dominantFamily.blue].map((channel) => Math.round(channel / dominantFamily.weight))
          : accentWeight > 1
            ? accent.map((channel) => Math.round(channel / accentWeight))
          : average.map((channel) => Math.round(channel));
        let resolvedFocusX = clamp(focusX / focusWeight);
        if (safeArea === "left") resolvedFocusX = Math.max(.64, resolvedFocusX);
        if (safeArea === "right") resolvedFocusX = Math.min(.36, resolvedFocusX);
        resolve({
          appearance: averageBrightness >= .58 ? "light" : "dark",
          accent: resolvedAccent,
          focusX: resolvedFocusX,
          focusY: clamp(focusY / focusWeight),
          aspect: image.naturalWidth / Math.max(1, image.naturalHeight),
          measured: true,
          luma: clamp(averageBrightness),
          safeArea,
        });
      } catch {
        resolve(defaultProfile);
      }
    };
    image.onerror = () => resolve(defaultProfile);
    image.src = artUrl;
  });

  const detectShellAppearance = () => {
    const root = document.documentElement;
    const body = document.body;
    const classes = `${root?.className || ""} ${body?.className || ""}`
      .toLowerCase()
      .replace(/\bdream-theme-(?:dark|light)\b/g, "");
    if (/\b(dark|electron-dark|theme-dark|appearance-dark)\b/.test(classes)) return "dark";
    if (/\b(light|electron-light|theme-light|appearance-light)\b/.test(classes)) return "light";

    const dataTheme = (
      root?.getAttribute?.("data-theme") ||
      root?.getAttribute?.("data-appearance") ||
      root?.getAttribute?.("data-color-mode") ||
      body?.getAttribute?.("data-theme") ||
      body?.getAttribute?.("data-appearance") ||
      ""
    ).toLowerCase();
    if (dataTheme.includes("dark")) return "dark";
    if (dataTheme.includes("light")) return "light";

    try {
      const hadSkin = root?.classList?.contains?.("codex-dream-skin");
      const savedSkinClasses = hadSkin
        ? ROOT_CLASSES.filter((className) => root.classList.contains(className))
        : [];
      samplingNativeShell = true;
      if (hadSkin) root.classList.remove(...ROOT_CLASSES);
      try {
        const colorScheme = getComputedStyle(root).colorScheme || "";
        if (colorScheme.includes("dark") && !colorScheme.includes("light")) return "dark";
        if (colorScheme.includes("light") && !colorScheme.includes("dark")) return "light";
      } finally {
        if (hadSkin) root.classList.add(...savedSkinClasses);
        observer?.takeRecords?.();
        samplingNativeShell = false;
      }
    } catch {
      samplingNativeShell = false;
    }
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {}
    return "light";
  };

  const clearSkinDom = () => {
    const root = document.documentElement;
    root?.classList.remove(...ROOT_CLASSES);
    clearLegacyTextOverrides(root);
    for (const property of ROOT_PROPERTIES) root?.style.removeProperty(property);
    document.querySelectorAll(".dream-home").forEach((node) => node.classList.remove("dream-home"));
    document.querySelectorAll(".dream-task").forEach((node) => node.classList.remove("dream-task"));
    document.querySelectorAll(".dream-home-shell").forEach((node) => node.classList.remove("dream-home-shell"));
    document.querySelectorAll(`.${HOME_UTILITY_CLASS}`).forEach((node) => node.classList.remove(HOME_UTILITY_CLASS));
    document.querySelectorAll('[data-codework-dream-surface="true"]').forEach((node) => {
      node.classList.remove("main-surface");
      node.removeAttribute("data-codework-dream-surface");
    });
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CHROME_ID)?.remove();
    document.getElementById(MOTION_ID)?.remove();
  };

  const applyProfile = (root) => {
    const focusX = config.focusX ?? profile.focusX;
    const focusY = config.focusY ?? profile.focusY;
    const appearance = config.appearance === "auto" ? detectShellAppearance() : config.appearance;
    const focus = focusX < .4 ? "left" : focusX > .6 ? "right" : "center";
    const safeArea = config.safeArea === "auto" ? (profile.safeArea ||
      (focus === "left" ? "right" : focus === "right" ? "left" : "center")) : config.safeArea;
    const taskMode = config.taskMode === "auto"
      ? profile.aspect >= 2.25 ? "banner" : "ambient"
      : config.taskMode;
    const accent = config.accent || `rgb(${profile.accent.join(" ")})`;
    const accentInk = luminance(...profile.accent) > .42 ? "rgb(26 24 28)" : "rgb(250 248 251)";
    root.classList.toggle("dream-theme-light", appearance === "light");
    root.classList.toggle("dream-theme-dark", appearance === "dark");
    clearLegacyTextOverrides(root);
    const customWallpaper = config.customWallpaper === true;
    const narrowArt = profile.measured && profile.aspect < 1.65;
    root.classList.toggle("dream-art-wide", profile.aspect >= 1.75);
    root.classList.toggle("dream-art-narrow", narrowArt);
    root.classList.toggle("dream-art-standard", profile.aspect < 1.75 && !narrowArt);
    root.classList.toggle("dream-art-custom-cover", customWallpaper);
    root.classList.toggle("dream-wallpaper-light", customWallpaper && profile.luma >= .58);
    for (const value of ["left", "center", "right"]) {
      root.classList.toggle(`dream-focus-${value}`, focus === value);
    }
    for (const value of ["left", "center", "right", "none"]) {
      root.classList.toggle(`dream-safe-${value}`, safeArea === value);
    }
    for (const value of ["ambient", "banner", "off"]) {
      root.classList.toggle(`dream-task-${value}`, taskMode === value);
    }
    root.style.setProperty("--dream-art", `url("${artUrl}")`);
    root.style.setProperty("--dream-art-position", `${Math.round(focusX * 100)}% ${Math.round(focusY * 100)}%`);
    root.style.setProperty("--dream-art-fit", customWallpaper || !narrowArt ? "cover" : "contain");
    root.style.setProperty("--dream-art-backdrop-fit", "cover");
    root.style.setProperty("--dream-focus-x", String(focusX));
    root.style.setProperty("--dream-focus-y", String(focusY));
    root.style.setProperty("--dream-accent", accent);
    root.style.setProperty("--dream-accent-ink", accentInk);
    root.style.setProperty("--dream-image-luma", profile.luma.toFixed(3));
    applyTuning(root);
  };

  const ensure = () => {
    if (window.__CODEX_DREAM_SKIN_DISABLED__) return;
    const root = document.documentElement;
    if (!root || !document.body) return;

    const shellMain = findShellMain();
    // The native left panel is removed from the DOM while collapsed. It is
    // optional chrome, not a prerequisite for the wallpaper/runtime surface.
    if (!shellMain) {
      // Codex replaces its main surface during a route transition. Keeping
      // the last completed frame avoids a visible reset of the toolbar while
      // the next surface is mounting.
      // A fresh install must still clear an old/stale root class instead of
      // masquerading as an active skin. A previous installed state identifies
      // a real route transition whose completed frame should remain visible.
      if (!previous?.installed) clearSkinDom();
      return;
    }

    // Current Codex builds use a generated MainContentSurface class.  Keep a
    // stable compatibility hook so Dream Skin's route, contrast and composer
    // selectors continue to target the real chat surface after a rebuild.
    shellMain.classList.add("main-surface");
    shellMain.setAttribute("data-codework-dream-surface", "true");

    root.classList.add("codex-dream-skin");
    applyProfile(root);

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || root).appendChild(style);
    }
    if (style.dataset.dreamVersion !== "4") {
      style.textContent = cssText;
      style.dataset.dreamVersion = "4";
    }
    applyMotion(root);

    const home = findStableHomeSurface();
    root.classList.toggle("dream-route-home", Boolean(home));
    root.classList.toggle("dream-route-task", !home);
    const mainCandidates = [...document.querySelectorAll(MAIN_SURFACE_SELECTOR)];
    for (const candidate of mainCandidates) {
      candidate.classList.toggle("dream-home", candidate === home);
      candidate.classList.toggle("dream-task", candidate !== home);
    }
    for (const candidate of document.querySelectorAll(".dream-home")) {
      if (candidate !== home) candidate.classList.remove("dream-home");
    }
    if (home && !mainCandidates.includes(home)) home.classList.add("dream-home");
    const utilityBars = new Set(home ? home.querySelectorAll('[class*="_homeUtilityBar_"]') : []);
    for (const candidate of document.querySelectorAll(`.${HOME_UTILITY_CLASS}`)) {
      if (!utilityBars.has(candidate)) candidate.classList.remove(HOME_UTILITY_CLASS);
    }
    for (const candidate of utilityBars) candidate.classList.add(HOME_UTILITY_CLASS);
    shellMain.classList.toggle("dream-home-shell", Boolean(home));

    let chrome = document.getElementById(CHROME_ID);
    if (!chrome || chrome.parentElement !== document.body) {
      chrome?.remove();
      chrome = document.createElement("div");
      chrome.id = CHROME_ID;
      chrome.setAttribute("role", "toolbar");
      chrome.setAttribute("aria-label", "Codework 外观透明度调节");
      document.body.appendChild(chrome);
    }
    // The Dream Skin toolbar is the only identity surface while a skin is active.
    // Remove the legacy launcher badge before it can overlap this centred toolbar.
    document.getElementById("codex-plus-menu")?.remove?.();
    // Keep client identity in the title-bar safe zone. The native header's
    // hashed class can match unrelated lower-page nodes after Codex rerenders;
    // measuring it was the source of the toolbar jumping to the bottom.
    chrome.style.removeProperty?.("--codework-dream-chrome-top");
    chrome.style.removeProperty?.("--codework-dream-chrome-left");
    chrome.classList.toggle("dream-home-shell", Boolean(home));
    if (chrome.dataset.dreamVersion !== "5") {
      chrome.innerHTML = `<span class="codework-dream-crown">♛</span><span>Codework AI客户端</span><span class="codework-dream-version">v${config.clientVersion}</span><span class="codework-dream-tuning"><label>首页<input data-dream-tuning="home" type="range" min="0" max="55" step="1" value="${Math.round(tuning.home)}" aria-label="首页透明度"><output>${Math.round(tuning.home)}%</output></label><label>对话<input data-dream-tuning="task" type="range" min="4" max="62" step="1" value="${Math.round(tuning.task)}" aria-label="对话透明度"><output>${Math.round(tuning.task)}%</output></label></span>`;
      chrome.innerHTML += `<label class="codework-dream-motion-control">动态<input data-dream-motion="toggle" type="checkbox" aria-label="动态壁纸"></label>`;
      chrome.dataset.dreamVersion = "5";
    }
    for (const input of chrome.querySelectorAll?.("input[data-dream-tuning]") || []) {
      if (input.dataset.dreamBound === "true") continue;
      input.dataset.dreamBound = "true";
      const key = input.dataset?.dreamTuning;
      input.min = "0";
      input.max = "18";
      input.step = "1";
      input.value = String(Math.round(tuning[key]));
      const initialOutput = input.parentElement?.querySelector?.("output");
      if (initialOutput) initialOutput.textContent = `${Math.round(tuning[key])}px`;
      input.addEventListener?.("input", () => {
        updateTuning(root, key, input.value);
        const output = input.parentElement?.querySelector?.("output");
        if (output) output.textContent = `${Math.round(tuning[key])}px`;
      });
    }
    const motionToggle = chrome.querySelector?.('input[data-dream-motion="toggle"]');
    if (motionToggle && motionToggle.dataset.dreamBound !== "true") {
      motionToggle.dataset.dreamBound = "true";
      motionToggle.checked = tuning.motion !== false;
      motionToggle.addEventListener?.("change", () => updateMotion(root, motionToggle.checked));
    }
  };

  const onVisibilityChange = () => {
    if (window[STATE_KEY]?.installToken !== installToken) return;
    applyMotion(document.documentElement);
  };

  const cleanup = () => {
    const state = window[STATE_KEY];
    if (state?.installToken !== installToken) return false;
    window.__CODEX_DREAM_SKIN_DISABLED__ = true;
    clearSkinDom();
    state?.observer?.disconnect();
    document.removeEventListener?.("visibilitychange", state?.onVisibilityChange);
    if (state?.timer) clearInterval(state.timer);
    if (state?.scheduler?.timeout) clearTimeout(state.scheduler.timeout);
    if (routeState.settleTimer) clearTimeout(routeState.settleTimer);
    if (state?.ownsArtUrl && state?.artUrl) URL.revokeObjectURL(state.artUrl);
    delete window[STATE_KEY];
    return true;
  };

  const scheduler = { timeout: null };
  const scheduleEnsure = () => {
    if (scheduler.timeout) clearTimeout(scheduler.timeout);
    scheduler.timeout = setTimeout(() => {
      scheduler.timeout = null;
      ensure();
    }, 180);
  };
  observer = new MutationObserver(() => {
    if (samplingNativeShell) return;
    scheduleEnsure();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "data-theme", "data-appearance", "data-color-mode"],
  });
  document.addEventListener?.("visibilitychange", onVisibilityChange);
  const timer = setInterval(ensure, 5000);
  window[STATE_KEY] = {
    ensure, cleanup, observer, timer, scheduler, artUrl, ownsArtUrl, profile, config, installToken, onVisibilityChange, installed: true, version: "1.2.1",
  };
  ensure();
  analyzeArt().then((result) => {
    const state = window[STATE_KEY];
    if (state?.installToken !== installToken || window.__CODEX_DREAM_SKIN_DISABLED__) return;
    profile = result;
    state.profile = result;
    ensure();
  });
  return { installed: true, version: "1.2.1", adaptive: true };
})(__DREAM_CSS_JSON__, __DREAM_ART_JSON__, __DREAM_THEME_JSON__)

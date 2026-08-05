export type ClientSkin = "blue" | "pink";

export const CLIENT_SKIN_STORAGE_KEY = "codework-manager-client-skin";

type ClientSkinVariables = Record<string, string>;

const BLUE_VARIABLES: ClientSkinVariables = {
  "--background": "210 56% 97%",
  "--foreground": "214 46% 17%",
  "--card": "210 55% 99%",
  "--card-foreground": "214 46% 17%",
  "--popover": "210 55% 99%",
  "--popover-foreground": "214 46% 17%",
  "--primary": "199 90% 60%",
  "--primary-foreground": "216 55% 10%",
  "--secondary": "208 42% 93%",
  "--secondary-foreground": "214 46% 17%",
  "--muted": "210 40% 94%",
  "--muted-foreground": "213 17% 42%",
  "--accent": "204 54% 91%",
  "--accent-foreground": "214 46% 17%",
  "--destructive": "0 72% 52%",
  "--destructive-foreground": "0 0% 98%",
  "--border": "208 35% 84%",
  "--input": "208 35% 84%",
  "--ring": "199 90% 60%",
  "--shell-bg": "218 42% 8%",
  "--sidebar-bg": "216 45% 11%",
  "--sidebar-muted": "216 33% 19%",
  "--sidebar-border": "213 34% 23%",
  "--surface-raised": "210 50% 99%",
  "--surface-sunken": "210 42% 95%",
  "--brand-accent": "199 90% 60%",
  "--reading-surface": "rgb(247 252 255 / 0.84)",
  "--reading-surface-strong": "rgb(255 255 255 / 0.94)",
  "--reading-text": "#13253a",
  "--chrome-surface": "rgb(236 247 255 / 0.80)",
  "--chrome-text": "#0e2238",
};

const PINK_VARIABLES: ClientSkinVariables = {
  "--background": "330 62% 97%",
  "--foreground": "326 38% 18%",
  "--card": "330 68% 99%",
  "--card-foreground": "326 38% 18%",
  "--popover": "330 68% 99%",
  "--popover-foreground": "326 38% 18%",
  "--primary": "334 88% 68%",
  "--primary-foreground": "336 48% 12%",
  "--secondary": "331 48% 94%",
  "--secondary-foreground": "326 38% 18%",
  "--muted": "330 42% 95%",
  "--muted-foreground": "327 18% 44%",
  "--accent": "328 64% 92%",
  "--accent-foreground": "326 38% 18%",
  "--destructive": "0 72% 57%",
  "--destructive-foreground": "0 0% 98%",
  "--border": "329 38% 86%",
  "--input": "329 38% 86%",
  "--ring": "334 88% 68%",
  "--shell-bg": "333 46% 9%",
  "--sidebar-bg": "335 48% 11%",
  "--sidebar-muted": "332 34% 20%",
  "--sidebar-border": "332 32% 25%",
  "--surface-raised": "330 58% 99%",
  "--surface-sunken": "330 44% 95%",
  "--brand-accent": "334 88% 68%",
  "--reading-surface": "rgb(255 248 252 / 0.84)",
  "--reading-surface-strong": "rgb(255 252 254 / 0.94)",
  "--reading-text": "#392033",
  "--chrome-surface": "rgb(255 240 248 / 0.80)",
  "--chrome-text": "#301727",
};

export function normalizeClientSkin(value: unknown): ClientSkin {
  return value === "pink" ? "pink" : "blue";
}

export function clientSkinVariables(skin: ClientSkin): ClientSkinVariables {
  return skin === "pink" ? PINK_VARIABLES : BLUE_VARIABLES;
}

export function readInitialClientSkin(storage: Pick<Storage, "getItem">): ClientSkin {
  return normalizeClientSkin(storage.getItem(CLIENT_SKIN_STORAGE_KEY));
}

import assert from "node:assert";
import { describe, it } from "node:test";
import { clientSkinVariables, normalizeClientSkin, readInitialClientSkin } from "./client-skin.ts";

describe("Codework client skin", () => {
  it("uses blue by default and accepts only the pink alternative", () => {
    assert.equal(normalizeClientSkin("pink"), "pink");
    assert.equal(normalizeClientSkin("blue"), "blue");
    assert.equal(normalizeClientSkin("anything-else"), "blue");
  });

  it("reads the persisted manager-only choice", () => {
    assert.equal(readInitialClientSkin({ getItem: () => "pink" }), "pink");
  });

  it("switches the complete manager colour system instead of only the accent", () => {
    const blue = clientSkinVariables("blue");
    const pink = clientSkinVariables("pink");

    for (const variable of ["--background", "--foreground", "--card", "--primary", "--sidebar-bg", "--shell-bg", "--border", "--muted-foreground", "--reading-surface", "--reading-surface-strong", "--reading-text", "--chrome-surface", "--chrome-text"]) {
      assert.ok(variable in blue, `blue is missing ${variable}`);
      assert.ok(variable in pink, `pink is missing ${variable}`);
      assert.notEqual(blue[variable], pink[variable], `${variable} must change with the selected client skin`);
    }
  });

  it("keeps content surfaces readable when the chrome skin is active", () => {
    const blue = clientSkinVariables("blue");
    const pink = clientSkinVariables("pink");

    // Cards, list rows and form fields inherit these semantic tokens.  They
    // must be a light reading layer rather than the dark chrome layer.
    assert.equal(blue["--background"], "210 56% 97%");
    assert.equal(blue["--card"], "210 55% 99%");
    assert.equal(blue["--surface-raised"], "210 50% 99%");
    assert.equal(blue["--foreground"], "214 46% 17%");

    assert.equal(pink["--background"], "330 62% 97%");
    assert.equal(pink["--card"], "330 68% 99%");
    assert.equal(pink["--surface-raised"], "330 58% 99%");
    assert.equal(pink["--foreground"], "326 38% 18%");
  });
});

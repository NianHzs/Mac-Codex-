import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const injectorPath = path.resolve(here, "../scripts/injector.mjs");
const themeDir = await mkdtemp(path.join(os.tmpdir(), "codework-dream-theme-"));
const pixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLJ0QAAAABJRU5ErkJggg==",
  "base64",
);

try {
  await writeFile(path.join(themeDir, "art.png"), pixelPng);
  await writeFile(path.join(themeDir, "theme.json"), JSON.stringify({
    id: "version-fixture",
    name: "Version fixture",
    image: "art.png",
    clientVersion: "1.3.64",
    appearance: "light",
    art: { focusX: 0.5, focusY: 0.5, safeArea: "left", taskMode: "ambient" },
  }));

  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [injectorPath, "--check-payload", "--theme-dir", themeDir], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });

  assert.equal(result.code, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.clientVersion, "1.3.64",
    "The theme clientVersion must survive loadTheme() and reach the renderer payload.");
} finally {
  await rm(themeDir, { recursive: true, force: true });
}

console.log("PASS: the injected Dream Skin payload retains the Codework client version.");

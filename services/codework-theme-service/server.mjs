import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const port = Number(process.env.PORT || 28080);
const rootDir = process.cwd();
const lotteryServiceUrl = (process.env.LOTTERY_MEMBER_SERVICE_URL || "http://115.190.199.191:20080").replace(/\/+$/, "");
const safeAssetName = (value) => typeof value === "string" && /^[a-z0-9][a-z0-9._-]{0,127}\.(png|jpe?g|webp)$/i.test(value);

function bearerToken(value) {
  const match = typeof value === "string" ? /^Bearer\s+(.+)$/i.exec(value.trim()) : null;
  return match?.[1]?.trim() || null;
}

function json(status, body, headers = {}) {
  return { status, body, contentType: "application/json; charset=utf-8", headers };
}

function imageContentType(fileName) {
  if (/\.png$/i.test(fileName)) return "image/png";
  if (/\.webp$/i.test(fileName)) return "image/webp";
  return "image/jpeg";
}

function themeForAsset(manifest, fileName) {
  return manifest.themes.find((theme) => theme.heroAsset === fileName || theme.previewAsset === fileName) || null;
}

export function createThemeService({ manifest, grants, verifyMember, readAsset }) {
  async function memberFor(authorization) {
    const token = bearerToken(authorization);
    if (!token) return null;
    return verifyMember(token);
  }

  async function handle({ method, url, authorization }) {
    const path = new URL(url, "http://localhost").pathname;
    if (method === "OPTIONS") return { status: 204, body: null, contentType: "text/plain", headers: { "Access-Control-Allow-Methods": "GET, OPTIONS" } };
    if (method === "GET" && path === "/health") return json(200, { status: "ok" });
    if (method !== "GET") return json(404, { status: "not_found" });

    const member = await memberFor(authorization);
    if (!member?.userId) return json(401, { status: "unauthorized" });
    const allowedThemeIds = Array.isArray(grants[member.userId]) ? grants[member.userId].filter((id) => typeof id === "string") : [];
    const cacheHeaders = { "Cache-Control": "private, max-age=300", Vary: "Authorization" };

    if (path === "/v1/themes/manifest") return json(200, { ...manifest, allowedThemeIds }, cacheHeaders);
    const assetMatch = /^\/v1\/themes\/assets\/([^/]+)$/.exec(path);
    if (!assetMatch) return json(404, { status: "not_found" });

    const fileName = decodeURIComponent(assetMatch[1]);
    if (!safeAssetName(fileName)) return json(404, { status: "not_found" });
    const theme = themeForAsset(manifest, fileName);
    if (!theme) return json(404, { status: "not_found" });
    if (theme.access === "restricted" && !allowedThemeIds.includes(theme.id)) return json(403, { status: "forbidden" });
    try {
      return { status: 200, body: await readAsset(fileName), contentType: imageContentType(fileName), headers: cacheHeaders };
    } catch {
      return json(404, { status: "not_found" });
    }
  }

  return { handle };
}

async function verifyRemoteMember(token) {
  try {
    const response = await fetch(`${lotteryServiceUrl}/api/client/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return null;
    const payload = await response.json();
    const userId = typeof payload?.user?.id === "string" ? payload.user.id.trim() : typeof payload?.userId === "string" ? payload.userId.trim() : "";
    return userId ? { userId } : null;
  } catch {
    return null;
  }
}

async function start() {
  const manifest = JSON.parse(await readFile(join(rootDir, "themes", "manifest.json"), "utf8"));
  const grants = JSON.parse(await readFile(join(rootDir, "themes", "grants.json"), "utf8"));
  const service = createThemeService({
    manifest,
    grants,
    verifyMember: verifyRemoteMember,
    readAsset: (fileName) => readFile(join(rootDir, "themes", "assets", fileName)),
  });
  createServer(async (request, response) => {
    const result = await service.handle({ method: request.method, url: request.url, authorization: request.headers.authorization });
    response.writeHead(result.status, { "Content-Type": result.contentType, "Access-Control-Allow-Origin": "*", ...result.headers });
    response.end(Buffer.isBuffer(result.body) ? result.body : result.body === null ? undefined : JSON.stringify(result.body));
  }).listen(port, "0.0.0.0", () => console.log(`Codework theme service listening on ${port}`));
}

if (process.argv[1] && new URL(import.meta.url).pathname === new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).pathname) {
  start().catch((error) => { console.error(error); process.exitCode = 1; });
}

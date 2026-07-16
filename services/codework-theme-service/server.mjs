import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const port = Number(process.env.PORT || 28080);
const manifestPath = join(process.cwd(), "themes", "manifest.json");

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=300",
    "Access-Control-Allow-Origin": "*",
  });
  response.end(JSON.stringify(payload));
}

createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" });
    response.end();
    return;
  }
  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }
  if (request.method === "GET" && request.url === "/v1/themes/manifest") {
    try {
      sendJson(response, 200, JSON.parse(await readFile(manifestPath, "utf8")));
    } catch {
      sendJson(response, 500, { status: "failed", message: "theme manifest unavailable" });
    }
    return;
  }
  sendJson(response, 404, { status: "not_found" });
}).listen(port, "0.0.0.0", () => console.log(`Codework theme service listening on ${port}`));

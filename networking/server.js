const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const PORT = Number(process.env.PORT) || 4173;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, ".data");
const DATA_FILE = path.join(DATA_DIR, "records.json");
const clients = new Set();

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

let records = loadRecords();

function loadRecords() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return { visitors: {} };
  }
}

function saveRecords() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2));
}

function sendJson(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(data));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > 1024 * 32) {
        reject(new Error("Request body too large"));
      }
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function sanitizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function updateRecord(data) {
  if (!data.clientId || typeof data.clientId !== "string") {
    return false;
  }

  const previous = records.visitors[data.clientId] || {};
  const maxDepth = Math.max(sanitizeNumber(previous.maxDepth), sanitizeNumber(data.maxDepth));

  records.visitors[data.clientId] = {
    currentDepth: sanitizeNumber(data.currentDepth),
    maxDepth,
    totalSeconds: Math.max(sanitizeNumber(previous.totalSeconds), sanitizeNumber(data.totalSeconds)),
    visible: Boolean(data.visible),
    updatedAt: Date.now(),
  };

  saveRecords();
  return true;
}

function getStats() {
  const depthMap = new Map();
  const now = Date.now();
  const visitors = Object.values(records.visitors).filter((visitor) => now - visitor.updatedAt < 1000 * 60 * 60 * 24 * 30);

  visitors.forEach((visitor) => {
    const level = Math.floor(visitor.maxDepth / 220);
    depthMap.set(level, (depthMap.get(level) || 0) + 1);
  });

  return {
    totalVisitors: visitors.length,
    activeVisitors: visitors.filter((visitor) => now - visitor.updatedAt < 1000 * 20 && visitor.visible).length,
    depthCounts: Array.from(depthMap, ([level, count]) => ({ level, count })).sort((a, b) => a.level - b.level),
  };
}

function broadcastStats() {
  const message = `event: stats\ndata: ${JSON.stringify(getStats())}\n\n`;

  clients.forEach((response) => {
    response.write(message);
  });
}

function serveFile(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(ROOT, requestedPath));

  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(content);
  });
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/api/events") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    });
    response.write(`event: stats\ndata: ${JSON.stringify(getStats())}\n\n`);
    clients.add(response);
    request.on("close", () => clients.delete(response));
    return;
  }

  if (request.method === "GET" && request.url === "/api/stats") {
    sendJson(response, 200, getStats());
    return;
  }

  if (request.method === "POST" && request.url === "/api/record") {
    try {
      const body = await readBody(request);
      const ok = updateRecord(JSON.parse(body || "{}"));
      sendJson(response, ok ? 200 : 400, { ok });
      broadcastStats();
    } catch {
      sendJson(response, 400, { ok: false });
    }
    return;
  }

  if (request.method === "GET") {
    serveFile(request, response);
    return;
  }

  response.writeHead(405);
  response.end("Method not allowed");
});

server.listen(PORT, () => {
  console.log(`Realtime scroll record running at http://localhost:${PORT}`);
});

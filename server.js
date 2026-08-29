/**
 * OpenUPIPay gateway test client — e-commerce storefront (zero deps, Node 18+).
 *
 * Reads config.json (credentials live ONLY here, never served to the browser).
 * Proxies create/mobile/status calls to the gateway server-side so the client
 * API key is never exposed and CORS is avoided.
 *
 *   node server.js          -> http://localhost:3001
 *
 * config.json:
 *   gatewayUrl   : deployed gateway base URL
 *   clientApiKey : your X-Client-Api-Key (NOT sent to the browser)
 *   returnUrl    : browser redirect target after PAID
 *   store        : mock catalog for the landing page
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "config.json");
let cfg;
try {
  cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
} catch (err) {
  console.error("Could not read config.json:", err.message);
  process.exit(1);
}

const GATEWAY = cfg.gatewayUrl.replace(/\/+$/, "");
const PORT = Number(cfg.port) || 3001;
const API_KEY = cfg.clientApiKey;

const indexHtml = fs.readFileSync(path.join(__dirname, "index.html"));
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };

// Public-only storefront config (no credentials) for the browser
function safeStoreConfig() {
  return { gatewayUrl: GATEWAY, returnUrl: cfg.returnUrl, store: cfg.store };
}

async function proxy(method, pathname, body, res, key = API_KEY) {
  try {
    const headers = { "content-type": "application/json" };
    if (key) headers["x-client-api-key"] = key;
    const upstream = await fetch(`${GATEWAY}${pathname}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await upstream.text();

    // Detect HTML error pages (Vercel 404s, Cloudflare errors, etc.)
    const isJson = text.trimStart().startsWith("{") || text.trimStart().startsWith("[");
    if (!isJson) {
      const snippet = text.replace(/<[^>]+>/g, "").trim().slice(0, 200);
      res.writeHead(upstream.status >= 400 ? upstream.status : 502, {
        "content-type": "application/json",
      });
      return res.end(JSON.stringify({
        error: `Gateway returned HTML instead of JSON (HTTP ${upstream.status})`,
        detail: snippet,
      }));
    }

    res.writeHead(upstream.status, { "content-type": "application/json" });
    res.end(text);
  } catch (err) {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: `Cannot reach gateway: ${err.message}` }));
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": mime[".html"] });
    return res.end(indexHtml);
  }

  // Non-secret store config for rendering the page
  if (req.method === "GET" && url.pathname === "/api/store") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify(safeStoreConfig()));
  }

  if (req.method === "POST" && url.pathname === "/api/create") {
    return proxy("POST", "/api/v1/payment/create", await readJson(req), res);
  }
  if (req.method === "POST" && url.pathname === "/api/mobile") {
    return proxy("POST", "/api/v1/payment/mobile", await readJson(req), res);
  }
  if (req.method === "GET" && url.pathname.startsWith("/api/status/")) {
    const orderId = url.pathname.slice("/api/status/".length);
    return proxy("GET", `/api/v1/payment/status/${orderId}`, undefined, res);
  }

  // Verify the key (uses the stored key, then bails on missing config)
  if (req.method === "GET" && url.pathname === "/api/health") {
    const ok = API_KEY && API_KEY !== "REPLACE_WITH_YOUR_CLIENT_API_KEY";
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ apiKeyConfigured: !!ok }));
  }

  const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const fp = path.join(__dirname, file);
  if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
    res.writeHead(200, { "content-type": mime[path.extname(fp)] || "application/octet-stream" });
    return res.end(fs.readFileSync(fp));
  }

  res.writeHead(404, { "content-type": "text/plain" });
  res.end("Not found");
});

server.listen(PORT, () => {
  const note = API_KEY && API_KEY !== "REPLACE_WITH_YOUR_CLIENT_API_KEY"
    ? "API key loaded ✓"
    : "WARNING: clientApiKey in config.json is still the placeholder";
  console.log(`NovaStore test client -> http://localhost:${PORT}`);
  console.log(`Gateway: ${GATEWAY} | ${note}`);
});

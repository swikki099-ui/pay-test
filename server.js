/**
 * OpenUpIPay Gateway — local test client (zero dependencies, Node 18+).
 *
 * Serves a browser page and proxies every on-screen action to the deployed
 * gateway. Proxying server-side avoids CORS entirely and keeps the API key
 * out of the browser (it is sent from the server, not from the page).
 *
 *   node server.js                 -> http://localhost:3001
 *
 * Env:
 *   GATEWAY_URL  default https://open-upi-pay.vercel.app
 *   PORT         default 3001
 *   API_KEY      optional default key (can also be typed in the UI)
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const GATEWAY = process.env.GATEWAY_URL || "https://open-upi-pay.vercel.app";
const PORT = Number(process.env.PORT) || 3001;

const indexHtml = fs.readFileSync(path.join(__dirname, "index.html"));
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };

async function proxy(method, pathname, headers, body, key, res) {
  try {
    const url = `${GATEWAY}${pathname}`;
    const upstream = await fetch(url, {
      method,
      headers: {
        "content-type": "application/json",
        ...(key ? { "x-client-api-key": key } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await upstream.text();
    res.writeHead(upstream.status, { "content-type": "application/json" });
    res.end(text);
  } catch (err) {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: `Cannot reach gateway: ${err.message}` }));
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const apiKey = req.headers["x-client-api-key"];

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": mime[".html"] });
    return res.end(indexHtml);
  }

  if (req.method === "POST" && url.pathname === "/api/create") {
    const body = await readJson(req);
    return proxy("POST", "/api/v1/payment/create", {}, body, apiKey || body?.apiKey, res);
  }

  if (req.method === "POST" && url.pathname === "/api/mobile") {
    const body = await readJson(req);
    return proxy("POST", "/api/v1/payment/mobile", {}, body, null, res);
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/status/")) {
    const orderId = url.pathname.slice("/api/status/".length);
    return proxy("GET", `/api/v1/payment/status/${orderId}`, {}, undefined, null, res);
  }

  // static file fallback
  const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const fp = path.join(__dirname, file);
  if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
    const ext = path.extname(fp);
    res.writeHead(200, { "content-type": mime[ext] || "application/octet-stream" });
    return res.end(fs.readFileSync(fp));
  }

  res.writeHead(404, { "content-type": "text/plain" });
  res.end("Not found");
});

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

server.listen(PORT, () => {
  console.log(`OpenOpenUPI Gateway test client -> http://localhost:${PORT}`);
  console.log(`Proxying to gateway: ${GATEWAY}`);
});

/**
 * OpenUPIPay Gateway Test Client — Modern E-Commerce Storefront Server
 * Zero dependencies (Node.js 18+ built-in http & fetch).
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "config.json");
let cfg = {};

function loadConfig() {
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch (err) {
    console.error("[Config] Error reading config.json:", err.message);
    cfg = {
      gatewayUrl: "https://pay-pl92.onrender.com",
      port: 3001,
      clientApiKey: "client_k_66a939d14c03b80e562daf5ea3fc4d1d",
      deviceSecret: "device_k_130fe5fa89f84f83a6e46cd18f8a25fc",
      returnUrl: "http://localhost:3001/order-success",
      store: { name: "ApexStore", products: [] }
    };
  }
  return cfg;
}
loadConfig();

function getGateway() {
  return (cfg.gatewayUrl || "https://pay-pl92.onrender.com").replace(/\/+$/, "");
}
function getApiKey() {
  return cfg.clientApiKey || "";
}
function getDeviceSecret() {
  return cfg.deviceSecret || "";
}
const PORT = Number(cfg.port) || 3001;

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon"
};

function safeStoreConfig() {
  loadConfig();
  const gateway = getGateway();
  const apiKey = getApiKey();
  const devSec = getDeviceSecret();
  return {
    gatewayUrl: gateway,
    returnUrl: cfg.returnUrl || `http://localhost:${PORT}/order-success`,
    store: cfg.store || {},
    hasApiKey: Boolean(apiKey && !apiKey.includes("REPLACE")),
    hasDeviceSecret: Boolean(devSec && !devSec.includes("REPLACE"))
  };
}

async function proxyGateway(method, pathname, body, res, customHeaders = {}) {
  loadConfig();
  const gateway = getGateway();
  const apiKey = getApiKey();
  try {
    const headers = { "content-type": "application/json", ...customHeaders };
    if (apiKey && !headers["x-client-api-key"] && !headers["x-device-secret"]) {
      headers["x-client-api-key"] = apiKey;
    }

    const upstream = await fetch(`${gateway}${pathname}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    const text = await upstream.text();
    const isJson = text.trimStart().startsWith("{") || text.trimStart().startsWith("[");

    if (!isJson) {
      const snippet = text.replace(/<[^>]+>/g, "").trim().slice(0, 300);
      res.writeHead(upstream.status >= 400 ? upstream.status : 502, {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*"
      });
      return res.end(
        JSON.stringify({
          success: false,
          error: `Gateway returned HTTP ${upstream.status} (non-JSON response)`,
          detail: snippet || "Check if OpenUpiPay gateway server is running."
        })
      );
    }

    res.writeHead(upstream.status, {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*"
    });
    res.end(text);
  } catch (err) {
    res.writeHead(502, {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*"
    });
    res.end(
      JSON.stringify({
        success: false,
        error: `Cannot reach OpenUpiPay gateway at ${gateway}: ${err.message}`,
        hint: `Make sure the gateway server is reachable at ${gateway}`
      })
    );
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Client-Api-Key");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  // 1. Storefront Home Page
  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    const indexPath = path.join(__dirname, "index.html");
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { "content-type": mime[".html"] });
      return res.end(fs.readFileSync(indexPath));
    }
  }

  // 2. Order Success Page
  if (req.method === "GET" && url.pathname === "/order-success") {
    const indexPath = path.join(__dirname, "index.html");
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { "content-type": mime[".html"] });
      return res.end(fs.readFileSync(indexPath));
    }
  }

  // 3. Storefront config API
  if (req.method === "GET" && url.pathname === "/api/store") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify(safeStoreConfig()));
  }

  // 4. Health / connectivity check
  if (req.method === "GET" && url.pathname === "/api/health") {
    loadConfig();
    const gateway = getGateway();
    const apiKey = getApiKey();
    try {
      const probe = await fetch(`${gateway}/api/v1/payment/status/00000000-0000-0000-0000-000000000000`, {
        headers: { "x-client-api-key": apiKey }
      });
      const reachable = probe.status === 404 || probe.status === 200 || probe.status === 400;
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(
        JSON.stringify({
          ok: true,
          gatewayUrl: gateway,
          reachable,
          apiKeyConfigured: Boolean(apiKey && !apiKey.includes("REPLACE"))
        })
      );
    } catch (e) {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(
        JSON.stringify({
          ok: false,
          gatewayUrl: gateway,
          reachable: false,
          error: e.message,
          apiKeyConfigured: Boolean(apiKey && !apiKey.includes("REPLACE"))
        })
      );
    }
  }

  // 5. Create Payment Order
  if (req.method === "POST" && url.pathname === "/api/create") {
    const body = await readJson(req);
    return proxyGateway("POST", "/api/v1/payment/create", body, res);
  }

  // 6. Mobile number association
  if (req.method === "POST" && url.pathname === "/api/mobile") {
    const body = await readJson(req);
    return proxyGateway("POST", "/api/v1/payment/mobile", body, res);
  }

  // 7. Order Status Polling
  if (req.method === "GET" && url.pathname.startsWith("/api/status/")) {
    const orderId = url.pathname.slice("/api/status/".length);
    return proxyGateway("GET", `/api/v1/payment/status/${orderId}`, undefined, res);
  }

  // 8. Submit manual UTR
  if (req.method === "POST" && url.pathname === "/api/submit-utr") {
    const body = await readJson(req);
    return proxyGateway("POST", "/api/v1/payment/submit-utr", body, res);
  }

  // 9. OCR Receipt Upload
  if (req.method === "POST" && url.pathname === "/api/ocr-upload") {
    const body = await readJson(req);
    return proxyGateway("POST", "/api/v1/payment/ocr-upload", body, res);
  }

  // 10. Sandbox/Test Simulator — Instantly trigger payment verification for testing
  if (req.method === "POST" && url.pathname === "/api/simulate-payment") {
    try {
      loadConfig();
      const gateway = getGateway();
      const devSec = getDeviceSecret();
      const body = await readJson(req);
      const { dynamicAmount, orderId, orderIdExt } = body;

      if (!dynamicAmount) {
        res.writeHead(400, { "content-type": "application/json" });
        return res.end(JSON.stringify({ success: false, error: "dynamicAmount is required" }));
      }

      // Generate a mock 12-digit UTR
      const mockUtr = "9" + Math.floor(10000000000 + Math.random() * 90000000000).toString().slice(0, 11);
      const parsedAmount = Number(dynamicAmount);

      const smsPayload = {
        amount: parsedAmount,
        utr: mockUtr,
        rawText: `Dear UPI user, A/C credited with Rs.${parsedAmount.toFixed(2)} on ${new Date().toLocaleDateString("en-GB")} by UPI Ref ${mockUtr}`,
        sender: "AX-HDFCBK-T",
        deviceName: "Sandbox-Simulator"
      };

      const upstream = await fetch(`${gateway}/api/v1/webhook/sms`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-device-secret": devSec || "device_k_130fe5fa89f84f83a6e46cd18f8a25fc"
        },
        body: JSON.stringify(smsPayload)
      });

      const responseData = await upstream.json().catch(() => ({}));
      res.writeHead(upstream.status, { "content-type": "application/json" });
      return res.end(JSON.stringify({
        success: upstream.ok && responseData.success,
        simulatedUtr: mockUtr,
        simulatedAmount: parsedAmount,
        gatewayResponse: responseData
      }));
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json" });
      return res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  // Static file fallback
  const requestedFile = url.pathname.slice(1);
  const filePath = path.join(__dirname, requestedFile);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { "content-type": mime[ext] || "application/octet-stream" });
    return res.end(fs.readFileSync(filePath));
  }

  res.writeHead(404, { "content-type": "text/plain" });
  res.end("404 Not Found");
});

server.listen(PORT, () => {
  const gateway = getGateway();
  const apiKey = getApiKey();
  console.log(`\n======================================================`);
  console.log(`  ApexStore Test Storefront running at:`);
  console.log(`  ➜  Local:    http://localhost:${PORT}`);
  console.log(`  ➜  Gateway:  ${gateway}`);
  console.log(`  ➜  API Key:  ${apiKey ? "Loaded (" + apiKey.slice(0, 12) + "...) ✓" : "Missing ❌"}`);
  console.log(`======================================================\n`);
});

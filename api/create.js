const GATEWAY = (process.env.GATEWAY_URL || "https://pay-pl92.onrender.com").replace(/\/+$/, "");
const API_KEY = process.env.CLIENT_API_KEY || "client_k_66a939d14c03b80e562daf5ea3fc4d1d";

module.exports = async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Client-Api-Key");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const upstream = await fetch(`${GATEWAY}/api/v1/payment/create`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-client-api-key": API_KEY
      },
      body: JSON.stringify(body)
    });

    const text = await upstream.text();
    try {
      const json = JSON.parse(text);
      return res.status(upstream.status).json(json);
    } catch (e) {
      return res.status(upstream.status >= 400 ? upstream.status : 502).json({
        success: false,
        error: `Gateway returned non-JSON (${upstream.status})`,
        detail: text.slice(0, 200)
      });
    }
  } catch (err) {
    return res.status(502).json({
      success: false,
      error: `Cannot reach gateway: ${err.message}`
    });
  }
};

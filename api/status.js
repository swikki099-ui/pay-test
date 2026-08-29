const GATEWAY = (process.env.GATEWAY_URL || "https://pay-pl92.onrender.com").replace(/\/+$/, "");
const API_KEY = process.env.CLIENT_API_KEY || "client_k_66a939d14c03b80e562daf5ea3fc4d1d";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Client-Api-Key");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const orderId = req.query.orderId || req.url.split("/").pop().split("?")[0];
  if (!orderId) {
    return res.status(400).json({ success: false, error: "Missing orderId" });
  }

  try {
    const upstream = await fetch(`${GATEWAY}/api/v1/payment/status/${orderId}`, {
      headers: { "x-client-api-key": API_KEY }
    });
    const text = await upstream.text();
    try {
      const json = JSON.parse(text);
      return res.status(upstream.status).json(json);
    } catch (e) {
      return res.status(upstream.status).send(text);
    }
  } catch (err) {
    return res.status(502).json({ success: false, error: err.message });
  }
};

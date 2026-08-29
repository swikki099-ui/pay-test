# OpenUPIPay — Test Client (e-commerce storefront)

A local, zero-dependency gateway test client that looks like a real online store.
Buy a product, pay the exact dynamic-amount UPI QR, and watch the order get
confirmed the moment the agent detects the payment.

## Setup (one time)

1. Open `config.json` and fill in your real values:

   ```jsonc
   {
     "gatewayUrl": "https://open-upi-pay.vercel.app",
     "port": 3001,
     "clientApiKey": "<YOUR X-Client-Api-Key HERE>",   // <-- your gateway client key
     "returnUrl": "http://localhost:3001/order-success",
     "store": { "name": "NovaStore", "products": [ ... ] }
   }
   ```

   > **Security:** `config.json` holds your client API key. It is read only by
   > `server.js` and is **never** sent to the browser — the page shows the
   > storefront, but all gateway calls happen server-side.

2. Start it:

   ```powershell
   cd "C:\Users\divya\Downloads\Test Upi Gateway"
   node server.js
   ```

3. Open **http://localhost:3001**

## How to test the full gateway flow

1. Pick a product → **Buy Now**
2. Enter your mobile number → **Proceed to Pay**
3. A QR + the exact **dynamic amount** appear. Pay that exact amount with any
   UPI app (or tap **Open**, or use the **Hosted checkout** link).
4. The page polls the gateway every 3s. When the agent confirms the txn, it
   flips to **PAID** and shows the success screen. If a `returnUrl` is set, the
   browser would redirect there as the gateway would for a real checkout.

## Endpoints the server exposes (browser-safe)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/store` | Storefront config (no credentials) |
| GET | `/api/health` | `{ apiKeyConfigured }` sanity check |
| POST | `/api/create` | Proxy → `POST /api/v1/payment/create` |
| POST | `/api/mobile` | Proxy → `POST /api/v1/payment/mobile` |
| GET | `/api/status/:orderId` | Proxy → `GET /api/v1/payment/status/:orderId` |

## Requirements

- Node.js 18+ (global `fetch`). No npm install needed.

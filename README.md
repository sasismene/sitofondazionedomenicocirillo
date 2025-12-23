# Merch site (Node.js) with PayPal Checkout + Payouts

This project serves a simple merch page and a Node.js backend that:
- creates PayPal Orders and captures them
- optionally uses PayPal Payouts to forward captured funds to a configured receiver
- persists order data in `order.db` (SQLite)

Environment variables:
- `PAYPAL_CLIENT_ID` (required)
- `PAYPAL_SECRET` (required)
- `PAYPAL_ENV` (optional, default `sandbox`, set to `live` for production)
- `PAYPAL_PAYOUT_RECEIVER` (optional, an email to send Payouts to)
- `CURRENCY` (optional, default `EUR`)

Quick start (PowerShell):

```powershell
$env:PAYPAL_CLIENT_ID = 'your-sandbox-client-id'
$env:PAYPAL_SECRET = 'your-sandbox-secret'
# optional: $env:PAYPAL_PAYOUT_RECEIVER = 'receiver@example.com'
npm install
npm start
```

Open http://localhost:5000/merch/index.html

The server will create `order.db` on first run and expose these endpoints:
- `GET /api/config` — returns `paypalClientId` and `currency`
- `POST /api/create-order` — create a PayPal order (body: `{ total, currency }`)
- `POST /api/capture-order` — capture and store an order (body: `{ orderID, name, address, items, pieces }`)
- `GET /orders` — list saved orders

Notes:
- For sandbox testing use sandbox credentials and keep `PAYPAL_ENV` unset or set to `sandbox`.
- PayPal Payouts requires that your account has Payouts permissions enabled; payouts will only run if `PAYPAL_PAYOUT_RECEIVER` is configured.

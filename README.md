# Merch page + serverless order saving

This repository includes a demo merch page and a Node serverless endpoint that saves orders into `order.db`.

Quick summary
- Frontend: [merch/index.html](merch/index.html) — uses the PayPal JavaScript SDK. Replace `YOUR_PAYPAL_CLIENT_ID` in the script URL.
- Backend: `api/save-order/index.js` — Node handler that writes order rows into `order.db` using `better-sqlite3`.

Notes on hosting
- GitHub Pages serves only static files and cannot run the Node backend. Host the frontend on GitHub Pages and deploy the backend (the `api` folder) to a Node-capable serverless platform such as Vercel or Render.

Deploying to Vercel (recommended)
1. Install dependencies locally: `npm install`.
2. Push to a GitHub repo connected to Vercel.
3. Deploy the project on Vercel — the `api/save-order` file will become an endpoint at `/api/save-order` and create `order.db` in the function's writable filesystem during runtime (note ephemeral filesystem on some hosts).

Security & PayPal
- Do not embed a secret access token in client-side code.
- Use your PayPal client id in `merch/index.html` by replacing `YOUR_PAYPAL_CLIENT_ID` with your value.

Persistence
- The endpoint writes `order.db` next to the project root when executed on a server that allows writing to the filesystem. For long-term persistence, use a managed DB (Postgres, MySQL, or a hosted SQLite file store) or push the DB to persistent storage.

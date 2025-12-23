const express = require('express');
const fetch = require('node-fetch');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');

const BASE_DIR = __dirname;
const DB_PATH = path.join(BASE_DIR, 'order.db');

const PAYPAL_ENV = process.env.PAYPAL_ENV || 'sandbox';
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
const PAYPAL_SECRET = process.env.PAYPAL_SECRET || '';
const PAYPAL_PAYOUT_RECEIVER = process.env.PAYPAL_PAYOUT_RECEIVER || ''; // receiver email for payouts (optional)
const CURRENCY = process.env.CURRENCY || 'EUR';

const PAYPAL_API = PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

const app = express();
app.use(cors());
app.use(bodyParser.json());

function initDb() {
  const db = new sqlite3.Database(DB_PATH);
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paypal_order_id TEXT,
      name TEXT,
      address TEXT,
      items TEXT,
      pieces INTEGER,
      status TEXT,
      created_at TEXT
    )`);
  });
  db.close();
}

async function getAccessToken() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_SECRET) throw new Error('PAYPAL_CLIENT_ID and PAYPAL_SECRET must be set');
  const tokenUrl = `${PAYPAL_API}/v1/oauth2/token`;
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64');
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Failed to get PayPal token: ' + txt);
  }
  const data = await res.json();
  return data.access_token;
}

app.get('/api/config', (req, res) => {
  res.json({ paypalClientId: PAYPAL_CLIENT_ID, currency: CURRENCY, env: PAYPAL_ENV });
});

app.post('/api/create-order', async (req, res) => {
  try {
    const { total, currency } = req.body;
    const amt = Number(total).toFixed(2);
    const cur = currency || CURRENCY;
    const token = await getAccessToken();
    const url = `${PAYPAL_API}/v2/checkout/orders`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'CAPTURE', purchase_units: [{ amount: { currency_code: cur, value: amt } }] })
    });
    const j = await r.json();
    res.json(j);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/capture-order', async (req, res) => {
  try {
    const { orderID, name, address, items = [], pieces = 1 } = req.body;
    if (!orderID) return res.status(400).json({ error: 'orderID required' });
    const token = await getAccessToken();
    const url = `${PAYPAL_API}/v2/checkout/orders/${orderID}/capture`;
    const r = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } });
    const capture = await r.json();

    // persist to sqlite
    const db = new sqlite3.Database(DB_PATH);
    const stmt = db.prepare('INSERT INTO orders (paypal_order_id, name, address, items, pieces, status, created_at) VALUES (?,?,?,?,?,?,?)');
    stmt.run(orderID, name || '', address || '', JSON.stringify(items), pieces || 1, (capture.status) ? capture.status : 'UNKNOWN', new Date().toISOString());
    stmt.finalize();
    db.close();

    // Optionally attempt a Payout to receiver (if configured)
    let payoutResult = null;
    if (PAYPAL_PAYOUT_RECEIVER) {
      try {
        const transactionAmount = capture.purchase_units && capture.purchase_units[0] && capture.purchase_units[0].payments && capture.purchase_units[0].payments.captures && capture.purchase_units[0].payments.captures[0] && capture.purchase_units[0].payments.captures[0].amount && capture.purchase_units[0].payments.captures[0].amount.value ? capture.purchase_units[0].payments.captures[0].amount.value : null;
        const currency = capture.purchase_units && capture.purchase_units[0] && capture.purchase_units[0].amount && capture.purchase_units[0].amount.currency_code ? capture.purchase_units[0].amount.currency_code : CURRENCY;
        if (transactionAmount) {
          const payoutUrl = `${PAYPAL_API}/v1/payments/payouts`;
          const sender_batch_id = `batch_${Date.now()}`;
          const payoutBody = {
            sender_batch_header: {
              sender_batch_id,
              email_subject: 'You have a payout'
            },
            items: [
              {
                recipient_type: 'EMAIL',
                amount: { value: transactionAmount, currency },
                receiver: PAYPAL_PAYOUT_RECEIVER,
                note: 'Payout for merch purchase',
                sender_item_id: `item_${Date.now()}`
              }
            ]
          };
          const pr = await fetch(payoutUrl, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payoutBody) });
          payoutResult = await pr.json();
        }
      } catch (pe) {
        payoutResult = { error: pe.message };
      }
    }

    res.json({ capture, payout: payoutResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/orders', (req, res) => {
  const db = new sqlite3.Database(DB_PATH);
  db.all('SELECT id, paypal_order_id, name, address, items, pieces, status, created_at FROM orders ORDER BY id DESC', [], (err, rows) => {
    db.close();
    if (err) return res.status(500).json({ error: err.message });
    const orders = rows.map(r => ({ ...r, items: JSON.parse(r.items) }));
    res.json(orders);
  });
});

// serve static files (index and merch folder)
app.use('/', express.static(BASE_DIR));

const PORT = process.env.PORT || 5000;
initDb();
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

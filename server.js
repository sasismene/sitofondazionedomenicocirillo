require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(express.json());

const DB_PATH = path.join(__dirname,'order.db');
const db = new sqlite3.Database(DB_PATH);

// Initialize table
db.serialize(()=>{
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    address TEXT,
    items TEXT,
    total REAL,
    status TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    paypal_order_id TEXT,
    paypal_capture TEXT
  )`);
});

const PAYPAL_ENV = process.env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox';
const PAYPAL_BASE = PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
const PAYPAL_CLIENT = process.env.PAYPAL_CLIENT_ID || '';
const PAYPAL_SECRET = process.env.PAYPAL_SECRET || '';

async function getPayPalToken(){
  const creds = Buffer.from(`${PAYPAL_CLIENT}:${PAYPAL_SECRET}`).toString('base64');
  const r = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`,{
    method:'POST',
    headers:{ 'Authorization':`Basic ${creds}`, 'Content-Type':'application/x-www-form-urlencoded' },
    body:'grant_type=client_credentials'
  });
  if(!r.ok) throw new Error('Unable to fetch PayPal token');
  const j = await r.json();
  return j.access_token;
}

app.post('/api/orders', async (req,res)=>{
  try{
    const { customerName, address, items, total } = req.body;
    if(!customerName || !address || !items || !items.length) return res.status(400).json({error:'Invalid order'});

    // insert local order
    const itemsJson = JSON.stringify(items);
    db.run(`INSERT INTO orders (name,address,items,total,status) VALUES (?,?,?,?,?)`, [customerName,address,itemsJson,total,'pending'], function(err){
      if(err) return res.status(500).json({error:'db error'});
      const localId = this.lastID;

      (async ()=>{
        try{
          const token = await getPayPalToken();
          const returnUrl = `${req.protocol}://${req.get('host')}/merch/paypal-complete.html?local=${localId}`;
          const cancelUrl = `${req.protocol}://${req.get('host')}/merch/index.html`;
          const orderBody = {
            intent: 'CAPTURE',
            purchase_units: [{ amount: { currency_code: 'EUR', value: total.toFixed ? total.toFixed(2) : String(total) } }],
            application_context: { return_url: returnUrl, cancel_url: cancelUrl }
          };

          const createRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`,{
            method:'POST',
            headers:{ 'Authorization':`Bearer ${token}`, 'Content-Type':'application/json' },
            body: JSON.stringify(orderBody)
          });
          if(!createRes.ok){
            const txt = await createRes.text();
            console.error('PayPal order create failed',txt);
            return res.status(500).json({error:'paypal create failed'});
          }
          const createJson = await createRes.json();
          const paypalOrderId = createJson.id;
          // update local order with paypal id
          db.run(`UPDATE orders SET paypal_order_id = ? WHERE id = ?`, [paypalOrderId, localId]);

          const approve = (createJson.links||[]).find(l=>l.rel==='approve');
          return res.json({ approvalUrl: approve ? approve.href : null, localOrderId: localId });
        }catch(err){
          console.error(err); return res.status(500).json({error:'paypal error'});
        }
      })();
    });
  }catch(err){ console.error(err); res.status(500).json({error:'server error'}); }
});

app.post('/api/capture', async (req,res)=>{
  try{
    const { paypalOrderId, localOrderId } = req.body;
    if(!paypalOrderId || !localOrderId) return res.status(400).json({error:'missing params'});
    const token = await getPayPalToken();
    const r = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${paypalOrderId}/capture`,{
      method:'POST', headers:{ 'Authorization':`Bearer ${token}`, 'Content-Type':'application/json' }
    });
    if(!r.ok){ const t = await r.text(); console.error('capture failed',t); return res.status(500).json({error:'capture failed'}); }
    const j = await r.json();
    db.run(`UPDATE orders SET status = ?, paypal_capture = ? WHERE id = ?`, ['done', JSON.stringify(j), localOrderId]);
    return res.json({ ok:true, capture:j });
  }catch(err){ console.error(err); res.status(500).json({error:'server error'}); }
});

// serve merch static files for convenience
app.use('/merch', express.static(path.join(__dirname,'merch')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log(`Server running on http://localhost:${PORT} (PayPal env: ${PAYPAL_ENV})`));

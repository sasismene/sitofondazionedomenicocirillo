const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function ensureJSONBody(req, cb) {
  if (req.body) return cb(null, req.body);
  let data = '';
  req.on('data', chunk => data += chunk);
  req.on('end', () => {
    try { cb(null, JSON.parse(data || '{}')); }
    catch(e){ cb(e); }
  });
}

module.exports = async function (req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  ensureJSONBody(req, (err, body) => {
    if (err) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Invalid JSON' })); return; }

    try {
      const dbPath = path.resolve(process.cwd(), 'order.db');
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const db = new Database(dbPath);
      db.prepare(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        address TEXT,
        pieces INTEGER,
        done INTEGER DEFAULT 0,
        details TEXT,
        created_at TEXT
      )`).run();

      const stmt = db.prepare('INSERT INTO orders (name,address,pieces,done,details,created_at) VALUES (?,?,?,?,?,?)');
      const info = stmt.run(
        body.name || '',
        typeof body.address === 'string' ? body.address : JSON.stringify(body.address || {}),
        body.pieces || 0,
        body.done ? 1 : 0,
        JSON.stringify(body.items || body.paypal_order || body.details || {}),
        new Date().toISOString()
      );

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, id: info.lastInsertRowid }));
    } catch (e) {
      console.error('save-order error', e);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: e && e.message }));
    }
  });
};

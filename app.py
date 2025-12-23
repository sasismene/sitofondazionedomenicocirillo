import os
import json
import sqlite3
from datetime import datetime

import requests
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

BASE_DIR = os.path.dirname(__file__)
DB_PATH = os.path.join(BASE_DIR, 'order.db')

PAYPAL_ENV = os.environ.get('PAYPAL_ENV', 'sandbox')
PAYPAL_CLIENT_ID = os.environ.get('PAYPAL_CLIENT_ID', '')
PAYPAL_SECRET = os.environ.get('PAYPAL_SECRET', '')

if PAYPAL_ENV == 'live':
    PAYPAL_API = 'https://api-m.paypal.com'
else:
    PAYPAL_API = 'https://api-m.sandbox.paypal.com'

app = Flask(__name__, static_folder='')
CORS(app)


def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        '''
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            paypal_order_id TEXT,
            name TEXT,
            address TEXT,
            items TEXT,
            pieces INTEGER,
            status TEXT,
            created_at TEXT
        )
        '''
    )
    conn.commit()
    conn.close()


def get_paypal_token():
    if not PAYPAL_CLIENT_ID or not PAYPAL_SECRET:
        raise RuntimeError('PAYPAL_CLIENT_ID and PAYPAL_SECRET must be set')
    url = f"{PAYPAL_API}/v1/oauth2/token"
    r = requests.post(url, auth=(PAYPAL_CLIENT_ID, PAYPAL_SECRET), data={'grant_type': 'client_credentials'})
    r.raise_for_status()
    return r.json()['access_token']


@app.route('/api/config')
def config():
    return jsonify({
        'paypalClientId': PAYPAL_CLIENT_ID,
        'currency': os.environ.get('CURRENCY', 'EUR'),
        'env': PAYPAL_ENV
    })


@app.route('/api/create-order', methods=['POST'])
def create_order():
    data = request.get_json() or {}
    amount = data.get('total')
    currency = data.get('currency') or os.environ.get('CURRENCY', 'EUR')

    token = get_paypal_token()
    url = f"{PAYPAL_API}/v2/checkout/orders"
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    body = {
        'intent': 'CAPTURE',
        'purchase_units': [
            {
                'amount': {
                    'currency_code': currency,
                    'value': f"{amount:.2f}"
                }
            }
        ]
    }
    r = requests.post(url, headers=headers, json=body)
    r.raise_for_status()
    return jsonify(r.json())


@app.route('/api/capture-order', methods=['POST'])
def capture_order():
    data = request.get_json() or {}
    order_id = data.get('orderID') or data.get('orderId')
    name = data.get('name', '')
    address = data.get('address', '')
    items = data.get('items', {})
    pieces = int(data.get('pieces', 1))

    token = get_paypal_token()
    url = f"{PAYPAL_API}/v2/checkout/orders/{order_id}/capture"
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    r = requests.post(url, headers=headers)
    r.raise_for_status()
    result = r.json()

    # Persist order
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        'INSERT INTO orders (paypal_order_id, name, address, items, pieces, status, created_at) VALUES (?,?,?,?,?,?,?)',
        (
            order_id,
            name,
            address,
            json.dumps(items),
            pieces,
            result.get('status', 'UNKNOWN'),
            datetime.utcnow().isoformat()
        )
    )
    conn.commit()
    conn.close()

    return jsonify(result)


@app.route('/orders')
def list_orders():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT id, paypal_order_id, name, address, items, pieces, status, created_at FROM orders ORDER BY id DESC')
    rows = c.fetchall()
    conn.close()
    keys = ['id', 'paypal_order_id', 'name', 'address', 'items', 'pieces', 'status', 'created_at']
    orders = [dict(zip(keys, row)) for row in rows]
    for o in orders:
        try:
            o['items'] = json.loads(o['items'])
        except Exception:
            pass
    return jsonify(orders)


@app.route('/')
def serve_root():
    return send_from_directory(BASE_DIR, 'index.html')


@app.route('/merch/')
@app.route('/merch/index.html')
def serve_merch():
    return send_from_directory(os.path.join(BASE_DIR, 'merch'), 'index.html')


if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)), debug=True)

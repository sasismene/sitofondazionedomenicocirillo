# Merch site with PayPal checkout

This project provides a simple merch page with PayPal Checkout and a Flask backend that stores orders in `order.db`.

Setup (Windows PowerShell):

1. Set PayPal sandbox credentials (get these from your PayPal developer dashboard):

```powershell
$env:PAYPAL_CLIENT_ID = 'your-sandbox-client-id'
$env:PAYPAL_SECRET = 'your-sandbox-secret'
```

Optionally set `PAYPAL_ENV=live` to use the live API.

2. Install dependencies and run:

```powershell
python -m pip install -r requirements.txt
python app.py
```

3. Open the merch page in your browser:

http://localhost:5000/merch/index.html

Notes:
- The app will create `order.db` on first run.
- For testing use PayPal sandbox credentials and the sandbox environment.
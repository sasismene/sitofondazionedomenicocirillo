const PRODUCTS = [
  {id:'shirt-1', name:'Foundation T‑Shirt', price:20.00, image:'https://placehold.co/400x400?text=T-Shirt'},
  {id:'mug-1', name:'Ceramic Mug', price:12.50, image:'https://placehold.co/400x400?text=Mug'},
  {id:'tote-1', name:'Canvas Tote', price:15.00, image:'https://placehold.co/400x400?text=Tote'}
];

const cartKey = 'merch_cart';
let cart = JSON.parse(localStorage.getItem(cartKey)||'{}');

function formatPrice(v){return '€'+v.toFixed(2)}

function renderProducts(){
  const out = document.getElementById('products');
  out.innerHTML = '';
  PRODUCTS.forEach(p=>{
    const el = document.createElement('article'); el.className='card';
    el.innerHTML = `
      <img src="${p.image}" alt="${p.name}">
      <h3>${p.name}</h3>
      <p class="price">${formatPrice(p.price)}</p>
      <p>High-quality official merch supporting the foundation.</p>
      <div style="margin-top:auto; display:flex; gap:8px;">
        <button class="btn" onclick="addToCart('${p.id}')">Add to cart</button>
        <button class="btn" onclick="buyNow('${p.id}')">Buy now</button>
      </div>
    `;
    out.appendChild(el);
  })
}

function saveCart(){ localStorage.setItem(cartKey, JSON.stringify(cart)); renderCart(); }

function addToCart(id){ cart[id] = (cart[id]||0)+1; saveCart(); }
function removeFromCart(id){ if(!cart[id]) return; cart[id]--; if(cart[id]<=0) delete cart[id]; saveCart(); }
function clearCart(){ cart={}; saveCart(); }

function renderCart(){
  const el = document.getElementById('cart-items'); el.innerHTML='';
  const keys = Object.keys(cart);
  if(keys.length===0){ el.innerHTML = '<p class="muted">Your cart is empty.</p>'; document.getElementById('cart-total').textContent = formatPrice(0); return }
  let total = 0;
  keys.forEach(id=>{
    const prod = PRODUCTS.find(p=>p.id===id);
    const qty = cart[id];
    const row = document.createElement('div'); row.className='cart-item';
    row.innerHTML = `
      <img src="${prod.image}" alt="${prod.name}">
      <div class="meta"><b>${prod.name}</b><small>${formatPrice(prod.price)} × ${qty}</small></div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        <button class="btn" onclick="addToCart('${id}')">+</button>
        <button class="btn" onclick="removeFromCart('${id}')">−</button>
      </div>
    `;
    el.appendChild(row);
    total += prod.price * qty;
  })
  document.getElementById('cart-total').textContent = formatPrice(total);
}

function buyNow(id){ cart = {}; cart[id]=1; saveCart(); checkout(); }

function checkout(){
  (async ()=>{
    const keys = Object.keys(cart);
    if(keys.length===0){ alert('Cart is empty'); return }
    const items = keys.map(id=>({ id, qty: cart[id] }));
    const total = keys.reduce((s,id)=>{
      const p = PRODUCTS.find(x=>x.id===id); return s + (p ? p.price * cart[id] : 0);
    },0);

    const customerName = prompt('Name for the order');
    const address = prompt('Shipping address');
    if(!customerName || !address){ alert('Name and address required'); return }

    try{
      const res = await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ customerName, address, items, total })});
      if(!res.ok) throw new Error('Server error');
      const data = await res.json();
      if(data.approvalUrl){ window.location.href = data.approvalUrl; }
      else { alert('Failed to create PayPal order. See console.'); console.error(data); }
    }catch(err){ alert('Could not create order'); console.error(err); }
  })();
}

window.addEventListener('DOMContentLoaded', ()=>{
  renderProducts(); renderCart();
  document.getElementById('clear-cart').addEventListener('click', ()=>{ if(confirm('Clear cart?')) clearCart() });
  document.getElementById('checkout').addEventListener('click', checkout);
});

/* Shared config, data and helpers. Loaded first on every page. */
const CONFIG = {
    STORE_NAME: 'Pagewise Books',
    UPI_ID: 'kharish7663@naviaxis',
    UPI_NAME: 'Pagewise Books',
    GOOGLE_CLIENT_ID: '__GOOGLE_CLIENT_ID_PLACEHOLDER__',
    // BREVO_API_KEY removed — the key now lives in Render's environment variables only.
    // The frontend calls POST /send-otp on our own backend server instead of Brevo directly.
    ADMIN_EMAIL: '11249a125@kanchiuniv.ac.in',
    ADMIN_HASH: '__ADMIN_HASH_PLACEHOLDER__'
};

const $ = (s, r = document) => r.querySelector(s);
const CATS = { 'Fiction': '#7a2e2a', 'Biography': '#1f5c58', 'Technology': '#2a3b6b', 'Self Help': '#8a5a12', 'History': '#4b3a63', 'Children': '#2f6b3a' };
const STEPS = ['Placed', 'Packed', 'Shipped', 'Out for delivery', 'Delivered'];

const SEED = [
    ['Wings of Fire', 'A.P.J. Abdul Kalam', 'Biography', 250, 12, 'The life story of the Missile Man of India, told with warmth and humility.'],
    ['The Alchemist', 'Paulo Coelho', 'Fiction', 299, 15, 'A shepherd boy travels in search of treasure and finds his purpose.'],
    ['Clean Code', 'Robert C. Martin', 'Technology', 599, 8, 'A handbook of agile software craftsmanship and readable code.'],
    ['Atomic Habits', 'James Clear', 'Self Help', 499, 20, 'Small daily changes that compound into remarkable results.'],
    ['The Discovery of India', 'Jawaharlal Nehru', 'History', 350, 9, 'A sweeping account of Indian history, culture and philosophy.'],
    ['Panchatantra Tales', 'Vishnu Sharma', 'Children', 150, 25, 'Classic animal fables that teach wisdom and good conduct.'],
    ['Introduction to Algorithms', 'Thomas H. Cormen', 'Technology', 899, 6, 'The standard reference on algorithms and data structures.'],
    ['The Guide', 'R.K. Narayan', 'Fiction', 275, 10, 'A tour guide becomes an unlikely spiritual teacher.'],
    ['Ikigai', 'Hector Garcia', 'Self Help', 325, 14, 'The Japanese secret to a long and happy life.'],
    ['India After Gandhi', 'Ramachandra Guha', 'History', 699, 7, 'The history of the largest democracy since 1947.'],
    ['Computer Networks', 'Andrew S. Tanenbaum', 'Technology', 750, 11, 'Layered networking from the physical layer to applications.'],
    ['Malgudi Days', 'R.K. Narayan', 'Fiction', 225, 13, 'Short stories from the beloved fictional town of Malgudi.']
].map((r, i) => ({ id: i + 1, title: r[0], author: r[1], category: r[2], price: r[3], stock: r[4], desc: r[5], img: '' }));

const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
};

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '\u20B9' + Number(n).toLocaleString('en-IN');
const getUser = () => store.get('user', null);

// ── Admin JWT helpers (global — NOT inside an IIFE) ────────────────────────────
function getAdminToken() { return sessionStorage.getItem('adm_token') || null; }
function setAdminToken(t) { sessionStorage.setItem('adm_token', t); sessionStorage.setItem('adm', '1'); }
function clearAdminToken() { sessionStorage.removeItem('adm_token'); sessionStorage.removeItem('adm'); }
function isAdmin() {
    const t = getAdminToken();
    if (!t) return false;
    try {
        const payload = JSON.parse(atob(t.split('.')[1]));
        return payload.role === 'admin' && payload.exp * 1000 > Date.now();
    } catch { return false; }
}

// ── API request headers helper (global) ────────────────────────────────────────
function apiHeaders() {
    const t = getAdminToken();
    return { 'content-type': 'application/json', ...(t ? { 'authorization': 'Bearer ' + t } : {}) };
}

async function sha256(s) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

function getBooks() {
    let b = store.get('books', null);
    if (!b) { b = SEED; store.set('books', b); }
    return b;
}

function saveBooks(b) {
    store.set('books', b);
    // API sync happens directly in admin.js
}

function toast(m) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.textContent = m;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2400);
}

function updateCount() {
    const el = $('#cc');
    if (el) el.textContent = store.get('cart', []).reduce((s, c) => s + c.qty, 0);
}

function addToCart(id) {
    const b = getBooks().find(x => x.id === id); if (!b) return;
    const c = store.get('cart', []), it = c.find(x => x.id === id), q = it ? it.qty : 0;
    if (q + 1 > b.stock) return toast('Only ' + b.stock + ' copies available');
    it ? it.qty++ : c.push({ id, qty: 1 });
    store.set('cart', c); updateCount(); toast('Added to cart');
    document.dispatchEvent(new Event('cartchange'));
}

function toggleWish(id) {
    let w = store.get('wish', []);
    store.set('wish', w.includes(id) ? w.filter(x => x !== id) : w.concat(id));
}

const noCover = new Set();
async function findCover(b) {
    const key = (b.title + '|' + b.author).toLowerCase(), cache = store.get('covers', {});
    if (cache[key]) return cache[key];
    if (noCover.has(key)) return '';
    try {
        const last = b.author.trim().split(/\s+/).pop();
        const r = await fetch('https://openlibrary.org/search.json?limit=5&fields=cover_i&title=' + encodeURIComponent(b.title) + '&author=' + encodeURIComponent(last));
        const d = await r.json(), hit = (d.docs || []).find(x => x.cover_i);
        if (hit) { const u = 'https://covers.openlibrary.org/b/id/' + hit.cover_i + '-M.jpg?default=false'; cache[key] = u; store.set('covers', cache); return u; }
    } catch (e) { /* offline: keep colour cover */ }
    noCover.add(key); return '';
}

function hydrateCovers(root = document) {
    root.querySelectorAll('img[data-cid]').forEach(async img => {
        const b = getBooks().find(x => x.id === +img.dataset.cid); if (!b) return;
        const u = b.img || await findCover(b); if (!u) return;
        img.onload = () => img.parentElement.classList.add('has');
        img.onerror = () => { img.removeAttribute('src'); img.parentElement.classList.remove('has'); };
        img.src = u;
    });
}

function cardHTML(b) {
    const wish = store.get('wish', []).includes(b.id);
    return `
    <div class="card" data-id="${b.id}">
      <div class="imgbox"><img data-cid="${b.id}" alt="${esc(b.title)}"><span>${esc(b.title[0])}</span></div>
      <div class="body">
        <h4>${esc(b.title)}</h4>
        <p class="auth">${esc(b.author)}</p>
        <span class="tag">${esc(b.category)}</span>
        <div class="row">
          <span class="price">${money(b.price)}</span>
          <span class="stock">${b.stock ? b.stock + ' in stock' : 'Out of stock'}</span>
        </div>
        <div class="row" style="margin-top:10px;">
          <button class="btn-primary" data-add="${b.id}" ${b.stock ? '' : 'disabled'}>Add to cart</button>
          <button class="wishbtn ${wish ? 'on' : ''}" data-wish="${b.id}" aria-label="Wishlist">${wish ? '♥' : '♡'}</button>
        </div>
      </div>
    </div>`;
}

function bindCards(root, redraw) {
    root.onclick = e => {
        const a = e.target.closest('[data-add]'), w = e.target.closest('[data-wish]');
        if (a) addToCart(+a.dataset.add);
        if (w) { toggleWish(+w.dataset.wish); redraw(); }
    };
}

function trackerHTML(o) {
    const i = Math.max(0, STEPS.indexOf(o.status));
    return `<ol class="track" aria-label="Parcel tracking">${STEPS.map((s, k) => `<li>${s}<span>${esc((o.times && o.times[s]) || (k < i ? 'Completed' : 'Pending'))}</span></li>`).join('')}</ol>`;
}

function layout() {
    const page = location.pathname.split('/').pop() || 'index.html', u = getUser();
    const links = [['index.html', 'Home'], ['books.html', 'Books'], ['cart.html', 'Cart'], ['orders.html', 'Orders']];
    if (isAdmin()) links.push(['admin.html', 'Admin']);

    const acct = u ? `<span class="who">${esc(u.name.split(' ')[0])}</span><button class="navbtn" id="signout">Sign out</button>`
    : isAdmin() ? `<a href="admin.html">Admin</a><button class="navbtn" id="signout">Sign out</button>`
    : `<a href="login.html" class="${page === 'login.html' ? 'on' : ''}">Sign in</a>`;

    const navEl = $('#nav');
    if (navEl) {
        navEl.innerHTML = `<header class="bar"><a class="logo" href="index.html">${CONFIG.STORE_NAME}</a><nav>${links.map(([h, t]) => `<a href="${h}" class="${page === h ? 'on' : ''}">${t}${h === 'cart.html' ? ' <span id="cc">0</span>' : ''}</a>`).join('')}${acct}</nav></header>`;
    }

    const footEl = $('#foot');
    if (footEl) {
        footEl.innerHTML = `<footer>${CONFIG.STORE_NAME}, a student e-commerce project. Released under the MIT License.</footer>`;
    }

    const so = $('#signout');
    if (so) so.onclick = () => {
        localStorage.removeItem('user');
        clearAdminToken();
        location.href = 'index.html';
    };
    updateCount();
}

layout();

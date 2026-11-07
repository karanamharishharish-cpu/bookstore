/* Cart, checkout (COD / UPI), parcel tracking, order history and invoice. */
(function () {
  const box = $('#cartBox'), list = $('#orderList');
  const lines = (bs = getBooks()) => store.get('cart', []).map(c => ({ c, b: bs.find(x => x.id === c.id) })).filter(x => x.b);
  const mine = () => { const u = getUser(); return u ? store.get('orders', []).filter(o => o.email === u.email) : []; };
  if (box) cartPage();
  if (list) ordersPage();

  function cartPage() {
    const form = $('#checkout'), note = $('#loginNote'), u = getUser();
    if (u) $('#name').value = u.name;

    function drawTrack() {
      const t = $('#trackBox'), a = mine().filter(o => o.status !== 'Delivered').slice(0, 3);
      t.hidden = !a.length;
      t.innerHTML = a.length ? '<h2>Track your parcels</h2>' + a.map(o => `<article class="order"><div class="row"><h3>${o.id}</h3><span class="status">${esc(o.status)}</span></div>
        <small>Tracking ID: ${esc(o.trk)}</small>${trackerHTML(o)}</article>`).join('') : '';
    }
    function draw() {
      const L = lines(); drawTrack();
      if (!L.length) {
        box.innerHTML = '<p class="empty">Your cart is empty. <a href="books.html">Browse books</a> to add some.</p>';
        form.hidden = true; note.hidden = true; return;
      }
      note.hidden = !!u; form.hidden = !u;
      const total = L.reduce((s, x) => s + x.b.price * x.c.qty, 0);
      box.innerHTML = `<div class="scroll"><table><thead><tr><th>Book</th><th>Price</th><th>Quantity</th><th>Subtotal</th><th></th></tr></thead><tbody>${L.map(({ c, b }) =>
        `<tr><td>${esc(b.title)}<br><small>${esc(b.author)}</small></td><td>${money(b.price)}</td>
        <td><div class="qty"><button data-d="-1" data-id="${b.id}" aria-label="Decrease quantity">&minus;</button><span>${c.qty}</span><button data-d="1" data-id="${b.id}" aria-label="Increase quantity">+</button></div></td>
        <td>${money(b.price * c.qty)}</td><td><button class="link" data-rm="${b.id}">Remove</button></td></tr>`).join('')}</tbody></table></div>
        <p class="total">Total: <strong>${money(total)}</strong></p>`;
    }
    document.addEventListener('cartchange', draw);
    box.onclick = e => {
      const d = e.target.closest('[data-d]'), r = e.target.closest('[data-rm]'), c = store.get('cart', []);
      if (r) store.set('cart', c.filter(x => x.id !== +r.dataset.rm));
      else if (d) {
        const id = +d.dataset.id, it = c.find(x => x.id === id), b = getBooks().find(x => x.id === id), n = it.qty + +d.dataset.d;
        if (n > b.stock) return toast('Only ' + b.stock + ' copies available');
        if (n < 1) store.set('cart', c.filter(x => x.id !== id)); else { it.qty = n; store.set('cart', c); }
      } else return;
      updateCount(); draw();
    };

    function finish(pay, status) {
      const bs = getBooks(), L = lines(bs);
      if (!L.length) return;
      for (const { c, b } of L) if (c.qty > b.stock) return toast(b.title + ': only ' + b.stock + ' left');
      L.forEach(({ c, b }) => { b.stock -= c.qty; });
      saveBooks(bs);
      const now = new Date().toLocaleString('en-IN');
      const o = {
        id: 'ORD' + Date.now().toString().slice(-8), trk: 'PWB' + Math.floor(1e9 + Math.random() * 9e9), date: now, email: u.email,
        customer: { name: $('#name').value.trim(), phone: $('#phone').value.trim(), addr: $('#addr').value.trim() },
        pay, payStatus: status, status: 'Placed', times: { Placed: now },
        items: L.map(({ c, b }) => ({ title: b.title, price: b.price, qty: c.qty })),
        total: L.reduce((s, { c, b }) => s + b.price * c.qty, 0)
      };
      const os = store.get('orders', []); os.unshift(o);
      store.set('orders', os); store.set('cart', []);
      location.href = 'orders.html?new=' + o.id;
    }

    function upi(total, done) {
      const ref = 'PWB' + Date.now().toString().slice(-8), m = $('#upiModal'),
        link = 'upi://pay?pa=' + CONFIG.UPI_ID + '&pn=' + encodeURIComponent(CONFIG.UPI_NAME) + '&am=' + total.toFixed(2) +
          '&cu=INR&tn=' + encodeURIComponent('Book order ' + ref) + '&tr=' + ref;
      $('#upiAmt').textContent = money(total); $('#upiLink').href = link;
      const q = $('#qr'); q.innerHTML = '';
      if (window.QRCode) new QRCode(q, { text: link, width: 170, height: 170 });
      m.hidden = false;
      $('#upiDone').onclick = () => { m.hidden = true; done(); };
      $('#upiCancel').onclick = () => { m.hidden = true; };
      if (/Android|iPhone|iPad/i.test(navigator.userAgent)) location.href = link;
    }

    form.onsubmit = e => {
      e.preventDefault();
      const phone = $('#phone').value.trim();
      if ($('#name').value.trim().length < 2) return toast('Enter your full name');
      if (!/^[6-9]\d{9}$/.test(phone)) return toast('Enter a valid 10-digit mobile number');
      if ($('#addr').value.trim().length < 10) return toast('Enter your full delivery address');
      const L = lines(); if (!L.length) return toast('Your cart is empty');
      for (const { c, b } of L) if (c.qty > b.stock) return toast(b.title + ': only ' + b.stock + ' left');
      const total = L.reduce((s, { c, b }) => s + b.price * c.qty, 0);
      if ($('#pay').value.startsWith('UPI')) upi(total, () => finish('UPI', 'Paid via UPI'));
      else finish('Cash on delivery', 'Pay on delivery');
    };
    draw();
  }

  function invoice(o) {
    return `<h2>Invoice ${o.id}</h2><p>Date: ${esc(o.date)}<br>Payment: ${esc(o.pay)} (${esc(o.payStatus || '')})</p>
    <p><strong>${esc(o.customer.name)}</strong><br>${esc(o.customer.phone)}<br>${esc(o.customer.addr)}</p>
    <table><thead><tr><th>Book</th><th>Price</th><th>Qty</th><th>Amount</th></tr></thead><tbody>${o.items.map(i =>
      `<tr><td>${esc(i.title)}</td><td>${money(i.price)}</td><td>${i.qty}</td><td>${money(i.price * i.qty)}</td></tr>`).join('')}</tbody></table>
    <p class="total">Total: <strong>${money(o.total)}</strong></p>
    <button class="btn noprint" onclick="window.print()">Print invoice</button>`;
  }

  function ordersPage() {
    const u = getUser(), n = new URLSearchParams(location.search).get('new');
    if (!u) { list.innerHTML = '<p class="empty"><a href="login.html?next=orders.html">Sign in with Gmail</a> to see your orders and track your parcels.</p>'; return; }
    const os = mine();
    if (n) { $('#placed').hidden = false; $('#placed').textContent = 'Order ' + n + ' placed successfully. Track it below.'; }
    if (!os.length) { list.innerHTML = '<p class="empty">No orders yet. <a href="books.html">Find your next book</a>.</p>'; return; }
    list.innerHTML = os.map(o => `<article class="order"><div class="row"><h3>${o.id}</h3><span class="status">${esc(o.status)}</span></div>
      <small>${esc(o.date)}. Tracking ID: ${esc(o.trk || '-')}</small>${trackerHTML(o)}
      <ul>${o.items.map(i => `<li>${esc(i.title)} &times; ${i.qty}</li>`).join('')}</ul>
      <div class="row"><strong>${money(o.total)}</strong><button class="ghost" data-inv="${o.id}">View invoice</button></div></article>`).join('');
    list.onclick = e => {
      const b = e.target.closest('[data-inv]'); if (!b) return;
      const v = $('#invoice'); v.innerHTML = invoice(os.find(x => x.id === b.dataset.inv));
      v.hidden = false; v.scrollIntoView({ behavior: 'smooth' });
    };
  }
})();

/* Book Buddy: a rule-based shopping assistant (no API key, runs in the browser). */
(function () {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<button class="aibtn" id="aiOpen">Ask Book Buddy</button>
  <section class="aipanel" id="aiPanel" hidden aria-label="Book Buddy assistant">
    <div class="aihead"><b>Book Buddy</b><button id="aiClose" aria-label="Close assistant">&times;</button></div>
    <div class="aimsgs" id="aiMsgs" aria-live="polite"></div>
    <div class="aichips">${['Recommend a book', 'Books under 400', 'Track my order', 'How do I pay?'].map(t => `<button type="button">${t}</button>`).join('')}</div>
    <form class="aiform" id="aiForm"><input id="aiIn" placeholder="Ask about books, cart or orders" autocomplete="off" aria-label="Message"><button class="btn" type="submit">Send</button></form>
  </section>`;
  document.body.appendChild(wrap);
  const msgs = $('#aiMsgs');
  const norm = s => s.toLowerCase().replace(/[^a-z0-9\u20B9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const STOP = new Set('the and for book books show find with any you can about want need get give please have some what which who wrote looking read are there tell list all has this that from how much does cost'.split(' '));
  const CAT_RX = [[/tech|program|coding|computer|software|algorithm|network/, 'Technology'], [/fiction|novel|stor(y|ies)/, 'Fiction'], [/biograph|life story/, 'Biography'],
    [/self help|habit|motivat/, 'Self Help'], [/histor/, 'History'], [/child|kid|fable|tales/, 'Children']];

  function add(html, me) {
    const d = document.createElement('div'); d.className = 'aim' + (me ? ' me' : ''); d.innerHTML = html;
    msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight;
  }
  const rows = l => l.slice(0, 4).map(b => `<div class="aib"><span><b>${esc(b.title)}</b><br><small>${esc(b.author)}, ${money(b.price)}${b.stock ? '' : ' (out of stock)'}</small></span>${b.stock ? `<button data-aa="${b.id}">Add</button>` : ''}</div>`).join('');
  const list = (intro, l, link) => !l.length ? esc('I could not find a match. Try a title, author or category.')
    : esc(intro) + rows(l) + (l.length > 4 ? `<div class="aib"><a href="${link || 'books.html'}">See all ${l.length} in the catalog</a></div>` : '');

  function find(n) {
    const w = n.split(' ').filter(x => x.length > 2 && !STOP.has(x));
    return getBooks().map(b => {
      const h = norm(b.title + ' ' + b.author + ' ' + b.category + ' ' + (b.desc || '')), t = norm(b.title); let s = 0;
      w.forEach(x => { if (h.includes(x)) s++; if (t.includes(x)) s += 2; });
      return { b, s };
    }).filter(x => x.s > 0).sort((a, b) => b.s - a.s).map(x => x.b);
  }
  function pick(n) {
    const bs = getBooks(), words = n.split(' ');
    return bs.filter(b => n.includes(norm(b.title))).sort((a, b) => b.title.length - a.title.length)[0] ||
      bs.find(b => norm(b.title).split(' ').some(w => w.length > 4 && words.includes(w)));
  }

  function reply(q) {
    const n = norm(q), books = getBooks(), u = getUser();
    if (/^(hi|hello|hey|hola|namaste)\b/.test(n)) return esc('Hello! I can find books, check your cart, track orders and explain payments. What would you like?');
    if (/\bhelp\b|what can you do/.test(n)) return esc('Try: "books under 400", "technology books", "add Clean Code", "show my cart", "track my order" or "who wrote Ikigai".');
    if (/track|order status|where.*(order|parcel)|delivery status/.test(n)) {
      if (!u) return esc('Please sign in first and I can show your order status. ') + '<a href="login.html?next=orders.html">Sign in</a>';
      const o = store.get('orders', []).find(x => x.email === u.email);
      if (!o) return esc('You have no orders yet. Add a book to your cart to get started.');
      return esc(`Your latest order ${o.id} is "${o.status}". Tracking ID: ${o.trk}.`) + ' <a href="orders.html">See full tracking</a>';
    }
    if (/my cart|cart total|show.*cart|view.*cart|what.*cart/.test(n)) {
      const c = store.get('cart', []); if (!c.length) return esc('Your cart is empty.');
      const t = c.reduce((s, x) => { const b = books.find(y => y.id === x.id); return s + (b ? b.price * x.qty : 0); }, 0);
      return esc(`You have ${c.reduce((s, x) => s + x.qty, 0)} item(s) worth ${money(t)}.`) + ' <a href="cart.html">Open cart</a>';
    }
    if (/\b(add|buy|order)\b/.test(n)) {
      const b = pick(n);
      if (!b) return esc('Which book should I add? Tell me the title.');
      if (!b.stock) return esc(b.title + ' is out of stock right now.');
      addToCart(b.id); return esc(`Added "${b.title}" to your cart.`) + ' <a href="cart.html">Go to cart</a>';
    }
    if (/who wrote|author of|written by/.test(n)) { const b = pick(n); if (b) return esc(`${b.title} is by ${b.author}.`); }
    if (/in stock|available|availability|copies/.test(n)) { const b = pick(n); if (b) return esc(b.stock ? `${b.title} is in stock (${b.stock} copies, ${money(b.price)}).` : `${b.title} is out of stock right now.`); }
    const cat = (CAT_RX.find(([r]) => r.test(n)) || [])[1], pm = n.match(/(?:under|below|less than|within|upto|up to|cheaper than|budget)\s*\u20B9?\s*(\d+)/);
    if (pm || cat || /cheap|expensive|costl|lowest|highest/.test(n)) {
      const l = books.filter(b => (!cat || b.category === cat) && (!pm || b.price <= +pm[1]));
      l.sort((a, b) => /expensive|costl|highest/.test(n) ? b.price - a.price : a.price - b.price);
      return list(pm ? `Books${cat ? ' in ' + cat : ''} up to \u20B9${pm[1]}:` : cat ? `Here are some ${cat} books:` : 'Here you go:', l);
    }
    if (/recommend|suggest|what should i read|best book|popular/.test(n)) {
      const w = store.get('wish', []), liked = books.filter(x => w.includes(x.id)).map(x => x.category);
      const pool = books.filter(b => b.stock), fav = pool.filter(b => liked.includes(b.category) && !w.includes(b.id));
      const l = (fav.length ? fav : pool).slice().sort(() => Math.random() - .5).slice(0, 3);
      return list(fav.length ? 'Based on your wishlist, you might like:' : 'Here are three picks:', l);
    }
    if (/pay|upi|\bcod\b|cash|gpay|phonepe|paytm/.test(n)) return esc('You can pay with Cash on delivery or UPI. For UPI, checkout opens your UPI app (GPay, PhonePe, Paytm) on a phone, or shows a QR code on a computer.');
    if (/deliver|shipping|how long|dispatch/.test(n)) return esc('Orders move through Placed, Packed, Shipped, Out for delivery and Delivered. Follow them on the Orders page after you sign in.');
    if (/sign ?in|log ?in|gmail|google|account/.test(n)) return esc('Use Sign in at the top of the page and choose the customer option to continue with Gmail.');
    const f = find(n);
    return f.length ? list('I found these:', f, 'books.html?q=' + encodeURIComponent(q)) : esc('I am not sure about that. Try a title, author or category, or ask me to recommend a book.');
  }

  const ask = q => { q = q.trim(); if (!q) return; add(esc(q), true); setTimeout(() => add(reply(q)), 250); };
  $('#aiOpen').onclick = () => { const p = $('#aiPanel'); p.hidden = !p.hidden; if (!p.hidden) $('#aiIn').focus(); };
  $('#aiClose').onclick = () => { $('#aiPanel').hidden = true; $('#aiOpen').focus(); };
  $('#aiForm').onsubmit = e => { e.preventDefault(); ask($('#aiIn').value); $('#aiIn').value = ''; };
  wrap.querySelector('.aichips').onclick = e => { if (e.target.tagName === 'BUTTON') ask(e.target.textContent); };
  msgs.onclick = e => { const a = e.target.closest('[data-aa]'); if (a) addToCart(+a.dataset.aa); };
  add(esc('Hi! I am Book Buddy. Ask me to find books, check your cart or track an order.'));
})();

/* Admin panel: manage books and update parcel tracking. */
(function () {
  if (!isAdmin()) { location.replace('login.html?next=admin.html'); return; }

  const form = $('#bookForm');
  if ($('#cat')) $('#cat').innerHTML = Object.keys(CATS).map(c => `<option>${c}</option>`).join('');

  async function apiBooks(method, id, body) {
    const url = id ? '/api/books/' + id : '/api/books';
    const r = await fetch(url, { method, headers: apiHeaders(), body: body ? JSON.stringify(body) : undefined });
    return r.json();
  }

  async function draw() {
    // Load books from API, fall back to local cache
    let books;
    try {
      const r = await fetch('/api/books');
      if (r.ok) {
        books = await r.json();
        store.set('books', books); // update local cache
      } else {
        books = getBooks();
      }
    } catch {
      books = getBooks();
    }

    if ($('#books')) {
      $('#books').innerHTML = books.map(b => `<tr><td>${esc(b.title)}</td><td>${esc(b.category)}</td><td>${money(b.price)}</td><td>${b.stock}</td>
        <td><button class="link" data-edit="${b.id}">Edit</button> <button class="link" data-del="${b.id}">Delete</button></td></tr>`).join('');
    }

    // Load orders from API
    let os = [];
    try {
      const r = await fetch('/api/orders', { headers: apiHeaders() });
      if (r.ok) os = await r.json();
    } catch { /* fall through with empty */ }

    if ($('#orders')) {
      $('#orders').innerHTML = os.length
        ? os.map(o => `<tr><td>${o.id}</td><td>${esc(o.customer.name)}<br><small>${esc(o.email || '')}</small></td><td>${money(o.total)}</td><td>${esc(o.pay)}</td>
          <td><select data-st="${o.id}" aria-label="Order status">${STEPS.map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td></tr>`).join('')
        : '<tr><td colspan="5">No orders yet.</td></tr>';
    }
  }

  if ($('#books')) {
    $('#books').onclick = async e => {
      const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
      let books;
      try {
        const r = await fetch('/api/books');
        books = r.ok ? await r.json() : getBooks();
      } catch { books = getBooks(); }

      if (ed) {
        const b = books.find(x => x.id === +ed.dataset.edit);
        if (!b) return;
        $('#bid').value = b.id; $('#title').value = b.title; $('#author').value = b.author; $('#cat').value = b.category;
        $('#price').value = b.price; $('#stock').value = b.stock; $('#desc').value = b.desc || ''; $('#img').value = b.img || '';
        $('#formTitle').textContent = 'Edit book'; form.scrollIntoView({ behavior: 'smooth' });
      }
      if (del && confirm('Delete this book?')) {
        await apiBooks('DELETE', +del.dataset.del);
        await draw(); toast('Book deleted');
      }
    };
  }

  if ($('#orders')) {
    $('#orders').onchange = async e => {
      const s = e.target.closest('[data-st]'); if (!s) return;
      await fetch('/api/orders/' + s.dataset.st, { method: 'PUT', headers: apiHeaders(), body: JSON.stringify({ status: s.value }) });
      toast('Tracking updated');
    };
  }

  if (form) {
    form.onsubmit = async e => {
      e.preventDefault();
      const id = +$('#bid').value;
      const d = {
        title: $('#title').value.trim(), author: $('#author').value.trim(),
        category: $('#cat').value, price: +$('#price').value, stock: +$('#stock').value,
        desc: $('#desc').value.trim(), img: $('#img').value.trim()
      };
      if (!d.title || !d.author) return toast('Title and author are required');
      if (!(d.price > 0) || !Number.isInteger(d.stock) || d.stock < 0) return toast('Enter a valid price and whole-number stock');
      if (d.img && !/^https?:\/\//i.test(d.img)) return toast('Image link must start with http');
      if (id) await apiBooks('PUT', id, d); else await apiBooks('POST', null, d);
      form.reset(); $('#bid').value = ''; $('#formTitle').textContent = 'Add a book'; await draw(); toast('Book saved');
    };
  }

  if ($('#reset')) {
    $('#reset').onclick = async () => {
      if (!confirm('Reset all books to default? This cannot be undone.')) return;
      ['books', 'cart', 'wish', 'orders', 'covers'].forEach(k => localStorage.removeItem(k));
      updateCount(); await draw(); toast('Local data reset');
    };
  }

  draw();
})();

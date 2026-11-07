/* Admin panel: manage books and update parcel tracking. */
(function () {
  if (!isAdmin()) { location.replace('login.html?next=admin.html'); return; }
  const form = $('#bookForm');
  $('#cat').innerHTML = Object.keys(CATS).map(c => `<option>${c}</option>`).join('');

  function draw() {
    $('#books').innerHTML = getBooks().map(b => `<tr><td>${esc(b.title)}</td><td>${esc(b.category)}</td><td>${money(b.price)}</td><td>${b.stock}</td>
      <td><button class="link" data-edit="${b.id}">Edit</button> <button class="link" data-del="${b.id}">Delete</button></td></tr>`).join('');
    const os = store.get('orders', []);
    $('#orders').innerHTML = os.length ? os.map(o => `<tr><td>${o.id}</td><td>${esc(o.customer.name)}<br><small>${esc(o.email || '')}</small></td><td>${money(o.total)}</td><td>${esc(o.pay)}</td>
      <td><select data-st="${o.id}" aria-label="Order status">${STEPS.map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td></tr>`).join('')
      : '<tr><td colspan="5">No orders yet.</td></tr>';
  }

  $('#books').onclick = e => {
    const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]'), bs = getBooks();
    if (ed) {
      const b = bs.find(x => x.id === +ed.dataset.edit);
      $('#bid').value = b.id; $('#title').value = b.title; $('#author').value = b.author; $('#cat').value = b.category;
      $('#price').value = b.price; $('#stock').value = b.stock; $('#desc').value = b.desc || ''; $('#img').value = b.img || '';
      $('#formTitle').textContent = 'Edit book'; form.scrollIntoView({ behavior: 'smooth' });
    }
    if (del && confirm('Delete this book?')) { saveBooks(bs.filter(x => x.id !== +del.dataset.del)); draw(); toast('Book deleted'); }
  };
  $('#orders').onchange = e => {
    const s = e.target.closest('[data-st]'); if (!s) return;
    const os = store.get('orders', []), o = os.find(x => x.id === s.dataset.st);
    o.status = s.value; o.times = o.times || {}; o.times[s.value] = new Date().toLocaleString('en-IN');
    store.set('orders', os); toast('Tracking updated');
  };
  form.onsubmit = e => {
    e.preventDefault();
    const bs = getBooks(), id = +$('#bid').value;
    const d = { title: $('#title').value.trim(), author: $('#author').value.trim(), category: $('#cat').value, price: +$('#price').value, stock: +$('#stock').value, desc: $('#desc').value.trim(), img: $('#img').value.trim() };
    if (!d.title || !d.author) return toast('Title and author are required');
    if (!(d.price > 0) || !Number.isInteger(d.stock) || d.stock < 0) return toast('Enter a valid price and whole-number stock');
    if (d.img && !/^https?:\/\//i.test(d.img)) return toast('Image link must start with http');
    if (id) Object.assign(bs.find(b => b.id === id), d);
    else bs.push({ id: Math.max(0, ...bs.map(b => b.id)) + 1, ...d });
    saveBooks(bs); form.reset(); $('#bid').value = ''; $('#formTitle').textContent = 'Add a book'; draw(); toast('Book saved');
  };
  $('#reset').onclick = () => {
    if (!confirm('Reset books, cart, wishlist, covers and orders to the starting data?')) return;
    ['books', 'cart', 'wish', 'orders', 'covers'].forEach(k => localStorage.removeItem(k)); updateCount(); draw(); toast('Data reset');
  };
  draw();
})();

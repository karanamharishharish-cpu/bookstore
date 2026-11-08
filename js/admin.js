/* Admin panel: manage books, view logged-in users, analyze sales charts & track ordered items */
(function () {
  if (!isAdmin()) { location.replace('login.html?next=admin.html'); return; }

  const form = $('#bookForm');
  if ($('#cat')) $('#cat').innerHTML = Object.keys(CATS).map(c => `<option>${c}</option>`).join('');

  // ── Tab Navigation ────────────────────────────────────────────────────────
  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(s => s.style.display = 'none');
      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.style.display = 'block';
    };
  });

  // ── Chart instances ───────────────────────────────────────────────────────
  let catChartInstance = null;
  let statusChartInstance = null;
  let stockChartInstance = null;

  async function apiBooks(method, id, body) {
    const url = id ? '/api/books/' + id : '/api/books';
    const r = await fetch(url, { method, headers: apiHeaders(), body: body ? JSON.stringify(body) : undefined });
    return r.json();
  }

  // ── Draw Analytics Charts ────────────────────────────────────────────────
  function renderCharts(stats) {
    if (typeof Chart === 'undefined') return;

    // 1. Category Bar Chart
    const catCanvas = document.getElementById('categoryChart');
    if (catCanvas && stats.categoryCounts) {
      if (catChartInstance) catChartInstance.destroy();
      const labels = Object.keys(stats.categoryCounts);
      const data = Object.values(stats.categoryCounts);
      catChartInstance = new Chart(catCanvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Books in Category',
            data,
            backgroundColor: ['#1a3c8f', '#e0a526', '#1f7a4d', '#7a2e2a', '#4b3a63', '#2a3b6b'],
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
      });
    }

    // 2. Order Status Doughnut Chart
    const statusCanvas = document.getElementById('statusChart');
    if (statusCanvas && stats.statusCounts) {
      if (statusChartInstance) statusChartInstance.destroy();
      const labels = Object.keys(stats.statusCounts);
      const data = Object.values(stats.statusCounts);
      statusChartInstance = new Chart(statusCanvas, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: ['#e0a526', '#2a3b6b', '#1a3c8f', '#ff6600', '#1f7a4d']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
          }
        }
      });
    }

    // 3. Stock Levels Chart
    const stockCanvas = document.getElementById('stockChart');
    if (stockCanvas && stats.stockLevels) {
      if (stockChartInstance) stockChartInstance.destroy();
      const labels = stats.stockLevels.map(b => b.title);
      const stockData = stats.stockLevels.map(b => b.stock);
      const colors = stockData.map(s => s <= 0 ? '#b3261e' : s <= 5 ? '#e0a526' : '#1f7a4d');

      stockChartInstance = new Chart(stockCanvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Stock Quantity',
            data: stockData,
            backgroundColor: colors,
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
        }
      });
    }
  }

  // ── Main Draw Routine ────────────────────────────────────────────────────
  async function draw() {
    // 1. Fetch Stats & KPIs
    try {
      const stats = await fetch('/api/admin/stats', { headers: apiHeaders() }).then(r => r.json());
      if (stats && !stats.error) {
        if ($('#kpiRevenue'))  $('#kpiRevenue').textContent  = money(stats.totalRevenue || 0);
        if ($('#kpiOrders'))   $('#kpiOrders').textContent   = stats.totalOrders || 0;
        if ($('#kpiUsers'))    $('#kpiUsers').textContent    = stats.usersCount || 0;
        if ($('#kpiBooks'))    $('#kpiBooks').textContent    = stats.totalBooks || 0;
        if ($('#kpiLowStock')) $('#kpiLowStock').textContent = stats.lowStockCount || 0;
        renderCharts(stats);
      }
    } catch (e) {
      console.warn('Analytics stats fallback', e);
    }

    // 2. Fetch Books
    const books = await fetch('/api/books').then(r => r.json()).catch(() => getBooks());
    store.set('books', books);

    if ($('#books')) {
      $('#books').innerHTML = books.map(b => {
        const stockBadge = b.stock <= 0
          ? `<span class="badge-stock badge-out">Out of Stock (${b.stock})</span>`
          : b.stock <= 5
          ? `<span class="badge-stock badge-low">Low Stock (${b.stock})</span>`
          : `<span class="badge-stock badge-ok">In Stock (${b.stock})</span>`;

        return `<tr>
          <td><strong>#${b.id}</strong></td>
          <td><strong>${esc(b.title)}</strong><br><small style="color:var(--muted)">${esc(b.author)}</small></td>
          <td><span class="status" style="font-size:.8rem">${esc(b.category)}</span></td>
          <td><strong>${money(b.price)}</strong></td>
          <td>${stockBadge}</td>
          <td>
            <button class="link" data-edit="${b.id}">Edit</button> &nbsp;|&nbsp;
            <button class="link" data-del="${b.id}" style="color:#b3261e">Delete</button>
          </td>
        </tr>`;
      }).join('');
    }

    // 3. Fetch Orders & Detailed Items
    let os = [];
    try {
      const r = await fetch('/api/orders', { headers: apiHeaders() });
      if (r.ok) os = await r.json();
    } catch {}
    if (!os.length) os = store.get('orders', []);

    if ($('#orders')) {
      $('#orders').innerHTML = os.length ? os.map(o => {
        const itemsList = (o.items || []).map(i =>
          `<li>${esc(i.title)} &times; <strong>${i.qty}</strong> (${money((i.price || 0) * (i.qty || 1))})</li>`
        ).join('');

        const cust = o.customer || {};
        const customerInfo = `<strong>${esc(cust.name || 'Customer')}</strong><br>
          <small>✉️ ${esc(o.email || '-')}<br>📞 ${esc(cust.phone || '-')}<br>📍 ${esc(cust.addr || '-')}</small>`;

        return `<tr>
          <td>
            <strong>${esc(o.id)}</strong><br>
            <small style="color:var(--muted)">${esc(o.date || '-')}</small><br>
            <small style="font-family:monospace">Trk: ${esc(o.trk || '-')}</small>
          </td>
          <td>${customerInfo}</td>
          <td>
            <ul class="order-items-list">${itemsList}</ul>
          </td>
          <td><strong style="color:var(--ink);font-size:1.05rem">${money(o.total || 0)}</strong></td>
          <td><span class="status">${esc(o.pay || 'COD')}</span></td>
          <td>
            <select data-st="${o.id}" aria-label="Order status" style="font-size:0.85rem;padding:6px 10px;border-radius:6px">
              ${STEPS.map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </td>
        </tr>`;
      }).join('')
      : '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted)">No customer orders placed yet.</td></tr>';
    }

    // 4. Fetch Registered / Logged-in Users
    if ($('#usersList')) {
      try {
        const uRes = await fetch('/api/users', { headers: apiHeaders() });
        if (uRes.ok) {
          const users = await uRes.json();
          $('#usersList').innerHTML = users.length ? users.map(u => {
            const initial = (u.name || u.email || 'U')[0].toUpperCase();
            const dateStr = u.lastLogin ? new Date(u.lastLogin).toLocaleString('en-IN') : 'Recent';
            return `<tr>
              <td>
                <span class="user-avatar">${initial}</span>
                <strong>${esc(u.name || 'Customer')}</strong>
              </td>
              <td>${esc(u.email)}</td>
              <td><span class="status" style="font-weight:700">${u.loginCount || 1} logins</span></td>
              <td><small>${dateStr}</small></td>
            </tr>`;
          }).join('')
          : '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--muted)">No logged-in users recorded yet.</td></tr>';
        }
      } catch (e) {
        console.warn('Users fetch error', e);
      }
    }
  }

  // ── Actions ──────────────────────────────────────────────────────────────
  if ($('#refreshBtn')) $('#refreshBtn').onclick = () => { draw(); toast('Data refreshed'); };

  if ($('#books')) {
    $('#books').onclick = async e => {
      const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
      const books = await fetch('/api/books').then(r => r.json()).catch(() => getBooks());
      if (ed) {
        const b = books.find(x => x.id === +ed.dataset.edit);
        if (!b) return;
        $('#bid').value = b.id; $('#title').value = b.title; $('#author').value = b.author; $('#cat').value = b.category;
        $('#price').value = b.price; $('#stock').value = b.stock; $('#desc').value = b.desc || ''; $('#img').value = b.img || '';
        $('#formTitle').textContent = 'Edit book: ' + b.title;
        // switch to tab-books
        document.querySelector('[data-tab="tab-books"]').click();
        form.scrollIntoView({ behavior: 'smooth' });
      }
      if (del && confirm('Delete this book from catalog?')) {
        await apiBooks('DELETE', +del.dataset.del);
        await draw(); toast('Book deleted');
      }
    };
  }

  if ($('#orders')) {
    $('#orders').onchange = async e => {
      const s = e.target.closest('[data-st]'); if (!s) return;
      await fetch('/api/orders/' + s.dataset.st, {
        method: 'PUT',
        headers: apiHeaders(),
        body: JSON.stringify({ status: s.value })
      });
      toast('Order tracking updated to ' + s.value);
    };
  }

  if (form) {
    form.onsubmit = async e => {
      e.preventDefault();
      const id = +$('#bid').value;
      const d = {
        title: $('#title').value.trim(),
        author: $('#author').value.trim(),
        category: $('#cat').value,
        price: +$('#price').value,
        stock: +$('#stock').value,
        desc: $('#desc').value.trim(),
        img: $('#img').value.trim()
      };
      if (!d.title || !d.author) return toast('Title and author are required');
      if (!(d.price > 0) || !Number.isInteger(d.stock) || d.stock < 0) return toast('Enter valid price and stock count');
      if (d.img && !/^https?:\/\//i.test(d.img)) return toast('Image link must start with http');

      if (id) await apiBooks('PUT', id, d);
      else await apiBooks('POST', null, d);

      form.reset();
      $('#bid').value = '';
      $('#formTitle').textContent = 'Add a Book';
      await draw();
      toast('Book saved to database');
    };
  }

  if ($('#reset')) {
    $('#reset').onclick = async () => {
      if (!confirm('Clear local browser cache?')) return;
      ['books', 'cart', 'wish', 'orders', 'covers'].forEach(k => localStorage.removeItem(k));
      updateCount();
      await draw();
      toast('Local browser cache cleared');
    };
  }

  draw();
})();

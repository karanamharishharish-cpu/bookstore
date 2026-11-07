/* Home page featured books + catalog search, filter and sort. */
(function () {
  const feat = $('#featured'), grid = $('#grid');
  if (feat) {
    const drawF = () => { feat.innerHTML = getBooks().slice(0, 4).map(cardHTML).join(''); hydrateCovers(feat); };
    drawF(); bindCards(feat, drawF);
  }
  if (!grid) return;
  const q = $('#q'), cat = $('#cat'), sort = $('#sort'), wo = $('#wo');
  cat.innerHTML = '<option value="">All categories</option>' + Object.keys(CATS).map(c => `<option>${c}</option>`).join('');
  q.value = new URLSearchParams(location.search).get('q') || '';
  function draw() {
    const t = q.value.trim().toLowerCase(), w = store.get('wish', []);
    const l = getBooks().filter(b =>
      (!t || (b.title + ' ' + b.author).toLowerCase().includes(t)) &&
      (!cat.value || b.category === cat.value) &&
      (!wo.checked || w.includes(b.id)));
    const s = sort.value;
    l.sort((a, b) => s === 'low' ? a.price - b.price : s === 'high' ? b.price - a.price : s === 'title' ? a.title.localeCompare(b.title) : a.id - b.id);
    $('#count').textContent = l.length + (l.length === 1 ? ' book' : ' books');
    grid.innerHTML = l.length ? l.map(cardHTML).join('') : '<p class="empty">No books match. Try a different search or clear the filters.</p>';
    hydrateCovers(grid);
  }
  [q, cat, sort, wo].forEach(el => el.addEventListener('input', draw));
  bindCards(grid, draw); draw();
})();

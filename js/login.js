/* Two portals: customer (Gmail / Google) and admin (credentials). */
(function () {
  const next = new URLSearchParams(location.search).get('next') || '';
  const go = def => { location.href = /^[a-z]+\.html$/.test(next) ? next : def; };
  const setUser = u => { store.set('user', u); go('books.html'); };

  if (CONFIG.GOOGLE_CLIENT_ID) {
    $('#demoBox').hidden = true;
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => {
      google.accounts.id.initialize({
        client_id: CONFIG.GOOGLE_CLIENT_ID,
        callback: r => {
          try {
            const b = r.credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            const p = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b), c => c.charCodeAt(0))));
            setUser({ name: p.name || p.email, email: p.email.toLowerCase(), pic: p.picture || '' });
          } catch (e) { toast('Google sign-in failed. Try again.'); }
        }
      });
      google.accounts.id.renderButton($('#gbtn'), { theme: 'outline', size: 'large', text: 'signin_with' });
    };
    document.head.appendChild(s);
  }

  $('#demoForm').onsubmit = e => {
    e.preventDefault();
    const em = $('#ge').value.trim().toLowerCase();
    if (!/^[^\s@]+@gmail\.com$/.test(em)) return toast('Enter a valid Gmail address');
    const nm = em.split('@')[0].replace(/[._]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    setUser({ name: nm, email: em, pic: '' });
  };

  $('#adminForm').onsubmit = async e => {
    e.preventDefault();
    if (!window.crypto || !crypto.subtle) return toast('Admin sign-in needs https or localhost');
    const h = await sha256($('#au').value.trim().toLowerCase() + ':' + $('#ap').value);
    if (h === CONFIG.ADMIN_HASH) { sessionStorage.setItem('adm', '1'); location.href = 'admin.html'; }
    else toast('Incorrect admin credentials');
  };
})();

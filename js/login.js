(function () {
  const next = new URLSearchParams(location.search).get('next') || '';
  const go = def => { location.href = /^[a-z]+\.html$/.test(next) ? next : def; };
  const setUser = u => {
    store.set('user', u);
    fetch('/api/users/login-track', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: u.email, name: u.name, pic: u.pic || '' }),
      keepalive: true
    }).catch(() => {});
    go('books.html');
  };

  // ── Google sign-in ────────────────────────────────────────────────────────
  if (CONFIG.GOOGLE_CLIENT_ID && CONFIG.GOOGLE_CLIENT_ID !== '__GOOGLE_CLIENT_ID_PLACEHOLDER__') {
    const demoBox = $('#demoBox');
    if (demoBox) {
      const gbtn = $('#gbtn');
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
        if (gbtn) google.accounts.id.renderButton(gbtn, { theme: 'outline', size: 'large', text: 'signin_with' });
      };
      document.head.appendChild(s);
    }
  }

  // ── Customer Gmail form ───────────────────────────────────────────────────
  const demoForm = $('#demoForm');
  if (demoForm) {
    demoForm.onsubmit = e => {
      e.preventDefault();
      const em = $('#ge').value.trim().toLowerCase();
      if (!/^[^\s@]+@gmail\.com$/.test(em)) return toast('Enter a valid Gmail address');
      const nm = em.split('@')[0].replace(/[._]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      setUser({ name: nm, email: em, pic: '' });
    };
  }

  // ── Admin Password Login ──────────────────────────────────────────────────
  const adminPassForm    = $('#adminPassForm');
  const forgotBtn        = $('#forgotBtn');
  const adminLoginForm   = $('#adminLoginForm');
  const adminResetForm   = $('#adminResetForm');
  const backToLoginBtn   = $('#backToLoginBtn');

  if (forgotBtn) {
    forgotBtn.onclick = () => {
      adminLoginForm.style.display = 'none';
      adminResetForm.style.display = 'block';
      const re = $('#resetEmailInput');
      if (re) re.value = CONFIG.ADMIN_EMAIL;
    };
  }

  if (backToLoginBtn) {
    backToLoginBtn.onclick = () => {
      adminResetForm.style.display = 'none';
      adminLoginForm.style.display = 'block';
      $('#resetStep1').style.display = 'block';
      $('#resetStep2').style.display = 'none';
    };
  }

  if (adminPassForm) {
    adminPassForm.onsubmit = async e => {
      e.preventDefault();
      const email    = $('#adminEmailInput').value.trim();
      const password = $('#adminPasswordInput').value;
      const btn      = $('#adminLoginBtn');
      btn.textContent = '⏳ Logging in…'; btn.disabled = true;
      try {
        const r = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const d = await r.json();
        if (r.ok && d.token) {
          setAdminToken(d.token);
          toast('✅ Logged in successfully!');
          setTimeout(() => { location.href = 'admin.html'; }, 500);
        } else if (d.error === 'NO_PASSWORD') {
          toast('⚠ No password set. Click "Forgot Password?" to create one.');
        } else {
          toast('❌ ' + (d.message || d.error || 'Invalid credentials'));
        }
      } catch {
        toast('❌ Network error. Try again.');
      }
      btn.textContent = '🔐 Login'; btn.disabled = false;
    };
  }

  // ── Forgot Password: Send OTP ─────────────────────────────────────────────
  const sendResetOtpBtn = $('#sendResetOtpBtn');
  if (sendResetOtpBtn) {
    sendResetOtpBtn.onclick = async () => {
      const email = ($('#resetEmailInput').value || CONFIG.ADMIN_EMAIL).trim();
      sendResetOtpBtn.textContent = '⏳ Sending…'; sendResetOtpBtn.disabled = true;
      try {
        const r = await fetch('/api/admin/send-reset-otp', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const d = await r.json();
        if (r.ok) {
          toast('✅ Reset OTP sent to ' + email);
          $('#resetStep1').style.display = 'none';
          $('#resetStep2').style.display = 'block';
          // 10-minute countdown
          const bar = $('#resetOtpCountdownBar'), fill = $('#resetOtpFill'), lbl = $('#resetOtpTime');
          if (bar) bar.style.display = 'block';
          const end = Date.now() + 10 * 60 * 1000;
          const iv = setInterval(() => {
            const rem = end - Date.now();
            if (rem <= 0) { clearInterval(iv); if (bar) bar.style.display = 'none'; return; }
            const pct = (rem / (10 * 60 * 1000)) * 100;
            if (fill) fill.style.width = pct + '%';
            if (lbl) lbl.textContent = Math.ceil(rem / 60000) + 'm ' + (Math.ceil(rem / 1000) % 60) + 's';
          }, 1000);
        } else {
          toast('❌ ' + (d.error || 'Failed to send OTP'));
        }
      } catch { toast('❌ Network error.'); }
      sendResetOtpBtn.textContent = '📨 Send Reset OTP'; sendResetOtpBtn.disabled = false;
    };
  }

  // ── Forgot Password: Set new password ────────────────────────────────────
  const setPasswordBtn = $('#setPasswordBtn');
  if (setPasswordBtn) {
    setPasswordBtn.onclick = async () => {
      const email    = ($('#resetEmailInput').value || CONFIG.ADMIN_EMAIL).trim();
      const otp      = $('#resetOtpInput').value.trim();
      const newPass  = $('#newPasswordInput').value;
      const confPass = $('#confirmPasswordInput').value;
      if (!otp || otp.length !== 6) return toast('Enter the 6-digit OTP');
      if (newPass.length < 6) return toast('Password must be at least 6 characters');
      if (newPass !== confPass) return toast('Passwords do not match');
      setPasswordBtn.textContent = '⏳ Setting…'; setPasswordBtn.disabled = true;
      try {
        const r = await fetch('/api/admin/verify-reset-otp', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, otp, newPassword: newPass })
        });
        const d = await r.json();
        if (r.ok && d.token) {
          setAdminToken(d.token);
          toast('✅ Password set! Redirecting to admin panel…');
          setTimeout(() => { location.href = 'admin.html'; }, 1000);
        } else {
          toast('❌ ' + (d.error || 'Failed to set password'));
        }
      } catch { toast('❌ Network error.'); }
      setPasswordBtn.textContent = '✔ Set New Password'; setPasswordBtn.disabled = false;
    };
  }
})();

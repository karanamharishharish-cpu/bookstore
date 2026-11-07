(function () {
  const next = new URLSearchParams(location.search).get('next') || '';
  const go = def => { location.href = /^[a-z]+\.html$/.test(next) ? next : def; };
  const setUser = u => { store.set('user', u); go('books.html'); };

  // ── Google sign-in (optional) ────────────────────────────────────────────
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

  // ── Customer demo (Gmail) form ───────────────────────────────────────────
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

  // ── Admin OTP & Captcha ──────────────────────────────────────────────────

  const OTP_TTL_MS = 55000; // 55 seconds — well within the 60-second requirement

  let generatedOtp   = '';
  let otpExpiresAt   = 0;      // epoch-ms timestamp; 0 = no active OTP
  let otpTimerHandle = null;   // setInterval handle for the countdown

  // Math captcha state
  let num1 = Math.floor(Math.random() * 10) + 1;
  let num2 = Math.floor(Math.random() * 10) + 1;
  let expectedCaptchaSum = num1 + num2;

  const captchaQuestion = $('#captchaQuestion');
  if (captchaQuestion) captchaQuestion.textContent = `Solve: ${num1} + ${num2} =`;

  function newCaptcha() {
    num1 = Math.floor(Math.random() * 10) + 1;
    num2 = Math.floor(Math.random() * 10) + 1;
    expectedCaptchaSum = num1 + num2;
    if (captchaQuestion) captchaQuestion.textContent = `Solve: ${num1} + ${num2} =`;
    const ci = $('#captchaInput');
    if (ci) ci.value = '';
  }

  // ── Countdown helpers ────────────────────────────────────────────────────

  function stopCountdown() {
    if (otpTimerHandle) { clearInterval(otpTimerHandle); otpTimerHandle = null; }
    const bar = $('#otpCountdownBar');
    if (bar) bar.style.display = 'none';
  }

  function expireOtp() {
    generatedOtp = '';
    otpExpiresAt = 0;
    stopCountdown();

    const otpSection  = $('#otpSection');
    const sendOtpBtn  = $('#sendOtpBtn');
    const demoOtpBox  = $('#demoOtpBox');
    const otpInput    = $('#otpInput');
    const demoOtpCode = $('#demoOtpCode');

    if (otpSection)  otpSection.style.display  = 'none';
    if (demoOtpBox)  demoOtpBox.style.display   = 'none';
    if (demoOtpCode) demoOtpCode.textContent    = '------';
    if (otpInput)    otpInput.value             = '';
    if (sendOtpBtn) {
      sendOtpBtn.textContent = '📨 Send OTP to Email';
      sendOtpBtn.disabled    = false;
    }

    toast('OTP has expired. Please request a new one.');
    newCaptcha();
  }

  function startCountdown() {
    stopCountdown();

    const bar       = $('#otpCountdownBar');
    const fill      = $('#otpCountdownFill');
    const timeLabel = $('#otpTimeLabel');
    if (!bar || !fill || !timeLabel) return;

    bar.style.display = 'block';

    otpTimerHandle = setInterval(() => {
      const remaining = otpExpiresAt - Date.now();
      if (remaining <= 0) {
        fill.style.width = '0%';
        timeLabel.textContent = '0s';
        clearInterval(otpTimerHandle);
        otpTimerHandle = null;
        expireOtp();
        return;
      }
      const pct = (remaining / OTP_TTL_MS) * 100;
      fill.style.width = pct + '%';
      if      (pct > 50) fill.style.background = '#1f7a4d';
      else if (pct > 20) fill.style.background = '#e0a526';
      else               fill.style.background = '#b3261e';
      timeLabel.textContent = Math.ceil(remaining / 1000) + 's';
    }, 250);
  }

  // ── Show OTP on-screen (demo/fallback when email API fails) ─────────────
  function showDemoOtp(otp) {
    const box  = $('#demoOtpBox');
    const code = $('#demoOtpCode');
    if (box)  box.style.display = 'block';
    if (code) code.textContent  = otp;
  }

  // ── Send OTP ─────────────────────────────────────────────────────────────

  const sendOtpBtn = $('#sendOtpBtn');
  const otpSection  = $('#otpSection');

  if (sendOtpBtn) {
    sendOtpBtn.onclick = async () => {
      const adminEmailInput = $('#adminEmailInput');
      const captchaInput    = $('#captchaInput');
      if (!adminEmailInput || !captchaInput) return;

      const enteredEmail = adminEmailInput.value.trim();
      const userCaptcha  = parseInt(captchaInput.value.trim(), 10);

      if (enteredEmail !== CONFIG.ADMIN_EMAIL) {
        return toast('⛔ Unauthorized admin email address!');
      }

      if (isNaN(userCaptcha) || userCaptcha !== expectedCaptchaSum) {
        newCaptcha();
        return toast('❌ Incorrect captcha. A new question has been set.');
      }

      // Generate fresh OTP + set expiry
      generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
      otpExpiresAt = Date.now() + OTP_TTL_MS;

      sendOtpBtn.textContent = '⏳ Sending…';
      sendOtpBtn.disabled    = true;

      // Check if Brevo key is configured
      const brevoKeyValid = CONFIG.BREVO_API_KEY &&
                            CONFIG.BREVO_API_KEY !== '' &&
                            !CONFIG.BREVO_API_KEY.includes('PLACEHOLDER');

      if (!brevoKeyValid) {
        toast('📧 Email not configured — OTP shown below (demo mode)');
        if (otpSection) otpSection.style.display = 'block';
        showDemoOtp(generatedOtp);
        startCountdown();
        return;
      }

      try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'accept':       'application/json',
            'api-key':      CONFIG.BREVO_API_KEY,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            sender: { name: 'Pagewise Books Admin', email: CONFIG.ADMIN_EMAIL },
            to:     [{ email: enteredEmail, name: 'Admin' }],
            subject: 'Your Admin Login OTP – valid for 55 seconds',
            htmlContent: `
              <div style="font-family:sans-serif;max-width:430px;margin:auto;border:1px solid #d5dbe6;border-radius:12px;overflow:hidden">
                <div style="background:#14213d;padding:20px 28px">
                  <h2 style="color:#fff;margin:0;font-family:Georgia,serif;font-size:1.4rem">📚 Pagewise Books</h2>
                  <p style="color:#9aadcc;margin:4px 0 0;font-size:.85rem">Admin Authentication</p>
                </div>
                <div style="padding:28px">
                  <p style="margin:0 0 8px">Hello Admin,</p>
                  <p style="margin:0 0 20px;color:#5b6678">Your one-time password for Pagewise Books admin login:</p>
                  <div style="font-size:2.2rem;font-weight:700;letter-spacing:12px;text-align:center;
                              color:#14213d;padding:18px;background:#eef1f6;border-radius:10px;
                              margin-bottom:18px;font-family:monospace">${generatedOtp}</div>
                  <p style="color:#b3261e;font-weight:600;margin:0 0 16px">
                    ⚠ This OTP expires in <strong>55 seconds</strong>. Do not share it with anyone.
                  </p>
                  <hr style="border:none;border-top:1px solid #d5dbe6;margin-bottom:16px">
                  <p style="font-size:.82rem;color:#9aa3b5;margin:0">
                    If you did not request this, please ignore this email.
                  </p>
                </div>
              </div>`
          })
        });

        if (response.ok) {
          toast('✅ OTP sent to ' + enteredEmail + ' — valid for 55 seconds');
          if (otpSection) otpSection.style.display = 'block';
          startCountdown();
        } else {
          // Brevo error — log hint, show OTP on screen for demo
          const errData = await response.json().catch(() => ({}));
          const msg = errData.message || 'Unknown error';
          let hint = msg;
          if (msg.toLowerCase().includes('api key') || msg.toLowerCase().includes('enabled')) {
            hint = 'Fix: app.brevo.com → SMTP & API → API Keys → re-generate key → paste in js/data.js';
          } else if (msg.toLowerCase().includes('sender')) {
            hint = 'Fix: app.brevo.com → Senders & IP → verify ' + CONFIG.ADMIN_EMAIL;
          }
          console.warn('[Pagewise] Brevo error:', msg, '\n👉', hint);
          toast('📧 Email failed — OTP shown on screen (demo mode)');
          if (otpSection) otpSection.style.display = 'block';
          showDemoOtp(generatedOtp);
          startCountdown();
        }
      } catch (err) {
        console.warn('[Pagewise] Network error:', err);
        toast('📧 Network error — OTP shown on screen (demo mode)');
        if (otpSection) otpSection.style.display = 'block';
        showDemoOtp(generatedOtp);
        startCountdown();
      }
    };
  }

  // ── Verify OTP & Login ───────────────────────────────────────────────────

  const adminForm = $('#adminForm');
  if (adminForm) {
    adminForm.onsubmit = e => {
      e.preventDefault();
      const captchaInput = $('#captchaInput');
      const otpInput     = $('#otpInput');
      if (!captchaInput || !otpInput) return;

      const userCaptcha = parseInt(captchaInput.value.trim(), 10);
      if (isNaN(userCaptcha) || userCaptcha !== expectedCaptchaSum) {
        return toast('❌ Incorrect captcha. Try again.');
      }

      if (!generatedOtp) {
        return toast('⚠ No OTP issued yet. Click "Send OTP to Email" first.');
      }
      if (Date.now() > otpExpiresAt) {
        expireOtp();
        return;
      }

      const enteredOtp = otpInput.value.trim();
      if (enteredOtp !== generatedOtp) {
        return toast('❌ Incorrect OTP. Please check the code and try again.');
      }

      // ✅ Authenticated
      stopCountdown();
      sessionStorage.setItem('adm', '1');
      location.href = 'admin.html';
    };
  }
})();

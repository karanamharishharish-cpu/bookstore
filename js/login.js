(function () {
  const next = new URLSearchParams(location.search).get('next') || '';
  const go = def => { location.href = /^[a-z]+\.html$/.test(next) ? next : def; };
  const setUser = u => { store.set('user', u); go('books.html'); };

  if (CONFIG.GOOGLE_CLIENT_ID) {
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

  // ── Admin OTP & Captcha ────────────────────────────────────────────────────

  const OTP_TTL_MS = 55000; // 55 seconds — expires before the 60-second mark

  let generatedOtp   = '';
  let otpExpiresAt   = 0;      // epoch ms; 0 = no OTP issued
  let otpTimerHandle = null;   // setInterval reference for the countdown

  // Generate a fresh math captcha
  let num1 = Math.floor(Math.random() * 10) + 1;
  let num2 = Math.floor(Math.random() * 10) + 1;
  let expectedCaptchaSum = num1 + num2;

  const captchaQuestion = $('#captchaQuestion');
  if (captchaQuestion) {
    captchaQuestion.textContent = `Solve: ${num1} + ${num2} =`;
  }

  function newCaptcha() {
    num1 = Math.floor(Math.random() * 10) + 1;
    num2 = Math.floor(Math.random() * 10) + 1;
    expectedCaptchaSum = num1 + num2;
    if (captchaQuestion) captchaQuestion.textContent = `Solve: ${num1} + ${num2} =`;
    const captchaInput = $('#captchaInput');
    if (captchaInput) captchaInput.value = '';
  }

  // ── Countdown helpers ──────────────────────────────────────────────────────

  function stopCountdown() {
    if (otpTimerHandle) { clearInterval(otpTimerHandle); otpTimerHandle = null; }
    const bar = $('#otpCountdownBar');
    if (bar) bar.style.display = 'none';
  }

  function expireOtp() {
    generatedOtp  = '';
    otpExpiresAt  = 0;
    stopCountdown();

    // Hide OTP section and re-enable Send OTP button
    const otpSection = $('#otpSection');
    const sendOtpBtn = $('#sendOtpBtn');
    if (otpSection) otpSection.style.display = 'none';
    if (sendOtpBtn) {
      sendOtpBtn.textContent = 'Send OTP';
      sendOtpBtn.disabled = false;
    }
    // Clear any typed OTP
    const otpInput = $('#otpInput');
    if (otpInput) otpInput.value = '';

    toast('OTP has expired. Please request a new one.');
    newCaptcha(); // Refresh captcha after expiry
  }

  function startCountdown() {
    stopCountdown(); // Clear any existing timer first

    const bar       = $('#otpCountdownBar');
    const fill      = $('#otpCountdownFill');
    const timeLabel = $('#otpTimeLabel');
    if (!bar || !fill || !timeLabel) return;

    bar.style.display = 'block';
    const totalMs = OTP_TTL_MS;

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
      const pct = (remaining / totalMs) * 100;
      fill.style.width = pct + '%';
      // Colour shift: green → yellow → red
      if (pct > 50)       fill.style.background = '#1f7a4d';
      else if (pct > 20)  fill.style.background = '#e0a526';
      else                fill.style.background = '#b3261e';

      timeLabel.textContent = Math.ceil(remaining / 1000) + 's';
    }, 250);
  }

  // ── Send OTP button ────────────────────────────────────────────────────────

  const sendOtpBtn = $('#sendOtpBtn');
  const otpSection  = $('#otpSection');

  if (sendOtpBtn) {
    sendOtpBtn.onclick = async () => {
      const adminEmailInput = $('#adminEmailInput');
      const captchaInput    = $('#captchaInput');
      if (!adminEmailInput || !captchaInput) return;

      const enteredEmail = adminEmailInput.value.trim();
      const userCaptcha  = parseInt(captchaInput.value.trim(), 10);

      // Validate admin e-mail
      if (enteredEmail !== CONFIG.ADMIN_EMAIL) {
        return toast('Unauthorized admin email address!');
      }

      // Validate captcha
      if (isNaN(userCaptcha) || userCaptcha !== expectedCaptchaSum) {
        newCaptcha();
        return toast('Incorrect captcha answer. Try again.');
      }

      // Generate a fresh 6-digit OTP and set expiry timestamp
      generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
      otpExpiresAt = Date.now() + OTP_TTL_MS;

      sendOtpBtn.textContent = 'Sending…';
      sendOtpBtn.disabled    = true;

      try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'accept':       'application/json',
            'api-key':      CONFIG.BREVO_API_KEY,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            sender:      { name: 'Pagewise Books Admin', email: CONFIG.ADMIN_EMAIL },
            to:          [{ email: enteredEmail, name: 'Admin' }],
            subject:     'Your Admin Login OTP – valid for 55 seconds',
            htmlContent: `
              <div style="font-family:sans-serif;max-width:420px;margin:auto;border:1px solid #d5dbe6;border-radius:10px;overflow:hidden">
                <div style="background:#14213d;padding:18px 24px">
                  <h2 style="color:#fff;margin:0;font-family:Georgia,serif">Pagewise Books</h2>
                </div>
                <div style="padding:24px">
                  <p>Hello Admin,</p>
                  <p>Your one-time password (OTP) for the Pagewise Books admin login is:</p>
                  <div style="font-size:2rem;font-weight:700;letter-spacing:8px;text-align:center;color:#14213d;padding:16px;background:#eef1f6;border-radius:8px;margin:16px 0">${generatedOtp}</div>
                  <p style="color:#b3261e;font-weight:600">⚠ This OTP expires in 55 seconds. Do not share it with anyone.</p>
                  <hr style="border:none;border-top:1px solid #d5dbe6">
                  <p style="font-size:.85rem;color:#5b6678">If you did not request this OTP, please ignore this email.</p>
                </div>
              </div>`
          })
        });

        if (response.ok) {
          toast('OTP sent to ' + enteredEmail + ' — valid for 55 seconds');
          if (otpSection) otpSection.style.display = 'block';
          startCountdown();
          // Keep button disabled during OTP window; expireOtp() re-enables it
        } else {
          const errData = await response.json().catch(() => ({}));
          toast('Failed to send OTP: ' + (errData.message || 'Check API key.'));
          // Reset on failure so the admin can try again
          generatedOtp = '';
          otpExpiresAt = 0;
          sendOtpBtn.textContent = 'Send OTP';
          sendOtpBtn.disabled    = false;
        }
      } catch (err) {
        toast('Network error while sending OTP.');
        generatedOtp = '';
        otpExpiresAt = 0;
        sendOtpBtn.textContent = 'Send OTP';
        sendOtpBtn.disabled    = false;
      }
    };
  }

  // ── Verify OTP & Login ─────────────────────────────────────────────────────

  const adminForm = $('#adminForm');
  if (adminForm) {
    adminForm.onsubmit = e => {
      e.preventDefault();
      const captchaInput = $('#captchaInput');
      const otpInput     = $('#otpInput');
      if (!captchaInput || !otpInput) return;

      // Re-check captcha on submit
      const userCaptcha = parseInt(captchaInput.value.trim(), 10);
      if (isNaN(userCaptcha) || userCaptcha !== expectedCaptchaSum) {
        return toast('Incorrect captcha answer. Try again.');
      }

      // Check OTP presence and time-validity
      if (!generatedOtp) {
        return toast('No OTP issued. Please click "Send OTP" first.');
      }
      if (Date.now() > otpExpiresAt) {
        expireOtp();
        return; // expireOtp() already shows the toast
      }

      const enteredOtp = otpInput.value.trim();
      if (enteredOtp !== generatedOtp) {
        return toast('Incorrect OTP. Please check the code sent to your email.');
      }

      // ✅ Success
      stopCountdown();
      sessionStorage.setItem('adm', '1');
      location.href = 'admin.html';
    };
  }
})();

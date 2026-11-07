(function () {
  const next = new URLSearchParams(location.search).get('next') || '';
  const go = def => { location.href = /^[a-z]+\.html$/.test(next) ? next : def; };
  const setUser = u => { store.set('user', u); go('books.html'); };

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

  const OTP_TTL_MS = 55000;
  let generatedOtp   = '';
  let otpExpiresAt   = 0;
  let otpTimerHandle = null;

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

  function stopCountdown() {
    if (otpTimerHandle) { clearInterval(otpTimerHandle); otpTimerHandle = null; }
    const bar = $('#otpCountdownBar');
    if (bar) bar.style.display = 'none';
  }

  function expireOtp() {
    generatedOtp = '';
    otpExpiresAt = 0;
    stopCountdown();
    const otpSection = $('#otpSection');
    const sendOtpBtn = $('#sendOtpBtn');
    const otpInput   = $('#otpInput');

    if (otpSection) otpSection.style.display = 'none';
    if (otpInput)   otpInput.value = '';
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
      timeLabel.textContent = Math.ceil(remaining / 1000) + 's';
    }, 250);
  }

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

      generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
      otpExpiresAt = Date.now() + OTP_TTL_MS;

      sendOtpBtn.textContent = '⏳ Sending…';
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
            sender: { name: 'Pagewise Books Admin', email: CONFIG.ADMIN_EMAIL },
            to:     [{ email: enteredEmail, name: 'Admin' }],
            subject: 'Your Admin Login OTP',
            htmlContent: `<p>Your verification code is: <strong>${generatedOtp}</strong></p>`
          })
        });

        const resData = await response.json().catch(() => ({}));

        if (response.ok) {
          toast('✅ OTP sent successfully to ' + enteredEmail);
          if (otpSection) otpSection.style.display = 'block';
          startCountdown();
        } else {
          console.error('Brevo API Error Details:', resData);
          toast('❌ Brevo error: ' + (resData.message || response.statusText));
          sendOtpBtn.textContent = '📨 Send OTP to Email';
          sendOtpBtn.disabled    = false;
        }
      } catch (err) {
        console.error('Network Exception:', err);
        toast('❌ Network error while calling Brevo API.');
        sendOtpBtn.textContent = '📨 Send OTP to Email';
        sendOtpBtn.disabled    = false;
      }
    };
  }

  const adminForm = $('#adminForm');
  if (adminForm) {
    adminForm.onsubmit = e => {
      e.preventDefault();
      const otpInput = $('#otpInput');
      if (!otpInput) return;

      if (!generatedOtp || Date.now() > otpExpiresAt) {
        return toast('⚠ OTP expired or missing. Request a new one.');
      }

      if (otpInput.value.trim() !== generatedOtp) {
        return toast('❌ Incorrect OTP.');
      }

      stopCountdown();
      sessionStorage.setItem('adm', '1');
      location.href = 'admin.html';
    };
  }
})();

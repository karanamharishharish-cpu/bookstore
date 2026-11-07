(function () {
  const next = new URLSearchParams(location.search).get('next') || '';
  const go = def => { location.href = /^[a-z]+\.html$/.test(next) ? next : def; };
  const setUser = u => { store.set('user', u); go('books.html'); };

  if (CONFIG.GOOGLE_CLIENT_ID) {
    const demoBox = $('#demoBox');
    if (demoBox) demoBox.hidden = true;
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
      const gbtn = $('#gbtn');
      if (gbtn) google.accounts.id.renderButton(gbtn, { theme: 'outline', size: 'large', text: 'signin_with' });
    };
    document.head.appendChild(s);
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

  // Admin OTP & Captcha Implementation
  let generatedOtp = '';
  let num1 = Math.floor(Math.random() * 10) + 1;
  let num2 = Math.floor(Math.random() * 10) + 1;
  let expectedCaptchaSum = num1 + num2;

  const captchaQuestion = $('#captchaQuestion');
  if (captchaQuestion) {
    captchaQuestion.textContent = `${num1} + ${num2} =`;
  }

  const validAdminEmail = "11249A125@kanchiuniv.ac.in"; // Authorized admin email
  const sendOtpBtn = $('#sendOtpBtn');
  const otpSection = $('#otpSection'); // Optional: reference if you want to toggle visibility dynamically

  if (sendOtpBtn) {
    sendOtpBtn.onclick = async () => {
      const adminEmailInput = $('#adminEmailInput');
      const captchaInput = $('#captchaInput');

      if (!adminEmailInput || !captchaInput) return;

      const enteredEmail = adminEmailInput.value.trim();
      const userCaptcha = parseInt(captchaInput.value.trim(), 10);

      // Validate admin email
      if (enteredEmail !== validAdminEmail) {
        return toast('Unauthorized admin email address!');
      }

      // Validate math captcha before dispatching OTP
      if (userCaptcha !== expectedCaptchaSum) {
        // Refresh captcha on failure
        num1 = Math.floor(Math.random() * 10) + 1;
        num2 = Math.floor(Math.random() * 10) + 1;
        expectedCaptchaSum = num1 + num2;
        if (captchaQuestion) captchaQuestion.textContent = `${num1} + ${num2} =`;
        captchaInput.value = '';
        return toast('Incorrect captcha answer. Try again.');
      }

      generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
      sendOtpBtn.textContent = 'Sending...';
      sendOtpBtn.disabled = true;

      try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'api-key': CONFIG.BREVO_API_KEY,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            sender: { name: "Pagewise Books Admin", email: validAdminEmail },
            to: [{ email: enteredEmail, name: "Admin" }],
            subject: "Your Admin Login OTP",
            htmlContent: `<p>Hello Admin,</p><p>Your verification code for Pagewise Books admin login is: <strong>${generatedOtp}</strong></p>`
          })
        });

        if (response.ok) {
          toast('OTP sent successfully to ' + enteredEmail);
          if (otpSection) otpSection.style.display = 'block';
        } else {
          const errData = await response.json().catch(() => ({}));
          toast('Failed to send OTP: ' + (errData.message || 'Check API key.'));
          sendOtpBtn.textContent = 'Send OTP';
          sendOtpBtn.disabled = false;
        }
      } catch (err) {
        toast('Network error while sending OTP.');
        sendOtpBtn.textContent = 'Send OTP';
        sendOtpBtn.disabled = false;
      }
    };
  }

  const adminForm = $('#adminForm');
  if (adminForm) {
    adminForm.onsubmit = e => {
      e.preventDefault();
      const captchaInput = $('#captchaInput');
      const otpInput = $('#otpInput');

      if (!captchaInput || !otpInput) return;

      const userCaptcha = parseInt(captchaInput.value.trim(), 10);
      if (userCaptcha !== expectedCaptchaSum) {
        return toast('Incorrect captcha answer. Try again.');
      }

      const enteredOtp = otpInput.value.trim();
      if (!generatedOtp || enteredOtp !== generatedOtp) {
        return toast('Incorrect or missing OTP. Please request and enter the OTP.');
      }

      sessionStorage.setItem('adm', '1');
      location.href = 'admin.html';
    };
  }
})();

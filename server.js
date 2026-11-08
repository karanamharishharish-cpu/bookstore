/**
 * Pagewise Books — OTP Proxy Server
 * Deploy this on Render as a "Web Service" (not Static Site).
 * Set BREVO_API_KEY and ADMIN_EMAIL as Environment Variables in Render dashboard.
 */

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve all static files (HTML, CSS, JS, images) from the project root
app.use(express.static(path.join(__dirname)));

// ── POST /send-otp ────────────────────────────────────────────────────────────
app.post('/send-otp', async (req, res) => {
  const { toEmail, otp } = req.body;

  if (!toEmail || !otp) {
    return res.status(400).json({ error: 'Missing toEmail or otp' });
  }

  const BREVO_API_KEY  = process.env.BREVO_API_KEY;
  const SENDER_EMAIL   = process.env.SENDER_EMAIL || 'karanamharishharish@gmail.com';
  const SENDER_NAME    = 'Pagewise Books';

  if (!BREVO_API_KEY) {
    return res.status(500).json({ error: 'BREVO_API_KEY not set on server' });
  }

  try {
    const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept':       'application/json',
        'api-key':      BREVO_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender:      { name: SENDER_NAME, email: SENDER_EMAIL },
        to:          [{ email: toEmail, name: 'Admin' }],
        subject:     'Your Admin Login OTP',
        htmlContent: `<p>Your verification code is: <strong>${otp}</strong></p>
                      <p style="color:#b3261e"><small>Valid for 55 seconds only. Do not share.</small></p>`
      })
    });

    const data = await brevoRes.json().catch(() => ({}));

    if (brevoRes.ok) {
      return res.json({ success: true });
    } else {
      console.error('[Pagewise] Brevo error:', brevoRes.status, data);
      return res.status(brevoRes.status).json({ error: data.message || 'Brevo error' });
    }
  } catch (err) {
    console.error('[Pagewise] Network error:', err.message);
    return res.status(502).json({ error: 'Failed to reach Brevo' });
  }
});

// Fallback: serve index.html for all other GET routes
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => console.log(`✅ Pagewise Books running on port ${PORT}`));

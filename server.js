/**
 * Pagewise Books — Backend Server
 * - Serves static files
 * - Proxies OTP emails via Brevo (keeps API key secret)
 * - Admin auth: JWT-based password login + OTP for password reset
 * - Books & Orders stored in MongoDB Atlas
 */

const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET   = process.env.JWT_SECRET   || 'pagewise-dev-secret-change-in-prod';
const MONGODB_URI  = process.env.MONGODB_URI;
const ADMIN_EMAIL  = (process.env.ADMIN_EMAIL || '11249a125@kanchiuniv.ac.in').toLowerCase().trim();
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'karanamharishharish@gmail.com';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ── Mongoose Models ────────────────────────────────────────────────────────────

const AdminSchema = new mongoose.Schema({
  email:        { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, default: null }
}, { timestamps: true });

const BookSchema = new mongoose.Schema({
  id:       { type: Number, required: true, unique: true },
  title:    String, author: String, category: String,
  price:    Number, stock:  Number, desc: String, img: { type: String, default: '' }
});

const OrderSchema = new mongoose.Schema({
  id:         { type: String, required: true, unique: true },
  trk:        String,
  date:       String,
  email:      String,
  customer:   { name: String, phone: String, addr: String },
  items:      [{ title: String, price: Number, qty: Number }],
  total:      Number,
  pay:        String,
  payStatus:  String,
  status:     { type: String, default: 'Placed' },
  times:      { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

const OTPSchema = new mongoose.Schema({
  email:     { type: String, required: true },
  otp:       { type: String, required: true },
  expiresAt: { type: Date,   required: true }
});
OTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Admin  = mongoose.model('Admin',  AdminSchema);
const Book   = mongoose.model('Book',   BookSchema);
const Order  = mongoose.model('Order',  OrderSchema);
const OTP    = mongoose.model('OTP',    OTPSchema);

// ── Seed books ─────────────────────────────────────────────────────────────────
const SEED_BOOKS = [
  { id:1,  title:'Wings of Fire',              author:'A.P.J. Abdul Kalam',   category:'Biography', price:250, stock:12, desc:'The life story of the Missile Man of India, told with warmth and humility.', img:'' },
  { id:2,  title:'The Alchemist',              author:'Paulo Coelho',          category:'Fiction',   price:299, stock:15, desc:'A shepherd boy travels in search of treasure and finds his purpose.', img:'' },
  { id:3,  title:'Clean Code',                 author:'Robert C. Martin',      category:'Technology',price:599, stock:8,  desc:'A handbook of agile software craftsmanship and readable code.', img:'' },
  { id:4,  title:'Atomic Habits',              author:'James Clear',           category:'Self Help', price:499, stock:20, desc:'Small daily changes that compound into remarkable results.', img:'' },
  { id:5,  title:'The Discovery of India',     author:'Jawaharlal Nehru',      category:'History',   price:350, stock:9,  desc:'A sweeping account of Indian history, culture and philosophy.', img:'' },
  { id:6,  title:'Panchatantra Tales',         author:'Vishnu Sharma',         category:'Children',  price:150, stock:25, desc:'Classic animal fables that teach wisdom and good conduct.', img:'' },
  { id:7,  title:'Introduction to Algorithms', author:'Thomas H. Cormen',      category:'Technology',price:899, stock:6,  desc:'The standard reference on algorithms and data structures.', img:'' },
  { id:8,  title:'The Guide',                  author:'R.K. Narayan',          category:'Fiction',   price:275, stock:10, desc:'A tour guide becomes an unlikely spiritual teacher.', img:'' },
  { id:9,  title:'Ikigai',                     author:'Hector Garcia',         category:'Self Help', price:325, stock:14, desc:'The Japanese secret to a long and happy life.', img:'' },
  { id:10, title:'India After Gandhi',         author:'Ramachandra Guha',      category:'History',   price:699, stock:7,  desc:'The history of the largest democracy since 1947.', img:'' },
  { id:11, title:'Computer Networks',          author:'Andrew S. Tanenbaum',   category:'Technology',price:750, stock:11, desc:'Layered networking from the physical layer to applications.', img:'' },
  { id:12, title:'Malgudi Days',               author:'R.K. Narayan',          category:'Fiction',   price:225, stock:13, desc:'Short stories from the beloved fictional town of Malgudi.', img:'' }
];

// ── Connect MongoDB & seed ──────────────────────────────────────────────────────
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(async () => {
      console.log('✅ MongoDB connected');
      // Seed books if empty
      const count = await Book.countDocuments();
      if (count === 0) {
        await Book.insertMany(SEED_BOOKS);
        console.log('✅ Seeded', SEED_BOOKS.length, 'books');
      }
      // Ensure admin document exists
      await Admin.findOneAndUpdate(
        { email: ADMIN_EMAIL },
        { $setOnInsert: { email: ADMIN_EMAIL, passwordHash: null } },
        { upsert: true, new: true }
      );
    })
    .catch(err => console.error('❌ MongoDB error:', err.message));
} else {
  console.warn('⚠️  MONGODB_URI not set — database features unavailable');
}

// ── JWT Middleware ──────────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    if (payload.role !== 'admin') throw new Error('Not admin');
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── Brevo email helper ──────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html }) {
  if (!BREVO_API_KEY) {
    console.error('❌ BREVO_API_KEY not configured');
    throw new Error('BREVO_API_KEY not configured on server');
  }
  console.log(`📨 Sending email to ${to} from ${SENDER_EMAIL}...`);
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'accept': 'application/json', 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Pagewise Books', email: SENDER_EMAIL },
      to: [{ email: to, name: 'Admin' }],
      subject,
      htmlContent: html
    })
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    console.error('❌ Brevo API error response:', r.status, d);
    throw new Error(d.message || ('Brevo error ' + r.status));
  }
  console.log('✅ Brevo email dispatched successfully');
}

// ── POST /send-otp  (keep for backward compat) ─────────────────────────────────
app.post('/send-otp', async (req, res) => {
  const { toEmail, otp } = req.body;
  if (!toEmail || !otp) return res.status(400).json({ error: 'Missing toEmail or otp' });
  try {
    await sendEmail({
      to: toEmail, subject: 'Your Admin Login OTP',
      html: `<p>Your verification code is: <strong>${otp}</strong></p><p style="color:#b3261e"><small>Valid for 55 seconds only. Do not share.</small></p>`
    });
    res.json({ success: true });
  } catch (err) {
    console.error('❌ /send-otp error:', err);
    res.status(502).json({ error: err.message });
  }
});

// ── POST /api/admin/login ───────────────────────────────────────────────────────
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (email.toLowerCase().trim() !== ADMIN_EMAIL) return res.status(401).json({ error: 'Invalid credentials' });
    if (MONGODB_URI && mongoose.connection.readyState === 1) {
      const admin = await Admin.findOne({ email: email.toLowerCase().trim() });
      if (!admin || !admin.passwordHash) return res.status(401).json({ error: 'NO_PASSWORD', message: 'No password set. Click "Forgot Password?" to create one.' });
      const ok = await bcrypt.compare(password, admin.passwordHash);
      if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ email: email.toLowerCase().trim(), role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token });
  } catch (err) {
    console.error('❌ login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/send-reset-otp ─────────────────────────────────────────────
app.post('/api/admin/send-reset-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || email.toLowerCase().trim() !== ADMIN_EMAIL) {
      return res.status(400).json({ error: 'Invalid admin email' });
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    if (MONGODB_URI && mongoose.connection.readyState === 1) {
      await OTP.deleteMany({ email: email.toLowerCase().trim() });
      await OTP.create({ email: email.toLowerCase().trim(), otp, expiresAt });
    }
    await sendEmail({
      to: email.trim(), subject: 'Pagewise Books — Password Reset OTP',
      html: `<div style="font-family:sans-serif;max-width:420px;margin:auto;border:1px solid #d5dbe6;border-radius:12px;overflow:hidden">
        <div style="background:#1a3c8f;padding:20px 28px"><h2 style="color:#fff;margin:0">📚 Pagewise Books</h2><p style="color:#9aadcc;margin:4px 0 0;font-size:.85rem">Password Reset</p></div>
        <div style="padding:28px">
          <p>Hi Admin,</p><p>Your OTP to reset your password:</p>
          <div style="font-size:2.2rem;font-weight:700;letter-spacing:12px;text-align:center;color:#1a3c8f;padding:18px;background:#eef1f6;border-radius:10px;margin-bottom:18px;font-family:monospace">${otp}</div>
          <p style="color:#b3261e;font-weight:600">⚠ Valid for <strong>10 minutes</strong>. Do not share.</p>
        </div></div>`
    });
    res.json({ success: true });
  } catch (err) {
    console.error('❌ send-reset-otp error:', err);
    res.status(502).json({ error: err.message });
  }
});

// ── POST /api/admin/verify-reset-otp ───────────────────────────────────────────
app.post('/api/admin/verify-reset-otp', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) return res.status(400).json({ error: 'Missing fields' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    if (MONGODB_URI && mongoose.connection.readyState === 1) {
      const record = await OTP.findOne({ email: email.toLowerCase().trim(), otp });
      if (!record || record.expiresAt < new Date()) {
        await OTP.deleteMany({ email: email.toLowerCase().trim() });
        return res.status(400).json({ error: 'Invalid or expired OTP' });
      }
      const passwordHash = await bcrypt.hash(newPassword, 12);
      await Admin.findOneAndUpdate({ email: email.toLowerCase().trim() }, { passwordHash }, { upsert: true });
      await OTP.deleteMany({ email: email.toLowerCase().trim() });
    }
    const token = jwt.sign({ email: email.toLowerCase().trim(), role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ success: true, token });
  } catch (err) {
    console.error('❌ verify-reset-otp error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/books ──────────────────────────────────────────────────────────────
app.get('/api/books', async (req, res) => {
  if (!MONGODB_URI) return res.status(503).json({ error: 'Database not configured' });
  const books = await Book.find({}, '-_id -__v').sort({ id: 1 });
  res.json(books);
});

// ── POST /api/books ─────────────────────────────────────────────────────────────
app.post('/api/books', requireAdmin, async (req, res) => {
  const books = await Book.find().sort({ id: -1 }).limit(1);
  const nextId = books.length ? books[0].id + 1 : 1;
  const { title, author, category, price, stock, desc, img } = req.body;
  if (!title || !author) return res.status(400).json({ error: 'Title and author required' });
  const book = await Book.create({ id: nextId, title, author, category, price: +price, stock: +stock, desc, img: img || '' });
  res.json({ success: true, book });
});

// ── PUT /api/books/:id ──────────────────────────────────────────────────────────
app.put('/api/books/:id', requireAdmin, async (req, res) => {
  const { title, author, category, price, stock, desc, img } = req.body;
  const book = await Book.findOneAndUpdate({ id: +req.params.id }, { title, author, category, price: +price, stock: +stock, desc, img: img || '' }, { new: true });
  if (!book) return res.status(404).json({ error: 'Book not found' });
  res.json({ success: true, book });
});

// ── DELETE /api/books/:id ───────────────────────────────────────────────────────
app.delete('/api/books/:id', requireAdmin, async (req, res) => {
  await Book.findOneAndDelete({ id: +req.params.id });
  res.json({ success: true });
});

// ── GET /api/orders ─────────────────────────────────────────────────────────────
app.get('/api/orders', requireAdmin, async (req, res) => {
  const orders = await Order.find({}, '-_id -__v').sort({ createdAt: -1 });
  res.json(orders);
});

// ── GET /api/orders/my?email=xxx ────────────────────────────────────────────────
app.get('/api/orders/my', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const orders = await Order.find({ email: email.toLowerCase() }, '-_id -__v').sort({ createdAt: -1 });
  res.json(orders);
});

// ── POST /api/orders ─────────────────────────────────────────────────────────────
app.post('/api/orders', async (req, res) => {
  if (!MONGODB_URI) return res.status(503).json({ error: 'Database not configured' });
  const { id, trk, date, email, customer, items, total, pay, payStatus } = req.body;
  if (!id || !email || !items) return res.status(400).json({ error: 'Missing required fields' });
  // Deduct stock
  for (const item of items) {
    const book = await Book.findOne({ title: item.title });
    if (book) {
      book.stock = Math.max(0, book.stock - item.qty);
      await book.save();
    }
  }
  const order = await Order.create({ id, trk, date, email: email.toLowerCase(), customer, items, total, pay, payStatus, status: 'Placed', times: { Placed: date } });
  res.json({ success: true, order });
});

// ── PUT /api/orders/:id ──────────────────────────────────────────────────────────
app.put('/api/orders/:id', requireAdmin, async (req, res) => {
  const { status } = req.body;
  const now = new Date().toLocaleString('en-IN');
  const order = await Order.findOneAndUpdate(
    { id: req.params.id },
    { status, $set: { [`times.${status}`]: now } },
    { new: true }
  );
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json({ success: true, order });
});

// ── Fallback ─────────────────────────────────────────────────────────────────────
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => console.log(`✅ Pagewise Books running on port ${PORT}`));

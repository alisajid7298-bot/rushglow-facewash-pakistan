const crypto = require('crypto');
const { Pool } = require('@neondatabase/serverless');
const ADMIN_EMAIL = 'ali.sajid7298@gmail.com';
const ADMIN_EMAILS = [ADMIN_EMAIL, 'rushglow35@gmail.com'];
const key = () => process.env.ADMIN_AUTH_SECRET || process.env.RESEND_API_KEY || '';
const sign = value => crypto.createHmac('sha256', key()).update(value).digest('hex');
function equal(a, b) {
  return /^[a-f0-9]{64}$/.test(a || '') && /^[a-f0-9]{64}$/.test(b || '') &&
    crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
function cookie(req, name) {
  try {
    const match = (req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : '';
  } catch { return ''; }
}
const clearCookie = name => name + '=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'POST' && (req.body || {}).action === 'logout') {
    res.setHeader('Set-Cookie', [clearCookie('rg_admin'), clearCookie('rg_otp')]);
    return res.json({ ok: true });
  }
  if (!key()) return res.status(503).json({ error: 'Admin authentication is not configured' });
  if (req.method === 'GET') {
    const parts = cookie(req, 'rg_admin').split('.');
    const exp = parts[0], sig = parts[1];
    const ok = parts.length === 2 && /^\d+$/.test(exp || '') &&
      Number(exp) > Date.now() && equal(sig, sign(exp));
    return res.status(ok ? 200 : 401).json({ ok });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action, email, code } = req.body || {};
  if (!['send', 'verify'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
  if (action === 'send' && email && !ADMIN_EMAILS.includes(String(email).trim().toLowerCase()))
    return res.status(403).json({ error: 'Only the website owner can receive login codes' });
  if (action === 'verify' && !/^\d{6}$/.test(String(code || '').trim()))
    return res.status(401).json({ error: 'Enter the 6-digit verification code' });
  let pool;
  try {
    const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING;
    if (!connectionString || !process.env.RESEND_API_KEY)
      return res.status(503).json({ error: 'Admin login service is not configured' });
    pool = new Pool({ connectionString });
    await pool.query(`CREATE TABLE IF NOT EXISTS admin_login_challenges (
      email TEXT PRIMARY KEY, challenge TEXT NOT NULL, code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    if (action === 'send') {
      const otp = String(crypto.randomInt(100000, 1000000));
      const challenge = crypto.randomBytes(32).toString('hex');
      const reserved = await pool.query(`INSERT INTO admin_login_challenges
        (email,challenge,code_hash,expires_at,attempts,sent_at)
        VALUES($1,$2,$3,NOW()+INTERVAL '10 minutes',0,NOW())
        ON CONFLICT(email) DO UPDATE SET challenge=$2,code_hash=$3,
          expires_at=NOW()+INTERVAL '10 minutes',attempts=0,sent_at=NOW()
        WHERE admin_login_challenges.sent_at <= NOW()-INTERVAL '60 seconds'
        RETURNING challenge`, [ADMIN_EMAIL, challenge, sign(otp + '.' + challenge)]);
      if (!reserved.rows.length)
        return res.status(429).json({ error: 'Please wait one minute before requesting another code' });
      const deliveries = await Promise.all(ADMIN_EMAILS.map(async recipient => {
      try {
      const sent = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.ADMIN_EMAIL_FROM || 'Rush Glow <onboarding@resend.dev>', to: [recipient],
          subject: 'RUSHGLOW control panel access request',
          html: '<h2>RUSHGLOW Control Panel</h2><p>A control panel login was requested. Share this code only with the person you want to allow to manage products and orders.</p><h1>' + otp + '</h1><p>Expires in 10 minutes. This code does not grant GitHub, Vercel or domain access.</p>'
        })
      });
      return { recipient, ok: sent.ok };
      } catch { return { recipient, ok: false }; }
      }));
      const delivered = deliveries.filter(result => result.ok);
      if (!delivered.length) {
        await pool.query('DELETE FROM admin_login_challenges WHERE email=$1 AND challenge=$2', [ADMIN_EMAIL, challenge]);
        console.error('Admin login emails failed');
        return res.status(502).json({ error: 'Email could not be sent. Please try again' });
      }
      res.setHeader('Set-Cookie', 'rg_otp=' + challenge + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=600');
      return res.json({ ok: true, warning: delivered.length < ADMIN_EMAILS.length ? 'The code was sent to only one admin email address. Verify the email sending domain to enable delivery to both addresses.' : '' });
    }
    const challenge = cookie(req, 'rg_otp');
    if (!/^[a-f0-9]{64}$/.test(challenge))
      return res.status(401).json({ error: 'Request a new verification code' });
    const attempt = await pool.query(`UPDATE admin_login_challenges SET attempts=attempts+1
      WHERE email=$1 AND challenge=$2 AND expires_at>NOW() AND attempts<5
      RETURNING code_hash`, [ADMIN_EMAIL, challenge]);
    if (!attempt.rows.length || !equal(attempt.rows[0].code_hash, sign(String(code).trim() + '.' + challenge)))
      return res.status(401).json({ error: 'Invalid or expired code. After 5 attempts, request a new code' });
    const consumed = await pool.query('DELETE FROM admin_login_challenges WHERE email=$1 AND challenge=$2 RETURNING challenge', [ADMIN_EMAIL, challenge]);
    if (!consumed.rows.length) return res.status(401).json({ error: 'This code has already been used' });
    const exp = String(Date.now() + 12 * 60 * 60 * 1000);
    res.setHeader('Set-Cookie', [
      'rg_admin=' + exp + '.' + sign(exp) + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200',
      clearCookie('rg_otp')
    ]);
    return res.json({ ok: true });
  } catch (error) {
    console.error('Admin authentication service error', error.name);
    return res.status(503).json({ error: 'Login service temporarily unavailable. Please try again' });
  } finally { if (pool) await pool.end().catch(() => {}); }
};

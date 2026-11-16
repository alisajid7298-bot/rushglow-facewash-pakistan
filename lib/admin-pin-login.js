const crypto = require('crypto');
const EMAILS = ['ali.sajid7298@gmail.com', 'rushglow35@gmail.com'];
function verifyPin(pin, encoded) {
  const parts = String(encoded || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt' || !/^[a-f0-9]{32}$/.test(parts[1]) || !/^[a-f0-9]{128}$/.test(parts[2])) throw new Error('PIN configuration');
  const derived = crypto.scryptSync(String(pin || '').slice(0,128), parts[1], 64);
  return crypto.timingSafeEqual(derived, Buffer.from(parts[2], 'hex')) && /^\d{4}$/.test(String(pin || ''));
}
async function login(req, res, { Pool, sign, clearCookie }) {
  if (!['https://rushglow.org','https://www.rushglow.org'].includes(req.headers.origin)) return res.status(403).json({error:'Open PIN login from the RushGlow website.'});
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING;
  if (!connectionString || !process.env.RESEND_API_KEY || !process.env.ADMIN_LOGIN_PIN_HASH) return res.status(503).json({error:'PIN login is not configured. Use Email OTP.'});
  let pool, client, transaction = false;
  try {
    const correct = verifyPin(req.body.pin, process.env.ADMIN_LOGIN_PIN_HASH);
    pool = new Pool({connectionString, connectionTimeoutMillis:10000});
    await pool.query(`CREATE TABLE IF NOT EXISTS admin_pin_attempts (id INTEGER PRIMARY KEY CHECK(id=1), attempts INTEGER NOT NULL DEFAULT 0, last_attempt_at TIMESTAMPTZ, locked_until TIMESTAMPTZ)`);
    await pool.query('INSERT INTO admin_pin_attempts(id) VALUES(1) ON CONFLICT DO NOTHING');
    client = await pool.connect();
    await client.query('BEGIN'); transaction = true;
    const {rows} = await client.query(`SELECT attempts, locked_until > NOW() AS locked, CEIL(EXTRACT(EPOCH FROM (locked_until-NOW())))::integer AS retry_seconds, last_attempt_at < NOW()-INTERVAL '15 minutes' AS stale FROM admin_pin_attempts WHERE id=1 FOR UPDATE`);
    const row = rows[0];
    if (row.locked) {
      await client.query('COMMIT'); transaction = false;
      res.setHeader('Retry-After',String(row.retry_seconds));
      return res.status(429).json({error:'PIN login is locked. Use Email OTP or try again after 15 minutes.',retry_after_seconds:row.retry_seconds});
    }
    if (!correct) {
      const attempts = (row.stale ? 0 : row.attempts) + 1;
      await client.query(`UPDATE admin_pin_attempts SET attempts=$1,last_attempt_at=NOW(),locked_until=CASE WHEN $1>=3 THEN NOW()+INTERVAL '15 minutes' ELSE NULL END WHERE id=1`,[attempts]);
      await client.query('COMMIT'); transaction = false;
      if(attempts>=3) res.setHeader('Retry-After','900');
      return res.status(attempts>=3?429:401).json({error:attempts>=3?'PIN locked for 15 minutes. Email OTP is still available.':`Incorrect PIN. ${3-attempts} attempts remaining.`,attempts_remaining:Math.max(0,3-attempts),retry_after_seconds:attempts>=3?900:0});
    }
    await client.query('UPDATE admin_pin_attempts SET attempts=0,last_attempt_at=NULL,locked_until=NULL WHERE id=1');
    await client.query('COMMIT'); transaction = false;
    client.release(); client = null;
    const timestamp = new Date().toLocaleString('en-GB',{timeZone:'Asia/Riyadh'});
    const deliveries = await Promise.all(EMAILS.map(async recipient => {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method:'POST', signal:AbortSignal.timeout(10000),
          headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},
          body:JSON.stringify({from:process.env.ADMIN_EMAIL_FROM || 'RushGlow <verification@rushglow.org>',to:[recipient],subject:'RUSHGLOW control panel PIN login',text:`A correct PIN was entered for the RUSHGLOW control panel.\nTime: ${timestamp} (Saudi Arabia, UTC+3).\nAccess is granted only after both admin email alerts are accepted.\nIf this was unexpected, secure your control panel access.`})
        });
        return response.ok;
      } catch { return false; }
    }));
    if (!deliveries.every(Boolean)) return res.status(502).json({error:'Login alert could not be sent to both admin emails. Use Email OTP or try again.'});
    const exp = String(Date.now()+15*60*1000);
    res.setHeader('Set-Cookie',['rg_admin='+exp+'.'+sign(exp)+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=900',clearCookie('rg_otp')]);
    return res.json({ok:true});
  } catch(error) {
    if(transaction && client) await client.query('ROLLBACK').catch(()=>{});
    console.error('Admin PIN login service error',error.name);
    return res.status(503).json({error:'PIN login is temporarily unavailable. Use Email OTP.'});
  } finally {
    if(client) client.release();
    if(pool) await pool.end().catch(()=>{});
  }
}
module.exports = {login,verifyPin};

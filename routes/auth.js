const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../database');

async function sendResetEmail(to, resetUrl) {
  if (!process.env.SMTP_HOST) {
    console.log(`[RESET PASSWORD] Link per ${to}: ${resetUrl}`);
    return;
  }
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: 'Reimposta la tua password — Note Spese',
    html: `<p>Hai richiesto il ripristino della password.</p>
           <p><a href="${resetUrl}">Clicca qui per reimpostare la password</a></p>
           <p>Il link scade tra 1 ora. Se non hai fatto questa richiesta, ignora questa email.</p>`,
  });
}

router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e password obbligatori' });
  if (password.length < 6) return res.status(400).json({ error: 'Password minimo 6 caratteri' });

  try {
    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (exists.rows.length > 0) return res.status(409).json({ error: 'Email già registrata' });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [email.toLowerCase(), hash]
    );
    const userId = result.rows[0].id;
    await pool.query('INSERT INTO settings (user_id) VALUES ($1)', [userId]);

    req.session.userId = userId;
    req.session.userEmail = email.toLowerCase();
    res.json({ ok: true, email: email.toLowerCase() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore server' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e password obbligatori' });

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Credenziali non valide' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenziali non valide' });

    req.session.userId = user.id;
    req.session.userEmail = user.email;
    res.json({ ok: true, email: user.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore server' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Non autenticato' });
  res.json({ id: req.session.userId, email: req.session.userEmail });
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email obbligatoria' });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        used BOOLEAN DEFAULT FALSE
      )
    `);

    const result = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    // Always return success to avoid email enumeration
    if (result.rows.length > 0) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 ora
      await pool.query(
        'INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)',
        [token, result.rows[0].id, expiresAt]
      );
      const resetUrl = `${req.protocol}://${req.get('host')}/reset-password.html?token=${token}`;
      await sendResetEmail(email.toLowerCase(), resetUrl).catch(err => console.error('Email error:', err));
    }
    res.json({ message: 'Se l\'email è registrata, riceverai le istruzioni per reimpostare la password.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore server' });
  }
});

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token e password obbligatori' });
  if (password.length < 6) return res.status(400).json({ error: 'Password minimo 6 caratteri' });

  try {
    const result = await pool.query(
      'SELECT * FROM password_reset_tokens WHERE token = $1 AND used = FALSE AND expires_at > NOW()',
      [token]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: 'Link non valido o scaduto' });

    const { user_id } = result.rows[0];
    const hash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user_id]);
    await pool.query('UPDATE password_reset_tokens SET used = TRUE WHERE token = $1', [token]);

    res.json({ ok: true, message: 'Password reimpostata con successo. Ora puoi accedere.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;

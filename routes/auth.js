const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool = require('../database');

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

module.exports = router;

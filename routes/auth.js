const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../database');

router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e password obbligatori' });
  if (password.length < 6) return res.status(400).json({ error: 'Password minimo 6 caratteri' });

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (exists) return res.status(409).json({ error: 'Email già registrata' });

  const hash = await bcrypt.hash(password, 10);
  const result = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email.toLowerCase(), hash);
  db.prepare('INSERT INTO settings (user_id) VALUES (?)').run(result.lastInsertRowid);

  req.session.userId = result.lastInsertRowid;
  req.session.userEmail = email.toLowerCase();
  res.json({ ok: true, email: email.toLowerCase() });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e password obbligatori' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) return res.status(401).json({ error: 'Credenziali non valide' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Credenziali non valide' });

  req.session.userId = user.id;
  req.session.userEmail = user.email;
  res.json({ ok: true, email: user.email });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Non autenticato' });
  res.json({ id: req.session.userId, email: req.session.userEmail });
});

module.exports = router;

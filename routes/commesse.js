const router = require('express').Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, (req, res) => {
  const commesse = db.prepare('SELECT * FROM commesse WHERE user_id = ? ORDER BY creata DESC').all(req.user.id);
  res.json(commesse);
});

router.post('/', requireAuth, (req, res) => {
  const { nome, cliente, indirizzo } = req.body;
  if (!nome || !cliente) return res.status(400).json({ error: 'Nome e cliente obbligatori' });

  const result = db.prepare(
    'INSERT INTO commesse (user_id, nome, cliente, indirizzo) VALUES (?, ?, ?, ?)'
  ).run(req.user.id, nome.trim(), cliente.trim(), (indirizzo || '').trim());

  const nuova = db.prepare('SELECT * FROM commesse WHERE id = ?').get(result.lastInsertRowid);
  res.json(nuova);
});

router.delete('/:id', requireAuth, (req, res) => {
  const commessa = db.prepare('SELECT id FROM commesse WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!commessa) return res.status(404).json({ error: 'Commessa non trovata' });

  db.prepare('DELETE FROM commesse WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;

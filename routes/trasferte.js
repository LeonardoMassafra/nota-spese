const router = require('express').Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, (req, res) => {
  const trasferte = db.prepare('SELECT * FROM trasferte WHERE user_id = ? ORDER BY data DESC, created_at DESC').all(req.user.id);
  res.json(trasferte);
});

router.post('/', requireAuth, (req, res) => {
  const { commessa_id, data, partenza, destinazione, km, tariffa, note } = req.body;
  if (!commessa_id || !data || !partenza || !destinazione || !km || !tariffa) {
    return res.status(400).json({ error: 'Campi obbligatori mancanti' });
  }

  const commessa = db.prepare('SELECT id FROM commesse WHERE id = ? AND user_id = ?').get(commessa_id, req.user.id);
  if (!commessa) return res.status(400).json({ error: 'Commessa non valida' });

  const kmNum = parseFloat(km);
  const tariffaNum = parseFloat(tariffa);
  const rimborso = Math.round(kmNum * tariffaNum * 100) / 100;

  const result = db.prepare(
    'INSERT INTO trasferte (user_id, commessa_id, data, partenza, destinazione, km, tariffa, rimborso, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, commessa_id, data, partenza.trim(), destinazione.trim(), kmNum, tariffaNum, rimborso, (note || '').trim());

  const nuova = db.prepare('SELECT * FROM trasferte WHERE id = ?').get(result.lastInsertRowid);
  res.json(nuova);
});

router.delete('/:id', requireAuth, (req, res) => {
  const item = db.prepare('SELECT id FROM trasferte WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Trasferta non trovata' });

  db.prepare('DELETE FROM trasferte WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;

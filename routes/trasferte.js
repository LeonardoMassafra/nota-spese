const router = require('express').Router();
const pool = require('../database');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM trasferte WHERE user_id = $1 ORDER BY data DESC, created_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore server' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const { commessa_id, data, partenza, destinazione, km, tariffa, note } = req.body;
  if (!commessa_id || !data || !partenza || !destinazione || !km || !tariffa) {
    return res.status(400).json({ error: 'Campi obbligatori mancanti' });
  }

  try {
    const check = await pool.query(
      'SELECT id FROM commesse WHERE id = $1 AND user_id = $2',
      [commessa_id, req.user.id]
    );
    if (check.rows.length === 0) return res.status(400).json({ error: 'Commessa non valida' });

    const kmNum = parseFloat(km);
    const tariffaNum = parseFloat(tariffa);
    const rimborso = Math.round(kmNum * tariffaNum * 100) / 100;

    const { rows } = await pool.query(
      'INSERT INTO trasferte (user_id, commessa_id, data, partenza, destinazione, km, tariffa, rimborso, note) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [req.user.id, commessa_id, data, partenza.trim(), destinazione.trim(), kmNum, tariffaNum, rimborso, (note || '').trim()]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore server' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const check = await pool.query(
      'SELECT id FROM trasferte WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Trasferta non trovata' });

    await pool.query('DELETE FROM trasferte WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;

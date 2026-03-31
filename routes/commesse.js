const router = require('express').Router();
const pool = require('../database');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM commesse WHERE user_id = $1 ORDER BY creata DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore server' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const { nome, cliente, indirizzo } = req.body;
  if (!nome || !cliente) return res.status(400).json({ error: 'Nome e cliente obbligatori' });

  try {
    const { rows } = await pool.query(
      'INSERT INTO commesse (user_id, nome, cliente, indirizzo) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user.id, nome.trim(), cliente.trim(), (indirizzo || '').trim()]
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
      'SELECT id FROM commesse WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Commessa non trovata' });

    await pool.query('DELETE FROM commesse WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;

const router = require('express').Router();
const pool = require('../database');
const { requireAuth } = require('../middleware/auth');

const DEFAULT_TARIFFE = [
  { id:'b_1000',  label:'Benzina ≤1000cc',      val:0.2837 },
  { id:'b_1600',  label:'Benzina 1001–1600cc',   val:0.3936 },
  { id:'b_2000',  label:'Benzina 1601–2000cc',   val:0.4736 },
  { id:'b_2000p', label:'Benzina >2000cc',        val:0.5876 },
  { id:'d_1600',  label:'Diesel ≤1600cc',         val:0.3847 },
  { id:'d_2000',  label:'Diesel 1601–2000cc',     val:0.4436 },
  { id:'d_2000p', label:'Diesel >2000cc',         val:0.5467 },
  { id:'gpl',     label:'GPL / Metano',            val:0.2834 },
  { id:'ev',      label:'Elettrica',               val:0.2500 },
];

function parseTariffe(json) {
  if (!json) return DEFAULT_TARIFFE;
  try {
    const parsed = JSON.parse(json);
    return DEFAULT_TARIFFE.map(def => {
      const saved = parsed.find(t => t.id === def.id);
      return saved ? { ...def, val: Number(saved.val) || def.val } : def;
    });
  } catch(_) { return DEFAULT_TARIFFE; }
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM settings WHERE user_id = $1', [req.user.id]);
    const settings = rows[0];
    const key = settings?.anthropic_api_key || '';
    res.json({
      has_api_key: key.length > 0,
      api_key_preview: key.length > 4 ? '••••••••' + key.slice(-4) : (key.length > 0 ? '••••' : ''),
      tariffe: parseTariffe(settings?.tariffe_json),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore server' });
  }
});

router.put('/', requireAuth, async (req, res) => {
  const { anthropic_api_key, tariffe } = req.body;

  try {
    const { rows } = await pool.query('SELECT * FROM settings WHERE user_id = $1', [req.user.id]);
    const current = rows[0];

    const newKey = (anthropic_api_key || '').trim() || current?.anthropic_api_key || '';

    let newTariffeJson = current?.tariffe_json || null;
    if (Array.isArray(tariffe) && tariffe.length > 0) {
      const validated = DEFAULT_TARIFFE.map(def => {
        const t = tariffe.find(x => x.id === def.id);
        const val = t ? Math.max(0, Number(t.val) || 0) : def.val;
        return { id: def.id, label: def.label, val };
      });
      newTariffeJson = JSON.stringify(validated);
    }

    await pool.query(
      `INSERT INTO settings (user_id, anthropic_api_key, tariffe_json) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         anthropic_api_key = EXCLUDED.anthropic_api_key,
         tariffe_json = EXCLUDED.tariffe_json`,
      [req.user.id, newKey, newTariffeJson]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;

const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pool = require('../database');
const { requireAuth } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Solo immagini e PDF consentiti'));
  },
});

// Deduce il content-type dal nome file (in fase di salvataggio non abbiamo il mimetype originale)
function mimeFromName(name) {
  const ext = path.extname(name || '').toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.heic' || ext === '.heif') return 'image/heic';
  if (ext === '.pdf') return 'application/pdf';
  return 'image/jpeg';
}

const AI_PROMPT = `Analizza questo documento di spesa (scontrino, pedaggio autostradale, ricevuta carburante, ecc).

REGOLE IMPORTANTI:
- Per PEDAGGI AUTOSTRADALI: la data è nel campo "DATA e ORA" in formato GG-MM-AAAA (es. 11-03-2026 = giorno 11, mese 03, anno 2026), converti in YYYY-MM-DD → 2026-03-11. L'importo è nella riga "PEDAGGIO € X.XX". Il fornitore è il nome dell'autostrada.
- Per SCONTRINI normali: cerca la data stampata, il totale, il nome del negozio.
- FORMATO DATA ITALIANO GG-MM-AAAA: primo numero=GIORNO, secondo=MESE, terzo=ANNO. Esempio 11-03-2026 → "2026-03-11"
- NON usare mai la data di oggi. Estrai sempre la data dal documento.

Rispondi SOLO con JSON valido, nessun testo prima o dopo:
{"data":"YYYY-MM-DD","importo":9.00,"fornitore":"nome breve","categoria":"Pedaggi","note":"opzionale"}

Categorie valide: Carburante, Vitto, Alloggio, Trasporti, Pedaggi, Materiali, Pratiche, Telefonia, Attrezzatura, Cancelleria, Altro`;

// GET all spese for current user
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, user_id, commessa_id, data, importo, fornitore, categoria, note, pagamento, foto_filename, created_at FROM spese WHERE user_id = $1 ORDER BY data DESC, created_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore server' });
  }
});

// POST analyze: upload photo + AI extraction
router.post('/analyze', requireAuth, upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nessun file caricato' });

  const foto_filename = req.file.filename;

  try {
    const { rows } = await pool.query(
      'SELECT anthropic_api_key FROM settings WHERE user_id = $1',
      [req.user.id]
    );
    const settings = rows[0];

    if (!settings?.anthropic_api_key) {
      return res.json({ ok: true, foto_filename, extracted: null, message: 'Configura la chiave API Anthropic nelle Impostazioni per abilitare l\'analisi AI' });
    }

    const filePath = path.join(__dirname, '..', 'uploads', foto_filename);
    const base64 = fs.readFileSync(filePath).toString('base64');
    const mediaType = req.file.mimetype;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.anthropic_api_key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: [
            mediaType === 'application/pdf'
              ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
              : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: AI_PROMPT },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.json({ ok: true, foto_filename, extracted: null, error: `Errore API Anthropic (${response.status}): ${errText.slice(0, 200)}` });
    }

    const data = await response.json();
    const block = data.content?.find(b => b.type === 'text');
    let extracted = null;

    if (block) {
      let raw = block.text.trim().replace(/```json|```/g, '').trim();
      const s = raw.indexOf('{'), en = raw.lastIndexOf('}');
      if (s !== -1 && en !== -1) {
        try { extracted = JSON.parse(raw.substring(s, en + 1)); } catch (_) {}
      }
    }

    return res.json({ ok: true, foto_filename, extracted });
  } catch (err) {
    return res.json({ ok: true, foto_filename, extracted: null, error: err.message });
  }
});

// POST create spesa
router.post('/', requireAuth, async (req, res) => {
  const { commessa_id, data, importo, fornitore, categoria, note, pagamento, foto_filename } = req.body;
  if (!commessa_id || !data || !importo || !fornitore || !categoria) {
    return res.status(400).json({ error: 'Campi obbligatori mancanti' });
  }

  try {
    const check = await pool.query(
      'SELECT id FROM commesse WHERE id = $1 AND user_id = $2',
      [commessa_id, req.user.id]
    );
    if (check.rows.length === 0) return res.status(400).json({ error: 'Commessa non valida' });

    // Legge il file temporaneo su disco e lo salva DENTRO il database (BYTEA),
    // così la foto sopravvive ai redeploy (il disco dell'host è effimero).
    let fotoData = null, fotoMime = null;
    if (foto_filename) {
      const fp = path.join(__dirname, '..', 'uploads', foto_filename);
      if (fs.existsSync(fp)) {
        fotoData = fs.readFileSync(fp);
        fotoMime = mimeFromName(foto_filename);
        try { fs.unlinkSync(fp); } catch (_) {} // il file su disco è solo di appoggio
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO spese (user_id, commessa_id, data, importo, fornitore, categoria, note, pagamento, foto_filename, foto_data, foto_mime)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, user_id, commessa_id, data, importo, fornitore, categoria, note, pagamento, foto_filename, created_at`,
      [req.user.id, commessa_id, data, parseFloat(importo), fornitore.trim(), categoria, (note || '').trim(), (pagamento || '').trim(), foto_filename || null, fotoData, fotoMime]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore server' });
  }
});

// GET foto scontrino: serve l'immagine salvata nel DB (solo del proprietario)
router.get('/:id/foto', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT foto_data, foto_mime, foto_filename FROM spese WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    const row = rows[0];
    if (!row || !row.foto_data) return res.status(404).send('Scontrino non disponibile');

    res.set('Content-Type', row.foto_mime || mimeFromName(row.foto_filename));
    // inline = visualizza nel browser; l'utente può comunque scaricarlo
    res.set('Content-Disposition', `inline; filename="scontrino-${req.params.id}${path.extname(row.foto_filename || '') || '.jpg'}"`);
    res.set('Cache-Control', 'private, max-age=31536000');
    res.send(row.foto_data);
  } catch (err) {
    console.error(err);
    res.status(500).send('Errore server');
  }
});

// POST allega/sostituisce la foto su una spesa ESISTENTE
// (serve a recuperare gli scontrini vecchi ricaricandoli dal telefono, senza creare doppioni)
router.post('/:id/foto', requireAuth, upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nessun file caricato' });
  const fp = path.join(__dirname, '..', 'uploads', req.file.filename);
  try {
    const fotoData = fs.readFileSync(fp);
    const fotoMime = req.file.mimetype || mimeFromName(req.file.filename);
    const { rowCount } = await pool.query(
      'UPDATE spese SET foto_data = $1, foto_mime = $2, foto_filename = $3 WHERE id = $4 AND user_id = $5',
      [fotoData, fotoMime, req.file.filename, req.params.id, req.user.id]
    );
    try { fs.unlinkSync(fp); } catch (_) {} // il file su disco è solo di appoggio
    if (rowCount === 0) return res.status(404).json({ error: 'Spesa non trovata' });
    res.json({ ok: true, foto_filename: req.file.filename });
  } catch (err) {
    try { fs.unlinkSync(fp); } catch (_) {}
    console.error(err);
    res.status(500).json({ error: 'Errore server' });
  }
});

// DELETE spesa
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const check = await pool.query(
      'SELECT id, foto_filename FROM spese WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Spesa non trovata' });

    await pool.query('DELETE FROM spese WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;

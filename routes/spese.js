const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../database');
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
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo immagini consentite'));
  },
});

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
router.get('/', requireAuth, (req, res) => {
  const spese = db.prepare('SELECT * FROM spese WHERE user_id = ? ORDER BY data DESC, created_at DESC').all(req.user.id);
  res.json(spese);
});

// POST analyze: upload photo + AI extraction
router.post('/analyze', requireAuth, upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nessun file caricato' });

  const foto_filename = req.file.filename;
  const settings = db.prepare('SELECT anthropic_api_key FROM settings WHERE user_id = ?').get(req.user.id);

  if (!settings?.anthropic_api_key) {
    return res.json({ ok: true, foto_filename, extracted: null, message: 'Configura la chiave API Anthropic nelle Impostazioni per abilitare l\'analisi AI' });
  }

  try {
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
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
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
router.post('/', requireAuth, (req, res) => {
  const { commessa_id, data, importo, fornitore, categoria, note, foto_filename } = req.body;
  if (!commessa_id || !data || !importo || !fornitore || !categoria) {
    return res.status(400).json({ error: 'Campi obbligatori mancanti' });
  }

  const commessa = db.prepare('SELECT id FROM commesse WHERE id = ? AND user_id = ?').get(commessa_id, req.user.id);
  if (!commessa) return res.status(400).json({ error: 'Commessa non valida' });

  const result = db.prepare(
    'INSERT INTO spese (user_id, commessa_id, data, importo, fornitore, categoria, note, foto_filename) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, commessa_id, data, parseFloat(importo), fornitore.trim(), categoria, (note || '').trim(), foto_filename || null);

  const nuova = db.prepare('SELECT * FROM spese WHERE id = ?').get(result.lastInsertRowid);
  res.json(nuova);
});

// DELETE spesa
router.delete('/:id', requireAuth, (req, res) => {
  const item = db.prepare('SELECT id, foto_filename FROM spese WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Spesa non trovata' });

  db.prepare('DELETE FROM spese WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;

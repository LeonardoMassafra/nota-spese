const express = require('express');
const session = require('express-session');
const path = require('path');
const pool = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Auto-migrazione idempotente: garantisce le colonne per la foto salvata nel DB.
// Così un semplice deploy (git push) applica lo schema senza comandi manuali.
pool.query(`
  ALTER TABLE spese ADD COLUMN IF NOT EXISTS foto_data BYTEA;
  ALTER TABLE spese ADD COLUMN IF NOT EXISTS foto_mime TEXT;
  ALTER TABLE spese ADD COLUMN IF NOT EXISTS pagamento TEXT DEFAULT '';
  ALTER TABLE trasferte ADD COLUMN IF NOT EXISTS pedaggio NUMERIC(10,2) DEFAULT 0;
  ALTER TABLE trasferte ADD COLUMN IF NOT EXISTS pagamento TEXT DEFAULT '';
  ALTER TABLE settings ADD COLUMN IF NOT EXISTS emittente_nome TEXT DEFAULT '';
  ALTER TABLE settings ADD COLUMN IF NOT EXISTS emittente_piva TEXT DEFAULT '';
  ALTER TABLE settings ADD COLUMN IF NOT EXISTS emittente_indirizzo TEXT DEFAULT '';
  ALTER TABLE settings ADD COLUMN IF NOT EXISTS operatore TEXT DEFAULT '';
`).catch(err => console.error('Auto-migrazione schema:', err.message));

// Session store con PostgreSQL
const PgSession = require('connect-pg-simple')(session);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(session({
  store: new PgSession({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'notespese-secret-studio-tecnico-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 giorni
    httpOnly: true,
  },
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/commesse', require('./routes/commesse'));
app.use('/api/spese', require('./routes/spese'));
app.use('/api/trasferte', require('./routes/trasferte'));
app.use('/api/settings', require('./routes/settings'));

// Redirect root to login if not authenticated
app.get('/', (req, res) => {
  if (req.session?.userId) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.redirect('/login.html');
  }
});

app.listen(PORT, () => {
  console.log(`Note Spese avviato su http://localhost:${PORT}`);
});

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'notespese.sqlite'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    user_id INTEGER PRIMARY KEY,
    anthropic_api_key TEXT DEFAULT '',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS commesse (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    nome TEXT NOT NULL,
    cliente TEXT NOT NULL,
    indirizzo TEXT DEFAULT '',
    creata TEXT DEFAULT (date('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS spese (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    commessa_id INTEGER NOT NULL,
    data TEXT NOT NULL,
    importo REAL NOT NULL,
    fornitore TEXT NOT NULL,
    categoria TEXT NOT NULL,
    note TEXT DEFAULT '',
    foto_filename TEXT DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (commessa_id) REFERENCES commesse(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS trasferte (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    commessa_id INTEGER NOT NULL,
    data TEXT NOT NULL,
    partenza TEXT NOT NULL,
    destinazione TEXT NOT NULL,
    km REAL NOT NULL,
    tariffa REAL NOT NULL,
    rimborso REAL NOT NULL,
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (commessa_id) REFERENCES commesse(id) ON DELETE CASCADE
  );
`);

// Migrazione: aggiunge colonna tariffe_json se non esiste
try { db.exec("ALTER TABLE settings ADD COLUMN tariffe_json TEXT DEFAULT NULL"); } catch(_) {}

module.exports = db;

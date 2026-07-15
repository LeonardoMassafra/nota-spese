// Script di migrazione: crea le tabelle PostgreSQL
// Esegui con: node migrate.js

const pool = require('./database');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS settings (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        anthropic_api_key TEXT DEFAULT '',
        tariffe_json TEXT DEFAULT NULL
      );

      CREATE TABLE IF NOT EXISTS commesse (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        nome TEXT NOT NULL,
        cliente TEXT NOT NULL,
        indirizzo TEXT DEFAULT '',
        creata DATE DEFAULT CURRENT_DATE
      );

      CREATE TABLE IF NOT EXISTS spese (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        commessa_id INTEGER NOT NULL REFERENCES commesse(id) ON DELETE CASCADE,
        data TEXT NOT NULL,
        importo NUMERIC(10,2) NOT NULL,
        fornitore TEXT NOT NULL,
        categoria TEXT NOT NULL,
        note TEXT DEFAULT '',
        foto_filename TEXT DEFAULT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS trasferte (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        commessa_id INTEGER NOT NULL REFERENCES commesse(id) ON DELETE CASCADE,
        data TEXT NOT NULL,
        partenza TEXT NOT NULL,
        destinazione TEXT NOT NULL,
        km NUMERIC(10,2) NOT NULL,
        tariffa NUMERIC(10,4) NOT NULL,
        rimborso NUMERIC(10,2) NOT NULL,
        note TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Colonne per salvare la foto dello scontrino dentro il DB (persistente ai redeploy)
    await client.query(`
      ALTER TABLE spese ADD COLUMN IF NOT EXISTS foto_data BYTEA;
      ALTER TABLE spese ADD COLUMN IF NOT EXISTS foto_mime TEXT;
    `);

    // Metodo di pagamento sulle spese (Contanti / Carta aziendale / Carta personale)
    await client.query(`
      ALTER TABLE spese ADD COLUMN IF NOT EXISTS pagamento TEXT DEFAULT '';
    `);

    // Pedaggio autostradale e metodo di pagamento sulle trasferte
    await client.query(`
      ALTER TABLE trasferte ADD COLUMN IF NOT EXISTS pedaggio NUMERIC(10,2) DEFAULT 0;
      ALTER TABLE trasferte ADD COLUMN IF NOT EXISTS pagamento TEXT DEFAULT '';
    `);

    // Anagrafica emittente + operatore per l'intestazione del documento "Nota Spese"
    await client.query(`
      ALTER TABLE settings ADD COLUMN IF NOT EXISTS emittente_nome TEXT DEFAULT '';
      ALTER TABLE settings ADD COLUMN IF NOT EXISTS emittente_piva TEXT DEFAULT '';
      ALTER TABLE settings ADD COLUMN IF NOT EXISTS emittente_indirizzo TEXT DEFAULT '';
      ALTER TABLE settings ADD COLUMN IF NOT EXISTS operatore TEXT DEFAULT '';
      ALTER TABLE settings ADD COLUMN IF NOT EXISTS veicolo TEXT DEFAULT '';
      ALTER TABLE settings ADD COLUMN IF NOT EXISTS targa TEXT DEFAULT '';
    `);

    // Codice fiscale: dell'emittente (per le societa' puo' differire dalla P.IVA) e dell'operatore
    await client.query(`
      ALTER TABLE settings ADD COLUMN IF NOT EXISTS emittente_cf TEXT DEFAULT '';
      ALTER TABLE settings ADD COLUMN IF NOT EXISTS operatore_cf TEXT DEFAULT '';
    `);

    await client.query('COMMIT');
    console.log('Migrazione completata con successo.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Errore durante la migrazione:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();

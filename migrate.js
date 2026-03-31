// Script di migrazione: crea le tabelle PostgreSQL
// Esegui con: node migrate.js

require('dotenv').config({ path: '.env' });
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

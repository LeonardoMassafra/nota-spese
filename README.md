# Note Spese

Applicazione web per la gestione delle note spese di uno studio tecnico. Permette di registrare spese e trasferte per commessa, con supporto al riconoscimento automatico degli scontrini tramite AI (Anthropic Claude).

## Funzionalità

- **Registrazione multi-utente** con sessioni persistenti
- **Commesse**: creazione e gestione dei progetti di riferimento
- **Spese**: inserimento manuale o tramite foto scontrino con analisi AI
- **Trasferte**: registrazione chilometri e rimborsi km
- **Analisi AI**: carica la foto di uno scontrino e l'app compila automaticamente i campi (importo, data, descrizione, categoria)
- Chiave API Anthropic salvata per utente, mai esposta al browser

## Stack tecnologico

- **Backend**: Node.js + Express
- **Database**: SQLite (better-sqlite3, WAL mode)
- **Sessioni**: express-session su SQLite
- **Upload**: multer
- **Frontend**: Vanilla JS, HTML/CSS (nessun framework)
- **AI**: Anthropic Claude (configurabile per utente)

## Installazione

### Prerequisiti

- Node.js >= 18

### Passi

```bash
# 1. Clona il repository
git clone <url-repo>
cd note-spese

# 2. Installa le dipendenze
npm install

# 3. Crea il file .env a partire dall'esempio
cp .env.example .env
# Modifica .env e imposta SESSION_SECRET con una stringa casuale

# 4. Avvia il server
npm start
```

L'applicazione sarà disponibile su [http://localhost:3000](http://localhost:3000).

Per lo sviluppo con auto-reload:

```bash
npm run dev
```

## Configurazione AI

La funzione di analisi automatica degli scontrini richiede una chiave API Anthropic. Ogni utente può inserire la propria chiave nella sezione **Impostazioni** dell'applicazione. La chiave viene salvata nel database e non viene mai inviata al browser.

## Struttura del progetto

```
note-spese/
├── server.js            # Entry point, configurazione Express e sessioni
├── database.js          # Schema SQLite e inizializzazione DB
├── middleware/
│   └── auth.js          # Middleware requireAuth
├── routes/
│   ├── auth.js          # Login, registrazione, logout
│   ├── commesse.js      # CRUD commesse
│   ├── spese.js         # CRUD spese + analisi AI
│   ├── trasferte.js     # CRUD trasferte
│   └── settings.js      # Gestione chiave API utente
├── public/
│   ├── index.html       # SPA principale
│   ├── login.html       # Pagina login/registrazione
│   ├── js/
│   │   ├── app.js       # Logica frontend principale
│   │   └── login.js     # Logica login
│   └── css/
│       └── style.css    # Stili
└── uploads/             # Foto scontrini (esclusa da git)
```

## Variabili d'ambiente

| Variabile        | Default                        | Descrizione                        |
|------------------|--------------------------------|------------------------------------|
| `PORT`           | `3000`                         | Porta su cui ascolta il server     |
| `SESSION_SECRET` | stringa di fallback hardcoded  | Segreto per firmare i cookie di sessione — **cambiare in produzione** |

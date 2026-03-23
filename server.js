const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Session store con SQLite
const SQLiteStore = require('connect-sqlite3')(session);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: __dirname }),
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

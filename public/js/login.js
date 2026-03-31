let isRegister = false;

function toggleMode() {
  isRegister = !isRegister;
  document.getElementById('submitBtn').textContent = isRegister ? 'Registrati' : 'Accedi';
  document.querySelector('.login-toggle').innerHTML = isRegister
    ? 'Hai già un account? <a onclick="toggleMode()">Accedi</a>'
    : 'Non hai un account? <a onclick="toggleMode()">Registrati</a>';
  document.getElementById('errorMsg').style.display = 'none';
  document.getElementById('successMsg').style.display = 'none';
  document.querySelector('input[autocomplete="current-password"]').autocomplete = isRegister ? 'new-password' : 'current-password';
  const forgotLink = document.getElementById('forgotLink');
  if (forgotLink) forgotLink.style.display = isRegister ? 'none' : 'block';
}

function togglePassword() {
  const input = document.getElementById('password');
  const icon = document.getElementById('eyeIcon');
  if (input.type === 'password') {
    input.type = 'text';
    icon.innerHTML = `
      <path stroke-linecap="round" stroke-linejoin="round" d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
      <path stroke-linecap="round" stroke-linejoin="round" d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
      <line stroke-linecap="round" stroke-linejoin="round" x1="1" y1="1" x2="23" y2="23"/>`;
  } else {
    input.type = 'password';
    icon.innerHTML = `
      <path stroke-linecap="round" stroke-linejoin="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>`;
  }
}

async function showForgotPassword() {
  const email = document.getElementById('email').value.trim();
  if (!email) {
    showError('Inserisci la tua email nel campo sopra, poi clicca "Password dimenticata?"');
    return;
  }

  const errEl = document.getElementById('errorMsg');
  const sucEl = document.getElementById('successMsg');
  errEl.style.display = 'none';
  sucEl.style.display = 'none';

  try {
    const r = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await r.json();
    if (r.ok) {
      sucEl.textContent = data.message || 'Se l\'email è registrata, riceverai le istruzioni per reimpostare la password.';
      sucEl.style.display = 'block';
    } else {
      showError(data.error || 'Errore nell\'invio dell\'email');
    }
  } catch (err) {
    showError('Errore di rete: ' + err.message);
  }
}

function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.style.display = 'block';
}

async function handleSubmit() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  if (!email || !password) { showError('Inserisci email e password'); return; }

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Attendere...';
  document.getElementById('errorMsg').style.display = 'none';

  try {
    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (!r.ok) {
      showError(data.error || 'Errore sconosciuto');
      btn.disabled = false;
      btn.textContent = isRegister ? 'Registrati' : 'Accedi';
      return;
    }
    window.location.href = '/';
  } catch (err) {
    showError('Errore di rete: ' + err.message);
    btn.disabled = false;
    btn.textContent = isRegister ? 'Registrati' : 'Accedi';
  }
}

// Enter key support
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleSubmit();
});

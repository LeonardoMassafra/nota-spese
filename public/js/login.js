let isRegister = false;

function toggleMode() {
  isRegister = !isRegister;
  document.getElementById('submitBtn').textContent = isRegister ? 'Registrati' : 'Accedi';
  document.querySelector('.login-toggle').innerHTML = isRegister
    ? 'Hai già un account? <a onclick="toggleMode()">Accedi</a>'
    : 'Non hai un account? <a onclick="toggleMode()">Registrati</a>';
  document.getElementById('errorMsg').style.display = 'none';
  document.querySelector('input[autocomplete="current-password"]').autocomplete = isRegister ? 'new-password' : 'current-password';
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

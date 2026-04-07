// ── Costanti ──────────────────────────────────────────────────────────────────

const MESI = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
              "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const CATEGORIE = ["Carburante","Vitto","Alloggio","Trasporti","Pedaggi",
                   "Materiali","Pratiche","Telefonia","Attrezzatura","Cancelleria","Altro"];
// Valori di default (usati finché il server non risponde o se l'utente non ha personalizzato)
const DEFAULT_TARIFFE = [
  { id:'b_1000',  label:'Benzina ≤1000cc',      val:0.2837 },
  { id:'b_1600',  label:'Benzina 1001–1600cc',   val:0.3936 },
  { id:'b_2000',  label:'Benzina 1601–2000cc',   val:0.4736 },
  { id:'b_2000p', label:'Benzina >2000cc',        val:0.5876 },
  { id:'d_1600',  label:'Diesel ≤1600cc',         val:0.3847 },
  { id:'d_2000',  label:'Diesel 1601–2000cc',     val:0.4436 },
  { id:'d_2000p', label:'Diesel >2000cc',         val:0.5467 },
  { id:'gpl',     label:'GPL / Metano',            val:0.2834 },
  { id:'ev',      label:'Elettrica',               val:0.2500 },
];
const tariffLabel = t => `${t.label} — €${t.val.toFixed(4)}/km`;

// ── Utilities ─────────────────────────────────────────────────────────────────

const fmt = n => Number(n).toLocaleString("it-IT", {style:"currency", currency:"EUR"});
const today = () => new Date().toISOString().split("T")[0];
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const dateIt = s => s ? new Date(s + 'T00:00:00').toLocaleDateString('it-IT') : '—';

async function apiCall(method, path, body) {
  const opts = { method };
  if (body !== undefined) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(path, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Errore ${r.status}`);
  return data;
}

// ── Stato ─────────────────────────────────────────────────────────────────────

const state = {
  user: null,
  commesse: [],
  spese: [],
  trasferte: [],
  settings: { has_api_key: false, api_key_preview: '', tariffe: DEFAULT_TARIFFE },
  tariffe: DEFAULT_TARIFFE,

  tab: 'commesse',
  anno: new Date().getFullYear(),
  mese: new Date().getMonth(),
  commFiltro: '',

  commForm: { nome: '', cliente: '', indirizzo: '' },

  spesaForm: { data: today(), importo: '', fornitore: '', categoria: 'Altro', note: '', commessa_id: '' },
  spesaFoto: null,       // filename restituito da /api/spese/analyze
  spesaPreview: null,    // data URL per anteprima
  spesaScanning: false,
  spesaDebug: null,

  trasForm: { data: today(), tariffa: 0.3936, partenza: '', destinazione: '', km: '', note: '', commessa_id: '' },

  settingsForm: { anthropic_api_key: '', tariffe: DEFAULT_TARIFFE.map(t => ({...t})) },

  toastTimer: null,
};

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
  const app = document.getElementById('app');
  app.innerHTML = renderApp();
  attachListeners();
}

function renderApp() {
  // Calcola anni disponibili
  const years = [...new Set([
    new Date().getFullYear(),
    ...state.spese.map(s => new Date(s.data).getFullYear()),
    ...state.trasferte.map(t => new Date(t.data).getFullYear()),
  ])].sort((a,b) => b - a);

  // Conteggio voci filtrate per badge tab
  const { spFilt: _sp, trFilt: _tr } = filteredItems();
  const count = _sp.length + _tr.length;

  return `
    <div class="container">
      <header class="header">
        <div class="logo">
          <div class="logo-icon">NS</div>
          <div>
            <div class="logo-title">Note Spese</div>
            <div class="logo-sub">Studio tecnico · AI powered</div>
          </div>
        </div>
        <div class="header-right">
          <select id="annoSel" class="anno-sel">
            ${years.map(y => `<option value="${y}" ${y===state.anno?'selected':''}>${y}</option>`).join('')}
          </select>
          <button class="btn-icon" data-action="goto-tab" data-tab="impostazioni" title="Impostazioni" style="font-size:20px;color:#888">⚙</button>
          <button class="user-chip" id="logoutBtn" title="Esci">
            ${esc(state.user?.email?.split('@')[0] || '')} ↩
          </button>
        </div>
      </header>

      <nav class="tabs">
        ${['commesse','spesa','trasferta','riepilogo','impostazioni'].map(id => `
          <button class="tab-btn ${state.tab===id?'active':''}" data-tab="${id}">
            ${{commesse:'Commesse',spesa:'Nuova spesa',trasferta:'Trasferta',
               riepilogo:`Riepilogo${count>0?' ('+count+')':''}`,impostazioni:'Impostazioni'}[id]}
          </button>`).join('')}
      </nav>

      <main>
        ${state.tab==='commesse'    ? renderCommesse()    : ''}
        ${state.tab==='spesa'       ? renderSpesa()       : ''}
        ${state.tab==='trasferta'   ? renderTrasferta()   : ''}
        ${state.tab==='riepilogo'   ? renderRiepilogo()   : ''}
        ${state.tab==='impostazioni'? renderImpostazioni(): ''}
      </main>
    </div>
    ${renderToast()}
  `;
}

// ── Tab: Commesse ──────────────────────────────────────────────────────────────

function renderCommesse() {
  const { commesse, spese, trasferte, commForm } = state;
  return `
    <div class="card">
      <div class="section-label">Nuova commessa</div>
      <div class="form-group" style="margin-top:0">
        <label>Nome commessa</label>
        <input id="cNome" value="${esc(commForm.nome)}" placeholder="Es. Perizia Rossi — Via Roma 5">
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label>Cliente</label>
          <input id="cCliente" value="${esc(commForm.cliente)}" placeholder="Cognome">
        </div>
        <div class="form-group">
          <label>Indirizzo cantiere</label>
          <input id="cIndirizzo" value="${esc(commForm.indirizzo)}" placeholder="Via, Comune">
        </div>
      </div>
      <button class="btn btn-primary" id="addCommessaBtn">+ Aggiungi commessa</button>
    </div>

    ${commesse.length === 0
      ? '<div class="empty">Nessuna commessa. Aggiungine una per iniziare.</div>'
      : commesse.map(c => {
          const totS = spese.filter(s => s.commessa_id === c.id).reduce((a,s) => a+parseFloat(s.importo), 0);
          const totT = trasferte.filter(t => t.commessa_id === c.id).reduce((a,t) => a+parseFloat(t.rimborso), 0);
          return `
            <div class="card-sm">
              <div class="commessa-header">
                <div>
                  <div class="commessa-nome">${esc(c.nome)}</div>
                  <div class="commessa-sub">${esc(c.cliente)}${c.indirizzo ? ' · '+esc(c.indirizzo) : ''}</div>
                </div>
                <button class="btn-icon" data-action="del-commessa" data-id="${c.id}">×</button>
              </div>
              <div class="commessa-stats">
                <div class="stat">
                  <div class="stat-label">Spese</div>
                  <div class="stat-val">${fmt(totS)}</div>
                </div>
                <div class="stat">
                  <div class="stat-label">Rimborso km</div>
                  <div class="stat-val">${fmt(totT)}</div>
                </div>
                <div class="stat">
                  <div class="stat-label">Totale</div>
                  <div class="stat-val accent">${fmt(totS+totT)}</div>
                </div>
              </div>
            </div>`;
        }).join('')
    }
  `;
}

// ── Tab: Spesa ─────────────────────────────────────────────────────────────────

function renderSpesa() {
  const { spesaForm, spesaPreview, spesaScanning, spesaDebug, commesse } = state;
  const commOpts = commesse.length === 0
    ? '<option value="">Crea prima una commessa</option>'
    : commesse.map(c => `<option value="${c.id}" ${String(spesaForm.commessa_id)===String(c.id)?'selected':''}>${esc(c.nome)} — ${esc(c.cliente)}</option>`).join('');

  let uploadContent;
  if (spesaScanning) {
    uploadContent = `<div class="upload-icon">🔍</div><div class="upload-title" style="color:#D85A30">Analisi AI in corso...</div>`;
  } else if (spesaPreview) {
    uploadContent = `<img src="${spesaPreview}" class="upload-preview" alt="scontrino"><div class="upload-change">Clicca per cambiare</div>`;
  } else {
    uploadContent = `<div class="upload-icon">📸</div><div class="upload-title">Carica scontrino o ricevuta</div><div class="upload-sub">Pedaggi, ristoranti, carburante, hotel...</div>`;
  }

  let debugHtml = '';
  if (spesaDebug) {
    const cls = spesaDebug.type === 'ok' ? 'debug-ok' : spesaDebug.type === 'err' ? 'debug-err' : 'debug-info';
    debugHtml = `<div class="debug-box ${cls}"><div class="debug-title">${esc(spesaDebug.title)}</div><div>${esc(spesaDebug.msg)}</div></div>`;
  }

  return `
    <div class="card">
      <div class="section-label">Aggiungi spesa</div>

      <div class="upload-zone ${spesaScanning?'scanning':spesaPreview?'has-preview':''}" id="uploadZone">
        ${uploadContent}
        <input type="file" id="photoInput" accept="image/*" style="display:none">
      </div>
      ${debugHtml}

      <div class="form-group">
        <label>Commessa</label>
        <select id="sCommessa">${commOpts}</select>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label>Data</label>
          <input type="date" id="sData" value="${esc(spesaForm.data)}">
        </div>
        <div class="form-group">
          <label>Importo €</label>
          <input type="number" step="0.01" min="0" id="sImporto" value="${esc(spesaForm.importo)}" placeholder="0.00">
        </div>
      </div>
      <div class="form-group">
        <label>Fornitore</label>
        <input id="sFornitore" value="${esc(spesaForm.fornitore)}" placeholder="Es. Autostrada BS-VR, Eni, Autogrill...">
      </div>
      <div class="form-group">
        <label>Categoria</label>
        <select id="sCategoria">
          ${CATEGORIE.map(c => `<option ${spesaForm.categoria===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Note (opzionale)</label>
        <input id="sNote" value="${esc(spesaForm.note)}" placeholder="Breve descrizione...">
      </div>
      <button class="btn btn-primary" id="addSpesaBtn">Salva spesa</button>
    </div>
  `;
}

// ── Tab: Trasferta ─────────────────────────────────────────────────────────────

function renderTrasferta() {
  const { trasForm, commesse } = state;
  const commOpts = commesse.length === 0
    ? '<option value="">Crea prima una commessa</option>'
    : commesse.map(c => `<option value="${c.id}" ${String(trasForm.commessa_id)===String(c.id)?'selected':''}>${esc(c.nome)} — ${esc(c.cliente)}</option>`).join('');

  const kmNum = parseFloat(trasForm.km) || 0;
  const rimborso = kmNum * parseFloat(trasForm.tariffa);

  return `
    <div class="card">
      <div class="section-label">Nuova trasferta</div>
      <div class="form-group" style="margin-top:0">
        <label>Commessa</label>
        <select id="tCommessa">${commOpts}</select>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label>Data</label>
          <input type="date" id="tData" value="${esc(trasForm.data)}">
        </div>
        <div class="form-group">
          <label>Tariffario rimborso km</label>
          <select id="tTariffa">
            ${state.tariffe.map(t => `<option value="${t.val}" ${String(trasForm.tariffa)===String(t.val)?'selected':''}>${esc(tariffLabel(t))}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Indirizzo di partenza</label>
        <input id="tPartenza" value="${esc(trasForm.partenza)}" placeholder="Es. Via Roma 1, Bovolone VR">
      </div>
      <div class="form-group">
        <label>Indirizzo di destinazione</label>
        <input id="tDestinazione" value="${esc(trasForm.destinazione)}" placeholder="Es. Piazza Bra 1, Verona VR">
      </div>
      <button class="btn btn-blue" id="mapsBtn">Apri su Google Maps per verificare il percorso</button>
      <div class="form-group">
        <label>Km percorsi (andata + ritorno)</label>
        <input type="number" step="0.1" min="0" id="tKm" value="${esc(trasForm.km)}" placeholder="Es. 42.5">
      </div>
      ${kmNum > 0 ? `
        <div class="rimborso-preview">
          <div class="rimborso-val">${fmt(rimborso)}</div>
          <div class="rimborso-sub">${trasForm.km} km × €${parseFloat(trasForm.tariffa).toFixed(4)}/km (tariffario ACI)</div>
        </div>` : ''}
      <div class="form-group">
        <label>Note (opzionale)</label>
        <input id="tNote" value="${esc(trasForm.note)}" placeholder="Es. Sopralluogo cantiere">
      </div>
      <button class="btn btn-primary" id="addTrasferaBtn">Salva trasferta</button>
    </div>
  `;
}

// ── Tab: Riepilogo ─────────────────────────────────────────────────────────────

function filteredItems() {
  const { spese, trasferte, commesse, anno, mese, commFiltro } = state;
  const spFilt = spese.filter(s =>
    new Date(s.data + 'T00:00:00').getFullYear() === anno &&
    (mese === -1 || new Date(s.data + 'T00:00:00').getMonth() === mese) &&
    (!commFiltro || s.commessa_id === parseInt(commFiltro))
  );
  const trFilt = trasferte.filter(t =>
    new Date(t.data + 'T00:00:00').getFullYear() === anno &&
    (mese === -1 || new Date(t.data + 'T00:00:00').getMonth() === mese) &&
    (!commFiltro || t.commessa_id === parseInt(commFiltro))
  );
  return { spFilt, trFilt };
}

function renderRiepilogo() {
  const { commesse, anno, mese, commFiltro } = state;
  const { spFilt, trFilt } = filteredItems();
  const totSp = spFilt.reduce((a,s) => a+parseFloat(s.importo), 0);
  const totKm = trFilt.reduce((a,t) => a+parseFloat(t.rimborso), 0);

  const allItems = [
    ...spFilt.map(s => {
      const c = commesse.find(x => x.id === s.commessa_id);
      return { id:s.id, tipo:'spesa', data:s.data, name:s.fornitore,
               meta:`${dateIt(s.data)} · ${s.categoria}${s.note?' · '+s.note:''} · ${c?.nome||'—'}`,
               val:s.importo, foto:s.foto_filename };
    }),
    ...trFilt.map(t => {
      const c = commesse.find(x => x.id === t.commessa_id);
      return { id:t.id, tipo:'km', data:t.data, name:`${t.partenza} → ${t.destinazione}`,
               meta:`${dateIt(t.data)} · ${t.km} km · ${c?.nome||'—'}`, val:t.rimborso };
    }),
  ].sort((a,b) => new Date(b.data) - new Date(a.data));

  return `
    <div class="filters">
      <select id="meseSel">
        <option value="-1" ${mese===-1?'selected':''}>Tutti i mesi</option>
        ${MESI.map((m,i) => `<option value="${i}" ${mese===i?'selected':''}>${m}</option>`).join('')}
      </select>
      <select id="commFiltroSel">
        <option value="">Tutte le commesse</option>
        ${commesse.map(c => `<option value="${c.id}" ${commFiltro==c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
      </select>
      <button class="btn btn-outline" id="csvBtn">⬇ CSV</button>
    </div>

    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-label">Spese vive</div>
        <div class="summary-val">${fmt(totSp)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Rimborso km</div>
        <div class="summary-val">${fmt(totKm)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Totale rimborsi</div>
        <div class="summary-val">${fmt(totSp+totKm)}</div>
      </div>
    </div>

    <div class="card" style="padding:16px 20px">
      ${allItems.length === 0
        ? '<div class="empty" style="padding:24px 0">Nessun dato per i filtri selezionati</div>'
        : allItems.map(item => `
          <div class="list-item">
            <div class="item-badge ${item.tipo==='spesa'?'badge-sp':'badge-km'}">
              ${item.tipo==='spesa'?'SP':'KM'}
            </div>
            <div class="item-body">
              <div class="item-name">${esc(item.name)}</div>
              <div class="item-meta">${esc(item.meta)}</div>
            </div>
            <span class="item-tag ${item.tipo==='spesa'?'item-tag-sp':'item-tag-km'}">
              ${item.tipo==='spesa'?'Spesa':'Km'}
            </span>
            ${item.foto ? `<a href="/uploads/${esc(item.foto)}" target="_blank" class="item-foto-link" title="Vedi scontrino">🧾</a>` : ''}
            <div class="item-val">${fmt(item.val)}</div>
            <button class="btn-icon" data-action="${item.tipo==='spesa'?'del-spesa':'del-trasferta'}" data-id="${item.id}">×</button>
          </div>`).join('')
      }
    </div>
  `;
}

// ── Tab: Impostazioni ──────────────────────────────────────────────────────────

function renderImpostazioni() {
  const { settings, settingsForm, tariffe } = state;
  return `
    <div class="card">
      <div class="section-label">API Anthropic (analisi scontrini AI)</div>
      <div class="api-key-status ${settings.has_api_key?'api-key-ok':'api-key-no'}">
        ${settings.has_api_key ? '✓ Chiave configurata '+esc(settings.api_key_preview) : '✗ Chiave non configurata'}
      </div>
      <div class="form-group" style="margin-top:0">
        <label>${settings.has_api_key ? 'Nuova chiave API (lascia vuoto per mantenere quella attuale)' : 'Chiave API'}</label>
        <input type="password" id="apiKeyInput" value="${esc(settingsForm.anthropic_api_key)}" placeholder="sk-ant-...">
      </div>
      <p style="font-size:12px;color:#888;margin-top:8px;line-height:1.5">
        La chiave API viene usata solo dal server per analizzare le foto degli scontrini.
        Non viene mai inviata al browser. Ottieni la tua chiave su console.anthropic.com.
      </p>
    </div>

    <div class="card">
      <div class="section-label">Tariffe rimborso km</div>
      <p style="font-size:12px;color:#888;margin-bottom:16px;line-height:1.5">
        Valori €/km usati nel calcolo delle trasferte. Aggiorna ogni anno con le tariffe ACI ufficiali.
      </p>
      <div style="display:grid;gap:8px">
        ${settingsForm.tariffe.map(t => `
          <div style="display:flex;align-items:center;gap:10px">
            <span style="flex:1;font-size:13px;color:#444">${esc(t.label)}</span>
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
              <input
                type="number" step="0.0001" min="0" max="9.9999"
                class="tariffa-input"
                data-id="${t.id}"
                value="${t.val.toFixed(4)}"
                style="width:90px;text-align:right;padding:7px 10px;border:1px solid #ddd;border-radius:7px;font-size:13px;font-family:inherit">
              <span style="font-size:12px;color:#888;width:30px">€/km</span>
            </div>
          </div>`).join('')}
      </div>
      <button class="btn btn-primary" id="saveSettingsBtn">Salva impostazioni</button>
    </div>

    <div class="card">
      <div class="section-label">Account</div>
      <p style="font-size:14px;color:#555;margin-bottom:12px">Accesso: <strong>${esc(state.user?.email||'')}</strong></p>
      <button class="btn btn-outline" id="logoutBtn2">Esci dall'account</button>
    </div>
  `;
}

// ── Toast ──────────────────────────────────────────────────────────────────────

function showToast(msg, type='ok') {
  if (state.toastTimer) clearTimeout(state.toastTimer);
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  state.toastTimer = setTimeout(() => el.remove(), 3000);
}

function renderToast() { return ''; } // Toast gestito direttamente nel DOM

// ── Event listeners ────────────────────────────────────────────────────────────

function attachListeners() {
  const app = document.getElementById('app');

  // Tab navigation
  app.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      render();
    });
  });

  // Anno selector
  const annoSel = document.getElementById('annoSel');
  if (annoSel) annoSel.addEventListener('change', () => {
    state.anno = parseInt(annoSel.value);
    render();
  });

  // Logout
  ['logoutBtn','logoutBtn2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method:'POST' });
      window.location.href = '/login.html';
    });
  });

  attachCommesseListeners();
  attachSpesaListeners();
  attachTrasferaListeners();
  attachRiepilogoListeners();
  attachImpostazioniListeners();
}

function handleDelegatedClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === 'goto-tab') { state.tab = btn.dataset.tab; render(); return; }
  if (action === 'del-commessa') deleteCommessa(parseInt(id));
  if (action === 'del-spesa') deleteSpesa(parseInt(id));
  if (action === 'del-trasferta') deleteTrasferta(parseInt(id));
}

// ── Commesse listeners ─────────────────────────────────────────────────────────

function attachCommesseListeners() {
  const btn = document.getElementById('addCommessaBtn');
  if (!btn) return;

  ['cNome','cCliente','cIndirizzo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => {
      state.commForm[{cNome:'nome',cCliente:'cliente',cIndirizzo:'indirizzo'}[id]] = el.value;
    });
  });

  btn.addEventListener('click', addCommessa);
}

async function addCommessa() {
  const { nome, cliente, indirizzo } = state.commForm;
  if (!nome.trim() || !cliente.trim()) { showToast('Nome e cliente obbligatori', 'err'); return; }
  try {
    const nuova = await apiCall('POST', '/api/commesse', { nome, cliente, indirizzo });
    state.commesse.unshift(nuova);
    state.commForm = { nome:'', cliente:'', indirizzo:'' };
    showToast('Commessa aggiunta!');
    render();
  } catch(err) { showToast(err.message, 'err'); }
}

async function deleteCommessa(id) {
  if (!confirm('Eliminare commessa e tutte le sue voci?')) return;
  try {
    await apiCall('DELETE', `/api/commesse/${id}`);
    state.commesse = state.commesse.filter(c => c.id !== id);
    state.spese = state.spese.filter(s => s.commessa_id !== id);
    state.trasferte = state.trasferte.filter(t => t.commessa_id !== id);
    showToast('Commessa eliminata');
    render();
  } catch(err) { showToast(err.message, 'err'); }
}

// ── Spesa listeners ────────────────────────────────────────────────────────────

function attachSpesaListeners() {
  const zone = document.getElementById('uploadZone');
  if (!zone) return;

  zone.addEventListener('click', () => {
    if (!state.spesaScanning) document.getElementById('photoInput')?.click();
  });

  document.getElementById('photoInput')?.addEventListener('change', handleImageSelect);

  const fields = { sCommessa:'commessa_id', sData:'data', sImporto:'importo',
                   sFornitore:'fornitore', sCategoria:'categoria', sNote:'note' };
  Object.entries(fields).forEach(([id, key]) => {
    document.getElementById(id)?.addEventListener('input', e => {
      state.spesaForm[key] = e.target.value;
      // Non fare re-render su ogni keystroke per i campi testo
    });
    document.getElementById(id)?.addEventListener('change', e => {
      state.spesaForm[key] = e.target.value;
    });
  });

  document.getElementById('addSpesaBtn')?.addEventListener('click', addSpesa);
}

async function handleImageSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  // Mostra preview locale
  const reader = new FileReader();
  reader.onload = async ev => {
    state.spesaPreview = ev.target.result;
    state.spesaScanning = true;
    state.spesaDebug = { type:'info', title:'Analisi AI in corso...', msg:'Lettura documento...' };
    render();

    try {
      const formData = new FormData();
      formData.append('photo', file);
      const r = await fetch('/api/spese/analyze', { method:'POST', body:formData });
      const data = await r.json();

      state.spesaFoto = data.foto_filename || null;

      if (data.error) {
        state.spesaDebug = { type:'err', title:'Errore API', msg:data.error };
      } else if (!data.extracted) {
        state.spesaDebug = { type:'info', title:'Foto caricata', msg:data.message || 'Compila manualmente i campi.' };
      } else {
        const p = data.extracted;
        const CATEGORIE_VALIDE = ["Carburante","Vitto","Alloggio","Trasporti","Pedaggi","Materiali","Pratiche","Telefonia","Attrezzatura","Cancelleria","Altro"];
        if (p.data) state.spesaForm.data = p.data;
        if (p.importo != null) state.spesaForm.importo = String(p.importo);
        if (p.fornitore) state.spesaForm.fornitore = p.fornitore;
        if (p.categoria && CATEGORIE_VALIDE.includes(p.categoria)) state.spesaForm.categoria = p.categoria;
        if (p.note) state.spesaForm.note = p.note;
        state.spesaDebug = {
          type:'ok', title:'Documento analizzato',
          msg:`Data: ${p.data||'—'} · Importo: ${p.importo!=null?fmt(p.importo):'—'} · Fornitore: ${p.fornitore||'—'} · Categoria: ${p.categoria||'—'}`,
        };
        showToast('Scontrino analizzato!');
      }
    } catch(err) {
      state.spesaDebug = { type:'err', title:'Errore di rete', msg:err.message };
    }

    state.spesaScanning = false;
    render();
  };
  reader.readAsDataURL(file);
}

async function addSpesa() {
  // Legge dal DOM per evitare qualsiasi disallineamento di stato
  const commessa_id = document.getElementById('sCommessa')?.value
    || state.spesaForm.commessa_id
    || state.commesse[0]?.id;
  const data      = document.getElementById('sData')?.value      || state.spesaForm.data;
  const importo   = document.getElementById('sImporto')?.value   || state.spesaForm.importo;
  const fornitore = document.getElementById('sFornitore')?.value || state.spesaForm.fornitore;
  const categoria = document.getElementById('sCategoria')?.value || state.spesaForm.categoria;
  const note      = document.getElementById('sNote')?.value      ?? state.spesaForm.note;

  if (!importo || !fornitore) { showToast('Importo e fornitore obbligatori', 'err'); return; }
  if (!commessa_id) { showToast('Crea prima una commessa', 'err'); return; }

  try {
    const nuova = await apiCall('POST', '/api/spese', {
      commessa_id, data, importo, fornitore, categoria, note,
      foto_filename: state.spesaFoto,
    });
    state.spese.unshift(nuova);
    state.spesaForm = { data:today(), importo:'', fornitore:'', categoria:'Altro', note:'', commessa_id };
    state.spesaFoto = null;
    state.spesaPreview = null;
    state.spesaDebug = null;
    showToast('Spesa salvata! Puoi aggiungerne un\'altra.');
    render();
  } catch(err) { showToast(err.message, 'err'); }
}

async function deleteSpesa(id) {
  if (!confirm('Eliminare questa spesa?')) return;
  try {
    await apiCall('DELETE', `/api/spese/${id}`);
    state.spese = state.spese.filter(s => s.id !== id);
    showToast('Spesa eliminata');
    render();
  } catch(err) { showToast(err.message, 'err'); }
}

// ── Trasferta listeners ────────────────────────────────────────────────────────

function attachTrasferaListeners() {
  if (!document.getElementById('tKm')) return;

  const fields = { tCommessa:'commessa_id', tData:'data', tPartenza:'partenza',
                   tDestinazione:'destinazione', tNote:'note' };
  Object.entries(fields).forEach(([id, key]) => {
    document.getElementById(id)?.addEventListener('input', e => { state.trasForm[key] = e.target.value; });
    document.getElementById(id)?.addEventListener('change', e => { state.trasForm[key] = e.target.value; });
  });

  document.getElementById('tTariffa')?.addEventListener('change', e => {
    state.trasForm.tariffa = parseFloat(e.target.value);
    render();
  });

  document.getElementById('tKm')?.addEventListener('input', e => {
    state.trasForm.km = e.target.value;
    // Re-render solo per aggiornare il preview rimborso
    const km = parseFloat(e.target.value) || 0;
    const el = document.querySelector('.rimborso-preview');
    if (km > 0) {
      const rimborso = km * parseFloat(state.trasForm.tariffa);
      if (el) {
        el.querySelector('.rimborso-val').textContent = fmt(rimborso);
        el.querySelector('.rimborso-sub').textContent = `${km} km × €${parseFloat(state.trasForm.tariffa).toFixed(4)}/km (tariffario ACI)`;
      } else {
        render(); // first time show the preview
      }
    } else if (el) {
      render(); // remove preview
    }
  });

  document.getElementById('mapsBtn')?.addEventListener('click', () => {
    const p = state.trasForm.partenza.trim(), d = state.trasForm.destinazione.trim();
    if (!p || !d) { showToast('Inserisci partenza e destinazione', 'err'); return; }
    window.open(`https://www.google.com/maps/dir/${encodeURIComponent(p)}/${encodeURIComponent(d)}`, '_blank');
  });

  document.getElementById('addTrasferaBtn')?.addEventListener('click', addTrasferta);
}

async function addTrasferta() {
  // Legge dal DOM per evitare qualsiasi disallineamento di stato
  const commessa_id  = document.getElementById('tCommessa')?.value
    || state.trasForm.commessa_id
    || state.commesse[0]?.id;
  const data         = document.getElementById('tData')?.value         || state.trasForm.data;
  const km           = document.getElementById('tKm')?.value           || state.trasForm.km;
  const partenza     = document.getElementById('tPartenza')?.value     || state.trasForm.partenza;
  const destinazione = document.getElementById('tDestinazione')?.value || state.trasForm.destinazione;
  const note         = document.getElementById('tNote')?.value         ?? state.trasForm.note;
  const tariffa      = state.trasForm.tariffa;

  if (!km || !partenza || !destinazione) { showToast('Inserisci km, partenza e destinazione', 'err'); return; }
  if (!commessa_id) { showToast('Crea prima una commessa', 'err'); return; }

  try {
    const nuova = await apiCall('POST', '/api/trasferte', { commessa_id, data, partenza, destinazione, km, tariffa, note });
    state.trasferte.unshift(nuova);
    state.trasForm = { ...state.trasForm, km:'', partenza:'', destinazione:'', note:'', commessa_id };
    showToast('Trasferta salvata!');
    render();
  } catch(err) { showToast(err.message, 'err'); }
}

async function deleteTrasferta(id) {
  if (!confirm('Eliminare questa trasferta?')) return;
  try {
    await apiCall('DELETE', `/api/trasferte/${id}`);
    state.trasferte = state.trasferte.filter(t => t.id !== id);
    showToast('Trasferta eliminata');
    render();
  } catch(err) { showToast(err.message, 'err'); }
}

// ── Riepilogo listeners ────────────────────────────────────────────────────────

function attachRiepilogoListeners() {
  document.getElementById('meseSel')?.addEventListener('change', e => {
    state.mese = parseInt(e.target.value);
    render();
  });
  document.getElementById('commFiltroSel')?.addEventListener('change', e => {
    state.commFiltro = e.target.value;
    render();
  });
  document.getElementById('csvBtn')?.addEventListener('click', esportaCSV);
}

function esportaCSV() {
  const { spese, trasferte, commesse, anno, mese } = state;
  const { spFilt, trFilt } = filteredItems();
  const rows = [
    ['Tipo','Data','Descrizione','Commessa','Dettaglio','Importo €','Note'],
    ...spFilt.map(s => {
      const c = commesse.find(x => x.id === s.commessa_id);
      return ['Spesa', s.data, s.fornitore, c?.nome||'—', s.categoria, parseFloat(s.importo).toFixed(2), s.note||''];
    }),
    ...trFilt.map(t => {
      const c = commesse.find(x => x.id === t.commessa_id);
      return ['Trasferta', t.data, `${t.partenza} → ${t.destinazione}`, c?.nome||'—', `${parseFloat(t.km)} km`, parseFloat(t.rimborso).toFixed(2), t.note||''];
    }),
  ].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');

  const filename = `NoteSpese_${anno}${mese >= 0 ? '_' + MESI[mese] : ''}.csv`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF' + rows], { type:'text/csv;charset=utf-8;' }));
  a.download = filename;
  a.click();
}

// ── Impostazioni listeners ─────────────────────────────────────────────────────

function attachImpostazioniListeners() {
  document.getElementById('apiKeyInput')?.addEventListener('input', e => {
    state.settingsForm.anthropic_api_key = e.target.value;
  });
  document.getElementById('saveSettingsBtn')?.addEventListener('click', saveSettings);
}

async function saveSettings() {
  const key = state.settingsForm.anthropic_api_key.trim();

  // Legge i valori tariffe direttamente dal DOM al momento del salvataggio
  const tariffe = DEFAULT_TARIFFE.map(def => {
    const input = document.querySelector(`.tariffa-input[data-id="${def.id}"]`);
    const val = input ? Math.max(0, parseFloat(input.value) || 0) : def.val;
    return { id: def.id, label: def.label, val };
  });

  try {
    await apiCall('PUT', '/api/settings', { anthropic_api_key: key, tariffe });
    const s = await fetch('/api/settings').then(r => r.json());
    state.settings = s;
    state.tariffe = s.tariffe || DEFAULT_TARIFFE;
    state.settingsForm.anthropic_api_key = '';
    state.settingsForm.tariffe = state.tariffe.map(t => ({...t}));
    // Aggiorna la tariffa selezionata nel form trasferta se non è più valida
    const validVals = new Set(state.tariffe.map(t => String(t.val)));
    if (!validVals.has(String(state.trasForm.tariffa))) {
      state.trasForm.tariffa = state.tariffe[1]?.val ?? state.tariffe[0].val;
    }
    showToast('Impostazioni salvate!');
    render();
  } catch(err) { showToast(err.message, 'err'); }
}

// ── Init ───────────────────────────────────────────────────────────────────────

async function init() {
  // Il listener delegato si registra UNA VOLTA SOLA sull'elemento che persiste
  document.getElementById('app').addEventListener('click', handleDelegatedClick);

  try {
    const r = await fetch('/api/auth/me');
    if (!r.ok) { window.location.href = '/login.html'; return; }
    state.user = await r.json();

    const [commesse, spese, trasferte, settings] = await Promise.all([
      fetch('/api/commesse').then(r => r.json()),
      fetch('/api/spese').then(r => r.json()),
      fetch('/api/trasferte').then(r => r.json()),
      fetch('/api/settings').then(r => r.json()),
    ]);
    state.commesse = commesse;
    state.spese = spese;
    state.trasferte = trasferte;
    state.settings = settings;
    state.tariffe = settings.tariffe || DEFAULT_TARIFFE;
    state.settingsForm.tariffe = state.tariffe.map(t => ({...t}));

    // Tariffa di default: Benzina 1001-1600cc (indice 1)
    state.trasForm.tariffa = state.tariffe[1]?.val ?? state.tariffe[0]?.val ?? 0.3936;

    // Preseleziona prima commessa nei form
    if (commesse.length > 0) {
      state.spesaForm.commessa_id = commesse[0].id;
      state.trasForm.commessa_id = commesse[0].id;
    }

    render();
  } catch(err) {
    document.getElementById('app').innerHTML =
      `<div class="container"><div class="empty" style="padding-top:80px">Errore di caricamento: ${esc(err.message)}</div></div>`;
  }
}

init();

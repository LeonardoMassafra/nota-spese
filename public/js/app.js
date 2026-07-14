// ── Costanti ──────────────────────────────────────────────────────────────────

const MESI = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
              "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const CATEGORIE = ["Carburante","Vitto","Alloggio","Trasporti","Pedaggi",
                   "Materiali","Pratiche","Telefonia","Attrezzatura","Cancelleria","Altro"];
const PAGAMENTI = ["Contanti","Carta aziendale","Carta personale"];
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
const pf = v => parseFloat(String(v).replace(',', '.')) || 0;
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

  spesaForm: { data: today(), importo: '', fornitore: '', categoria: 'Altro', note: '', pagamento: '', commessa_id: '' },
  spesaFoto: null,       // filename restituito da /api/spese/analyze
  spesaPreview: null,    // data URL per anteprima
  spesaScanning: false,
  spesaDebug: null,
  editSpesaId: null,     // id spesa in modifica (null = nuova)

  trasForm: { data: today(), tariffa: 0.3936, partenza: '', destinazione: '', km: '', pedaggio: '', pagamento: '', note: '', commessa_id: '' },
  editTrasfertaId: null, // id trasferta in modifica (null = nuova)

  settingsForm: { anthropic_api_key: '', tariffe: DEFAULT_TARIFFE.map(t => ({...t})),
                  emittente_nome: '', emittente_piva: '', emittente_indirizzo: '', operatore: '' },

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
        ${['commesse','spesa','trasferta','riepilogo','documento','impostazioni'].map(id => `
          <button class="tab-btn ${state.tab===id?'active':''}" data-tab="${id}">
            ${{commesse:'Commesse',spesa:'Nuova spesa',trasferta:'Trasferta',
               riepilogo:`Riepilogo${count>0?' ('+count+')':''}`,documento:'Documento',impostazioni:'Impostazioni'}[id]}
          </button>`).join('')}
      </nav>

      <main>
        ${state.tab==='commesse'    ? renderCommesse()    : ''}
        ${state.tab==='spesa'       ? renderSpesa()       : ''}
        ${state.tab==='trasferta'   ? renderTrasferta()   : ''}
        ${state.tab==='riepilogo'   ? renderRiepilogo()   : ''}
        ${state.tab==='documento'   ? renderDocumento()   : ''}
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
          const totS = spese.filter(s => s.commessa_id === c.id).reduce((a,s) => a+pf(s.importo), 0);
          const totT = trasferte.filter(t => t.commessa_id === c.id).reduce((a,t) => a+pf(t.rimborso), 0);
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

  const editing = !!state.editSpesaId;
  return `
    <div class="card">
      <div class="section-label">${editing ? 'Modifica spesa' : 'Aggiungi spesa'}</div>

      ${editing ? '' : `
      <div class="upload-zone ${spesaScanning?'scanning':spesaPreview?'has-preview':''}" id="uploadZone">
        ${uploadContent}
        <input type="file" id="photoInput" accept="image/*" style="display:none">
      </div>
      ${debugHtml}`}

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
      <div class="grid-2">
        <div class="form-group">
          <label>Categoria</label>
          <select id="sCategoria">
            ${CATEGORIE.map(c => `<option ${spesaForm.categoria===c?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Pagamento</label>
          <select id="sPagamento">
            <option value="" ${!spesaForm.pagamento?'selected':''}>— non indicato</option>
            ${PAGAMENTI.map(p => `<option ${spesaForm.pagamento===p?'selected':''}>${p}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Note (opzionale)</label>
        <input id="sNote" value="${esc(spesaForm.note)}" placeholder="Breve descrizione...">
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" id="addSpesaBtn">${editing ? 'Salva modifiche' : 'Salva spesa'}</button>
        ${editing ? '<button class="btn btn-outline" id="cancelEditSpesaBtn">Annulla</button>' : ''}
      </div>
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

  const editing = !!state.editTrasfertaId;
  return `
    <div class="card">
      <div class="section-label">${editing ? 'Modifica trasferta' : 'Nuova trasferta'}</div>
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
      <div class="grid-2">
        <div class="form-group">
          <label>Pedaggio autostradale € (opzionale)</label>
          <input type="number" step="0.01" min="0" id="tPedaggio" value="${esc(trasForm.pedaggio)}" placeholder="Es. 14.50">
        </div>
        <div class="form-group">
          <label>Pagamento pedaggio</label>
          <select id="tPagamento">
            <option value="" ${!trasForm.pagamento?'selected':''}>— non indicato</option>
            ${PAGAMENTI.map(p => `<option ${trasForm.pagamento===p?'selected':''}>${p}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Note (opzionale)</label>
        <input id="tNote" value="${esc(trasForm.note)}" placeholder="Es. Sopralluogo cantiere">
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" id="addTrasferaBtn">${editing ? 'Salva modifiche' : 'Salva trasferta'}</button>
        ${editing ? '<button class="btn btn-outline" id="cancelEditTrasferaBtn">Annulla</button>' : ''}
      </div>
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
  const totSp = spFilt.reduce((a,s) => a+pf(s.importo), 0);
  const totKm = trFilt.reduce((a,t) => a+pf(t.rimborso), 0);
  const totPed = trFilt.reduce((a,t) => a+pf(t.pedaggio), 0);
  const totGen = totSp + totKm + totPed;

  const allItems = [
    ...spFilt.map(s => {
      const c = commesse.find(x => x.id === s.commessa_id);
      return { id:s.id, tipo:'spesa', data:s.data, name:s.fornitore,
               meta:`${dateIt(s.data)} · ${s.categoria}${s.note?' · '+s.note:''} · ${c?.nome||'—'}`,
               val:s.importo, foto:s.foto_filename };
    }),
    ...trFilt.map(t => {
      const c = commesse.find(x => x.id === t.commessa_id);
      const ped = pf(t.pedaggio);
      return { id:t.id, tipo:'km', data:t.data, name:`${t.partenza} → ${t.destinazione}`,
               meta:`${dateIt(t.data)} · ${t.km} km${ped>0?' · pedaggio '+fmt(ped):''} · ${c?.nome||'—'}`,
               val:pf(t.rimborso)+ped };
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
      ${totPed > 0 ? `
      <div class="summary-card">
        <div class="summary-label">Pedaggi</div>
        <div class="summary-val">${fmt(totPed)}</div>
      </div>` : ''}
      <div class="summary-card">
        <div class="summary-label">Totale rimborsi</div>
        <div class="summary-val">${fmt(totGen)}</div>
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
            ${item.foto
              ? `<a href="/api/spese/${item.id}/foto" target="_blank" rel="noopener" class="item-foto-link" title="Vedi scontrino">🧾</a>`
              : (item.tipo==='spesa'
                  ? `<button class="btn-icon item-foto-attach" data-action="attach-foto" data-id="${item.id}" title="Allega scontrino dal telefono">📎</button>`
                  : '')}
            <div class="item-val">${fmt(item.val)}</div>
            <button class="btn-icon" data-action="${item.tipo==='spesa'?'edit-spesa':'edit-trasferta'}" data-id="${item.id}" title="Modifica">✎</button>
            <button class="btn-icon" data-action="${item.tipo==='spesa'?'del-spesa':'del-trasferta'}" data-id="${item.id}" title="Elimina">×</button>
          </div>`).join('')
      }
    </div>
  `;
}

// ── Tab: Documento ─────────────────────────────────────────────────────────────

// Costruisce le righe unificate del documento (spese + trasferte + pedaggi come riga propria),
// in ordine cronologico, per il periodo selezionato (anno + mese). Ignora il filtro commessa:
// il documento riepiloga sempre tutte le commesse del periodo.
function documentoDati() {
  const { spese, trasferte, commesse, anno, mese } = state;
  const inPeriodo = d => {
    const dt = new Date(d + 'T00:00:00');
    return dt.getFullYear() === anno && (mese === -1 || dt.getMonth() === mese);
  };
  const commNome = id => commesse.find(c => c.id === id)?.nome || '—';

  const sp = spese.filter(s => inPeriodo(s.data));
  const tr = trasferte.filter(t => inPeriodo(t.data));
  // Risale alla categoria ACI (es. "Diesel ≤1600cc") dal valore €/km salvato sulla trasferta
  const catTariffa = val => (state.tariffe.find(x => Math.abs(pf(x.val) - pf(val)) < 1e-6)?.label) || '';

  const rows = [];
  sp.forEach(s => rows.push({
    data: s.data, tipo: 'Spesa', descrizione: s.fornitore, commessa: commNome(s.commessa_id),
    dettaglio: s.categoria + (s.note ? ' · ' + s.note : '') + (s.foto_filename ? ' · 📎 scontrino allegato' : ''),
    pagamento: s.pagamento || '', importo: pf(s.importo), cls: 'row-sp',
  }));
  tr.forEach(t => {
    const cat = catTariffa(t.tariffa);
    rows.push({
      data: t.data, tipo: 'Trasferta', descrizione: `${t.partenza} → ${t.destinazione}`,
      commessa: commNome(t.commessa_id),
      dettaglio: `${pf(t.km)} km × €${pf(t.tariffa).toFixed(4)}/km${cat ? ' · ' + cat : ''}`,
      pagamento: '—', importo: pf(t.rimborso), cls: 'row-km',
    });
    if (pf(t.pedaggio) > 0) rows.push({
      data: t.data, tipo: 'Pedaggio', descrizione: `Pedaggio autostradale — ${t.partenza} → ${t.destinazione}`,
      commessa: commNome(t.commessa_id), dettaglio: 'Casello autostradale', pagamento: t.pagamento || '',
      importo: pf(t.pedaggio), cls: 'row-ped',
    });
  });
  // Sort stabile per data: a parità di giorno la trasferta resta seguita dal suo pedaggio
  rows.sort((a, b) => new Date(a.data) - new Date(b.data));

  const totKm = tr.reduce((a, t) => a + pf(t.rimborso), 0);
  const totPed = tr.reduce((a, t) => a + pf(t.pedaggio), 0);
  const totSp = sp.reduce((a, s) => a + pf(s.importo), 0);
  return { rows, totKm, totPed, totSp, totale: totKm + totPed + totSp };
}

function renderDocumento() {
  const { anno, mese, settings } = state;
  const { rows, totKm, totPed, totSp, totale } = documentoDati();
  const periodo = mese === -1 ? `Anno ${anno}` : `${MESI[mese]} ${anno}`;
  const nome = settings.emittente_nome || '';
  const piva = settings.emittente_piva || '';
  const indir = settings.emittente_indirizzo || '';
  const operatore = settings.operatore || '';
  const oggi = new Date().toLocaleDateString('it-IT');

  return `
    <div class="doc-controls no-print">
      <select id="docMeseSel">
        <option value="-1" ${mese===-1?'selected':''}>Tutto l'anno ${anno}</option>
        ${MESI.map((m,i) => `<option value="${i}" ${mese===i?'selected':''}>${m} ${anno}</option>`).join('')}
      </select>
      <button class="btn btn-primary" id="printDocBtn">🖨 Stampa / Salva PDF</button>
      <button class="btn btn-outline" id="zipScontriniBtn">⬇ Scontrini (ZIP)</button>
    </div>
    ${!nome ? `<div class="doc-hint no-print">Compila l'intestazione (nome, P.IVA, indirizzo) in <b>Impostazioni</b> per completare il documento.</div>` : ''}

    <div class="doc-sheet" id="docSheet">
      <div class="doc-head">
        <div class="doc-emitt">
          <div class="doc-emitt-nome">${esc(nome) || 'Nome / Ragione sociale'}</div>
          ${piva ? `<div class="doc-emitt-line">P.IVA / C.F. ${esc(piva)}</div>` : ''}
          ${indir ? `<div class="doc-emitt-line">${esc(indir)}</div>` : ''}
        </div>
        <div class="doc-title">
          <div class="doc-title-main">Nota Spese</div>
          <div class="doc-title-per">${esc(periodo)}</div>
          <div class="doc-title-gen">Emesso il ${oggi}</div>
        </div>
      </div>

      <div class="doc-operatore">
        <span class="doc-op-label">Rimborso spettante a</span>
        <span class="doc-op-nome">${esc(operatore) || '________________________'}</span>
      </div>

      ${rows.length === 0
        ? `<div class="doc-empty">Nessuna voce registrata per ${esc(periodo)}.</div>`
        : `<table class="doc-table">
            <thead><tr>
              <th>Data</th><th>Tipo</th><th>Descrizione</th><th>Commessa</th>
              <th>Dettaglio</th><th>Pagamento</th><th class="num">Importo</th>
            </tr></thead>
            <tbody>
              ${rows.map(r => `<tr class="${r.cls}">
                <td class="nowrap">${dateIt(r.data)}</td>
                <td><span class="doc-tipo doc-tipo-${r.tipo.toLowerCase()}">${r.tipo}</span></td>
                <td>${esc(r.descrizione)}</td>
                <td>${esc(r.commessa)}</td>
                <td>${esc(r.dettaglio)}</td>
                <td>${esc(r.pagamento||'')}</td>
                <td class="num">${fmt(r.importo)}</td>
              </tr>`).join('')}
            </tbody>
          </table>

          <div class="doc-totals">
            <div class="doc-tot-row"><span>Rimborso chilometrico</span><span>${fmt(totKm)}</span></div>
            ${totPed>0 ? `<div class="doc-tot-row"><span>Pedaggi autostradali</span><span>${fmt(totPed)}</span></div>` : ''}
            <div class="doc-tot-row"><span>Spese vive</span><span>${fmt(totSp)}</span></div>
            <div class="doc-tot-row doc-tot-grand"><span>Totale da rimborsare</span><span>${fmt(totale)}</span></div>
          </div>`
      }

      <div class="doc-sign">
        <div class="doc-sign-col">
          <div class="doc-sign-line"></div>
          <div class="doc-sign-label">Luogo e data</div>
        </div>
        <div class="doc-sign-col">
          ${operatore ? `<div class="doc-sign-name">${esc(operatore)}</div>` : ''}
          <div class="doc-sign-line"></div>
          <div class="doc-sign-label">Firma dell'operatore</div>
        </div>
      </div>

      <div class="doc-foot">Rimborsi chilometrici calcolati secondo le tariffe ACI vigenti.</div>
    </div>
  `;
}

// ── Tab: Impostazioni ──────────────────────────────────────────────────────────

function renderImpostazioni() {
  const { settings, settingsForm, tariffe } = state;
  return `
    <div class="card">
      <div class="section-label">Intestazione documento (chi presenta la nota spese)</div>
      <p style="font-size:12px;color:#888;margin-bottom:14px;line-height:1.5">
        Questi dati compaiono in cima al documento "Nota Spese" da consegnare al commercialista. Si compilano una volta sola.
      </p>
      <div class="form-group" style="margin-top:0">
        <label>Nome / Ragione sociale</label>
        <input id="emNome" value="${esc(settingsForm.emittente_nome)}" placeholder="Es. Global Geo S.n.c. — Geom. Leonardo Massafra">
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label>Partita IVA / C.F.</label>
          <input id="emPiva" value="${esc(settingsForm.emittente_piva)}" placeholder="Es. 04611370232">
        </div>
        <div class="form-group">
          <label>Indirizzo</label>
          <input id="emIndirizzo" value="${esc(settingsForm.emittente_indirizzo)}" placeholder="Es. Via Ormaneto 26, Bovolone (VR)">
        </div>
      </div>
      <div class="form-group">
        <label>Operatore (a chi spetta il rimborso)</label>
        <input id="emOperatore" value="${esc(settingsForm.operatore)}" placeholder="Es. Geom. Leonardo Massafra">
      </div>
      <button class="btn btn-primary" id="saveAnagraficaBtn">Salva intestazione</button>
    </div>

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
  attachDocumentoListeners();
  attachImpostazioniListeners();
}

function attachDocumentoListeners() {
  document.getElementById('docMeseSel')?.addEventListener('change', e => {
    state.mese = parseInt(e.target.value);
    render();
  });
  document.getElementById('printDocBtn')?.addEventListener('click', () => window.print());
  document.getElementById('zipScontriniBtn')?.addEventListener('click', esportaScontriniZip);
}

// Scarica in un unico ZIP tutti gli scontrini (foto) del periodo selezionato,
// pronti da allegare alla nota spese per il commercialista.
async function esportaScontriniZip() {
  const { spese, anno, mese } = state;
  const inPeriodo = d => {
    const dt = new Date(d + 'T00:00:00');
    return dt.getFullYear() === anno && (mese === -1 || dt.getMonth() === mese);
  };
  const conFoto = spese.filter(s => inPeriodo(s.data) && s.foto_filename);

  if (typeof JSZip === 'undefined') { showToast('Libreria ZIP non caricata, ricarica la pagina', 'err'); return; }
  if (conFoto.length === 0) { showToast('Nessuno scontrino allegato in questo periodo', 'err'); return; }

  const extFromType = (t, fname) => {
    if (t === 'image/jpeg') return 'jpg';
    if (t === 'image/png') return 'png';
    if (t === 'image/webp') return 'webp';
    if (t === 'image/heic' || t === 'image/heif') return 'heic';
    if (t === 'application/pdf') return 'pdf';
    const m = (fname || '').match(/\.([a-z0-9]+)$/i);
    return m ? m[1].toLowerCase() : 'jpg';
  };
  const slug = s => String(s || '')
    .replace(/[àáâä]/gi,'a').replace(/[èéêë]/gi,'e').replace(/[ìíîï]/gi,'i')
    .replace(/[òóôö]/gi,'o').replace(/[ùúûü]/gi,'u').replace(/[ç]/gi,'c')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'scontrino';

  showToast(`Preparo ${conFoto.length} scontrini...`);
  try {
    const zip = new JSZip();
    let ok = 0;
    for (const s of conFoto) {
      const r = await fetch(`/api/spese/${s.id}/foto`);
      if (!r.ok) continue;
      const blob = await r.blob();
      const ext = extFromType(blob.type, s.foto_filename);
      zip.file(`${s.data}_${slug(s.fornitore)}_${s.id}.${ext}`, blob);
      ok++;
    }
    if (ok === 0) { showToast('Impossibile recuperare gli scontrini', 'err'); return; }

    const content = await zip.generateAsync({ type: 'blob' });
    const filename = `Scontrini_${anno}${mese >= 0 ? '_' + MESI[mese] : ''}.zip`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    showToast(`${ok} scontrini scaricati`);
  } catch (err) {
    showToast('Errore creazione ZIP: ' + err.message, 'err');
  }
}

function handleDelegatedClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === 'goto-tab') { state.tab = btn.dataset.tab; render(); return; }
  if (action === 'del-commessa') deleteCommessa(parseInt(id));
  if (action === 'del-spesa') deleteSpesa(parseInt(id));
  if (action === 'del-trasferta') deleteTrasferta(parseInt(id));
  if (action === 'edit-spesa') startEditSpesa(parseInt(id));
  if (action === 'edit-trasferta') startEditTrasferta(parseInt(id));
  if (action === 'attach-foto') attachFotoToSpesa(parseInt(id));
}

// Allega uno scontrino a una spesa già esistente (recupero foto vecchie dal telefono)
function attachFotoToSpesa(id) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,application/pdf';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    showToast('Carico lo scontrino...');
    try {
      const fd = new FormData();
      fd.append('photo', file);
      const r = await fetch(`/api/spese/${id}/foto`, { method:'POST', body:fd });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || 'Errore caricamento');
      const sp = state.spese.find(s => s.id === id);
      if (sp) sp.foto_filename = data.foto_filename;
      showToast('Scontrino allegato!');
      render();
    } catch (err) { showToast(err.message, 'err'); }
  };
  input.click();
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
  // Bind della zona foto solo se presente (in modifica è nascosta)
  const zone = document.getElementById('uploadZone');
  if (zone) {
    zone.addEventListener('click', () => {
      if (!state.spesaScanning) document.getElementById('photoInput')?.click();
    });
    document.getElementById('photoInput')?.addEventListener('change', handleImageSelect);
  }

  // I campi del form spesa esistono solo quando il tab spesa è attivo
  if (!document.getElementById('addSpesaBtn')) return;

  const fields = { sCommessa:'commessa_id', sData:'data', sImporto:'importo',
                   sFornitore:'fornitore', sCategoria:'categoria', sPagamento:'pagamento', sNote:'note' };
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
  document.getElementById('cancelEditSpesaBtn')?.addEventListener('click', cancelEditSpesa);
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
  const pagamento = document.getElementById('sPagamento')?.value ?? state.spesaForm.pagamento;
  const note      = document.getElementById('sNote')?.value      ?? state.spesaForm.note;

  if (!importo || !fornitore) { showToast('Importo e fornitore obbligatori', 'err'); return; }
  if (!commessa_id) { showToast('Crea prima una commessa', 'err'); return; }

  try {
    if (state.editSpesaId) {
      const upd = await apiCall('PUT', `/api/spese/${state.editSpesaId}`, {
        commessa_id, data, importo, fornitore, categoria, pagamento, note,
      });
      const idx = state.spese.findIndex(s => s.id === state.editSpesaId);
      if (idx !== -1) state.spese[idx] = { ...state.spese[idx], ...upd };
      state.editSpesaId = null;
      state.spesaForm = { data:today(), importo:'', fornitore:'', categoria:'Altro', note:'', pagamento:'', commessa_id };
      showToast('Spesa aggiornata!');
      state.tab = 'riepilogo';
      render();
      return;
    }

    const nuova = await apiCall('POST', '/api/spese', {
      commessa_id, data, importo, fornitore, categoria, pagamento, note,
      foto_filename: state.spesaFoto,
    });
    state.spese.unshift(nuova);
    state.spesaForm = { data:today(), importo:'', fornitore:'', categoria:'Altro', note:'', pagamento:'', commessa_id };
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

function startEditSpesa(id) {
  const s = state.spese.find(x => x.id === id);
  if (!s) return;
  state.editSpesaId = id;
  state.spesaForm = {
    data: s.data, importo: String(s.importo), fornitore: s.fornitore, categoria: s.categoria,
    note: s.note || '', pagamento: s.pagamento || '', commessa_id: s.commessa_id,
  };
  state.spesaFoto = null; state.spesaPreview = null; state.spesaScanning = false; state.spesaDebug = null;
  state.tab = 'spesa';
  render();
}

function cancelEditSpesa() {
  state.editSpesaId = null;
  state.spesaForm = { data:today(), importo:'', fornitore:'', categoria:'Altro', note:'', pagamento:'', commessa_id: state.commesse[0]?.id || '' };
  state.tab = 'riepilogo';
  render();
}

// ── Trasferta listeners ────────────────────────────────────────────────────────

function attachTrasferaListeners() {
  if (!document.getElementById('tKm')) return;

  const fields = { tCommessa:'commessa_id', tData:'data', tPartenza:'partenza',
                   tDestinazione:'destinazione', tPedaggio:'pedaggio', tPagamento:'pagamento', tNote:'note' };
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
  document.getElementById('cancelEditTrasferaBtn')?.addEventListener('click', cancelEditTrasferta);
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
  const pedaggio     = document.getElementById('tPedaggio')?.value     ?? state.trasForm.pedaggio;
  const pagamento    = document.getElementById('tPagamento')?.value    ?? state.trasForm.pagamento;
  const note         = document.getElementById('tNote')?.value         ?? state.trasForm.note;
  const tariffa      = state.trasForm.tariffa;

  if (!km || !partenza || !destinazione) { showToast('Inserisci km, partenza e destinazione', 'err'); return; }
  if (!commessa_id) { showToast('Crea prima una commessa', 'err'); return; }

  try {
    if (state.editTrasfertaId) {
      const upd = await apiCall('PUT', `/api/trasferte/${state.editTrasfertaId}`, { commessa_id, data, partenza, destinazione, km, tariffa, pedaggio, pagamento, note });
      const idx = state.trasferte.findIndex(t => t.id === state.editTrasfertaId);
      if (idx !== -1) state.trasferte[idx] = { ...state.trasferte[idx], ...upd };
      state.editTrasfertaId = null;
      state.trasForm = { ...state.trasForm, km:'', partenza:'', destinazione:'', pedaggio:'', pagamento:'', note:'', commessa_id };
      showToast('Trasferta aggiornata!');
      state.tab = 'riepilogo';
      render();
      return;
    }

    const nuova = await apiCall('POST', '/api/trasferte', { commessa_id, data, partenza, destinazione, km, tariffa, pedaggio, pagamento, note });
    state.trasferte.unshift(nuova);
    state.trasForm = { ...state.trasForm, km:'', partenza:'', destinazione:'', pedaggio:'', note:'', commessa_id };
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

function startEditTrasferta(id) {
  const t = state.trasferte.find(x => x.id === id);
  if (!t) return;
  state.editTrasfertaId = id;
  state.trasForm = {
    data: t.data, tariffa: parseFloat(t.tariffa), partenza: t.partenza, destinazione: t.destinazione,
    km: String(t.km), pedaggio: pf(t.pedaggio) ? String(t.pedaggio) : '', pagamento: t.pagamento || '',
    note: t.note || '', commessa_id: t.commessa_id,
  };
  state.tab = 'trasferta';
  render();
}

function cancelEditTrasferta() {
  state.editTrasfertaId = null;
  state.trasForm = { ...state.trasForm, km:'', partenza:'', destinazione:'', pedaggio:'', pagamento:'', note:'', commessa_id: state.commesse[0]?.id || '' };
  state.tab = 'riepilogo';
  render();
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
  const eur = n => pf(n).toFixed(2).replace('.', ',');
  const body = [];
  spFilt.forEach(s => {
    const c = commesse.find(x => x.id === s.commessa_id);
    body.push(['Spesa', s.data, s.fornitore, c?.nome||'—', s.categoria, s.pagamento||'', eur(s.importo), s.note||'']);
  });
  trFilt.forEach(t => {
    const c = commesse.find(x => x.id === t.commessa_id);
    body.push(['Trasferta', t.data, `${t.partenza} → ${t.destinazione}`, c?.nome||'—', `${pf(t.km)} km`, '—', eur(t.rimborso), t.note||'']);
    if (pf(t.pedaggio) > 0) {
      body.push(['Pedaggio', t.data, `Pedaggio autostradale — ${t.partenza} → ${t.destinazione}`, c?.nome||'—', 'Casello autostradale', t.pagamento||'', eur(t.pedaggio), '']);
    }
  });
  body.sort((a, b) => new Date(a[1]) - new Date(b[1]));

  const rows = [
    ['Tipo','Data','Descrizione','Commessa','Dettaglio','Pagamento','Importo (€)','Note'],
    ...body,
  ].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(';')).join('\n');

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

  const emFields = { emNome:'emittente_nome', emPiva:'emittente_piva', emIndirizzo:'emittente_indirizzo', emOperatore:'operatore' };
  Object.entries(emFields).forEach(([id, key]) => {
    document.getElementById(id)?.addEventListener('input', e => { state.settingsForm[key] = e.target.value; });
  });
  document.getElementById('saveAnagraficaBtn')?.addEventListener('click', saveAnagrafica);
}

async function saveAnagrafica() {
  const emittente_nome      = document.getElementById('emNome')?.value      ?? state.settingsForm.emittente_nome;
  const emittente_piva      = document.getElementById('emPiva')?.value      ?? state.settingsForm.emittente_piva;
  const emittente_indirizzo = document.getElementById('emIndirizzo')?.value ?? state.settingsForm.emittente_indirizzo;
  const operatore           = document.getElementById('emOperatore')?.value ?? state.settingsForm.operatore;
  try {
    await apiCall('PUT', '/api/settings', { emittente_nome, emittente_piva, emittente_indirizzo, operatore });
    const s = await fetch('/api/settings').then(r => r.json());
    state.settings = s;
    state.settingsForm.emittente_nome = s.emittente_nome || '';
    state.settingsForm.emittente_piva = s.emittente_piva || '';
    state.settingsForm.emittente_indirizzo = s.emittente_indirizzo || '';
    state.settingsForm.operatore = s.operatore || '';
    showToast('Intestazione salvata!');
    render();
  } catch(err) { showToast(err.message, 'err'); }
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
    state.settingsForm.emittente_nome = settings.emittente_nome || '';
    state.settingsForm.emittente_piva = settings.emittente_piva || '';
    state.settingsForm.emittente_indirizzo = settings.emittente_indirizzo || '';
    state.settingsForm.operatore = settings.operatore || '';

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

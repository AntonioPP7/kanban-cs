// ============================================================================
// Kanban v2 — Tabs: Ciclo CS, Cartera 2500, Retención/Expansión, Manualidad, Retention, Log
// (Rollouts y Health Check se retiraron el 30-jul-2026; sus syncs y tablas siguen vivos)
// Usa el cliente `sb` (window.supabase) ya inicializado en index_v2.html
// Usa insertAdjacentHTML sobre strings escapados via v2Esc() para renderizar.
// ============================================================================

let v2Cartera = [];
let v2CarteraSnapshotDate = null;
let v2Expansion = [];
let v2ExpansionSnapshotDate = null;
let v2ExpNotas = {};          // workspace_id -> fila de expansion_notas (diagnostico)
let v2ExpAcciones = {};       // workspace_id -> [filas de expansion_acciones] (hasta 3)
let v2ExpOpen = {};           // workspace_id -> panel de plan abierto
const V2E_MAX_ACC = 3;        // cupo de acciones/bloqueos por cuenta (migration_19)
let v2Manualidad = [];
let v2ManualidadSnapshotDate = null;
let v2Loaded = { rollouts: false, hc: false, cartera: false, expansion: false, manualidad: false, retention: false, log: false };
let v2Log = [];               // entradas normalizadas del log (ver v2LoadLog)

// URL del servicio del panel Daily Retention (Cloud Run). Vacia = pestana apagada.
// Ver projects/picker-cs/daily-retention/servicio/README.md
const RETENTION_BASE = '';

// v2.2: Sort state, persisted en localStorage
const V2_HUB_BASE = 'https://picker-hub.vercel.app/workspaces/';
function v2HubLink(uuid, label, extraStyle) {
  if (!uuid) return v2Esc(label);  // sin uuid -> texto plano
  const style = extraStyle ? (' style="' + extraStyle + '"') : '';
  return '<a class="v2-hub-link" href="' + V2_HUB_BASE + v2Esc(uuid) + '" target="_blank" rel="noopener"' + style + '>' + v2Esc(label) + '</a>';
}

function v2Esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// DOM-safe render helper: clears element and inserts escaped HTML fragment.
function v2SetHTML(el, html) {
  while (el.firstChild) el.removeChild(el.firstChild);
  el.insertAdjacentHTML('beforeend', html);
}

function v2ShowTab(tab) {
  document.querySelectorAll('.v2-view').forEach(v => v.classList.remove('v2-active'));
  document.querySelectorAll('.v2-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('view-' + tab).classList.add('v2-active');
  document.querySelector('.v2-tab[data-v2-tab="' + tab + '"]').classList.add('active');
  if (tab === 'cartera' && !v2Loaded.cartera) v2LoadCartera();
  if (tab === 'expansion' && !v2Loaded.expansion) v2LoadExpansion();
  if (tab === 'manualidad' && !v2Loaded.manualidad) v2LoadManualidad();
  if (tab === 'retention' && !v2Loaded.retention) v2LoadRetention();
  if (tab === 'log' && !v2Loaded.log) v2LoadLog();
}

// ============================================================
// DAILY RETENTION — selector de cuenta + descargas
// ============================================================

let v2RetCuentas = [];

function v2RetClave() {
  // La clave la escribio el usuario en el gate; no vive en este repo (publico en Vercel).
  try { return sessionStorage.getItem('kanban_clave') || ''; } catch (e) { return ''; }
}

function v2RetUrl(path, ws) {
  const k = v2RetClave();
  const q = (ws ? 'ws=' + encodeURIComponent(ws) : '') + (k ? (ws ? '&' : '') + 'k=' + encodeURIComponent(k) : '');
  return RETENTION_BASE.replace(/\/$/, '') + path + (q ? '?' + q : '');
}

async function v2LoadRetention() {
  const noconf = document.getElementById('v2RetNoConfig');
  const body = document.getElementById('v2RetBody');
  if (!RETENTION_BASE) { noconf.style.display = ''; body.style.display = 'none'; return; }
  noconf.style.display = 'none';
  body.style.display = '';
  try {
    const r = await fetch(v2RetUrl('/cuentas', null));
    if (r.status === 401) {
      document.getElementById('v2RetSub').textContent =
        'El servicio pidió la clave. Recargá la página y volvé a ingresarla en el candado.';
      return;
    }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    v2RetCuentas = j.cuentas || [];
    v2Loaded.retention = true;
    const ok = v2RetCuentas.filter(c => c.estado === 'ok').length;
    const par = v2RetCuentas.filter(c => c.estado === 'parcial').length;
    const no = v2RetCuentas.filter(c => c.estado === 'no_publicable').length;
    document.getElementById('v2BadgeRetention').textContent = ok;
    document.getElementById('v2RetSub').textContent =
      'Datos en vivo del warehouse · catálogo del ' + (j.generado || '');
    v2SetHTML(document.getElementById('v2RetKpis'),
      v2RetKpi(ok, 'cobertura confiable', '#1c6b3a') +
      v2RetKpi(par, 'cobertura parcial', '#a85a12') +
      v2RetKpi(no, 'no publicables', '#a32020') +
      v2RetKpi(v2RetCuentas.length, 'cuentas activas', '#314374'));
    v2RetFiltrar();
  } catch (e) {
    document.getElementById('v2RetSub').textContent = 'No se pudo consultar el servicio: ' + e.message;
  }
}

function v2RetKpi(n, label, color) {
  return '<div class="v2-kpi"><div class="v2-kpi-val" style="color:' + color + '">' + n +
         '</div><div class="v2-kpi-label">' + v2Esc(label) + '</div></div>';
}

function v2RetFiltrar() {
  const q = (document.getElementById('v2RetBuscar').value || '').toLowerCase().trim();
  const soloOk = document.getElementById('v2RetSoloOk').checked;
  const pill = { ok: ['completa', '#e7f6ec', '#1c6b3a'], parcial: ['parcial', '#fff3e0', '#a85a12'],
                 no_publicable: ['no publicable', '#fdecec', '#a32020'], sin_dato: ['sin dato', '#eef1f6', '#7a86a8'] };
  const rows = v2RetCuentas
    .filter(c => (!q || c.nombre.toLowerCase().includes(q) || c.ws.toLowerCase().includes(q)))
    .filter(c => (!soloOk || c.estado === 'ok'))
    .map(c => {
      const p = pill[c.estado] || pill.sin_dato;
      const bloq = c.estado === 'no_publicable';
      const acciones = bloq
        ? '<a href="' + v2RetUrl('/panel', c.ws) + '&force=1" target="_blank" rel="noopener" ' +
          'style="color:#a32020;font-size:11.5px">ver igual (diagnóstico)</a>'
        : '<a href="' + v2RetUrl('/panel', c.ws) + '" target="_blank" rel="noopener" ' +
          'style="font-weight:700">Abrir panel</a>' +
          ' · <a href="' + v2RetUrl('/panel.xlsx', c.ws) + '">Excel</a>' +
          ' · <a href="' + v2RetUrl('/panel.csv', c.ws) + '">CSV</a>';
      return '<tr><td><b>' + v2Esc(c.nombre) + '</b><div style="color:#a3acc4;font-size:10.5px">' +
             v2Esc(c.ws) + '</div></td>' +
             '<td class="num">' + (c.completed || 0).toLocaleString('es') + '</td>' +
             '<td class="num">' + (c.cobertura != null ? c.cobertura.toFixed(0) + '%' : '—') + '</td>' +
             '<td><span style="font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:10px;' +
             'background:' + p[1] + ';color:' + p[2] + '">' + p[0] + '</span></td>' +
             '<td>' + acciones + '</td></tr>';
    }).join('');
  v2SetHTML(document.getElementById('v2RetBody2'),
            rows || '<tr><td colspan="5" style="padding:18px;color:#7a86a8">Sin cuentas para ese filtro.</td></tr>');
}

// ============================================================
// ROLLOUTS
// ============================================================

async function v2SaveInline(el, table) {
  const id = el.dataset.id;
  const field = el.dataset.field;
  const value = el.innerText.trim() || null;
  el.classList.add('saving');
  try {
    const { error } = await sb.from(table).update({ [field]: value }).eq('id', id);
    if (error) throw error;
    // unico consumidor tras quitar Rollouts y Health Check: la pestana Manualidad
    const list = table === 'manualidad_weekly' ? v2Manualidad : null;
    const row = list && list.find(r => String(r.id) === String(id));
    if (row) row[field] = value;
    el.classList.remove('saving');
    el.classList.add('saved');
    setTimeout(() => el.classList.remove('saved'), 1200);
  } catch (err) {
    el.classList.remove('saving');
    alert('Error guardando: ' + err.message);
    console.error(err);
  }
}

// ---------- Modal rollout ----------

function v2Num(v) { return (v == null || v === '') ? '—' : Number(v).toLocaleString('en-US'); }

function v2ProyCell(p28, p7) {
  const big = v2Num(p28);
  let sub = '';
  const n = (p7 == null || p28 == null) ? null : (Number(p7) - Number(p28));
  if (n == null) sub = '';
  else if (n > 0) sub = '<small style="display:block;font-size:10px;font-weight:700;color:var(--verde-500)">&#9650; +' + Number(n).toLocaleString('en-US') + ' 7d</small>';
  else if (n < 0) sub = '<small style="display:block;font-size:10px;font-weight:700;color:var(--rojo)">&#9660; &minus;' + Math.abs(n).toLocaleString('en-US') + ' 7d</small>';
  else sub = '<small style="display:block;font-size:10px;color:var(--neutral-800)">= 7d</small>';
  return '<span style="font-weight:600">' + big + '</span>' + sub;
}

function v2DeltaCell(d) {
  if (d == null) return { txt: '—', cls: '' };
  const n = Number(d);
  if (n > 0) return { txt: '+' + n.toLocaleString('en-US'), cls: 'style="color:var(--verde-500);font-weight:700"' };
  if (n < 0) return { txt: '&minus;' + Math.abs(n).toLocaleString('en-US'), cls: 'style="color:var(--rojo);font-weight:700"' };
  return { txt: '0', cls: 'style="color:var(--neutral-800)"' };
}

function v2TendPill(d) {
  if (d == null || Number(d) === 0) return '<span class="v2-pill v2-pill-gris">&mdash; Igual</span>';
  return Number(d) > 0
    ? '<span class="v2-pill v2-pill-verde">&#9650; Sube</span>'
    : '<span class="v2-pill v2-pill-rojo">&#9660; Baja</span>';
}

// ============================================================
// CARTERA 2500
// ============================================================
// v2 Cartera 2500 editable — une 5 tablas (cartera_2500 rides + cartera_pulso revenue/contacto
// + cartera_registro + cartera_bloqueos + cartera_whatsapp). Numeros read-only; cualitativo editable.
let v2CartAccts = [];
let v2cShowHist = false;

function v2CartToggleHist(on) { v2cFlushEdit(); v2cShowHist = on; v2RenderCartera(); }

// "hoy" / "hace Nd" / "DD-mmm" desde un timestamp ISO
function v2cAge(ts) {
  if (!ts) return '';
  const d = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
  if (d <= 0) return 'hoy';
  if (d === 1) return 'ayer';
  if (d < 30) return 'hace ' + d + 'd';
  const dt = new Date(ts), M = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return dt.getDate() + '-' + M[dt.getMonth()];
}
// barra estado-aware (draft/confirmado/descartado/resuelto). isBloqueo agrega "Resuelto".
function v2cBar(table, estado, isBloqueo, ts) {
  const lbl = { draft: 'DRAFT', confirmado: '✓ APROBADO', descartado: 'DESCARTADO', resuelto: '✓ RESUELTO' }[estado] || estado.toUpperCase();
  let btns = '';
  if (estado === 'draft') btns += '<button class="qbtn ok" onclick="v2CartEstado(this,\'' + table + '\',\'confirmado\')">Aprobar</button>';
  if (estado === 'draft' || estado === 'confirmado') {
    if (isBloqueo) btns += '<button class="qbtn" onclick="v2CartEstado(this,\'' + table + '\',\'resuelto\')">Resuelto</button>';
    btns += '<button class="qbtn no" onclick="v2CartEstado(this,\'' + table + '\',\'descartado\')">Descartar</button>';
  }
  if (estado === 'descartado' || estado === 'resuelto') btns = '<button class="qbtn" onclick="v2CartEstado(this,\'' + table + '\',\'draft\')">Restaurar</button>';
  const age = ts ? '<span class="qage">' + v2cAge(ts) + '</span>' : '';
  return '<div class="qi-bar"><span class="qbadge ' + estado + '">' + lbl + '</span>' + age + btns + '</div>';
}
function v2cVisible(x) { return v2cShowHist || (x.estado !== 'descartado' && x.estado !== 'resuelto'); }

// ---- helpers de cache/foco (evitan que un re-render pise ediciones o el scroll) ----
// busca la fila en el cache local por id; sin esto el render repinta el valor viejo
function v2cFindRow(table, id) {
  const key = table === 'cartera_bloqueos' ? 'blo' : 'reg';
  for (const a of v2CartAccts) {
    const row = a[key].find(x => String(x.id) === String(id));
    if (row) return row;
  }
  return null;
}
// fuerza el blur del campo en edicion para que su onblur guarde ANTES de tocar el DOM.
// Chrome no dispara blur si el nodo enfocado se elimina -> la edicion se perderia.
function v2cFlushEdit() {
  const el = document.activeElement;
  if (el && el.isContentEditable) el.blur();
}

async function v2LoadCartera() {
  const body = document.getElementById('v2CarteraBody');
  const table = document.getElementById('v2CarteraTable');
  if (table) table.classList.add('v2c-ger');
  try {
    const pd = await sb.from('cartera_pulso').select('snapshot_date').order('snapshot_date', { ascending: false }).limit(1);
    if (pd.error) throw pd.error;
    if (!pd.data || !pd.data.length) {
      v2SetHTML(body, '<tr><td colspan="24" class="v2-empty">Sin snapshot de pulso aun. Corre <code>sync_cartera_actividad.py</code>.</td></tr>');
      document.getElementById('v2CarteraSnapshotDate').textContent = 'Snapshot: sin datos';
      v2Loaded.cartera = true; return;
    }
    const snap = pd.data[0].snapshot_date;
    const rd = await sb.from('cartera_2500').select('snapshot_date').order('snapshot_date', { ascending: false }).limit(1);
    const ridesSnap = (rd.data && rd.data.length) ? rd.data[0].snapshot_date : null;

    const [pulso, rides, reg, blo, wa] = await Promise.all([
      sb.from('cartera_pulso').select('*').eq('snapshot_date', snap),
      ridesSnap ? sb.from('cartera_2500').select('*').eq('snapshot_date', ridesSnap) : Promise.resolve({ data: [] }),
      sb.from('cartera_registro').select('*').order('tipo').order('seq'),
      sb.from('cartera_bloqueos').select('*').order('id'),
      sb.from('cartera_whatsapp').select('*'),
    ]);
    for (const r of [pulso, rides, reg, blo, wa]) if (r.error) throw r.error;

    const ridesBy = {}; (rides.data || []).forEach(r => ridesBy[r.workspace_id] = r);
    const waBy = {}; (wa.data || []).forEach(r => waBy[r.workspace_id] = r);
    const regBy = {}; (reg.data || []).forEach(r => { (regBy[r.workspace_id] = regBy[r.workspace_id] || []).push(r); });
    const bloBy = {}; (blo.data || []).forEach(r => { (bloBy[r.workspace_id] = bloBy[r.workspace_id] || []).push(r); });

    v2CartAccts = (pulso.data || []).map(p => ({
      p, rides: ridesBy[p.workspace_id] || {}, wa: waBy[p.workspace_id] || null,
      reg: regBy[p.workspace_id] || [], blo: bloBy[p.workspace_id] || [],
    })).sort((a, b) => (b.p.rev_proy || 0) - (a.p.rev_proy || 0));

    v2Loaded.cartera = true;
    const corte = pulso.data[0] && pulso.data[0].corte_revenue ? ' · revenue corte ' + pulso.data[0].corte_revenue : '';
    document.getElementById('v2CarteraSnapshotDate').textContent = 'Snapshot: ' + snap + corte;
    v2RenderCartera();
  } catch (err) {
    v2SetHTML(body, '<tr><td colspan="24" class="v2-empty">Error: ' + v2Esc(err.message) + '</td></tr>');
    console.error('[v2 cartera]', err);
  }
}

function v2CartMode(m) {
  const table = document.getElementById('v2CarteraTable');
  const ger = m === 'ger';
  table.classList.toggle('v2c-ger', ger);
  document.getElementById('v2cBtnGer').classList.toggle('on', ger);
  document.getElementById('v2cBtnCom').classList.toggle('on', !ger);
  document.getElementById('v2cHint').innerHTML = ger
    ? '<b>Gerencial:</b> volumen, valor por pedido, techo y contacto. Una línea por cuenta.'
    : '<b>Completa:</b> lo mismo + temas, actividad, bloqueos y scrapping. El AM edita, aprueba y descarta cada nota en vivo.';
}

function v2cLvl(v, hi, lo) { return v == null ? 'na' : v >= hi ? 'hi' : v <= lo ? 'lo' : 'md'; }
function v2cUSD(v) { return v == null ? '<span class="v2c-na">—</span>' : '$' + Number(v).toLocaleString('en-US'); }
function v2cDelta(v) {
  if (v == null || v === 0) return '<span class="zero">0</span>';
  return '<span class="' + (v > 0 ? 'pos' : 'negv') + '">' + (v > 0 ? '+' : '−') + Math.abs(Math.round(v)).toLocaleString('en-US') + '</span>';
}
function v2cSem(d) { return d == null ? '' : d <= 14 ? 'g' : d <= 45 ? 'a' : 'r'; }

// dias_sin_cliente lo calcula el sync mirando SOLO Fathom, y el Fathom conectado es el de
// Antonio. Una cuenta atendida por WhatsApp o por un AM cuyo Fathom no esta conectado salia
// en rojo aunque estuviera atendida (Pollo Pepe: 86 dias con contacto de hace 15). El contacto
// manual vive en cartera_whatsapp y no movia el numero. Aqui gana el MAS RECIENTE de los dos.
// La fecha de referencia se reconstruye como (ultima_reunion + dias_sin_cliente) en vez de
// usar hoy: asi el numero no se corre entre snapshots ni depende de la hora del navegador.
function v2cDias(p, wa) {
  const dr = p.dias_sin_cliente, fr = p.ultima_reunion_cliente;
  const wc = wa && wa.ultimo_contacto;
  if (!wc || (fr && wc <= fr)) return { d: dr, fuente: 'reunion', fecha: fr };
  const MS = 86400000;
  const ref = (fr && dr != null)
    ? new Date(fr + 'T00:00:00Z').getTime() + dr * MS
    : Date.now();
  const d = Math.max(0, Math.round((ref - new Date(wc + 'T00:00:00Z').getTime()) / MS));
  return { d, fuente: 'wa', fecha: wc };
}

// item cualitativo editable (tema/hicimos/cliente)
function v2cQItem(r) {
  const est = r.estado || 'draft';
  return '<div class="qi ' + est + '" data-id="' + r.id + '">' +
    '<span class="qtext" contenteditable="true" onblur="v2CartSaveText(this,\'cartera_registro\',\'texto\')">' + v2Esc(r.texto) + '</span>' +
    v2cBar('cartera_registro', est, false, r.updated_at || r.created_at) + '</div>';
}
function v2cAddBtn(ws, tipo, isBloqueo) {
  const fn = isBloqueo ? 'v2CartAddBloqueo(this,\'' + ws + '\')' : 'v2CartAddItem(this,\'' + ws + '\',\'' + tipo + '\')';
  return '<button class="qbtn" style="margin-top:5px" onclick="' + fn + '">＋ ' + (isBloqueo ? 'agregar bloqueo' : 'agregar') + '</button>';
}
function v2cQList(items, tipo, ws) {
  const xs = items.filter(x => x.tipo === tipo && v2cVisible(x));
  const body = xs.length ? xs.map(v2cQItem).join('') : '<span class="v2c-na">—</span>';
  return body + v2cAddBtn(ws, tipo, false);
}
function v2cScrap(items, ws) {
  const xs = items.filter(x => x.tipo === 'scrapping' && v2cVisible(x));
  const body = !xs.length ? '<span class="v2c-na">—</span>' : xs.map(r => {
    const est = r.estado || 'draft';
    const b = r.badge === 'hecho' ? 'hecho' : 'reco';
    return '<div class="qi ' + est + '" data-id="' + r.id + '">' +
      '<span class="badge ' + b + '">' + (b === 'hecho' ? 'HECHO' : 'RECOMENDADO') + '</span> ' +
      '<span class="qtext" contenteditable="true" onblur="v2CartSaveText(this,\'cartera_registro\',\'texto\')">' + v2Esc(r.texto) + '</span>' +
      (r.why ? '<div style="font-size:9px;color:#8a7fae;margin-top:3px">' + v2Esc(r.why) + '</div>' : '') +
      v2cBar('cartera_registro', est, false, r.updated_at || r.created_at) + '</div>';
  }).join('');
  return body + v2cAddBtn(ws, 'scrapping', false);
}
function v2cBloqs(items, ws) {
  const xs = items.filter(v2cVisible);
  const body = !xs.length ? '<span class="v2c-na">Sin bloqueos</span>' : xs.map(b => {
    const est = b.estado || 'draft';
    const es = b.estado_solucion || 'sin';
    const tipo = b.tipo === 'n' ? 'N' : 'C';
    const ped = b.pedidos_bloqueados != null
      ? '<span class="ped">' + v2Num(b.pedidos_bloqueados) + ' pedidos</span>'
      : (b.pedidos_label ? '<span style="color:#9aa6b8">' + v2Esc(b.pedidos_label) + '</span>' : '');
    return '<div class="bx ' + est + '" data-id="' + b.id + '">' +
      '<div class="bx-h"><span class="tchip ' + (tipo === 'N' ? 'tn' : 'tc') + '">' + tipo + '</span>' +
      '<span class="txt qtext" contenteditable="true" onblur="v2CartSaveText(this,\'cartera_bloqueos\',\'bloqueo\')">' + v2Esc(b.bloqueo) + '</span></div>' +
      '<div class="bx-s"><span class="estchip est-' + es + '">' + es.toUpperCase() + '</span> ' +
      '<span class="qtext" contenteditable="true" onblur="v2CartSaveText(this,\'cartera_bloqueos\',\'solucion\')">' + v2Esc(b.solucion) + '</span></div>' +
      '<div class="bx-f"><b>' + v2Esc(b.responsable || '—') + '</b>' + (b.resp_externo ? ' · cliente' : '') +
      ' · ' + v2Esc(b.deadline || 'sin fecha') + ' ' + ped +
      '<span style="margin-left:auto">' + v2cBar('cartera_bloqueos', est, true, b.updated_at || b.created_at) + '</span></div></div>';
  }).join('');
  return body + v2cAddBtn(ws, null, true);
}
function v2cWa(ws, wa) {
  const fecha = wa && wa.ultimo_contacto ? wa.ultimo_contacto : '';
  const nota = wa && wa.nota ? wa.nota : '';
  return '<div class="wa"><input type="date" value="' + v2Esc(fecha) + '" onchange="v2CartSaveWa(this,\'' + ws + '\',\'fecha\')" ' +
    'style="font-size:10px;border:1px solid #d3dbe6;border-radius:4px;padding:1px 3px">' +
    '<span class="wa-nota" contenteditable="true" onblur="v2CartSaveWa(this,\'' + ws + '\',\'nota\')">' + v2Esc(nota) + '</span></div>';
}
function v2cPulso(p) {
  const reu = p.reuniones_cliente_90d, em = p.email_hilos_90d, tope = p.email_tope;
  const lr = v2cLvl(reu, 8, 4), le = v2cLvl(em, 10, 3);
  const bar = (v, max, cls) => {
    const col = { hi: '#1b7a2e', md: '#a9760a', lo: '#c0392b', na: '#c2cbd8' }[cls];
    const w = v == null ? 0 : Math.min(v / max * 100, 100);
    return '<span style="flex:1;height:4px;background:#e2e9f1;border-radius:2px;overflow:hidden;min-width:18px"><i style="display:block;height:100%;width:' + w.toFixed(0) + '%;background:' + col + '"></i></span>';
  };
  return '<div class="pl"><span class="k">Reunión</span><span class="v ' + lr + '">' + (reu == null ? '—' : reu) + '</span>' + bar(reu, 15, lr) + '</div>' +
    '<div class="pl"><span class="k">Email</span><span class="v ' + le + '">' + (em == null ? '—' : em + (tope ? '+' : '')) + '</span>' + bar(em, 33, le) + '</div>';
}

function v2RenderCartera() {
  const body = document.getElementById('v2CarteraBody');
  const foot = document.getElementById('v2CarteraFoot');
  // red de seguridad: vaciar el tbody resetea el scroll del contenedor. Guardamos
  // la posicion y la reponemos al final (aplica a toggle historico y alta manual).
  const tw = document.querySelector('#view-cartera .v2c-tw');
  const _sx = tw ? tw.scrollLeft : 0, _sy = tw ? tw.scrollTop : 0;
  const _restore = () => { if (tw) { tw.scrollLeft = _sx; tw.scrollTop = _sy; } };
  if (!v2CartAccts.length) { v2SetHTML(body, '<tr><td colspan="24" class="v2-empty">Sin cuentas.</td></tr>'); return; }
  const T = { rj: 0, rp: 0, vj: 0, vp: 0, techo: 0, pot: 0, gan: 0 };
  const rows = v2CartAccts.map((a, i) => {
    const p = a.p, ri = a.rides;
    const rj = ri.mes_ant, rp = ri.proy_lenta;
    const vj = p.rev_ant, vp = p.rev_proy;
    const vpj = p.vpp_ant, vpp = p.vpp_proy;
    const dvp = (vpj && vpp) ? (vpp / vpj - 1) * 100 : null;
    const techo = p.techo_envios, dist = (techo != null && rj != null) ? techo - rj : null;
    const pot = p.potencial, gan = p.por_ganar, cap = p.captura_pct;
    T.rj += rj || 0; T.rp += rp || 0; T.vj += vj || 0; T.vp += vp || 0; T.techo += techo || 0;
    if (pot != null) { T.pot += pot; T.gan += gan || 0; }
    const dc = v2cDias(p, a.wa), dias = dc.d;
    return '<tr>' +
      '<td class="s0">' + (i + 1) + '</td>' +
      '<td class="s1 l"><span class="v2c-cta">' + v2Esc(p.cliente) + '</span><span class="v2c-am">' + v2Esc(p.am_registro || '') + ' · ' + v2Esc(p.workspace_id) + (p.am_mismatch ? ' · <span style="color:#c0392b">≠ asiste ' + v2Esc(p.am_real || '') + '</span>' : '') + '</span></td>' +
      '<td>' + v2Num(rj) + '</td><td class="b">' + v2Num(rp) + ' <span style="font-size:9.5px">' + v2cDelta((rp || 0) - (rj || 0)) + '</span></td>' +
      '<td>' + v2cUSD(vj) + '</td><td class="b">' + v2cUSD(vp) + '</td><td>' + (vp != null && vj != null ? v2cDelta(vp - vj) : '<span class="v2c-na">—</span>') + '</td>' +
      '<td class="vp">' + (vpj ? '$' + vpj.toFixed(2) : '<span class="v2c-na">—</span>') + '</td>' +
      '<td class="vp b">' + (vpp ? '$' + vpp.toFixed(2) : '<span class="v2c-na">—</span>') + '</td>' +
      '<td class="vp ' + (dvp == null ? '' : dvp < 0 ? 'negv' : 'pos') + '">' + (dvp == null ? '<span class="v2c-na">—</span>' : (dvp > 0 ? '+' : '−') + Math.abs(dvp).toFixed(1) + '%') + '</td>' +
      '<td class="tch">' + (techo == null ? '<span class="v2c-na">s/t</span>' : v2Num(techo)) + '</td><td class="tch">' + (dist == null ? '<span class="v2c-na">—</span>' : v2Num(dist)) + '</td>' +
      '<td class="tch">' + (pot != null ? '$' + v2Num(Math.round(pot)) : '<span class="v2c-na">n/c</span>') + '</td>' +
      '<td class="gan"><span class="n">' + (gan != null ? '$' + v2Num(Math.round(gan)) : '<span class="v2c-na">n/c</span>') + '</span>' + (cap != null ? '<div style="font-size:9px;color:#5f7c8c">' + cap.toFixed(1) + '%</div>' : '') + '</td>' +
      '<td class="l" style="color:#8a96aa">' + v2Esc(dc.fecha || '—') +
        (dc.fuente === 'wa' ? ' <span title="Contacto manual (WhatsApp/operativo), no reunión grabada en Fathom. Última reunión: ' + v2Esc(p.ultima_reunion_cliente || 'sin registro') + '" style="color:#00b8eb;font-weight:700;cursor:help">wa</span>' : '') + '</td>' +
      '<td><span class="dias ' + v2cSem(dias) + '" ' + (dc.fuente === 'wa' ? 'title="Cuenta desde contacto manual, no desde reunión grabada"' : '') + '>' + (dias == null ? '—' : dias) + '</span></td>' +
      '<td class="l" style="font-size:10px">' + (p.proxima_reunion ? '<span style="color:#1b7a2e;font-weight:700">' + v2Esc(p.proxima_reunion) + '</span>' : '<span class="v2c-na">nada agendado</span>') + '</td>' +
      '<td class="pulso">' + v2cPulso(p) + '</td>' +
      '<td class="l v2c-xtra"><div class="qwrap">' + v2cQList(a.reg, 'tema', p.workspace_id) + '</div></td>' +
      '<td class="l v2c-xtra"><div class="qwrap">' + v2cQList(a.reg, 'hicimos', p.workspace_id) + '</div></td>' +
      '<td class="l v2c-xtra"><div class="qwrap">' + v2cQList(a.reg, 'cliente', p.workspace_id) + '</div></td>' +
      '<td class="l v2c-xtra">' + v2cBloqs(a.blo, p.workspace_id) + '</td>' +
      '<td class="l v2c-xtra">' + v2cScrap(a.reg, p.workspace_id) + '</td>' +
      '<td class="l v2c-xtra">' + v2cWa(p.workspace_id, a.wa) + '</td>' +
      '</tr>';
  }).join('');
  v2SetHTML(body, rows);

  // ---- Objetivos (arriba de la tabla) ----
  const setBar = (id, pct, ok) => { const el = document.getElementById(id); if (el) { el.style.width = Math.max(0, Math.min(pct, 100)).toFixed(0) + '%'; el.style.background = ok ? '#1b7a2e' : (pct >= 60 ? '#00b8eb' : '#a9760a'); } };
  const set = (id, html) => { const el = document.getElementById(id); if (el) v2SetHTML(el, html); };
  // Cierre de junio 2026 = ultimo mes del Q2 y base FIJA del objetivo trimestral.
  // Tomado del ultimo snapshot en que el sync todavia reportaba junio como mes anterior
  // (cartera_pulso / cartera_2500 del 26-jul-2026). NO se calcula en runtime a proposito:
  // rev_ant/mes_ant ruedan al cerrar cada mes -- el 2-ago pasaron solos a julio
  // ($36,909 / 10,665) y el objetivo del trimestre se quedo sin ancla, ademas de que el
  // subtitulo seguia rotulando ese julio como "base jun".
  const BASE_Q2 = { rev: 34950, rides: 10171 };
  const fmtD = (v, pre) => (v >= 0 ? '+' : '−') + (pre || '') + v2Num(Math.abs(Math.round(v)));
  const tone = v => v >= 0 ? '#1b7a2e' : '#c0392b';
  const alt = html => ' <span style="color:#8a96aa;font-weight:600">· ' + html + '</span>';

  // (1) Rides: la definicion canonica del tracker es crecimiento MENSUAL agregado
  // (proy cierre - mes anterior completo), asi que el numero grande sigue mes a mes.
  // La lectura trimestral va de apoyo.
  const crecR = T.rp - T.rj, metaR = 2500, pR = crecR / metaR * 100, okR = crecR >= metaR;
  const crecRq = T.rp - BASE_Q2.rides;
  set('v2cObjRidesVal', fmtD(crecR) + ' <small>/ +' + v2Num(metaR) + ' rides</small>');
  setBar('v2cObjRidesBar', pR, okR);
  set('v2cObjRidesSub',
    (okR ? '<span style="color:#1b7a2e">✓ CUMPLE (' + pR.toFixed(0) + '%)</span>'
         : '<span style="color:#a9760a">' + pR.toFixed(0) + '% · faltan ' + v2Num(metaR - crecR) + ' rides</span>')
    + alt('vs cierre Q2 (jun ' + v2Num(BASE_Q2.rides) + '): <b style="color:' + tone(crecRq) + '">' + fmtD(crecRq) + '</b>'));

  // (2) Revenue: el objetivo es "+$180k de nuevo run-rate al 30-sep VS JUNIO" -> base fija.
  // El numero grande va contra BASE_Q2; el ritmo mes a mes queda como segunda lectura.
  const nuevoRev = T.vp - BASE_Q2.rev, metaV = 180000, pV = nuevoRev / metaV * 100, okV = nuevoRev >= metaV;
  const ritmoV = T.vp - T.vj;
  set('v2cObjRevVal', fmtD(nuevoRev, '$') + ' <small>/ +$' + v2Num(metaV) + ' nuevos</small>');
  setBar('v2cObjRevBar', pV, okV);
  set('v2cObjRevSub',
    (okV ? '<span style="color:#1b7a2e">✓ CUMPLE</span>'
         : '<span style="color:#c0392b">' + pV.toFixed(1) + '% · faltan $' + v2Num(Math.round(metaV - nuevoRev)) + '</span>')
    + alt('base jun $' + v2Num(BASE_Q2.rev) + ' · ritmo vs mes ant: <b style="color:' + tone(ritmoV) + '">' + fmtD(ritmoV, '$') + '</b>'));

  const capT = T.pot ? T.vp / T.pot * 100 : 0;
  v2SetHTML(foot, '<tr>' +
    '<td class="s0"></td><td class="s1 l">TOTAL · ' + v2CartAccts.length + ' cuentas</td>' +
    '<td>' + v2Num(T.rj) + '</td><td>' + v2Num(T.rp) + '</td>' +
    '<td>$' + v2Num(Math.round(T.vj)) + '</td><td>$' + v2Num(Math.round(T.vp)) + '</td><td>' + v2cDelta(T.vp - T.vj) + '</td>' +
    '<td></td><td></td><td></td>' +
    '<td>' + v2Num(T.techo) + '</td><td></td><td>$' + v2Num(Math.round(T.pot)) + '</td>' +
    '<td><span style="color:#0d6b8c">$' + v2Num(Math.round(T.gan)) + '</span> <span style="font-size:9px">' + capT.toFixed(1) + '%</span></td>' +
    '<td class="l"></td><td></td><td class="l"></td><td class="pulso"></td>' +
    '<td class="v2c-xtra"></td><td class="v2c-xtra"></td><td class="v2c-xtra"></td><td class="v2c-xtra"></td><td class="v2c-xtra"></td><td class="v2c-xtra"></td>' +
    '</tr>');
  _restore();
}

// ---- edicion inline de la cartera (guarda a Supabase al instante) ----
async function v2CartSaveText(el, table, field) {
  const wrap = el.closest('[data-id]'); if (!wrap) return;
  const id = wrap.dataset.id;
  const value = el.innerText.trim() || null;
  const row = v2cFindRow(table, id);
  if (row && (row[field] || null) === value) return; // sin cambios: no escribas ni muevas updated_at
  const now = new Date().toISOString();
  try {
    const { error } = await sb.from(table).update({ [field]: value, updated_by: 'AM', updated_at: now }).eq('id', id);
    if (error) throw error;
    // reflejar en el cache: si no, el proximo render repinta el texto viejo
    // y parece que la edicion "no se grabo".
    if (row) { row[field] = value; row.updated_at = now; }
    el.classList.add('v2c-saved'); setTimeout(() => el.classList.remove('v2c-saved'), 900);
  } catch (err) { alert('Error guardando: ' + err.message); console.error(err); }
}
// quita una tarjeta del DOM y repone el placeholder si su columna quedo vacia
function v2cRemoveCard(wrap, isBloqueo) {
  const cont = wrap.parentNode;
  wrap.remove();
  if (cont && !cont.querySelector('.qi, .bx')) {
    const ph = isBloqueo ? '<span class="v2c-na">Sin bloqueos</span>' : '<span class="v2c-na">—</span>';
    cont.insertAdjacentHTML('afterbegin', ph);
  }
}
async function v2CartEstado(btn, table, estado) {
  const wrap = btn.closest('[data-id]'); if (!wrap) return;
  const id = wrap.dataset.id;
  const now = new Date().toISOString();
  v2cFlushEdit(); // guarda una edicion en curso antes de tocar el DOM
  try {
    const { error } = await sb.from(table).update({ estado: estado, updated_by: 'AM', updated_at: now }).eq('id', id);
    if (error) throw error;
    const row = v2cFindRow(table, id);
    if (row) { row.estado = estado; row.updated_at = now; }
    // Actualizacion quirurgica: solo esta tarjeta. Un v2RenderCartera() completo vacia
    // el tbody y el navegador resetea scrollLeft/scrollTop del contenedor .v2c-tw,
    // devolviendo al AM al inicio de la tabla (24 columnas) en cada aprobacion.
    const isBloqueo = table === 'cartera_bloqueos';
    if (!v2cVisible({ estado: estado })) { v2cRemoveCard(wrap, isBloqueo); return; }
    wrap.className = (isBloqueo ? 'bx ' : 'qi ') + estado;
    const bar = wrap.querySelector('.qi-bar');
    if (bar) bar.outerHTML = v2cBar(table, estado, isBloqueo, now);
  } catch (err) { alert('Error: ' + err.message); console.error(err); }
}
// crear item cualitativo manual (lo autora el AM -> confirmado, origen manual)
async function v2CartAddItem(btn, ws, tipo) {
  v2cFlushEdit();
  const now = new Date().toISOString();
  const row = { workspace_id: ws, tipo: tipo, texto: '', estado: 'confirmado', origen: 'manual',
    slug: 'manual-' + Date.now() + '-' + Math.floor(Math.random() * 9999), updated_by: 'AM', updated_at: now };
  try {
    const { data, error } = await sb.from('cartera_registro').insert(row).select();
    if (error) throw error;
    const rec = data[0];
    for (const a of v2CartAccts) if (a.p.workspace_id === ws) { a.reg.push(rec); break; }
    v2RenderCartera();
    setTimeout(() => { const el = document.querySelector('.qi[data-id="' + rec.id + '"] .qtext'); if (el) el.focus(); }, 60);
  } catch (err) { alert('Error creando: ' + err.message); console.error(err); }
}
async function v2CartAddBloqueo(btn, ws) {
  v2cFlushEdit();
  const now = new Date().toISOString();
  const row = { workspace_id: ws, slug: 'manual-' + Date.now() + '-' + Math.floor(Math.random() * 9999),
    tipo: 'n', bloqueo: '', solucion: '', estado_solucion: 'definida', responsable: '', resp_externo: false,
    deadline: 'sin fecha', estado: 'confirmado', origen: 'manual', updated_by: 'AM', updated_at: now };
  try {
    const { data, error } = await sb.from('cartera_bloqueos').insert(row).select();
    if (error) throw error;
    const rec = data[0];
    for (const a of v2CartAccts) if (a.p.workspace_id === ws) { a.blo.push(rec); break; }
    v2RenderCartera();
    setTimeout(() => { const el = document.querySelector('.bx[data-id="' + rec.id + '"] .qtext'); if (el) el.focus(); }, 60);
  } catch (err) { alert('Error creando: ' + err.message); console.error(err); }
}
async function v2CartSaveWa(el, ws, which) {
  const payload = { workspace_id: ws, updated_by: 'AM', updated_at: new Date().toISOString() };
  if (which === 'fecha') payload.ultimo_contacto = el.value || null;
  else payload.nota = el.innerText.trim() || null;
  try {
    const { error } = await sb.from('cartera_whatsapp').upsert(payload, { onConflict: 'workspace_id' });
    if (error) throw error;
    el.classList.add('v2c-saved'); setTimeout(() => el.classList.remove('v2c-saved'), 900);
  } catch (err) { alert('Error guardando WhatsApp: ' + err.message); console.error(err); }
}

// ============================================================
// RETENCION / EXPANSION
// Universo: Top 40 por rides menos las 9 cuentas de Cartera 2500 (se excluyen en
// el sync, no aca). Capa cualitativa = expansion_notas, una fila por cuenta.
// ============================================================
async function v2LoadExpansion() {
  const body = document.getElementById('v2ExpansionBody');
  try {
    const { data: latest, error: e1 } = await sb.from('expansion_top40')
      .select('snapshot_date').order('snapshot_date', { ascending: false }).limit(1);
    if (e1) throw e1;
    if (!latest || !latest.length) {
      v2SetHTML(body, '<tr><td colspan="15" class="v2-empty">Sin snapshot aun. El sync <code>expansion_top40</code> corre diario 7:48 AM.</td></tr>');
      document.getElementById('v2ExpansionSnapshotDate').textContent = 'Snapshot: sin datos';
      v2Loaded.expansion = true; return;
    }
    v2ExpansionSnapshotDate = latest[0].snapshot_date;
    const [snap, notas, acciones] = await Promise.all([
      sb.from('expansion_top40').select('*').eq('snapshot_date', v2ExpansionSnapshotDate).order('rank', { ascending: true }),
      sb.from('expansion_notas').select('*'),
      sb.from('expansion_acciones').select('*').order('seq', { ascending: true }),
    ]);
    if (snap.error) throw snap.error;
    v2Expansion = snap.data || [];
    // Notas y acciones son estado vivo (sin snapshot_date): si falla una tabla, la
    // pestana sigue mostrando los numeros. No es motivo para tumbar la vista entera.
    v2ExpNotas = {}; v2ExpAcciones = {};
    if (notas.error) console.warn('[v2 expansion] notas:', notas.error.message);
    else (notas.data || []).forEach(n => { v2ExpNotas[n.workspace_id] = n; });
    if (acciones.error) console.warn('[v2 expansion] acciones:', acciones.error.message);
    else (acciones.data || []).forEach(a => { (v2ExpAcciones[a.workspace_id] = v2ExpAcciones[a.workspace_id] || []).push(a); });
    v2Loaded.expansion = true;
    const corte = v2Expansion[0] && v2Expansion[0].corte_date ? ' · corte ' + v2Expansion[0].corte_date : '';
    document.getElementById('v2ExpansionSnapshotDate').textContent =
      'Snapshot: ' + v2ExpansionSnapshotDate + corte + ' · ' + v2Expansion.length + ' cuentas (excluye Cartera 2500)';
    v2ExpFirma = JSON.stringify([notas.data, acciones.data]);
    v2RenderExpansion();
    v2ExpLive();
  } catch (err) {
    v2SetHTML(body, '<tr><td colspan="15" class="v2-empty">Error: ' + v2Esc(err.message) + '</td></tr>');
    console.error('[v2 expansion]', err);
  }
}

// ---- sincronizacion en vivo del plan (notas + acciones) ----
// El plan es la unica parte de la pestana que editan varios AMs a la vez, y hasta ahora
// exigia F5 para ver el cambio del otro. Dos mecanismos sobre el mismo refresco:
//   1. Realtime de Supabase -> instantaneo, pero exige que las tablas esten en la
//      publicacion supabase_realtime (ver migration realtime_expansion_notas_acciones).
//   2. Poll cada 20s -> piso que funciona aunque la publicacion no este puesta.
// Los numeros (expansion_top40) no se refrescan: son un snapshot diario, no cambian.
const V2E_POLL_MS = 20000;
let v2ExpLiveOn = false, v2ExpFirma = null, v2ExpPend = false;

// Nunca re-renderizar encima de alguien escribiendo: el render reemplaza el DOM y le
// robaria el foco y lo tecleado. Si esta editando, el refresco queda pendiente.
function v2ExpEditando() {
  const el = document.activeElement;
  if (!el || !el.closest || !el.closest('#view-expansion')) return false;
  return el.isContentEditable || el.tagName === 'SELECT';
}

async function v2ExpRefrescar() {
  if (!v2Loaded.expansion) return;
  if (v2ExpEditando()) { v2ExpPend = true; return; }
  const [notas, acciones] = await Promise.all([
    sb.from('expansion_notas').select('*'),
    sb.from('expansion_acciones').select('*').order('seq', { ascending: true }),
  ]);
  if (notas.error || acciones.error) return;          // silencioso: es un refresco de fondo
  const firma = JSON.stringify([notas.data, acciones.data]);
  if (firma === v2ExpFirma) { v2ExpPend = false; return; }
  v2ExpFirma = firma;
  v2ExpNotas = {}; v2ExpAcciones = {};
  (notas.data || []).forEach(n => { v2ExpNotas[n.workspace_id] = n; });
  (acciones.data || []).forEach(a => { (v2ExpAcciones[a.workspace_id] = v2ExpAcciones[a.workspace_id] || []).push(a); });
  v2ExpPend = false;
  v2RenderExpansion();                                 // v2ExpOpen es global: las filas abiertas siguen abiertas
}

function v2ExpLive() {
  if (v2ExpLiveOn) return;
  v2ExpLiveOn = true;
  let t = null;
  const golpe = () => { clearTimeout(t); t = setTimeout(v2ExpRefrescar, 400); };  // agrupa rafagas
  try {
    sb.channel('expansion-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expansion_acciones' }, golpe)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expansion_notas' }, golpe)
      .subscribe();
  } catch (e) {
    console.warn('[v2 expansion] realtime no disponible, queda el poll:', e.message);
  }
  setInterval(() => {
    // Solo si la pestana esta a la vista: no gastar requests con el navegador de fondo.
    const vista = document.getElementById('view-expansion');
    if (document.hidden || !vista || !vista.classList.contains('v2-active')) return;
    if (v2ExpEditando()) { v2ExpPend = true; return; }
    v2ExpRefrescar();
  }, V2E_POLL_MS);

  // Al soltar la edicion, aplicar de inmediato lo que llego mientras escribia.
  document.addEventListener('focusout', () => {
    if (v2ExpPend) setTimeout(() => { if (!v2ExpEditando()) v2ExpRefrescar(); }, 300);
  });
}

const V2_SEM_PILL = {
  verde: '<span class="v2-pill v2-pill-verde">Verde</span>',
  amarillo: '<span class="v2-pill v2-pill-amarillo">Amar.</span>',
  rojo: '<span class="v2-pill v2-pill-rojo">Rojo</span>',
};

// Score 0-10 (health / engagement): color por umbral, mismo criterio que el semaforo.
function v2ScoreCell(v) {
  if (v == null) return '<span style="color:var(--neutral-800)">&mdash;</span>';
  const n = Number(v);
  const color = n >= 8.8 ? 'var(--verde-500)' : (n >= 7.0 ? '#b45309' : 'var(--rojo)');
  return '<span style="font-weight:700;color:' + color + '">' + n.toFixed(2) + '</span>';
}

function v2AlertCell(n) {
  const v = Number(n || 0);
  if (!v) return '<span style="color:var(--neutral-800)">0</span>';
  return '<span class="v2-pill v2-pill-rojo">' + v + '</span>';
}

// Items de una cuenta, ordenados por cupo. Los vacios no cuentan como plan.
function v2ExpItems(ws) {
  return (v2ExpAcciones[ws] || []).slice().sort((a, b) => (a.seq || 0) - (b.seq || 0));
}
function v2ExpItemsCon(ws) {
  return v2ExpItems(ws).filter(a => (a.texto || '').trim());
}
// Hay plan si hay diagnostico o al menos un item con texto.
function v2ExpTienePlan(ws) {
  const n = v2ExpNotas[ws];
  return !!((n && (n.diagnostico || '').trim()) || v2ExpItemsCon(ws).length);
}
// Un plan esta "por revisar" mientras la nota o algun item siga en draft de IA.
function v2ExpEsDraft(ws) {
  const n = v2ExpNotas[ws];
  if (n && (n.diagnostico || '').trim() && n.estado_draft === 'draft') return true;
  return v2ExpItemsCon(ws).some(a => a.estado_draft === 'draft');
}
// Dias desde la ultima edicion del plan -> chip de frescura. Mira la nota Y los items:
// cerrar un bloqueo tambien es actividad, aunque el diagnostico no se haya tocado.
function v2ExpFresh(ws) {
  if (!v2ExpTienePlan(ws)) return { cls: 'fresh-nada', txt: 'sin plan', dias: null };
  const n = v2ExpNotas[ws];
  const stamps = v2ExpItemsCon(ws).map(a => a.updated_at || a.created_at);
  if (n) stamps.push(n.updated_at || n.created_at);
  const ts = stamps.filter(Boolean).sort().pop();
  if (!ts) return { cls: 'fresh-nada', txt: 'sin fecha', dias: null };
  const dias = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
  const cls = dias <= 7 ? 'fresh-ok' : (dias <= 14 ? 'fresh-tibio' : 'fresh-viejo');
  return { cls, txt: dias === 0 ? 'hoy' : 'hace ' + dias + 'd', dias };
}

const V2E_ESTADOS = { andando: 'Andando', bloqueado: 'Bloqueado', resuelto: 'Resuelto', sin_accion: 'Sin acción' };

function v2RenderExpansion() {
  const body = document.getElementById('v2ExpansionBody');
  if (!v2Expansion.length) { v2SetHTML(body, '<tr><td colspan="15" class="v2-empty">Sin cuentas.</td></tr>'); return; }

  const fAM = (document.getElementById('v2FilterExpAM') || {}).value || '';
  const fSem = (document.getElementById('v2FilterExpSem') || {}).value || '';
  const fPlan = (document.getElementById('v2FilterExpPlan') || {}).value || '';
  const rows = v2Expansion.filter(r => {
    if (fAM === '__none__') { if (r.am_owner) return false; }
    else if (fAM && r.am_owner !== fAM) return false;
    if (fSem === '__alertas__') { if (!(r.alertas_criticas > 0)) return false; }
    else if (fSem && r.semaforo !== fSem) return false;
    if (fPlan) {
      const ws = r.workspace_id;
      if (fPlan === '__sin__') { if (v2ExpTienePlan(ws)) return false; }
      else if (fPlan === '__draft__') { if (!v2ExpEsDraft(ws)) return false; }
      // Los estados viven en los items: la cuenta matchea si ALGUN item esta asi.
      else if (!v2ExpItemsCon(ws).some(a => a.estado === fPlan)) return false;
    }
    return true;
  });

  const totMayo = rows.reduce((a, r) => a + (r.mes_ant || 0), 0);
  const totProy = rows.reduce((a, r) => a + (r.proy_lenta || 0), 0);
  const totProy7 = rows.reduce((a, r) => a + (r.proy_rapida || 0), 0);
  const neto = totProy - totMayo;
  const var7 = totProy7 - totProy;
  const nUp = rows.filter(r => (r.delta || 0) > 0).length;
  const nDown = rows.filter(r => (r.delta || 0) < 0).length;
  const totAlertas = rows.reduce((a, r) => a + (r.alertas_criticas || 0), 0);
  const nConAlertas = rows.filter(r => (r.alertas_criticas || 0) > 0).length;
  const scope = fAM === '__none__' ? 'cuentas sin AM' : (fAM ? 'cartera ' + fAM : 'retención / expansión');

  document.getElementById('v2ExpMayo').textContent = totMayo.toLocaleString('en-US');
  document.getElementById('v2ExpMayoSub').textContent = scope + ' · ' + rows.length + ' cuentas';
  document.getElementById('v2ExpProy').textContent = totProy.toLocaleString('en-US');
  document.getElementById('v2ExpProySub').textContent = (var7 >= 0 ? '▲ +' : '▼ −') + Math.abs(var7).toLocaleString('en-US') + ' a ritmo 7d';
  const netoEl = document.getElementById('v2ExpNeto');
  netoEl.textContent = (neto >= 0 ? '+' : '−') + Math.abs(neto).toLocaleString('en-US');
  netoEl.style.color = neto >= 0 ? 'var(--verde-500)' : 'var(--rojo)';
  const pctNeto = totMayo ? (neto / totMayo * 100) : 0;
  document.getElementById('v2ExpNetoSub').textContent = (pctNeto >= 0 ? '+' : '−') + Math.abs(pctNeto).toFixed(1) + '% vs mes ant';
  document.getElementById('v2ExpSplit').textContent = nUp + ' / ' + nDown;
  document.getElementById('v2ExpSplitSub').textContent = 'de ' + rows.length + ' cuentas';
  document.getElementById('v2ExpAlertas').textContent = totAlertas.toLocaleString('en-US');
  document.getElementById('v2ExpAlertasSub').textContent = nConAlertas + ' de ' + rows.length + ' cuentas afectadas';
  const nConf = rows.filter(r => v2ExpTienePlan(r.workspace_id) && !v2ExpEsDraft(r.workspace_id)).length;
  const nDraft = rows.filter(r => v2ExpEsDraft(r.workspace_id)).length;
  const nBloq = rows.reduce((a, r) => a + v2ExpItemsCon(r.workspace_id).filter(x => x.tipo === 'bloqueo' && x.estado !== 'resuelto').length, 0);
  document.getElementById('v2ExpPlan').textContent = nConf + ' / ' + rows.length;
  document.getElementById('v2ExpPlanSub').textContent =
    nDraft + ' draft IA por revisar · ' + nBloq + ' bloqueo' + (nBloq === 1 ? '' : 's') + ' abierto' + (nBloq === 1 ? '' : 's');

  if (!rows.length) { v2SetHTML(body, '<tr><td colspan="15" class="v2-empty">Sin cuentas con ese filtro.</td></tr>'); return; }

  const html = rows.map(r => {
    const ws = r.workspace_id;
    const neg = (r.delta || 0) < 0;
    const d = v2DeltaCell(r.delta);
    const pct = r.delta_pct == null ? '&mdash;' : '<span ' + d.cls + '>' + (r.delta_pct >= 0 ? '+' : '−') + Math.abs(Math.round(r.delta_pct * 100)) + '%</span>';
    const region = r.region ? ' <small>' + v2Esc(r.region) + '</small>' : '';
    const am = r.am_owner
      ? v2Esc(r.am_owner)
      : '<span class="v2-pill v2-pill-gris">Sin AM</span>';
    const nota = v2ExpNotas[ws];
    const fresh = v2ExpFresh(ws);
    const open = !!v2ExpOpen[ws];
    // Ultima reunion: 'marca' no atribuye la reunion a esta cuenta, se marca aparte.
    let reunion;
    if (!r.ultima_reunion) {
      reunion = '<span style="color:var(--neutral-800);font-size:10.5px">no detectada</span>';
    } else {
      const marca = r.match_nivel === 'marca'
        ? '<span class="mk-marca" title="Reunion de la marca (' + (r.marca_cuentas || '?') + ' cuentas). No se puede atribuir a este pais/local.">marca</span>' : '';
      reunion = '<span style="font-size:11px">' + v2Esc(String(r.ultima_reunion).slice(5)) + '</span>' + marca;
    }
    const plan = v2ExpPlanCell(ws, fresh);

    const main = '<tr class="v2e-main' + (open ? ' open' : '') + '" onclick="v2ExpToggle(\'' + ws + '\')"' +
      (neg ? ' style="background:#fdf6f5"' : '') + '>' +
      '<td>' + (r.rank || '—') + '</td>' +
      '<td class="v2-cliente"><span class="v2e-chev">&#9654;</span>' + v2Esc(r.workspace_name) + region + '</td>' +
      '<td>' + am + '</td>' +
      '<td>' + (V2_SEM_PILL[r.semaforo] || '<span class="v2-pill v2-pill-gris">&mdash;</span>') + '</td>' +
      '<td class="num">' + v2ScoreCell(r.healthscore) + '</td>' +
      '<td class="num">' + v2ScoreCell(r.engagement_score) + '</td>' +
      '<td class="num">' + v2AlertCell(r.alertas_criticas) + '</td>' +
      '<td class="num">' + v2Num(r.mes_ant) + '</td>' +
      '<td class="num">' + v2Num(r.mtd) + '</td>' +
      '<td class="num">' + v2ProyCell(r.proy_lenta, r.proy_rapida) + '</td>' +
      '<td class="num" ' + d.cls + '>' + d.txt + '</td>' +
      '<td class="num">' + pct + '</td>' +
      '<td>' + v2TendPill(r.delta) + '</td>' +
      '<td>' + reunion + '</td>' +
      '<td>' + plan + '</td>' +
      '</tr>';
    return main + v2ExpDetailRow(r, nota, open);
  }).join('');
  v2SetHTML(body, html);
}

// Celda "Plan" de la tabla: frescura + cuantos items + cuantos bloqueos abiertos.
function v2ExpPlanCell(ws, fresh) {
  fresh = fresh || v2ExpFresh(ws);
  const items = v2ExpItemsCon(ws);
  const bloq = items.filter(a => a.tipo === 'bloqueo' && a.estado !== 'resuelto').length;
  let out = '<span class="fresh ' + fresh.cls + '">' + fresh.txt + '</span>';
  if (items.length) {
    out += ' <span class="v2e-cnt" title="' + items.length + ' de ' + V2E_MAX_ACC + ' cupos usados">' +
      items.length + '/' + V2E_MAX_ACC + '</span>';
  }
  if (bloq) out += ' <span class="v2e-bq" title="bloqueos abiertos">' + bloq + '&nbsp;bloq</span>';
  if (v2ExpEsDraft(ws)) out += ' <span class="v2e-draft">draft</span>';
  return out;
}

// Panel de plan: 1 diagnostico + hasta 3 acciones/bloqueos. Editable inline, guarda al blur.
function v2ExpDetailRow(r, n, open) {
  const ws = r.workspace_id;
  n = n || {};
  const diag = '<span class="etext' + (n.diagnostico ? '' : ' empty') + '" data-ph="Por qué sube o cae…"' +
    ' contenteditable="true" onblur="v2ExpSave(\'' + ws + '\',\'diagnostico\',this)"' +
    ' onclick="event.stopPropagation()">' + v2Esc(n.diagnostico || '') + '</span>';
  const items = v2ExpItems(ws);
  const filas = items.length
    ? items.map(a => v2ExpItemRow(ws, a, r)).join('')
    : '<div class="v2e-na">Sin acciones ni bloqueos todavía</div>';
  const usados = items.length;
  const add = usados < V2E_MAX_ACC
    ? '<div class="v2e-add">' +
        '<button class="v2e-btn v2e-add-b" onclick="event.stopPropagation();v2ExpAddItem(\'' + ws + '\',\'accion\')">+ Acción</button>' +
        '<button class="v2e-btn v2e-add-b" onclick="event.stopPropagation();v2ExpAddItem(\'' + ws + '\',\'bloqueo\')">+ Bloqueo</button>' +
        '<span class="v2e-cupo">' + usados + ' de ' + V2E_MAX_ACC + ' cupos</span></div>'
    : '<div class="v2e-add"><span class="v2e-cupo">' + V2E_MAX_ACC + ' de ' + V2E_MAX_ACC +
      ' cupos usados — borrá uno para agregar otro</span></div>';

  const dTiene = !!(n.diagnostico || '').trim();
  const dBtns = (dTiene && n.estado_draft === 'draft')
    ? '<button class="v2e-btn v2e-ok" onclick="event.stopPropagation();v2ExpDraft(\'' + ws + '\',\'confirmado\')">Confirmar</button>' +
      '<button class="v2e-btn v2e-no" onclick="event.stopPropagation();v2ExpDraft(\'' + ws + '\',\'descartado\')">Descartar</button>'
    : '';
  const origen = n.origen === 'ia' ? 'diagnóstico: borrador IA' : (n.origen === 'manual' ? 'diagnóstico: escrito por el AM' : '');
  const meta = origen
    ? origen + (dTiene && n.estado_draft ? ' · ' + v2Esc(n.estado_draft) : '') + (n.updated_by ? ' · ' + v2Esc(n.updated_by) : '')
    : 'sin diagnóstico todavía';

  return '<tr class="v2e-detail' + (open ? ' open' : '') + '" data-ws="' + ws + '"><td colspan="15">' +
    '<div class="v2e-grid">' +
      '<div class="v2e-lbl">Diagnóstico</div><div>' + diag +
        '<div class="v2e-meta"><span>' + meta + '</span>' + dBtns + '</div></div>' +
      '<div class="v2e-lbl">Plan</div><div class="v2e-items">' + filas + add + '</div>' +
    '</div></td></tr>';
}

// Un item: tipo + texto + responsable + fecha + estado + borrar.
// Semaforo de maduracion por tarjeta: cuanto lleva ABIERTA desde que se creo.
// >7d amarillo, >14d rojo. Usa created_at y NO updated_at a proposito: si contara el
// ultimo toque, corregirle una palabra a un item estancado hace 20 dias lo pintaria
// verde de nuevo. Un item resuelto ya no madura -> sin semaforo.
function v2ExpMadurez(a) {
  if ((a.estado || '') === 'resuelto' || !a.created_at) return null;
  const dias = Math.floor((Date.now() - new Date(a.created_at).getTime()) / 86400000);
  if (!isFinite(dias) || dias < 0) return null;
  return {
    cls: dias > 14 ? 'fresh-viejo' : (dias > 7 ? 'fresh-tibio' : 'fresh-ok'),
    txt: dias === 0 ? 'hoy' : dias + 'd',
    dias
  };
}

function v2ExpItemRow(ws, a, r) {
  const fld = (campo, ph, val) =>
    '<span class="etext' + (val ? '' : ' empty') + '" data-ph="' + ph + '" contenteditable="true"' +
    ' onblur="v2ExpSaveItem(' + a.id + ',\'' + ws + '\',\'' + campo + '\',this)"' +
    ' onclick="event.stopPropagation()">' + v2Esc(val || '') + '</span>';
  const selTipo = '<select class="v2e-sel v2e-tipo" onclick="event.stopPropagation()" ' +
    'onchange="v2ExpSaveItem(' + a.id + ',\'' + ws + '\',\'tipo\',this)">' +
    ['accion', 'bloqueo'].map(k => '<option value="' + k + '"' + (k === (a.tipo || 'accion') ? ' selected' : '') +
      '>' + (k === 'accion' ? 'Acción' : 'Bloqueo') + '</option>').join('') + '</select>';
  const est = a.estado || 'sin_accion';
  const selEst = '<select class="v2e-sel" onclick="event.stopPropagation()" ' +
    'onchange="v2ExpSaveItem(' + a.id + ',\'' + ws + '\',\'estado\',this)">' +
    Object.keys(V2E_ESTADOS).map(k => '<option value="' + k + '"' + (k === est ? ' selected' : '') +
      '>' + V2E_ESTADOS[k] + '</option>').join('') + '</select>';
  const draft = ((a.texto || '').trim() && a.estado_draft === 'draft')
    ? '<button class="v2e-btn v2e-ok" onclick="event.stopPropagation();v2ExpDraftItem(' + a.id + ',\'' + ws + '\',\'confirmado\')">OK</button>' : '';
  const mad = v2ExpMadurez(a);
  return '<div class="v2e-item ' + (a.tipo === 'bloqueo' ? 'is-bloqueo' : 'is-accion') +
      (est === 'resuelto' ? ' is-resuelto' : '') + '" data-id="' + a.id + '">' +
    '<div class="v2e-item-top">' + selTipo +
      '<span class="v2e-item-txt">' + fld('texto', a.tipo === 'bloqueo' ? 'Qué está frenando…' : 'Qué vamos a hacer…', a.texto) + '</span>' +
    '</div>' +
    '<div class="v2e-item-bot">' +
      (mad ? '<span class="fresh v2e-mad ' + mad.cls + '" title="Abierta hace ' + mad.dias +
             ' día' + (mad.dias === 1 ? '' : 's') + ' (creada el ' +
             String(a.created_at).slice(0, 10) + '). Amarillo pasados 7 días, rojo pasados 14.">' +
             mad.txt + '</span>' : '') +
      '<span>Resp: ' + fld('responsable', (r && r.am_owner) || 'quién', a.responsable) + '</span>' +
      '<span>Para: ' + fld('deadline', 'sin fecha', a.deadline) + '</span>' +
      selEst + draft +
      '<button class="v2e-btn v2e-no v2e-del" title="Borrar este item" ' +
        'onclick="event.stopPropagation();v2ExpDelItem(' + a.id + ',\'' + ws + '\')">×</button>' +
    '</div></div>';
}

function v2ExpToggle(ws) {
  v2ExpOpen[ws] = !v2ExpOpen[ws];
  // Toggle quirurgico: un re-render completo perderia el foco de una celda en edicion.
  const det = document.querySelector('#view-expansion tr.v2e-detail[data-ws="' + ws + '"]');
  if (det) {
    det.classList.toggle('open', v2ExpOpen[ws]);
    if (det.previousElementSibling) det.previousElementSibling.classList.toggle('open', v2ExpOpen[ws]);
  }
}

// ---- edicion inline del plan (upsert a Supabase al instante) ----
// Upsert y no update: la fila puede no existir (cuenta sin draft de IA todavia).
async function v2ExpSave(ws, campo, el) {
  const valor = (el.tagName === 'SELECT' ? el.value : el.textContent.trim());
  const prev = v2ExpNotas[ws] || {};
  if ((prev[campo] || '') === valor) return;         // sin cambio real, no escribimos
  const now = new Date().toISOString();
  const row = Object.assign({}, prev, { workspace_id: ws, updated_by: 'AM', updated_at: now });
  row[campo] = valor;
  // Cualquier edicion cuenta como revision: el job de IA ya no vuelve a pisar la fila.
  row.estado_draft = 'confirmado';
  // Pero la autoria solo cambia si el AM reescribio el contenido de fondo. Tocar la
  // fecha o el responsable no convierte un diagnostico de la IA en texto del AM.
  if (campo === 'diagnostico' || campo === 'accion') row.origen = 'manual';
  delete row.id; delete row.created_at;
  try {
    const { data, error } = await sb.from('expansion_notas')
      .upsert(row, { onConflict: 'workspace_id' }).select();
    if (error) throw error;
    v2ExpNotas[ws] = data && data[0] ? data[0] : row;
    if (valor) el.classList.remove('empty'); else el.classList.add('empty');
    el.classList.add('v2e-saved'); setTimeout(() => el.classList.remove('v2e-saved'), 900);
    v2ExpRefreshRow(ws);
  } catch (err) { alert('Error guardando el plan: ' + err.message); console.error(err); }
}

// ---- items (expansion_acciones): guardar / agregar / borrar / confirmar ----
async function v2ExpSaveItem(id, ws, campo, el) {
  const valor = (el.tagName === 'SELECT' ? el.value : el.textContent.trim());
  const lista = v2ExpAcciones[ws] || [];
  const it = lista.find(a => a.id === id);
  if (!it || (it[campo] || '') === valor) return;
  const now = new Date().toISOString();
  const patch = { updated_by: 'AM', updated_at: now, estado_draft: 'confirmado' };
  patch[campo] = valor;
  // Igual que el diagnostico: tocar fecha/responsable/estado no cambia la autoria
  // del texto, solo marca que el AM lo reviso (y frena a la IA).
  if (campo === 'texto') patch.origen = 'manual';
  try {
    const { error } = await sb.from('expansion_acciones').update(patch).eq('id', id);
    if (error) throw error;
    Object.assign(it, patch);
    if (valor) el.classList.remove('empty'); else el.classList.add('empty');
    el.classList.add('v2e-saved'); setTimeout(() => el.classList.remove('v2e-saved'), 900);
    // el tipo y el estado cambian el color del item: repintar solo esa tarjeta
    if (campo === 'tipo' || campo === 'estado') {
      const box = el.closest('.v2e-item') || document.querySelector('.v2e-item[data-id="' + id + '"]');
      if (box) {
        box.classList.toggle('is-bloqueo', it.tipo === 'bloqueo');
        box.classList.toggle('is-accion', it.tipo !== 'bloqueo');
        box.classList.toggle('is-resuelto', it.estado === 'resuelto');
      }
    }
    v2ExpRefreshRow(ws);
  } catch (err) { alert('Error guardando el item: ' + err.message); console.error(err); }
}

async function v2ExpAddItem(ws, tipo) {
  const lista = v2ExpItems(ws);
  if (lista.length >= V2E_MAX_ACC) return;
  // Primer cupo libre: el AM pudo haber borrado el 2 y conservado el 3.
  const usados = new Set(lista.map(a => a.seq));
  let seq = 1;
  while (usados.has(seq) && seq <= V2E_MAX_ACC) seq++;
  if (seq > V2E_MAX_ACC) return;
  const now = new Date().toISOString();
  const row = {
    workspace_id: ws, seq: seq, tipo: tipo, texto: '',
    responsable: '', deadline: '',
    estado: tipo === 'bloqueo' ? 'bloqueado' : 'sin_accion',
    origen: 'manual', estado_draft: 'confirmado', updated_by: 'AM', updated_at: now,
  };
  try {
    const { data, error } = await sb.from('expansion_acciones').insert(row).select();
    if (error) throw error;
    (v2ExpAcciones[ws] = v2ExpAcciones[ws] || []).push(data[0]);
    v2ExpRedrawPanel(ws);
    setTimeout(() => {
      const el = document.querySelector('.v2e-item[data-id="' + data[0].id + '"] .etext');
      if (el) el.focus();
    }, 60);
  } catch (err) { alert('Error creando el item: ' + err.message); console.error(err); }
}

async function v2ExpDelItem(id, ws) {
  try {
    const { error } = await sb.from('expansion_acciones').delete().eq('id', id);
    if (error) throw error;
    v2ExpAcciones[ws] = (v2ExpAcciones[ws] || []).filter(a => a.id !== id);
    v2ExpRedrawPanel(ws);
  } catch (err) { alert('Error borrando: ' + err.message); console.error(err); }
}

async function v2ExpDraftItem(id, ws, estadoDraft) {
  const it = (v2ExpAcciones[ws] || []).find(a => a.id === id);
  if (!it) return;
  const now = new Date().toISOString();
  try {
    const { error } = await sb.from('expansion_acciones')
      .update({ estado_draft: estadoDraft, updated_by: 'AM', updated_at: now }).eq('id', id);
    if (error) throw error;
    it.estado_draft = estadoDraft; it.updated_at = now; it.updated_by = 'AM';
    v2ExpRedrawPanel(ws);
  } catch (err) { alert('Error: ' + err.message); console.error(err); }
}

// Repinta solo el panel de una cuenta (no la tabla): agregar/borrar cambia la lista.
function v2ExpRedrawPanel(ws) {
  const det = document.querySelector('#view-expansion tr.v2e-detail[data-ws="' + ws + '"]');
  if (!det) return;
  const r = v2Expansion.find(x => x.workspace_id === ws) || { workspace_id: ws };
  const tmp = document.createElement('tbody');
  v2SetHTML(tmp, v2ExpDetailRow(r, v2ExpNotas[ws], true));
  const nuevo = tmp.querySelector('tr');
  if (nuevo) det.replaceWith(nuevo);
  v2ExpRefreshRow(ws);
}

// Confirmar / descartar un draft de IA sin re-renderizar toda la tabla.
async function v2ExpDraft(ws, estadoDraft) {
  const prev = v2ExpNotas[ws];
  if (!prev) return;
  const now = new Date().toISOString();
  try {
    const { error } = await sb.from('expansion_notas')
      .update({ estado_draft: estadoDraft, updated_by: 'AM', updated_at: now }).eq('workspace_id', ws);
    if (error) throw error;
    prev.estado_draft = estadoDraft; prev.updated_at = now; prev.updated_by = 'AM';
    v2ExpRefreshRow(ws);
  } catch (err) { alert('Error: ' + err.message); console.error(err); }
}

// Repinta solo la celda "Plan" y la meta del panel. Un v2RenderExpansion() completo
// resetea el scroll de la tabla (15 columnas) y cierra el panel abierto.
function v2ExpRefreshRow(ws) {
  const det = document.querySelector('#view-expansion tr.v2e-detail[data-ws="' + ws + '"]');
  if (!det) return;
  const n = v2ExpNotas[ws] || {};
  const main = det.previousElementSibling;
  if (main && main.lastElementChild) main.lastElementChild.innerHTML = v2ExpPlanCell(ws);
  // meta + botones del diagnostico (los de cada item los maneja v2ExpRedrawPanel)
  const meta = det.querySelector('.v2e-meta');
  if (meta) {
    const dTiene = !!(n.diagnostico || '').trim();
    const origen = n.origen === 'ia' ? 'diagnóstico: borrador IA'
      : (n.origen === 'manual' ? 'diagnóstico: escrito por el AM' : '');
    const txt = origen
      ? origen + (dTiene && n.estado_draft ? ' · ' + v2Esc(n.estado_draft) : '') +
        (n.updated_by ? ' · ' + v2Esc(n.updated_by) : '')
      : 'sin diagnóstico todavía';
    meta.querySelectorAll('.v2e-btn').forEach(b => b.remove());
    const span = meta.querySelector('span');
    if (span) span.innerHTML = txt;
    if (dTiene && n.estado_draft === 'draft') {
      meta.insertAdjacentHTML('beforeend',
        '<button class="v2e-btn v2e-ok" onclick="event.stopPropagation();v2ExpDraft(\'' + ws + '\',\'confirmado\')">Confirmar</button>' +
        '<button class="v2e-btn v2e-no" onclick="event.stopPropagation();v2ExpDraft(\'' + ws + '\',\'descartado\')">Descartar</button>');
    }
  }
  v2ExpUpdateKpiPlan();
}

// Recalcula solo los KPIs de plan (los de volumen no cambian al editar una nota).
function v2ExpUpdateKpiPlan() {
  const el = document.getElementById('v2ExpPlan');
  if (!el) return;
  const visibles = Array.from(document.querySelectorAll('#view-expansion tr.v2e-main'))
    .map(tr => tr.nextElementSibling && tr.nextElementSibling.dataset.ws).filter(Boolean);
  let conf = 0, draft = 0, bloq = 0;
  visibles.forEach(ws => {
    if (v2ExpEsDraft(ws)) draft++;
    else if (v2ExpTienePlan(ws)) conf++;
    bloq += v2ExpItemsCon(ws).filter(a => a.tipo === 'bloqueo' && a.estado !== 'resuelto').length;
  });
  el.textContent = conf + ' / ' + visibles.length;
  document.getElementById('v2ExpPlanSub').textContent =
    draft + ' draft IA por revisar · ' + bloq + ' bloqueo' + (bloq === 1 ? '' : 's') + ' abierto' + (bloq === 1 ? '' : 's');
}

// ============================================================
// MANUALIDAD (semanas dinamicas via jsonb)
// ============================================================
async function v2LoadManualidad() {
  const body = document.getElementById('v2ManualidadBody');
  try {
    const { data: latest, error: e1 } = await sb.from('manualidad_weekly')
      .select('snapshot_date').order('snapshot_date', { ascending: false }).limit(1);
    if (e1) throw e1;
    if (!latest || !latest.length) {
      v2SetHTML(body, '<tr><td colspan="11" class="v2-empty">Sin snapshot aun. El sync <code>manualidad_weekly</code> corre diario 7:49 AM.</td></tr>');
      document.getElementById('v2ManualidadSnapshotDate').textContent = 'Snapshot: sin datos';
      v2Loaded.manualidad = true; return;
    }
    v2ManualidadSnapshotDate = latest[0].snapshot_date;
    const { data, error } = await sb.from('manualidad_weekly')
      .select('*').eq('snapshot_date', v2ManualidadSnapshotDate);
    if (error) throw error;
    // Separar el centinela rolling-7d empacado en `semanas` (start === '__rolling7__').
    v2Manualidad = (data || []).map(r => {
      const all = Array.isArray(r.semanas) ? r.semanas : [];
      r.rolling7 = all.find(x => x && x.start === '__rolling7__') || null; // {pct,total,wstart,wend}
      r.semanas = all.filter(x => !x || x.start !== '__rolling7__');
      return r;
    });
    v2Loaded.manualidad = true;
    const corte = v2Manualidad[0] && v2Manualidad[0].corte_date ? ' · ult. semana ' + v2Manualidad[0].corte_date : '';
    document.getElementById('v2ManualidadSnapshotDate').textContent = 'Snapshot: ' + v2ManualidadSnapshotDate + corte;
    v2RenderManualidad();
  } catch (err) {
    v2SetHTML(body, '<tr><td colspan="10" class="v2-empty">Error: ' + v2Esc(err.message) + '</td></tr>');
    console.error('[v2 manualidad]', err);
  }
}

function v2RenderManualidad() {
  const head = document.getElementById('v2ManualidadHead');
  const body = document.getElementById('v2ManualidadBody');
  if (!v2Manualidad.length) { v2SetHTML(head, ''); v2SetHTML(body, '<tr><td colspan="11" class="v2-empty">Sin cuentas.</td></tr>'); return; }
  // columnas de semana: tomar la fila con mas semanas como referencia
  let weekRef = [];
  v2Manualidad.forEach(r => { const s = Array.isArray(r.semanas) ? r.semanas : []; if (s.length > weekRef.length) weekRef = s; });
  // sort: ruta primero (avgconc desc), luego friccion (avgconc desc)
  const rows = v2Manualidad.slice().sort((a, b) => {
    const sa = a.segmento === 'ruta' ? 0 : 1, sbb = b.segmento === 'ruta' ? 0 : 1;
    if (sa !== sbb) return sa - sbb;
    return Number(b.avgconc || 0) - Number(a.avgconc || 0);
  });
  // KPIs
  document.getElementById('v2ManRuta').textContent = v2Manualidad.filter(r => r.segmento === 'ruta').length;
  document.getElementById('v2ManFric').textContent = v2Manualidad.filter(r => r.segmento === 'friccion').length;
  let worst = null;
  v2Manualidad.filter(r => r.segmento === 'friccion' && r.delta_pp != null).forEach(r => { if (!worst || Number(r.delta_pp) > Number(worst.delta_pp)) worst = r; });
  document.getElementById('v2ManAten').textContent = (worst && Number(worst.delta_pp) > 0)
    ? (String(worst.workspace_name).split(' ')[0] + ' +' + Number(worst.delta_pp).toFixed(0) + 'pp') : '—';
  // Distancia al 10%: % manual ponderado por pedidos − 10pp (general / friccion / ruta).
  // Dos lecturas: rolling 7d "al dia" (r.rolling7) y ultima semana ISO cerrada (ult. col de semanas).
  const lastStart = weekRef.length ? weekRef[weekRef.length - 1].start : null;
  const isoWeekCell = (r) => {
    const s = Array.isArray(r.semanas) ? r.semanas : [];
    if (!s.length) return null;
    let cell = lastStart ? s.find(x => x.start === lastStart) : null;
    return cell || s[s.length - 1]; // fallback: ultima semana propia de la cuenta
  };
  // % manual ponderado por pedidos sobre un subset (cellOf = rolling7 o semana ISO)
  const weightedPct = (subset, cellOf) => {
    let num = 0, den = 0;
    subset.forEach(r => {
      const c = cellOf(r);
      if (c && c.total != null && c.pct != null) { num += Number(c.pct) * Number(c.total); den += Number(c.total); }
    });
    return den === 0 ? null : (num / den);
  };
  // % puro (dato grande). colorize: verde ≤10 / rojo >10. ruta = neutral (target 10% no aplica).
  const applyPct = (id, p, dec, colorize) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = p == null ? '—' : p.toFixed(dec) + '%';
    el.classList.remove('over', 'ok');
    if (p != null && colorize) el.classList.add(p > 10 ? 'over' : 'ok');
  };
  // gap secundario (distancia al target)
  const applyGap = (id, p, dec) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (p == null) { el.textContent = '—'; el.className = el.className.replace(/\b(over|ok)\b/g, ''); return; }
    const g = p - 10;
    el.textContent = (g > 0 ? '+' : g < 0 ? '−' : '') + Math.abs(g).toFixed(dec) + 'pp';
    el.classList.remove('over', 'ok'); el.classList.add(g > 0 ? 'over' : 'ok');
  };
  const fric = v2Manualidad.filter(r => r.segmento === 'friccion');
  const ruta = v2Manualidad.filter(r => r.segmento === 'ruta');
  const r7 = r => r.rolling7;
  // 1) Al dia (rolling 7d) — % puro grande + gap secundario
  const pGen = weightedPct(v2Manualidad, r7);
  applyPct('v2ManPctGeneral', pGen, 1, true);
  applyGap('v2ManGapGeneral', pGen, 1);
  applyPct('v2ManPctFric', weightedPct(fric, r7), 0, true);
  applyPct('v2ManPctRuta', weightedPct(ruta, r7), 0, false);
  // 2) Semana ISO anterior (cerrada) — % puro
  applyPct('v2ManPctIsoGeneral', weightedPct(v2Manualidad, isoWeekCell), 1, true);
  applyPct('v2ManPctIsoFric', weightedPct(fric, isoWeekCell), 0, true);
  applyPct('v2ManPctIsoRuta', weightedPct(ruta, isoWeekCell), 0, false);
  // etiquetas de ventana
  const r7row = v2Manualidad.find(r => r.rolling7 && r.rolling7.wstart);
  const r7lbl = document.getElementById('v2ManGapR7Label');
  if (r7lbl) r7lbl.textContent = r7row
    ? '· ' + String(r7row.rolling7.wstart).slice(5) + ' a ' + String(r7row.rolling7.wend).slice(5)
    : '';
  const isoLbl = document.getElementById('v2ManGapIsoLabel');
  const isoW = weekRef.length ? weekRef[weekRef.length - 1].w : '';
  if (isoLbl) isoLbl.textContent = isoW || '';
  // head
  const headHtml = '<tr><th>Cuenta</th>' +
    '<th class="num v2-tooltip" data-tooltip="Pedidos concurrentes por conductor (promedio). &gt;3 = ruta nativa.">AvgConc</th>' +
    weekRef.map(w => '<th class="num">' + v2Esc(w.w) + '<br><small style="font-weight:400">' + v2Esc(String(w.start).slice(5)) + '</small></th>').join('') +
    '<th class="num v2-tooltip" data-tooltip="% manual de la ultima semana menos el promedio de las previas. Verde = manual bajo (bueno); rojo = subio.">&Delta; prev</th>' +
    '<th>Segmento / política</th><th>Comentario</th>' +
    '<th class="num v2-tooltip" data-tooltip="Pedidos MY_FLEET de la última semana (la columna de % en negrita).">Pedidos</th></tr>';
  v2SetHTML(head, headHtml);
  // body
  const html = rows.map(r => {
    const s = Array.isArray(r.semanas) ? r.semanas : [];
    const byStart = {}; s.forEach(x => { byStart[x.start] = x; });
    const acHi = Number(r.avgconc) > 3;
    const acStyle = acHi ? 'background:#fdf1d4;color:#a9760a' : 'background:#eef1f6;color:#8a96aa';
    const wkCells = weekRef.map((w, i) => {
      const cell = byStart[w.start];
      const isLast = i === weekRef.length - 1;
      if (!cell) return '<td class="num" style="color:var(--neutral-800)">&mdash;</td>';
      return '<td class="num"' + (isLast ? ' style="font-weight:800"' : '') + '>' + cell.pct + '%</td>';
    }).join('');
    let dStyle = 'color:var(--neutral-800)';
    if (r.segmento === 'friccion' && r.delta_pp != null) {
      dStyle = Number(r.delta_pp) <= -1 ? 'color:var(--verde-500);font-weight:700'
        : Number(r.delta_pp) >= 1 ? 'color:var(--rojo);font-weight:700' : 'color:var(--neutral-800)';
    }
    const dTxt = r.delta_pp == null ? '&mdash;'
      : ((Number(r.delta_pp) > 0 ? '+' : Number(r.delta_pp) < 0 ? '−' : '') + Math.abs(Number(r.delta_pp)).toFixed(0) + 'pp');
    const lastWk = weekRef.length ? byStart[weekRef[weekRef.length - 1].start] : null;
    const pedidos = lastWk && lastWk.total != null ? Number(lastWk.total).toLocaleString('es') : '&mdash;';
    const safeId = v2Esc(r.id);
    const polLabel = r.segmento === 'ruta'
      ? '<span class="v2-pill v2-pill-amarillo" style="margin-right:6px">ruta</span>'
      : '<span class="v2-pill v2-pill-verde" style="margin-right:6px">fricción</span>';
    return '<tr>' +
      '<td class="v2-cliente">' + v2Esc(r.workspace_name) + '</td>' +
      '<td class="num"><span style="display:inline-block;padding:3px 9px;border-radius:14px;font-weight:800;font-size:12px;' + acStyle + '">' + Number(r.avgconc).toFixed(2) + '</span></td>' +
      wkCells +
      '<td class="num" style="' + dStyle + '">' + dTxt + '</td>' +
      '<td>' + polLabel + '<span class="v2-editable" data-id="' + safeId + '" data-field="politica" contenteditable="true" onblur="v2SaveInline(this,\'manualidad_weekly\')">' + v2Esc(r.politica || '') + '</span></td>' +
      '<td><span class="v2-editable" data-id="' + safeId + '" data-field="comentario" contenteditable="true" onblur="v2SaveInline(this,\'manualidad_weekly\')">' + v2Esc(r.comentario || '') + '</span></td>' +
      '<td class="num">' + pedidos + '</td>' +
      '</tr>';
  }).join('');
  v2SetHTML(body, html);
}

// ============================================================
// LOG — lo cerrado y lo archivado de las otras pestanas
// Espejo VIVO, no historico congelado: si alguien restaura un item en su
// pestana original, la entrada se cae de aca en el siguiente load. No hay
// tabla propia a proposito — duplicarla obligaria a sincronizar dos verdades.
// ============================================================

// Los estados que las pestanas esconden son exactamente lo que este log muestra
// (en cartera, v2cVisible() oculta descartado y resuelto).
const V2LOG_CIERRE_LBL = { resuelto: 'Resuelto', descartado: 'Descartado', archivado: 'Archivado' };
const V2LOG_TIPO_LBL = {
  tema: 'tema', hicimos: 'hicimos', cliente: 'cliente', scrapping: 'scrapping',
  bloqueo: 'bloqueo', accion: 'accion', cuenta: 'cuenta',
};

async function v2LoadLog() {
  const body = document.getElementById('v2LogBody');
  try {
    const [reg, blo, acc, roll, nombres, exp] = await Promise.all([
      sb.from('cartera_registro').select('*').eq('estado', 'descartado'),
      sb.from('cartera_bloqueos').select('*').in('estado', ['descartado', 'resuelto']),
      sb.from('expansion_acciones').select('*').or('estado.eq.resuelto,estado_draft.eq.descartado'),
      sb.from('rollouts').select('id,cliente,workspace_id,am_owner,pais,bloqueo_actual,updated_at').eq('archived', true),
      sb.from('cartera_2500').select('workspace_id,cliente'),
      sb.from('expansion_top40').select('workspace_id,workspace_name').order('snapshot_date', { ascending: false }).limit(400),
    ]);

    // Mapa workspace_id -> nombre: las tablas de cartera solo guardan el ws_id.
    const nom = {};
    (nombres.data || []).forEach(x => { if (x.cliente) nom[x.workspace_id] = x.cliente; });
    (exp.data || []).forEach(x => { if (!nom[x.workspace_id] && x.workspace_name) nom[x.workspace_id] = x.workspace_name; });
    const nombreDe = ws => nom[ws] || ws || '—';

    const filas = [];
    if (reg.error) console.warn('[v2 log] registro:', reg.error.message);
    (reg.data || []).forEach(r => filas.push({
      ts: r.updated_at || r.created_at, nacio: r.created_at, cierre: 'descartado', fuente: 'Cartera 2500',
      ws: r.workspace_id, cuenta: nombreDe(r.workspace_id), tipo: r.tipo || 'tema',
      texto: r.texto || '', extra: '', why: r.why || '', quien: r.updated_by || '',
    }));
    if (blo.error) console.warn('[v2 log] bloqueos:', blo.error.message);
    (blo.data || []).forEach(b => filas.push({
      ts: b.updated_at || b.created_at, nacio: b.primera_vez || b.created_at, cierre: b.estado, fuente: 'Cartera 2500',
      ws: b.workspace_id, cuenta: nombreDe(b.workspace_id), tipo: 'bloqueo',
      texto: b.bloqueo || '', extra: b.solucion || '', why: '',
      quien: b.responsable || b.updated_by || '',
    }));
    if (acc.error) console.warn('[v2 log] acciones:', acc.error.message);
    (acc.data || []).forEach(a => filas.push({
      ts: a.updated_at || a.created_at, nacio: a.created_at,
      cierre: a.estado === 'resuelto' ? 'resuelto' : 'descartado',
      fuente: 'Retención / Expansión', ws: a.workspace_id, cuenta: nombreDe(a.workspace_id),
      tipo: a.tipo === 'bloqueo' ? 'bloqueo' : 'accion',
      texto: a.texto || '', extra: '', why: '', quien: a.responsable || a.updated_by || '',
    }));
    if (roll.error) console.warn('[v2 log] rollouts:', roll.error.message);
    (roll.data || []).forEach(r => filas.push({
      ts: r.updated_at, nacio: null, cierre: 'archivado', fuente: 'Rollout',
      ws: r.workspace_id, cuenta: r.cliente || nombreDe(r.workspace_id), tipo: 'cuenta',
      // de un rollout archivado lo unico que queda registrado es con que bloqueo cerro
      texto: 'Rollout archivado' + (r.pais ? ' · ' + r.pais : ''),
      extra: '', why: r.bloqueo_actual || '', quien: r.am_owner || '',
    }));

    // mas reciente arriba; lo que no tiene fecha cae al final
    filas.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
    v2Log = filas;
    v2Loaded.log = true;

    // el select de cuentas se arma con lo que realmente aparece en el log
    const sel = document.getElementById('v2LogCuenta');
    if (sel) {
      const vistas = Array.from(new Set(filas.map(f => f.cuenta))).sort((a, b) => a.localeCompare(b));
      v2SetHTML(sel, '<option value="">Todas las cuentas</option>' +
        vistas.map(c => '<option value="' + v2Esc(c) + '">' + v2Esc(c) + '</option>').join(''));
    }
    const badge = document.getElementById('v2BadgeLog');
    if (badge) badge.textContent = filas.length;
    v2RenderLog();
  } catch (err) {
    v2SetHTML(body, '<tr><td colspan="7" class="v2-empty">Error: ' + v2Esc(err.message) + '</td></tr>');
    console.error('[v2 log]', err);
  }
}

function v2LogFecha(ts) {
  if (!ts) return '<span class="lg-fecha">sin fecha</span>';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '<span class="lg-fecha">' + v2Esc(String(ts).slice(0, 10)) + '</span>';
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  return '<span class="lg-fecha">' + d.getDate() + '-' + MES[d.getMonth()] +
    '<br><span class="lg-hora">' + hh + '</span></span>';
}

// Cuanto estuvo abierto el item antes de cerrarse. Es un dato real (created_at ->
// updated_at); NO dice si estuvo aprobado en el medio, eso las tablas no lo guardan.
function v2LogVivio(f) {
  if (!f.nacio || !f.ts) return '';
  const a = new Date(f.nacio).getTime(), b = new Date(f.ts).getTime();
  if (isNaN(a) || isNaN(b) || b < a) return '';
  const min = Math.round((b - a) / 60000);
  if (min < 60) return '<div class="lg-hora">vivió ' + min + ' min</div>';
  const h = Math.round(min / 60);
  if (h < 48) return '<div class="lg-hora">vivió ' + h + ' h</div>';
  return '<div class="lg-hora">vivió ' + Math.round(h / 24) + ' d</div>';
}

function v2RenderLog() {
  const body = document.getElementById('v2LogBody');
  if (!v2Log.length) {
    v2SetHTML(body, '<tr><td colspan="7" class="v2-empty">Todavía no hay nada cerrado ni archivado.</td></tr>');
    return;
  }
  const q = ((document.getElementById('v2LogQ') || {}).value || '').trim().toLowerCase();
  const fF = (document.getElementById('v2LogFuente') || {}).value || '';
  const fC = (document.getElementById('v2LogCierre') || {}).value || '';
  const fA = (document.getElementById('v2LogCuenta') || {}).value || '';
  const rows = v2Log.filter(f => {
    if (fF && f.fuente !== fF) return false;
    if (fC && f.cierre !== fC) return false;
    if (fA && f.cuenta !== fA) return false;
    if (q) {
      const blob = (f.texto + ' ' + f.extra + ' ' + f.why + ' ' + f.cuenta).toLowerCase();
      if (blob.indexOf(q) === -1) return false;
    }
    return true;
  });

  document.getElementById('v2LogTot').textContent = rows.length.toLocaleString('en-US');
  document.getElementById('v2LogTotSub').textContent = rows.length === v2Log.length
    ? 'todo el log' : 'de ' + v2Log.length.toLocaleString('en-US') + ' en total';
  document.getElementById('v2LogRes').textContent = rows.filter(f => f.cierre === 'resuelto').length;
  document.getElementById('v2LogDesc').textContent = rows.filter(f => f.cierre === 'descartado').length;
  // "hoy" y no "ultimos 7 dias": el log arranco esta semana, asi que una ventana de
  // 7 dias devuelve casi el total y no dice nada.
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const nHoy = rows.filter(f => f.ts && new Date(f.ts).getTime() >= hoy.getTime()).length;
  document.getElementById('v2Log7').textContent = nHoy;
  const s7 = document.getElementById('v2Log7Sub');
  if (s7) {
    const dias = new Set(rows.filter(f => f.ts).map(f => String(f.ts).slice(0, 10))).size;
    s7.textContent = dias ? 'en ' + dias + (dias === 1 ? ' día con cierres' : ' días con cierres') : '—';
  }
  const sub = document.getElementById('v2LogSub');
  if (sub) sub.textContent = v2Log.length.toLocaleString('en-US') + ' entradas · Cartera 2500 + Rollout + Retención/Expansión';

  if (!rows.length) {
    v2SetHTML(body, '<tr><td colspan="7" class="v2-empty">Sin resultados con esos filtros.</td></tr>');
    return;
  }
  const html = rows.map(f => {
    const sol = f.extra ? '<div class="lg-sol">' + v2Esc(f.extra) + '</div>' : '';
    const why = f.why ? '<div class="lg-why">' + v2Esc(f.why) + '</div>' : '';
    return '<tr class="lg-row">' +
      '<td>' + v2LogFecha(f.ts) + v2LogVivio(f) + '</td>' +
      '<td><span class="lg-cierre lg-' + f.cierre + '">' + (V2LOG_CIERRE_LBL[f.cierre] || f.cierre) + '</span></td>' +
      '<td><span class="lg-fuente">' + v2Esc(f.fuente) + '</span></td>' +
      '<td class="v2-cliente">' + v2Esc(f.cuenta) + '</td>' +
      '<td><span class="lg-tipo">' + v2Esc(V2LOG_TIPO_LBL[f.tipo] || f.tipo) + '</span></td>' +
      '<td><div class="lg-txt">' + v2Esc(f.texto) + '</div>' + sol + why + '</td>' +
      '<td><span class="lg-quien">' + v2Esc(f.quien || '—') + '</span></td>' +
      '</tr>';
  }).join('');
  v2SetHTML(body, html);
}

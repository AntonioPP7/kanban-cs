// ============================================================================
// Kanban v2 — Tabs + Rollouts + Health Check Top 30
// Usa el cliente `sb` (window.supabase) ya inicializado en index_v2.html
// Usa insertAdjacentHTML sobre strings escapados via v2Esc() para renderizar.
// ============================================================================

let v2Rollouts = [];
let v2HealthCheck = [];
let v2HCSnapshotDate = null;
let v2Watchlist = [];
let v2WatchlistSnapshotDate = null;
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
let v2Loaded = { rollouts: false, hc: false, cartera: false, expansion: false, manualidad: false, retention: false };

// URL del servicio del panel Daily Retention (Cloud Run). Vacia = pestana apagada.
// Ver projects/picker-cs/daily-retention/servicio/README.md
const RETENTION_BASE = '';

// v2.2: Sort state, persisted en localStorage
let v2HCSort = (function() {
  try {
    const raw = localStorage.getItem('v2hc.sort');
    if (raw) {
      const p = JSON.parse(raw);
      if (p && p.key) return { key: p.key, dir: p.dir === 'asc' ? 'asc' : 'desc' };
    }
  } catch (e) { /* ignore */ }
  return { key: 'rank', dir: 'asc' };
})();

function v2SaveSort() {
  try { localStorage.setItem('v2hc.sort', JSON.stringify(v2HCSort)); } catch (e) { /* ignore */ }
}

// v2.3: deep-link al workspace en Picker Hub (abre nueva tab)
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
  if (tab === 'rollouts' && !v2Loaded.rollouts) v2LoadRollouts();
  if (tab === 'healthcheck' && !v2Loaded.hc) {
    v2LoadHealthCheck();
    v2LoadWatchlist();
  }
  if (tab === 'cartera' && !v2Loaded.cartera) v2LoadCartera();
  if (tab === 'expansion' && !v2Loaded.expansion) v2LoadExpansion();
  if (tab === 'manualidad' && !v2Loaded.manualidad) v2LoadManualidad();
  if (tab === 'retention' && !v2Loaded.retention) v2LoadRetention();
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

async function v2LoadRollouts() {
  try {
    const { data, error } = await sb.from('rollouts')
      .select('*')
      .eq('archived', false)
      .order('envios_mes_target', { ascending: false, nullsFirst: false });
    if (error) throw error;
    v2Rollouts = data || [];
    v2Loaded.rollouts = true;
    document.getElementById('v2BadgeRollouts').textContent = v2Rollouts.length;

    const paises = [...new Set(v2Rollouts.map(r => r.pais).filter(Boolean))].sort();
    const sel = document.getElementById('v2FilterRolloutPais');
    const opts = ['<option value="">Todos los paises</option>']
      .concat(paises.map(p => '<option value="' + v2Esc(p) + '">' + v2Esc(p) + '</option>'));
    v2SetHTML(sel, opts.join(''));

    v2RenderRollouts();
  } catch (err) {
    v2SetHTML(document.getElementById('v2RolloutsBody'),
      '<tr><td colspan="12" class="v2-empty">Error cargando rollouts: ' + v2Esc(err.message) + '</td></tr>');
    console.error('[v2 rollouts]', err);
  }
}

function v2RenderRollouts() {
  const fAM = document.getElementById('v2FilterRolloutAM').value;
  const fSem = document.getElementById('v2FilterRolloutSem').value;
  const fPais = document.getElementById('v2FilterRolloutPais').value;
  const rows = v2Rollouts.filter(r =>
    (!fAM || r.am_owner === fAM) &&
    (!fSem || r.semaforo === fSem) &&
    (!fPais || r.pais === fPais)
  );
  const body = document.getElementById('v2RolloutsBody');
  if (!rows.length) {
    v2SetHTML(body, '<tr><td colspan="18" class="v2-empty">Sin rollouts con esos filtros.</td></tr>');
    return;
  }
  const fmtNum = (v) => (v == null || v === '') ? '&mdash;' : Number(v).toLocaleString('en-US');
  const html = rows.map(r => {
    const techoEnv = fmtNum(r.envios_mes_target);
    // Proyeccion lineal MTD: si el sync llena envios_proyeccion_mes usar eso; fallback a calculo en base a envios_mtd
    let proyMtd = '&mdash;';
    if (r.envios_proyeccion_mes != null) {
      proyMtd = fmtNum(r.envios_proyeccion_mes);
    } else if (r.envios_mtd != null) {
      const now = new Date();
      const day = now.getDate();
      const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const proj = Math.round((Number(r.envios_mtd) / day) * dim);
      proyMtd = proj.toLocaleString('en-US');
    }
    // Color de proyeccion vs techo
    let proyStyle = '';
    if (r.envios_mes_target && proyMtd !== '&mdash;') {
      const projVal = typeof r.envios_proyeccion_mes === 'number' ? r.envios_proyeccion_mes
        : Math.round((Number(r.envios_mtd || 0) / new Date().getDate()) * new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate());
      const ratio = projVal / Number(r.envios_mes_target);
      if (ratio >= 0.95) proyStyle = 'style="color:var(--verde-500);font-weight:700"';
      else if (ratio >= 0.75) proyStyle = 'style="color:var(--amarillo);font-weight:700"';
      else proyStyle = 'style="color:var(--rojo);font-weight:700"';
    }
    const techoLoc = fmtNum(r.locales_totales);
    const locAct = fmtNum(r.locales_activos != null ? r.locales_activos : r.locales_piloto);
    const statusPill = r.status_integracion
      ? '<span class="v2-pill v2-pill-' + v2StatusPillColor(r.status_integracion) + '">' + v2Esc(r.status_integracion) + '</span>'
      : '&mdash;';
    const contratoPill = r.status_contrato
      ? '<span class="v2-pill v2-pill-' + (r.status_contrato === 'firmado' ? 'verde' : 'amarillo') + '">' + v2Esc(r.status_contrato) + '</span>'
      : '&mdash;';
    const wsId = r.workspace_id ? '<small>' + v2Esc(r.workspace_id) + '</small>' : '';
    const safeId = v2Esc(r.id);
    return '<tr>' +
      '<td class="v2-cliente">' + v2Esc(r.cliente) + wsId + '</td>' +
      '<td>' + v2Esc(r.am_owner || '—') + '</td>' +
      '<td>' + v2Esc(r.ventas_owner || '—') + '</td>' +
      '<td>' + v2Esc(r.pais || '—') + '</td>' +
      '<td class="num">' + techoEnv + '</td>' +
      '<td class="num" ' + proyStyle + '>' + proyMtd + '</td>' +
      '<td class="num">' + techoLoc + '</td>' +
      '<td class="num">' + locAct + '</td>' +
      '<td>' + statusPill + '</td>' +
      '<td>' + contratoPill + '</td>' +
      '<td><div class="v2-dossier v2-editable" data-id="' + safeId + '" data-field="dossier_ejecutivo" contenteditable="true" onblur="v2SaveInline(this,\'rollouts\')">' + v2Esc(r.dossier_ejecutivo || '') + '</div></td>' +
      '<td><div class="v2-editable" data-id="' + safeId + '" data-field="bloqueo_actual" contenteditable="true" onblur="v2SaveInline(this,\'rollouts\')">' + v2Esc(r.bloqueo_actual || '') + '</div></td>' +
      '<td><span class="v2-sem v2-sem-' + v2Esc(r.semaforo) + '"></span>' + v2Esc(r.semaforo) + '</td>' +
      '<td><button class="v2-btn v2-btn-sec" style="padding:4px 8px;font-size:11px" onclick="v2EditRollout(\'' + safeId + '\')">&#9998;</button></td>' +
      '</tr>';
  }).join('');
  v2SetHTML(body, html);
}

function v2StatusPillColor(s) {
  if (['listo', 'arrancado'].includes(s)) return 'verde';
  if (['bloqueado'].includes(s)) return 'rojo';
  if (['comercial', 'seguimiento'].includes(s)) return 'gris';
  return 'amarillo';
}

async function v2SaveInline(el, table) {
  const id = el.dataset.id;
  const field = el.dataset.field;
  const value = el.innerText.trim() || null;
  el.classList.add('saving');
  try {
    const { error } = await sb.from(table).update({ [field]: value }).eq('id', id);
    if (error) throw error;
    const list = table === 'rollouts' ? v2Rollouts
      : table === 'manualidad_weekly' ? v2Manualidad
      : v2HealthCheck;
    const row = list.find(r => String(r.id) === String(id));
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

function v2OpenRolloutModal() {
  document.getElementById('v2RolloutModalTitle').textContent = 'Nuevo rollout';
  document.getElementById('v2RolloutId').value = '';
  ['cliente', 'pais', 'envios', 'loc_tot', 'loc_pil', 'mes', 'fecha', 'dossier', 'bloqueo', 'hubspot', 'alongside']
    .forEach(k => { const el = document.getElementById('v2rf_' + k); if (el) el.value = ''; });
  document.getElementById('v2rf_am').value = 'Juan Xavier';
  document.getElementById('v2rf_ventas').value = '';
  document.getElementById('v2rf_status').value = '';
  document.getElementById('v2rf_contrato').value = '';
  document.getElementById('v2rf_sem').value = 'verde';
  document.getElementById('v2RolloutDelBtn').style.display = 'none';
  document.getElementById('v2RolloutModal').classList.add('open');
}

function v2EditRollout(id) {
  const r = v2Rollouts.find(x => String(x.id) === String(id));
  if (!r) return;
  document.getElementById('v2RolloutModalTitle').textContent = 'Editar rollout';
  document.getElementById('v2RolloutId').value = r.id;
  document.getElementById('v2rf_cliente').value = r.cliente || '';
  document.getElementById('v2rf_am').value = r.am_owner || 'Juan Xavier';
  document.getElementById('v2rf_ventas').value = r.ventas_owner || '';
  document.getElementById('v2rf_pais').value = r.pais || '';
  document.getElementById('v2rf_envios').value = r.envios_mes_target || '';
  document.getElementById('v2rf_loc_tot').value = r.locales_totales || '';
  document.getElementById('v2rf_loc_pil').value = r.locales_piloto || '';
  document.getElementById('v2rf_mes').value = r.mes_arranque || '';
  document.getElementById('v2rf_fecha').value = r.fecha_target_primer_pedido || '';
  document.getElementById('v2rf_status').value = r.status_integracion || '';
  document.getElementById('v2rf_contrato').value = r.status_contrato || '';
  document.getElementById('v2rf_sem').value = r.semaforo || 'verde';
  document.getElementById('v2rf_dossier').value = r.dossier_ejecutivo || '';
  document.getElementById('v2rf_bloqueo').value = r.bloqueo_actual || '';
  document.getElementById('v2rf_hubspot').value = r.hubspot_url || '';
  document.getElementById('v2rf_alongside').value = r.alongside_url || '';
  document.getElementById('v2RolloutDelBtn').style.display = 'inline-block';
  document.getElementById('v2RolloutModal').classList.add('open');
}

function v2CloseRolloutModal() {
  document.getElementById('v2RolloutModal').classList.remove('open');
}

async function v2SaveRollout() {
  const id = document.getElementById('v2RolloutId').value;
  const payload = {
    cliente: document.getElementById('v2rf_cliente').value.trim(),
    am_owner: document.getElementById('v2rf_am').value,
    ventas_owner: document.getElementById('v2rf_ventas').value || null,
    pais: document.getElementById('v2rf_pais').value || null,
    envios_mes_target: parseInt(document.getElementById('v2rf_envios').value) || null,
    locales_totales: parseInt(document.getElementById('v2rf_loc_tot').value) || null,
    locales_piloto: parseInt(document.getElementById('v2rf_loc_pil').value) || null,
    mes_arranque: document.getElementById('v2rf_mes').value || null,
    fecha_target_primer_pedido: document.getElementById('v2rf_fecha').value || null,
    status_integracion: document.getElementById('v2rf_status').value || null,
    status_contrato: document.getElementById('v2rf_contrato').value || null,
    semaforo: document.getElementById('v2rf_sem').value,
    dossier_ejecutivo: document.getElementById('v2rf_dossier').value || null,
    bloqueo_actual: document.getElementById('v2rf_bloqueo').value || null,
    hubspot_url: document.getElementById('v2rf_hubspot').value || null,
    alongside_url: document.getElementById('v2rf_alongside').value || null,
  };
  if (!payload.cliente) { alert('Cliente es obligatorio'); return; }
  try {
    if (id) {
      const { error } = await sb.from('rollouts').update(payload).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await sb.from('rollouts').insert(payload);
      if (error) throw error;
    }
    v2CloseRolloutModal();
    v2Loaded.rollouts = false;
    await v2LoadRollouts();
  } catch (err) {
    alert('Error guardando: ' + err.message);
    console.error(err);
  }
}

async function v2DeleteRollout() {
  const id = document.getElementById('v2RolloutId').value;
  if (!id || !confirm('Archivar este rollout?')) return;
  try {
    const { error } = await sb.from('rollouts').update({ archived: true }).eq('id', id);
    if (error) throw error;
    v2CloseRolloutModal();
    v2Loaded.rollouts = false;
    await v2LoadRollouts();
  } catch (err) {
    alert('Error: ' + err.message);
    console.error(err);
  }
}

// ============================================================
// HEALTH CHECK TOP 30
// ============================================================

async function v2LoadHealthCheck() {
  try {
    const { data: latestDate, error: e1 } = await sb.from('health_check_top30')
      .select('snapshot_date')
      .order('snapshot_date', { ascending: false })
      .limit(1);
    if (e1) throw e1;
    if (!latestDate || !latestDate.length) {
      v2SetHTML(document.getElementById('v2HCBody'),
        '<tr><td colspan="18" class="v2-empty">No hay snapshot aun. El sync <code>health_check_top30</code> todavia no corrio.<br>Cuando este listo, aqui aparecera el Top 30 del NDR + healthscore de Supabase.</td></tr>');
      document.getElementById('v2HCSnapshotDate').textContent = 'Snapshot: sin datos';
      v2Loaded.hc = true;
      return;
    }
    v2HCSnapshotDate = latestDate[0].snapshot_date;
    const { data, error } = await sb.from('health_check_top30')
      .select('*')
      .eq('snapshot_date', v2HCSnapshotDate)
      .order('rank', { ascending: true });
    if (error) throw error;
    v2HealthCheck = data || [];
    v2Loaded.hc = true;
    document.getElementById('v2HCSnapshotDate').textContent = 'Snapshot: ' + v2HCSnapshotDate;
    v2RenderHealthCheck();
    v2LoadOpsNotes();
  } catch (err) {
    v2SetHTML(document.getElementById('v2HCBody'),
      '<tr><td colspan="18" class="v2-empty">Error: ' + v2Esc(err.message) + '</td></tr>');
    console.error('[v2 hc]', err);
  }
}

function v2SortRows(rows, key, dir) {
  if (!key) return rows;
  const sign = dir === 'asc' ? 1 : -1;
  const isNumKey = ['rank','healthscore','engagement_score','alertas_abiertas','rides_mtd','rides_ytd','rides_sem_ant','delta_semana_ant_pct','delta_12sem_pct','fr_sem_actual_pct','costo_opp_mtd_pct','costo_opp_ytd_pct','take_rate_mtd_pct','take_rate_ytd_pct'].includes(key);
  return rows.slice().sort((a, b) => {
    let va = a[key], vb = b[key];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;   // nulls al fondo siempre
    if (vb == null) return -1;
    if (isNumKey) {
      return sign * (Number(va) - Number(vb));
    }
    return sign * String(va).localeCompare(String(vb), 'es');
  });
}

function v2UpdateSortIndicators() {
  document.querySelectorAll('#v2HCTable thead th.v2-sortable').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.sortKey === v2HCSort.key) {
      th.classList.add('sort-' + v2HCSort.dir);
    }
  });
}

function v2OnSortClick(key) {
  if (v2HCSort.key === key) {
    v2HCSort.dir = v2HCSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    v2HCSort.key = key;
    v2HCSort.dir = 'desc';  // default desc para metricas (rank toggle a asc despues)
  }
  v2SaveSort();
  v2RenderHealthCheck();
}

function v2WireSortHandlers() {
  document.querySelectorAll('#v2HCTable thead th.v2-sortable').forEach(th => {
    if (th.dataset.sortWired) return;
    th.dataset.sortWired = '1';
    th.addEventListener('click', () => v2OnSortClick(th.dataset.sortKey));
  });
}

function v2RenderHealthCheck() {
  v2WireSortHandlers();
  v2UpdateSortIndicators();
  const fAM = document.getElementById('v2FilterHCAM').value;
  const fSem = document.getElementById('v2FilterHCSem').value;
  let rows = v2HealthCheck.filter(r => (!fAM || r.am_owner === fAM) && (!fSem || r.semaforo === fSem));
  rows = v2SortRows(rows, v2HCSort.key, v2HCSort.dir);

  document.getElementById('v2KpiTotal').textContent = v2HealthCheck.length;
  const alertas = v2HealthCheck.reduce((a, r) => a + (r.alertas_abiertas || 0), 0);
  const criticas = v2HealthCheck.reduce((a, r) => a + (r.alertas_criticas || 0), 0);
  document.getElementById('v2KpiAlertas').textContent = alertas;
  document.getElementById('v2KpiAlertasSub').textContent = criticas + ' criticas';
  const rojos = v2HealthCheck.filter(r => r.semaforo === 'rojo');
  document.getElementById('v2KpiRojos').textContent = rojos.length;
  document.getElementById('v2KpiRojosSub').textContent = rojos.slice(0, 3).map(r => r.workspace_name).join(' · ') || '—';
  const rev = v2HealthCheck.reduce((a, r) => a + (parseFloat(r.rev_q_usd) || 0), 0);
  document.getElementById('v2KpiRev').textContent = '$' + Math.round(rev).toLocaleString('en-US');

  const body = document.getElementById('v2HCBody');
  if (!rows.length) {
    v2SetHTML(body, '<tr><td colspan="20" class="v2-empty">Sin resultados con esos filtros.</td></tr>');
    return;
  }
  // Actualizar headers con numero de semana ISO (lo toma del primer row con data)
  const sample = v2HealthCheck.find(r => r.semana_ant_num != null || r.semana_actual_num != null);
  if (sample) {
    const setHeader = (id, label, wk, suffix, tip) => {
      const el = document.getElementById(id);
      if (!el || wk == null) return;
      el.textContent = label + ' ';
      const small = document.createElement('small');
      small.style.cssText = 'font-weight:400;text-transform:none';
      small.textContent = '(W' + wk + (suffix || '') + ')';
      if (tip) small.title = tip;
      el.appendChild(small);
    };
    setHeader('v2HCRidesSemAntHeader', 'Rides sem ant', sample.semana_ant_num);
    // En fallback (inicio de semana) el %FR actual muestra la ultima semana COMPLETA, no la WTD.
    const frFallback = sample.fr_fallback === true;
    setHeader('v2HCFrActualHeader',
      frFallback ? '%FR sem' : '%FR sem actual',
      sample.semana_actual_num,
      frFallback ? ' · cerrada' : '',
      frFallback ? 'Semana en curso aun sin data suficiente (inicio de semana): se muestra el %FR de la ultima semana COMPLETA. A partir del miercoles vuelve a la semana en curso (WTD).' : 'Fulfillment de la semana en curso (WTD).');
  }
  const fmtDelta = (v) => {
    if (v == null) return { txt:'—', style:'' };
    const n = Number(v);
    const txt = (n > 0 ? '+' : '') + n.toFixed(0) + '%';
    const style = n >= 5 ? 'style="color:var(--verde-500);font-weight:700"'
      : n <= -10 ? 'style="color:var(--rojo);font-weight:700"'
      : n <= -5 ? 'style="color:var(--amarillo);font-weight:700"' : '';
    return { txt, style };
  };
  // Variacion FR en puntos porcentuales
  const fmtFrVar = (v) => {
    if (v == null) return { txt:'', style:'' };
    const n = Number(v);
    const txt = (n > 0 ? '+' : '') + n.toFixed(1) + 'pp';
    const style = n >= 1 ? 'color:var(--verde-500)'
      : n <= -3 ? 'color:var(--rojo)'
      : n <= -1 ? 'color:var(--amarillo)' : '';
    return { txt, style };
  };
  // Costo oportunidad MTD: si la fuente cfo no consolido el mes (~0), mostrar — con warning.
  // Detectamos esta condicion comparando MTD vs YTD: si YTD > 0 pero MTD < 0.05% (efectivamente cero),
  // asumimos que es bug de fuente y no realmente "0% costo opp".
  const fmtCostoOpp = (v, isMtd, ytdRef) => {
    if (v == null) return { txt:'—', style:'' };
    const n = Number(v);
    // Dash con warning si MTD ~= 0 y YTD tiene data
    if (isMtd && Math.abs(n) < 0.05 && ytdRef != null && Math.abs(Number(ytdRef)) > 0.1) {
      return {
        txt: '<span class="v2-dash-warn v2-tooltip" data-tooltip="cfo.base_maestra_mat aun no consolida costos del mes en curso (suele cerrarse alrededor del dia 10 del mes siguiente). El sync mostrara el dato cuando Armando termine el proceso.">⚠ —</span>',
        style: ''
      };
    }
    const txt = n.toFixed(1) + '%';
    const style = n >= 5 ? 'style="color:var(--rojo);font-weight:700"'
      : n >= 2 ? 'style="color:var(--amarillo);font-weight:700"'
      : 'style="color:var(--verde-500);font-weight:600"';
    return { txt, style };
  };

  // Trend arrow: avg 7d vs 7dp en puntos del score.
  const fmtTrend = (delta) => {
    if (delta == null) return '<span class="v2-trend v2-trend-na" title="Necesita 14 dias de historia">—</span>';
    const n = Number(delta);
    if (Math.abs(n) < 0.05) return '<span class="v2-trend v2-trend-flat" title="Sin cambio significativo (<0.05)">→</span>';
    const arrow = n > 0 ? '↑' : '↓';
    const cls = n > 0 ? 'v2-trend-up' : 'v2-trend-down';
    const sign = n > 0 ? '+' : '';
    return '<span class="v2-trend ' + cls + '" title="vs avg 7 dias previos">' + arrow + sign + n.toFixed(1) + '</span>';
  };

  // Churn badge: prefix antes del nombre cuando churn_status != null
  const churnBadge = (status) => {
    if (!status) return '';
    const map = { churned: { cls:'', txt:'CHURN' }, pre_churn: { cls:' pre', txt:'PRE-CHURN' }, recovered: { cls:' recovered', txt:'RECOVERED' } };
    const m = map[status];
    if (!m) return '';
    return '<span class="v2-churn-badge' + m.cls + '">' + m.txt + '</span>';
  };
  // Take rate: % billing / order value. No hay umbrales de bueno/malo, solo informativo.
  const fmtTakeRate = (v, cov) => {
    if (v == null) {
      const title = cov != null && cov < 20
        ? ' title="Cobertura de order_amount ' + Number(cov).toFixed(0) + '% (<20%). Cliente no reporta valor del pedido en la mayoria de bookings."'
        : '';
      return { txt:'<span' + title + '>—</span>', style:'' };
    }
    return { txt: Number(v).toFixed(1) + '%', style:'' };
  };
  const html = rows.map(r => {
    const mtd = r.rides_mtd != null ? Number(r.rides_mtd).toLocaleString('en-US') : '—';
    const ytd = r.rides_ytd != null ? Number(r.rides_ytd).toLocaleString('en-US') : '—';
    const dSem = fmtDelta(r.delta_semana_ant_pct);
    const d12 = fmtDelta(r.delta_12sem_pct);
    const ridesSemAnt = r.rides_sem_ant != null ? Number(r.rides_sem_ant).toLocaleString('en-US') : '—';
    const frActual = r.fr_sem_actual_pct != null ? Number(r.fr_sem_actual_pct).toFixed(1) + '%' : '—';
    const frVar = fmtFrVar(r.fr_variation_pp);
    const coppMtd = fmtCostoOpp(r.costo_opp_mtd_pct, true, r.costo_opp_ytd_pct);
    const coppYtd = fmtCostoOpp(r.costo_opp_ytd_pct, false, null);
    const trMtd = fmtTakeRate(r.take_rate_mtd_pct, r.orden_coverage_mtd_pct);
    const trYtd = fmtTakeRate(r.take_rate_ytd_pct, r.orden_coverage_ytd_pct);
    const hs = r.healthscore == null ? '—' : Number(r.healthscore).toFixed(1);
    const hsColor = r.healthscore == null ? '' : (r.healthscore < 6.5 ? 'color:var(--rojo)' : r.healthscore < 7.5 ? 'color:var(--amarillo)' : 'color:var(--verde-500)');
    const eng = r.engagement_score == null ? '—' : Number(r.engagement_score).toFixed(1);
    const engColor = r.engagement_score == null ? '' : (r.engagement_score < 6.5 ? 'color:var(--rojo)' : r.engagement_score < 8.0 ? 'color:var(--amarillo)' : 'color:var(--verde-500)');
    const safeId = v2Esc(r.id);
    const sem = r.semaforo || 'verde';
    const aiBtn = r.preguntas_ai
      ? '<button class="v2-ai-btn" title="Ver preguntas cinicas AI" onclick="v2OpenPreguntasModal(\'top30\',\'' + v2Esc(r.id) + '\')">&#129302;</button>'
      : '<span class="v2-ai-btn-empty" title="Aun no generadas (proximo lunes 8:30 AM)">&#129302;</span>';
    const churnPrefix = churnBadge(r.churn_status);
    const wsName = churnPrefix + (r.workspace_uuid ? v2HubLink(r.workspace_uuid, r.workspace_name) : v2Esc(r.workspace_name));
    const hsCell = r.workspace_uuid
      ? v2HubLink(r.workspace_uuid, hs, hsColor + ';font-weight:700')
      : '<span style="' + hsColor + ';font-weight:700">' + hs + '</span>';
    return '<tr>' +
      '<td>' + (r.rank || '—') + '</td>' +
      '<td class="v2-cliente">' + wsName + '<small>' + v2Esc(r.workspace_id || '') + '</small></td>' +
      '<td>' + v2Esc(r.am_owner || '—') + '</td>' +
      '<td class="v2-ai-cell">' + aiBtn + '</td>' +
      '<td>' + v2Esc(r.pais || '—') + '</td>' +
      '<td><span class="v2-sem v2-sem-' + v2Esc(sem) + '"></span>' + v2Esc(sem) + '</td>' +
      '<td class="num">' + hsCell + ' ' + fmtTrend(r.healthscore_delta_pp) + '</td>' +
      '<td class="num" style="' + engColor + ';font-weight:700">' + eng + ' ' + fmtTrend(r.engagement_delta_pp) + '</td>' +
      '<td>' + (r.alertas_abiertas || 0) + (r.alertas_criticas ? ' <span class="v2-pill v2-pill-rojo">' + r.alertas_criticas + '</span>' : '') + '</td>' +
      '<td class="num">' + mtd + '</td>' +
      '<td class="num">' + ytd + '</td>' +
      '<td class="num">' + ridesSemAnt + '</td>' +
      '<td class="num" ' + dSem.style + '>' + dSem.txt + '</td>' +
      '<td class="num" ' + d12.style + '>' + d12.txt + '</td>' +
      '<td class="num">' + frActual + (frVar.txt ? ' <small style="' + frVar.style + ';font-weight:600">' + frVar.txt + '</small>' : '') + '</td>' +
      '<td class="num" ' + coppMtd.style + '>' + coppMtd.txt + '</td>' +
      '<td class="num" ' + coppYtd.style + '>' + coppYtd.txt + '</td>' +
      '<td class="num">' + trMtd.txt + '</td>' +
      '<td class="num">' + trYtd.txt + '</td>' +
      '<td><div class="v2-dossier v2-editable" data-id="' + safeId + '" data-field="comentario_ejecutivo" contenteditable="true" onblur="v2SaveInline(this,\'health_check_top30\')">' + v2Esc(r.comentario_ejecutivo || '') + '</div></td>' +
      '</tr>';
  }).join('');
  v2SetHTML(body, html);
  v2RenderChurnSection();
}

async function v2LoadOpsNotes() {
  if (!v2HCSnapshotDate) return;
  try {
    const { data } = await sb.from('ops_daily_notes')
      .select('*')
      .eq('snapshot_date', v2HCSnapshotDate)
      .maybeSingle();
    if (data) {
      document.getElementById('v2OpsFallidos').value = data.pedidos_fallidos_24h || '';
      document.getElementById('v2OpsCiudades').value = data.ciudades_bajo_umbral || '';
    }
  } catch (err) { console.error('[v2 ops notes]', err); }
}

async function v2SaveOpsNotes() {
  if (!v2HCSnapshotDate) { alert('No hay snapshot vigente'); return; }
  const payload = {
    snapshot_date: v2HCSnapshotDate,
    pedidos_fallidos_24h: document.getElementById('v2OpsFallidos').value || null,
    ciudades_bajo_umbral: document.getElementById('v2OpsCiudades').value || null,
    updated_by: 'kanban-v2',
    updated_at: new Date().toISOString(),
  };
  const status = document.getElementById('v2OpsStatus');
  status.textContent = 'Guardando...';
  try {
    const { error } = await sb.from('ops_daily_notes').upsert(payload, { onConflict: 'snapshot_date' });
    if (error) throw error;
    status.textContent = 'Guardado OK';
    setTimeout(() => { status.textContent = ''; }, 2000);
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
    console.error(err);
  }
}

// ============================================================
// WATCHLIST — Top 10 fuera del Top 30 oficial
// Sync diario 8:00 AM (Picker_WatchlistSync). Lectura readonly desde el frontend.
// ============================================================

async function v2LoadWatchlist() {
  const body = document.getElementById('v2WatchlistBody');
  try {
    const { data: latest, error: e1 } = await sb.from('health_check_watchlist')
      .select('snapshot_date')
      .order('snapshot_date', { ascending: false })
      .limit(1);
    if (e1) throw e1;
    if (!latest || !latest.length) {
      v2SetHTML(body, '<tr><td colspan="12" class="v2-empty">Sin snapshot aun. El sync watchlist corre diario 8:00 AM.</td></tr>');
      document.getElementById('v2WatchlistSnapshotDate').textContent = 'Snapshot: sin datos';
      return;
    }
    v2WatchlistSnapshotDate = latest[0].snapshot_date;
    const { data, error } = await sb.from('health_check_watchlist')
      .select('*')
      .eq('snapshot_date', v2WatchlistSnapshotDate)
      .order('rank', { ascending: true });
    if (error) throw error;
    v2Watchlist = data || [];
    document.getElementById('v2WatchlistSnapshotDate').textContent = 'Snapshot: ' + v2WatchlistSnapshotDate;
    v2RenderWatchlist();
  } catch (err) {
    v2SetHTML(body, '<tr><td colspan="12" class="v2-empty">Error: ' + v2Esc(err.message) + '</td></tr>');
    console.error('[v2 watchlist]', err);
  }
}

function v2RenderWatchlist() {
  const body = document.getElementById('v2WatchlistBody');
  if (!v2Watchlist.length) {
    v2SetHTML(body, '<tr><td colspan="12" class="v2-empty">Sin candidatos esta semana.</td></tr>');
    return;
  }
  const fmtUsd = (v) => v == null ? '—' : '$' + Math.round(Number(v)).toLocaleString('en-US');
  const fmtPct = (v, decimals) => v == null ? '—' : Number(v).toFixed(decimals || 1) + '%';
  const html = v2Watchlist.map(r => {
    const aiBtn = r.preguntas_ai
      ? '<button class="v2-ai-btn" title="Ver preguntas cinicas AI" onclick="v2OpenPreguntasModal(\'watchlist\',\'' + v2Esc(r.id) + '\')">&#129302;</button>'
      : '<span class="v2-ai-btn-empty" title="Aun no generadas (proximo lunes 8:30 AM)">&#129302;</span>';
    const hsColor = r.health_score == null ? '' : (r.health_score < 6.5 ? 'color:var(--rojo)' : r.health_score < 7.5 ? 'color:var(--amarillo)' : 'color:var(--verde-500)');
    const churnColor = r.churn_risk_pct == null ? '' : (Number(r.churn_risk_pct) >= 50 ? 'color:var(--rojo);font-weight:700' : Number(r.churn_risk_pct) >= 20 ? 'color:var(--amarillo);font-weight:700' : '');
    const ownerShort = r.workspace_cs_owner_id ? v2Esc(r.workspace_cs_owner_id.substring(0, 8)) + '…' : '<span style="color:var(--rojo)">sin AM</span>';
    // Watchlist: workspace_id ES el UUID (lo guarda directamente sync_watchlist.py)
    const wsName = r.workspace_id ? v2HubLink(r.workspace_id, r.workspace_name) : v2Esc(r.workspace_name);
    const hsLabel = r.health_score == null ? '—' : Number(r.health_score).toFixed(1);
    const hsCell = r.workspace_id
      ? v2HubLink(r.workspace_id, hsLabel, hsColor + ';font-weight:700')
      : '<span style="' + hsColor + ';font-weight:700">' + hsLabel + '</span>';
    return '<tr>' +
      '<td>' + (r.rank || '—') + '</td>' +
      '<td class="v2-cliente">' + wsName + '<small>' + v2Esc(r.workspace_id || '') + '</small></td>' +
      '<td class="v2-ai-cell">' + aiBtn + '</td>' +
      '<td>' + v2Esc(r.pais || '—') + '</td>' +
      '<td class="num">' + (r.comp_mtd != null ? Number(r.comp_mtd).toLocaleString('en-US') : '—') + '</td>' +
      '<td class="num" style="font-weight:700">' + (r.proj_mtd != null ? Number(r.proj_mtd).toLocaleString('en-US') : '—') + '</td>' +
      '<td class="num">' + fmtPct(r.ff_pct, 1) + '</td>' +
      '<td class="num">' + fmtUsd(r.mrr_usd) + '</td>' +
      '<td class="num">' + hsCell + '</td>' +
      '<td class="num" style="' + churnColor + '">' + fmtPct(r.churn_risk_pct, 0) + '</td>' +
      '<td>' + v2Esc(r.last_booking_date || '—') + '</td>' +
      '<td><small style="font-family:monospace;font-size:10px">' + ownerShort + '</small></td>' +
      '</tr>';
  }).join('');
  v2SetHTML(body, html);
}

function v2ToggleWatchlist() {
  const c = document.getElementById('v2WatchlistContainer');
  const btn = document.getElementById('v2WatchlistToggle');
  if (c.style.display === 'none') { c.style.display = ''; btn.textContent = 'Ocultar'; }
  else { c.style.display = 'none'; btn.textContent = 'Mostrar'; }
}

// ============================================================
// PREGUNTAS CINICAS AI — modal con markdown render simple
// El contenido viene de Claude Haiku (generate_preguntas_ai.py).
// Aunque la fuente es controlada, escapamos cada linea con v2Esc antes de aplicar
// markdown formatting limitado (numbered lists, **bold**, *italic*).
// ============================================================

function v2RenderMarkdown(md) {
  const lines = String(md == null ? '' : md).split(/\r?\n/);
  const parts = [];
  let inList = false;
  for (const rawLine of lines) {
    const m = rawLine.match(/^\s*(\d+)\.\s+(.+)$/);
    if (m) {
      if (!inList) { parts.push('<ol style="padding-left:20px;margin:0">'); inList = true; }
      let item = v2Esc(m[2]);
      item = item.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      item = item.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
      parts.push('<li style="margin-bottom:10px">' + item + '</li>');
    } else if (rawLine.trim() === '') {
      if (inList) { parts.push('</ol>'); inList = false; }
    } else {
      if (inList) { parts.push('</ol>'); inList = false; }
      let para = v2Esc(rawLine);
      para = para.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      para = para.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
      parts.push('<p style="margin:8px 0">' + para + '</p>');
    }
  }
  if (inList) parts.push('</ol>');
  return parts.join('');
}

function v2OpenPreguntasModal(kind, rowId) {
  const collection = kind === 'top30' ? v2HealthCheck : v2Watchlist;
  const row = collection.find(r => String(r.id) === String(rowId));
  if (!row) return;
  const title = (kind === 'top30' ? 'Top 30' : 'Watchlist') + ' · ' + row.workspace_name;
  document.getElementById('v2PreguntasTitle').textContent = 'Preguntas Cinicas AI — ' + title;
  const gen = row.preguntas_ai_generated_at
    ? new Date(row.preguntas_ai_generated_at).toLocaleString('es-EC', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—';
  const meta = [];
  if (row.pais) meta.push('Pais: ' + row.pais);
  if (row.am_owner) meta.push('AM: ' + row.am_owner);
  meta.push('Generado: ' + gen);
  document.getElementById('v2PreguntasMeta').textContent = meta.join(' · ');
  const body = document.getElementById('v2PreguntasBody');
  if (!row.preguntas_ai) {
    v2SetHTML(body, '<em>Aun no se han generado preguntas para este workspace. El cron corre lunes 8:30 AM.</em>');
  } else {
    v2SetHTML(body, v2RenderMarkdown(row.preguntas_ai));
  }
  document.getElementById('v2PreguntasModal').classList.add('open');
}

function v2ClosePreguntasModal() {
  document.getElementById('v2PreguntasModal').classList.remove('open');
}

// ============================================================
// CHURN / PRE-CHURN section (debajo del Watchlist)
// Renderiza las cuentas Top 30 con churn_status != null
// ============================================================

function v2RenderChurnSection() {
  const body = document.getElementById('v2ChurnBody');
  if (!body) return;
  const churned = v2HealthCheck.filter(r => r.churn_status);
  document.getElementById('v2ChurnCount').textContent = churned.length + ' cuenta' + (churned.length === 1 ? '' : 's') + ' marcada' + (churned.length === 1 ? '' : 's');
  if (!churned.length) {
    v2SetHTML(body, '<tr><td colspan="9" class="v2-empty">Sin cuentas marcadas. Para etiquetar, edita churn_status en el modal de cada card del Top 30.</td></tr>');
    return;
  }
  const order = { pre_churn: 0, churned: 1, recovered: 2 };
  churned.sort((a, b) => (order[a.churn_status] ?? 9) - (order[b.churn_status] ?? 9));
  const fmtDate = (iso) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('es-EC', { day:'2-digit', month:'short', year:'2-digit' }); }
    catch (e) { return iso.substring(0, 10); }
  };
  const html = churned.map(r => {
    const statusLabel = { pre_churn:'Pre-churn', churned:'Churned', recovered:'Recovered' }[r.churn_status] || r.churn_status;
    const statusClass = { pre_churn:'pre', churned:'', recovered:'recovered' }[r.churn_status] || '';
    const wsName = r.workspace_uuid ? v2HubLink(r.workspace_uuid, r.workspace_name) : v2Esc(r.workspace_name);
    return '<tr>' +
      '<td>' + (r.rank || '—') + '</td>' +
      '<td class="v2-cliente">' + wsName + '</td>' +
      '<td><span class="v2-churn-badge ' + statusClass + '">' + v2Esc(statusLabel) + '</span></td>' +
      '<td><small>' + v2Esc(r.churn_status_note || '—') + '</small></td>' +
      '<td><small>' + v2Esc(fmtDate(r.churn_status_updated_at)) + '</small></td>' +
      '<td>' + v2Esc(r.am_owner || '—') + '</td>' +
      '<td class="num">' + (r.healthscore == null ? '—' : Number(r.healthscore).toFixed(1)) + '</td>' +
      '<td class="num">' + (r.engagement_score == null ? '—' : Number(r.engagement_score).toFixed(1)) + '</td>' +
      '<td class="num">' + (r.rides_mtd != null ? Number(r.rides_mtd).toLocaleString('en-US') : '—') + '</td>' +
      '</tr>';
  }).join('');
  v2SetHTML(body, html);
}

function v2ToggleChurn() {
  const c = document.getElementById('v2ChurnContainer');
  const btn = document.getElementById('v2ChurnToggle');
  if (c.style.display === 'none') { c.style.display = ''; btn.textContent = 'Ocultar'; }
  else { c.style.display = 'none'; btn.textContent = 'Mostrar'; }
}

// ============================================================
// HELPERS compartidos (Cartera / Expansion / Manualidad)
// ============================================================
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
    const dias = p.dias_sin_cliente;
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
      '<td class="l" style="color:#8a96aa">' + v2Esc(p.ultima_reunion_cliente || '—') + '</td>' +
      '<td><span class="dias ' + v2cSem(dias) + '">' + (dias == null ? '—' : dias) + '</span></td>' +
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
  const crecR = T.rp - T.rj, metaR = 2500, pR = crecR / metaR * 100, okR = crecR >= metaR;
  set('v2cObjRidesVal', (crecR >= 0 ? '+' : '−') + v2Num(Math.abs(crecR)) + ' <small>/ +' + v2Num(metaR) + ' rides</small>');
  setBar('v2cObjRidesBar', pR, okR);
  set('v2cObjRidesSub', okR
    ? '<span style="color:#1b7a2e">✓ CUMPLE (' + pR.toFixed(0) + '%)</span>'
    : '<span style="color:#a9760a">' + pR.toFixed(0) + '% · faltan ' + v2Num(metaR - crecR) + ' rides</span>');
  const nuevoRev = T.vp - T.vj, metaV = 180000, pV = nuevoRev / metaV * 100, okV = nuevoRev >= metaV;
  set('v2cObjRevVal', (nuevoRev >= 0 ? '+' : '−') + '$' + v2Num(Math.abs(Math.round(nuevoRev))) + ' <small>/ +$' + v2Num(metaV) + ' nuevos</small>');
  setBar('v2cObjRevBar', pV, okV);
  set('v2cObjRevSub', okV
    ? '<span style="color:#1b7a2e">✓ CUMPLE</span>'
    : '<span style="color:#c0392b">' + pV.toFixed(0) + '% · faltan $' + v2Num(Math.round(metaV - nuevoRev)) + '</span> <span style="color:#8a96aa;font-weight:600">· base jun $' + v2Num(Math.round(T.vj)) + '</span>');

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
    v2RenderExpansion();
  } catch (err) {
    v2SetHTML(body, '<tr><td colspan="15" class="v2-empty">Error: ' + v2Esc(err.message) + '</td></tr>');
    console.error('[v2 expansion]', err);
  }
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
  return '<div class="v2e-item ' + (a.tipo === 'bloqueo' ? 'is-bloqueo' : 'is-accion') +
      (est === 'resuelto' ? ' is-resuelto' : '') + '" data-id="' + a.id + '">' +
    '<div class="v2e-item-top">' + selTipo +
      '<span class="v2e-item-txt">' + fld('texto', a.tipo === 'bloqueo' ? 'Qué está frenando…' : 'Qué vamos a hacer…', a.texto) + '</span>' +
    '</div>' +
    '<div class="v2e-item-bot">' +
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

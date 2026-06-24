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
let v2Manualidad = [];
let v2ManualidadSnapshotDate = null;
let v2Loaded = { rollouts: false, hc: false, cartera: false, expansion: false, manualidad: false };

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
async function v2LoadCartera() {
  const body = document.getElementById('v2CarteraBody');
  try {
    const { data: latest, error: e1 } = await sb.from('cartera_2500')
      .select('snapshot_date').order('snapshot_date', { ascending: false }).limit(1);
    if (e1) throw e1;
    if (!latest || !latest.length) {
      v2SetHTML(body, '<tr><td colspan="10" class="v2-empty">Sin snapshot aun. El sync <code>cartera_2500</code> corre diario 7:47 AM.</td></tr>');
      document.getElementById('v2CarteraSnapshotDate').textContent = 'Snapshot: sin datos';
      v2Loaded.cartera = true; return;
    }
    v2CarteraSnapshotDate = latest[0].snapshot_date;
    const { data, error } = await sb.from('cartera_2500')
      .select('*').eq('snapshot_date', v2CarteraSnapshotDate).order('rank', { ascending: true });
    if (error) throw error;
    v2Cartera = data || [];
    v2Loaded.cartera = true;
    const corte = v2Cartera[0] && v2Cartera[0].corte_date ? ' · corte ' + v2Cartera[0].corte_date : '';
    document.getElementById('v2CarteraSnapshotDate').textContent = 'Snapshot: ' + v2CarteraSnapshotDate + corte;
    v2RenderCartera();
  } catch (err) {
    v2SetHTML(body, '<tr><td colspan="10" class="v2-empty">Error: ' + v2Esc(err.message) + '</td></tr>');
    console.error('[v2 cartera]', err);
  }
}

function v2RenderCartera() {
  const body = document.getElementById('v2CarteraBody');
  if (!v2Cartera.length) { v2SetHTML(body, '<tr><td colspan="10" class="v2-empty">Sin cuentas.</td></tr>'); return; }
  const totMayo = v2Cartera.reduce((a, r) => a + (r.mes_ant || 0), 0);
  const totProy = v2Cartera.reduce((a, r) => a + (r.proy_lenta || 0), 0);
  const totProy7 = v2Cartera.reduce((a, r) => a + (r.proy_rapida || 0), 0);
  const crec = totProy - totMayo;
  const gap = crec - 2500;
  const var7 = totProy7 - totProy;
  document.getElementById('v2CarteraMayo').textContent = totMayo.toLocaleString('en-US');
  document.getElementById('v2CarteraProy').textContent = totProy.toLocaleString('en-US');
  document.getElementById('v2CarteraProySub').textContent = (var7 >= 0 ? '▲ +' : '▼ −') + Math.abs(var7).toLocaleString('en-US') + ' a ritmo 7d';
  document.getElementById('v2CarteraCrec').textContent = (crec >= 0 ? '+' : '−') + Math.abs(crec).toLocaleString('en-US');
  document.getElementById('v2CarteraGap').textContent = (gap >= 0 ? 'CUMPLE +' : 'FALTA −') + Math.abs(gap).toLocaleString('en-US');
  const gapKpi = document.getElementById('v2CarteraGapKpi');
  if (gapKpi) gapKpi.className = 'v2-kpi ' + (gap >= 0 ? '' : 'warn');
  const html = v2Cartera.map(r => {
    const dist = (r.techo_envios != null && r.mes_ant != null) ? (r.techo_envios - r.mes_ant) : null;
    const distCell = r.techo_envios == null
      ? '<span style="color:var(--rojo)">&mdash;</span><small style="display:block;font-size:10px;color:var(--neutral-800)">sin techo</small>'
      : '<span style="font-weight:700;color:var(--azul-oscuro-900)">' + v2Num(dist) + '</span><small style="display:block;font-size:10px;color:var(--neutral-800)">techo ' + v2Num(r.techo_envios) + '</small>';
    const d = v2DeltaCell(r.delta);
    const pct = r.delta_pct == null ? '&mdash;' : '<span ' + d.cls + '>' + (r.delta_pct >= 0 ? '+' : '−') + Math.abs(Math.round(r.delta_pct * 100)) + '%</span>';
    return '<tr>' +
      '<td>' + (r.rank || '—') + '</td>' +
      '<td class="v2-cliente">' + v2Esc(r.cliente) + ' <small>' + v2Esc(r.am_owner || '') + '</small></td>' +
      '<td>' + v2Esc(r.pais || '—') + '</td>' +
      '<td class="num">' + distCell + '</td>' +
      '<td class="num">' + v2Num(r.mes_ant) + '</td>' +
      '<td class="num">' + v2Num(r.mtd) + '</td>' +
      '<td class="num">' + v2ProyCell(r.proy_lenta, r.proy_rapida) + '</td>' +
      '<td class="num" ' + d.cls + '>' + d.txt + '</td>' +
      '<td class="num">' + pct + '</td>' +
      '<td>' + v2TendPill(r.delta) + '</td>' +
      '</tr>';
  }).join('');
  v2SetHTML(body, html);
}

// ============================================================
// EXPANSION TOP 40
// ============================================================
async function v2LoadExpansion() {
  const body = document.getElementById('v2ExpansionBody');
  try {
    const { data: latest, error: e1 } = await sb.from('expansion_top40')
      .select('snapshot_date').order('snapshot_date', { ascending: false }).limit(1);
    if (e1) throw e1;
    if (!latest || !latest.length) {
      v2SetHTML(body, '<tr><td colspan="8" class="v2-empty">Sin snapshot aun. El sync <code>expansion_top40</code> corre diario 7:48 AM.</td></tr>');
      document.getElementById('v2ExpansionSnapshotDate').textContent = 'Snapshot: sin datos';
      v2Loaded.expansion = true; return;
    }
    v2ExpansionSnapshotDate = latest[0].snapshot_date;
    const { data, error } = await sb.from('expansion_top40')
      .select('*').eq('snapshot_date', v2ExpansionSnapshotDate).order('rank', { ascending: true });
    if (error) throw error;
    v2Expansion = data || [];
    v2Loaded.expansion = true;
    const corte = v2Expansion[0] && v2Expansion[0].corte_date ? ' · corte ' + v2Expansion[0].corte_date : '';
    document.getElementById('v2ExpansionSnapshotDate').textContent = 'Snapshot: ' + v2ExpansionSnapshotDate + corte;
    v2RenderExpansion();
  } catch (err) {
    v2SetHTML(body, '<tr><td colspan="8" class="v2-empty">Error: ' + v2Esc(err.message) + '</td></tr>');
    console.error('[v2 expansion]', err);
  }
}

function v2RenderExpansion() {
  const body = document.getElementById('v2ExpansionBody');
  if (!v2Expansion.length) { v2SetHTML(body, '<tr><td colspan="8" class="v2-empty">Sin cuentas.</td></tr>'); return; }
  const totMayo = v2Expansion.reduce((a, r) => a + (r.mes_ant || 0), 0);
  const totProy = v2Expansion.reduce((a, r) => a + (r.proy_lenta || 0), 0);
  const totProy7 = v2Expansion.reduce((a, r) => a + (r.proy_rapida || 0), 0);
  const neto = totProy - totMayo;
  const var7 = totProy7 - totProy;
  const nUp = v2Expansion.filter(r => (r.delta || 0) > 0).length;
  const nDown = v2Expansion.filter(r => (r.delta || 0) < 0).length;
  document.getElementById('v2ExpMayo').textContent = totMayo.toLocaleString('en-US');
  document.getElementById('v2ExpProy').textContent = totProy.toLocaleString('en-US');
  document.getElementById('v2ExpProySub').textContent = (var7 >= 0 ? '▲ +' : '▼ −') + Math.abs(var7).toLocaleString('en-US') + ' a ritmo 7d';
  const netoEl = document.getElementById('v2ExpNeto');
  netoEl.textContent = (neto >= 0 ? '+' : '−') + Math.abs(neto).toLocaleString('en-US');
  netoEl.style.color = neto >= 0 ? 'var(--verde-500)' : 'var(--rojo)';
  const pctNeto = totMayo ? (neto / totMayo * 100) : 0;
  document.getElementById('v2ExpNetoSub').textContent = (pctNeto >= 0 ? '+' : '−') + Math.abs(pctNeto).toFixed(1) + '% vs mes ant';
  document.getElementById('v2ExpSplit').textContent = nUp + ' / ' + nDown;
  const html = v2Expansion.map(r => {
    const neg = (r.delta || 0) < 0;
    const d = v2DeltaCell(r.delta);
    const pct = r.delta_pct == null ? '&mdash;' : '<span ' + d.cls + '>' + (r.delta_pct >= 0 ? '+' : '−') + Math.abs(Math.round(r.delta_pct * 100)) + '%</span>';
    const region = r.region ? ' <small>' + v2Esc(r.region) + '</small>' : '';
    return '<tr' + (neg ? ' style="background:#fdf6f5"' : '') + '>' +
      '<td>' + (r.rank || '—') + '</td>' +
      '<td class="v2-cliente">' + v2Esc(r.workspace_name) + region + '</td>' +
      '<td class="num">' + v2Num(r.mes_ant) + '</td>' +
      '<td class="num">' + v2Num(r.mtd) + '</td>' +
      '<td class="num">' + v2ProyCell(r.proy_lenta, r.proy_rapida) + '</td>' +
      '<td class="num" ' + d.cls + '>' + d.txt + '</td>' +
      '<td class="num">' + pct + '</td>' +
      '<td>' + v2TendPill(r.delta) + '</td>' +
      '</tr>';
  }).join('');
  v2SetHTML(body, html);
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
    v2Manualidad = data || [];
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

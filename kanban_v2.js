// ============================================================================
// Kanban v2 — Tabs + Rollouts + Health Check Top 30
// Usa el cliente `sb` (window.supabase) ya inicializado en index_v2.html
// Usa insertAdjacentHTML sobre strings escapados via v2Esc() para renderizar.
// ============================================================================

let v2Rollouts = [];
let v2HealthCheck = [];
let v2HCSnapshotDate = null;
let v2Loaded = { rollouts: false, hc: false };

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
  if (tab === 'healthcheck' && !v2Loaded.hc) v2LoadHealthCheck();
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
    v2SetHTML(body, '<tr><td colspan="14" class="v2-empty">Sin rollouts con esos filtros.</td></tr>');
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
    const list = table === 'rollouts' ? v2Rollouts : v2HealthCheck;
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
        '<tr><td colspan="14" class="v2-empty">No hay snapshot aun. El sync <code>health_check_top30</code> todavia no corrio.<br>Cuando este listo, aqui aparecera el Top 30 del NDR + healthscore de Supabase.</td></tr>');
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
      '<tr><td colspan="14" class="v2-empty">Error: ' + v2Esc(err.message) + '</td></tr>');
    console.error('[v2 hc]', err);
  }
}

function v2RenderHealthCheck() {
  const fAM = document.getElementById('v2FilterHCAM').value;
  const fSem = document.getElementById('v2FilterHCSem').value;
  const rows = v2HealthCheck.filter(r => (!fAM || r.am_owner === fAM) && (!fSem || r.semaforo === fSem));

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
    v2SetHTML(body, '<tr><td colspan="14" class="v2-empty">Sin resultados con esos filtros.</td></tr>');
    return;
  }
  // Actualizar headers con numero de semana ISO (lo toma del primer row con data)
  const sample = v2HealthCheck.find(r => r.semana_ant_num != null || r.semana_actual_num != null);
  if (sample) {
    const setHeader = (id, label, wk) => {
      const el = document.getElementById(id);
      if (!el || wk == null) return;
      el.textContent = label + ' ';
      const small = document.createElement('small');
      small.style.cssText = 'font-weight:400;text-transform:none';
      small.textContent = '(W' + wk + ')';
      el.appendChild(small);
    };
    setHeader('v2HCRidesSemAntHeader', 'Rides sem ant', sample.semana_ant_num);
    setHeader('v2HCFrActualHeader', '%FR sem actual', sample.semana_actual_num);
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
  const html = rows.map(r => {
    const mtd = r.rides_mtd != null ? Number(r.rides_mtd).toLocaleString('en-US') : '—';
    const ytd = r.rides_ytd != null ? Number(r.rides_ytd).toLocaleString('en-US') : '—';
    const dSem = fmtDelta(r.delta_semana_ant_pct);
    const d12 = fmtDelta(r.delta_12sem_pct);
    const ridesSemAnt = r.rides_sem_ant != null ? Number(r.rides_sem_ant).toLocaleString('en-US') : '—';
    const frActual = r.fr_sem_actual_pct != null ? Number(r.fr_sem_actual_pct).toFixed(1) + '%' : '—';
    const frVar = fmtFrVar(r.fr_variation_pp);
    const hs = r.healthscore == null ? '—' : Number(r.healthscore).toFixed(1);
    const hsColor = r.healthscore == null ? '' : (r.healthscore < 6.5 ? 'color:var(--rojo)' : r.healthscore < 7.5 ? 'color:var(--amarillo)' : 'color:var(--verde-500)');
    const safeId = v2Esc(r.id);
    const sem = r.semaforo || 'verde';
    return '<tr>' +
      '<td>' + (r.rank || '—') + '</td>' +
      '<td class="v2-cliente">' + v2Esc(r.workspace_name) + '<small>' + v2Esc(r.workspace_id || '') + '</small></td>' +
      '<td>' + v2Esc(r.am_owner || '—') + '</td>' +
      '<td>' + v2Esc(r.pais || '—') + '</td>' +
      '<td><span class="v2-sem v2-sem-' + v2Esc(sem) + '"></span>' + v2Esc(sem) + '</td>' +
      '<td class="num" style="' + hsColor + ';font-weight:700">' + hs + '</td>' +
      '<td>' + (r.alertas_abiertas || 0) + (r.alertas_criticas ? ' <span class="v2-pill v2-pill-rojo">' + r.alertas_criticas + '</span>' : '') + '</td>' +
      '<td class="num">' + mtd + '</td>' +
      '<td class="num">' + ytd + '</td>' +
      '<td class="num">' + ridesSemAnt + '</td>' +
      '<td class="num" ' + dSem.style + '>' + dSem.txt + '</td>' +
      '<td class="num" ' + d12.style + '>' + d12.txt + '</td>' +
      '<td class="num">' + frActual + (frVar.txt ? ' <small style="' + frVar.style + ';font-weight:600">' + frVar.txt + '</small>' : '') + '</td>' +
      '<td><div class="v2-dossier v2-editable" data-id="' + safeId + '" data-field="comentario_ejecutivo" contenteditable="true" onblur="v2SaveInline(this,\'health_check_top30\')">' + v2Esc(r.comentario_ejecutivo || '') + '</div></td>' +
      '</tr>';
  }).join('');
  v2SetHTML(body, html);
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

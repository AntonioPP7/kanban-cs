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
    v2SetHTML(body, '<tr><td colspan="12" class="v2-empty">Sin rollouts con esos filtros.</td></tr>');
    return;
  }
  const html = rows.map(r => {
    const loc = [r.locales_totales, r.locales_piloto].filter(x => x != null).join(' / ') || '&mdash;';
    const envios = r.envios_mes_target ? r.envios_mes_target.toLocaleString('en-US') : '&mdash;';
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
      '<td class="num">' + envios + '</td>' +
      '<td>' + loc + '</td>' +
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
        '<tr><td colspan="11" class="v2-empty">No hay snapshot aun. El sync <code>health_check_top30</code> todavia no corrio.<br>Cuando este listo, aqui aparecera el Top 30 del NDR + healthscore de Supabase.</td></tr>');
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
      '<tr><td colspan="11" class="v2-empty">Error: ' + v2Esc(err.message) + '</td></tr>');
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
    v2SetHTML(body, '<tr><td colspan="11" class="v2-empty">Sin resultados con esos filtros.</td></tr>');
    return;
  }
  const html = rows.map(r => {
    const delta = r.delta_volumen_pct;
    const deltaStyle = delta == null ? '' : (delta > 0 ? 'style="color:var(--verde-500)"' : (delta < -10 ? 'style="color:var(--rojo)"' : ''));
    const deltaTxt = delta == null ? '—' : (delta > 0 ? '+' : '') + Number(delta).toFixed(0) + '%';
    const hs = r.healthscore == null ? '—' : Number(r.healthscore).toFixed(1);
    const hsColor = r.healthscore == null ? '' : (r.healthscore < 6.5 ? 'color:var(--rojo)' : r.healthscore < 7.5 ? 'color:var(--amarillo)' : 'color:var(--verde-500)');
    const safeId = v2Esc(r.id);
    const sem = r.semaforo || 'verde';
    return '<tr>' +
      '<td>' + (r.rank || '—') + '</td>' +
      '<td class="v2-cliente">' + v2Esc(r.workspace_name) + '<small>' + v2Esc(r.workspace_id || '') + '</small></td>' +
      '<td>' + v2Esc(r.am_owner || '—') + '</td>' +
      '<td>' + v2Esc(r.pais || '—') + '</td>' +
      '<td class="num">$' + Math.round(r.rev_q_usd || 0).toLocaleString('en-US') + '</td>' +
      '<td class="num">' + (r.rides_q || 0).toLocaleString('en-US') + '</td>' +
      '<td class="num" ' + deltaStyle + '>' + deltaTxt + '</td>' +
      '<td class="num" style="' + hsColor + ';font-weight:700">' + hs + '</td>' +
      '<td>' + (r.alertas_abiertas || 0) + (r.alertas_criticas ? ' <span class="v2-pill v2-pill-rojo">' + r.alertas_criticas + '</span>' : '') + '</td>' +
      '<td><div class="v2-dossier v2-editable" data-id="' + safeId + '" data-field="comentario_ejecutivo" contenteditable="true" onblur="v2SaveInline(this,\'health_check_top30\')">' + v2Esc(r.comentario_ejecutivo || '') + '</div></td>' +
      '<td><span class="v2-sem v2-sem-' + v2Esc(sem) + '"></span>' + v2Esc(sem) + '</td>' +
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

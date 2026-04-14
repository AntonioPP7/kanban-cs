-- ============================================================
-- Kanban CS v2 — Rollouts + Health Check + Ops Notes
-- Fecha: 2026-04-13
-- Cambios vs v1:
--   * rollouts.am_owner: solo JX / Carlos (sin Stephanie)
--   * rollouts: columnas extra del CSV enterprise (ventas, envios, locales, contrato, urls)
--   * sin columna segment (todas las filas son enterprise por definicion)
--   * health_check_top20 alimentado por NDR Anexo A + Supabase (healthscore)
-- ============================================================

-- ============================================================
-- 1. ROLLOUTS — control manual de clientes en arranque (>=1,500 envios/mes)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rollouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente text NOT NULL,
  workspace_id text,
  am_owner text NOT NULL CHECK (am_owner IN ('Juan Xavier','Carlos')),
  ventas_owner text,                   -- Ricardo / JD / Antonio
  pais text,
  envios_mes_target integer,           -- volumen comprometido (envios/mes)
  locales_totales integer,
  locales_piloto integer,
  mes_arranque text,                   -- 'Enero' / 'Febrero' / 'TBD'
  fecha_target_primer_pedido date,
  status_integracion text CHECK (status_integracion IN ('api','flota','tarifario','listo','bloqueado','piloto','seguimiento','comercial','arrancado')),
  status_contrato text CHECK (status_contrato IN ('firmado','pendiente','por_firmar')),
  semaforo text NOT NULL DEFAULT 'verde' CHECK (semaforo IN ('verde','amarillo','rojo')),
  dossier_ejecutivo text,
  bloqueo_actual text,
  hubspot_url text,
  alongside_url text,
  archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rollouts_am ON public.rollouts(am_owner) WHERE archived = false;
CREATE INDEX IF NOT EXISTS idx_rollouts_semaforo ON public.rollouts(semaforo) WHERE archived = false;
CREATE INDEX IF NOT EXISTS idx_rollouts_envios ON public.rollouts(envios_mes_target DESC) WHERE archived = false;

DROP TRIGGER IF EXISTS trg_rollouts_updated_at ON public.rollouts;
CREATE TRIGGER trg_rollouts_updated_at
  BEFORE UPDATE ON public.rollouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.rollouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rollouts_select_all" ON public.rollouts FOR SELECT USING (true);
CREATE POLICY "rollouts_insert_anon" ON public.rollouts FOR INSERT WITH CHECK (true);
CREATE POLICY "rollouts_update_anon" ON public.rollouts FOR UPDATE USING (true);
CREATE POLICY "rollouts_delete_anon" ON public.rollouts FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.rollouts;


-- ============================================================
-- 2. HEALTH CHECK TOP 30 — snapshot diario
--    Fuentes: NDR Anexo A (rev, rides, GP, AM) + Supabase DW (healthscore, alertas)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.health_check_top30 (
  id serial PRIMARY KEY,
  snapshot_date date NOT NULL,
  rank integer,
  workspace_id text NOT NULL,
  workspace_name text NOT NULL,
  am_owner text,
  pais text,
  rev_q_usd numeric,                  -- Total Rev del trimestre vigente (NDR)
  rides_q integer,                     -- Rides del trimestre vigente (NDR)
  gp_q_usd numeric,
  healthscore numeric,                 -- desde Supabase DW
  alertas_abiertas integer DEFAULT 0,
  alertas_criticas integer DEFAULT 0,
  alertas_cerradas_24h integer DEFAULT 0,
  alerta_mas_antigua_horas integer,
  delta_volumen_pct numeric,           -- Delta % Q actual vs Q anterior (NDR)
  categoria_ndr text,                  -- Expansion / Contraccion / Nuevo / Churn
  semaforo text CHECK (semaforo IN ('verde','amarillo','rojo')),
  comentario_ejecutivo text,
  ops_notas text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (snapshot_date, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_hc30_snapshot ON public.health_check_top30(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_hc30_am ON public.health_check_top30(am_owner);
CREATE INDEX IF NOT EXISTS idx_hc30_rank ON public.health_check_top30(snapshot_date DESC, rank);

DROP TRIGGER IF EXISTS trg_hc30_updated_at ON public.health_check_top30;
CREATE TRIGGER trg_hc30_updated_at
  BEFORE UPDATE ON public.health_check_top30
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.health_check_top30 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hc30_select_all" ON public.health_check_top30 FOR SELECT USING (true);
-- UI solo actualiza comentario_ejecutivo y ops_notas via anon. Sync usa service_role.
CREATE POLICY "hc30_update_comments_anon" ON public.health_check_top30
  FOR UPDATE USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.health_check_top30;


-- ============================================================
-- 3. OPS DAILY NOTES — bloque operativo global (1 registro por dia)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ops_daily_notes (
  snapshot_date date PRIMARY KEY,
  pedidos_fallidos_24h text,
  ciudades_bajo_umbral text,
  updated_by text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.ops_daily_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops_select_all" ON public.ops_daily_notes FOR SELECT USING (true);
CREATE POLICY "ops_upsert_anon" ON public.ops_daily_notes FOR INSERT WITH CHECK (true);
CREATE POLICY "ops_update_anon" ON public.ops_daily_notes FOR UPDATE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.ops_daily_notes;


-- ============================================================
-- 4. SEED rollouts (10 cuentas >=1,500 envios/mes + Justo Chile)
--    Fuente: data/2026_proximas_activaciones_enterprise.csv + NDR (Justo Chile)
-- ============================================================
INSERT INTO public.rollouts
  (cliente, am_owner, ventas_owner, pais, envios_mes_target, locales_totales, locales_piloto,
   mes_arranque, status_integracion, status_contrato, semaforo, dossier_ejecutivo, bloqueo_actual,
   hubspot_url, alongside_url)
VALUES
  ('Pasteur', 'Carlos', 'JD', 'Colombia', 50000, NULL, NULL,
   'TBD', 'comercial', 'pendiente', 'rojo',
   'En alineacion. Volumen mas alto del pipeline (50K envios/mes). Revisar handoff formal a CS.',
   'Alineacion comercial', NULL, NULL),

  ('YZA', 'Juan Xavier', 'JD', 'Mexico', 20000, 90, NULL,
   'Marzo', 'piloto', 'firmado', 'amarillo',
   'En piloto. 90 locales totales. Monitorear resultados primeras semanas.',
   NULL,
   'https://app.hubspot.com/contacts/21333981/record/0-3/43743348282/',
   'https://app.alongspace.com/HNwubmgbNVDbMe8cpIs7/yajp3fuX8Bc6Qp5AuATf/overview'),

  ('Grupo CBC', 'Carlos', 'Ricardo', 'Colombia', 15000, 35, NULL,
   'Febrero', 'seguimiento', 'pendiente', 'amarillo',
   'En seguimiento. 35 locales totales, piloto TBD. Contrato pendiente.',
   'Contrato pendiente',
   'https://app.hubspot.com/contacts/21333981/record/0-3/22487694262/',
   'https://app.alongspace.com/v/HNwubmgbNVDbMe8cpIs7/mxiMYfjKiQjT0W9WLhCh/overview'),

  ('Super Salads (Grupo Alimentarium)', 'Carlos', 'JD', 'Mexico', 8000, NULL, NULL,
   'Febrero', 'bloqueado', 'pendiente', 'rojo',
   'Bloqueado por integracion. Piloto WS13046 con $0 revenue Q1. Carlos trabajando con Tech.',
   'Integracion bloqueada',
   'https://app.hubspot.com/contacts/21333981/record/0-3/44865980261/',
   'https://app.alongspace.com/HNwubmgbNVDbMe8cpIs7/v3RTRaeBtJP2KEYGZ9th/overview'),

  ('CEBA', 'Juan Xavier', 'Ricardo', 'Colombia', 7000, 23, 23,
   'Febrero', 'arrancado', 'firmado', 'verde',
   'Rollout completo (23/23 locales). Q1 rev $14,798. JX supervisa directo.', NULL,
   'https://app.hubspot.com/contacts/21333981/record/0-3/52901275426/',
   'https://app.alongspace.com/v/HNwubmgbNVDbMe8cpIs7/sgUz3fioBk37MOXzQGAl/overview'),

  ('Farmaenlace', 'Juan Xavier', 'JD', 'Ecuador', 6000, 1300, 100,
   'TBD', 'listo', 'firmado', 'amarillo',
   'Firmado por arrancar piloto. 1,300 locales totales, 100 en piloto. Cuenta farmacia grande.',
   'Fecha arranque TBD', NULL, NULL),

  ('Pizza Hut', 'Carlos', 'Ricardo', 'Colombia', 6000, 26, 7,
   'Enero', 'arrancado', 'firmado', 'verde',
   'Firmado y arrancado. 7 locales piloto de 26. Desbloquea Jenos Pizza (+1K envios hibrido).',
   NULL,
   'https://app.hubspot.com/contacts/21333981/record/0-3/51020295329/',
   'https://app.alongspace.com/HNwubmgbNVDbMe8cpIs7/9avEjWWTSO0sxNexdPXT/overview'),

  ('Tacos Keyon', 'Carlos', 'Ricardo', 'Mexico', 3600, 18, NULL,
   'N/A', 'arrancado', 'firmado', 'verde',
   'Firmado y arrancado. 18 locales. Sin bloqueos reportados.', NULL,
   'https://app.hubspot.com/contacts/21333981/record/0-3/57396961145/',
   'https://app.alongspace.com/v/HNwubmgbNVDbMe8cpIs7/jHG4uzRQKGiI0t8f9fFz/overview'),

  ('Justo Chile', 'Juan Xavier', NULL, 'Chile', 1831, NULL, NULL,
   'Enero', 'arrancado', 'firmado', 'verde',
   'Operando desde ene 2026. Q1 rev $5,493. ~1,831 rides/mes. Portafolio CS expansion Justo LATAM.',
   NULL, NULL, NULL),

  ('Circle K', 'Juan Xavier', 'Ricardo', 'Mexico', 1500, 495, NULL,
   'TBD', 'seguimiento', 'pendiente', 'amarillo',
   'En seguimiento. 495 locales potenciales. Contrato pendiente. Borderline volumen (1.5K envios).',
   'Contrato pendiente',
   'https://app.hubspot.com/contacts/21333981/record/0-3/43662813469/',
   'https://circlek-presentation.vercel.app/')
ON CONFLICT DO NOTHING;

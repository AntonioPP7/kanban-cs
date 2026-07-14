-- migration_16_expansion_am_health.sql
-- Kanban CS v2 — pestana Expansion Top 40
-- Agrega AM owner, health check, engagement y alertas rojas para poder filtrar
-- por AM (incluyendo cuentas sin AM asignado) y ver salud junto al crecimiento.
--
-- Fuentes (pobladas por automations/kanban-cs-sync/sync_expansion_top40.py):
--   am_owner          -> public.workspaces.cs_owner_id (Hub) -> auth.users.email -> nombre
--   engagement_score  -> public.workspaces.latest_engagement (Hub)
--   workspace_uuid    -> public.workspaces.id (deep-link al Hub)
--   healthscore       -> gold.v_workspace_health (ultimo period_end, mismo criterio que Health Check)
--   semaforo          -> verde >= 8.8 | amarillo 7.0-8.8 | rojo < 7.0 o sin data
--   alertas_criticas  -> gold.workspace_alerts severity='critical' AND status IN ('active','in_progress')

ALTER TABLE public.expansion_top40
  ADD COLUMN IF NOT EXISTS am_owner         text,
  ADD COLUMN IF NOT EXISTS workspace_uuid   text,
  ADD COLUMN IF NOT EXISTS healthscore      numeric,
  ADD COLUMN IF NOT EXISTS semaforo         text,
  ADD COLUMN IF NOT EXISTS engagement_score numeric,
  ADD COLUMN IF NOT EXISTS alertas_criticas integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_expansion_top40_am
  ON public.expansion_top40 (snapshot_date, am_owner);

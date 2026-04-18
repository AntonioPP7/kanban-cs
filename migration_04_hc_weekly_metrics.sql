-- ============================================================
-- Migration 04: Metricas semanales en Health Check Top 30
--   - rides_sem_ant:      completed rides semana anterior (lun-dom)
--   - fr_sem_actual_pct:  fulfillment rate semana en curso (WTD)
--   - fr_sem_ant_pct:     fulfillment rate semana anterior
--   - fr_variation_pp:    variacion en puntos porcentuales (actual - anterior)
--   - semana_actual_num:  numero de semana ISO actual (ej 16)
--   - semana_ant_num:     numero de semana ISO anterior (ej 15)
-- ============================================================

ALTER TABLE public.health_check_top30
  ADD COLUMN IF NOT EXISTS rides_sem_ant integer,
  ADD COLUMN IF NOT EXISTS fr_sem_actual_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS fr_sem_ant_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS fr_variation_pp numeric(5,2),
  ADD COLUMN IF NOT EXISTS semana_actual_num integer,
  ADD COLUMN IF NOT EXISTS semana_ant_num integer;

COMMENT ON COLUMN public.health_check_top30.rides_sem_ant IS 'Completed rides semana anterior cerrada (lun-dom ISO)';
COMMENT ON COLUMN public.health_check_top30.fr_sem_actual_pct IS 'Fulfillment rate semana en curso WTD (completed / total bookings)';
COMMENT ON COLUMN public.health_check_top30.fr_sem_ant_pct IS 'Fulfillment rate semana anterior cerrada (completed / total bookings)';
COMMENT ON COLUMN public.health_check_top30.fr_variation_pp IS 'Variacion de FR en puntos porcentuales: fr_sem_actual_pct - fr_sem_ant_pct';
COMMENT ON COLUMN public.health_check_top30.semana_actual_num IS 'Numero de semana ISO actual (1-53)';
COMMENT ON COLUMN public.health_check_top30.semana_ant_num IS 'Numero de semana ISO anterior (1-53)';

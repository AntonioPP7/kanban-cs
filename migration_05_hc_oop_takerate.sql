-- Migration 05: agregar costo de oportunidad y take rate al Health Check Top 30
-- Fecha: 2026-04-20
-- Fuente de datos: cfo.base_maestra_mat (schema canonico de Armando/CFO)
--
-- Costo Opp = SUM(costo_cancelacion + costo_retorno + costo_wt) / revenue_usd
--             Penalidades operativas que Picker absorbe como % del billing total
-- Take Rate = SUM(revenue_usd) / SUM(orden_usd)
--             % del valor del pedido que Picker captura como revenue

ALTER TABLE public.health_check_top30
  ADD COLUMN IF NOT EXISTS costo_opp_mtd_pct numeric,
  ADD COLUMN IF NOT EXISTS costo_opp_ytd_pct numeric,
  ADD COLUMN IF NOT EXISTS take_rate_mtd_pct numeric,
  ADD COLUMN IF NOT EXISTS take_rate_ytd_pct numeric,
  ADD COLUMN IF NOT EXISTS orden_coverage_mtd_pct numeric,
  ADD COLUMN IF NOT EXISTS orden_coverage_ytd_pct numeric;

COMMENT ON COLUMN public.health_check_top30.costo_opp_mtd_pct IS '% penalidades absorbidas (cancel+retorno+wt) / revenue_usd MTD. Fuente: cfo.base_maestra_mat';
COMMENT ON COLUMN public.health_check_top30.costo_opp_ytd_pct IS '% penalidades absorbidas (cancel+retorno+wt) / revenue_usd YTD. Fuente: cfo.base_maestra_mat';
COMMENT ON COLUMN public.health_check_top30.take_rate_mtd_pct IS '% take rate MTD: SUM(revenue_usd) / SUM(orden_usd). NULL si cobertura de orden <20%';
COMMENT ON COLUMN public.health_check_top30.take_rate_ytd_pct IS '% take rate YTD: SUM(revenue_usd) / SUM(orden_usd). NULL si cobertura de orden <20%';
COMMENT ON COLUMN public.health_check_top30.orden_coverage_mtd_pct IS 'Cobertura de orden_amount MTD: % bookings con orden>0. Umbral <20% -> take_rate NULL';
COMMENT ON COLUMN public.health_check_top30.orden_coverage_ytd_pct IS 'Cobertura de orden_amount YTD: % bookings con orden>0. Umbral <20% -> take_rate NULL';

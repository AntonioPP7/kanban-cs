-- ============================================================
-- Migration 02: policy INSERT anon en health_check_top30
-- Permite al script sync upsertear con la anon key (sin service_role)
-- Alineado con el patron de rollouts (anon full access)
-- ============================================================

DROP POLICY IF EXISTS "hc30_insert_anon" ON public.health_check_top30;
CREATE POLICY "hc30_insert_anon" ON public.health_check_top30
  FOR INSERT WITH CHECK (true);

-- Nota: la policy hc30_update_comments_anon ya existe y permite UPDATE sobre
-- cualquier campo. Con la INSERT policy el upsert es totalmente funcional.

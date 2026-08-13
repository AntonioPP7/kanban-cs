-- migration_22_workspace_objetivos.sql
-- Objetivo de negocio del cliente con Picker (que quiere conseguir el cliente).
-- Tabla COMPARTIDA por las pestanas Cartera 2500 y Retencion/Expansion del Kanban v2,
-- keyed por workspace_id (formato WSxxxxx, el mismo de cartera_2500 y expansion_top40).
-- Vive APARTE de esas tablas a proposito: son snapshots que los syncs diarios
-- reescriben y pisarian el texto del AM. Aca nadie escribe salvo el AM (y el seed inicial).

CREATE TABLE IF NOT EXISTS public.workspace_objetivos (
  workspace_id text PRIMARY KEY,       -- workspace_number_id (como texto, ej. WS13637)
  objetivo     text,
  updated_by   text,
  updated_at   timestamptz DEFAULT now(),
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE public.workspace_objetivos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wsobj_select_all" ON public.workspace_objetivos;
CREATE POLICY "wsobj_select_all" ON public.workspace_objetivos FOR SELECT USING (true);

DROP POLICY IF EXISTS "wsobj_insert_anon" ON public.workspace_objetivos;
CREATE POLICY "wsobj_insert_anon" ON public.workspace_objetivos FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "wsobj_update_anon" ON public.workspace_objetivos;
CREATE POLICY "wsobj_update_anon" ON public.workspace_objetivos FOR UPDATE USING (true) WITH CHECK (true);

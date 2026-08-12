CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

CREATE INDEX IF NOT EXISTS idx_food_db_name_trgm
  ON public.food_database USING gin ("name" extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_food_db_name_el_trgm
  ON public.food_database USING gin ("name_el" extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_food_db_name_es_trgm
  ON public.food_database USING gin ("name_es" extensions.gin_trgm_ops);

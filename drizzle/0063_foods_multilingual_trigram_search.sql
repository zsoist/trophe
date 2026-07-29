CREATE INDEX IF NOT EXISTS idx_foods_multilingual_trgm
  ON public.foods
  USING gin ((
    COALESCE(name_en, '') || ' ' ||
    COALESCE(name_el, '') || ' ' ||
    COALESCE(name_es, '') || ' ' ||
    COALESCE(name_fr, '') || ' ' ||
    COALESCE(name_it, '') || ' ' ||
    COALESCE(name_nl, '') || ' ' ||
    COALESCE(brand, '')
  ) extensions.gin_trgm_ops);

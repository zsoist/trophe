-- STAB-003: migration 0011 recreates two legacy policies without an explicit role,
-- which PostgreSQL grants to PUBLIC. The authenticated/service-role policies from
-- 0009 remain the intended access path.
DROP POLICY IF EXISTS dish_recipes_select ON public.dish_recipes;
DROP POLICY IF EXISTS dish_recipes_insert ON public.dish_recipes;

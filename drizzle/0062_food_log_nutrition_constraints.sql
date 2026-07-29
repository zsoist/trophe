-- Enforce a durable nutrition-data trust boundary for every current and future
-- food logging client. NOT VALID keeps rollout safe when historical rows need
-- separate cleanup, while PostgreSQL still enforces each check on all new and
-- updated rows immediately.

ALTER TABLE public.food_log
  ADD CONSTRAINT "food_log_name_bounds_check"
    CHECK (char_length(btrim(food_name)) BETWEEN 1 AND 500)
    NOT VALID,
  ADD CONSTRAINT "food_log_amount_bounds_check"
    CHECK (
      quantity > 0 AND quantity <= 10000
      AND (qty_g IS NULL OR (qty_g > 0 AND qty_g <= 10000))
      AND (qty_input IS NULL OR (qty_input > 0 AND qty_input <= 10000))
    )
    NOT VALID,
  ADD CONSTRAINT "food_log_nutrition_bounds_check"
    CHECK (
      (calories IS NULL OR (calories >= 0 AND calories <= 100000))
      AND (protein_g IS NULL OR (protein_g >= 0 AND protein_g <= 10000))
      AND (carbs_g IS NULL OR (carbs_g >= 0 AND carbs_g <= 10000))
      AND (fat_g IS NULL OR (fat_g >= 0 AND fat_g <= 10000))
      AND (fiber_g IS NULL OR (fiber_g >= 0 AND fiber_g <= 10000))
      AND (sugar_g IS NULL OR (sugar_g >= 0 AND sugar_g <= 10000))
    )
    NOT VALID,
  ADD CONSTRAINT "food_log_parse_confidence_bounds_check"
    CHECK (
      parse_confidence IS NULL
      OR (parse_confidence >= 0 AND parse_confidence <= 1)
    )
    NOT VALID;

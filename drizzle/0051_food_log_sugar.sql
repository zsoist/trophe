-- 0051_food_log_sugar.sql
-- food_log.sugar_g: lib/types.ts declared it, three quick-log paths INSERTed it
-- (favorites chips, copy-yesterday, coach-rec quick-log) and the AI-parse UI
-- displayed it — but the column never existed in any migration, so those
-- PostgREST inserts failed with PGRST204 and were silently swallowed
-- (`if (!error)` with no else). Sugar tracking from logs never worked.
-- Additive only.

ALTER TABLE "food_log" ADD COLUMN "sugar_g" real;

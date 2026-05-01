CREATE TYPE "public"."data_quality" AS ENUM('lab_verified', 'label', 'crowdsourced', 'estimated');--> statement-breakpoint
CREATE TYPE "public"."food_source" AS ENUM('usda', 'off', 'helth', 'hhf', 'custom');--> statement-breakpoint
CREATE TABLE "foods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "food_source" NOT NULL,
	"source_id" text,
	"source_url" text,
	"data_quality" "data_quality" DEFAULT 'estimated' NOT NULL,
	"name_en" text NOT NULL,
	"name_el" text,
	"name_es" text,
	"brand" text,
	"barcode" text,
	"region" text[],
	"kcal_per_100g" real NOT NULL,
	"protein_per_100g" real NOT NULL,
	"carb_per_100g" real NOT NULL,
	"fat_per_100g" real NOT NULL,
	"fiber_per_100g" real,
	"sugar_per_100g" real,
	"sodium_mg" real,
	"micronutrients" jsonb,
	"default_serving_grams" real DEFAULT 100,
	"default_serving_unit" text DEFAULT '100g',
	"popularity" smallint DEFAULT 0,
	"verified" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_synced_at" timestamp with time zone,
	CONSTRAINT "foods_source_source_id_key" UNIQUE("source","source_id")
);
--> statement-breakpoint
CREATE TABLE "food_unit_conversions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"food_id" uuid,
	"unit" text NOT NULL,
	"qualifier" text,
	"grams_per_unit" real NOT NULL,
	"source" text DEFAULT 'auto' NOT NULL,
	"reviewed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"food_id" uuid NOT NULL,
	"lang" char(2) NOT NULL,
	"alias" text NOT NULL,
	"preferred" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_aliases_food_lang_alias_key" UNIQUE("food_id","lang","alias")
);
--> statement-breakpoint
ALTER TABLE "food_log" ADD COLUMN "food_id" uuid;--> statement-breakpoint
ALTER TABLE "food_log" ADD COLUMN "qty_g" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "food_log" ADD COLUMN "qty_input" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "food_log" ADD COLUMN "qty_input_unit" text;--> statement-breakpoint
ALTER TABLE "food_log" ADD COLUMN "conversion_id" uuid;--> statement-breakpoint
ALTER TABLE "food_log" ADD COLUMN "parse_confidence" real;--> statement-breakpoint
ALTER TABLE "food_log" ADD COLUMN "llm_recognized" boolean;--> statement-breakpoint
ALTER TABLE "food_unit_conversions" ADD CONSTRAINT "food_unit_conversions_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_aliases" ADD CONSTRAINT "food_aliases_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_foods_barcode" ON "foods" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "idx_foods_popularity" ON "foods" USING btree ("popularity");--> statement-breakpoint
CREATE INDEX "idx_foods_region" ON "foods" USING gin ("region");--> statement-breakpoint
CREATE INDEX "idx_fuc_food_unit" ON "food_unit_conversions" USING btree ("food_id","unit");--> statement-breakpoint
CREATE INDEX "idx_fuc_universal_unit" ON "food_unit_conversions" USING btree ("unit");--> statement-breakpoint
CREATE INDEX "idx_fa_food_lang" ON "food_aliases" USING btree ("food_id","lang");--> statement-breakpoint
CREATE INDEX "idx_fa_alias_search" ON "food_aliases" USING gin (to_tsvector('simple', "alias"));

-- ── Phase 4 pgvector + full-text additions ────────────────────────────────────
-- These cannot be expressed via Drizzle schema types; added as raw SQL here.

-- 1. Voyage v4 embedding column (1024-dim). Populated by scripts/ingest/embed-foods.ts.
ALTER TABLE foods ADD COLUMN IF NOT EXISTS embedding vector(1024);

-- 2. Generated tsvector for multilingual full-text search.
--    Combines name_en + name_el + name_es into a single searchable column.
ALTER TABLE foods ADD COLUMN IF NOT EXISTS search_text tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      COALESCE(name_en, '') || ' ' ||
      COALESCE(name_el, '') || ' ' ||
      COALESCE(name_es, '') || ' ' ||
      COALESCE(brand, '')
    )
  ) STORED;

-- 3. GIN index on search_text (keyword full-text search — fast lane before kNN).
CREATE INDEX IF NOT EXISTS idx_foods_search ON foods USING gin(search_text);

-- 4. HNSW index on embedding (approximate nearest-neighbor, much faster than IVFFlat
--    for <1M rows; ef_construction=128 is the recommended default).
--    Created CONCURRENTLY-style by embedding script after initial batch load.
--    Added here as a placeholder; the real build runs post-ingest.
-- (deferred: CREATE INDEX CONCURRENTLY idx_foods_embedding ON foods USING hnsw (embedding vector_cosine_ops))

-- 5. Universal unit conversion seed — dimensionless conversions that apply to any food.
--    These are the fallback rows used when no food-specific conversion exists.
INSERT INTO food_unit_conversions (food_id, unit, qualifier, grams_per_unit, source)
VALUES
  -- Weight (universal)
  (NULL, 'g',    NULL,    1,       'kavdas'),
  (NULL, 'gr',   NULL,    1,       'kavdas'),
  (NULL, 'γρ',   NULL,    1,       'kavdas'),
  (NULL, 'kg',   NULL,    1000,    'kavdas'),
  (NULL, 'oz',   NULL,    28.35,   'kavdas'),
  (NULL, 'lb',   NULL,    453.592, 'kavdas'),
  -- Volume (water-density fallback)
  (NULL, 'ml',   NULL,    1,       'kavdas'),
  (NULL, 'l',    NULL,    1000,    'kavdas'),
  (NULL, 'fl oz', NULL,   29.57,   'kavdas'),
  -- Spoons (Kavdas plan - κ.σ., κ.γ.)
  (NULL, 'tbsp',  NULL,   14,      'kavdas'),
  (NULL, 'κ.σ.', NULL,    14,      'kavdas'),
  (NULL, 'tsp',   NULL,   5,       'kavdas'),
  (NULL, 'κ.γ.', NULL,    5,       'kavdas'),
  -- Portions (Greek coaching plan)
  (NULL, 'cup',    'cooked',  200,  'kavdas'),
  (NULL, 'cup',    'raw',     100,  'kavdas'),
  (NULL, 'cup',    NULL,      240,  'kavdas'),
  (NULL, 'φλ',    'cooked',  200,  'kavdas'),
  (NULL, 'φλ',    NULL,      100,  'kavdas'),
  (NULL, 'palm',   NULL,      120,  'kavdas'),
  (NULL, 'παλάμη', NULL,     120,  'kavdas'),
  (NULL, 'handful', NULL,     30,   'kavdas'),
  (NULL, 'χούφτα', NULL,      30,   'kavdas'),
  (NULL, 'fistful', NULL,     75,   'kavdas'),
  (NULL, 'γροθιά', NULL,      75,   'kavdas'),
  (NULL, 'scoop',  NULL,      30,   'kavdas'),
  (NULL, 'serving', NULL,    100,   'kavdas'),
  (NULL, 'portion', NULL,    150,   'kavdas'),
  (NULL, 'piece',   NULL,     80,   'kavdas'),
  (NULL, 'slice',   'bread',  30,   'kavdas'),
  (NULL, 'slice',   'cheese', 20,   'kavdas'),
  (NULL, 'slice',   NULL,     30,   'kavdas'),
  (NULL, 'φέτα',   'bread',  30,   'kavdas'),
  (NULL, 'φέτα',   'cheese', 20,   'kavdas'),
  (NULL, 'φέτα',   NULL,     30,   'kavdas')
ON CONFLICT DO NOTHING;
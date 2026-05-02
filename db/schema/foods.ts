/**
 * Trophē v0.3 — foods table.
 *
 * Phase 4: Single authoritative food reference replacing `food_database`.
 * Sources:
 *   usda   — FoodData Central SR Legacy + Foundation Foods (~7,800 rows, lab-verified)
 *   off    — Open Food Facts filtered to GR/ES/US (~50–300k rows, crowdsourced)
 *   helth  — Hellenic Food Thesaurus academic dataset (Greek regional foods)
 *   hhf    — Healthy Hellenic Food traditional dishes (48 dishes, PubMed 28731641)
 *   custom — coach-created entries
 *
 * DietAI24 deterministic pipeline:
 *   LLM → {name_candidate, qty, unit} only
 *   lookup.ts: tsvector filter → cosine kNN → metadata rerank
 *   macros = grams * food.kcal_per_100g / 100  (LLM never supplies numbers)
 *
 * Indexes:
 *   HNSW on embedding    — kNN ANN search (Voyage v4, 1024-dim)
 *   GIN on search_text   — keyword full-text search
 *   btree on barcode     — UPC/EAN lookup
 *   btree on source_id   — dedup checks during ingest
 */

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  real,
  smallint,
  integer,
  boolean,
  jsonb,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core';

export const foodSourceEnum = pgEnum('food_source', [
  'usda',
  'off',
  'helth',
  'hhf',
  'custom',
]);

export const dataQualityEnum = pgEnum('data_quality', [
  'lab_verified',   // USDA SR Legacy / FDC / HelTH
  'label',          // packaged food nutrition label
  'crowdsourced',   // Open Food Facts
  'estimated',      // coach-entered without lab source
]);

export const foods = pgTable(
  'foods',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // ── Source provenance ──────────────────────────────────────────
    source: foodSourceEnum('source').notNull(),
    sourceId: text('source_id'),         // USDA FDC ID, OFF barcode, etc.
    sourceUrl: text('source_url'),
    dataQuality: dataQualityEnum('data_quality').notNull().default('estimated'),

    // ── Names (multilingual) ───────────────────────────────────────
    nameEn: text('name_en').notNull(),
    nameEl: text('name_el'),             // Greek
    nameEs: text('name_es'),             // Spanish
    brand: text('brand'),
    barcode: text('barcode'),            // UPC/EAN for packaged foods
    region: text('region').array(),      // e.g. ['GR','CY'] for Greek-specific

    // ── Macronutrients per 100g ────────────────────────────────────
    kcalPer100g:    real('kcal_per_100g').notNull(),
    proteinPer100g: real('protein_per_100g').notNull(),
    carbPer100g:    real('carb_per_100g').notNull(),
    fatPer100g:     real('fat_per_100g').notNull(),
    fiberPer100g:   real('fiber_per_100g'),
    sugarPer100g:   real('sugar_per_100g'),
    sodiumMg:       real('sodium_mg'),   // per 100g

    // ── Micronutrients (sparse JSONB) ──────────────────────────────
    // { "calcium_mg": 120, "iron_mg": 1.2, "vitamin_c_mg": 4 }
    micronutrients: jsonb('micronutrients'),

    // ── Serving defaults ───────────────────────────────────────────
    defaultServingGrams: real('default_serving_grams').default(100),
    defaultServingUnit:  text('default_serving_unit').default('100g'),

    // ── Search ────────────────────────────────────────────────────
    // search_text is a GENERATED ALWAYS tsvector column — maintained by PG.
    // Drizzle does not have first-class GENERATED ALWAYS support; the column
    // is created raw in the migration SQL (see 0004_*.sql) and referenced
    // here as a virtual column for query type safety only.

    // ── Vector embedding (Voyage v4, 1024-dim) ─────────────────────
    // Stored as vector(1024). Column created raw in migration due to Drizzle
    // lacking pgvector column type in this version. Populated by embed-foods.ts.

    // ── Provenance tracking ──────────────────────────────────────────
    usdaFdcId: integer('usda_fdc_id'),                  // USDA FoodData Central ID (FK reference)
    macroConfidence: real('macro_confidence').notNull().default(0.7),  // 0.0–1.0
    unitConversionVerified: boolean('unit_conversion_verified').notNull().default(false),
    canonicalFoodKey: text('canonical_food_key'),        // e.g. 'egg_chicken_whole_raw'
    provenanceNotes: text('provenance_notes'),           // free text: source details
    dataReviewedAt: timestamp('data_reviewed_at', { withTimezone: true }),

    // ── Popularity / curation ──────────────────────────────────────
    popularity: smallint('popularity').default(0),   // 0-100, used in rerank
    verified: text('verified'),                       // 'auto' | 'manual' | null

    createdAt:    timestamp('created_at',    { withTimezone: true }).notNull().defaultNow(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  },
  (t) => [
    // Fast dedup during ingest
    unique('foods_source_source_id_key').on(t.source, t.sourceId),
    // Barcode lookup for packaged foods
    index('idx_foods_barcode').on(t.barcode),
    // Popularity-weighted browse
    index('idx_foods_popularity').on(t.popularity),
    // Region-filtered queries (e.g. Greek-first)
    index('idx_foods_region').using('gin', t.region),
    // Full-text search index — created raw in migration for GENERATED column
    // The GIN index on search_text (name_en || name_el || name_es) is in 0004 SQL.
    // HNSW index on embedding vector(1024) is also in 0004 SQL.
  ],
);

/**
 * Type for inserting a food row without the generated/computed fields.
 * Used by ingest scripts.
 */
export type InsertFood = typeof foods.$inferInsert;
export type SelectFood = typeof foods.$inferSelect;

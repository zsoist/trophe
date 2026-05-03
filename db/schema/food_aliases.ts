/**
 * Trophē v0.3 — food_aliases table.
 *
 * Multilingual + colloquial aliases for hybrid retrieval.
 * A user may say "γιαούρτι" (Greek), "yogur" (Spanish), "yog", or "στραγγιστό"
 * — all should resolve to the same canonical food_id.
 *
 * The lookup pipeline queries this table via tsvector so partial
 * matches and language variants all funnel to the same food row.
 *
 * Examples:
 *   (greek yogurt, 'el', 'γιαούρτι')
 *   (greek yogurt, 'el', 'στραγγιστό γιαούρτι')
 *   (greek yogurt, 'en', 'strained yogurt')
 *   (feta cheese,  'el', 'φέτα')
 *   (olive oil,    'el', 'ελαιόλαδο')
 *   (olive oil,    'es', 'aceite de oliva')
 *   (chicken,      'en', 'chicken breast')
 *   (chicken,      'el', 'κοτόπουλο')
 */

import {
  pgTable,
  uuid,
  text,
  char,
  boolean,
  timestamp,
  index,
  foreignKey,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { foods } from './foods';

export const foodAliases = pgTable(
  'food_aliases',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    foodId: uuid('food_id').notNull(),

    /** ISO 639-1 language code: 'en', 'el', 'es', 'tr', etc. */
    lang: char('lang', { length: 2 }).notNull(),

    /** The alias string — lowercase, stripped of diacritics for tsvector. */
    alias: text('alias').notNull(),

    /** Preferred alias for display (only one preferred per food per lang). */
    preferred: boolean('preferred').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('food_aliases_food_lang_alias_key').on(t.foodId, t.lang, t.alias),
    index('idx_fa_food_lang').on(t.foodId, t.lang),
    // GIN index for tsvector search over aliases
    index('idx_fa_alias_search').using(
      'gin',
      sql`to_tsvector('simple', ${t.alias})`,
    ),
    foreignKey({
      columns: [t.foodId],
      foreignColumns: [foods.id],
      name: 'food_aliases_food_id_fkey',
    }).onDelete('cascade'),
  ],
);

export type InsertFoodAlias = typeof foodAliases.$inferInsert;
export type SelectFoodAlias = typeof foodAliases.$inferSelect;

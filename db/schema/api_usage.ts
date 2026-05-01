import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  real,
  boolean,
  index,
  foreignKey,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profiles } from './profiles';

/**
 * LLM API call audit log.
 *
 * Written server-side after every Anthropic / Gemini call.
 * No RLS needed — this table is never read by client JS.
 * Langfuse (Phase 3) will duplicate this data with richer trace metadata;
 * this table stays as a lightweight cost-tracking companion.
 */
export const apiUsageLog = pgTable('api_usage_log', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  endpoint: text().notNull(),
  model: text().notNull(),
  provider: text(),
  tokensIn: integer('tokens_in').default(0),
  tokensOut: integer('tokens_out').default(0),
  costUsd: real('cost_usd').default(0),
  latencyMs: integer('latency_ms').default(0),
  userId: uuid('user_id'),
  success: boolean().default(true),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  index('idx_api_usage_created').using('btree', table.createdAt.asc().nullsLast().op('timestamptz_ops')),
  index('idx_api_usage_endpoint').using('btree', table.endpoint.asc().nullsLast().op('text_ops')),
  foreignKey({ columns: [table.userId], foreignColumns: [profiles.id], name: 'api_usage_log_user_id_fkey' }).onDelete('set null'),
  check('api_usage_log_provider_check', sql`provider = ANY (ARRAY['anthropic'::text, 'gemini'::text])`),
]);

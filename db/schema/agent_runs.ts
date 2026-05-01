/**
 * Trophē v0.3 — agent_runs table.
 *
 * Links every LLM call to its Langfuse trace so coaches and admins can:
 *   1. Click a food_log entry → see the exact AI call that produced it
 *   2. Audit cost per user / task / model
 *   3. Replay or re-score a trace for eval regression
 *
 * One row per LLM generation (a single food parse may produce one row).
 * food_log_id is nullable — not every agent run is tied to a food log entry
 * (e.g. coach_insight runs have no food_log_id).
 *
 * Phase 4 will add food_id FK once the foods table exists.
 */

import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { userRoleEnum } from './enums';

export const agentRuns = pgTable(
  'agent_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** Langfuse trace ID — use to deep-link into the Langfuse UI. */
    traceId: text('trace_id'),

    /** Trophē task name: food_parse | recipe_analyze | coach_insight | … */
    taskName: text('task_name').notNull(),

    /** Provider: anthropic | google | openai */
    provider: text('provider').notNull(),

    /** Exact model string sent to the provider API. */
    model: text('model').notNull(),

    /** Token counts */
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),

    /** Estimated USD cost computed at run time from otel.estimateCostUsd(). */
    costUsd: real('cost_usd'),

    /** Wall-clock latency in milliseconds. */
    latencyMs: integer('latency_ms'),

    /** HTTP status (200 / 0 on timeout / 4xx / 5xx). */
    rawStatus: integer('raw_status'),

    /** Error message if rawStatus !== 200. */
    errorMessage: text('error_message'),

    /**
     * Linked food_log row (nullable).
     * Not a FK in the migration because food_log is in a different schema domain
     * and we want to avoid circular dep issues during Phase 3 migration.
     * Phase 4 adds the proper FK.
     */
    foodLogId: uuid('food_log_id'),

    /** The user who triggered this run. Nullable for background jobs. */
    userId: uuid('user_id'),

    /** Role of the caller at the time of the run (for cost attribution). */
    callerRole: userRoleEnum('caller_role'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_agent_runs_user_created').on(t.userId, t.createdAt),
    index('idx_agent_runs_task_model').on(t.taskName, t.model),
    index('idx_agent_runs_food_log').on(t.foodLogId),
  ],
);

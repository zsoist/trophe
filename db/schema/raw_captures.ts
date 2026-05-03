/**
 * Trophē v0.3 — raw_captures table.
 *
 * Phase 5: Incoming firehose for memory extraction.
 *
 * Ports the OpenBrain raw_captures pattern to Trophē.
 * Every meaningful user action that might yield extractable memories
 * is recorded here first — then processed asynchronously by the
 * memory extraction agent.
 *
 * Why separate from agent_conversation?
 *   raw_captures is for non-conversational events (food logs, habit checkins,
 *   measurements, coach notes) that don't have a session_id but still
 *   contain extractable facts.
 *
 * Processing pipeline:
 *   1. App action fires → INSERT INTO raw_captures
 *   2. Background job (or on-demand) picks up unprocessed rows
 *   3. agents/memory/write.ts extracts facts → memory_chunks
 *   4. Row marked processed=true
 *
 * Sources:
 *   food_log     — "logged 200g feta, 1 cup rice, 2 eggs"
 *   habit_log    — "completed habit: drink 3L water, day 7 of 14"
 *   measurement  — "weight: 82.5kg, body_fat: 18.2%"
 *   coach_note   — "Nikos mentioned he's been stressed at work"
 *   workout      — "completed 45min CrossFit, PR on deadlift 120kg"
 *   profile_edit — "updated goal: cut to 78kg for August"
 *   chat         — free-form user message to the AI assistant
 */

import {
  pgTable,
  bigserial,
  uuid,
  text,
  boolean,
  jsonb,
  timestamp,
  index,
  check,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profiles } from './profiles';

export const rawCaptures = pgTable(
  'raw_captures',
  {
    /** bigserial for ordered processing (process in insertion order). */
    id: bigserial('id', { mode: 'number' }).primaryKey(),

    userId: uuid('user_id').notNull(),

    /**
     * What kind of event generated this capture.
     * Used to route to the right memory extractor.
     */
    source: text('source').notNull(),

    /** Human-readable content of the event. */
    content: text('content').notNull(),

    /**
     * Optional structured metadata for the event.
     * food_log: { food_name, kcal, protein_g, ... }
     * measurement: { weight_kg, body_fat_pct }
     * habit_log: { habit_name, streak, completed }
     */
    metadata: jsonb('metadata'),

    /**
     * Whether this capture has been processed by the memory extractor.
     * Allows idempotent re-processing if the extractor fails.
     */
    processed: boolean('processed').notNull().default(false),

    /** Timestamp of memory extraction (null if not yet processed). */
    processedAt: timestamp('processed_at', { withTimezone: true }),

    /** Error message if processing failed (for retry logic). */
    processingError: text('processing_error'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Unprocessed rows sorted oldest-first (FIFO processing queue)
    index('idx_rc_unprocessed').on(t.processed, t.createdAt),
    // User's capture history
    index('idx_rc_user_created').on(t.userId, t.createdAt),
    check(
      'raw_captures_source_check',
      sql`source IN ('food_log', 'habit_log', 'measurement', 'coach_note', 'workout', 'profile_edit', 'chat')`,
    ),
    foreignKey({
      columns: [t.userId],
      foreignColumns: [profiles.id],
      name: 'raw_captures_user_id_fkey',
    }).onDelete('cascade'),
  ],
);

export type InsertRawCapture = typeof rawCaptures.$inferInsert;
export type SelectRawCapture = typeof rawCaptures.$inferSelect;

/**
 * Trophē v0.3 — wearable_data table.
 *
 * Phase 6: Time-series wearable data from all providers via Spike API.
 *
 * Design:
 *   - Single table for all data types (steps, HRV, sleep, etc.).
 *   - value_numeric for scalar metrics (HRV, resting HR, steps, weight).
 *   - value_jsonb for structured data (sleep stages, workout splits, GPS).
 *   - Indexed on (user_id, data_type, recorded_at DESC) for coach insight queries.
 *   - Idempotent: UNIQUE on (user_id, provider, data_type, recorded_at) allows
 *     safe re-delivery from Spike webhooks.
 *
 * Data types and their typical shapes:
 *   steps        → value_numeric: total steps | value_jsonb: {hourly_breakdown}
 *   heart_rate   → value_numeric: resting BPM | value_jsonb: {zones, max, min}
 *   sleep        → value_numeric: total_minutes | value_jsonb: {stages: {rem,deep,light,awake}}
 *   workout      → value_numeric: duration_minutes | value_jsonb: {sport, calories, distance_km, hr_avg}
 *   hrv          → value_numeric: rmssd_ms | value_jsonb: {sdnn, lf_hf_ratio}
 *   weight       → value_numeric: kg | value_jsonb: {body_fat_pct, muscle_mass_kg}
 *   body_fat     → value_numeric: percentage
 *   spo2         → value_numeric: percentage
 *   stress       → value_numeric: 0-100 score | value_jsonb: {provider_score, time_in_stress_min}
 *   readiness    → value_numeric: 0-100 score (Oura/Whoop recovery score)
 *   temperature  → value_numeric: celsius deviation from baseline
 */

import {
  pgTable,
  pgEnum,
  bigserial,
  uuid,
  text,
  real,
  jsonb,
  timestamp,
  index,
  unique,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { profiles } from './profiles';
import { wearableProviderEnum } from './wearable_connections';

// ── Enums ──────────────────────────────────────────────────────────────────

export const wearableDataTypeEnum = pgEnum('wearable_data_type', [
  'steps',
  'heart_rate',
  'sleep',
  'workout',
  'hrv',
  'weight',
  'body_fat',
  'spo2',
  'stress',
  'readiness',
  'temperature',
]);

// ── Table ──────────────────────────────────────────────────────────────────

export const wearableData = pgTable(
  'wearable_data',
  {
    /** bigserial for ordered ingest processing. */
    id: bigserial('id', { mode: 'number' }).primaryKey(),

    userId: uuid('user_id').notNull(),

    /** Provider that generated this data point. */
    provider: wearableProviderEnum('provider').notNull(),

    /** Type of metric. */
    dataType: wearableDataTypeEnum('data_type').notNull(),

    /**
     * Scalar value for simple metrics.
     * Steps → total count. HRV → RMSSD ms. Sleep → total minutes.
     * Weight → kg. Body fat → percent. SpO2 → percent. Readiness → 0-100.
     */
    valueNumeric: real('value_numeric'),

    /**
     * Structured data for complex metrics.
     * Sleep stages, workout breakdown, HRV frequency analysis, etc.
     */
    valueJsonb: jsonb('value_jsonb'),

    /**
     * When this metric was recorded (by the wearable, not ingested).
     * For daily metrics (steps, sleep) this is the start of the day (UTC midnight).
     * For workouts this is the start time. For HRV this is the measurement time.
     */
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),

    /** When Trophē received this data from the Spike webhook. */
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),

    /**
     * Spike's event ID — included in webhook payloads.
     * Used for idempotent deduplication on re-delivery.
     */
    spikeEventId: text('spike_event_id'),
  },
  (t) => [
    // Primary coach query: user × type × time range (DESC for latest-first)
    index('idx_wd_user_type_recorded').on(t.userId, t.dataType, t.recordedAt),
    // Idempotency: deduplicate on re-delivery
    unique('wearable_data_user_provider_type_recorded_key').on(
      t.userId,
      t.provider,
      t.dataType,
      t.recordedAt,
    ),
    // Spike event ID lookup for dedup
    index('idx_wd_spike_event_id').on(t.spikeEventId),
    foreignKey({
      columns: [t.userId],
      foreignColumns: [profiles.id],
      name: 'wearable_data_user_id_fkey',
    }).onDelete('cascade'),
  ],
);

export type InsertWearableData = typeof wearableData.$inferInsert;
export type SelectWearableData = typeof wearableData.$inferSelect;

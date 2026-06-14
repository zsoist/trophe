import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * invite_reservations (migration 0042, WP1) — atomic claim records for elevated
 * signup + client activation. The race-correctness, idempotency, fail-closed
 * finalization, and recovery logic all live in the SECURITY DEFINER RPCs
 * (claim_* / finalize_* / release_* / expire_*, service_role only). This Drizzle
 * definition keeps the schema barrel in sync; the table is written only via those
 * RPCs, never directly from app code.
 */
export const inviteReservations = pgTable('invite_reservations', {
  id: uuid().primaryKey().default(sql`gen_random_uuid()`),
  inviteType: text('invite_type').notNull(),
  inviteId: uuid('invite_id').notNull(),
  idempotencyKey: uuid('idempotency_key').notNull(),
  requestFingerprint: text('request_fingerprint').notNull(),
  status: text().notNull().default('reserved'),
  userId: uuid('user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

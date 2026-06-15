import { pgTable, uuid, text, timestamp, check, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * invite_reservations (migration 0042, WP1) — reservation ownership + recovery
 * state machine for elevated signup, client activation, and ordinary signup.
 * All logic lives in the SECURITY DEFINER RPCs (claim_* / attach / finalize_* /
 * release / cancel_attached / expire_stale / claim_orphan_for_recovery, service_role
 * only). The table is written only via those RPCs. This mirrors the migration's
 * constraints/indexes/RLS so drizzle-kit generate does not report drift.
 */
export const inviteReservations = pgTable('invite_reservations', {
  id: uuid().primaryKey().default(sql`gen_random_uuid()`),
  inviteType: text('invite_type').notNull(),
  inviteId: uuid('invite_id').notNull(),
  idempotencyKey: uuid('idempotency_key').notNull(),
  requestFingerprint: text('request_fingerprint').notNull(),
  status: text().notNull().default('reserved'),
  userId: uuid('user_id'),
  recoveringLeaseUntil: timestamp('recovering_lease_until', { withTimezone: true }),
  recoveryToken: uuid('recovery_token'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull().default(sql`now() + interval '15 minutes'`),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (t) => [
  check('invite_reservations_invite_type_check', sql`${t.inviteType} IN ('beta','client','ordinary')`),
  check('invite_reservations_status_check', sql`${t.status} IN ('reserved','completed','cancelled','recovering')`),
  uniqueIndex('uq_reservation_idem_live').on(t.inviteId, t.idempotencyKey).where(sql`status IN ('reserved','completed','recovering')`),
  uniqueIndex('uq_client_invite_live_claim').on(t.inviteId).where(sql`invite_type = 'client' AND status IN ('reserved','completed','recovering')`),
  uniqueIndex('uq_ordinary_live_claim').on(t.inviteId).where(sql`invite_type = 'ordinary' AND status IN ('reserved','completed','recovering')`),
  index('idx_invite_reservations_sweep').on(t.status, t.expiresAt),
]).enableRLS();

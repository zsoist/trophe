import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
  bigserial,
  foreignKey,
  pgPolicy,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { userRoleEnum } from './enums';
import { profiles } from './profiles';

/**
 * Immutable audit trail for security-sensitive actions (Phase 1 addition).
 *
 * Written by server-side API routes (never by client JS). `actor_id` is nullable
 * to capture unauthenticated attempts (e.g. brute-force login tries).
 *
 * SELECT is super_admin-only via RLS. No UPDATE or DELETE policy — this table
 * is append-only by design; use `pg_partman` monthly partitioning once row count
 * exceeds 1M (Phase 9 concern).
 *
 * Examples of logged actions:
 *  - role_change, login, logout, magic_link_sent
 *  - client_assigned, note_deleted, coach_block_edited
 *  - api_key_rotated, mfa_enabled
 */
export const auditLog = pgTable('audit_log', {
  id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
  actorId: uuid('actor_id'),
  actorRole: userRoleEnum('actor_role'),
  action: text().notNull(),
  tableName: text('table_name').notNull(),
  recordId: uuid('record_id'),
  oldValue: jsonb('old_value'),
  newValue: jsonb('new_value'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  index('idx_audit_log_actor').using('btree', table.actorId.asc().nullsLast().op('uuid_ops')),
  index('idx_audit_log_action').using('btree', table.action.asc().nullsLast().op('text_ops')),
  index('idx_audit_log_table').using('btree', table.tableName.asc().nullsLast().op('text_ops')),
  index('idx_audit_log_created').using('btree', table.createdAt.desc().nullsFirst().op('timestamptz_ops')),
  foreignKey({
    columns: [table.actorId],
    foreignColumns: [profiles.id],
    name: 'audit_log_actor_id_fkey',
  }).onDelete('set null'),
  // Super-admin only SELECT; no UPDATE/DELETE (append-only).
  pgPolicy('Super admins read audit log', { as: 'permissive', for: 'select', to: ['public'],
    using: sql`(SELECT is_super_admin())` }),
  pgPolicy('Service role insert audit log', { as: 'permissive', for: 'insert', to: ['public'] }),
]);

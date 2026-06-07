import { pgTable, uuid, text, timestamp, jsonb, index, foreignKey, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profiles } from './profiles';
import { organizations } from './organizations';

export const dataRequests = pgTable('data_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  organizationId: uuid('organization_id'),
  requestType: text('request_type').notNull(),
  status: text('status').notNull().default('pending'),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  processedBy: uuid('processed_by'),
  resultUri: text('result_uri'),
  notes: text('notes'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
}, (t) => [
  index('idx_data_requests_user_status').on(t.userId, t.status),
  index('idx_data_requests_org_status').on(t.organizationId, t.status),
  index('idx_data_requests_due').on(t.dueAt),
  foreignKey({ columns: [t.userId], foreignColumns: [profiles.id], name: 'data_requests_user_id_fkey' }).onDelete('cascade'),
  foreignKey({ columns: [t.organizationId], foreignColumns: [organizations.id], name: 'data_requests_organization_id_fkey' }).onDelete('set null'),
  foreignKey({ columns: [t.processedBy], foreignColumns: [profiles.id], name: 'data_requests_processed_by_fkey' }).onDelete('set null'),
  check('data_requests_type_check', sql`request_type IN ('export', 'deletion', 'correction', 'restriction')`),
  check('data_requests_status_check', sql`status IN ('pending', 'in_progress', 'completed', 'rejected', 'canceled')`),
]);

import { pgTable, uuid, text, timestamp, jsonb, index, foreignKey, unique, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profiles } from './profiles';
import { organizations } from './organizations';

export const consents = pgTable('consents', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  organizationId: uuid('organization_id'),
  purpose: text('purpose').notNull(),
  version: text('version').notNull(),
  status: text('status').notNull().default('granted'),
  evidence: jsonb('evidence').$type<Record<string, unknown>>(),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
}, (t) => [
  unique('consents_user_purpose_version_key').on(t.userId, t.purpose, t.version),
  index('idx_consents_user_status').on(t.userId, t.status),
  index('idx_consents_org_purpose').on(t.organizationId, t.purpose),
  foreignKey({ columns: [t.userId], foreignColumns: [profiles.id], name: 'consents_user_id_fkey' }).onDelete('cascade'),
  foreignKey({ columns: [t.organizationId], foreignColumns: [organizations.id], name: 'consents_organization_id_fkey' }).onDelete('cascade'),
  check('consents_status_check', sql`status IN ('granted', 'withdrawn')`),
]);

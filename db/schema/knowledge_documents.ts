import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  foreignKey,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations } from './organizations';
import { profiles } from './profiles';

export const knowledgeDocuments = pgTable('knowledge_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id'),
  userId: uuid('user_id'),
  title: text('title').notNull(),
  source: text('source').notNull(),
  sourceUri: text('source_uri'),
  version: text('version').notNull().default('1'),
  checksum: text('checksum').notNull(),
  classification: text('classification').notNull().default('internal'),
  consentBasis: text('consent_basis'),
  status: text('status').notNull().default('pending'),
  errorMessage: text('error_message'),
  retentionUntil: timestamp('retention_until', { withTimezone: true }),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_kd_org_status').on(t.organizationId, t.status),
  index('idx_kd_user_status').on(t.userId, t.status),
  index('idx_kd_checksum').on(t.checksum),
  foreignKey({
    columns: [t.organizationId],
    foreignColumns: [organizations.id],
    name: 'knowledge_documents_organization_id_fkey',
  }).onDelete('cascade'),
  foreignKey({
    columns: [t.userId],
    foreignColumns: [profiles.id],
    name: 'knowledge_documents_user_id_fkey',
  }).onDelete('cascade'),
  foreignKey({
    columns: [t.createdBy],
    foreignColumns: [profiles.id],
    name: 'knowledge_documents_created_by_fkey',
  }).onDelete('restrict'),
  check('knowledge_documents_scope_check', sql`NOT (organization_id IS NOT NULL AND user_id IS NOT NULL)`),
  check('knowledge_documents_status_check', sql`status IN ('pending', 'processing', 'ready', 'failed', 'tombstoned')`),
  check('knowledge_documents_classification_check', sql`classification IN ('public', 'internal', 'confidential', 'restricted')`),
]);

export type InsertKnowledgeDocument = typeof knowledgeDocuments.$inferInsert;
export type SelectKnowledgeDocument = typeof knowledgeDocuments.$inferSelect;

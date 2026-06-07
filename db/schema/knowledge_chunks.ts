import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  foreignKey,
  unique,
} from 'drizzle-orm/pg-core';
import { knowledgeDocuments } from './knowledge_documents';

export const knowledgeChunks = pgTable('knowledge_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
  checksum: text('checksum').notNull(),
  tokenCount: integer('token_count').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('knowledge_chunks_document_index_key').on(t.documentId, t.chunkIndex),
  index('idx_kc_document').on(t.documentId),
  index('idx_kc_checksum').on(t.checksum),
  foreignKey({
    columns: [t.documentId],
    foreignColumns: [knowledgeDocuments.id],
    name: 'knowledge_chunks_document_id_fkey',
  }).onDelete('cascade'),
]);

export type InsertKnowledgeChunk = typeof knowledgeChunks.$inferInsert;
export type SelectKnowledgeChunk = typeof knowledgeChunks.$inferSelect;

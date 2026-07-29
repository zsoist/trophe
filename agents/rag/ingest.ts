import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { knowledgeChunks } from '@/db/schema/knowledge_chunks';
import { knowledgeDocuments } from '@/db/schema/knowledge_documents';
import { executeAiTask } from '@/agents/runtime';
import { invokeVoyageEmbedding } from '@/agents/runtime/providers/voyage';
import { chunkKnowledge } from './chunk';
export { chunkKnowledge } from './chunk';

export interface IngestKnowledgeInput {
  title: string;
  source: string;
  content: string;
  createdBy: string;
  organizationId?: string;
  userId?: string;
  sourceUri?: string;
  version?: string;
  classification?: 'public' | 'internal' | 'confidential' | 'restricted';
  consentBasis?: string;
  retentionUntil?: Date;
  chunks?: readonly string[];
  beforeTransportAttempt?: (endpoint: string) => unknown;
}

const checksum = (value: string) => createHash('sha256').update(value).digest('hex');

export async function ingestKnowledge(input: IngestKnowledgeInput): Promise<{ documentId: string; chunks: number }> {
  if (input.organizationId && input.userId) throw new Error('Knowledge must have only one private scope');
  const contentChecksum = checksum(input.content);
  const [document] = await db.insert(knowledgeDocuments).values({
    organizationId: input.organizationId,
    userId: input.userId,
    title: input.title,
    source: input.source,
    sourceUri: input.sourceUri,
    version: input.version ?? '1',
    checksum: contentChecksum,
    classification: input.classification ?? 'internal',
    consentBasis: input.consentBasis,
    retentionUntil: input.retentionUntil,
    createdBy: input.createdBy,
    status: 'processing',
  }).returning({ id: knowledgeDocuments.id });
  if (!document) throw new Error('Unable to create knowledge document');

  try {
    const chunks = input.chunks ?? chunkKnowledge(input.content);
    for (const [chunkIndex, content] of chunks.entries()) {
      const [chunk] = await db.insert(knowledgeChunks).values({
        documentId: document.id,
        chunkIndex,
        content,
        checksum: checksum(content),
        tokenCount: Math.ceil(content.length / 4),
      }).returning({ id: knowledgeChunks.id });
      if (!chunk) continue;
      const generation = await executeAiTask({
        task: 'embed',
        prompt: content,
        context: { userId: input.createdBy, organizationId: input.organizationId, metadata: { documentId: document.id, chunkId: chunk.id } },
        invoke: ({ policy, signal }) => invokeVoyageEmbedding({
          model: policy.model,
          text: content,
          inputType: 'document',
          signal,
          beforeTransportAttempt: input.beforeTransportAttempt,
        }),
      });
      const vector = `[${generation.output.join(',')}]`;
      await db.execute(sql`UPDATE knowledge_chunks SET embedding = ${vector}::vector WHERE id = ${chunk.id}`);
    }
    await db.update(knowledgeDocuments).set({ status: 'ready', errorMessage: null, updatedAt: new Date() }).where(eq(knowledgeDocuments.id, document.id));
    return { documentId: document.id, chunks: chunks.length };
  } catch (error) {
    await db.update(knowledgeDocuments).set({
      status: 'failed',
      errorMessage: error instanceof Error ? error.message.slice(0, 1_000) : 'Unknown ingestion error',
      updatedAt: new Date(),
    }).where(eq(knowledgeDocuments.id, document.id));
    throw error;
  }
}

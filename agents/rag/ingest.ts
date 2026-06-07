import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { knowledgeChunks } from '@/db/schema/knowledge_chunks';
import { knowledgeDocuments } from '@/db/schema/knowledge_documents';
import { executeAiTask } from '@/agents/runtime';
import { invokeVoyageEmbedding } from '@/agents/runtime/providers/voyage';

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
}

const checksum = (value: string) => createHash('sha256').update(value).digest('hex');

export function chunkKnowledge(content: string, maxChars = 2_400): string[] {
  const paragraphs = content.replace(/\r\n/g, '\n').split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > maxChars) {
      chunks.push(current);
      current = '';
    }
    if (paragraph.length > maxChars) {
      for (let offset = 0; offset < paragraph.length; offset += maxChars) chunks.push(paragraph.slice(offset, offset + maxChars));
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

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
    const chunks = chunkKnowledge(input.content);
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
        invoke: ({ policy, signal }) => invokeVoyageEmbedding({ model: policy.model, text: content, inputType: 'document', signal }),
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

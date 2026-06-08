import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { executeAiTask } from '@/agents/runtime';
import { invokeVoyageEmbedding } from '@/agents/runtime/providers/voyage';
import { formatRagContext } from './context';

export interface RetrieveKnowledgeInput {
  requesterId: string;
  subjectUserId: string;
  queryText: string;
  organizationId?: string;
  topK?: number;
  safeMaxTokens?: number;
}

export interface RagChunk {
  id: string;
  documentId: string;
  documentTitle: string;
  source: string;
  content: string;
  createdAt: Date;
  score: number;
}

export interface RetrieveKnowledgeResult {
  chunks: RagChunk[];
  systemPromptBlock: string;
}

async function embedQuery(
  text: string,
  context: { userId: string; organizationId?: string },
): Promise<number[] | null> {
  try {
    const result = await executeAiTask({
      task: 'embed',
      prompt: text,
      context,
      invoke: ({ policy, signal }) => invokeVoyageEmbedding({
        model: policy.model, text, inputType: 'query', signal,
      }),
    });
    return result.output;
  } catch {
    return null;
  }
}

export async function retrieveKnowledge(input: RetrieveKnowledgeInput): Promise<RetrieveKnowledgeResult> {
  const topK = Math.min(Math.max(input.topK ?? 8, 1), 20);
  const embedding = await embedQuery(input.queryText, {
    userId: input.requesterId,
    organizationId: input.organizationId,
  });
  const vector = embedding ? `[${embedding.join(',')}]` : null;
  const result = await db.execute(sql`
    SELECT * FROM hybrid_search_knowledge(
      ${input.requesterId}::uuid,
      ${input.subjectUserId}::uuid,
      ${input.organizationId ?? null}::uuid,
      ${input.queryText},
      ${vector}::vector,
      ${topK}
    )
  `);
  const maxChars = (input.safeMaxTokens ?? 1_200) * 4;
  let usedChars = 0;
  const chunks: RagChunk[] = [];
  for (const row of result.rows as Array<Record<string, unknown>>) {
    const content = String(row.content);
    if (chunks.length > 0 && usedChars + content.length > maxChars) break;
    chunks.push({
      id: String(row.chunk_id),
      documentId: String(row.document_id),
      documentTitle: String(row.document_title),
      source: String(row.source),
      content,
      createdAt: new Date(String(row.created_at)),
      score: Number(row.score),
    });
    usedChars += content.length;
  }
  return { chunks, systemPromptBlock: formatRagContext(chunks) };
}

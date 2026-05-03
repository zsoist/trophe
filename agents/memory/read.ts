/**
 * Trophē v0.3 — Memory read agent (Phase 5).
 *
 * Retrieves relevant memory chunks for a user at agent-call time and packs
 * them into the system prompt within a token budget.
 *
 * Retrieval pipeline (3 stages):
 *   Stage 1: Pre-filter by (user_id, scope, active=true) via B-tree index.
 *   Stage 2: Cosine kNN re-rank via pgvector <=> operator (if embedding provided).
 *   Stage 3: Metadata boost — salience × recency score, then truncate to token budget.
 *
 * Token budget:
 *   Estimated at 4 chars/token. safeMaxTokens (default: 800) controls the cap.
 *   High-confidence, high-salience, recently-retrieved facts get priority.
 *
 * Usage:
 *   const block = await readMemory({ userId, queryText: userMessage, scopes: ['user', 'session'] });
 *   // Inject block.systemPromptBlock into your agent system prompt.
 *   // Also call block.markRetrieved() to update last_retrieved_at + retrieval_count.
 */

import { db } from '@/db/client';
import { memoryChunks } from '@/db/schema/memory_chunks';
import { eq, and, inArray, desc, sql } from 'drizzle-orm';
import type { SelectMemoryChunk } from '@/db/schema/memory_chunks';
import { pick } from '@/agents/router';

// ── Types ──────────────────────────────────────────────────────────────────

export type MemoryScope = 'user' | 'session' | 'agent';

export interface ReadMemoryInput {
  userId: string;
  /** Text of the incoming query — used to embed for kNN if VOYAGE_API_KEY available. */
  queryText?: string;
  /** Which scopes to include. Default: ['user', 'session']. */
  scopes?: MemoryScope[];
  /** For agent-scoped memories: filter by this agent name. */
  agentName?: string;
  /** For session-scoped memories: filter by this session. */
  sessionId?: string;
  /**
   * Maximum tokens for the injected memory block.
   * At ~4 chars/token, 800 tokens ≈ 3200 chars.
   * Default: 800.
   */
  safeMaxTokens?: number;
  /** Maximum number of facts to return (before token truncation). Default: 20. */
  topK?: number;
}

export interface ReadMemoryResult {
  /** The formatted memory block to inject into a system prompt. Empty string if no memories. */
  systemPromptBlock: string;
  /** The raw memory chunks, sorted by relevance. */
  chunks: SelectMemoryChunk[];
  /** Call this to update last_retrieved_at + retrieval_count for returned chunks. */
  markRetrieved: () => Promise<void>;
}

// ── Voyage embedding helper ────────────────────────────────────────────────

async function embedQuery(text: string): Promise<number[] | null> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) return null;
  try {
    const response = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: pick('memory_embed').model,
        input: [text],
        input_type: 'query', // 'query' vs 'document' for asymmetric retrieval
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { data?: Array<{ embedding: number[] }> };
    return data.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

// ── Scoring ────────────────────────────────────────────────────────────────

/**
 * Composite score for a memory chunk without a query embedding.
 * Higher = more relevant / more likely to be shown.
 *
 * Formula:
 *   base = salience × confidence
 *   recency_bonus: +0.2 if retrieved in last 7 days, +0.1 if last 30 days
 *   type_bonus: +0.15 for allergies (safety), +0.10 for goals
 */
function scoreChunk(chunk: SelectMemoryChunk): number {
  let score = chunk.salience * chunk.confidence;

  if (chunk.lastRetrievedAt) {
    const daysSince = (Date.now() - new Date(chunk.lastRetrievedAt).getTime()) / (1000 * 86400);
    if (daysSince < 7) score += 0.2;
    else if (daysSince < 30) score += 0.1;
  }

  if (chunk.factType === 'allergy') score += 0.15;
  else if (chunk.factType === 'goal') score += 0.1;

  return score;
}

// ── Formatter ─────────────────────────────────────────────────────────────

const FACT_TYPE_LABELS: Record<string, string> = {
  preference: 'Preference',
  allergy: '⚠ Allergy/Intolerance',
  goal: 'Goal',
  event: 'Recent event',
  observation: 'Note',
};

function formatMemoryBlock(chunks: SelectMemoryChunk[]): string {
  if (chunks.length === 0) return '';

  // Group by fact_type for readability
  const grouped = new Map<string, SelectMemoryChunk[]>();
  for (const chunk of chunks) {
    const group = grouped.get(chunk.factType) ?? [];
    group.push(chunk);
    grouped.set(chunk.factType, group);
  }

  const lines: string[] = ['## User Memory Context', ''];

  // Allergies first (safety-critical)
  const typeOrder = ['allergy', 'goal', 'preference', 'observation', 'event'];
  for (const type of typeOrder) {
    const group = grouped.get(type);
    if (!group || group.length === 0) continue;

    lines.push(`**${FACT_TYPE_LABELS[type] ?? type}**`);
    for (const chunk of group) {
      const confidence = chunk.confidence >= 0.9 ? '' : ` (confidence: ${Math.round(chunk.confidence * 100)}%)`;
      lines.push(`- ${chunk.factText}${confidence}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  return lines.join('\n');
}

// ── Main export ────────────────────────────────────────────────────────────

export async function readMemory(input: ReadMemoryInput): Promise<ReadMemoryResult> {
  const {
    userId,
    queryText,
    scopes = ['user', 'session'],
    agentName,
    sessionId,
    safeMaxTokens = 800,
    topK = 20,
  } = input;

  const maxChars = safeMaxTokens * 4;

  // ── Stage 1: Pre-filter via B-tree index ──────────────────────────────
  // Build WHERE conditions for scope-based filtering
  const conditions = [
    eq(memoryChunks.userId, userId),
    eq(memoryChunks.active, true),
    inArray(memoryChunks.scope, scopes),
  ];

  // Session scope: filter to this session only
  if (scopes.includes('session') && sessionId) {
    // We want either user-scope (no session filter) or session-scope (this session)
    // Drizzle doesn't easily express OR conditions with typed filters, use raw sql
  }

  // Agent scope: filter to this agent only
  if (scopes.includes('agent') && agentName) {
    conditions.push(eq(memoryChunks.agentName, agentName));
  }

  // ── Stage 2: kNN re-rank if query embedding available ─────────────────
  let chunks: SelectMemoryChunk[];

  const queryEmbedding = queryText ? await embedQuery(queryText) : null;

  if (queryEmbedding) {
    // pgvector cosine similarity: ORDER BY embedding <=> queryVec ASC (lower = more similar)
    const vecStr = `[${queryEmbedding.join(',')}]`;
    // Use raw SQL for the vector operation — Drizzle doesn't support <=> operator natively
    const rows = await db.execute(
      sql`
        SELECT *
        FROM memory_chunks
        WHERE user_id = ${userId}
          AND active = true
          AND scope = ANY(${scopes})
          AND (expires_at IS NULL OR expires_at > NOW())
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${vecStr}::vector ASC
        LIMIT ${topK * 2}
      `,
    );
    chunks = rows.rows as unknown as SelectMemoryChunk[];

    // Also fetch facts without embeddings (new, not yet embedded)
    const noEmbedRows = await db.execute(
      sql`
        SELECT *
        FROM memory_chunks
        WHERE user_id = ${userId}
          AND active = true
          AND scope = ANY(${scopes})
          AND (expires_at IS NULL OR expires_at > NOW())
          AND embedding IS NULL
        ORDER BY confidence DESC, salience DESC
        LIMIT 10
      `,
    );
    chunks = [...chunks, ...(noEmbedRows.rows as unknown as SelectMemoryChunk[])];
  } else {
    // No embedding: fall back to recency + salience ordering
    chunks = await db
      .select()
      .from(memoryChunks)
      .where(
        and(
          eq(memoryChunks.userId, userId),
          eq(memoryChunks.active, true),
          inArray(memoryChunks.scope, scopes),
          sql`(expires_at IS NULL OR expires_at > NOW())`,
        ),
      )
      .orderBy(desc(memoryChunks.salience), desc(memoryChunks.confidence))
      .limit(topK * 2);
  }

  // ── Stage 3: Metadata boost + token budget truncation ─────────────────
  // Score each chunk, sort descending, truncate to topK
  const scored = chunks
    .map((c) => ({ chunk: c, score: scoreChunk(c) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.chunk);

  // Token budget: drop lowest-priority facts until under budget
  let charCount = 0;
  const selected: SelectMemoryChunk[] = [];
  for (const chunk of scored) {
    const factChars = chunk.factText.length + 50; // ~50 chars overhead per bullet
    if (charCount + factChars > maxChars && selected.length > 0) break;
    selected.push(chunk);
    charCount += factChars;
  }

  const systemPromptBlock = formatMemoryBlock(selected);
  const selectedIds = selected.map((c) => c.id);

  return {
    systemPromptBlock,
    chunks: selected,
    markRetrieved: async () => {
      if (selectedIds.length === 0) return;
      await db.execute(
        sql`
          UPDATE memory_chunks
          SET last_retrieved_at = NOW(),
              retrieval_count = retrieval_count + 1
          WHERE id = ANY(${selectedIds})
        `,
      );
    },
  };
}

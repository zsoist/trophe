/**
 * Trophē v0.3 — Memory write agent (Phase 5).
 *
 * Extracts structured facts from conversation turns and upserts them into
 * memory_chunks with Letta-style supersedence chain.
 *
 * Design:
 *   - Runs async / fire-and-forget AFTER each agent response (non-blocking).
 *   - Uses the router-selected reasoning model with strict JSON schema output.
 *   - Implements Letta supersedence: new facts that contradict existing ones
 *     mark old facts superseded_by=newId, preserving full history.
 *   - Embeds fact_text via Voyage v4 for kNN retrieval (agents/memory/read.ts).
 *
 * Usage:
 *   // Fire and forget — do NOT await in hot path
 *   writeMemory({ userId, sessionId, agentName, role: 'user', content }).catch(console.error);
 *
 * Called from:
 *   - app/api/ai/chat/route.ts (after assistant turn)
 *   - agents/food-parse/index.v4.ts (after food logging)
 *   - scripts/ingest/raw-captures-processor.ts (batch mode)
 */

import { db } from '@/db/client';
import { memoryChunks } from '@/db/schema/memory_chunks';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { callAnthropicMessages } from '@/agents/clients/anthropic';
import { pick, taskPolicies } from '@/agents/router';

// ── Types ──────────────────────────────────────────────────────────────────

export interface WriteMemoryInput {
  userId: string;
  sessionId: string;
  agentName: string;
  /** The full text of the message to extract facts from. */
  content: string;
  /** Role of the message author — affects extraction heuristics. */
  role: 'user' | 'assistant' | 'tool';
  /** Optional: agent name for agent-scoped memories. */
  scopeAgentName?: string;
}

export interface WriteMemoryResult {
  factsExtracted: number;
  factsSuperseded: number;
  skipped: boolean;
  reason?: string;
}

// ── Zod-style validated shape (manual, no zod dep needed) ──────────────────

interface ExtractedFact {
  fact_text: string;
  fact_type: 'preference' | 'allergy' | 'goal' | 'event' | 'observation';
  scope: 'user' | 'session' | 'agent';
  confidence: number;
  /** ISO string or null. */
  expires_at: string | null;
  /** Key terms for supersedence matching (e.g. "dietary", "goal:weight"). */
  semantic_tags: string[];
}

interface ExtractionOutput {
  facts: ExtractedFact[];
  skip: boolean;
  skip_reason?: string;
}

// ── System prompt ──────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM = `You are a memory extraction assistant for a nutrition coaching app.

Your job: read a single conversation message and extract persistent, actionable facts about the user.

Output ONLY valid JSON matching this schema:
{
  "facts": [
    {
      "fact_text": "string — one clear sentence about the user",
      "fact_type": "preference" | "allergy" | "goal" | "event" | "observation",
      "scope": "user" | "session",
      "confidence": 0.0-1.0,
      "expires_at": "ISO date string" | null,
      "semantic_tags": ["string"]
    }
  ],
  "skip": false,
  "skip_reason": null
}

Rules:
- Extract ONLY facts about the user (not general nutrition knowledge).
- "user" scope = persists across sessions (e.g. allergies, goals, strong preferences).
- "session" scope = relevant only to this conversation (e.g. mood today, current meal context).
- Do NOT extract: greetings, questions without answers, instructions to the AI.
- If nothing extractable, return {"facts": [], "skip": true, "skip_reason": "no extractable facts"}.
- Confidence: 0.9 for explicit statements ("I'm allergic to X"), 0.7 for inferred ("I usually eat X").
- Expires_at: set for time-limited facts ("cutting for next month" → 30 days from now). Null for permanent facts.
- Semantic_tags: 2-5 tags for grouping/supersedence detection. Use: "dietary", "goal:weight", "goal:performance", "allergy", "food:X", "schedule", "measurement", "mood".

Examples of extractable facts:
- User says "I hate cilantro" → preference, user scope, confidence 0.9, tags: ["dietary", "food:cilantro"]
- User says "I'm trying to lose 5kg by August" → goal, user scope, expires_at: August 1, tags: ["goal:weight"]
- User says "I'm lactose intolerant" → allergy, user scope, confidence 0.9, tags: ["allergy", "dietary"]
- User says "I'm feeling tired today" → observation, session scope, confidence 0.8, tags: ["mood", "energy"]
- Assistant says "Your protein target is 160g" → observation, user scope, confidence 0.85, tags: ["goal:performance", "nutrition"]`;

// ── Voyage embedding helper ────────────────────────────────────────────────

async function embedText(text: string): Promise<number[] | null> {
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
        input_type: 'document',
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { data?: Array<{ embedding: number[] }> };
    return data.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

// ── Supersedence detection ─────────────────────────────────────────────────

/**
 * Find existing active facts that are likely superseded by a new fact.
 * Matching logic: same user_id + overlapping semantic_tags (stored in fact_text prefix convention)
 * OR same fact_type + very similar content (fuzzy match via pg_trgm if available).
 *
 * Current implementation: simple fact_type + scope matching with tag overlap check.
 * Phase 6+ can replace with kNN similarity to supersede semantically close facts.
 */
async function findSupersededFacts(
  userId: string,
  newFact: ExtractedFact,
): Promise<string[]> {
  // Only supersede user-scoped goal/preference/allergy facts (persistent facts can conflict)
  if (newFact.scope !== 'user') return [];
  if (!['goal', 'preference', 'allergy'].includes(newFact.fact_type)) return [];

  // Find active facts of the same type for this user
  const candidates = await db
    .select({ id: memoryChunks.id, factText: memoryChunks.factText })
    .from(memoryChunks)
    .where(
      and(
        eq(memoryChunks.userId, userId),
        eq(memoryChunks.factType, newFact.fact_type as 'preference' | 'allergy' | 'goal' | 'event' | 'observation'),
        eq(memoryChunks.scope, 'user' as const),
        eq(memoryChunks.active, true),
        isNull(memoryChunks.supersededBy),
      ),
    );

  // Tag-based overlap: if new fact has tags like "goal:weight", supersede old goal:weight facts
  const goalTags = newFact.semantic_tags.filter((t) => t.startsWith('goal:') || t.startsWith('food:') || t === 'allergy');
  if (goalTags.length === 0) return [];

  // Simple heuristic: supersede if old fact_text contains any of the tag keywords
  const superseded: string[] = [];
  for (const candidate of candidates) {
    const lowerText = candidate.factText.toLowerCase();
    const tagMatches = goalTags.some((tag) => {
      const keyword = tag.includes(':') ? tag.split(':')[1] : tag;
      return lowerText.includes(keyword);
    });
    if (tagMatches) {
      superseded.push(candidate.id);
    }
  }

  return superseded;
}

// ── Expiry helpers ─────────────────────────────────────────────────────────

function parseTtl(scope: 'user' | 'session' | 'agent'): Date | null {
  // Operator decisions from Phase 5 plan:
  // user=365d, session=30d, agent=indefinite
  const now = new Date();
  if (scope === 'session') {
    now.setDate(now.getDate() + 30);
    return now;
  }
  if (scope === 'user') {
    now.setDate(now.getDate() + 365);
    return now;
  }
  return null; // agent = indefinite
}

// ── Main export ────────────────────────────────────────────────────────────

export async function writeMemory(input: WriteMemoryInput): Promise<WriteMemoryResult> {
  // Skip very short messages (greetings, single-word inputs, system messages)
  if (input.content.trim().length < 20) {
    return { factsExtracted: 0, factsSuperseded: 0, skipped: true, reason: 'content too short' };
  }

  const policy = taskPolicies.memory_extract;

  // ── Step 1: Extract facts with LLM ──────────────────────────────────────
  const llmResult = await callAnthropicMessages({
    model: policy.model,
    system: EXTRACTION_SYSTEM,
    userMessage: `Extract facts from this ${input.role} message:\n\n"${input.content}"`,
    maxTokens: policy.maxTokens,
    cacheSystem: policy.cacheSystem,
  });

  if (llmResult.rawError || !llmResult.text) {
    return {
      factsExtracted: 0,
      factsSuperseded: 0,
      skipped: true,
      reason: `LLM error: ${llmResult.rawError ?? 'empty response'}`,
    };
  }

  // ── Step 2: Parse LLM JSON output ───────────────────────────────────────
  let parsed: ExtractionOutput;
  try {
    const jsonMatch = llmResult.text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch?.[0] ?? llmResult.text) as ExtractionOutput;
  } catch {
    return {
      factsExtracted: 0,
      factsSuperseded: 0,
      skipped: true,
      reason: 'JSON parse error',
    };
  }

  if (parsed.skip || !parsed.facts || parsed.facts.length === 0) {
    return {
      factsExtracted: 0,
      factsSuperseded: 0,
      skipped: true,
      reason: parsed.skip_reason ?? 'no facts extracted',
    };
  }

  // ── Step 3: Validate and insert each fact ─────────────────────────────
  let factsExtracted = 0;
  let factsSuperseded = 0;

  for (const fact of parsed.facts) {
    // Validate required fields
    if (!fact.fact_text || !fact.fact_type || !fact.scope) continue;
    const confidence = Math.max(0, Math.min(1, fact.confidence ?? 0.7));

    // Determine expiry: use LLM-provided if valid, else fall back to scope-based TTL
    let expiresAt: Date | null = null;
    if (fact.expires_at) {
      const parsed_date = new Date(fact.expires_at);
      if (!isNaN(parsed_date.getTime())) {
        expiresAt = parsed_date;
      }
    }
    if (!expiresAt) {
      expiresAt = parseTtl(fact.scope);
    }

    // ── Step 4: Supersedence detection ──────────────────────────────────
    const supersededIds = await findSupersededFacts(input.userId, fact);

    // ── Step 5: Embed the fact text ────────────────────────────────────
    const embedding = await embedText(fact.fact_text);

    // ── Step 6: Insert new memory chunk ────────────────────────────────
    const [inserted] = await db
      .insert(memoryChunks)
      .values({
        userId: input.userId,
        scope: fact.scope,
        agentName: input.scopeAgentName ?? input.agentName,
        sessionId: input.sessionId,
        factText: fact.fact_text,
        factType: fact.fact_type as 'preference' | 'allergy' | 'goal' | 'event' | 'observation',
        confidence,
        source: input.role === 'user' ? 'user_input' : 'agent_inference',
        active: true,
        salience: confidence,
        expiresAt: expiresAt ?? undefined,
      })
      .returning({ id: memoryChunks.id });

    if (!inserted) continue;
    factsExtracted++;

    // ── Step 7: Write embedding if available ───────────────────────────
    if (embedding) {
      const vecStr = `[${embedding.join(',')}]`;
      await db.execute(
        sql`UPDATE memory_chunks SET embedding = ${vecStr}::vector WHERE id = ${inserted.id}`,
      );
    }

    // ── Step 8: Mark superseded facts ──────────────────────────────────
    for (const oldId of supersededIds) {
      await db
        .update(memoryChunks)
        .set({ supersededBy: inserted.id, active: false })
        .where(eq(memoryChunks.id, oldId));
      factsSuperseded++;
    }
  }

  return { factsExtracted, factsSuperseded, skipped: false };
}

/**
 * Convenience: extract memories from a raw_capture row.
 * Called by the background processor script.
 */
export async function writeMemoryFromCapture(capture: {
  id: number;
  userId: string;
  source: string;
  content: string;
  metadata: unknown;
}): Promise<WriteMemoryResult> {
  return writeMemory({
    userId: capture.userId,
    sessionId: `capture:${capture.id}`,
    agentName: `raw_capture:${capture.source}`,
    content: capture.content,
    role: 'user',
  });
}

/**
 * Trophē v0.3 — Coach blocks agent (Phase 5).
 *
 * Loads Letta-style editable coach blocks for a client and renders them
 * into the agent system prompt. Coaches write these blocks; agents read them.
 *
 * Standard block labels (from db/schema/coach_blocks.ts):
 *   'persona'            — Who the client is (age, background, context)
 *   'current_protocol'   — Active nutrition/training protocol
 *   'flags'              — Important flags (medical, motivational triggers)
 *   'nutrition_notes'    — Specific nutrition guidance from the coach
 *   'workout_notes'      — Workout context for this client
 *
 * Agents may request specific blocks or all active blocks.
 * Blocks marked visible_to_client=true can be shown in the client UI.
 *
 * Usage:
 *   const block = await loadCoachBlocks({ clientId, labels: ['persona', 'flags', 'current_protocol'] });
 *   // Inject block.systemPromptBlock into agent system prompt before user message.
 */

import { db } from '@/db/client';
import { coachBlocks } from '@/db/schema/coach_blocks';
import { eq, and, inArray } from 'drizzle-orm';
import type { SelectCoachBlock } from '@/db/schema/coach_blocks';

// ── Types ──────────────────────────────────────────────────────────────────

export type StandardBlockLabel =
  | 'persona'
  | 'current_protocol'
  | 'flags'
  | 'nutrition_notes'
  | 'workout_notes';

export interface LoadCoachBlocksInput {
  clientId: string;
  /** Specific block labels to load. If omitted, loads all active blocks. */
  labels?: string[];
  /** Only include blocks visible to the client (for client-facing agents). */
  clientVisibleOnly?: boolean;
}

export interface LoadCoachBlocksResult {
  /** The formatted coach context block to inject into a system prompt. */
  systemPromptBlock: string;
  /** Raw blocks, keyed by label. */
  blocks: Record<string, SelectCoachBlock>;
  /** True if at least one block has content. */
  hasContent: boolean;
}

export interface UpsertCoachBlockInput {
  clientId: string;
  coachId: string;
  blockLabel: string;
  content: string;
  editedBy: string;
}

// ── Block label display names ──────────────────────────────────────────────

const LABEL_DISPLAY: Record<string, string> = {
  persona: 'Client Profile',
  current_protocol: 'Current Protocol',
  flags: 'Important Flags',
  nutrition_notes: 'Nutrition Notes',
  workout_notes: 'Workout Context',
};

// ── Load blocks ────────────────────────────────────────────────────────────

export async function loadCoachBlocks(
  input: LoadCoachBlocksInput,
): Promise<LoadCoachBlocksResult> {
  const { clientId, labels, clientVisibleOnly = false } = input;

  const conditions = [
    eq(coachBlocks.clientId, clientId),
    eq(coachBlocks.active, true),
  ];

  if (clientVisibleOnly) {
    conditions.push(eq(coachBlocks.visibleToClient, true));
  }

  if (labels && labels.length > 0) {
    conditions.push(inArray(coachBlocks.blockLabel, labels));
  }

  const rows = await db
    .select()
    .from(coachBlocks)
    .where(and(...conditions))
    .orderBy(coachBlocks.blockLabel);

  // Build key→block map
  const blockMap: Record<string, SelectCoachBlock> = {};
  for (const row of rows) {
    blockMap[row.blockLabel] = row;
  }

  // Order for prompt injection: flags first (most critical), then persona, protocol, notes
  const orderedLabels = labels ?? ['flags', 'persona', 'current_protocol', 'nutrition_notes', 'workout_notes'];
  const promptLines: string[] = [];
  let hasContent = false;

  for (const label of orderedLabels) {
    const block = blockMap[label];
    if (!block || !block.content.trim()) continue;

    hasContent = true;
    const displayName = LABEL_DISPLAY[label] ?? label;
    promptLines.push(`### ${displayName}`);
    promptLines.push(block.content.trim());
    promptLines.push('');
  }

  const systemPromptBlock = hasContent
    ? ['## Coach Notes for This Client', '', ...promptLines, '---', ''].join('\n')
    : '';

  return { systemPromptBlock, blocks: blockMap, hasContent };
}

// ── Upsert a block ─────────────────────────────────────────────────────────

/**
 * Create or update a coach block for a client.
 * Increments the version counter on each update.
 * Only coaches can call this (enforced at the API layer, not here).
 */
export async function upsertCoachBlock(input: UpsertCoachBlockInput): Promise<SelectCoachBlock> {
  const { clientId, coachId, blockLabel, content, editedBy } = input;

  const [result] = await db
    .insert(coachBlocks)
    .values({
      clientId,
      coachId,
      blockLabel,
      content,
      version: 1,
      editedBy,
      active: true,
      visibleToClient: false,
    })
    .onConflictDoUpdate({
      target: [coachBlocks.clientId, coachBlocks.blockLabel],
      set: {
        content,
        version: db.$count(coachBlocks, eq(coachBlocks.clientId, clientId)),  // will be overridden below
        editedBy,
        updatedAt: new Date(),
      },
    })
    .returning();

  // Increment version manually (onConflictDoUpdate can't easily increment)
  const [updated] = await db
    .update(coachBlocks)
    .set({
      content,
      version: result.version + 1,
      editedBy,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(coachBlocks.clientId, clientId),
        eq(coachBlocks.blockLabel, blockLabel),
      ),
    )
    .returning();

  return updated;
}

/**
 * Toggle a block's visibility to the client.
 */
export async function setBlockVisibility(
  clientId: string,
  blockLabel: string,
  visible: boolean,
): Promise<void> {
  await db
    .update(coachBlocks)
    .set({ visibleToClient: visible, updatedAt: new Date() })
    .where(
      and(
        eq(coachBlocks.clientId, clientId),
        eq(coachBlocks.blockLabel, blockLabel),
      ),
    );
}

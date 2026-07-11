import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { pool } from '@/db/client';
import { annotateGenerationMetadata } from '@/agents/runtime/persistence';

describe('agent_runs final outcome persistence', () => {
  it('merges apiOutcome into the real JSONB row selected by generation ID', async () => {
    const generationId = randomUUID();

    await pool.query(
      `INSERT INTO agent_runs
        (generation_id, task_name, provider, model, status, metadata)
       VALUES ($1, 'food_parse', 'openai', 'gpt-5.6-luna', 'completed', $2::jsonb)`,
      [generationId, JSON.stringify({ existing: 'preserved' })],
    );

    try {
      await annotateGenerationMetadata(generationId, {
        canarySegment: 'consumer-luna-week-1',
        apiOutcome: 'malformed',
      });

      const result = await pool.query<{ metadata: Record<string, unknown> }>(
        'SELECT metadata FROM agent_runs WHERE generation_id = $1',
        [generationId],
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].metadata).toEqual({
        existing: 'preserved',
        canarySegment: 'consumer-luna-week-1',
        apiOutcome: 'malformed',
      });
    } finally {
      await pool.query('DELETE FROM agent_runs WHERE generation_id = $1', [generationId]);
    }
  });
});

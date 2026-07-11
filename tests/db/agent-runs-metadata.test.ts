import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { pool } from '@/db/client';
import { annotateGenerationMetadata, failGeneration } from '@/agents/runtime/persistence';
import { AiProviderError } from '@/agents/runtime/providers/errors';

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

  it('persists safe provider diagnostics without changing the schema', async () => {
    const generationId = randomUUID();

    await pool.query(
      `INSERT INTO agent_runs
        (generation_id, task_name, provider, model, status, metadata)
       VALUES ($1, 'food_parse', 'openai', 'gpt-5.6-luna', 'pending', $2::jsonb)`,
      [generationId, JSON.stringify({ existing: 'preserved' })],
    );

    try {
      await failGeneration(generationId, new AiProviderError({
        provider: 'openai',
        message: 'Project lacks model entitlement',
        status: 403,
        errorType: 'invalid_request_error',
        errorCode: 'model_not_found',
        providerRequestId: 'req_provider_123',
        clientRequestId: generationId,
      }));

      const result = await pool.query<{
        status: string;
        raw_status: number;
        error_message: string;
        metadata: Record<string, unknown>;
      }>(
        `SELECT status, raw_status, error_message, metadata
         FROM agent_runs WHERE generation_id = $1`,
        [generationId],
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({
        status: 'failed',
        raw_status: 403,
        error_message: 'Project lacks model entitlement',
        metadata: {
          existing: 'preserved',
          providerErrorType: 'invalid_request_error',
          providerErrorCode: 'model_not_found',
          providerRequestId: 'req_provider_123',
          clientRequestId: generationId,
        },
      });
    } finally {
      await pool.query('DELETE FROM agent_runs WHERE generation_id = $1', [generationId]);
    }
  });
});

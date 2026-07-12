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
        providerGenerationId: 'resp_provider_123',
        usage: {
          inputTokens: 120,
          outputTokens: 8,
          cacheReadTokens: 40,
          cacheWriteTokens: 60,
        },
        latencyMs: 321,
      }), { estimatedCostUsd: 0.0002 });

      const result = await pool.query<{
        status: string;
        raw_status: number;
        error_message: string;
        provider_generation_id: string;
        tokens_in: number;
        tokens_out: number;
        cache_read_tokens: number;
        cache_write_tokens: number;
        estimated_cost_usd: string;
        latency_ms: number;
        metadata: Record<string, unknown>;
      }>(
        `SELECT status, raw_status, error_message, provider_generation_id,
                tokens_in, tokens_out, cache_read_tokens, cache_write_tokens,
                estimated_cost_usd, latency_ms, metadata
         FROM agent_runs WHERE generation_id = $1`,
        [generationId],
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({
        status: 'failed',
        raw_status: 403,
        error_message: 'Project lacks model entitlement',
        provider_generation_id: 'resp_provider_123',
        tokens_in: 120,
        tokens_out: 8,
        cache_read_tokens: 40,
        cache_write_tokens: 60,
        estimated_cost_usd: 0.0002,
        latency_ms: 321,
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

  it('does not fabricate a client request ID when none was sent', async () => {
    const generationId = randomUUID();

    await pool.query(
      `INSERT INTO agent_runs
        (generation_id, task_name, provider, model, status, metadata)
       VALUES ($1, 'coach_insight', 'anthropic', 'claude-haiku-4-5-20251001', 'pending', '{}'::jsonb)`,
      [generationId],
    );

    try {
      await failGeneration(generationId, new AiProviderError({
        provider: 'anthropic',
        message: 'credit balance is too low',
        status: 402,
        errorType: 'billing_error',
        providerRequestId: 'req_provider_456',
      }));

      const result = await pool.query<{ metadata: Record<string, unknown> }>(
        'SELECT metadata FROM agent_runs WHERE generation_id = $1',
        [generationId],
      );
      expect(result.rows[0].metadata).toMatchObject({
        providerErrorType: 'billing_error',
        providerRequestId: 'req_provider_456',
      });
      expect(result.rows[0].metadata).not.toHaveProperty('clientRequestId');
    } finally {
      await pool.query('DELETE FROM agent_runs WHERE generation_id = $1', [generationId]);
    }
  });
});

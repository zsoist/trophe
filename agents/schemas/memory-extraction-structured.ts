import { z } from 'zod';

export const memoryExtractionStructuredSchema = z.object({
  facts: z.array(z.object({
    fact_text: z.string().min(1).max(1_000),
    fact_type: z.enum(['preference', 'allergy', 'goal', 'event', 'observation']),
    scope: z.enum(['user', 'session', 'agent']),
    confidence: z.number().min(0).max(1),
    expires_at: z.string().nullable(),
    semantic_tags: z.array(z.string().min(1).max(100)).max(10),
  })).max(20),
  skip: z.boolean(),
  skip_reason: z.string().max(500).nullable(),
});

export const memoryExtractionGeminiResponseSchema = {
  type: 'object',
  required: ['facts', 'skip', 'skip_reason'],
  properties: {
    facts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['fact_text', 'fact_type', 'scope', 'confidence', 'expires_at', 'semantic_tags'],
        properties: {
          fact_text: { type: 'string' },
          fact_type: { type: 'string', enum: ['preference', 'allergy', 'goal', 'event', 'observation'] },
          scope: { type: 'string', enum: ['user', 'session', 'agent'] },
          confidence: { type: 'number' },
          expires_at: { type: 'string', nullable: true },
          semantic_tags: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    skip: { type: 'boolean' },
    skip_reason: { type: 'string', nullable: true },
  },
} as const;

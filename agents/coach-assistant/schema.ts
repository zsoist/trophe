import { z } from 'zod';

export const requestSchema = z.object({
  message: z.string().min(1).max(2000).transform(value =>
    value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim())
    .pipe(z.string().min(1)),
  intent: z.enum(['today', 'week', 'plan']),
  clientId: z.string().uuid().optional(),
  exerciseId: z.string().uuid().optional(),
}).strict();

/** Model selects server-rendered facts. It cannot supply factual prose or numbers. */
export const selectionSchema = z.object({
  factIds: z.array(z.string().max(100)).max(24),
  suggestionCodes: z.array(z.enum(['ask_coach', 'review_records', 'clarify_plan'])).max(3),
  escalate: z.boolean(),
}).strict();

export const selectionJsonSchema = {
  type: 'object', additionalProperties: false,
  required: ['factIds', 'suggestionCodes', 'escalate'],
  properties: {
    factIds: { type: 'array', items: { type: 'string' }, maxItems: 24 },
    suggestionCodes: { type: 'array', items: { type: 'string', enum: ['ask_coach', 'review_records', 'clarify_plan'] }, maxItems: 3 },
    escalate: { type: 'boolean' },
  },
};

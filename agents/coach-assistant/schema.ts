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

/** V2 keeps history and navigation hints bounded and non-authoritative. */
export const conversationRequestSchema = z.object({
  version: z.literal('coach-assistant.v2'),
  conversationId: z.string().uuid(),
  turnId: z.string().uuid(),
  message: requestSchema.shape.message,
  context: z.object({
    surface: z.enum(['home', 'food', 'recipe', 'workout', 'plan', 'live', 'library', 'exercise', 'atlas', 'history', 'progress', 'profile', 'habits', 'coach']),
    includeScreen: z.boolean(),
    clientId: z.string().uuid().optional(),
    entity: z.object({ kind: z.enum(['meal', 'recipe', 'session', 'plan', 'exercise']), id: z.string().uuid() }).strict().optional(),
  }).strict().optional(),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().min(1).max(500) }).strict()).max(6).optional(),
  attachments: z.array(z.object({ id: z.string().uuid(), kind: z.enum(['image', 'audio']), status: z.enum(['pending', 'available', 'unknown', 'unauthorized', 'not_connected']) }).strict()).max(3).optional(),
}).strict();

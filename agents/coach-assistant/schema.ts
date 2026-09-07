import { coachMessageInputSchema } from './message-input';
import { COACH_ANATOMY_GROUP_IDS } from './selection-contracts';
import { isDraft } from '@/lib/workout/workspace-storage';
import type { WorkoutDraft } from '@/lib/workout/workspace-state';
import { z } from 'zod';

export const requestSchema = z.object({
  message: coachMessageInputSchema,
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
    displayWeightUnit:z.enum(['kg','lb']).optional(),
    surface: z.enum(['home', 'food', 'recipe', 'workout', 'plan', 'live', 'library', 'exercise', 'atlas', 'history', 'progress', 'profile', 'habits', 'coach']),
    includeScreen: z.boolean(),
    clientId: z.string().uuid().optional(),
    entity: z.object({ kind: z.enum(['meal', 'recipe', 'session', 'plan', 'exercise']), id: z.string().uuid(),version:z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict().optional(),
    anatomy:z.object({group:z.enum(COACH_ANATOMY_GROUP_IDS),subgroup:z.string().min(1).max(80).optional(),legRegion:z.enum(['all','upper','lower']).optional(),version:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict().optional(),
  }).strict().optional(),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().min(1).max(500), kind:z.enum(['conversation','memory_summary']).optional(), derivedToken:z.string().min(1).max(512).optional() }).strict()).max(6).optional(),
  attachments: z.array(z.object({ id: z.string().uuid(), kind: z.enum(['image', 'audio']), status: z.enum(['pending', 'available', 'unknown', 'unauthorized', 'not_connected']) }).strict()).max(3).optional(),
}).strict();

const preferenceOperationBase = {
  version: z.literal('coach-assistant.v2'),
  conversationId: z.string().uuid(), turnId: z.string().uuid(), clientId: z.string().uuid().optional(),
};
export const preferenceOperationSchema = z.discriminatedUnion('operation', [
  z.object({...preferenceOperationBase,operation:z.literal('propose'),action:z.literal('preference.update'),resourceVersion:z.string().min(1).max(128),after:z.object({durationMinutes:z.union([z.literal(20),z.literal(30),z.literal(45),z.literal(60)])}).strict()}).strict(),
  z.object({...preferenceOperationBase,operation:z.literal('apply'),proposalId:z.string().uuid(),hash:z.string().regex(/^[a-f0-9]{64}$/),actionId:z.string().uuid(),resourceVersion:z.string().min(1).max(128)}).strict(),
  z.object({...preferenceOperationBase,operation:z.literal('receipt'),actionId:z.string().uuid()}).strict(),
]);

const memoryProposeBase = {...preferenceOperationBase,operation:z.literal('propose'),memoryId:z.string().uuid(),resourceVersion:z.string().min(1).max(128)};
export const memoryOperationSchema = z.discriminatedUnion('action',[
  z.object({...memoryProposeBase,action:z.literal('memory.confirm')}).strict(),
  z.object({...memoryProposeBase,action:z.literal('memory.delete')}).strict(),
  z.object({...memoryProposeBase,action:z.literal('memory.correct'),after:z.object({text:z.string().trim().min(1).max(500)}).strict()}).strict(),
]);
export const coachDraftSchema = z.custom<WorkoutDraft>(value => {
  try { return JSON.stringify(value).length <= 6000 && isDraft(value); } catch { return false; }
});
export const draftOperationSchema = z.object({...preferenceOperationBase,operation:z.literal('propose'),action:z.literal('draft.update'),resourceVersion:z.string().min(1).max(128),after:coachDraftSchema}).strict();
export const actionOperationSchema = z.union([preferenceOperationSchema,memoryOperationSchema,draftOperationSchema]);
export const memoryCardSchema = z.object({
  id:z.string().uuid(),text:z.string().min(1).max(500),source:z.enum(['user_input','coach','agent_inference','wearable']),
  createdAt:z.string().datetime({offset:true}),scope:z.enum(['user','session','agent']),confirmation:z.enum(['unconfirmed','confirmed']),version:z.string().min(1).max(128),
}).strict();

export const attachmentOperationSchema = z.discriminatedUnion('operation',[
  z.object({version:z.literal('coach-assistant.v2'),conversationId:z.string().uuid(),operation:z.literal('attachment.prepare'),mime:z.enum(['image/jpeg','image/png','image/webp']),bytes:z.number().int().min(1).max(5*1024*1024)}).strict(),
  z.object({version:z.literal('coach-assistant.v2'),conversationId:z.string().uuid(),operation:z.literal('attachment.status'),attachmentId:z.string().uuid()}).strict(),
  z.object({version:z.literal('coach-assistant.v2'),conversationId:z.string().uuid(),operation:z.literal('attachment.remove'),attachmentId:z.string().uuid(),reviewed:z.literal(true)}).strict(),
]);

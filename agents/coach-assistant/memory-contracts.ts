import { z } from 'zod';
const uuid=z.string().uuid();
const revision=z.string().regex(/^\d+$/).max(20);
const text=z.string().trim().min(1).max(400);
const base={version:z.literal('coach-assistant.v2'),conversationId:uuid,turnId:uuid,clientId:uuid.optional()};
export const persistentMemoryOperationSchema=z.discriminatedUnion('operation',[
 z.object({...base,operation:z.literal('memory.read')}).strict(),
 z.object({...base,operation:z.literal('memory.propose'),action:z.literal('memory.confirm'),after:z.object({text,source:z.literal('user_input'),retention:z.literal('persistent')}).strict()}).strict(),
 z.object({...base,operation:z.literal('memory.correct'),memoryId:uuid,resourceVersion:revision,after:z.object({text,source:z.literal('user_input'),retention:z.literal('persistent')}).strict()}).strict(),
 z.object({...base,operation:z.literal('memory.delete'),memoryId:uuid,resourceVersion:revision}).strict(),
 z.object({...base,operation:z.literal('memory.apply'),proposalId:uuid,hash:z.string().regex(/^[a-f0-9]{64}$/),actionId:uuid,resourceVersion:revision,reviewed:z.literal(true)}).strict(),
 z.object({...base,operation:z.literal('memory.receipt'),actionId:uuid}).strict(),
]);
export type PersistentMemoryOperation=z.infer<typeof persistentMemoryOperationSchema>;
export const persistentMemoryCardSchema=z.object({id:uuid,text,version:revision,confirmation:z.literal('confirmed'),source:z.literal('user_input'),retention:z.literal('persistent'),conversationId:uuid}).strict();
export type PersistentMemoryCard=z.infer<typeof persistentMemoryCardSchema>;
export const persistentMemoryProposalSchema=z.object({id:uuid,hash:z.string().regex(/^[a-f0-9]{64}$/),action:z.enum(['memory.confirm','memory.correct','memory.delete']),resource:z.object({kind:z.literal('memory'),id:uuid,version:revision}).strict(),before:persistentMemoryCardSchema.nullable(),after:z.object({text,source:z.literal('user_input'),retention:z.literal('persistent')}).strict().nullable(),expiresAt:z.string().datetime({offset:true}),reviewRequired:z.literal(true)}).strict();
export type PersistentMemoryProposal=z.infer<typeof persistentMemoryProposalSchema>;
const common={version:z.literal('coach-assistant.v2'),storage:z.literal('database')};
export const persistentMemoryResultSchema=z.union([
 z.object({...common,ok:z.literal(false),error:z.enum(['invalid_input','forbidden','not_found','version_conflict','expired','idempotency_conflict','uncertain','cancelled'])}).strict(),
 z.object({...common,ok:z.literal(true),memories:z.array(persistentMemoryCardSchema).max(20),derivedContext:z.literal('excluded')}).strict(),
 z.object({...common,ok:z.literal(true),proposal:persistentMemoryProposalSchema}).strict(),
 z.object({...common,ok:z.literal(true),receipt:z.object({id:uuid,actionId:uuid,proposalId:uuid,status:z.literal('applied'),resourceVersion:revision,recordedAt:z.string().datetime({offset:true})}).strict(),refresh:z.object({conversationId:uuid,strategy:z.literal('refetch'),discardDerivedContext:z.literal(true),invalidatedMemoryVersions:z.array(z.object({id:uuid,version:revision}).strict()).max(1)}).strict()}).strict(),
]);
export type PersistentMemoryResult=z.infer<typeof persistentMemoryResultSchema>;
export interface PersistentMemoryService {
 execute(scope:{actorId:string;subjectId:string;organizationId:string;operation:PersistentMemoryOperation;signal:AbortSignal}):Promise<PersistentMemoryResult>;
}

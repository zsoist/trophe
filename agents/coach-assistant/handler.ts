import { run } from './index';
import { runConversation } from './conversation';
import { isolatedActionsBroker } from './isolated-actions';
import { requestSchema, conversationRequestSchema } from './schema';
import { fixtureRepository } from './fixtures';
import { COACH_IMAGE_LIMITS, type CoachErrorCode, type CoachResponse } from './contracts';
import type { CoachRepository } from './repository';
import { COACH_PRICING_VERSION } from './economics';
import { COACH_PROMPT_VERSION } from './prompt.v3';

interface HandlerDependencies {
  env: Record<string,string|undefined>;
  guard(request: Request): Promise<{userId:string}|Response>;
  createRepository(): CoachRepository | Promise<CoachRepository>;
  now?: () => Date;
}
const json = (body: unknown, status: number) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
function fail(code: CoachErrorCode,status: number): Response {
  const body: CoachResponse = { version:'coach-assistant.v1',ok:false,mode:'offline',dataSource:'authorized_records',evidence:[],
    error:{code,retryable:['rate_limited','query_failed','provider_unavailable','deadline'].includes(code)},telemetry:{model:null,provider:null,promptVersion:COACH_PROMPT_VERSION,modelCalls:0,dataReads:0,
      tokensIn:0,tokensOut:0,reasoningTokens:0,cacheReadTokens:0,cacheWriteTokens:0,latencyMs:0,costUsd:0,pricingVersion:COACH_PRICING_VERSION} };
  return json(body,status);
}
async function readBytes(request: Request,signal:AbortSignal,limit=8192): Promise<Uint8Array> {
  const reader=request.body?.getReader();
  if (!reader) throw new Error('invalid_input');
  const chunks: Uint8Array[]=[]; let size=0;
  const cancel=()=>{void reader.cancel().catch(()=>{});};
  signal.addEventListener('abort',cancel,{once:true});
  try {
    for (;;) {
      signal.throwIfAborted();
      const {done,value}=await reader.read();
      if(done) break;
      size+=value.length;
      if(size>limit){cancel();throw new Error('invalid_input');}
      chunks.push(value);
    }
    const bytes=new Uint8Array(size); let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    return bytes;
  } finally {signal.removeEventListener('abort',cancel);reader.releaseLock();}
}

async function readBody(request:Request,signal:AbortSignal):Promise<unknown> {
  const bytes=await readBytes(request,signal);
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{throw new Error('invalid_input');}
}

export async function handleCoachRequest(request: Request,deps: HandlerDependencies): Promise<Response> {
  if(deps.env.COACH_ASSISTANT_ENABLED!=='1'||deps.env.VERCEL_ENV==='production')return fail('disabled',404);
  const controller=new AbortController();
  const cancel=()=>controller.abort(new Error('cancelled'));
  if(request.signal.aborted)cancel();else request.signal.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(()=>controller.abort(new Error('deadline')),45000);
  const start=performance.now();
  let abortBoundary:(()=>void)|undefined;
  try {
    const work=async()=>{
      controller.signal.throwIfAborted();
      const guard=await deps.guard(request);
      controller.signal.throwIfAborted();
      if(guard instanceof Response) {
        if(guard.status===401)return fail('unauthenticated',401);
        if(guard.status===403)return fail('forbidden',403);
        if(guard.status===429) {
          const response=fail('rate_limited',429);
          const retryAfter=guard.headers.get('Retry-After');
          if(retryAfter&&/^\d{1,6}$/.test(retryAfter))response.headers.set('Retry-After',retryAfter);
          return response;
        }
        return fail('provider_unavailable',503);
      }
      const allowed=(deps.env.COACH_ASSISTANT_PREVIEW_USER_IDS??'').split(',').map(s=>s.trim()).filter(Boolean);
      if(!allowed.includes(guard.userId))return fail('forbidden',403);
      if(request.method==='PUT') {
        if(deps.env.COACH_ASSISTANT_ISOLATED_ATTACHMENTS_ENABLED!=='1')return fail('disabled',404);
        const repository=await deps.createRepository();
        const initial=await repository.authorize(guard.userId,guard.userId,controller.signal);
        if(initial.actorId!==guard.userId||initial.subjectId!==guard.userId)return fail('forbidden',403);
        const authorize=async()=>{const fresh=await repository.authorize(guard.userId,guard.userId,controller.signal);if(JSON.stringify(fresh)!==JSON.stringify(initial))throw new Error('forbidden');};
        controller.signal.throwIfAborted();
        const bytes=await readBytes(request,controller.signal,COACH_IMAGE_LIMITS.fileBytes);
        const {isolatedAttachmentStore}=await import('./isolated-attachments');
        const result=await isolatedAttachmentStore.upload(`${guard.userId}:${initial.organizationId}`,request.headers.get('x-coach-conversation-id')??'',request.headers.get('x-coach-attachment-id')??'',request.headers.get('x-coach-upload-token')??'',bytes,controller.signal,authorize);
        return json(result,result.ok?200:result.error==='forbidden'?403:result.error==='busy'?409:400);
      }
      const raw=await readBody(request,controller.signal);
      if(raw && typeof raw==='object' && 'operation' in raw && typeof raw.operation==='string' && raw.operation.startsWith('attachment.')) {
        if(deps.env.COACH_ASSISTANT_ISOLATED_ATTACHMENTS_ENABLED!=='1')return fail('disabled',404);
        const context=await (await deps.createRepository()).authorize(guard.userId,guard.userId,controller.signal);
        if(context.actorId!==guard.userId||context.subjectId!==guard.userId)return fail('forbidden',403);
        const {isolatedAttachmentStore}=await import('./isolated-attachments');
        controller.signal.throwIfAborted();
        const result=isolatedAttachmentStore.operation(`${guard.userId}:${context.organizationId}`,raw);
        return json(result,result.ok?200:result.error==='forbidden'?403:400);
      }
      if(raw && typeof raw==='object' && 'operation' in raw) {
        if(deps.env.COACH_ASSISTANT_ISOLATED_ACTIONS_ENABLED!=='1')return fail('disabled',404);
        const result=await isolatedActionsBroker.execute(guard.userId,raw,await deps.createRepository(),controller.signal);
        const status=result.ok?200:result.error==='forbidden'?403:result.error==='invalid_input'?400:result.error==='expired'?410:result.error==='not_found'?404:result.error==='uncertain'?503:409;
        return json(result,status);
      }
      const parsed=conversationRequestSchema.or(requestSchema).safeParse(raw);
      if(!parsed.success)return fail('invalid_input',400);
      const synthetic=deps.env.COACH_ASSISTANT_DATA_SOURCE==='synthetic';
      const conversational='version' in parsed.data;
      const clientId='version' in parsed.data?parsed.data.context?.clientId:parsed.data.clientId;
      if(synthetic&&clientId)return fail('forbidden',403);
      const result=await (conversational?runConversation:run)(parsed.data,{
        isolatedActionsEnabled:deps.env.COACH_ASSISTANT_ISOLATED_ACTIONS_ENABLED==='1',
        actorId:synthetic?'synthetic-client':guard.userId,
        repository:synthetic?fixtureRepository():await deps.createRepository(),
        now:synthetic?new Date('2026-09-07T03:30:00Z'):(deps.now?.()??new Date()),
        signal:controller.signal,mode:deps.env.COACH_ASSISTANT_MODE==='model'?'model':'offline',
        deadlineMs:Math.max(1,45000-(performance.now()-start)),
      });
      if(result.version==='coach-assistant.v2'&&result.ok&&result.snapshot&&deps.env.COACH_ASSISTANT_ISOLATED_ATTACHMENTS_ENABLED==='1'&&result.snapshot.subjectId===guard.userId&&result.dataSource==='authorized_records') {
        const {isolatedAttachmentStore}=await import('./isolated-attachments');
        result.attachments=result.attachments.map(attachment=>{
          const resolved=isolatedAttachmentStore.operation(`${guard.userId}:${result.snapshot!.organizationId}`,{version:'coach-assistant.v2',operation:'attachment.status',conversationId:result.conversationId,attachmentId:attachment.id});
          return {...attachment,status:resolved.ok?(resolved.attachment?.status??'unknown'):'unauthorized'};
        });
        result.uploads={images:true,storage:'isolated_ephemeral',analysis:'not_connected',limits:{...COACH_IMAGE_LIMITS}};
      }
      const code=result.error?.code;
      return json(result,result.ok?200:code==='unauthenticated'?401:code==='forbidden'?403:code==='invalid_input'?400:503);
    };
    return await Promise.race([work(),new Promise<Response>(resolve=>{
      abortBoundary=()=>resolve(fail(request.signal.aborted?'cancelled':'deadline',503));
      controller.signal.addEventListener('abort',abortBoundary,{once:true});
      if(controller.signal.aborted)abortBoundary();
    })]);
  } catch(error) {
    if(error instanceof Error&&error.message==='forbidden')return fail('forbidden',403);
    return fail(error instanceof Error&&error.message==='invalid_input'?'invalid_input':'query_failed',error instanceof SyntaxError||error instanceof Error&&error.message==='invalid_input'?400:503);
  } finally {
    clearTimeout(timer);request.signal.removeEventListener('abort',cancel);
    if(abortBoundary)controller.signal.removeEventListener('abort',abortBoundary);
  }
}

import { run } from './index';
import { runConversation } from './conversation';
import { requestSchema, conversationRequestSchema } from './schema';
import { fixtureRepository } from './fixtures';
import type { CoachErrorCode, CoachResponse } from './contracts';
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
async function readBody(request: Request,signal:AbortSignal): Promise<unknown> {
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
      if(size>8192){cancel();throw new Error('invalid_input');}
      chunks.push(value);
    }
    const bytes=new Uint8Array(size); let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    try { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); }
    catch { throw new Error('invalid_input'); }
  } finally {signal.removeEventListener('abort',cancel);reader.releaseLock();}
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
      const raw=await readBody(request,controller.signal);
      const parsed=conversationRequestSchema.or(requestSchema).safeParse(raw);
      if(!parsed.success)return fail('invalid_input',400);
      const synthetic=deps.env.COACH_ASSISTANT_DATA_SOURCE==='synthetic';
      const conversational='version' in parsed.data;
      const clientId='version' in parsed.data?parsed.data.context?.clientId:parsed.data.clientId;
      if(synthetic&&clientId)return fail('forbidden',403);
      const result=await (conversational?runConversation:run)(parsed.data,{
        actorId:synthetic?'synthetic-client':guard.userId,
        repository:synthetic?fixtureRepository():await deps.createRepository(),
        now:synthetic?new Date('2026-09-07T03:30:00Z'):(deps.now?.()??new Date()),
        signal:controller.signal,mode:deps.env.COACH_ASSISTANT_MODE==='model'?'model':'offline',
        deadlineMs:Math.max(1,45000-(performance.now()-start)),
      });
      const code=result.error?.code;
      return json(result,result.ok?200:code==='unauthenticated'?401:code==='forbidden'?403:code==='invalid_input'?400:503);
    };
    return await Promise.race([work(),new Promise<Response>(resolve=>{
      abortBoundary=()=>resolve(fail(request.signal.aborted?'cancelled':'deadline',503));
      controller.signal.addEventListener('abort',abortBoundary,{once:true});
      if(controller.signal.aborted)abortBoundary();
    })]);
  } catch(error) {
    return fail(error instanceof Error&&error.message==='invalid_input'?'invalid_input':'query_failed',error instanceof SyntaxError||error instanceof Error&&error.message==='invalid_input'?400:503);
  } finally {
    clearTimeout(timer);request.signal.removeEventListener('abort',cancel);
    if(abortBoundary)controller.signal.removeEventListener('abort',abortBoundary);
  }
}

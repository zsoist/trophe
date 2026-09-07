import type { OfflineConversationProvider } from './open-conversation';
/** Capabilities are minted only by the exact disposable CI target guard. */
export interface IsolatedEngineBoundary {readonly kind:'isolated_authorized_fixture'}
const issued=new WeakMap<IsolatedEngineBoundary,{provider:OfflineConversationProvider;valid:()=>boolean}>();
function validEnvironment(env:Record<string,string|undefined>){
 if(env.CI!=='true'||env.GITHUB_ACTIONS!=='true'||env.CI_REAL_SUPABASE!=='1'||env.COACH_ASSISTANT_ISOLATED_ENGINE_ENABLED!=='1'||env.COACH_ASSISTANT_DATA_SOURCE!=='authorized_records'||env.VERCEL_ENV==='production'||env.TROPHE_ALLOW_PAID_AI==='1')return false;
 try{
  const db=new URL(env.DATABASE_URL??''),api=new URL(env.NEXT_PUBLIC_SUPABASE_URL??'');
  return db.protocol==='postgresql:'&&db.hostname==='127.0.0.1'&&db.port==='54322'&&db.pathname==='/postgres'&&!db.search&&!db.hash&&api.protocol==='http:'&&api.hostname==='127.0.0.1'&&api.port==='54321'&&api.pathname==='/'&&!api.username&&!api.password&&!api.search&&!api.hash;
 }catch{return false;}
}
/** Fixed deterministic transport: no fetch, provider SDK, key lookup or override. */
export function createIsolatedEngineBoundary(env:Record<string,string|undefined>){
 if(!validEnvironment(env))throw new Error('isolated_engine_disabled');
 const provider:OfflineConversationProvider=async input=>{
  if(!validEnvironment(env))throw new Error('isolated_engine_disabled');input.signal.throwIfAborted();
  if(input.policy.provider!=='openai'||input.policy.model!=='gpt-5.6-luna'||input.policy.reasoningEffort!=='low'||input.maxTokens!==2000||input.maxAttempts!==1)throw new Error('unsupported_policy');
  const payload=JSON.parse(input.prompt) as {message:string;evidence:Array<{id:string}>};
  const spanish=/[¿¡]|\b(?:como|comida|semana|revisar)\b/i.test(payload.message.normalize('NFKD').replace(/\p{M}/gu,''));
  return {output:{answer:spanish?'Revisar el contexto anotado puede ayudar a organizar una conversación útil.':'Reviewing recorded context can help organize a useful discussion.',followUp:spanish?'¿Qué te gustaría aclarar en esta revisión?':'What would make this review useful?',evidenceRefs:payload.evidence.map(e=>e.id),entityRefs:[],facts:payload.evidence.map(e=>({kind:'record_fact',evidenceId:e.id})),generalExplanationRefs:['records_are_partial_view'],limitations:['incomplete_records'],escalation:false},usage:{inputTokens:1200,outputTokens:300,reasoningTokens:40},latencyMs:0,rawStatus:200};
 };
 const boundary:IsolatedEngineBoundary=Object.freeze({kind:'isolated_authorized_fixture'});
 issued.set(boundary,{provider,valid:()=>validEnvironment(env)});return Object.freeze({boundary,provider});
}
export function isIsolatedEngineBoundary(boundary:IsolatedEngineBoundary|undefined,provider:OfflineConversationProvider|undefined){
 if(!boundary)return false;const match=issued.get(boundary);return !!match&&match.provider===provider&&match.valid();
}

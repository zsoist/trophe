import { expect, it, vi } from 'vitest';
const ports=vi.hoisted(()=>({ native:vi.fn(), transport:vi.fn() }));
vi.mock('@/agents/runtime/providers/structured',()=>({invokeStructuredProvider:ports.native}));
vi.mock('@/agents/runtime',()=>({executeAiTask:async (config:{invoke:(input:unknown)=>Promise<Record<string,unknown>>})=>{
 const result=await config.invoke({policy:{model:'gpt-5.6-luna',provider:'openai'},signal:new AbortController().signal});
 return {...result,generationId:'offline-generation',selectedPolicy:{model:'gpt-5.6-luna',provider:'openai'}};
}}));
vi.mock('@/agents/food-parse/lookup',()=>({lookupFoodBatch:async()=>[],ragPreSearch:async()=>[],formatRagContext:()=>'',correctFoodName:(v:string)=>v,resolveDirectMetricUnit:()=>null}));
vi.mock('@/agents/food-parse/local-fast-path',()=>({extractLocalFoodCandidates:()=>null}));
import { run } from '@/agents/food-parse/index.v4';
const result=(output:unknown)=>({output,usage:{inputTokens:10,outputTokens:5},rawStatus:200,latencyMs:1});
it('routes the real native extraction and full prompt through the supplied admission transport',async()=>{
 ports.transport.mockReset().mockResolvedValue(result({items:[],needs_clarification:true,clarification_question:'Which portion?'}));
 const parsed=await run({text:'two hot dogs and 30 ml cola',language:'en'},{providerTransport:ports.transport,allowSchemaRepair:false});
 expect(ports.transport).toHaveBeenCalledTimes(1);expect(ports.native).not.toHaveBeenCalled();
 const request=ports.transport.mock.calls[0][0];
 expect(request.system.length).toBeGreaterThan(8000);
 expect(new TextEncoder().encode(JSON.stringify({system:request.system,prompt:request.prompt,schema:request.schema})).length).toBeLessThan(63500);
 expect(parsed.output?.clarification_question).toBe('Which portion?');
});
it('does not silently call schema repair after failed governed extraction',async()=>{
 ports.transport.mockReset().mockResolvedValue(result(null));
 const parsed=await run({text:'two hot dogs and 30 ml cola'},{providerTransport:ports.transport,allowSchemaRepair:false});
 expect(parsed.ok).toBe(false);expect(ports.transport).toHaveBeenCalledTimes(1);expect(ports.native).not.toHaveBeenCalled();
});

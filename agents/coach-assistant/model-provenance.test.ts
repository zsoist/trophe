import { describe,it,expect,vi } from 'vitest';
import { z } from 'zod';
import { invokeStructuredProvider } from '@/agents/runtime/providers/structured';
describe('observed OpenAI model metadata through governed dispatcher',()=>{
 it.each([undefined,'gpt-5.6-luna-snapshot','different-model','',42])('preserves response model %s without request substitution',async(model)=>{
  const fetchImpl=vi.fn().mockResolvedValue(new Response(JSON.stringify({model,choices:[{finish_reason:'tool_calls',message:{tool_calls:[{function:{name:'submit_result',arguments:'{"value":"ok"}'}}]}}],usage:{prompt_tokens:10,completion_tokens:5}}),{status:200}));
  const result=await invokeStructuredProvider({policy:{provider:'openai',model:'gpt-5.6-luna',reasoningEffort:'low',costClass:'cheap',latencyClass:'fast',maxTokens:100,timeoutMs:1000,maxInputChars:1000,maxCostUsd:0,promptVersion:'test'},system:'system',prompt:'prompt',signal:new AbortController().signal,schema:{type:'object'},validator:z.object({value:z.string()}),fetchImpl:fetchImpl as typeof fetch,maxAttempts:1});
  expect(result.responseModel).toBe(typeof model==='string'&&model.trim()?model:undefined);
  expect(result.output).toEqual({value:'ok'});expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body).model).toBe('gpt-5.6-luna');
 });
});

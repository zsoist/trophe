import { beforeEach,describe,it,expect,vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
const mocks=vi.hoisted(()=>({where:vi.fn(),execute:vi.fn(),ai:vi.fn()}));
vi.mock('@/db/client',()=>({db:{execute:mocks.execute,select:()=>({from:()=>({where:mocks.where})})}}));
vi.mock('@/agents/runtime',()=>({executeAiTask:mocks.ai}));
import { readMemory } from '@/agents/memory/read';
import { writeMemory } from '@/agents/memory/write';
import { memoryRouter } from '@/lib/trpc/routers/memory';
import { createCallerFactory } from '@/lib/trpc/init';
import type { Context } from '@/lib/trpc/context';
const id='00000000-0000-4000-8000-000000000001';
const render=(query:Parameters<PgDialect['sqlToQuery']>[0])=>new PgDialect().sqlToQuery(query).sql;
beforeEach(()=>{vi.clearAllMocks();mocks.execute.mockResolvedValue({rows:[]});mocks.ai.mockResolvedValue({output:[0.1]});mocks.where.mockReturnValue({orderBy:()=>({limit:async()=>[]})});});
describe('legacy memory paths exclude reviewed namespace',()=>{
 it('excludes namespace in recency retrieval even when the reserved agent name is requested',async()=>{
  await readMemory({userId:id,agentName:'coach-assistant-confirmed',scopes:['user','agent']});
  expect(render(mocks.where.mock.calls[0][0])).toContain("IS DISTINCT FROM 'coach-assistant-confirmed'");expect(mocks.ai).not.toHaveBeenCalled();
 });
 it('excludes namespace in both vector and no-embedding SQL branches',async()=>{
  await readMemory({userId:id,queryText:'fixture',scopes:['user','agent'],agentName:'coach-assistant-confirmed'});
  expect(mocks.execute).toHaveBeenCalledTimes(2);for(const [query] of mocks.execute.mock.calls)expect(render(query)).toContain("agent_name IS DISTINCT FROM 'coach-assistant-confirmed'");
 });
 it('prevents automatic extraction into reserved namespace before any model call',async()=>{
  for(const names of [{agentName:'coach-assistant-confirmed'},{agentName:'food_parse',scopeAgentName:'coach-assistant-confirmed'}])expect(await writeMemory({userId:id,sessionId:id,role:'user',content:'Long enough content for an extraction attempt',...names})).toMatchObject({skipped:true,factsExtracted:0});
  expect(mocks.ai).not.toHaveBeenCalled();expect(mocks.execute).not.toHaveBeenCalled();
 });
 it('excludes namespace from legacy all-scope list, delete and counts',async()=>{
  const queries:Parameters<PgDialect['sqlToQuery']>[0][]=[];
  const db={select:()=>({from:()=>({where:(q:typeof queries[number])=>{queries.push(q);return {orderBy:()=>({limit:()=>({offset:async()=>[]})})};}})}),update:()=>({set:()=>({where:(q:typeof queries[number])=>{queries.push(q);return {returning:async()=>[]};}})}),execute:async(q:typeof queries[number])=>{queries.push(q);return {rows:[]};}};
  const caller=createCallerFactory(memoryRouter)({user:{id},profile:{id,role:'client'},db,headers:new Headers()} as unknown as Context);
  await caller.list({userId:id,scope:'all'});await expect(caller.delete({userId:id,chunkId:id})).rejects.toMatchObject({code:'NOT_FOUND'});await caller.stats({userId:id});
  expect(queries).toHaveLength(3);for(const q of queries)expect(render(q)).toContain("IS DISTINCT FROM 'coach-assistant-confirmed'");
 });
});

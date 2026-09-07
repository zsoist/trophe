import { describe,it,expect } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { applyWorkoutSetRepsEdit,parseWorkoutSetRepsChange,type WorkoutSetRow } from '../lib/workout/set-edit-service';
describe('single-set correction writer',()=>{
 it('rejects invalid repetitions without coercion or extra fields',()=>{
  for(const reps of [0,-1,1.5,2147483648,NaN,Infinity,'10',null])expect(()=>parseWorkoutSetRepsChange({reps})).toThrow();
  expect(()=>parseWorkoutSetRepsChange({reps:10,weightKg:99})).toThrow();
  expect(parseWorkoutSetRepsChange({reps:2147483647})).toEqual({reps:2147483647});
 });
 it('writes only reps and binds exact ID, session, owner and previous reps',async()=>{
  const row={id:'set',sessionId:'session',reps:8,clientRequest:{reps:8},isPr:true} as unknown as WorkoutSetRow;
  let patch:unknown;let query:ReturnType<PgDialect['sqlToQuery']>|undefined;
  const tx={update:()=>({set:(next:unknown)=>{patch=next;return {where:(q:Parameters<PgDialect['sqlToQuery']>[0])=>{query=new PgDialect().sqlToQuery(q);return {returning:async()=>[{...row,...next as object}]};}};}})} as unknown as Parameters<typeof applyWorkoutSetRepsEdit>[0];
  expect(await applyWorkoutSetRepsEdit(tx,row,'owner',{reps:10})).toMatchObject({id:'set',sessionId:'session',reps:10,clientRequest:{reps:8},isPr:true});
  expect(patch).toEqual({reps:10});expect(query!.params).toEqual(['set','session','owner',8]);expect(query!.sql).toContain('EXISTS');expect(query!.sql).toContain('IS NOT DISTINCT FROM');
 });
});

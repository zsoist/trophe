import { describe,it,expect } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { parseFoodPreferences } from '../lib/food/preferences';
import { writeFoodPreferences } from '../lib/food/preference-service';
describe('shared Food preference writer',()=>{
 it('requires an explicit nullable declaration without coercion or unrelated fields',()=>{
  for(const value of [null,{}, {version:1},{version:1,dietPattern:'allergic'},{version:2,dietPattern:null},{version:1,dietPattern:null,allergy:true}])expect(()=>parseFoodPreferences(value)).toThrow();
  expect(parseFoodPreferences({version:1,dietPattern:null})).toEqual({version:1,dietPattern:null});
 });
 it('binds self/org and previous JSON, updating only food_preferences and timestamp',async()=>{
  let query:ReturnType<PgDialect['sqlToQuery']>|undefined;
  const tx={execute:async(q:Parameters<PgDialect['sqlToQuery']>[0])=>{query=new PgDialect().sqlToQuery(q);return {rows:[{food_preferences:{version:1,dietPattern:'vegetarian'}}]};}} as unknown as Parameters<typeof writeFoodPreferences>[0];
  const input={actorId:'self',subjectId:'self',organizationId:'org',before:{version:1,dietPattern:null},after:{version:1,dietPattern:'vegetarian'}};
  expect(await writeFoodPreferences(tx,input)).toEqual(input.after);
  expect(query!.params).toEqual([JSON.stringify(input.after),'self',JSON.stringify(input.before),'self','org']);
  expect(query!.sql).not.toMatch(/SET (notes|workout_preferences|target_)/);
  await expect(writeFoodPreferences(tx,{...input,subjectId:'foreign'})).rejects.toThrow('forbidden');
 });
});

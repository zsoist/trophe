import { describe,it,expect,vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { deriveFoodLogEdit, applyFoodLogEdit, type FoodLogRow, type FoodEditDatabase } from '@/lib/food/log-edit-service';
const row={id:'00000000-0000-4000-8000-000000000001',userId:'00000000-0000-4000-8000-000000000002',foodId:null,foodName:'Fixture rice',quantity:1,qtyG:'250',calories:500,proteinG:10,carbsG:100,fatG:5,fiberG:2,sugarG:1,source:'manual',sourceId:'turn:fixture',parseConfidence:null} as FoodLogRow;
function database(food:Record<string,number>[]=[],captureFails=false,returnBase:FoodLogRow=row) {
  const statements:string[]=[];const updates:unknown[]=[];
  const db={select:()=>({from:()=>({where:()=>({limit:async()=>food})})}),update:()=>({set:(next:object)=>{updates.push(next);return {where:()=>({returning:async()=>[{...returnBase,...next}]})};}}),insert:()=>({values:async()=>{if(captureFails)throw new Error('private correction payload');}}),execute:async(query:Parameters<PgDialect['sqlToQuery']>[0])=>{statements.push(new PgDialect().sqlToQuery(query).sql);return [];}} as unknown as FoodEditDatabase;
  return {db,statements,updates};
}
describe('extracted real Food calculation and writer with injected database operations',()=>{
  it('preserves grams-ratio and explicit macro precedence from the manual editor',async()=>{
    const {db}=database();
    expect(await deriveFoodLogEdit(db,row,{grams:150})).toMatchObject({qtyG:'150',quantity:1,calories:300,proteinG:6,carbsG:60,fatG:3});
    expect(await deriveFoodLogEdit(db,row,{grams:150,calories:123})).toMatchObject({calories:123,proteinG:6});
  });
  it('refuses a changed canonical derivation before any write despite an unchanged entry snapshot',async()=>{
    const food={kcalPer100g:200,proteinPer100g:4,carbPer100g:40,fatPer100g:2,fiberPer100g:0.8,sugarPer100g:0.4};
    const {db,updates}=database([food]);const existing={...row,foodId:'00000000-0000-4000-8000-000000000003'};
    const reviewed=await deriveFoodLogEdit(db,existing,{grams:150});
    food.kcalPer100g=210;
    await expect(applyFoodLogEdit({ctx:{db},existing,input:{grams:150},ownerUserId:row.userId!,correctedBy:row.userId!,expectedEdit:reviewed})).rejects.toMatchObject({code:'CONFLICT'});
    expect(updates).toEqual([]);
  });
  it('uses a savepoint for non-blocking correction capture inside the caller transaction',async()=>{
    const existing={...row,source:'photo_ai'};const {db,statements,updates}=database([],true,existing);const log=vi.spyOn(console,'error').mockImplementation(()=>{});
    try {
      const result=await applyFoodLogEdit({ctx:{db},existing,input:{grams:150},ownerUserId:row.userId!,correctedBy:row.userId!,transactional:true});
      expect(result.updated).toMatchObject({qtyG:'150',foodId:null,source:'photo_ai',sourceId:'turn:fixture'});expect(result.captured).toBe(false);expect(updates).toHaveLength(1);
      expect(statements).toEqual(['SAVEPOINT food_edit_correction','ROLLBACK TO SAVEPOINT food_edit_correction','RELEASE SAVEPOINT food_edit_correction']);
      expect(JSON.stringify(log.mock.calls)).not.toContain('private correction payload');
    } finally {log.mockRestore();}
  });
});

import { expect, it } from 'vitest';
import { chatStoredContentHash, chatTextHash } from './chat-final';
import { recalculateFoodReference } from './food-reference-continuity';
const food={referenceId:'chicken',name:'Chicken breast, cooked',brand:null,source:'usda',quality:'lab_verified',preparation:'cooked',kcalPer100g:165,proteinPer100g:31,conversions:[]};
it('binds structured reference metadata to the private content hash independent of jsonb key order',()=>{
 const first=[{name:'food.reference',input:{},output:{kind:'catalogue',options:[food]}}];
 const reordered=[{output:{options:[food],kind:'catalogue'},input:{},name:'food.reference'}];
 expect(chatStoredContentHash('answer',first)).toBe(chatStoredContentHash('answer',reordered));
 expect(chatStoredContentHash('answer',first)).not.toBe(chatStoredContentHash('answer',[{...first[0],output:{kind:'catalogue',options:[{...food,kcalPer100g:999}]}}]));
 expect(chatStoredContentHash('legacy',null)).toBe(chatTextHash('legacy'));
});
it('does not assign one bare portion to multiple prior foods',()=>{
 const result=recalculateFoodReference({kind:'catalogue',options:[food,{...food,referenceId:'rice',name:'Rice'}]},'200 g',false);
 expect(result?.answer).not.toContain('330 kcal');expect(result?.answer).toContain('one portion per food');
});

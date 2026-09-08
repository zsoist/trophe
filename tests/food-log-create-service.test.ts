import {describe,it,expect} from 'vitest';
import {photoAnalysisToParsedItems} from '../lib/food/photo-analysis';
import {foodLogAddSchema} from '../lib/food/log-create-validation';
import {insertReviewedPhotoFood,validateReviewedPhotoFood} from '../lib/food/log-create-service';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const photo={name:'Rice',estimated_grams:100,estimated_calories:130,estimated_protein_g:2.7,estimated_carbs_g:28,estimated_fat_g:0.3,estimated_fiber_g:0.4,estimated_sugar_g:0,confidence:0.8};
const item={...photoAnalysisToParsedItems([photo])[0],unit:'g',quantity:100,portion_explicit:true};
describe('reviewed photo creation writer',()=>{
 it('preserves add parsing behavior including trimming, stripping extras and paired quantities',()=>{const value={foodName:' Rice ',mealType:'lunch',calories:130,proteinG:2.7,carbsG:28,fatG:0.3,loggedDate:'2026-09-07',extra:'stripped'};expect(foodLogAddSchema.parse(value)).toEqual({...value,foodName:'Rice',extra:undefined});expect(foodLogAddSchema.safeParse({...value,qtyInput:1}).success).toBe(false);expect(foodLogAddSchema.safeParse({...value,loggedDate:'2026-02-30'}).success).toBe(false);});
 it('requires explicit grams and canonical estimates with numeric scale compatibility',()=>{expect(validateReviewedPhotoFood(item,'2026-09-07','lunch')).toMatchObject({qtyG:100,parseConfidence:0.75});for(const patch of [{portion_explicit:false},{quantity:1},{unit:'serving'},{db_food_id:id(9)},{source:'local_db'},{grams:100.001,quantity:100.001},{calories:10001}])expect(()=>validateReviewedPhotoFood({...item,...patch} as typeof item,'2026-09-07','lunch')).toThrow();});
 it('reuses native photo provenance and writes only one reviewed item on caller transaction',async()=>{let row:unknown;const tx={insert:()=>({values:(value:unknown)=>{row=value;return {returning:async()=>[value]};}})} as unknown as Parameters<typeof insertReviewedPhotoFood>[0];await insertReviewedPhotoFood(tx,{entryId:id(1),ownerUserId:id(2),observationId:id(3),itemIndex:0},{date:'2026-09-07',mealType:'lunch',item});expect(row).toMatchObject({id:id(1),userId:id(2),foodName:'Rice',source:'photo_ai',sourceId:`coach-photo:${id(3)}:0`,foodId:null,llmRecognized:false,unit:'g',quantity:100,qtyInput:'100',qtyInputUnit:'g',qtyG:'100',parseConfidence:0.75});expect(row).not.toHaveProperty('photoUrl');});
});

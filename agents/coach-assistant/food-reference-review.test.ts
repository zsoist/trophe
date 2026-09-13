import { expect, it } from 'vitest';
import { makeFoodReferenceLookup } from './food-reference';
import { snapshotFoodReference } from './food-reference-continuity';
import { foodReferenceReviewIntent, foodReferenceReviewOutput,adviceOptionIndex } from './food-reference-review';
it('accepts only an explicit bounded acceptance and never a negative or edited request',()=>{
 for(const text of ['yes','sí','log it','registra eso'])expect(foodReferenceReviewIntent(text)).toBe(true);
 for(const text of ['no','yes but change it','maybe','tomorrow','registra eso mañana'])expect(foodReferenceReviewIntent(text)).toBe(false);
});
it('prepares two Big Macs from the same full catalogue basis without filling missing nutrients',async()=>{
 const lookup=makeFoodReferenceLookup(async({unit})=>({food:{id:'00000000-0000-4000-8000-000000000020',nameEn:"McDONALD'S, BIG MAC",brand:"McDonald's",source:'usda',dataQuality:'label',kcalPer100g:257,proteinPer100g:11.8,carbPer100g:20.1,fatPer100g:14.5,fiberPer100g:1.6,sugarPer100g:4.1},conversionId:unit==='piece'?'piece-conversion':null,gramsPerUnit:unit==='piece'?215:1}));
 const reference=await lookup('Big Mac','dos Big Macs',new AbortController().signal);
 const snapshot=snapshotFoodReference({options:[reference]},'dos Big Macs');expect(snapshot).not.toBeNull();
 const output=foodReferenceReviewOutput(snapshot!);expect(output?.items[0]).toMatchObject({grams:430,calories:1105.1,protein_g:50.74,source:'local_db',db_source:'usda'});
 if(snapshot?.kind!=='catalogue')throw new Error('wrong snapshot');
 delete snapshot.options[0].reviewBasis;expect(foodReferenceReviewOutput(snapshot)).toBeNull();
});

it('keeps the selected canonical advice option unchanged and never guesses among options',()=>{
 const item={raw_text:'150g chicken',food_name:'Chicken',name_localized:'Chicken',quantity:150,unit:'g',grams:150,calories:248,protein_g:46.5,carbs_g:0,fat_g:5.4,fiber_g:0,sugar_g:0,confidence:.8,source:'llm_cot',food_state:'cooked',portion_explicit:true};
 const snapshot=snapshotFoodReference({kind:'advice',meals:[{name:'Chicken',items:[item]},{name:'More chicken',items:[{...item,grams:200,quantity:200,calories:330,protein_g:62}]}]});
 expect(snapshot?.kind).toBe('advice');if(snapshot?.kind!=='advice')throw Error('snapshot');
 expect(foodReferenceReviewOutput(snapshot)).toBeNull();
 expect(foodReferenceReviewOutput({...snapshot,selected:1})?.items).toEqual([{...item,grams:200,quantity:200,calories:330,protein_g:62}]);
 expect(foodReferenceReviewOutput({...snapshot,selected:2})).toBeNull();
 for(const text of ['la 1','Revisa la opción 1','Review option 1','Επιλογή 1'])expect(adviceOptionIndex(text)).toBe(0);
 for(const text of ['la 4','la 1 mañana','no la 1'])expect(adviceOptionIndex(text)).toBeNull();
});

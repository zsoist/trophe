import { expect, it } from 'vitest';
import { makeFoodReferenceLookup } from './food-reference';
import { snapshotFoodReference } from './food-reference-continuity';
import { foodReferenceReviewIntent, foodReferenceReviewOutput } from './food-reference-review';
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

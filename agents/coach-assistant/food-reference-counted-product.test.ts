import { expect, it } from 'vitest';
import { makeFoodReferenceLookup, renderFoodReferences, resolveFoodReferences } from './food-reference';

const lookup=makeFoodReferenceLookup(async ({unit})=>({food:{id:'bigmac-row',nameEn:"McDONALD'S, BIG MAC",brand:"McDonald's",source:'usda',dataQuality:'label',kcalPer100g:257,proteinPer100g:11.8},conversionId:unit==='piece'?'real-piece-row':null,gramsPerUnit:unit==='piece'?215:1}));
it.each(['dos Big Macs','two Big Macs','2 Big Macs'])('scales %s using the actual catalogue piece conversion',async text=>{
 const reference=await lookup('Big Mac',text,new AbortController().signal);
 expect(reference?.conversions).toContainEqual({unit:'piece',gramsPerUnit:215,conversionId:'real-piece-row'});
 const resolved=resolveFoodReferences([reference!],text)[0];
 expect(resolved.grams).toBe(430);
 expect(renderFoodReferences({options:[reference]},false,text)).toContain('1105.1 kcal');
 expect(renderFoodReferences({options:[reference]},false,text)).toContain('50.74 g');
});
it('does not turn a Double Big Mac or ambiguous count into two standard units',async()=>{
 const reference=(await lookup('Big Mac','2 Big Macs',new AbortController().signal))!;
 for(const text of ['one Double Big Mac','two or three Big Macs','dos o tres Big Macs','2 3 Big Macs','twenty two Big Macs','one hundred and two Big Macs','minus two Big Macs']) expect(resolveFoodReferences([reference],text)[0].grams).toBeNull();
 expect(resolveFoodReferences([{...reference,name:"McDONALD'S, DOUBLE BIG MAC"}],'two Big Macs')[0].grams).toBeNull();
 expect(resolveFoodReferences([{...reference,name:'Chicken breast'}],'two Big Macs')[0].grams).toBeNull();
 expect(resolveFoodReferences([{...reference,conversions:[]}],'two Big Macs')[0].grams).toBeNull();
});

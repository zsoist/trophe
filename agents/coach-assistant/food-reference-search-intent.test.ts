import { expect, it } from 'vitest';
import { foodReferenceSearchIntent } from './food-reference-search-intent';
it('preserves a literal branded product and explicit Colombian market',()=>{
 expect(foodReferenceSearchIntent('Big Mac','Macros de Big Mac en Colombia','es')).toEqual({product:'Big Mac',brand:'Big Mac',locale:'es-CO'});
});
it('does not infer a country from Spanish or make generic food depend on search',()=>{
 expect(foodReferenceSearchIntent('Chicken breast','150 g chicken breast','es')).toBeNull();
 expect(foodReferenceSearchIntent('Big Mac','Big Mac','es')).toMatchObject({locale:'es'});
});
it('never arbitrarily selects one of multiple markets',()=>{
 expect(foodReferenceSearchIntent('Big Mac','Big Mac Colombia vs USA','es')).toBeNull();
});

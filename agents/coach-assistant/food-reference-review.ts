import { isParsedFoodItem, type FoodParseOutput, type ParsedFoodItem } from '@/agents/schemas/food-parse';
import { foodReferenceSnapshotSchema, type FoodReferenceSnapshot } from './food-reference-continuity';
import { projectNativeFoodReference } from './food-reference-native-fallback';

/** Acceptance prepares an editable draft only. Apply still requires the existing review. */
export function foodReferenceReviewIntent(text:string):boolean {
 return /^(?:yes(?:,?\s+please)?|sí(?:,?\s+por\s+favor)?|si|(?:please\s+)?(?:log|record)\s+(?:it|that)|registra(?:r)?\s+(?:eso|esto)|regístralo|registralo)[.!?\s]*$/i.test(text.trim());
}
export function foodReferenceReviewOutput(raw:FoodReferenceSnapshot):FoodParseOutput|null {
 const parsed=foodReferenceSnapshotSchema.safeParse(raw);if(!parsed.success)return null;
 const snapshot=parsed.data;const items:ParsedFoodItem[]=[];
 if(snapshot.kind==='native'){
  if(snapshot.reviewItems?.length!==snapshot.references.length)return null;
  for(let i=0;i<snapshot.references.length;i++){
   const ref=snapshot.references[i],original=snapshot.reviewItems[i];
   if(projectNativeFoodReference(original)?.referenceId!==ref.referenceId||ref.nutrients.fiberG===null||ref.nutrients.sugarG===null)return null;
   items.push({...original,quantity:ref.portion.grams,unit:'g',grams:ref.portion.grams,calories:ref.nutrients.kcal,protein_g:ref.nutrients.proteinG,carbs_g:ref.nutrients.carbsG,fat_g:ref.nutrients.fatG,fiber_g:ref.nutrients.fiberG,sugar_g:ref.nutrients.sugarG,portion_explicit:true});
  }
 }else{
  if(snapshot.portions?.length!==snapshot.options.length)return null;
  for(let i=0;i<snapshot.options.length;i++){
   const ref=snapshot.options[i],basis=ref.reviewBasis,grams=snapshot.portions[i];
   if(!basis||!grams||basis.grams!==100||basis.calories!==ref.kcalPer100g||basis.protein_g!==ref.proteinPer100g||basis.db_food_id!==ref.catalogueId||basis.food_name!==ref.name)return null;
   const factor=grams/100;
   items.push({...basis,quantity:grams,unit:'g',grams,calories:basis.calories*factor,protein_g:basis.protein_g*factor,carbs_g:basis.carbs_g*factor,fat_g:basis.fat_g*factor,fiber_g:basis.fiber_g*factor,sugar_g:basis.sugar_g*factor,portion_explicit:true});
  }
 }
 return items.length&&items.every(isParsedFoodItem)?{items,needs_clarification:false}:null;
}

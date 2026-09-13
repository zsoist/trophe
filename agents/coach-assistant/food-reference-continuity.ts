import { z } from 'zod';
import { isParsedFoodItem, type ParsedFoodItem } from '@/agents/schemas/food-parse';
import { foodReferenceSchema, isFoodPortionFollowUp, parseFoodPortions, renderFoodReferences, resolveFoodReferences } from './food-reference';
import { nativeFoodReferenceSchema, rescaleNativeFoodReference } from './food-reference-native-fallback';
import { foodReferenceEvidenceSchema } from './food-reference-evidence';
import { renderNativeFoodReference } from './food-reference-native-render';
export const foodReferenceSnapshotSchema = z.discriminatedUnion('kind',[
 z.object({kind:z.literal('catalogue'),options:z.array(foodReferenceSchema).min(1).max(2),portions:z.array(z.number().positive().max(10000).nullable()).max(2).optional()}).strict(),
 z.object({kind:z.literal('native'),references:z.array(nativeFoodReferenceSchema).min(1).max(12),referenceEvidence:foodReferenceEvidenceSchema.nullable(),unverifiedMarkets:z.array(z.string().regex(/^[A-Z]{2}$/)).max(10).optional(),reviewItems:z.array(z.custom<ParsedFoodItem>(isParsedFoodItem)).max(12).optional()}).strict(),
]);
export type FoodReferenceSnapshot=z.infer<typeof foodReferenceSnapshotSchema>;
export const foodReferenceToolSchema=z.tuple([z.object({name:z.literal('food.reference'),input:z.object({}).strict(),output:foodReferenceSnapshotSchema}).strict()]);
export function snapshotFoodReference(result:unknown,userText?:string):FoodReferenceSnapshot|null{
 if(!result||typeof result!=='object')return null;
 if('native'in result&&result.native&&typeof result.native==='object'&&'ok'in result.native&&result.native.ok===true&&'outcome'in result.native&&result.native.outcome==='reference'&&'references'in result.native){
  const parsed=foodReferenceSnapshotSchema.safeParse({kind:'native',references:result.native.references,referenceEvidence:'referenceEvidence'in result?result.referenceEvidence:null,...('unverifiedMarkets'in result?{unverifiedMarkets:result.unverifiedMarkets}:{}),...('reviewItems'in result?{reviewItems:result.reviewItems}:{})});return parsed.success?parsed.data:null;
 }
 const parsed=foodReferenceSnapshotSchema.safeParse({kind:'catalogue',options:'options'in result?result.options:null});
 if(!parsed.success||parsed.data.kind!=='catalogue')return null;
 return {...parsed.data,...(userText?{portions:resolveFoodReferences(parsed.data.options,userText).map(portion=>portion.grams)}:{})};
}
export function recalculateFoodReference(raw:FoodReferenceSnapshot,text:string,spanish:boolean):{answer:string;result:unknown}|null{
 if(!isFoodPortionFollowUp(text))return null;
 const parsed=foodReferenceSnapshotSchema.safeParse(raw);if(!parsed.success)return null;
 const snapshot=parsed.data;
 if(snapshot.kind==='catalogue')return {answer:renderFoodReferences({options:snapshot.options},spanish,text),result:{options:snapshot.options}};
 const portion=parseFoodPortions(text)[0];
 if(snapshot.references.length!==1)return {answer:spanish?'¿Para cuál alimento quieres esa cantidad?':'Which food should use that amount?',result:{native:{ok:true,outcome:'clarification_required',question:null,partial:snapshot.references}}};
 if(portion.kind!=='mass'||!portion.grams)return {answer:spanish?'Indica la cantidad en gramos para conservar la misma referencia.':'Specify grams to keep the same reference.',result:{native:{ok:true,outcome:'clarification_required',question:null,partial:snapshot.references}}};
 const scaled=rescaleNativeFoodReference(snapshot.references[0],portion.grams);
 if(!scaled)return {answer:spanish?'Esa cantidad está fuera del rango de esta referencia.':'That amount is outside this reference’s supported range.',result:{native:{ok:false,outcome:'invalid_input',detail:'quantity'}}};
 const result={native:{ok:true,outcome:'reference',references:[scaled]},referenceEvidence:snapshot.referenceEvidence,...(snapshot.unverifiedMarkets?{unverifiedMarkets:snapshot.unverifiedMarkets}:{}),...(snapshot.reviewItems?{reviewItems:snapshot.reviewItems}:{})};
 return {answer:renderNativeFoodReference(result,spanish)!,result};
}

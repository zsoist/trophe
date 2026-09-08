import { z } from 'zod';
import type { db } from '@/db/client';
import { foodLog } from '@/db/schema/food';
import { isParsedFoodItem,type ParsedFoodItem } from '@/agents/schemas/food-parse';
import { buildReviewedFoodLogEntries } from '@/lib/food/reviewed-log-entry';
import { foodLogAddSchema } from './log-create-validation';
type Transaction=Parameters<Parameters<typeof db.transaction>[0]>[0];
/** One explicitly reviewed photo-derived item; no client-supplied identity/source. */
export function validateReviewedPhotoFood(item:ParsedFoodItem,date:string,mealType:unknown){
 if(!isParsedFoodItem(item)||item.source!=='ai_estimate'||item.portion_explicit!==true||item.unit!=='g'||item.quantity!==item.grams||item.db_food_id!=null)throw new Error('invalid_input');
 // qty_g and qty_input are numeric(8,2); refuse silent portion rounding.
 if(Math.abs(Math.round(item.grams*100)-item.grams*100)>1e-7)throw new Error('invalid_input');
 const input=foodLogAddSchema.parse({foodName:item.name_localized||item.food_name,mealType,calories:item.calories,proteinG:item.protein_g,carbsG:item.carbs_g,fatG:item.fat_g,fiberG:item.fiber_g,qtyG:item.grams,qtyInput:item.quantity,qtyInputUnit:item.unit,parseConfidence:item.confidence,loggedDate:date});
 return input;
}
/** Reuses the native reviewed-entry mapping. Auth, proposal/receipt and transaction
 * ownership belong to the caller. Does not call models or write correction labels.
 */
export async function insertReviewedPhotoFood(tx:Transaction,scope:{entryId:string;ownerUserId:string;observationId:string;itemIndex:number},input:{date:string;mealType:unknown;item:ParsedFoodItem}){
 const ids=z.object({entryId:z.string().uuid(),ownerUserId:z.string().uuid(),observationId:z.string().uuid(),itemIndex:z.number().int().min(0).max(7)}).strict().parse(scope);
 const validated=validateReviewedPhotoFood(input.item,input.date,input.mealType);
 const [entry]=buildReviewedFoodLogEntries({userId:ids.ownerUserId,date:validated.loggedDate,mealType:validated.mealType,inputSource:'photo',items:[input.item]});
 const [created]=await tx.insert(foodLog).values({id:ids.entryId,userId:entry.user_id,loggedDate:entry.logged_date,mealType:entry.meal_type,foodName:entry.food_name,quantity:entry.quantity,unit:entry.unit,calories:entry.calories,proteinG:entry.protein_g,carbsG:entry.carbs_g,fatG:entry.fat_g,fiberG:entry.fiber_g,sugarG:entry.sugar_g,parseConfidence:entry.parse_confidence,qtyInput:String(entry.qty_input),qtyInputUnit:entry.qty_input_unit,qtyG:String(entry.qty_g),foodId:entry.food_id,llmRecognized:entry.llm_recognized,source:entry.source,sourceId:`coach-photo:${ids.observationId}:${ids.itemIndex}`}).returning();
 if(!created)throw new Error('food_insert_missing');return created;
}

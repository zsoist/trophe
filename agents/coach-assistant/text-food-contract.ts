import { z } from 'zod';
import { isParsedFoodItem, type ParsedFoodItem } from '@/agents/schemas/food-parse';
import { FOOD_PARSE_MAX_ITEMS } from '@/agents/food-parse/pipeline-budget';
const uuid=z.string().uuid(), hash=z.string().regex(/^[a-f0-9]{64}$/);
const grams=z.number().finite().positive().max(10000).refine(v=>Math.abs(v*100-Math.round(v*100))<1e-7);
const base={version:z.literal('coach-assistant.v2'),conversationId:uuid,turnId:uuid};
export const textFoodPortionsSchema=z.object({loggedDate:z.iso.date(),mealType:z.enum(['breakfast','lunch','dinner','snack','pre_workout','post_workout']),items:z.array(z.object({index:z.number().int().min(0).max(FOOD_PARSE_MAX_ITEMS-1),grams}).strict()).min(1).max(FOOD_PARSE_MAX_ITEMS)}).strict();
export const textFoodOperationSchema=z.discriminatedUnion('operation',[
 z.object({...base,operation:z.literal('text.food.parse'),requestId:uuid,text:z.string().trim().min(1).max(500),language:z.enum(['en','es','el','fr','de','it','pt','nl'])}).strict(),
 z.object({...base,operation:z.literal('text.food.propose'),draftId:uuid,hash,after:textFoodPortionsSchema}).strict(),
 z.object({...base,operation:z.literal('text.food.apply'),proposalId:uuid,hash,actionId:uuid,reviewed:z.literal(true)}).strict(),
 z.object({...base,operation:z.literal('text.food.receipt'),actionId:uuid}).strict(),
 z.object({...base,operation:z.literal('text.food.read'),proposalId:uuid}).strict(),
]);
export type TextFoodOperation=z.infer<typeof textFoodOperationSchema>;
export const textFoodItemsSchema=z.array(z.custom<ParsedFoodItem>(isParsedFoodItem)).min(1).max(FOOD_PARSE_MAX_ITEMS);
export const textFoodDraftSchema=z.object({kind:z.literal('parsed'),id:uuid,hash,action:z.literal('food.text.create'),rawText:z.string().max(500),items:z.array(z.custom<ParsedFoodItem>(isParsedFoodItem)).max(FOOD_PARSE_MAX_ITEMS),clarification:z.string().max(500).nullable(),warnings:z.array(z.string().max(500)).max(12),expiresAt:z.string().datetime({offset:true})}).strict().refine(value=>value.items.length>0||Boolean(value.clarification?.trim()));
export const textFoodProposalSchema=z.object({kind:z.literal('review'),id:uuid,hash,action:z.literal('food.text.create'),draftId:uuid,draftHash:hash,after:textFoodPortionsSchema,items:textFoodItemsSchema,entryIds:z.array(uuid).min(1).max(FOOD_PARSE_MAX_ITEMS),expiresAt:z.string().datetime({offset:true}),reviewRequired:z.literal(true)}).strict();
export type TextFoodDraft=z.infer<typeof textFoodDraftSchema>;
export type TextFoodProposal=z.infer<typeof textFoodProposalSchema>;
export type TextFoodScope={actorId:string;subjectId:string;organizationId:string;signal:AbortSignal};
export type TextFoodReceipt={actionId:string;proposalId:string;hash:string;entryIds:string[];loggedDate:string;recordedAt:string;status:'applied'};
export type TextFoodResult={ok:false;error:'forbidden'|'invalid_input'|'not_connected'|'not_found'|'expired'|'conflict'|'uncertain'|'clarification_required'}|{ok:true;draft:TextFoodDraft}|{ok:true;proposal:TextFoodProposal}|{ok:true;receipt:TextFoodReceipt;refresh:'refetch'};

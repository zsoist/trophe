import type { CoachReceipt } from './contracts';

export interface FoodEntryValues {
  loggedDate:string;foodName:string;foodId:string|null;source:string|null;sourceId:string|null;grams:number|null;quantity:number;
  calories:number;proteinG:number;carbsG:number;fatG:number;fiberG:number|null;sugarG:number|null;
}
export interface FoodEntrySnapshot extends FoodEntryValues { entryId:string;version:string }
export interface FoodQuantityProposal {
  id:string;hash:string;action:'food.quantity.update';resource:{kind:'food_entry';id:string;version:string};
  before:FoodEntryValues;after:FoodEntryValues;expectedVersion:string;precondition:string;expiresAt:string;reviewRequired:true;
}
interface FoodOperationBase {version:'coach-assistant.v2';conversationId:string;turnId:string;clientId?:string}
export type FoodQuantityOperation=FoodOperationBase&(
  {operation:'food.resolve';entryHintId?:string;loggedDateHint?:string;expectedPreviousGrams?:number}|
  ({entryId:string}&(
    {operation:'food.read'}|
    {operation:'food.propose';resourceVersion:string;after:{grams:number}}|
    {operation:'food.apply';proposalId:string;hash:string;actionId:string;resourceVersion:string;reviewed:true}|
    {operation:'food.receipt';actionId:string}
  ))
);
export interface FoodQuantityRefresh {entryId:string;loggedDate:string;previousVersion:string;version:string;strategy:'refetch'}
export type FoodQuantityResult={version:'coach-assistant.v2';storage:'database'}&(
  {ok:false;error:'invalid_input'|'forbidden'|'not_found'|'ambiguous_selection'|'version_conflict'|'expired'|'idempotency_conflict'|'cancelled'|'uncertain'}|
  {ok:true;snapshot:FoodEntrySnapshot}|
  {ok:true;proposal:FoodQuantityProposal}|
  {ok:true;receipt:CoachReceipt;refresh?:FoodQuantityRefresh;change?:{beforeGrams:number;afterGrams:number}}
);

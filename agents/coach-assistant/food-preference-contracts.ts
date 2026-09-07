import type { CoachReceipt } from './contracts';

import type { FoodPreferences } from '@/lib/food/preferences';
export type FoodPreferenceValues=FoodPreferences;
export interface FoodPreferenceSnapshot {profileId:string;version:string;preferences:FoodPreferences}
export interface FoodPreferenceProposal {
 id:string;hash:string;action:'food.preference.update';resource:{kind:'food_preference';id:string;version:string};
 before:FoodPreferenceValues;after:FoodPreferenceValues;precondition:string;expiresAt:string;reviewRequired:true;
}
interface Base {version:'coach-assistant.v2';conversationId:string;turnId:string;clientId?:string}
export type FoodPreferenceOperation=Base&(
 {operation:'diet.read';profileId:string}|
 {operation:'diet.propose';profileId:string;resourceVersion:string;after:FoodPreferences}|
 {operation:'diet.apply';profileId:string;proposalId:string;hash:string;actionId:string;resourceVersion:string;reviewed:true}|
 {operation:'diet.receipt';profileId:string;actionId:string}
);
export interface FoodPreferenceRefresh {profileId:string;previousVersion:string;version:string;strategy:'refetch';discardDerivedContext:true}
export type FoodPreferenceResult={version:'coach-assistant.v2';storage:'database'}&(
 {ok:false;error:'invalid_input'|'forbidden'|'not_found'|'not_connected'|'version_conflict'|'expired'|'idempotency_conflict'|'cancelled'|'uncertain'}|
 {ok:true;snapshot:FoodPreferenceSnapshot}|
 {ok:true;proposal:FoodPreferenceProposal}|
 {ok:true;receipt:CoachReceipt;refresh?:FoodPreferenceRefresh}
);

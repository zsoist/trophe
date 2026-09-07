import type {FoodPreferenceResult} from './food-preference-contracts';
import {literal,enumeration,stringLength,object,nullable,uuid,datetime,hash} from './result-reader-checks';
const version=stringLength(1,128);
const preferences=object({version:literal(1),dietPattern:nullable(enumeration(['omnivore','vegetarian','vegan','pescatarian']))});
const proposal=object({id:uuid,hash,action:literal('food.preference.update'),resource:object({kind:literal('food_preference'),id:uuid,version}),before:preferences,after:preferences,precondition:version,expiresAt:datetime,reviewRequired:literal(true)});
const receipt=object({id:uuid,actionId:uuid,proposalId:uuid,status:enumeration(['applied','rejected','uncertain']),resourceVersion:nullable(version),recordedAt:datetime});
const refresh=object({profileId:uuid,previousVersion:version,version,strategy:literal('refetch'),discardDerivedContext:literal(true)});
const base={version:literal('coach-assistant.v2'),storage:literal('database')};
const variants=[
 object({...base,ok:literal(false),error:enumeration(['invalid_input','forbidden','not_found','not_connected','version_conflict','expired','idempotency_conflict','cancelled','uncertain'])}),
 object({...base,ok:literal(true),snapshot:object({profileId:uuid,version,preferences})}),
 object({...base,ok:literal(true),proposal}),
 object({...base,ok:literal(true),receipt,refresh},['refresh']),
];
/** JSON shape only. Profile identity, receipt matching and authorization stay on server. */
export function readFoodPreferenceResult(value:unknown):FoodPreferenceResult|null{return variants.some(check=>check(value))?value as FoodPreferenceResult:null;}
export const foodPreferenceResultReader={safeParse(value:unknown):{success:true;data:FoodPreferenceResult}|{success:false}{const data=readFoodPreferenceResult(value);return data?{success:true,data}:{success:false};}};

import type { FoodQuantityResult } from './food-contracts';
import { foodDateTimePattern } from './food-datetime';

// Browser JSON response validation only. Server foodQuantityResultSchema remains authoritative.
type Check=(value:unknown)=>boolean;
const literal=(expected:unknown):Check=>value=>value===expected;
const enumeration=(values:readonly string[]):Check=>value=>typeof value==='string'&&values.includes(value);
const string=(min:number,max:number):Check=>value=>typeof value==='string'&&value.length>=min&&value.length<=max;
const numeric:Check=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const nullable=(check:Check):Check=>value=>value===null||check(value);
const pattern=(expression:RegExp):Check=>value=>typeof value==='string'&&expression.test(value);
const object=(fields:Record<string,Check>,optional:readonly string[]=[]):Check=>value=>{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const row=value as Record<string,unknown>;
 return Object.keys(row).every(key=>Object.hasOwn(fields,key))&&Object.entries(fields).every(([key,check])=>optional.includes(key)&&row[key]===undefined||check(row[key]));
};
// Mirrors installed Zod v4 RFC UUID, calendar date and datetime(offset:true) rules.
const uuid=pattern(/^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/);
const dateSource=String.raw`(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))`;
const date=pattern(new RegExp(`^${dateSource}$`));
const datetime=pattern(foodDateTimePattern);
const version=string(1,128);
const values={loggedDate:date,foodName:string(1,200),foodId:nullable(uuid),source:nullable(string(1,80)),sourceId:nullable(string(1,500)),grams:nullable(value=>numeric(value)&&value!==0),quantity:numeric,calories:numeric,proteinG:numeric,carbsG:numeric,fatG:numeric,fiberG:nullable(numeric),sugarG:nullable(numeric)};
const proposal=object({id:uuid,hash:pattern(/^[a-f0-9]{64}$/),action:literal('food.quantity.update'),resource:object({kind:literal('food_entry'),id:uuid,version}),before:object(values),after:object(values),expectedVersion:version,precondition:version,expiresAt:datetime,reviewRequired:literal(true)});
const receipt=object({id:uuid,actionId:uuid,proposalId:uuid,status:enumeration(['applied','rejected','uncertain']),resourceVersion:nullable(version),recordedAt:datetime});
const refresh=object({entryId:uuid,loggedDate:date,previousVersion:version,version,strategy:literal('refetch')});
const change:Check=value=>object({beforeGrams:numeric,afterGrams:numeric})(value)
 && (value as {beforeGrams:number;afterGrams:number}).beforeGrams>0
 && (value as {beforeGrams:number;afterGrams:number}).afterGrams>0
 && (value as {beforeGrams:number;afterGrams:number}).beforeGrams<=10000
 && (value as {beforeGrams:number;afterGrams:number}).afterGrams<=10000
 && (value as {beforeGrams:number;afterGrams:number}).beforeGrams!==(value as {beforeGrams:number;afterGrams:number}).afterGrams;
const base={version:literal('coach-assistant.v2'),storage:literal('database')};
const variants=[
 object({...base,ok:literal(false),error:enumeration(['invalid_input','forbidden','not_found','ambiguous_selection','version_conflict','expired','idempotency_conflict','cancelled','uncertain'])}),
 object({...base,ok:literal(true),snapshot:object({...values,entryId:uuid,version})}),
 object({...base,ok:literal(true),proposal}),
 object({...base,ok:literal(true),receipt,refresh,change},['refresh','change']),
];
/** Accepts parsed JSON; does not authorize, calculate, mutate or repair a response. */
export function readFoodQuantityResult(value:unknown):FoodQuantityResult|null {
 return variants.some(check=>check(value))?value as FoodQuantityResult:null;
}
/** Drop-in safeParse shape for the existing browser client. Error details stay server-side. */
export const foodQuantityResultReader={safeParse(value:unknown):{success:true;data:FoodQuantityResult}|{success:false}{
 const data=readFoodQuantityResult(value);return data?{success:true,data}:{success:false};
}};

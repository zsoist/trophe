/** Small JSON-only browser checks. No schema/auth/database/provider dependency. */
export type JsonCheck=(value:unknown)=>boolean;
export const literal=(expected:unknown):JsonCheck=>value=>value===expected;
export const enumeration=(values:readonly string[]):JsonCheck=>value=>typeof value==='string'&&values.includes(value);
export const stringLength=(min:number,max:number):JsonCheck=>value=>typeof value==='string'&&value.length>=min&&value.length<=max;
export const pattern=(expression:RegExp):JsonCheck=>value=>typeof value==='string'&&expression.test(value);
export const nullable=(check:JsonCheck):JsonCheck=>value=>value===null||check(value);
export const array=(check:JsonCheck,max:number):JsonCheck=>value=>Array.isArray(value)&&value.length<=max&&Array.from(value).every(check);
export const object=(fields:Record<string,JsonCheck>,optional:readonly string[]=[]):JsonCheck=>value=>{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const row=value as Record<string,unknown>;
 return Object.keys(row).every(key=>Object.hasOwn(fields,key))&&Object.entries(fields).every(([key,check])=>optional.includes(key)&&row[key]===undefined||check(row[key]));
};
// Parity with installed Zod v4 UUID and calendar-aware datetime(offset:true).
export const uuid=pattern(/^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/);
const dateSource=String.raw`(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))`;
export const datetime=pattern(new RegExp(`^${dateSource}T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z|[+-](?:[01]\\d|2[0-3]):[0-5]\\d))$`));
export const hash=pattern(/^[a-f0-9]{64}$/);

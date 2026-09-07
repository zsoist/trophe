/** Isolated profile contract. This preference is not an allergy or a nutrition target. */
export const FOOD_DIET_PATTERNS=['omnivore','vegetarian','vegan','pescatarian'] as const;
export interface FoodPreferences {version:1;dietPattern:typeof FOOD_DIET_PATTERNS[number]|null}
export function parseFoodPreferences(value:unknown):FoodPreferences {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('invalid_input');
 const record=value as Record<string,unknown>;
 if(Object.keys(record).length!==2||!Object.hasOwn(record,'version')||!Object.hasOwn(record,'dietPattern')||record.version!==1||!(record.dietPattern===null||FOOD_DIET_PATTERNS.some(pattern=>pattern===record.dietPattern)))throw new Error('invalid_input');
 return {version:1,dietPattern:record.dietPattern as FoodPreferences['dietPattern']};
}

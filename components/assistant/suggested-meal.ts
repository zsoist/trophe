import type {CanonicalMealSlot} from '@/lib/food/meal-slot';
/** Editable suggestion from explicit user meal words, never from the clock. */
export function suggestedMeal(messages:readonly string[]):CanonicalMealSlot|undefined {
 const patterns:[CanonicalMealSlot,RegExp][]=[
  ['breakfast',/\b(?:(?:for|at) breakfast|(?:para|en) (?:el )?desayuno|desayune|desayunar)\b|^(?:breakfast|desayuno)\s*[:.!?]?$|πρωιν/u],
  ['lunch',/\b(?:(?:for|at) lunch|(?:para|en) (?:el )?almuerzo|almorce|almorzar)\b|^(?:lunch|almuerzo)\s*[:.!?]?$|μεσημεριαν/u],
  ['dinner',/\b(?:(?:for|at) (?:dinner|supper)|(?:para|en) (?:la )?cena|cenar|cene)\b|^(?:dinner|cena)\s*[:.!?]?$|βραδιν/u],
  ['snack',/\b(?:snack|meriend\w*|merend\w*)\b|σνακ/u],
  ['pre_workout',/\b(?:before (?:my |a )?workout|antes de entrenar)\b/],
  ['post_workout',/\b(?:after (?:my |a )?workout|despues de entrenar)\b/],
 ];
 for(const message of [...messages].reverse()){
  const text=message.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
  if(/\b(?:breakfast|lunch|dinner|desayuno|almuerzo|cena)\s+(?:and|or|y|o)\s+(?:breakfast|lunch|dinner|desayuno|almuerzo|cena)\b/.test(text))return undefined;
  const matches=patterns.filter(([,pattern])=>pattern.test(text));
  if(matches.length>1)return undefined;
  if(matches.length===1)return matches[0][0];
 }
 return undefined;
}

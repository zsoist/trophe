import { textFoodIntakeIntent } from './text-food-intent';
import type { CoachConversationRequest } from './contracts';
export type NutritionIntent = 'log' | 'advise' | 'analyze' | 'chat';
const normalize=(text:string)=>text.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
const advice=/\b(?:suggest(?:ions?)?|recommend(?:ations?)?|ideas?|what (?:should|could|can) i (?:eat|have)|que (?:deberia|puedo|podria) (?:comer|cenar|desayunar|almorzar)|sugerencias?|recomiend\w*|aconsej\w*|opciones? (?:para|de)|ayudame a (?:elegir|comer))\b/;
const profile=/\b(?:mi perfil|me conoces|mis (?:objetivos|metas|preferencias)|my profile|my (?:goals|targets|preferences)|about me)\b/;
const analysis=/\b(?:cuantas? (?:calorias|proteinas)|how (?:many|much) (?:calories|protein)|macros? (?:in|of|de)|calorias (?:de|en)|calories (?:in|of))\b|\b\d+(?:[.,]\d+)?\s*(?:g|kg|grams?|gramos?)\b/;
/** Narrow routing guard over the existing intake detector and capability selector.
 * It never authorizes identity, writes, or promotes historical text to records. */
export function nutritionIntent(input:Pick<CoachConversationRequest,'message'|'history'>):NutritionIntent {
 const text=normalize(input.message);
 if(/τι (?:να|πρεπει να) φαω|προτεινε|προτασεις|το προφιλ μου/u.test(text))return 'advise';
 if(textFoodIntakeIntent(input.message))return 'log';
 if(advice.test(text)||profile.test(text))return 'advise';
 if(analysis.test(text))return 'analyze';
 const history=(input.history??[]).filter(item=>item.role==='user').slice(-4);
 const followsAdvice=history.some(item=>advice.test(normalize(item.text))||profile.test(normalize(item.text)));
 if(followsAdvice&&text.length<=220&&!/\b(?:workout|training|exercise|entren|ejercicio|series|reps|chat|clima|weather)\b/.test(text)&&/\b(?:cena|cenar|dinner|proteina|protein|carne|meat|pollo|chicken|pescado|fish|vegetarian\w*|vegano?|sin|con|with|without|prefiero|prefer|tambien|also)\b/.test(text))return 'advise';
 return 'chat';
}
export function conversationLanguage(message:string,fallback:string,history:CoachConversationRequest['history']=[]):string {
 const prior=(history??[]).filter(item=>item.role==='user').slice(-4).reduce((language,item)=>conversationLanguage(item.text,language),fallback);
 const text=normalize(message);
 if(/\p{Script=Greek}/u.test(message))return 'el';
 if(/[¿¡]/.test(message)||/\b(?:que|como|deberia|cenar|cena|dame|sugerencias|conoces|perfil|carne|proteina|almuerzo|comer|registra|calorias|fuente)\b/.test(text))return 'es';
 if(/\b(?:what|how|should|give|suggestions|profile|dinner|protein|chicken|calories|please|with|without)\b/.test(text))return 'en';
 return prior;
}

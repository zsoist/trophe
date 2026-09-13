import {conversationLanguage} from '@/agents/coach-assistant/nutrition-intent';
import {globalCoachTranslations} from '@/lib/locales/global-coach';
import type {CoreLanguage} from '@/lib/types';
/** Use the failed turn's language without changing the account preference. */
export function conversationStatusText(key:string,message:string,fallback:string):string {
 const row=globalCoachTranslations[key];
 const language=conversationLanguage(message,fallback) as CoreLanguage;
 return row?.[language]??row?.en??key;
}

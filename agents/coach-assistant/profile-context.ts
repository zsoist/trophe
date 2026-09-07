import { selectConversationScope } from './conversation-scope';
import { createHash } from 'node:crypto';
import { workoutPreferencesSchema } from '@/lib/workout/preferences';
import type { PersonalContextRow } from './repository';
import type { CoachConversationRequest } from './contracts';
/** Only persisted valid intake counts as declared. Never call the defaults parser. */
export function workoutProfileVersion(row:PersonalContextRow){
 const parsed=workoutPreferencesSchema.safeParse(row.preferences);
 return createHash('sha256').update(JSON.stringify({revision:row.preferencesVersion??null,preferences:parsed.success?parsed.data:null})).digest('hex');
}
export function projectWorkoutProfile(row:PersonalContextRow,input:CoachConversationRequest){
 const parsed=workoutPreferencesSchema.safeParse(row.preferences);
 const surface=input.context?.includeScreen?input.context.surface:undefined;
 const training=selectConversationScope(input).domain!=='food'||surface==='profile';
 return {version:'coach-assistant.profile-context.v1' as const,resourceVersion:workoutProfileVersion(row),status:parsed.success?'available' as const:'unknown' as const,source:'stored_workout_preferences' as const,
 preferences:parsed.success?(training?parsed.data:{durationMinutes:parsed.data.durationMinutes}):null,
 units:{storedWeight:'kg' as const,energy:'kcal' as const,protein:'g' as const,preferredWeight:null,requestedDisplayWeight:input.context?.displayWeightUnit??null,displaySource:input.context?.displayWeightUnit?'request_hint' as const:null,preferenceStatus:'not_connected' as const,reason:'weight_unit_exists_only_in_browser_storage' as const}};
}

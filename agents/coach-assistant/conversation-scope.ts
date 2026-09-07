import type { CoachConversationRequest, CoachEvidence } from './contracts';

/** Deterministic offline hints only: this does not authorize data or interpret intent with a model. */
export function selectConversationScope(input: CoachConversationRequest) {
      const text = input.message.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
      const previous = [...(input.history ?? [])].reverse().find(item=>item.role==='user')?.text.toLowerCase() ?? '';
      const followUp = /^(and|what about|how about|y |¿?y |et |also|tambien)\b/.test(text);
      const hint = followUp ? `${previous}\n${text}` : text;
      const intent: 'today' | 'week' = /today|hoy|aujourd|σημερα/.test(hint) ? 'today' : 'week';
      const surface = input.context?.includeScreen ? input.context.surface : null;
      const exerciseId = input.context?.includeScreen && input.context.entity?.kind === 'exercise' ? input.context.entity.id : undefined;
      const mentionsFood = /food|meal|nutri|calori|protein|comid|aliment|recip|recet/.test(hint);
      const mentionsWorkout = /workout|train|exercise|sets|reps|entren|ejerc|series|plan/.test(hint);
      const foodOnly = mentionsFood && !mentionsWorkout || !mentionsFood && !mentionsWorkout && ['food','recipe'].includes(surface ?? '');
      const workoutOnly = mentionsWorkout && !mentionsFood || !mentionsFood && !mentionsWorkout && ['workout','plan','live','library','exercise','atlas'].includes(surface ?? '');
  return { intent, surface, exerciseId, domain: foodOnly ? 'food' as const : workoutOnly ? 'workout' as const : 'both' as const };
}

export function evidenceMatchesScope(source: CoachEvidence['source'], domain: 'food' | 'workout' | 'both'): boolean {
  return domain === 'food' ? source === 'nutrition' : domain === 'workout' ? source !== 'nutrition' : true;
}

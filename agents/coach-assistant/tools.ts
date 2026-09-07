import type { CoachEvidence, CoachRequest } from './contracts';
import { weekdayFor, windowFor } from './context';
import type { CoachRepository, ReadArgs, Rows } from './repository';

export interface EvidenceOptions { actorId: string; repository: CoachRepository; now: Date; signal: AbortSignal; includeNutrition?:boolean; onDataRead?: (count:number)=>void }

export async function collectEvidence(input: CoachRequest, options: EvidenceOptions) {
  const { repository, actorId, signal } = options;
  signal.throwIfAborted();
  const subjectId = input.clientId ?? actorId;
  const context = await repository.authorize(actorId, subjectId, signal);
  if (context.subjectId !== subjectId || context.actorId !== actorId) throw new Error('forbidden');
  const window = windowFor(input.intent, context.timezone, options.now);
  const facts: CoachEvidence[] = [];
  const limitations: string[] = [];
  let reads = 0;
  const read = async <T>(method: (args: ReadArgs) => Promise<Rows<T>>, limit: number): Promise<Rows<T>> => {
    signal.throwIfAborted();
    const fresh = await repository.authorize(actorId, subjectId, signal);
    if (JSON.stringify(fresh) !== JSON.stringify(context)) throw new Error('forbidden');
    if (++reads > 4) throw new Error('context_limit');
    options.onDataRead?.(reads);
    const result = await method({ context: fresh, window, limit, signal });
    signal.throwIfAborted();
    const after = await repository.authorize(actorId, subjectId, signal);
    if (JSON.stringify(after) !== JSON.stringify(context)) throw new Error('forbidden');
    return { rows: result.rows.slice(0, limit), truncated: result.truncated || result.rows.length > limit };
  };
  const inScope = (row: { userId: string; date: string }) => {
    if (row.userId !== subjectId) throw new Error('forbidden');
    return row.date >= window.start && row.date <= window.end;
  };
  const add = (id: string, source: CoachEvidence['source'], sourceIds: string[], value: number | string, unit: string | null, statement: string, partial = false) => {
    const ids=[...new Set(sourceIds)];
    const referencesPartial=ids.length>256;
    if(referencesPartial)limitations.push(`evidence_refs_truncated:${id}`);
    facts.push({ id, source, sourceIds: ids.slice(0, 256), value, unit,
      statement:referencesPartial?`${statement} Evidence references are partial.`:statement, window,
      completeness: partial||referencesPartial ? 'partial' : 'complete' });
  };
  const unique = <T extends { id: string }>(rows: T[]) => {
    const result = new Map<string,T>();
    for (const row of rows) {
      if (result.has(row.id) && JSON.stringify(result.get(row.id)) !== JSON.stringify(row)) throw new Error('query_failed');
      result.set(row.id,row);
    }
    return [...result.values()];
  };
  const finite = (n: number | null): n is number => n != null && Number.isFinite(n) && n >= 0;
  const round = (n: number) => Math.round(n * 100) / 100;
  let dailyPlan: { sets:number;reps:number|null;templates:string[];sourceIds:string[] } | undefined;

  const plans = await read(args => repository.plan(args), 2);
  for (const row of plans.rows) if (row.userId !== subjectId) throw new Error('forbidden');
  const active = unique(plans.rows).filter(row => row.status === 'active' && (!row.startsOn || row.startsOn <= window.end));
  if (plans.truncated || active.length > 1) limitations.push('ambiguous_plan');
  else if (active.length === 1) {
    const plan = active[0];
    const days = unique(plan.days).filter(day => day.weekday === weekdayFor(window.end));
    const targetSets = days.reduce((sum, day) => sum + (finite(day.targetSets) ? day.targetSets : 0), 0);
    add('plan.sets', 'plan', [plan.id, ...days.map(day => day.id)], targetSets, 'sets', `The current plan schedules ${targetSets} sets for ${window.end}. This is planned work, not recorded completion.`);
    const exactReps=days.length>0&&days.every(day=>finite(day.targetReps??null));
    const reps=exactReps?days.reduce((sum,day)=>sum+day.targetReps!,0):null;
    dailyPlan={sets:targetSets,reps,templates:days.flatMap(day=>day.templateId?[day.templateId]:[]),sourceIds:[plan.id,...days.map(day=>day.id)]};
    if(reps!==null)add('plan.reps','plan',dailyPlan.sourceIds,reps,'reps',`The plan specifies ${reps} repetitions for ${window.end}. This is a target, not recorded completion.`);
  } else limitations.push('no_current_plan');

  const sessions = await read(args => repository.workouts(args), 32);
  const keys = new Set<string>();
  const scoped = unique(sessions.rows).filter(inScope).filter(row => {
    const key = row.idempotencyKey ?? row.id;
    if (keys.has(key)) return false;
    keys.add(key); return true;
  });
  const completed = scoped.filter(row => row.completedAt != null);
  const sessionIds = completed.map(row => row.id);
  if (sessions.truncated) limitations.push('workouts_truncated');
  if (!scoped.length) limitations.push('no_workout_records');
  else {
    add('workout.completedSessions', 'workout', sessionIds, completed.length, 'sessions', `${completed.length} sessions are marked completed in the recorded window${sessions.truncated ? ' (partial records)' : ''}.`, sessions.truncated);
    if (scoped.length !== completed.length) limitations.push('unfinished_sessions_excluded');
    const sets = unique(completed.flatMap(row => row.sets)).filter(row => !row.isWarmup && finite(row.reps) && row.reps > 0);
    const weighted = sets.filter(row => finite(row.weightKg));
    if (sets.length) {
      add('workout.sets', 'workout', sets.map(s => s.id), sets.length, 'sets', `${sets.length} working sets were recorded in completed sessions.`, sessions.truncated);
      const reps = sets.reduce((sum, set) => sum + set.reps!, 0);
      add('workout.reps', 'workout', sets.map(s => s.id), reps, 'reps', `${reps} repetitions were recorded in those working sets.`, sessions.truncated);
    }
    if (weighted.length) {
      const volume = round(weighted.reduce((sum, set) => sum + set.reps! * set.weightKg!, 0));
      const partial = weighted.length !== sets.length || sessions.truncated;
      add('workout.volume', 'workout', weighted.map(s => s.id), volume, 'kg·reps', `Recorded external-load volume is ${volume} kg·reps${partial ? ' for sets with known weight only; data is partial' : ''}. This does not measure muscle activation or calories burned.`, partial);
      const weights=[...new Set(weighted.map(set=>set.weightKg!))].slice(0,4);
      weights.forEach((kg,i)=>{
        const lb=round(kg/0.45359237);
        add(`workout.weight.lb.${i}`,'workout',weighted.filter(set=>set.weightKg===kg).map(set=>set.id),lb,'lb',`The recorded load of ${kg} kg equals ${lb} lb.`);
      });
    }
    if(dailyPlan&&input.intent!=='week'&&!sessions.truncated&&dailyPlan.sets>0) {
      const linked=completed.filter(row=>row.date===window.end&&row.templateId&&dailyPlan.templates.includes(row.templateId));
      const linkedSets=unique(linked.flatMap(row=>row.sets)).filter(row=>!row.isWarmup&&finite(row.reps)&&row.reps>0);
      if(linkedSets.length) {
        const refs=[...dailyPlan.sourceIds,...linkedSets.map(set=>set.id)];
        const ratio=round(linkedSets.length/dailyPlan.sets*100);
        add('comparison.recordedSetRatio','workout',refs,ratio,'%',`${linkedSets.length} working sets are recorded against ${dailyPlan.sets} planned sets in linked sessions (${ratio}%). This compares records, not adherence or muscle activation.`);
        if(dailyPlan.reps!==null){
          const reps=linkedSets.reduce((sum,set)=>sum+set.reps!,0);
          const remaining=Math.max(0,dailyPlan.reps-reps);
          add('comparison.remainingReps','workout',refs,remaining,'reps',`The linked plan specifies ${dailyPlan.reps} repetitions; ${reps} are recorded, a remaining numerical difference of ${remaining}. This is not advice to perform additional repetitions.`);
        }
      }
    }
  }

  if(options.includeNutrition!==false){
  const nutrition = await read(args => repository.nutrition(args), 128);
  const meals = unique(nutrition.rows).filter(inScope);
  if (nutrition.truncated) limitations.push('nutrition_truncated');
  if (!meals.length) limitations.push('no_nutrition_records');
  else {
    const recordedDays = new Set(meals.map(row => row.date)).size;
    add('nutrition.days', 'nutrition', meals.map(row => row.id), recordedDays, 'days', `Food entries exist on ${recordedDays} of ${window.days} calendar days. Entries do not prove a complete food record.`, nutrition.truncated);
    for (const [field, id, unit] of [['calories', 'calories', 'kcal'], ['proteinG', 'protein', 'g protein']] as const) {
      const known = meals.filter(row => finite(row[field]));
      const partial = known.length !== meals.length || nutrition.truncated;
      if (partial) limitations.push(`nutrition_${id}_partial`);
      if (known.length) {
        const value = round(known.reduce((sum, row) => sum + row[field]!, 0));
        add(`nutrition.${id}`, 'nutrition', known.map(row => row.id), value, unit,
          `Food entries contain ${value} ${unit}${partial ? ' in the available values only (partial)' : ' in recorded values'}. This is not a measure of everything consumed.`, partial);
      }
    }
  }

  }
  if (input.exerciseId) {
    const guides = await read(args => repository.exercise({ ...args, exerciseId: input.exerciseId! }), 1);
    const guide = guides.rows.find(row => row.id === input.exerciseId && row.curated);
    if (!guide || guides.truncated) limitations.push('no_curated_exercise');
    else for (const [i, cue] of guide.instructions.slice(0, 6).entries()) {
      // Curated content remains data. No note/title/URL becomes a tool instruction.
      const text = cue.slice(0, 350);
      add(`exercise.cue.${i}`, 'exercise', [guide.id], text, null, `Curated exercise instruction: ${text}`);
    }
  }
  limitations.push('missing_records_do_not_mean_missing_food_or_training');
  return { facts, limitations: [...new Set(limitations)], reads, context, window };
}

import { coachAnatomyHintSchema,coachAnatomyGroups as groups,coachAnatomyDefinitions as definitions } from './selection-schema';
import type { CoachSelectionSnapshot } from './selection-contracts';
export type { CoachAnatomyHint,CoachSelectionSnapshot } from './selection-contracts';
import { createHash } from 'node:crypto';
import { atlasExercises,ATLAS_EXERCISES } from '@/lib/anatomy/exercises';
import { resolveCuratedMuscleActivations } from '@/lib/workout/anatomy';
import type { CoachContextHint } from './contracts';
import type { AuthorizedContext } from './context';
import type { CoachRepository,ReadArgs } from './repository';
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const COACH_SELECTION_CATALOGUE_VERSION=digest({groups:groups.map(group=>({group,definitions:definitions(group).map(({id,labelKey,concepts,scope})=>({id,labelKey,concepts,scope}))})),exercises:ATLAS_EXERCISES,roles:ATLAS_EXERCISES.map(e=>resolveCuratedMuscleActivations({name:e.name}))});
/** Reuses reads already performed by collectEvidence. Never adds an unmetered read.
 * A selected plan filters the existing bounded active-plan read; it cannot read
 * another actor's plan, select a local draft or silently fall back to another id.
 */
export function createSelectionContext(repository:CoachRepository,hint:CoachContextHint|undefined,context:AuthorizedContext){
 let selection:CoachSelectionSnapshot|undefined;
 const selected=hint?.includeScreen?hint:undefined;
 const parsedAnatomy=selected?.anatomy?coachAnatomyHintSchema.safeParse(selected.anatomy):undefined;
 if(parsedAnatomy&&!parsedAnatomy.success)throw new Error('invalid_input');
 const anatomy=parsedAnatomy?.data;
 if(anatomy&&selected?.entity)throw new Error('invalid_input');
 if(anatomy){
  if(anatomy.version&&anatomy.version!==COACH_SELECTION_CATALOGUE_VERSION)throw new Error('invalid_input');
  const defs=definitions(anatomy.group,anatomy.legRegion);const subgroup=anatomy.subgroup?defs.find(s=>s.id===anatomy.subgroup):undefined;
  const matched=atlasExercises(anatomy.group,anatomy.subgroup,anatomy.legRegion??'all');
  selection={kind:'anatomy',id:anatomy.subgroup??anatomy.group,version:COACH_SELECTION_CATALOGUE_VERSION,label:subgroup?.labelKey??`anatomy.group_${anatomy.group}`,contextOnly:true,provenance:'curated_catalogue',relations:[...(subgroup?.concepts??[]).slice(0,8).map(id=>({kind:'source_concept' as const,id,match:'exact' as const})),...matched.items.slice(0,8).map(({exercise,role})=>({kind:'catalogue_exercise' as const,id:exercise.id,label:exercise.name,match:matched.parent?'parent' as const:anatomy.subgroup?'exact' as const:'group' as const,...(!matched.parent&&role?{role}:{})}))],limitations:['generic_anatomy_not_personal_physiology','geometry_availability_not_checked','catalogue_ids_are_not_database_ids',...(matched.parent?['exercise_matches_parent_not_selected_portion']:[]),...(subgroup?.scope==='partial'||subgroup?.scope==='unresolved'?['source_mapping_partial_or_unresolved']:[]),...(matched.items.length>8?['related_exercises_partial']:[])]};
 }
 async function verify(args:ReadArgs){
  args.signal.throwIfAborted();const fresh=await repository.authorize(context.actorId,context.subjectId,args.signal);
  if(JSON.stringify(args.context)!==JSON.stringify(context)||JSON.stringify(fresh)!==JSON.stringify(context))throw new Error('forbidden');
 }
 const scoped:CoachRepository={...repository,
  plan:async args=>{
   const entity=selected?.entity;if(entity?.kind!=='plan')return repository.plan(args);
   await verify(args);const result=await repository.plan(args);await verify(args);
   if(result.rows.some(row=>row.userId!==context.subjectId))throw new Error('forbidden');
   const rows=result.rows.filter(row=>row.id===entity.id&&row.status==='active'&&(!row.startsOn||row.startsOn<=args.window.end));
   if(rows.length!==1||result.truncated)throw new Error('forbidden');
   const version=digest({scope:context,plan:rows[0]});if(entity.version&&entity.version!==version)throw new Error('invalid_input');
   selection={kind:'plan',id:entity.id,version,label:'Authorized active workout plan',contextOnly:true,provenance:'authorized_active_plan',relations:[],limitations:['planned_is_not_completed','not_a_local_draft','snapshot_hash_not_action_revision']};
   return {rows:structuredClone(rows),truncated:false};
  },
  exercise:async args=>{
   const entity=selected?.entity;if(entity?.kind!=='exercise')return repository.exercise(args);
   if(args.exerciseId!==entity.id)throw new Error('forbidden');await verify(args);const result=await repository.exercise(args);await verify(args);
   if(result.truncated||result.rows.length!==1||result.rows[0].id!==entity.id||!result.rows[0].curated)throw new Error('forbidden');
   const row=result.rows[0];const roles=resolveCuratedMuscleActivations({name:row.name});const version=digest({exercise:row,roles,catalogue:COACH_SELECTION_CATALOGUE_VERSION});
   if(entity.version&&entity.version!==version)throw new Error('invalid_input');
   selection={kind:'exercise',id:row.id,version,label:row.name,contextOnly:true,provenance:'curated_database_exercise',relations:roles.map(role=>({kind:'muscle',id:role.id,label:role.label,match:'exact',role:role.role})),limitations:['curated_roles_not_activation_percentages',...(!roles.length?['no_curated_muscle_roles']:[]),'snapshot_hash_not_action_revision']};
   return structuredClone(result);
  },
 };
 return {repository:scoped,snapshot:()=>selection?structuredClone(selection):undefined};
}

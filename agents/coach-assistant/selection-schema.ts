import { z } from 'zod';
import { WORKOUT_FOCUS_GROUPS,workoutFocus,type WorkoutFocusGroup } from '@/lib/anatomy/workout-focus';
import type { AtlasManifest } from '@/lib/anatomy/types';
// Reuse the catalogue definitions only. Empty geometry cannot establish availability.
const catalogueOnly={concepts:{}} as AtlasManifest;
export const coachAnatomyGroups=Object.keys(WORKOUT_FOCUS_GROUPS) as [WorkoutFocusGroup,...WorkoutFocusGroup[]];
export const coachAnatomyDefinitions=(group:WorkoutFocusGroup,region:'all'|'upper'|'lower'='all')=>workoutFocus(catalogueOnly,group,region).subgroups;
export const coachAnatomyHintSchema=z.object({group:z.enum(coachAnatomyGroups),subgroup:z.string().min(1).max(80).optional(),legRegion:z.enum(['all','upper','lower']).optional(),version:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict().superRefine((value,ctx)=>{
 if(value.group!=='legs'&&value.legRegion&&value.legRegion!=='all')ctx.addIssue({code:'custom',message:'invalid_region'});
 if(value.subgroup&&!coachAnatomyDefinitions(value.group,value.legRegion).some(s=>s.id===value.subgroup))ctx.addIssue({code:'custom',message:'invalid_subgroup'});
});
export type CoachAnatomyHint=z.infer<typeof coachAnatomyHintSchema>;

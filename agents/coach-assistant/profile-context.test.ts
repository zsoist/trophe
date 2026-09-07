import { describe,it,expect } from 'vitest';
import { projectWorkoutProfile,workoutProfileVersion } from './profile-context';
import { defaultWorkoutPreferences } from '@/lib/workout/preferences';
import { runConversation } from './conversation';
import { fixtureRepository } from './fixtures';
import type { OfflineConversationProvider } from './open-conversation';
const id='00000000-0000-4000-8000-000000000001';
const request={version:'coach-assistant.v2' as const,conversationId:id,turnId:id,message:'Explain this exercise with my available equipment',context:{surface:'exercise' as const,includeScreen:true,entity:{kind:'exercise' as const,id},displayWeightUnit:'lb' as const}};
const preferences={...defaultWorkoutPreferences,equipment:['dumbbell'] as Array<'dumbbell'>,experience:'advanced' as const,daysPerWeek:4 as const,location:'home' as const};
describe('minimal declared profile context',()=>{
 it('projects validated equipment/experience/frequency/location and never asserts fallback defaults',()=>{
  const row={userId:'synthetic-client',preferences,preferencesVersion:'1',memories:[]};
  expect(projectWorkoutProfile(row,request)).toMatchObject({status:'available',preferences,units:{storedWeight:'kg',preferredWeight:null,requestedDisplayWeight:'lb',displaySource:'request_hint',preferenceStatus:'not_connected'}});
  expect(projectWorkoutProfile({...row,preferences:{}},request)).toMatchObject({status:'unknown',preferences:null});
  expect(workoutProfileVersion({...row,preferencesVersion:'2'})).not.toBe(workoutProfileVersion(row));
 });
 it('includes profile with exercise facts within four reads and supports a single clarification of conflicting user context',async()=>{
  const repo=fixtureRepository({plans:[],workouts:[],nutrition:[]});repo.exercise=async()=>({rows:[{id,name:'Bench Press',instructions:['Use a stable position.'],curated:true}],truncated:false});repo.personalContext=async()=>({rows:[{userId:'synthetic-client',preferences,memories:[]}],truncated:false});
  const provider:OfflineConversationProvider=async args=>{const payload=JSON.parse(args.prompt);expect(payload.profileContext.preferences.equipment).toEqual(['dumbbell']);return {output:{answer:'Let us clarify the equipment for this session.',evidenceRefs:[],entityRefs:[],facts:[],generalExplanationRefs:[],followUp:'Should we use the equipment available today or the stored profile?',limitations:[],escalation:false},usage:{inputTokens:100,outputTokens:50},rawStatus:200,latencyMs:1};};
  const result=await runConversation({...request,message:'I only have a barbell today; explain this exercise'},{actorId:'synthetic-client',repository:repo,mode:'model',offlineCandidateEvaluation:true,offlineConversationProvider:provider,signal:new AbortController().signal,now:new Date('2026-09-07T03:30:00Z')});
  expect(result.ok,JSON.stringify(result.error)).toBe(true);expect(result.profileContext?.preferences).toMatchObject({equipment:['dumbbell']});expect(result.output?.suggestions).toHaveLength(1);expect(result.telemetry.dataReads).toBe(4);expect(result.evidence.some(f=>f.source==='exercise')).toBe(true);
 });
 it('preserves requested mixed nutrition and exercise and marks profile omission honestly',async()=>{
  const repo=fixtureRepository();repo.exercise=async()=>({rows:[{id,name:'Bench Press',instructions:['Stable position'],curated:true}],truncated:false});repo.personalContext=async()=>{throw Error('must not exceed four reads');};
  const result=await runConversation({...request,message:'Explain my food and exercise records this week'},{actorId:'synthetic-client',repository:repo,mode:'offline',signal:new AbortController().signal,now:new Date('2026-09-07T03:30:00Z')});
  expect(result.ok).toBe(true);expect(result.evidence.some(f=>f.source==='nutrition')).toBe(true);expect(result.evidence.some(f=>f.source==='exercise')).toBe(true);expect(result.snapshot?.capabilities.find(c=>c.key==='profile')).toMatchObject({status:'unknown',reason:'profile_omitted_read_budget'});expect(result.evidence.find(f=>f.id==='workout.weight.lb.0')).toMatchObject({value:88.18,unit:'lb'});
 });
 it('rejects a foreign personal profile instead of projecting its values',async()=>{
  const repo=fixtureRepository({plans:[],workouts:[],nutrition:[]});repo.personalContext=async()=>({rows:[{userId:'other-client',preferences,memories:[]}],truncated:false});
  const result=await runConversation({...request,context:{surface:'profile',includeScreen:true},message:'Use my profile'},{actorId:'synthetic-client',repository:repo,mode:'offline',signal:new AbortController().signal,now:new Date('2026-09-07T03:30:00Z')});expect(result.error?.code).toBe('forbidden');expect(result.profileContext).toBeUndefined();
 });

});

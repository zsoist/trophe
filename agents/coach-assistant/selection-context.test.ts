import { describe,it,expect,vi } from 'vitest';
import { createSelectionContext,COACH_SELECTION_CATALOGUE_VERSION } from './selection-context';
import { COACH_ANATOMY_GROUP_IDS } from './selection-contracts';
import { WORKOUT_FOCUS_GROUPS } from '@/lib/anatomy/workout-focus';
import { coachAnatomyHintSchema } from './selection-schema';
import { runConversation } from './conversation';
import { fixtureRepository } from './fixtures';
import { windowFor } from './context';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const context={actorId:id(1),subjectId:id(1),organizationId:id(2),timezone:'UTC',language:'en'};
const args={context,window:windowFor('week','UTC',new Date('2026-09-07T00:00:00Z')),limit:2,signal:new AbortController().signal};
function repository(){const r=fixtureRepository();r.dataSource='authorized_records';r.authorize=vi.fn(async()=>({...context}));r.plan=vi.fn(async()=>({rows:[{id:id(3),userId:id(1),startsOn:null,status:'active',days:[]},{id:id(4),userId:id(1),startsOn:null,status:'active',days:[]}],truncated:false}));r.exercise=vi.fn(async()=>({rows:[{id:id(5),name:'Bench Press',instructions:['Use the curated setup cue.'],curated:true}],truncated:false}));r.nutrition=async()=>({rows:[],truncated:false});r.workouts=async()=>({rows:[],truncated:false});r.personalContext=undefined;return r;}
describe('server-resolved selection context',()=>{
 it('keeps browser group IDs synchronized with the server catalogue',()=>{
  expect([...COACH_ANATOMY_GROUP_IDS].sort()).toEqual(Object.keys(WORKOUT_FOCUS_GROUPS).sort());
 });
 it('uses curated portion IDs and parent exercise matches without physiological percentages or fake database IDs',()=>{
  const r=repository();const broker=createSelectionContext(r,{surface:'atlas',includeScreen:true,anatomy:{group:'chest',subgroup:'pectoral-clavicular'}},context);const snapshot=broker.snapshot()!;
  expect(snapshot.id).toBe('pectoral-clavicular');expect(snapshot.version).toBe(COACH_SELECTION_CATALOGUE_VERSION);expect(snapshot.provenance).toBe('curated_catalogue');expect(snapshot.limitations).toContain('exercise_matches_parent_not_selected_portion');
  const exercises=snapshot.relations.filter(r=>r.kind==='catalogue_exercise');expect(exercises.length).toBeGreaterThan(0);expect(exercises.every(r=>r.match==='parent'&&r.role===undefined)).toBe(true);expect(r.authorize).not.toHaveBeenCalled();
  snapshot.relations.length=0;expect(broker.snapshot()!.relations.length).toBeGreaterThan(0);
 });
 it('rejects wrong group/subgroup/region/version and ignores removed screen hints',()=>{
  for(const hint of [{group:'chest',subgroup:'quadriceps'},{group:'__proto__'},{group:'back',legRegion:'lower'},{group:'legs',subgroup:'quadriceps',legRegion:'lower'}])expect(coachAnatomyHintSchema.safeParse(hint).success).toBe(false);
  expect(()=>createSelectionContext(repository(),{surface:'atlas',includeScreen:true,anatomy:{group:'chest',version:'0'.repeat(64)}},context)).toThrow('invalid_input');
  expect(createSelectionContext(repository(),{surface:'atlas',includeScreen:false,anatomy:{group:'chest'}},context).snapshot()).toBeUndefined();
 });
 it('resolves only the explicitly selected owned active plan with a server content version, never a fallback',async()=>{
  const r=repository();const broker=createSelectionContext(r,{surface:'plan',includeScreen:true,entity:{kind:'plan',id:id(4)}},context);expect((await broker.repository.plan(args)).rows.map(p=>p.id)).toEqual([id(4)]);expect(broker.snapshot()).toMatchObject({id:id(4),kind:'plan',provenance:'authorized_active_plan'});
  expect(r.plan).toHaveBeenCalledTimes(1);expect(broker.snapshot()!.version).toMatch(/^[a-f0-9]{64}$/);
  await expect(createSelectionContext(r,{surface:'plan',includeScreen:true,entity:{kind:'plan',id:id(8)}},context).repository.plan(args)).rejects.toThrow('forbidden');
  r.plan=async()=>({rows:[{id:id(4),userId:id(9),startsOn:null,status:'active',days:[]}],truncated:false});await expect(broker.repository.plan(args)).rejects.toThrow('forbidden');
 });
 it('requires the exact curated database exercise and rejects stale versions or revoked scope',async()=>{
  const r=repository();const hint={surface:'exercise' as const,includeScreen:true,entity:{kind:'exercise' as const,id:id(5)}};const broker=createSelectionContext(r,hint,context);await broker.repository.exercise({...args,exerciseId:id(5)});expect(broker.snapshot()).toMatchObject({kind:'exercise',id:id(5),provenance:'curated_database_exercise'});expect(broker.snapshot()!.relations.length).toBeGreaterThan(0);
  await expect(createSelectionContext(r,{...hint,entity:{...hint.entity,version:'0'.repeat(64)}},context).repository.exercise({...args,exerciseId:id(5)})).rejects.toThrow('invalid_input');
  r.exercise=async()=>({rows:[{id:id(5),name:'Private exercise',instructions:[],curated:false}],truncated:false});await expect(broker.repository.exercise({...args,exerciseId:id(5)})).rejects.toThrow('forbidden');
  r.authorize=async()=>({...context,organizationId:id(9)});await expect(broker.repository.exercise({...args,exerciseId:id(5)})).rejects.toThrow('forbidden');
 });
 it('attaches the resolved snapshot to the actual conversation without extra record reads or actions',async()=>{
  const r=repository();const result=await runConversation({version:'coach-assistant.v2',conversationId:id(6),turnId:id(7),message:'How can I review this?',context:{surface:'atlas',includeScreen:true,anatomy:{group:'triceps',subgroup:'triceps-long'}}},{actorId:id(1),repository:r,now:new Date('2026-09-07T00:00:00Z'),mode:'offline',signal:args.signal});
  expect(result.ok).toBe(true);expect(result.snapshot?.selection).toMatchObject({kind:'anatomy',id:'triceps-long',contextOnly:true});expect(result.telemetry.dataReads).toBe(3);expect(result.proposals).toEqual([]);expect(result.receipts).toEqual([]);expect(result.evidence.every(e=>!e.statement.includes('%'))).toBe(true);
 });
});

import {describe,it,expect} from 'vitest';
import {insertReviewedMeasurement,parseMeasurementValues} from '../lib/workout/measurement-service';
const values={measuredDate:'2026-09-07',weightKg:70.1,bodyFatPct:null,waistCm:null};
describe('explicit measurement domain writer',()=>{
 it('requires explicit calendar date, canonical numeric units and nullable optional measurements',()=>{
  expect(parseMeasurementValues(values)).toEqual(values);
  for(const patch of [{measuredDate:'2026-02-30'},{measuredDate:undefined},{weightKg:0},{weightKg:-1},{weightKg:'70'},{weightKg:Infinity},{weightKg:NaN},{weightKg:1e100},{weightKg:1e-100},{bodyFatPct:1e-100},{bodyFatPct:-1},{bodyFatPct:101},{waistCm:0},{waistCm:1e100},{waistCm:'80'},{notes:'x'},{photo:'x'},{bodyFatPct:undefined}])expect(()=>parseMeasurementValues({...values,...patch})).toThrow();
  expect(parseMeasurementValues({...values,bodyFatPct:0,waistCm:80})).toMatchObject({bodyFatPct:0,waistCm:80});
  expect(parseMeasurementValues({...values,bodyFatPct:100})).toMatchObject({bodyFatPct:100});
 });
 it('inserts only existing four values and server identity on caller transaction without upsert',async()=>{
  const identity={id:'00000000-0000-4000-8000-000000000001',ownerUserId:'00000000-0000-4000-8000-000000000002'};let written:unknown;
  const tx={insert:()=>({values:(v:unknown)=>{written=v;return {returning:async()=>[v]};}})} as unknown as Parameters<typeof insertReviewedMeasurement>[0];
  expect(await insertReviewedMeasurement(tx,identity,values)).toEqual({id:identity.id,userId:identity.ownerUserId,...values});expect(written).toEqual({id:identity.id,userId:identity.ownerUserId,...values});
 });
});

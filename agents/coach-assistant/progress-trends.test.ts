import {describe,it,expect} from 'vitest';
import {summarizeMeasurementTrends} from './progress-trends';
describe('measurement summaries from sanitized records',()=>{
 it('uses independent metric evidence and percentage points with no interpolation',()=>{
  const r=summarizeMeasurementTrends([
   {id:'a',measuredDate:'2026-09-01',weightKg:70,bodyFatPct:20,waistCm:null},
   {id:'b',measuredDate:'2026-09-07',weightKg:null,bodyFatPct:18,waistCm:80},
   {id:'c',measuredDate:'2026-09-07',weightKg:null,bodyFatPct:22,waistCm:null},
  ]);
  expect(r[0]).toMatchObject({days:1,observations:1,change:null,status:'insufficient_dates'});
  expect(r[1]).toMatchObject({unit:'percentage_points',days:2,observations:3,change:0,first:{sourceIds:['a'],value:20},last:{sourceIds:['b','c'],value:20},status:'available'});
  expect(r[2]).toMatchObject({unit:'cm',days:1,change:null});
 });
});

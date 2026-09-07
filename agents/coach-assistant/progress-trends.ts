import type {MeasurementTrend,ProgressMeasurement} from './progress-contracts';
/** Average only actual recorded values on the same date; no smoothing or extrapolation. */
export function summarizeMeasurementTrends(rows:ProgressMeasurement[]):MeasurementTrend[]{
 return (['weightKg','bodyFatPct','waistCm'] as const).map(metric=>{
  const days=new Map<string,{sum:number;ids:string[]}>();
  for(const row of rows){const value=row[metric];if(value===null)continue;const day=days.get(row.measuredDate)??{sum:0,ids:[]};day.sum+=value;day.ids.push(row.id);days.set(row.measuredDate,day);}
  const points=[...days.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([date,p])=>({date,value:p.sum/p.ids.length,sourceIds:p.ids}));
  const first=points[0]??null,last=points.at(-1)??null;
  return {metric,unit:metric==='weightKg'?'kg':metric==='waistCm'?'cm':'percentage_points',observations:points.reduce((n,p)=>n+p.sourceIds.length,0),days:points.length,first,last,change:points.length>=2?last!.value-first!.value:null,aggregation:'daily_mean',status:points.length>=2?'available':'insufficient_dates'};
 });
}

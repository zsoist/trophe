import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root=process.cwd();
const models=['deepseek-v4-flash','gpt-5.6-luna','gemini-3.1-flash-lite','mistral-small-2603','claude-haiku-4-5-20251001'];
const files=Object.fromEntries(models.map(model=>[model,JSON.parse(readFileSync(join(root,'artifacts/phase2',`round1-${model}.json`),'utf8'))]));
const dataset=JSON.parse(readFileSync(join(root,'agents/evals/datasets/nutrition-enterprise-v3.json'),'utf8'));
const weakCases=dataset.cases.filter(c=>c.category==='regional_cuisine'||c.category==='code_switch');
const failuresByCase=new Map(weakCases.map(c=>[c.id,models.filter(model=>!files[model].weakResults.find(r=>r.id===c.id).frozen.passed)]));

const classifications={};
for(const model of models){
  const rows=files[model].weakResults.map(row=>{
    if(row.frozen.passed) return {...row,consensusFailureClass:null};
    const failingModels=failuresByCase.get(row.id)??[];
    return {...row,consensusFailureClass:failingModels.length>=3?'COVERAGE':'EXTRACTION',failingModelCount:failingModels.length};
  });
  classifications[model]=rows;
}

const warmProjected={
 'deepseek-v4-flash':0.03538416,
 'gpt-5.6-luna':0.7868325,
 'gemini-3.1-flash-lite':0.708726,
 'mistral-small-2603':0.3990654,
 'claude-haiku-4-5-20251001':0.6995985,
};
const compliance={
 'deepseek-v4-flash':'Health-context lane blocked by current policy',
 'gpt-5.6-luna':'Formal vendor review pending',
 'gemini-3.1-flash-lite':'Formal vendor review pending',
 'mistral-small-2603':'Formal vendor review pending',
 'claude-haiku-4-5-20251001':'Current approved health-context exception',
};

const table=models.map(model=>{
  const {summary}=files[model]; const rows=classifications[model];
  const category=(name)=>{const selected=rows.filter(r=>r.category===name);return{passed:selected.filter(r=>r.frozen.passed).length,total:selected.length};};
  const failures=rows.filter(r=>!r.frozen.passed);
  return{
    model,
    probeAlwaysPass:summary.probes.alwaysPass,
    probeIntermittent:summary.probes.intermittent,
    probeWidenedAlwaysPass:summary.probes.widenedAlwaysPass,
    regional:category('regional_cuisine'),
    codeSwitch:category('code_switch'),
    weakPassed:summary.weak.frozenPassed,
    weakWidenedPassed:summary.weak.widenedPassed,
    malformed:summary.malformed,
    coverageFailures:failures.filter(r=>r.consensusFailureClass==='COVERAGE').length,
    extractionFailures:failures.filter(r=>r.consensusFailureClass==='EXTRACTION').length,
    p50LatencyMs:summary.p50LatencyMs,
    p95LatencyMs:summary.p95LatencyMs,
    coldActualUsd:summary.coldActualUsd,
    warmProjectedUsd:warmProjected[model],
    compliance:compliance[model],
  };
});

const full=JSON.parse(readFileSync(join(root,'artifacts/evals/nutrition-enterprise-production-v3.json'),'utf8'));
const exactPassed=full.results.filter(r=>{
  const c=dataset.cases.find(x=>x.id===r.id); if(!c)return false;
  const countOk=r.items===c.expect_item_count;
  const clarificationOk=!c.expect_needs_clarification||r.needsClarification||r.items===0;
  const e=c.expect_total; const within=(v,range)=>!range||(v>=range.min&&v<=range.max);
  return r.status>=200&&r.status<300&&countOk&&within(r.totals.calories,e?.calories)&&within(r.totals.protein_g,e?.protein_g)&&within(r.totals.carbs_g,e?.carbs_g)&&within(r.totals.fat_g,e?.fat_g)&&clarificationOk;
}).length;
const report={
  createdAt:new Date().toISOString(),
  classificationRule:'A failed weak-group case is COVERAGE when at least 3 of 5 models fail it; otherwise EXTRACTION. This is a cross-model consensus proxy and not a substitute for row-level DB archaeology.',
  validRound1ColdEquivalentUsd:table.reduce((s,r)=>s+r.coldActualUsd,0),
  discardedLunaColdEquivalentUsd:0.670113,
  totalColdEquivalentIncludingDiscardedLuna:table.reduce((s,r)=>s+r.coldActualUsd,0)+0.670113,
  table,
  promoted:['deepseek-v4-flash'],
  round2:{reusedArtifact:'artifacts/evals/nutrition-enterprise-production-v3.json',createdAt:full.createdAt,widenedPassed:full.summary.passed,total:700,frozenSemanticsPassed:exactPassed,p50LatencyMs:full.summary.p50LatencyMs,p95LatencyMs:full.summary.p95LatencyMs},
  vision:{status:'blocked',reason:'No reviewed 10–15-photo golden fixture exists in the repository; using production user photos or invented web fixtures would violate instrument integrity.'},
};
writeFileSync(join(root,'artifacts/phase2/phase2-decision-data.json'),JSON.stringify({report,classifications},null,2));
console.log(JSON.stringify(report,null,2));

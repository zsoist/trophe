#!/usr/bin/env npx tsx
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { RoutingPolicy } from '../../agents/router/policies';
import {
  PAID_AI_ENDPOINT_GROUPS,
  requirePaidAiToolApproval,
} from '../safety/require-paid-ai-approval';

const paidAiApproval = requirePaidAiToolApproval({
  operation: 'eval-phase2-round1',
  argv: process.argv.slice(2),
  env: process.env,
  endpoints: PAID_AI_ENDPOINT_GROUPS.phase2,
});
loadEnvConfig(process.cwd());

type Range = { min: number; max: number };
type EnterpriseCase = {
  id: string; input: string; language: 'en'|'es'|'el'|'fr'|'mixed'; category: string;
  expect_item_count: number; expect_total: { calories?: Range; protein_g?: Range; carbs_g?: Range; fat_g?: Range } | null;
  expect_needs_clarification: boolean;
};
type GoldenCase = {
  id: string; input: string; language: string; expectedFallbackToAI: boolean;
  expected: { items?: number; primaryFood?: string[]; totalKcal?: Range; totalProtein?: Range; totalFat?: Range; totalCarbs?: Range; kcalReasonable?: Range; confidenceMax?: number };
};
type OutputItem = { food_name: string; calories: number; protein_g: number; carbs_g: number; fat_g: number; confidence: number; source: string };

const MODELS: Array<{ name: string; policy: RoutingPolicy; inputPrice: number; outputPrice: number }> = [
  { name: 'deepseek-v4-flash', policy: { provider:'deepseek', model:'deepseek-v4-flash', costClass:'cheap', latencyClass:'fast', maxTokens:1024, timeoutMs:30_000, maxInputChars:12_000, maxCostUsd:.02, promptVersion:'phase2-food-parse-v7-deepseek' }, inputPrice:.14, outputPrice:.28 },
  { name: 'gpt-5.6-luna', policy: { provider:'openai', model:'gpt-5.6-luna', costClass:'mid', latencyClass:'fast', maxTokens:1024, timeoutMs:45_000, maxInputChars:12_000, maxCostUsd:.02, promptVersion:'phase2-food-parse-v7-luna' }, inputPrice:1, outputPrice:6 },
  { name: 'gemini-3.1-flash-lite', policy: { provider:'google', model:'gemini-3.1-flash-lite', costClass:'cheap', latencyClass:'fast', maxTokens:1024, timeoutMs:30_000, maxInputChars:12_000, maxCostUsd:.02, promptVersion:'phase2-food-parse-v7-gemini' }, inputPrice:.25, outputPrice:1.5 },
  { name: 'mistral-small-2603', policy: { provider:'openai', model:'mistral-small-2603', costClass:'cheap', latencyClass:'fast', maxTokens:1024, timeoutMs:45_000, maxInputChars:12_000, maxCostUsd:.02, promptVersion:'phase2-food-parse-v7-mistral' }, inputPrice:.15, outputPrice:.6 },
  { name: 'claude-haiku-4-5-20251001', policy: { provider:'anthropic', model:'claude-haiku-4-5-20251001', costClass:'mid', latencyClass:'fast', maxTokens:1024, timeoutMs:45_000, maxInputChars:12_000, maxCostUsd:.02, promptVersion:'phase2-food-parse-v7-haiku' }, inputPrice:1, outputPrice:5 },
];
const SOFT_CAP = 8;
const HARD_CAP = 20;
const OBSERVED_INPUT = 11_500;
const OBSERVED_OUTPUT = 434;
const outputDir = join(process.cwd(), 'artifacts', 'phase2');
const selectedNames = new Set((process.env.PHASE2_MODELS ?? '').split(',').map(v=>v.trim()).filter(Boolean));
const selectedModels = selectedNames.size ? MODELS.filter(model=>selectedNames.has(model.name)) : MODELS;
const concurrency = Math.min(Math.max(Number(process.env.PHASE2_CONCURRENCY ?? 3),1),3);

function coldCost(calls: number, inputPrice: number, outputPrice: number) {
  return calls * (OBSERVED_INPUT * inputPrice + OBSERVED_OUTPUT * outputPrice) / 1_000_000;
}
function within(value: number, range?: Range) { return !range || (value >= range.min && value <= range.max); }
function totals(items: OutputItem[]) { return items.reduce((a,i)=>({ calories:a.calories+(i.calories??0), protein_g:a.protein_g+(i.protein_g??0), carbs_g:a.carbs_g+(i.carbs_g??0), fat_g:a.fat_g+(i.fat_g??0) }),{calories:0,protein_g:0,carbs_g:0,fat_g:0}); }
function percentile(values: number[], p: number) { const sorted=[...values].sort((a,b)=>a-b); return sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]??0; }

async function main() {
  for (const key of ['DEEPSEEK_API_KEY','OPENAI_API_KEY','GEMINI_API_KEY','MISTRAL_API_KEY','ANTHROPIC_API_KEY','DATABASE_URL']) {
    if (!process.env[key]) throw new Error(`${key} not configured`);
  }
  const enterprise = JSON.parse(readFileSync(join(process.cwd(),'agents/evals/datasets/nutrition-enterprise-v3.json'),'utf8')) as {cases:EnterpriseCase[]};
  const weak = enterprise.cases.filter(c=>c.category==='regional_cuisine'||c.category==='code_switch');
  if (weak.length !== 141) throw new Error(`weak-group identity failure: expected 141, got ${weak.length}`);
  const currentGolden = JSON.parse(readFileSync(join(process.cwd(),'agents/evals/food-parse-greek-colombian-golden.json'),'utf8')) as {cases:GoldenCase[]};
  const frozenGolden = JSON.parse(execFileSync('git',['show','f534ee5:agents/evals/food-parse-greek-colombian-golden.json'],{encoding:'utf8'})) as {cases:GoldenCase[]};
  if (currentGolden.cases.length!==30 || frozenGolden.cases.length!==30) throw new Error('probe identity failure');

  if (selectedModels.length === 0) throw new Error('PHASE2_MODELS matched no configured candidates');
  const approvedModels = paidAiApproval.boundCases(selectedModels);
  const projectedRound1 = approvedModels.reduce((s,m)=>s+coldCost(1,m.inputPrice,m.outputPrice),0);
  if (projectedRound1 > HARD_CAP) throw new Error(`projected Round 1 $${projectedRound1.toFixed(2)} exceeds $${HARD_CAP} hard cap`);
  if (projectedRound1 >= SOFT_CAP) console.warn(`[phase2] SOFT ALERT projected Round 1 $${projectedRound1.toFixed(2)}`);
  else console.log(`[phase2] projected Round 1 cold spend $${projectedRound1.toFixed(2)} (< $${SOFT_CAP} soft alert)`);

  const [{ taskPolicies, taskFallbacks }, { run }] = await Promise.all([
    import('../../agents/router/policies'), import('../../agents/food-parse/index.v4'),
  ]);
  const originalPolicy = taskPolicies.food_parse;
  const originalFallback = taskFallbacks.food_parse;
  delete taskFallbacks.food_parse;
  const allResults: Record<string, unknown> = {};
  let observedColdSpend = 0;

  try {
    for (const model of approvedModels) {
      taskPolicies.food_parse = model.policy;

      const runCases = paidAiApproval.boundCases([
        ...currentGolden.cases.map(c=>({kind:'probe1' as const,c})),
        ...currentGolden.cases.map(c=>({kind:'probe2' as const,c})),
        ...weak.map(c=>({kind:'weak' as const,c})),
      ]);
      const results: any[] = new Array(runCases.length);
      let next=0;
      await Promise.all(Array.from({length:concurrency},async()=>{
        while(next<runCases.length){
          const index=next++; const entry=runCases[index]; const c=entry.c;
          const started=Date.now();
          const response=await run(
            {text:c.input,language:(c.language==='mixed'?'en':c.language) as any},
            {
              metadata:{phase2:'round1',model:model.name,caseId:c.id,kind:entry.kind},
              beforeTransportAttempt: paidAiApproval.beforeTransportAttempt,
            },
          );
          const items=(response.output?.items??[]) as OutputItem[];
          const result={kind:entry.kind,id:c.id,input:c.input,language:c.language,category:'category' in c?c.category:undefined,ok:response.ok,error:response.error,items,totals:totals(items),needsClarification:response.output?.needs_clarification===true,latencyMs:Date.now()-started,telemetry:response.telemetry};
          results[index]=result;
          observedColdSpend += ((response.telemetry.tokensIn??0)*model.inputPrice+(response.telemetry.tokensOut??0)*model.outputPrice)/1_000_000;
          if(observedColdSpend>=HARD_CAP) throw new Error(`$${HARD_CAP} hard cap reached`);
          if(observedColdSpend>=SOFT_CAP) console.warn(`[phase2] SOFT ALERT observed cold-equivalent spend $${observedColdSpend.toFixed(2)}`);
          if((index+1)%25===0) console.log(`[phase2] ${model.name} ${index+1}/${runCases.length}`);
        }
      }));

      if (runCases.length !== 201) {
        const canarySummary = {
          model: model.name,
          canary: true,
          completedCalls: results.length,
          successfulCalls: results.filter((result) => result.ok).length,
          coldActualUsd: results.reduce((sum, result) =>
            sum + ((result.telemetry.tokensIn ?? 0) * model.inputPrice
              + (result.telemetry.tokensOut ?? 0) * model.outputPrice) / 1_000_000, 0),
        };
        allResults[model.name] = { summary: canarySummary, results };
        mkdirSync(outputDir,{recursive:true});
        writeFileSync(join(outputDir,`round1-${model.name}.json`),JSON.stringify(allResults[model.name],null,2));
        console.log('[phase2] canary complete', JSON.stringify(canarySummary));
        continue;
      }

      const probes=(kind:string)=>results.filter(r=>r.kind===kind);
      const scoreProbe=(r:any,g:GoldenCase,requireFallback:boolean)=>{
        const ex=g.expected; const t=r.totals; const names=r.items.map((i:OutputItem)=>i.food_name.toLowerCase());
        const foodOk=!ex.primaryFood||ex.primaryFood.some(ef=>{const n=ef.toLowerCase();return names.some((fn:string)=>n.includes(' ')?n.split(' ').every(w=>fn.includes(w)):fn.split(/[\s,()]+/).some(w=>{const sn=n.endsWith('s')?n.slice(0,-1):n;const sw=w.endsWith('s')?w.slice(0,-1):w;return w===n||sw===n||w===sn||sw===sn;}));});
        const hasAi=r.items.some((i:OutputItem)=>i.source==='ai_estimate'); const avg=r.items.length?r.items.reduce((s:number,i:OutputItem)=>s+(i.confidence??0),0)/r.items.length:0;
        const checks={status:r.ok,items:ex.items==null||r.items.length===ex.items,food:foodOk,kcal:within(t.calories,g.expectedFallbackToAI?(ex.kcalReasonable??undefined):ex.totalKcal),protein:within(t.protein_g,ex.totalProtein),fat:within(t.fat_g,ex.totalFat),carbs:within(t.carbs_g,ex.totalCarbs),fallback:!requireFallback||!g.expectedFallbackToAI||hasAi,confidence:ex.confidenceMax==null||avg<=ex.confidenceMax,latency:r.latencyMs<=10_000};
        return {passed:Object.values(checks).every(Boolean),checks};
      };
      const scoreWeak=(r:any,c:EnterpriseCase,exactItems:boolean)=>{const t=r.totals;const checks={status:r.ok,itemCount:c.expect_item_count>=2&&!exactItems?Math.abs(r.items.length-c.expect_item_count)<=1&&r.items.length>=1:r.items.length===c.expect_item_count,calories:within(t.calories,c.expect_total?.calories),protein:within(t.protein_g,c.expect_total?.protein_g),carbs:within(t.carbs_g,c.expect_total?.carbs_g),fat:within(t.fat_g,c.expect_total?.fat_g),clarification:!c.expect_needs_clarification||r.needsClarification||r.items.length===0};return {passed:Object.values(checks).every(Boolean),checks};};
      const p1=probes('probe1'),p2=probes('probe2');
      const probeRows=currentGolden.cases.map((g,i)=>{const f=frozenGolden.cases[i];const a=scoreProbe(p1[i],f,true),b=scoreProbe(p2[i],f,true),wa=scoreProbe(p1[i],g,false),wb=scoreProbe(p2[i],g,false);return{id:g.id,frozen:[a.passed,b.passed],widened:[wa.passed,wb.passed]};});
      const weakResults=probes('weak').map((r:any,i:number)=>{const c=weak[i],f=scoreWeak(r,c,true),w=scoreWeak(r,c,false);let failureClass:null|'COVERAGE'|'EXTRACTION'=null;if(!f.passed){const structural=!f.checks.status||!f.checks.itemCount||(r.items.length===0&&!c.expect_needs_clarification);const dbMiss=r.items.some((x:OutputItem)=>!x.source?.startsWith('local_db'));failureClass=structural?'EXTRACTION':dbMiss?'COVERAGE':'COVERAGE';}return{...r,frozen:f,widened:w,failureClass};});
      const latency=results.map(r=>r.latencyMs);
      const summary={
        model:model.name,
        probes:{alwaysPass:probeRows.filter(x=>x.frozen.every(Boolean)).length,intermittent:probeRows.filter(x=>x.frozen.some(Boolean)&&!x.frozen.every(Boolean)).length,alwaysFail:probeRows.filter(x=>!x.frozen.some(Boolean)).length,widenedAlwaysPass:probeRows.filter(x=>x.widened.every(Boolean)).length},
        weak:{frozenPassed:weakResults.filter((x:any)=>x.frozen.passed).length,widenedPassed:weakResults.filter((x:any)=>x.widened.passed).length,total:weakResults.length,coverageFailures:weakResults.filter((x:any)=>x.failureClass==='COVERAGE').length,extractionFailures:weakResults.filter((x:any)=>x.failureClass==='EXTRACTION').length},
        malformed:results.filter(r=>!r.ok).length,totalCalls:results.length,p50LatencyMs:percentile(latency,.5),p95LatencyMs:percentile(latency,.95),tokensIn:results.reduce((s,r)=>s+(r.telemetry.tokensIn??0),0),tokensOut:results.reduce((s,r)=>s+(r.telemetry.tokensOut??0),0),coldActualUsd:results.reduce((s,r)=>s+((r.telemetry.tokensIn??0)*model.inputPrice+(r.telemetry.tokensOut??0)*model.outputPrice)/1_000_000,0),coldProjectedUsd:coldCost(201,model.inputPrice,model.outputPrice),
      };
      allResults[model.name]={summary,probeRows,weakResults};
      mkdirSync(outputDir,{recursive:true});
      writeFileSync(join(outputDir,`round1-${model.name}.json`),JSON.stringify(allResults[model.name],null,2));
      console.log('[phase2] model complete',JSON.stringify(summary));
    }
  } finally {
    taskPolicies.food_parse=originalPolicy;
    if(originalFallback) taskFallbacks.food_parse=originalFallback;
  }
  writeFileSync(join(outputDir,'round1-all-models.json'),JSON.stringify({createdAt:new Date().toISOString(),observedColdSpend,results:allResults},null,2));
  console.log(`[phase2] Round 1 complete; observed cold-equivalent spend $${observedColdSpend.toFixed(2)}`);
}

main().catch(error=>{console.error(error);process.exit(1);});

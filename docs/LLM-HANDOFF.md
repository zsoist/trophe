# LLM handoff

## 1. Policy source of truth

All production routing is defined in `agents/router/policies.ts`. Agent, simulator, and generator code consumes exported policy objects rather than duplicating model strings.

## 2. Consumer lane

Consumer structured-text tasks use GPT-5.6 Luna with Claude Haiku 4.5 fallbacks. No DeepSeek provider is permitted in a consumer primary or fallback chain.

## 3. Health-context lane

`coach_insight` and `memory_extract` remain on Claude Haiku 4.5 for both primary and fallback execution.

## 4. Factory lane

Synthetic dataset generators use `factory_generate`, currently DeepSeek V4 Flash, through `executeAiTask`. Every factory call must create governed telemetry in `agent_runs` and carry `lane=factory` plus `syntheticOnly=true` metadata.

## 5. Eval identity and evidence

Eval user identity comes from environment configuration only. Production claims must name their evidence source; a local bootstrap database is not production evidence.

## 6. Scheduling

Paid factory and simulator jobs run outside UTC 01:00–04:00 and 06:00–10:00. The frozen production probe and consumer watch-list window is 04:30 UTC.

## 7. Food-parse prompt and decision reference

Production food parsing loads `agents/prompts/food-parse.v8.md` by default from `agents/food-parse/index.v4.ts`. The `index.v4.ts` filename describes pipeline architecture, not prompt version; do not infer that production uses the v4 prompt. v8 distinguishes nutrition-label facts from food weight and keeps those facts item-scoped behind plausibility checks. The routing decision and Phase 2 evidence are in `artifacts/phase2/phase2-decision-report.md`.

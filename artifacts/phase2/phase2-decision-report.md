# Phase 2 model-routing decision table

## Executive Summary

- **Consumer food-parse routes to GPT-5.6 Luna.** Luna won the canonical frozen-probe instrument at 18/18 deterministic passes, with zero malformed outputs and a 4.97s p95. DeepSeek produced 17 always-pass plus two intermittent probes, seven malformed outputs, and a 7.24s p95.
- **DeepSeek's weak-group lead does not overturn the canonical result.** Of its 23 exclusive weak-group wins over Luna, 10 were fully DB-backed, 13 exposed macro-estimation fallback, and four of the DB-backed cases are separately tagged for the Greek regression watch-list. Luna had seven exclusive wins in the opposite direction.
- **Coverage dominates every model's failures.** Using the cross-model consensus taxonomy, 75%–96% of each candidate's weak-group failures are COVERAGE/system failures. A model swap alone will not repair the Greek/Colombian surface.
- **The $8 soft alert fired, not the $20 hard cap.** Valid Round 1 cold-equivalent cost was $7.35. Including the discarded TPM-corrupted Luna attempt brings total cold-equivalent experiment spend to $8.02.

## Round 1 — frozen comparator leads, widened score is secondary

| Model | Frozen probes: always / intermittent | Widened probes: always | Regional cuisine | Code-switching | Weak total | Malformed | COVERAGE / EXTRACTION failures | p50 / p95 | Cold actual | Warm projected | Compliance posture |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| DeepSeek V4 Flash | 17 / 2 | 26 | 42/84 | 30/57 | **72/141** | 7/201 | 66 / 3 | 4.89s / 7.24s | $0.35 | $0.04 | Health-context lane blocked |
| Claude Haiku 4.5 | 15 / 2 | 24 | 34/84 | 30/57 | **64/141** | 4/201 | 73 / 4 | 4.89s / 7.82s | $3.31 | $0.70 | Current approved exception |
| GPT-5.6 Luna | **18 / 0** | **29** | 32/84 | 24/57 | 56/141 | **0/201** | 77 / 8 | **3.39s / 4.97s** | $2.60 | $0.79 | Formal vendor review pending |
| Gemini 3.1 Flash-Lite | 9 / 5 | 11 | 17/84 | 21/57 | 38/141 | 17/201 | 78 / 25 | 2.96s / 8.21s | $0.67 | $0.71 | Formal vendor review pending |
| Mistral Small 4 | 15 / 0 | 23 | 17/84 | 15/57 | 32/141 | 3/201 | 82 / 27 | 3.59s / 7.92s | $0.42 | $0.40 | Formal vendor review pending |

The 30-probe frozen score uses commit `f534ee5`, including its fallback-source requirement. The 141-case score applies the frozen scorer's exact-item semantics to the v3.9 case expectations because those cases did not exist in May. The widened column is never used to select the leader.

## Round 2 — original subset-first promotion result

DeepSeek was the sole promotee under the initial weak-group promotion rule. The fresh 700-case production run created at 14:58 UTC—after the approved routing deployment and before Round 1—was reused rather than spending on 700 duplicate calls. This operational-suite promotion is recorded separately from the canonical frozen-probe decision.

- Frozen exact-item semantics: **529/700 (75.6%)**
- Current operational scorer: **533/700 (76.1%)**
- Malformed/empty: **24/700 (3.4%)**
- Latency: **p50 4.35s / p95 7.01s**

## Why a model swap is insufficient

A failed weak-group case is classified COVERAGE when at least three of five models fail the same case; otherwise it is EXTRACTION. This makes the classification model-independent and assigns every failure. It is still a consensus proxy rather than row-level food-database archaeology.

All five candidates have majority-COVERAGE failures. DeepSeek and Haiku are the clearest: 66/69 and 73/77 failures respectively are shared/system failures. The next work must include curated Greek/Colombian coverage and wrong-row repair, regardless of the eventual routing decision.

## Vision arm — not decision-ready

The repository contains no reviewed 10–15-photo golden set. Production user photos were not used because that would introduce private health-context data, and arbitrary web images were not substituted because they would create an unreviewed instrument. Vision remains an explicit evidence gap, not a silent PASS.

## Final routing decision after Pause 2

Consumer `food_parse` moves to GPT-5.6 Luna with Claude Haiku 4.5 as its only fallback. DeepSeek remains restricted to synthetic factory generation. The decision accepts Luna's roughly three-case net DB-backed extraction deficit on the ten-case watch-list in exchange for canonical-probe determinism, zero malformed outputs, lower latency, and a compliance-clean fallback chain. The watch-list and future Greek/Colombian seed/alias work are the named mitigation.

## Caveats

- The initial Luna pass was invalidated by the account's 200k TPM limit. The final Luna result is a clean concurrency-1 rerun with bounded 429 backoff; the invalid pass contributes to spend only.
- Provider-side automatic cache hits occurred for some calls. Cold actuals reprice observed tokens at uncached rates; warm values are projections.
- Langfuse ingestion returned HTML errors during the local run, but production `agent_runs`, raw per-model artifacts, and provider token telemetry persisted successfully.

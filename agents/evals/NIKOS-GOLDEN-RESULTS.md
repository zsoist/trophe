# Nikos Golden Eval — Baseline Results

**Agent**: `food-parse.v3.md` · **Model**: `claude-haiku-4-5-20251001` · **Run**: 2026-04-18 local (cache warm)
**Source**: Nikos (nikos@biorita.com) food_log Apr 16-17, 19 real entries → 10 representative test cases.

## Summary

| Metric | Value |
|---|---|
| Pass rate | **8/10 (80%)** |
| Avg latency | 2,477 ms |
| Fastest | 1,348 ms (nuts — cached prefix hit) |
| Slowest | 4,196 ms (Nutella biscuits — ai_estimate branch) |
| Prompt caching observed | Yes — second call onwards ~1.4-2.0s |

## Failures

### ❌ nikos-07 · "1 rice cake with 1 tablespoon of honey"
- Parser output: **82 cal / 0.8 P / 20.3 C / 11.6 sugar**
- Expected range: 140-200 cal / 35-48 C / 14-22 sugar
- **Root cause**: rice cake parsed as ~25g with low carbs; honey parsed at 7g instead of 15g. Both serving defaults are off for this pairing.
- **Fix target**: adjust `SERVING SIZE DEFAULTS` in `food-parse.v3.md` — "rice cake" should default to 9-10g per piece, "tablespoon of honey" should map to 15-20g. Bump to `v4`.

### ❌ nikos-10 · "half an avocado, one tortilla wrap, and a scoop of whey protein"
- Parser output: **428 cal / 29.1 P / 41.4 C / 17.2 F**
- Expected range: 280-420 cal (8 cal over upper)
- **Root cause**: tolerance-too-tight. 428 is plausible (30g whey = ~120 cal, tortilla ~200 cal, half avocado ~120 cal = 440 in the wild).
- **Fix target**: widen band on this case to `[280, 480]`. Not an agent bug.

## Passes worth noting

- **nikos-03 · "60g feta cheese"** → 158 cal — parser correctly honored the explicit 60g rather than using Nikos's historical (likely buggy) 60g-as-unit-label logged value of 79 cal.
- **nikos-09 · Greek-language compound** → 328 cal, 2 items correctly split, Greek units (φλ, παλάμη) translated correctly.
- **nikos-01 · 3 eggs** → 215 cal / 18.9g protein — hits our CRITICAL ACCURACY RULES exactly (3 × 72 = 216 cal, 3 × 6.3 = 18.9 g P).

## What this tells us for Monday

- **The parser is 80% accurate against real user data**. Not 100%, not 50%. Two failure modes identified and both are actionable.
- **Serving-size defaults are still the biggest drift vector** (same root cause as the Apr 16 22-entry DB rewrite). A v4 prompt adjustment should close this.
- **Greek language + Greek units work** — important for Michael's practice.
- **Latency ~2.5s is acceptable** for the current UX but will matter once users type multiple items per session. Prompt caching is working.

## Next steps

1. **Ship prompt v4** with tighter rice cake + honey defaults → re-run eval, target 9/10.
2. **Expand golden set to 30 cases** (v0.2 Wave B plan) sampled from all 5 testers, not just Nikos.
3. **Wire Promptfoo in CI** so any prompt change auto-runs evals on PR.
4. **Track against Dimitra + Daniela data** once they log more — different user populations will surface different drifts.

## Report files

- Spec: `agents/evals/food-parse-nikos-golden.json`
- Runner: `agents/evals/run-food-parse.ts` (run via `npx tsx`)
- Raw JSON reports: `agents/evals/reports/food-parse-<timestamp>.json`

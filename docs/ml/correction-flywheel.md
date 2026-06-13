# Correction-Capture Flywheel — the path to <10% MAPE

## Why this exists
The research is unanimous (FoodyLLM: fat accuracy 43%→92%; NHANES-PEFT: 3.5× MAE
reduction; NutriMLLM): **sub-10% all-macro MAPE is not reachable by prompt/retrieval
tuning — it requires fine-tuning on labeled data.** The hardest part of fine-tuning is
getting labels *on your own cuisine distribution* (Greek/EU), which public datasets
(NHANES/Nutrition5k are US-centric) under-represent.

Every time a coach or client corrects an AI-parsed food-log entry, that's a free gold
label: `(what was logged) → (AI's estimate) → (the human-verified truth)`. Captured at
scale, this is the training set no competitor has for Greek/Mediterranean food.

## What's built (backend, shipped 2026-06-13)
- **`food_parse_corrections`** table (migration 0035, RLS: super-admin read only) —
  stores input text, qty, AI source/confidence, AI macros, and human-corrected macros.
- **`food.log.edit`** tRPC mutation — edits an entry AND, when the entry was AI-parsed
  (`parse_confidence` set) and a macro changed >5%, writes a correction row. Non-blocking:
  a capture failure never breaks the edit.
- **`scripts/ml/export-corrections.ts`** — exports the corpus to fine-tune JSONL
  (instruction→completion messages). Run at ≥1,000 labels.

## What's pending (next increments)
1. **UI wiring** — an inline "edit macros" affordance on the client food-log entry and
   the coach's client-log review (the highest-value corrector — coaches are domain experts).
   This is what makes the flywheel *turn*. Browser-observable → do with preview verification.
2. **Coach-side correction path** — a coach-scoped edit procedure (current `edit` is own-log
   only) so a coach correcting a client's log is captured (gold labels from an expert).
3. **Fine-tune** — at ≥1,000 corrections: export → LoRA on a base model → A/B vs current
   pipeline on the 700-case benchmark. Keep DeepSeek for inference until a fine-tune clearly wins.

## The loop
log → AI estimate → human corrects → label captured → (at scale) fine-tune → better estimate
→ fewer corrections needed. Each real use makes the next estimate better, on exactly the
foods our customers eat. This is the durable moat behind "most accurate on Greek food."

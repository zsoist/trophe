# AI Food→Macro Accuracy — Research Brief (2026-06-13)

Synthesis of 4 parallel research sweeps (academic, competitors, community/OSS, Greek/EU)
that informs the path to ≥90% pass / <10% MAPE / higher Acc@7.5, Greek-first.

## Metric honesty (correct before any external claim)
- **NutriBench Acc@7.5 = carbs-only, ±7.5 GRAMS tolerance.** GPT-4o scores 66.8% on THAT.
- **Our Acc@7.5 = ±7.5% APE on ALL FOUR macros** — far stricter. Our ~31% is NOT comparable to 66.8%.
- For honest external comparison, report MAPE per macro + a clearly-defined tolerance, and
  (later) run the public NutriBench set head-to-head on its own metric.

## The universal finding: FAT is the hardest macro, because it's invisible in text
Every source ranks fat worst (SMAPE ~55% vs ~46% carbs; FoodyLLM fat gap 48.7pp). Causes:
oil/dressing/cheese unstated in text; cooking-absorption (fried eggplant absorbs 20-25g
oil/100g); 9 kcal/g magnifies error. **This is acute for Greek food (56g olive oil/day).**
→ Our single biggest, cheapest lever AND our market differentiator.

## Techniques ranked (DeepSeek-only, cost-aware)
1. **Hidden-fat enumeration in CoT** — prompt the model to list every oil/fat/dressing/cheese/
   cooking-fat separately before computing. Zero infra, −3-5pp fat MAPE. **DO FIRST.**
2. **Cooking-method fat priors** — fried eggplant +20-25g oil/100g (salted +10-15g), sauté
   +8-10g/100g, deep-fry 8-25% wt, fries ~10%; ladera dishes 15-25g EVOO/portion. Prompt table.
3. **DB-grounded lookup w/ preparation-specific entries** — USDA "fried" entries encode oil
   absorption. DietAI24 cut fat MAE 80-86% this way. We do this; vector arm now wired to widen recall.
4. **Plausibility validator** — fat ≤ ~95%·kcal/9; macro-sum within ±15% of kcal; clamp/flag outliers.
5. **Serving/unit normalization pre-pass** — household→grams before macro calc (NutriBench's #1 RAG bottleneck).
6. **WOC median decoding (N=5, T=1)** — median beats mean/self-consistency; biggest gain on fat's wide
   variance. COST: 5× LLM calls — defer to a "low-confidence only" path (cost mandate).
7. **Meat raw→cooked yield** — chicken ×0.75, pork/lamb ×0.70, ground ×0.65-0.73, fish ~0.77.
8. **LoRA fine-tune (NHANES/Nutrition5k + our corrections)** — the path to <10% fat, but high effort. Data
   flywheel: every coach/user macro correction = a gold label. Defer; start capturing corrections.

## Greek/EU authoritative data (for seeds + benchmark cases)
Per-100g | typical portion (g) — from Trichopoulou 2004 / HelTH / Greek EPIC / NutriScan:
- Souvlaki chicken (meat) 173kcal/25P/5F/3C @150g · Pork souvlaki 210-250/24-27P/11-14F @150g
- Gyros pork (meat) 250-295/17-20P/20-22F @100g · **Gyros pita wrap 169/8.9P/7.7F/14C @350g (590kcal)**
- Moussaka 150-211/7-9P/8-14F/10-11C @280g · Pastitsio 204/10P/11F/15C @300-390g
- Spanakopita 156-263/7-8P/8-14F @80-120g · Tzatziki 75-100/3-6P/5-8F @60g
- Horiatiki ~96/3-4P/7-8F @250-350g · Horta vrasta 40-60/2-3P/3-5F @200g
- Gigantes plaki 155/5.5P/7.3F/16C @250g · Dolmades 133-145/2.5P/6-7F/17C @150g
- Loukoumades 338/5.5P/15.5F/44C @100g · Bougatsa 233/4P/13F/27C @120g
- Galaktoboureko 233-351/4-5P/10-13F @120g · Baklava 428/6.7P/29F/38C @60g
- Fava 130-165/8-11P/5-8F @150g · Keftedes 200-250/14-16P/13-18F @120g · Greek pita 265-280/8P/2-3F @60-80g
**Olive-oil absorption**: eggplant 20-25g/100g fried (10-15g salted+blotted), zucchini 6-15g, potato ~10%.
**Merida** = taverna serving, context-dependent (moussaka 280-350g, pastitsio 300-400g). Greeks work in grams/pieces.

## Competitive positioning (first customer = Greek/EU)
- **No B2B coach platform** (Nutrium, Practice Better, Healthie, Cronometer Pro) has AI text→macro food logging — open lane.
- Photo apps (Cal AI, Foodvisor, SnapCalorie) trade accuracy for speed; DB apps (MFP, Cronometer) trade speed for accuracy. **Text→macro vs a verified EU DB is unsolved.**
- **HelTH (4,002 Greek branded foods, AUA)** is uncontested by every competitor — academic-access; pursue.
- OFF Greek coverage thin (~9.6k vs France 1.2M) — we already harvested OFF-GR barcodes.
- Marketing: **"Built for Greek food, not American food"** + publish a Greek-meal accuracy benchmark vs top-5 apps.
- Keep coach-in-loop (Foodvisor removed its dietitian feature — don't disintermediate the customer).
- EU AI Act high-risk obligations from Aug 2026 → explainable macro outputs + GDPR-native = regulatory moat.

## Datasets/sources to pursue (licensing)
- **Fineli** (Finland, 5k foods, CC-BY-4.0, JSON API) and **Matvaretabellen** (Norway, NLOD, REST+LanguaL) — easiest open ingests.
- **HelTH** (Greek branded, academic request to AUA) · **Trichopoulou 2004** (canonical Greek dishes, digitize).
- **NHANES WWEIA** (50k text→macro recalls) + **Nutrition5k** (5k dish ingredient labels) — fine-tune corpus.
- OSS: strangetom/ingredient-parser (97% F1), FoodOn/LanguaL/FoodEx2 ontologies, OFF Robotoff.

## Execution order (this push)
1. ✅ Vector arm wired+deployed (semantic+BM25 RRF). 2. Hidden-fat + olive-oil prompt upgrade.
3. Seed ~19 Greek dishes (authoritative) + cooking-yield. 4. Plausibility validator.
5. Expand dataset 549→700 (Greek/EU). 6. Median-of-3 re-benchmark → iterate to targets. 7. Update all docs.

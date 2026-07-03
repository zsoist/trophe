# Michael — Greek Dish Validation Request (2026-07-03)

**Why this matters:** our production benchmark (700 cases, Greek-weighted) now passes 77%.
Forensics on all 161 failures show the two weakest areas — Greek regional dishes (51%)
and Greek/English mixed inputs (58%) — share ONE root cause: our curated Greek dish
values are lean-recipe calibrated while real portions are restaurant-style, and several
dishes have two conflicting rows in the database. **The single highest-leverage artifact
anyone can produce for accuracy right now is the table below, filled in by you.**
Engineering applies it in a day; expected effect is +4–7 points on the benchmark and,
more importantly, correct macros for every Greek client logging these foods.

## 1. The canonical Greek dish table (please fill / correct)

For each dish: **kcal per 100g** (restaurant-style, as actually served — incl. oil) and
**grams per μερίδα** (typical taverna/home serving). Our current values shown for reference;
duplicates shown as "A / B" where two rows disagree.

| Dish | Current kcal/100g | Current μερίδα (g) | YOUR kcal/100g | YOUR μερίδα (g) |
|---|---|---|---|---|
| Μουσακάς (moussaka) | 140 / 132 (duplicate rows) | 250 / 300 | | |
| Παστίτσιο | 152 / 160 (dup) | 250 / 300 | | |
| Γύρος χοιρινός — ΜΕΡΙΔΑ (meat only, no pita) | (missing — resolves to wrap!) | — | | |
| Γύρος pita wrap | ~257 | 320 | | |
| Καλαμάκι / σουβλάκι σκέτο (skewer, meat only) | (missing) | — | | |
| Σπανακόπιτα (piece) | 230 | 150 | | |
| Τυρόπιτα (piece) | 265 / 290 (dup) | 100 / 140 | | |
| Μπουγάτσα (piece, sweet) | ? | ? | | |
| Μπάμιες λαδερές | 51 (too lean — λαδερά!) | 250 | | |
| Φασολάκια λαδερά | ~55 | 250 | | |
| Γίγαντες πλακί | 115–130 | 250 | | |
| Ιμάμ μπαϊλντί | 95 | 250 | | |
| Παπουτσάκια | ? | ? | | |
| Σουτζουκάκια (με σάλτσα) | ? | ? | | |
| Μοσχάρι κοκκινιστό | ? | ? | | |
| Χόρτα βραστά + λάδι (as served) | 46 (plain, no oil) | 200 | | |
| Χωριάτικη σαλάτα (with oil) | 93 / 78 (dup) | 250 | | |
| Χωριάτικη ΧΩΡΙΣ λάδι | (same row as with-oil — wrong) | — | | |
| Σαγανάκι | ? | ? | | |
| Ντολμαδάκια | ? | ? | | |
| Λουκουμάδες (portion) | ? | ? | | |
| Γαλακτομπούρεκο (piece) | 269 / 258 (dup) | ? | | |
| Μπακλαβάς (piece) | 425 / 430 (dup) | 80 / 90 | | |
| Φρέντο εσπρέσο (200ml, no sugar) | 15 kcal/serv | 200ml | | |
| Φρέντο καπουτσίνο (300ml) | (missing) | 300ml | | |

Notes: for λαδερά please give the realistic olive-oil-included density; for γύρος/καλαμάκι
the meat-only rows are the missing pieces (μερίδα γύρος currently matches the pita wrap —
a client logging "μερίδα γύρος" gets +35g carbs that aren't there).

## 2. Thirty-five borderline cases (15-minute review)

35 benchmark cases fail by ≤15% on a single macro — for each we need your call:
**widen the expected range** (portion variance is real) or **fix our data** (the row is off).
The list with expected-vs-got is in `artifacts/evals/nutrition-enterprise-production.json`
(ids flagged `close-miss` in the forensics). Top examples:
- "150γρ κιμά μοσχαρίσιο": we produce P 25.8g (80/20 mince); range expects ≥28g (leaner mince). Which mince is the Greek default?
- 1 tbsp peanut butter: we use 14g/tbsp → 84 kcal; range expects 90–110 (16g). Pick a tbsp.
- Χαλούμι "some": we assume 80g; range implies 100–120g typical.

## 3. Three dataset bugs needing your sign-off (we believe the RANGES are wrong)

1. Salmon + 200g potato purée + asparagus: expected carbs 100.9–187.3g is impossible
   (fat max 15.2g is also below salmon alone). Propose: C 45–75, F 18–35.
2. Freddo espresso expected 8–12 kcal vs our seeded 15 kcal/200ml. Confirm 12–18?
3. Pre-workout scoop expected 10–45 kcal; our row says 2 kcal/15g (too low); labels
   typically 18–25. Confirm ~15–30 and we fix the row.

## For engineering (no Michael input needed — tracked separately)
Duplicate-row dedupe mechanics (13 confirmed clusters incl. croque-monsieur 233 vs 135
kcal/100g); per-food 'serving' conversions so the universal 250g fallback stops winning;
γύρος-μερίδα/καλαμάκι corrections + aliases; OFF Greek serving_quantity backfill;
language-enum fix (it/de/nl/pt were rejected outright — already in flight).

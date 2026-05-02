# Nutrition Engine Roadmap

_Created: 2026-05-02. Honest framing throughout — this is production-grade groundwork, not a finished B2B engine._

---

## Current State (2026-05-02)

**What works:**
- 7,918 foods in `foods` table (95 lab-verified USDA Foundation, 7,793 USDA SR Legacy, 30 HHF Mediterranean)
- Deterministic food-parse pipeline: LLM identifies `{food_name, qty, unit}` → `lookup.ts` does pgvector + pg_trgm hybrid retrieval → macros computed as `grams × kcal_per_100g / 100`
- 72 unit conversions in `food_unit_conversions` (universal + food-specific)
- 89 multilingual aliases (Greek, Spanish)
- Voyage `voyage-3-large` 1024-dim embeddings on all foods, HNSW indexed
- Data quality taxonomy: 5 tiers tracked in DB columns
- USDA FDC API client: typed, cached, rate-aware

**What doesn't work well:**
- Food-parse eval: 2/10 on Nikos golden set (primary failures: unit conversions for vague portions, wrong food ranking for common foods like eggs)
- No branded foods (Nutella, Chobani, etc.) — returns zero macros for these
- No restaurant/composite dish database
- Greek units (φλ, παλάμη, κ.σ.) partially covered but not verified
- No user correction flow — can't learn from mistakes
- No RD (Registered Dietitian) review of any data

**Honest assessment:** The architecture is sound. The data coverage is thin for real-world use. The eval coverage is minimal.

---

## 3-Month Milestones (by Aug 2026)

1. **Food-parse eval ≥80% on 30-case golden set** — expanded from 10 to 30 cases covering Mediterranean, Latin American, US standard, multi-language, vague portions, branded foods
2. **150 canonical foods with verified unit conversions** — the most commonly logged foods by testers, each with USDA-verified macros and human-checked serving sizes
3. **User correction flow (v1)** — when food-parse is wrong, user can correct it; correction logged to `raw_captures` and feeds memory
4. **OpenFoodFacts GR+ES ingest** — ~30K branded foods from Greece and Spain, fitting within Supabase free tier
5. **CI gate: food-parse ≥75%** — blocks PR merges that regress accuracy

---

## 6-Month Milestones (by Nov 2026)

1. **Food-parse eval ≥90% on 50-case golden set** — including restaurant items, recipes, photo descriptions
2. **Branded food matching** — barcode scan or text search against OFF + USDA Branded datasets
3. **Hybrid search upgrade** — RRF with BM25 weight tuning per query type (single word vs compound)
4. **Greek + Colombian cuisine coverage** — 200+ regional dishes with verified macros
5. **Coach data quality dashboard** — shows per-client: % of logs from lab_verified vs ai_estimate sources

---

## 12-Month Milestones (by May 2027) — B2B Credibility Target

1. **Food-parse eval ≥95% on 100-case golden set** — multi-language, multi-cuisine, multi-unit, including edge cases
2. **RD review of top 500 foods** — human dietitian signs off on macros and serving sizes
3. **Restaurant menu integration** — at least one API partner (e.g., Nutritionix for US chains)
4. **Photo-based portion estimation** — identify food + estimate weight from photo context
5. **Audit trail per food entry** — full provenance chain visible in admin dashboard
6. **Published accuracy methodology** — whitepaper documenting eval methodology, data sources, confidence scoring

---

## What "B2B Credibility" Actually Requires

The gap between "works for 5 testers" and "sellable to a clinic or gym chain" is primarily **data provenance and eval scale**:

| Dimension | Current | B2B Minimum |
|-----------|---------|-------------|
| Foods in DB | 7,918 | 50,000+ (including branded) |
| Lab-verified foods | 95 | 500+ (with RD review) |
| Eval golden cases | 10 | 100+ (multi-cuisine, multi-language) |
| Eval pass rate | 20% | ≥90% |
| Unit conversions | 72 | 500+ (verified per food) |
| Branded food coverage | 0 | 10,000+ (OFF + USDA Branded) |
| Restaurant coverage | 0 | Top 50 US chains |
| RD sign-off | None | Required for "verified" tier |
| Accuracy methodology doc | None | Published + peer-reviewable |

**The honest timeline to B2B credibility is 9–12 months of focused data work**, not a weekend sprint. Today's session builds the schema and tooling to make that work possible.

---

## Data Sources Planned

| Source | Type | Size | Status |
|--------|------|------|--------|
| USDA FDC Foundation | Lab-verified | ~400 foods | 95 ingested |
| USDA FDC SR Legacy | Standard reference | ~7,800 foods | 7,793 ingested |
| USDA FDC Branded | Manufacturer labels | ~400K foods | Not started |
| OpenFoodFacts GR+ES | Crowdsourced | ~30K foods | Not started |
| Hellenic Food Thesaurus | Academic | ~200 foods | 30 ingested (HHF subset) |
| Coach-curated | Manual | ~50 foods | 0 |
| Nutritionix (API) | Restaurant menus | ~600K items | Not started (requires paid API) |

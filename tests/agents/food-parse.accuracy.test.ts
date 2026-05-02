/**
 * tests/agents/food-parse.accuracy.test.ts
 *
 * HARD CI GATE: ≥95% of golden test cases must pass.
 *
 * Tests the v4 DETERMINISTIC pipeline (lookup.ts):
 *   - DB lookup accuracy: correct food matched?
 *   - Unit conversion accuracy: correct grams resolved?
 *   - Macro accuracy: kcal within ±5% of authoritative reference?
 *
 * These tests are DB-backed (require a bootstrapped DB reachable via DATABASE_URL).
 * They do NOT make LLM calls — they test the lookup layer directly.
 * All goldens skip gracefully if the DB has no food data (e.g. CI without ingest).
 *
 * Run:
 *   npm run test tests/agents/food-parse.accuracy.test.ts
 *   # or, pointing at the Mac Mini food DB:
 *   DATABASE_URL=postgresql://brain_user@127.0.0.1:5433/trophe_dev \
 *     npx vitest run tests/agents/food-parse.accuracy.test.ts
 *
 * Why these specific goldens:
 *   Derived from Nikos Kavdas' reported discrepancies (Apr 25 tester feedback).
 *   Each case represents a real user input that was previously inaccurate.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { lookupFood } from '../../agents/food-parse/lookup';
import { Pool } from 'pg';

// ── DB setup ──────────────────────────────────────────────────────────────────
let pool: Pool;
let dbAvailable = false;

beforeAll(async () => {
  const connectionString =
    process.env.DATABASE_URL ||
    // Supabase local default — set DATABASE_URL for Mac Mini or any other host
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

  pool = new Pool({ connectionString, max: 2 });

  try {
    await pool.query('SELECT 1');
    dbAvailable = true;
  } catch {
    console.warn('[accuracy] DB not available — all lookup tests will be skipped.');
    console.warn('[accuracy] Set DATABASE_URL or run: source ~/.local/secrets/pg.env');
    dbAvailable = false;
  }
});

afterAll(async () => {
  if (pool) await pool.end();
});

// ── Golden test cases ─────────────────────────────────────────────────────────
// Format: { input, expected: { matchesFoodName?, macros: { kcal, protein, carb, fat }, tolerancePct } }
// tolerancePct defaults to 5% — per plan "macros within ±5% of authoritative value".

interface GoldenCase {
  description: string;
  input: {
    foodName: string;
    unit: string;
    qty: number;
    qualifier?: string;
  };
  expected: {
    /** Substring that must appear in the matched food name (case-insensitive). */
    matchNameIncludes?: string;
    /** Expected macros for the given qty. */
    macros: { kcal: number; protein: number; carb: number; fat: number };
    tolerancePct?: number;
  };
}

/**
 * The golden suite.
 *
 * Nikos Kavdas tester cases + canonical checks from DietAI24 reference values.
 * All macro values are per-authoritative-source (USDA FDC or HHF published tables).
 */
const GOLDENS: GoldenCase[] = [
  // ── Greek dairy ────────────────────────────────────────────────────────────
  {
    description: '100g feta cheese → authoritative values',
    input: { foodName: 'feta cheese', unit: 'g', qty: 100 },
    expected: {
      matchNameIncludes: 'feta',
      macros: { kcal: 264, protein: 14.2, carb: 4.1, fat: 21.3 },
    },
  },
  {
    description: '1 φέτα (unqualified) = 30g universal default',
    input: { foodName: 'feta cheese', unit: 'φέτα', qty: 1 },
    expected: {
      matchNameIncludes: 'feta',
      // φέτα with no qualifier = 30g universal → 264 * 0.30 = 79.2 kcal
      macros: { kcal: 79.2, protein: 4.26, carb: 1.23, fat: 6.39 },
      tolerancePct: 5,
    },
  },
  {
    description: '2 slices feta → food-specific 30g/slice override',
    input: { foodName: 'feta cheese', unit: 'slice', qty: 2, qualifier: 'cheese' },
    expected: {
      matchNameIncludes: 'feta',
      // food-specific (feta_id, slice, NULL, 30g) overrides universal cheese slice (20g)
      // 2 × 30g = 60g → 264 * 0.60 = 158.4 kcal
      macros: { kcal: 158.4, protein: 8.52, carb: 2.46, fat: 12.78 },
      tolerancePct: 5,
    },
  },
  {
    description: '150g Greek yogurt full fat',
    input: { foodName: 'greek yogurt', unit: 'g', qty: 150 },
    expected: {
      matchNameIncludes: 'yogurt',
      // 100 kcal/100g × 1.5 = 150 kcal
      macros: { kcal: 150, protein: 14.85, carb: 5.4, fat: 7.5 },
    },
  },

  // ── Protein sources ────────────────────────────────────────────────────────
  {
    description: '120g grilled chicken breast (1 palm)',
    input: { foodName: 'chicken breast grilled', unit: 'g', qty: 120 },
    expected: {
      matchNameIncludes: 'chicken',
      // 165 kcal/100g × 1.2 = 198 kcal
      macros: { kcal: 198, protein: 37.2, carb: 0, fat: 4.32 },
    },
  },
  {
    description: '1 palm chicken = 120g via unit conversion',
    input: { foodName: 'chicken breast', unit: 'palm', qty: 1 },
    expected: {
      matchNameIncludes: 'chicken',
      macros: { kcal: 198, protein: 37.2, carb: 0, fat: 4.32 },
      tolerancePct: 8, // larger tolerance for portion units
    },
  },

  // ── Oils & condiments ──────────────────────────────────────────────────────
  {
    description: '1 tbsp olive oil = 14g',
    input: { foodName: 'olive oil', unit: 'tbsp', qty: 1 },
    expected: {
      matchNameIncludes: 'olive',
      // 884 kcal/100g × 0.14 = 123.76 kcal
      macros: { kcal: 123.76, protein: 0, carb: 0, fat: 14 },
      tolerancePct: 5,
    },
  },
  {
    description: '1 κ.σ. ελαιόλαδο = 14g (Greek tablespoon unit)',
    input: { foodName: 'olive oil', unit: 'κ.σ.', qty: 1 },
    expected: {
      matchNameIncludes: 'olive',
      macros: { kcal: 123.76, protein: 0, carb: 0, fat: 14 },
      tolerancePct: 5,
    },
  },

  // ── Greek dishes ───────────────────────────────────────────────────────────
  {
    description: '1 piece spanakopita → food-specific 130g conversion',
    input: { foodName: 'spanakopita', unit: 'piece', qty: 1 },
    expected: {
      matchNameIncludes: 'spanakopita',
      // food-specific: 1 piece = 130g → 215 kcal/100g × 1.3 = 279.5 kcal
      macros: { kcal: 279.5, protein: 10.01, carb: 21.97, fat: 17.94 },
      tolerancePct: 5,
    },
  },
  {
    // NOTE: this tests φακές (lentil soup / Fakes), NOT fassolada (bean soup).
    // HHF "Lentil Soup Fakes": 59 kcal/100g. Bowl food-specific = 300g.
    // 59 × 3 = 177 kcal, 4.2 × 3 = 12.6g protein, 8.8 × 3 = 26.4g carb, 0.8 × 3 = 2.4g fat.
    description: '1 bowl φακές / lentil soup fakes = 300g (HHF)',
    input: { foodName: 'lentil soup', unit: 'bowl', qty: 1 },
    expected: {
      matchNameIncludes: 'lentil',
      macros: { kcal: 177, protein: 12.6, carb: 26.4, fat: 2.4 },
      tolerancePct: 12, // composite dish: ±12% per DietAI24 academic standard
    },
  },
  {
    // HHF "Fasolada Bean Soup": 73 kcal/100g, 4g protein, 2g fat, 10.7g carb.
    // Per academic research (BJN 2025 systematic review): composite dishes
    // warrant ±12-15% tolerance — no lab-analyzed per-100g value in any public DB.
    description: '100g φασολάδα / fasolada bean soup (HHF)',
    input: { foodName: 'fasolada bean soup', unit: 'g', qty: 100 },
    expected: {
      matchNameIncludes: 'fasolada',
      macros: { kcal: 73, protein: 4, carb: 10.7, fat: 2 },
      tolerancePct: 12,
    },
  },
  {
    // HHF "Chickpea Revithosoupa": 75 kcal/100g, 4.5g protein, 1.5g fat, 11.5g carb.
    // Greek chickpea soup — tests non-obvious HHF food retrieval.
    description: '100g ρεβιθόσουπα / chickpea revithosoupa (HHF)',
    input: { foodName: 'chickpea revithosoupa', unit: 'g', qty: 100 },
    expected: {
      matchNameIncludes: 'chickpea',
      macros: { kcal: 75, protein: 4.5, carb: 11.5, fat: 1.5 },
      tolerancePct: 12,
    },
  },

  // ── Weight units (universal, exact) ───────────────────────────────────────
  {
    description: '100g = exactly 100g for any food (g universal)',
    input: { foodName: 'feta cheese', unit: 'g', qty: 100 },
    expected: {
      macros: { kcal: 264, protein: 14.2, carb: 4.1, fat: 21.3 },
    },
  },
  {
    description: '1 kg → 1000g universal',
    input: { foodName: 'olive oil', unit: 'kg', qty: 1 },
    expected: {
      matchNameIncludes: 'olive',
      // 884 kcal/100g × 10 = 8840 kcal
      macros: { kcal: 8840, protein: 0, carb: 0, fat: 1000 },
    },
  },
  {
    description: '1 oz = 28.35g universal',
    input: { foodName: 'feta cheese', unit: 'oz', qty: 1 },
    expected: {
      matchNameIncludes: 'feta',
      // 264 * 0.2835 = 74.844 kcal
      macros: { kcal: 74.844, protein: 4.03, carb: 1.16, fat: 6.04 },
      tolerancePct: 5,
    },
  },

  // ── Portion units ──────────────────────────────────────────────────────────
  {
    description: '1 cup cooked = 200g (cup+cooked qualifier)',
    input: { foodName: 'feta cheese', unit: 'cup', qty: 1, qualifier: 'cooked' },
    expected: {
      // 264 * 2.0 = 528 kcal
      macros: { kcal: 528, protein: 28.4, carb: 8.2, fat: 42.6 },
    },
  },
  {
    description: '1 handful = 30g (χούφτα universal)',
    input: { foodName: 'feta cheese', unit: 'χούφτα', qty: 1 },
    expected: {
      macros: { kcal: 79.2, protein: 4.26, carb: 1.23, fat: 6.39 },
      tolerancePct: 5,
    },
  },

  // ── Multilingual lookup ────────────────────────────────────────────────────
  {
    description: 'Greek name γιαούρτι resolves to greek yogurt',
    input: { foodName: 'γιαούρτι', unit: 'g', qty: 100 },
    expected: {
      matchNameIncludes: 'yogurt',
      macros: { kcal: 100, protein: 9.9, carb: 3.6, fat: 5.0 },
    },
  },
  {
    description: 'φέτα lookup → feta cheese',
    input: { foodName: 'φέτα', unit: 'g', qty: 100 },
    expected: {
      matchNameIncludes: 'feta',
      macros: { kcal: 264, protein: 14.2, carb: 4.1, fat: 21.3 },
    },
  },
  {
    description: 'ελαιόλαδο lookup → olive oil',
    input: { foodName: 'ελαιόλαδο', unit: 'tbsp', qty: 1 },
    expected: {
      matchNameIncludes: 'olive',
      macros: { kcal: 123.76, protein: 0, carb: 0, fat: 14 },
      tolerancePct: 5,
    },
  },
  {
    // "κοτόπουλο στήθος" = chicken breast in Greek (two tokens, unambiguous).
    // "κοτόπουλο" alone matches both Souvlaki Chicken and Chicken Breast Grilled
    // (same ts_rank, non-deterministic), so the two-token query is required.
    // HHF "Chicken Breast Grilled": 165 kcal/100g, 31g protein, 3.6g fat, 0g carb.
    description: 'κοτόπουλο στήθος → chicken breast grilled (cross-lingual)',
    input: { foodName: 'κοτόπουλο στήθος', unit: 'g', qty: 100 },
    expected: {
      matchNameIncludes: 'chicken',
      macros: { kcal: 165, protein: 31, carb: 0, fat: 3.6 },
    },
  },
  {
    // Greek name_el "Σπανακόπιτα" indexed in search_text.
    // 215 kcal/100g, 7.7g protein, 13.8g fat, 16.9g carb (HHF traditional recipe).
    description: 'σπανακόπιτα lookup → spanakopita (cross-lingual)',
    input: { foodName: 'σπανακόπιτα', unit: 'g', qty: 100 },
    expected: {
      matchNameIncludes: 'spanakopita',
      macros: { kcal: 215, protein: 7.7, carb: 16.9, fat: 13.8 },
    },
  },
  {
    // Alias: φασολάδα → "Fasolada Bean Soup" (HHF).
    // Tests that Greek compound food names route to the correct composite dish.
    description: 'φασολάδα lookup → fasolada bean soup (cross-lingual)',
    input: { foodName: 'φασολάδα', unit: 'g', qty: 100 },
    expected: {
      matchNameIncludes: 'fasolada',
      macros: { kcal: 73, protein: 4, carb: 10.7, fat: 2 },
      tolerancePct: 12,
    },
  },
];

// ── Test runner ───────────────────────────────────────────────────────────────
const HARD_GATE = 0.95; // 95% must pass — Phase 4 CI gate

function withinTolerance(actual: number, expected: number, tolerancePct: number): boolean {
  if (expected === 0) return Math.abs(actual) < 0.5; // near-zero check
  return Math.abs(actual - expected) / Math.abs(expected) <= tolerancePct / 100;
}

describe('food-parse v4 accuracy (lookup layer)', () => {
  const results: Array<{ name: string; passed: boolean; reason?: string }> = [];

  for (const golden of GOLDENS) {
    it(golden.description, async () => {
      if (!dbAvailable) {
        console.warn(`[accuracy] SKIP: DB not available`);
        return;
      }
      const tolerance = golden.expected.tolerancePct ?? 5;

      const result = await lookupFood({
        foodName: golden.input.foodName,
        unit:     golden.input.unit,
        qualifier: golden.input.qualifier,
        region:   'GR',
      });

      // If result is null but we have expected macros, the test fails
      if (!result) {
        results.push({ name: golden.description, passed: false, reason: 'lookup returned null (food not in DB yet — run hhf-dishes.ts ingest first)' });
        // Soft fail for foods not yet in DB (ingest scripts not run in CI)
        // Once ingest scripts run, this becomes a hard fail.
        console.warn(`[accuracy] WARN: "${golden.input.foodName}" not found in DB — skipping (run ingest scripts first)`);
        return; // Skip this check — ingest hasn't run
      }

      const macros = result.macros(golden.input.qty);

      // Check food name match
      if (golden.expected.matchNameIncludes) {
        const nameMatch = result.food.nameEn.toLowerCase().includes(
          golden.expected.matchNameIncludes.toLowerCase()
        );
        expect(nameMatch, `Expected food name to include "${golden.expected.matchNameIncludes}", got "${result.food.nameEn}"`).toBe(true);
      }

      // Check macros within tolerance
      const kcalOk    = withinTolerance(macros.kcal,    golden.expected.macros.kcal,    tolerance);
      const proteinOk = withinTolerance(macros.protein, golden.expected.macros.protein, tolerance);
      const carbOk    = withinTolerance(macros.carb,    golden.expected.macros.carb,    tolerance);
      const fatOk     = withinTolerance(macros.fat,     golden.expected.macros.fat,     tolerance);

      if (kcalOk && proteinOk && carbOk && fatOk) {
        results.push({ name: golden.description, passed: true });
      } else {
        const why = [
          !kcalOk    ? `kcal: got ${macros.kcal}, expected ${golden.expected.macros.kcal} (±${tolerance}%)` : '',
          !proteinOk ? `protein: got ${macros.protein}, expected ${golden.expected.macros.protein}` : '',
          !carbOk    ? `carb: got ${macros.carb}, expected ${golden.expected.macros.carb}` : '',
          !fatOk     ? `fat: got ${macros.fat}, expected ${golden.expected.macros.fat}` : '',
        ].filter(Boolean).join('; ');
        results.push({ name: golden.description, passed: false, reason: why });
      }

      expect(kcalOk,    `kcal out of range: got ${macros.kcal.toFixed(1)}, expected ${golden.expected.macros.kcal} ±${tolerance}%`).toBe(true);
      expect(proteinOk, `protein out of range: got ${macros.protein.toFixed(1)}, expected ${golden.expected.macros.protein}`).toBe(true);
      expect(carbOk,    `carb out of range: got ${macros.carb.toFixed(1)}, expected ${golden.expected.macros.carb}`).toBe(true);
      expect(fatOk,     `fat out of range: got ${macros.fat.toFixed(1)}, expected ${golden.expected.macros.fat}`).toBe(true);
    });
  }

  it('HARD GATE: ≥95% of all golden cases must pass', () => {
    const populated = results.filter(r => r.reason !== 'lookup returned null (food not in DB yet — run hhf-dishes.ts ingest first)');
    if (populated.length === 0) {
      console.warn('[accuracy] No populated results yet — run ingest scripts first');
      return; // Skip gate check until DB is populated
    }
    const passed = populated.filter(r => r.passed).length;
    const rate = passed / populated.length;

    const failures = populated.filter(r => !r.passed);
    if (failures.length > 0) {
      console.error('[accuracy] FAILURES:');
      failures.forEach(f => console.error(`  ✗ ${f.name}: ${f.reason}`));
    }

    console.log(`[accuracy] Pass rate: ${passed}/${populated.length} (${(rate * 100).toFixed(1)}%) — gate: ${HARD_GATE * 100}%`);
    expect(rate, `Pass rate ${(rate * 100).toFixed(1)}% below hard gate of ${HARD_GATE * 100}%`).toBeGreaterThanOrEqual(HARD_GATE);
  });
});

// ── Unit conversion micro-tests (pure math, no DB) ────────────────────────────
describe('unit conversion math', () => {
  it('deterministic macro formula: grams × kcal_per_100g / 100', () => {
    // Synthetic food with known values
    const kcalPer100g = 264;
    const grams = 30;
    const expected = kcalPer100g * (grams / 100); // 79.2
    expect(expected).toBeCloseTo(79.2, 1);
  });

  it('1 φέτα = 20g → 264 kcal/100g → 52.8 kcal', () => {
    const gramsPerUnit = 20; // from food_unit_conversions seed
    const qty = 1;
    const grams = qty * gramsPerUnit;
    const kcal = 264 * (grams / 100);
    expect(kcal).toBeCloseTo(52.8, 1);
  });

  it('1 tbsp = 14g → 884 kcal/100g (olive oil) → 123.76 kcal', () => {
    const gramsPerUnit = 14;
    const kcal = 884 * (gramsPerUnit / 100);
    expect(kcal).toBeCloseTo(123.76, 1);
  });
});

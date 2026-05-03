/**
 * scripts/eval/run-50-cases.ts — Full end-to-end eval of the v4 food parse pipeline.
 *
 * Runs 50 real-world inputs through the COMPLETE pipeline:
 *   LLM identification → dish_recipes cache → foods DB → LLM decompose → LLM estimate
 *
 * Measures:
 *   - Resolution rate: % of items resolved from DB (vs AI estimate)
 *   - Calorie accuracy: kcal within ±15% of reference (lenient for composites)
 *   - Source distribution: local_db vs ai_estimate
 *   - Latency per call
 *
 * Usage:
 *   npx tsx scripts/eval/run-50-cases.ts
 *
 * Requires: DATABASE_URL pointing to a DB with foods + dish_recipes data.
 */

import { run } from '../../agents/food-parse/index.v4';
import type { ParsedFoodItem } from '../../agents/schemas/food-parse';

// ── Test cases ──────────────────────────────────────────────────────────────────

interface TestCase {
  id: string;
  input: string;
  language: 'en' | 'el' | 'es';
  expected: {
    food_name: string;
    kcal_min: number;
    kcal_max: number;
    source_preferred?: 'local_db' | 'ai_estimate';
  };
}

const TEST_CASES: TestCase[] = [
  // ══════════════════════════════════════════════════════════════════════════════
  // GREEK — Simple foods (should hit foods table directly)
  // ══════════════════════════════════════════════════════════════════════════════
  { id: 'gr-01', input: '200γρ φέτα', language: 'el', expected: { food_name: 'feta', kcal_min: 500, kcal_max: 560 } },
  { id: 'gr-02', input: '2 αυγά', language: 'el', expected: { food_name: 'egg', kcal_min: 130, kcal_max: 160 } },
  { id: 'gr-03', input: '1 κ.σ. ελαιόλαδο', language: 'el', expected: { food_name: 'olive', kcal_min: 110, kcal_max: 135 } },
  { id: 'gr-04', input: '150γρ γιαούρτι', language: 'el', expected: { food_name: 'yogurt', kcal_min: 85, kcal_max: 160 } },
  { id: 'gr-05', input: '1 μπανάνα', language: 'el', expected: { food_name: 'banana', kcal_min: 85, kcal_max: 110 } },
  { id: 'gr-06', input: '100γρ κοτόπουλο ψητό', language: 'el', expected: { food_name: 'chicken', kcal_min: 150, kcal_max: 180 } },
  { id: 'gr-07', input: '1 φέτα ψωμί', language: 'el', expected: { food_name: 'bread', kcal_min: 65, kcal_max: 95 } },
  { id: 'gr-08', input: '1 φλ ρύζι μαγειρεμένο', language: 'el', expected: { food_name: 'rice', kcal_min: 190, kcal_max: 250 } },
  { id: 'gr-09', input: '2 αυγά τηγανητά', language: 'el', expected: { food_name: 'egg', kcal_min: 170, kcal_max: 220 } },
  { id: 'gr-10', input: '30γρ αμύγδαλα', language: 'el', expected: { food_name: 'almond', kcal_min: 160, kcal_max: 185 } },

  // ══════════════════════════════════════════════════════════════════════════════
  // GREEK — Composite dishes (should hit dish_recipes cache)
  // ══════════════════════════════════════════════════════════════════════════════
  { id: 'gr-11', input: '1 σουβλάκι με πίτα', language: 'el', expected: { food_name: 'souvlaki', kcal_min: 420, kcal_max: 550, source_preferred: 'local_db' } },
  { id: 'gr-12', input: '1 γύρος χοιρινό πίτα', language: 'el', expected: { food_name: 'gyros', kcal_min: 450, kcal_max: 580, source_preferred: 'local_db' } },
  { id: 'gr-13', input: '1 μερίδα μουσακά', language: 'el', expected: { food_name: 'moussaka', kcal_min: 400, kcal_max: 550, source_preferred: 'local_db' } },
  { id: 'gr-14', input: '1 μερίδα παστίτσιο', language: 'el', expected: { food_name: 'pastitsio', kcal_min: 440, kcal_max: 580, source_preferred: 'local_db' } },
  { id: 'gr-15', input: '1 σπανακόπιτα', language: 'el', expected: { food_name: 'spanakopita', kcal_min: 270, kcal_max: 380, source_preferred: 'local_db' } },
  { id: 'gr-16', input: '1 τυρόπιτα', language: 'el', expected: { food_name: 'tiropita', kcal_min: 290, kcal_max: 400, source_preferred: 'local_db' } },
  { id: 'gr-17', input: '1 μερίδα φασολάδα', language: 'el', expected: { food_name: 'fasolada', kcal_min: 270, kcal_max: 380, source_preferred: 'local_db' } },
  { id: 'gr-18', input: '1 χωριάτικη σαλάτα', language: 'el', expected: { food_name: 'greek salad', kcal_min: 270, kcal_max: 380, source_preferred: 'local_db' } },
  { id: 'gr-19', input: '1 φραπέ μέτριο', language: 'el', expected: { food_name: 'frappe', kcal_min: 50, kcal_max: 110, source_preferred: 'local_db' } },
  { id: 'gr-20', input: '1 μπουγάτσα', language: 'el', expected: { food_name: 'bougatsa', kcal_min: 320, kcal_max: 440, source_preferred: 'local_db' } },

  // ══════════════════════════════════════════════════════════════════════════════
  // COLOMBIAN — Simple foods
  // ══════════════════════════════════════════════════════════════════════════════
  { id: 'co-01', input: '1 arepa', language: 'es', expected: { food_name: 'arepa', kcal_min: 170, kcal_max: 250 } },
  { id: 'co-02', input: '200g arroz cocido', language: 'es', expected: { food_name: 'rice', kcal_min: 230, kcal_max: 280 } },
  { id: 'co-03', input: '1 plátano maduro frito', language: 'es', expected: { food_name: 'plantain', kcal_min: 250, kcal_max: 380 } },
  { id: 'co-04', input: '100g frijoles rojos cocidos', language: 'es', expected: { food_name: 'bean', kcal_min: 110, kcal_max: 145 } },
  { id: 'co-05', input: '1 huevo frito', language: 'es', expected: { food_name: 'egg', kcal_min: 85, kcal_max: 120 } },

  // ══════════════════════════════════════════════════════════════════════════════
  // COLOMBIAN — Composite dishes (should hit dish_recipes cache)
  // ══════════════════════════════════════════════════════════════════════════════
  { id: 'co-06', input: '1 bandeja paisa', language: 'es', expected: { food_name: 'bandeja paisa', kcal_min: 1100, kcal_max: 1450, source_preferred: 'local_db' } },
  { id: 'co-07', input: '1 arepa con queso', language: 'es', expected: { food_name: 'arepa', kcal_min: 340, kcal_max: 460, source_preferred: 'local_db' } },
  { id: 'co-08', input: '1 sancocho', language: 'es', expected: { food_name: 'sancocho', kcal_min: 320, kcal_max: 440, source_preferred: 'local_db' } },
  { id: 'co-09', input: '1 caldo de costilla', language: 'es', expected: { food_name: 'caldo', kcal_min: 240, kcal_max: 340, source_preferred: 'local_db' } },
  { id: 'co-10', input: '1 tamal colombiano', language: 'es', expected: { food_name: 'tamal', kcal_min: 320, kcal_max: 440, source_preferred: 'local_db' } },
  { id: 'co-11', input: '1 changua', language: 'es', expected: { food_name: 'changua', kcal_min: 180, kcal_max: 260, source_preferred: 'local_db' } },
  { id: 'co-12', input: '1 porción de arroz con pollo', language: 'es', expected: { food_name: 'arroz con pollo', kcal_min: 440, kcal_max: 600, source_preferred: 'local_db' } },
  { id: 'co-13', input: '1 empanada', language: 'es', expected: { food_name: 'empanada', kcal_min: 230, kcal_max: 330, source_preferred: 'local_db' } },
  { id: 'co-14', input: '1 patacón', language: 'es', expected: { food_name: 'patacon', kcal_min: 270, kcal_max: 370, source_preferred: 'local_db' } },
  { id: 'co-15', input: '1 pandebono', language: 'es', expected: { food_name: 'pandebono', kcal_min: 180, kcal_max: 260, source_preferred: 'local_db' } },
  { id: 'co-16', input: '2 buñuelos', language: 'es', expected: { food_name: 'bunuelo', kcal_min: 300, kcal_max: 420, source_preferred: 'local_db' } },
  { id: 'co-17', input: '1 chicharrón', language: 'es', expected: { food_name: 'chicharron', kcal_min: 380, kcal_max: 520, source_preferred: 'local_db' } },
  { id: 'co-18', input: '1 lechona porción', language: 'es', expected: { food_name: 'lechona', kcal_min: 490, kcal_max: 670, source_preferred: 'local_db' } },
  { id: 'co-19', input: '1 aguapanela', language: 'es', expected: { food_name: 'aguapanela', kcal_min: 80, kcal_max: 130, source_preferred: 'local_db' } },
  { id: 'co-20', input: '1 calentado', language: 'es', expected: { food_name: 'calentado', kcal_min: 350, kcal_max: 490, source_preferred: 'local_db' } },

  // ══════════════════════════════════════════════════════════════════════════════
  // ENGLISH — Common foods (should hit foods table)
  // ══════════════════════════════════════════════════════════════════════════════
  { id: 'en-01', input: '1 medium banana', language: 'en', expected: { food_name: 'banana', kcal_min: 85, kcal_max: 115 } },
  { id: 'en-02', input: '2 scrambled eggs', language: 'en', expected: { food_name: 'scrambled', kcal_min: 180, kcal_max: 240 } },
  { id: 'en-03', input: '1 cup oatmeal cooked', language: 'en', expected: { food_name: 'oat', kcal_min: 130, kcal_max: 180 } },
  { id: 'en-04', input: '200g chicken breast grilled', language: 'en', expected: { food_name: 'chicken', kcal_min: 300, kcal_max: 350 } },
  { id: 'en-05', input: '1 tbsp peanut butter', language: 'en', expected: { food_name: 'peanut butter', kcal_min: 85, kcal_max: 105 } },
  { id: 'en-06', input: '1 cup cooked white rice', language: 'en', expected: { food_name: 'rice', kcal_min: 190, kcal_max: 250 } },
  { id: 'en-07', input: '100g salmon fillet', language: 'en', expected: { food_name: 'salmon', kcal_min: 120, kcal_max: 230 } },
  { id: 'en-08', input: '1 avocado', language: 'en', expected: { food_name: 'avocado', kcal_min: 280, kcal_max: 380 } },
  { id: 'en-09', input: '30g whey protein powder', language: 'en', expected: { food_name: 'whey', kcal_min: 100, kcal_max: 130 } },
  { id: 'en-10', input: '1 slice whole wheat bread', language: 'en', expected: { food_name: 'bread', kcal_min: 60, kcal_max: 90 } },
];

// ── Runner ──────────────────────────────────────────────────────────────────────

interface CaseResult {
  id: string;
  input: string;
  pass: boolean;
  kcal_actual: number | null;
  kcal_expected_range: string;
  food_name_match: boolean;
  source: string;
  latency_ms: number;
  error?: string;
}

async function runCase(tc: TestCase): Promise<CaseResult> {
  const start = Date.now();
  try {
    const result = await run({ text: tc.input, language: tc.language });
    const latency = Date.now() - start;

    if (!result.ok || !result.output?.items?.length) {
      return {
        id: tc.id, input: tc.input, pass: false, kcal_actual: null,
        kcal_expected_range: `${tc.expected.kcal_min}-${tc.expected.kcal_max}`,
        food_name_match: false, source: 'none', latency_ms: latency,
        error: result.error || 'No items returned',
      };
    }

    // Sum all items' calories (multi-item inputs)
    const totalKcal = result.output.items.reduce((sum, it) => sum + (it.calories || 0), 0);
    const primaryItem = result.output.items[0];

    // Check food name match (substring, case-insensitive)
    const nameMatch = primaryItem.food_name.toLowerCase().includes(tc.expected.food_name.toLowerCase());

    // Check kcal within range
    const kcalPass = totalKcal >= tc.expected.kcal_min && totalKcal <= tc.expected.kcal_max;

    // Check source preference
    const sourceMatch = !tc.expected.source_preferred || primaryItem.source === tc.expected.source_preferred;

    const pass = nameMatch && kcalPass;

    return {
      id: tc.id, input: tc.input, pass,
      kcal_actual: Math.round(totalKcal * 10) / 10,
      kcal_expected_range: `${tc.expected.kcal_min}-${tc.expected.kcal_max}`,
      food_name_match: nameMatch, source: primaryItem.source || 'unknown',
      latency_ms: latency,
      error: !nameMatch ? `Name mismatch: got "${primaryItem.food_name}"` :
             !kcalPass ? `Kcal out of range: ${totalKcal}` :
             !sourceMatch ? `Source: got ${primaryItem.source}, wanted ${tc.expected.source_preferred}` : undefined,
    };
  } catch (err) {
    return {
      id: tc.id, input: tc.input, pass: false, kcal_actual: null,
      kcal_expected_range: `${tc.expected.kcal_min}-${tc.expected.kcal_max}`,
      food_name_match: false, source: 'error', latency_ms: Date.now() - start,
      error: String(err),
    };
  }
}

// ── Main ────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' Trophē v4 Food Parse — 50-Case Production Eval');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const results: CaseResult[] = [];
  const total = TEST_CASES.length;

  for (let i = 0; i < total; i++) {
    const tc = TEST_CASES[i];
    process.stdout.write(`[${i + 1}/${total}] ${tc.id}: "${tc.input}" ... `);
    const result = await runCase(tc);
    results.push(result);
    console.log(result.pass ? '✅' : `❌ ${result.error}`);

    // Small delay to avoid rate limiting
    if (i < total - 1) await new Promise(r => setTimeout(r, 500));
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(' RESULTS SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const passed = results.filter(r => r.pass);
  const failed = results.filter(r => !r.pass);

  // Score by category
  const grSimple = results.filter(r => r.id.startsWith('gr-') && parseInt(r.id.split('-')[1]) <= 10);
  const grComposite = results.filter(r => r.id.startsWith('gr-') && parseInt(r.id.split('-')[1]) > 10);
  const coSimple = results.filter(r => r.id.startsWith('co-') && parseInt(r.id.split('-')[1]) <= 5);
  const coComposite = results.filter(r => r.id.startsWith('co-') && parseInt(r.id.split('-')[1]) > 5);
  const enSimple = results.filter(r => r.id.startsWith('en-'));

  const scoreCategory = (cases: CaseResult[]) => {
    const p = cases.filter(c => c.pass).length;
    return `${p}/${cases.length} (${Math.round(p / cases.length * 100)}%)`;
  };

  console.log(`  Overall:              ${passed.length}/${total} (${Math.round(passed.length / total * 100)}%)`);
  console.log(`  ─────────────────────────────────────────`);
  console.log(`  Greek simple (gr-01→10):      ${scoreCategory(grSimple)}`);
  console.log(`  Greek composite (gr-11→20):   ${scoreCategory(grComposite)}`);
  console.log(`  Colombian simple (co-01→05):  ${scoreCategory(coSimple)}`);
  console.log(`  Colombian composite (co-06→20): ${scoreCategory(coComposite)}`);
  console.log(`  English simple (en-01→10):    ${scoreCategory(enSimple)}`);

  // Source distribution
  const sources: Record<string, number> = {};
  results.forEach(r => { sources[r.source] = (sources[r.source] || 0) + 1; });
  console.log(`\n  Source distribution:`);
  Object.entries(sources).sort((a, b) => b[1] - a[1]).forEach(([src, count]) => {
    console.log(`    ${src}: ${count} (${Math.round(count / total * 100)}%)`);
  });

  // Source preference compliance (for composite dishes)
  const compositeResults = results.filter(r =>
    TEST_CASES.find(tc => tc.id === r.id)?.expected.source_preferred
  );
  const sourceCompliant = compositeResults.filter(r => {
    const tc = TEST_CASES.find(t => t.id === r.id)!;
    return r.source === tc.expected.source_preferred;
  });
  console.log(`\n  Composite dish cache hit rate: ${sourceCompliant.length}/${compositeResults.length} (${Math.round(sourceCompliant.length / compositeResults.length * 100)}%)`);

  // Latency stats
  const latencies = results.map(r => r.latency_ms).sort((a, b) => a - b);
  console.log(`\n  Latency:`);
  console.log(`    Median: ${latencies[Math.floor(latencies.length / 2)]}ms`);
  console.log(`    P95:    ${latencies[Math.floor(latencies.length * 0.95)]}ms`);
  console.log(`    Max:    ${latencies[latencies.length - 1]}ms`);

  // Failures detail
  if (failed.length > 0) {
    console.log(`\n  ─── FAILURES ───────────────────────────────────────────────`);
    failed.forEach(f => {
      console.log(`    ${f.id}: "${f.input}"`);
      console.log(`      Got: ${f.kcal_actual} kcal (${f.source}) | Expected: ${f.kcal_expected_range} kcal`);
      console.log(`      ${f.error}`);
    });
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(` FINAL SCORE: ${passed.length}/${total} (${Math.round(passed.length / total * 100)}%)`);
  console.log('═══════════════════════════════════════════════════════════════');

  // Exit with error code if below threshold
  const passRate = passed.length / total;
  if (passRate < 0.80) {
    console.log('\n⚠️  BELOW 80% THRESHOLD — needs investigation');
    process.exit(1);
  } else if (passRate >= 0.90) {
    console.log('\n🎯 EXCELLENT — ≥90% pass rate');
  } else {
    console.log('\n✅ GOOD — ≥80% pass rate');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

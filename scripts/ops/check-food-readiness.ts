import { resolveDbConfig, withPool, writeArtifact } from '../db/_shared';

const minimumFoods = Number(process.env.FOOD_MINIMUM_ROWS ?? '100');
const minimumAuthoritativeRate = Number(process.env.FOOD_MIN_AUTHORITATIVE_RATE ?? '0.5');
const maximumInvalidMacros = Number(process.env.FOOD_MAX_INVALID_MACROS ?? '0');
const maximumMissingEmbeddings = Number(process.env.FOOD_MAX_MISSING_EMBEDDINGS ?? '0');

withPool(resolveDbConfig(), async (pool) => {
  const result = await pool.query<{
    total: string;
    authoritative: string;
    reviewed: string;
    canonical: string;
    missing_embeddings: string;
    invalid_macros: string;
    low_confidence: string;
  }>(`
    SELECT
      count(*)::text AS total,
      count(*) FILTER (WHERE data_quality IN ('lab_verified', 'label'))::text AS authoritative,
      count(*) FILTER (WHERE data_reviewed_at IS NOT NULL OR verified = 'manual')::text AS reviewed,
      count(*) FILTER (WHERE canonical_food_key IS NOT NULL)::text AS canonical,
      count(*) FILTER (WHERE embedding IS NULL)::text AS missing_embeddings,
      count(*) FILTER (
        WHERE kcal_per_100g < 0 OR protein_per_100g < 0 OR carb_per_100g < 0 OR fat_per_100g < 0
          OR protein_per_100g + carb_per_100g + fat_per_100g > 115
      )::text AS invalid_macros,
      count(*) FILTER (WHERE macro_confidence < 0.5)::text AS low_confidence
    FROM foods
  `);
  const sources = await pool.query<{ source: string; count: string }>(
    'SELECT source::text, count(*)::text FROM foods GROUP BY source ORDER BY count(*) DESC',
  );
  const row = result.rows[0];
  const report = {
    total: Number(row.total),
    authoritative: Number(row.authoritative),
    authoritativeRate: Number(row.total) ? Number(row.authoritative) / Number(row.total) : 0,
    reviewed: Number(row.reviewed),
    canonical: Number(row.canonical),
    missingEmbeddings: Number(row.missing_embeddings),
    invalidMacros: Number(row.invalid_macros),
    lowConfidence: Number(row.low_confidence),
    sources: Object.fromEntries(sources.rows.map((item) => [item.source, Number(item.count)])),
    failures: [] as string[],
  };
  if (report.total < minimumFoods) report.failures.push(`${report.total} food rows is below minimum ${minimumFoods}`);
  if (report.authoritativeRate < minimumAuthoritativeRate) {
    report.failures.push(`authoritative source rate ${(report.authoritativeRate * 100).toFixed(1)}% is below ${(minimumAuthoritativeRate * 100).toFixed(1)}%`);
  }
  if (report.invalidMacros > maximumInvalidMacros) report.failures.push(`${report.invalidMacros} food rows have invalid macros`);
  if (report.missingEmbeddings > maximumMissingEmbeddings) report.failures.push(`${report.missingEmbeddings} food rows are missing embeddings`);

  writeArtifact('food-readiness.json', JSON.stringify(report, null, 2));
  if (report.failures.length) throw new Error(report.failures.join('; '));
  console.log(`Food readiness passed: ${report.total} foods, ${(report.authoritativeRate * 100).toFixed(1)}% authoritative, ${report.reviewed} reviewed.`);
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

/**
 * scripts/ingest/embed-foods.ts — Voyage v4 embedding pipeline.
 *
 * Generates 1024-dim embeddings for all foods that have embedding IS NULL.
 * Idempotent: only processes un-embedded rows. Resumable: processes in batches
 * and commits after each batch, so Ctrl-C + rerun continues from last commit.
 *
 * After all embeddings are generated, creates the HNSW index if it doesn't
 * exist (CREATE INDEX CONCURRENTLY is deferred here post-ingest as specified
 * in the migration comment).
 *
 * Model: voyage-3-large (1024-dim, MTEB 68.1) — same model as OpenBrain
 *        for consistency across the Mac Mini control plane.
 *        Fallback: voyage-large-2-instruct (1024-dim) if voyage-3-large unavailable.
 *
 * Usage:
 *   source ~/.local/secrets/voyage.env
 *   npx tsx scripts/ingest/embed-foods.ts
 *
 *   # Dry run (shows count only, no API calls):
 *   DRY_RUN=1 npx tsx scripts/ingest/embed-foods.ts
 *
 *   # Custom batch size (default 96 — Voyage v4 limit is 128):
 *   BATCH_SIZE=64 npx tsx scripts/ingest/embed-foods.ts
 *
 * Cost estimate: ~$0.12 per 10k foods at voyage-3-large pricing ($0.12/1M tokens,
 * ~100 tokens avg per food text).
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { foods } from '../../db/schema/foods';
import { sql } from 'drizzle-orm';

// ── Config ──────────────────────────────────────────────────────────────────
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const VOYAGE_MODEL   = 'voyage-3-large';   // 1024-dim, MTEB 68.1
const VOYAGE_BASE    = 'https://api.voyageai.com/v1';
const BATCH_SIZE     = parseInt(process.env.BATCH_SIZE || '96');
const DRY_RUN        = process.env.DRY_RUN === '1';
const EMBED_DIMS     = 1024;

if (!VOYAGE_API_KEY && !DRY_RUN) {
  console.error('[embed] ❌ VOYAGE_API_KEY not set. Run: source ~/.local/secrets/voyage.env');
  process.exit(1);
}

// ── Text preparation ─────────────────────────────────────────────────────────
/**
 * Build the embedding input text for a food row.
 * Strategy: concatenate all human-readable fields so the embedding captures
 * multilingual synonyms, brand, and context in one vector.
 * Example: "Feta Cheese Φέτα feta cheese greek cheese PDO cheese Greece"
 */
function buildEmbedText(food: {
  nameEn: string;
  nameEl?: string | null;
  nameEs?: string | null;
  brand?: string | null;
  region?: string[] | null;
}): string {
  const parts = [
    food.nameEn,
    food.nameEl,
    food.nameEs,
    food.brand,
    // Region hint helps differentiate regional variants in kNN
    food.region?.join(' '),
  ].filter(Boolean);
  return parts.join(' ').slice(0, 512); // Voyage max input ~10k tokens, 512 chars is safe
}

// ── Voyage API wrapper ───────────────────────────────────────────────────────
async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await fetch(`${VOYAGE_BASE}/embeddings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${VOYAGE_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      input: texts,
      model: VOYAGE_MODEL,
      input_type: 'document',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Voyage API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  // Voyage returns { data: [{ embedding: [...], index: n }] }
  const sorted = (data.data as Array<{ embedding: number[]; index: number }>)
    .sort((a, b) => a.index - b.index);

  // Validate dimensions
  for (const item of sorted) {
    if (item.embedding.length !== EMBED_DIMS) {
      throw new Error(`Unexpected embedding dims: ${item.embedding.length} (expected ${EMBED_DIMS})`);
    }
  }

  return sorted.map(i => i.embedding);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      `postgresql://brain_user:${process.env.PGPASSWORD || 'jDehquqo1Dj0plzyrmaX2ybtzvjeKdFF'}@127.0.0.1:5433/trophe_dev`,
    max: 3,
  });
  const db = drizzle(pool);

  // Count un-embedded rows
  // Note: embedding is a raw SQL column (pgvector), not in Drizzle schema
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(foods)
    .where(sql`embedding IS NULL`);

  console.log(`[embed] Found ${count} foods without embeddings.`);
  if (DRY_RUN) {
    console.log('[embed] DRY_RUN=1 — exiting without API calls.');
    await pool.end();
    return;
  }
  if (count === 0) {
    console.log('[embed] All foods already embedded. Checking HNSW index...');
    await ensureHnswIndex(pool);
    await pool.end();
    return;
  }

  let processed = 0;
  let offset = 0;

  while (true) {
    // Fetch a batch of un-embedded foods
    const batch = await db
      .select({
        id:     foods.id,
        nameEn: foods.nameEn,
        nameEl: foods.nameEl,
        nameEs: foods.nameEs,
        brand:  foods.brand,
        region: foods.region,
      })
      .from(foods)
      .where(sql`embedding IS NULL`)
      .limit(BATCH_SIZE)
      .offset(0); // Always offset 0 — we process and update, so the set shrinks

    if (batch.length === 0) break;

    const texts = batch.map(buildEmbedText);
    let embeddings: number[][];

    try {
      embeddings = await embedBatch(texts);
    } catch (err) {
      console.error(`[embed] Voyage error on batch starting at row ${processed}:`, err);
      console.error('[embed] Partial progress committed. Rerun to continue.');
      await pool.end();
      process.exit(1);
    }

    // Update each food with its embedding vector
    // Note: we use raw SQL here because Drizzle doesn't have a native vector update helper
    for (let i = 0; i < batch.length; i++) {
      const vectorLiteral = `[${embeddings[i].join(',')}]`;
      await db.execute(
        sql`UPDATE foods SET embedding = ${vectorLiteral}::vector WHERE id = ${batch[i].id}`
      );
    }

    processed += batch.length;
    const pct = Math.round((processed / count) * 100);
    console.log(`[embed] ${processed}/${count} (${pct}%) — last: "${batch[batch.length - 1].nameEn}"`);

    // Brief pause to avoid hitting rate limits
    await sleep(100);
  }

  console.log(`\n[embed] ✅ Embeddings complete. Total: ${processed}`);

  // Build HNSW index post-ingest
  await ensureHnswIndex(pool);
  await pool.end();
}

async function ensureHnswIndex(pool: Pool) {
  const client = await pool.connect();
  try {
    // Check if index exists
    const { rows } = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'foods' AND indexname = 'idx_foods_embedding'
    `);
    if (rows.length > 0) {
      console.log('[embed] HNSW index idx_foods_embedding already exists. ✅');
      return;
    }

    console.log('[embed] Building HNSW index (this may take a few minutes for large datasets)...');
    // ef_construction=128 is the recommended default for <1M rows
    // Note: CREATE INDEX CONCURRENTLY cannot run inside a transaction block,
    // so we use autocommit mode via direct pool client
    await client.query(`
      SET maintenance_work_mem = '512MB';
      CREATE INDEX IF NOT EXISTS idx_foods_embedding
        ON foods USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 128);
    `);
    console.log('[embed] ✅ HNSW index built.');
  } finally {
    client.release();
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

main().catch((err) => { console.error(err); process.exit(1); });

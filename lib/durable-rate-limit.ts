import { sql } from 'drizzle-orm';
import { db } from '@/db/client';

export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; retryAfter: number }> {
  const result = await db.execute<{ request_count: number; retry_after: number }>(sql`
    WITH window AS (
      SELECT
        to_timestamp(floor(extract(epoch FROM now()) / ${windowSeconds}) * ${windowSeconds}) AS started_at
    ),
    consumed AS (
      INSERT INTO rate_limit_windows (key, window_started_at, request_count, expires_at)
      SELECT ${key}, started_at, 1, started_at + (${windowSeconds} * interval '1 second')
      FROM window
      ON CONFLICT (key, window_started_at)
      DO UPDATE SET request_count = rate_limit_windows.request_count + 1
      RETURNING request_count, greatest(1, ceil(extract(epoch FROM (expires_at - now()))))::integer AS retry_after
    )
    SELECT request_count, retry_after FROM consumed
  `);
  const row = result.rows[0];
  if (!row) throw new Error('Rate limit counter unavailable');
  return { allowed: row.request_count <= limit, retryAfter: row.retry_after };
}

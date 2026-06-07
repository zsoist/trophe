import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import packageJson from '@/package.json';

export const dynamic = 'force-dynamic';

export async function GET() {
  let database: 'connected' | 'error' = 'connected';
  try {
    await db.execute(sql`SELECT 1`);
  } catch {
    database = 'error';
  }

  return NextResponse.json(
    {
      status: database === 'connected' ? 'ok' : 'degraded',
      version: packageJson.version,
      timestamp: new Date().toISOString(),
      db: database,
    },
    { status: database === 'connected' ? 200 : 503 },
  );
}

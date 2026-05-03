import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

export type DbConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

export function resolveDbConfig(): DbConfig {
  const url = process.env.DATABASE_URL;

  if (url) {
    const parsed = new URL(url);
    return {
      host: process.env.PG_HOST || parsed.hostname || '127.0.0.1',
      port: Number(process.env.PG_PORT || parsed.port || 54322),
      user: process.env.PG_USER || decodeURIComponent(parsed.username || 'postgres'),
      password: process.env.PG_PASS || process.env.PGPASSWORD || decodeURIComponent(parsed.password || 'postgres'),
      database: process.env.PG_DB || parsed.pathname.replace(/^\//, '') || 'postgres',
    };
  }

  return {
    host: process.env.PG_HOST || '127.0.0.1',
    port: Number(process.env.PG_PORT || 54322),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASS || process.env.PGPASSWORD || 'postgres',
    database: process.env.PG_DB || 'postgres',
  };
}

export function connectionString(config: DbConfig): string {
  const user = encodeURIComponent(config.user);
  const password = encodeURIComponent(config.password);
  return `postgresql://${user}:${password}@${config.host}:${config.port}/${config.database}`;
}

export function maintenanceConnectionString(config: DbConfig): string {
  return connectionString({ ...config, database: 'postgres' });
}

export async function withPool<T>(config: DbConfig, fn: (pool: pg.Pool) => Promise<T>): Promise<T> {
  const pool = new pg.Pool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    max: 4,
  });

  try {
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

export function ensureArtifactsDir(): string {
  const dir = join(process.cwd(), 'artifacts', 'db');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeArtifact(name: string, value: string): void {
  const dir = ensureArtifactsDir();
  writeFileSync(join(dir, name), value, 'utf8');
}

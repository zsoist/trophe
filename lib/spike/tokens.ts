/**
 * Trophē v0.3 — Spike token encryption helpers (Phase 6).
 *
 * Uses pgcrypto pgp_sym_encrypt / pgp_sym_decrypt for symmetric encryption
 * of OAuth tokens at rest. The encryption key (WEARABLE_ENCRYPT_KEY) lives
 * in env — a raw pg_dump alone cannot decrypt the tokens.
 *
 * Why pgcrypto vs application-layer AES:
 *   - Single source of truth (no decryption code needed in multiple places)
 *   - Tokens are only decrypted when needed (in the DB transaction)
 *   - Key rotation: re-run UPDATE ... SET encrypted = pgp_sym_encrypt(pgp_sym_decrypt(..., old_key), new_key)
 *
 * Requires: CREATE EXTENSION IF NOT EXISTS pgcrypto — already enabled on open_brain_postgres.
 *
 * ⚠ MANUAL STEP: Set WEARABLE_ENCRYPT_KEY in .env.local to a random 32+ char string.
 *   Generate: openssl rand -base64 32
 */

import { db } from '@/db/client';
import { sql } from 'drizzle-orm';
import { wearableConnections } from '@/db/schema/wearable_connections';
import { eq } from 'drizzle-orm';

// ── Encrypt + store ────────────────────────────────────────────────────────

/**
 * Encrypt a token string using pgp_sym_encrypt and return the bytea.
 * Used when inserting/updating wearable_connections.
 */
export async function encryptToken(plaintext: string): Promise<Buffer> {
  const key = process.env.WEARABLE_ENCRYPT_KEY;
  if (!key) throw new Error('WEARABLE_ENCRYPT_KEY not configured');

  const result = await db.execute<{ enc: Buffer }>(
    sql`SELECT pgp_sym_encrypt(${plaintext}::text, ${key}::text)::bytea AS enc`,
  );
  const enc = result.rows[0]?.enc;
  if (!enc) throw new Error('pgp_sym_encrypt returned null');
  return enc;
}

/**
 * Decrypt a bytea token from wearable_connections.
 * Returns null if the column is null (no token stored yet).
 */
export async function decryptToken(encrypted: Buffer | null | undefined): Promise<string | null> {
  if (!encrypted) return null;
  const key = process.env.WEARABLE_ENCRYPT_KEY;
  if (!key) throw new Error('WEARABLE_ENCRYPT_KEY not configured');

  const result = await db.execute<{ plain: string }>(
    sql`SELECT pgp_sym_decrypt(${encrypted}::bytea, ${key}::text)::text AS plain`,
  );
  return result.rows[0]?.plain ?? null;
}

// ── Convenience: save connection tokens ───────────────────────────────────

export interface SaveConnectionTokensInput {
  connectionId: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds from now
}

export async function saveConnectionTokens(input: SaveConnectionTokensInput): Promise<void> {
  const [encAccess, encRefresh] = await Promise.all([
    encryptToken(input.accessToken),
    encryptToken(input.refreshToken),
  ]);

  const expiresAt = new Date(Date.now() + input.expiresIn * 1000);

  await db
    .update(wearableConnections)
    .set({
      accessTokenEncrypted: encAccess,
      refreshTokenEncrypted: encRefresh,
      tokenExpiresAt: expiresAt,
      lastSyncError: null,
    })
    .where(eq(wearableConnections.id, input.connectionId));
}

// ── Convenience: load + decrypt tokens ────────────────────────────────────

export interface ConnectionTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  isExpired: boolean;
}

export async function loadConnectionTokens(
  connectionId: string,
): Promise<ConnectionTokens | null> {
  const [connection] = await db
    .select({
      accessTokenEncrypted: wearableConnections.accessTokenEncrypted,
      refreshTokenEncrypted: wearableConnections.refreshTokenEncrypted,
      tokenExpiresAt: wearableConnections.tokenExpiresAt,
    })
    .from(wearableConnections)
    .where(eq(wearableConnections.id, connectionId));

  if (!connection) return null;

  const [accessToken, refreshToken] = await Promise.all([
    decryptToken(connection.accessTokenEncrypted),
    decryptToken(connection.refreshTokenEncrypted),
  ]);

  if (!accessToken) return null;

  const expiresAt = connection.tokenExpiresAt ? new Date(connection.tokenExpiresAt) : null;
  const isExpired = expiresAt ? expiresAt.getTime() < Date.now() : false;

  return { accessToken, refreshToken, expiresAt, isExpired };
}

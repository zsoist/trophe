/**
 * Trophē v0.3 — wearable_connections table.
 *
 * Phase 6: Spike API OAuth token storage.
 *
 * Each row = one user × one wearable provider connection.
 * A user can have multiple connections (e.g. Apple Health + Whoop).
 *
 * Token encryption:
 *   access_token and refresh_token are stored as bytea via pgcrypto
 *   pgp_sym_encrypt(plaintext, WEARABLE_ENCRYPT_KEY).
 *   The encryption key lives in env (WEARABLE_ENCRYPT_KEY), NOT the DB.
 *   A raw pg_dump is not sufficient to read tokens — the key must be known.
 *
 *   Encryption/decryption happens in lib/spike/tokens.ts using raw SQL:
 *     INSERT: pgp_sym_encrypt($1::text, $2)::bytea
 *     SELECT: pgp_sym_decrypt(access_token, $1)::text
 *
 * RLS:
 *   Users can only read/write their own connection rows.
 *   Coaches cannot read client tokens.
 *
 * Supported providers (via Spike API v2):
 *   apple_health, whoop, oura, strava, garmin, fitbit, polar, coros
 */

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  customType,
  timestamp,
  index,
  unique,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { profiles } from './profiles';

// ── Enums ──────────────────────────────────────────────────────────────────

export const wearableProviderEnum = pgEnum('wearable_provider', [
  'apple_health',
  'whoop',
  'oura',
  'strava',
  'garmin',
  'fitbit',
  'polar',
  'coros',
]);

export const wearableStatusEnum = pgEnum('wearable_status', [
  'active',
  'expired',
  'revoked',
]);

// ── Custom bytea type for encrypted tokens ─────────────────────────────────
// Note: actual encryption/decryption via raw SQL in lib/spike/tokens.ts

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

// ── Table ──────────────────────────────────────────────────────────────────

export const wearableConnections = pgTable(
  'wearable_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    userId: uuid('user_id').notNull(),

    /** Wearable provider (apple_health, whoop, oura, etc.). */
    provider: wearableProviderEnum('provider').notNull(),

    /**
     * Spike's internal user ID for this connection.
     * Used to call Spike's /user/:spike_user_id endpoints.
     */
    spikeUserId: text('spike_user_id').notNull(),

    /**
     * Encrypted OAuth access token (pgp_sym_encrypt via WEARABLE_ENCRYPT_KEY).
     * Decrypt with: pgp_sym_decrypt(access_token, :key)
     */
    accessTokenEncrypted: bytea('access_token_encrypted'),

    /**
     * Encrypted OAuth refresh token (pgp_sym_encrypt via WEARABLE_ENCRYPT_KEY).
     * Decrypt with: pgp_sym_decrypt(refresh_token, :key)
     */
    refreshTokenEncrypted: bytea('refresh_token_encrypted'),

    /**
     * Comma-separated OAuth scopes granted.
     * e.g. 'activity,sleep,heart_rate,body_composition'
     */
    scopes: text('scopes'),

    /** Connection health status. */
    status: wearableStatusEnum('status').notNull().default('active'),

    /** When the access token expires (for proactive refresh). */
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),

    connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),

    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),

    /**
     * Error from last sync attempt.
     * Set when Spike webhook returns an error; cleared on successful data receipt.
     */
    lastSyncError: text('last_sync_error'),
  },
  (t) => [
    // One active connection per user × provider
    unique('wearable_connections_user_provider_key').on(t.userId, t.provider),
    // Lookup by spike_user_id (Spike webhook sends this)
    index('idx_wc_spike_user_id').on(t.spikeUserId),
    // User's connections dashboard
    index('idx_wc_user_status').on(t.userId, t.status),
    foreignKey({
      columns: [t.userId],
      foreignColumns: [profiles.id],
      name: 'wearable_connections_user_id_fkey',
    }).onDelete('cascade'),
  ],
);

export type InsertWearableConnection = typeof wearableConnections.$inferInsert;
export type SelectWearableConnection = typeof wearableConnections.$inferSelect;

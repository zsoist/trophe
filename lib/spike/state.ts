const STATE_TTL_MS = 10 * 60 * 1000;

function stateSecret(): string {
  const secret = process.env.WEARABLE_ENCRYPT_KEY;
  if (!secret) throw new Error('WEARABLE_ENCRYPT_KEY not configured');
  return secret;
}

async function hmacHex(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(stateSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index++) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export async function createSpikeState(userId: string, provider: string): Promise<string> {
  const payload = `${userId}|${provider}|${Date.now()}|${crypto.randomUUID()}`;
  const signature = await hmacHex(payload);
  return Buffer.from(`${payload}|${signature}`).toString('base64url');
}

export async function verifySpikeState(
  state: string,
  expectedUserId: string,
): Promise<{ provider: string } | null> {
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const parts = decoded.split('|');
    if (parts.length !== 5) return null;

    const [userId, provider, issuedAtRaw, nonce, receivedSignature] = parts;
    const issuedAt = Number(issuedAtRaw);
    if (userId !== expectedUserId || !provider || !nonce || !Number.isFinite(issuedAt)) return null;
    if (issuedAt > Date.now() || Date.now() - issuedAt > STATE_TTL_MS) return null;

    const payload = `${userId}|${provider}|${issuedAtRaw}|${nonce}`;
    const expectedSignature = await hmacHex(payload);
    return constantTimeEqual(expectedSignature, receivedSignature) ? { provider } : null;
  } catch {
    return null;
  }
}

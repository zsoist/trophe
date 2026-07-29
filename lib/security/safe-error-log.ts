export type SafeErrorMetadata = {
  name: string;
  code?: string;
  status?: number;
};

const SAFE_IDENTIFIER = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const SAFE_CODE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

export function safeErrorMetadata(error: unknown): SafeErrorMetadata {
  if (!error || typeof error !== 'object') return { name: 'UnknownError' };

  try {
    const candidate = error as Record<string, unknown>;
    const name = typeof candidate.name === 'string' && SAFE_IDENTIFIER.test(candidate.name)
      ? candidate.name
      : 'UnknownError';
    const metadata: SafeErrorMetadata = { name };

    if (typeof candidate.code === 'string' && SAFE_CODE.test(candidate.code)) {
      metadata.code = candidate.code;
    }
    if (
      typeof candidate.status === 'number'
      && Number.isInteger(candidate.status)
      && candidate.status >= 100
      && candidate.status <= 599
    ) {
      metadata.status = candidate.status;
    }

    return metadata;
  } catch {
    return { name: 'UnknownError' };
  }
}

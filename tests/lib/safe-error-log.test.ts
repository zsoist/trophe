import { describe, expect, it } from 'vitest';
import { safeErrorMetadata } from '@/lib/security/safe-error-log';

describe('safeErrorMetadata', () => {
  it('keeps operational identifiers without retaining messages, stacks, or causes', () => {
    const error = Object.assign(
      new Error('prompt included: 2 eggs, medication, and private health context'),
      {
        code: 'PGRST301',
        status: 503,
        cause: new Error('nested secret'),
      },
    );

    expect(safeErrorMetadata(error)).toEqual({
      name: 'Error',
      code: 'PGRST301',
      status: 503,
    });
  });

  it('drops unbounded or unsafe error properties', () => {
    expect(
      safeErrorMetadata({
        name: 'ProviderError<script>',
        code: 'contains private food text',
        status: 99,
        message: 'private meal',
      }),
    ).toEqual({ name: 'UnknownError' });
  });

  it('fails closed for strings and nullish thrown values', () => {
    expect(safeErrorMetadata('private meal')).toEqual({ name: 'UnknownError' });
    expect(safeErrorMetadata(null)).toEqual({ name: 'UnknownError' });
  });
});

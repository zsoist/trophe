import { describe, expect, it } from 'vitest';
import { boundedEngineErrorCode } from '../../e2e/helpers/engine-diagnostic';

describe('bounded engine HTTP diagnostic', () => {
  it.each([
    'budget_blocked',
    'cancelled',
    'deadline',
    'forbidden',
    'provider_unavailable',
    'query_failed',
    'unauthenticated',
  ])('retains allowlisted code %s', code => {
    expect(boundedEngineErrorCode(code)).toBe(code);
  });

  it('collapses raw or unknown values', () => {
    expect(boundedEngineErrorCode('database detail')).toBe('other');
    expect(boundedEngineErrorCode({ code: 'query_failed' })).toBe('other');
    expect(boundedEngineErrorCode(null)).toBe('other');
  });
});

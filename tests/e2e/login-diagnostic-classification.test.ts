import { describe, expect, it } from 'vitest';
import { classifyAuthExchangeStatus, classifyLoginUiError } from '../../e2e/helpers/auth';

describe('redacted login diagnostics', () => {
  it('emits bounded categories instead of raw auth or UI response content', () => {
    expect(classifyAuthExchangeStatus(null)).toBe('none');
    expect(classifyAuthExchangeStatus(200)).toBe('success');
    expect(classifyAuthExchangeStatus(429)).toBe('rate_limited');
    expect(classifyAuthExchangeStatus(503)).toBe('server_error');
    expect(classifyLoginUiError('Invalid login credentials')).toBe('invalid_credentials');
    expect(classifyLoginUiError('Too many requests')).toBe('rate_limited');
    expect(classifyLoginUiError('Network error')).toBe('network');
    expect(classifyLoginUiError('internal detail')).toBe('other');
  });
});

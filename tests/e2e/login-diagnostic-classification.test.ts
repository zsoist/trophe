import type { Page } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyAuthExchangeStatus, classifyAuthRequestFailure, classifyLoginUiError, emitLoginDiagnostic } from '../../e2e/helpers/auth';

afterEach(() => vi.restoreAllMocks());

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
    expect(classifyAuthRequestFailure(null)).toBe('none');
    expect(classifyAuthRequestFailure('net::ERR_ABORTED')).toBe('aborted');
    expect(classifyAuthRequestFailure('net::ERR_CONNECTION_REFUSED')).toBe('connection');
    expect(classifyAuthRequestFailure('request timeout')).toBe('timeout');
    expect(classifyAuthRequestFailure('net::ERR_NAME_NOT_RESOLVED')).toBe('dns');
    expect(classifyAuthRequestFailure('opaque failure')).toBe('other');
  });

  it('still emits a bounded failure after Playwright closes the page', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const page = {
      context: () => ({ cookies: () => Promise.reject(new Error('closed')) }),
      url: () => { throw new Error('closed'); },
      getByRole: () => ({
        count: () => Promise.reject(new Error('closed')),
        first: () => ({ textContent: () => Promise.reject(new Error('closed')) }),
      }),
    } as unknown as Page;

    await emitLoginDiagnostic(page, 'coach', 200, 'failed', { pathname: '/login', sessionPresent: true });

    expect(write).toHaveBeenCalledOnce();
    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toEqual({
      event: 'coach_login_diagnostic', outcome: 'failed', role: 'coach', authExchangeStatus: 200,
      authExchangeCategory: 'success', pathname: '/login', sessionPresent: true, uiErrorCategory: 'none',
      authRequestStarted: false, authRequestFailureCategory: 'none',
      submitDisabledBeforeClick: null, submitDisabledAfterClick: null,
    });
  });

  it('reports unavailable session state as null instead of false', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const page = {
      context: () => ({ cookies: () => Promise.reject(new Error('closed')) }),
      url: () => { throw new Error('closed'); },
      getByRole: () => ({ count: () => Promise.reject(new Error('closed')) }),
    } as unknown as Page;

    await emitLoginDiagnostic(page, 'coach', null, 'failed');

    expect(JSON.parse(String(write.mock.calls[0]?.[0])).sessionPresent).toBeNull();
  });
});

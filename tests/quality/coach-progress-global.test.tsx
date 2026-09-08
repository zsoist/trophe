// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import GlobalCoach from '@/components/assistant/GlobalCoach';
import { I18nProvider } from '@/lib/i18n';
import type { ProgressTransport } from '@/components/assistant/progress-state';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/progress' }));
Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
it('exposes the reviewed Progress capability only for the authenticated self on Progress', async () => {
  vi.stubEnv('NEXT_PUBLIC_COACH_PROGRESS_ACTIONS_ENABLED', '1');
  const actor = crypto.randomUUID(); const calls: unknown[] = [];
  const progress: ProgressTransport = async operation => { calls.push(operation); return { version: 'coach-assistant.v2', storage: 'database', ok: true, snapshot: { subjectId: actor, version: '1', window: { start: '2026-06-10', end: '2026-09-07', timezone: 'UTC', days: 90 }, measurements: [], trends: [], truncated: false, duplicateRowsDropped: 0, invalidValuesExcluded: 0, limitations: [] } }; };
  const view = render(<I18nProvider defaultLang="en"><GlobalCoach identity={actor} example={vi.fn()} progressTransport={progress} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Ask coach' }));
  fireEvent.click(document.querySelector('#global-coach details summary')!);
  await screen.findByText('No measurements in the last 90 days.');
  expect(calls).toHaveLength(1);
  view.rerender(<I18nProvider defaultLang="en"><GlobalCoach identity={actor} subjectId={crypto.randomUUID()} example={vi.fn()} progressTransport={progress} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Ask coach' }));
  expect(screen.queryByText('Progress measurements')).toBeNull();
});

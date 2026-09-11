// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import GlobalCoach from '@/components/assistant/GlobalCoach';
import { I18nProvider } from '@/lib/i18n';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/workout' }));
Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

it('opens a compact conversation overlay with progressive media and history controls', () => {
  vi.stubEnv('NEXT_PUBLIC_COACH_CHAT_HISTORY_ENABLED', '1');
  render(<I18nProvider defaultLang="en"><GlobalCoach identity="compact-actor" example={vi.fn()} historyTransport={{ list: vi.fn(), read: vi.fn() }} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));

  expect(screen.getByRole('dialog', { name: 'Ask Trophē' })).toBeTruthy();
  expect(screen.getByRole('textbox', { name: 'Your question' })).toBeTruthy();
  expect(screen.getByLabelText('Photos')).toBeTruthy();
  expect(screen.getByLabelText('Voice')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Send question' }).hasAttribute('disabled')).toBe(true);
  expect(screen.queryByText(/Up to 3 JPEG/)).toBeNull();
  expect(screen.queryByText(/Record up to 30 seconds/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Remove screen selection: Workout' })).toBeTruthy();

  fireEvent.click(screen.getByLabelText('Saved conversations'));
  expect(screen.getByRole('button', { name: 'New conversation' })).toBeTruthy();
});

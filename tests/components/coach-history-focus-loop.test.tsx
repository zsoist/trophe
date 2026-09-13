// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import GlobalCoach from '@/components/assistant/GlobalCoach';
import { I18nProvider } from '@/lib/i18n';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/workout' }));
Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

/**
 * Mobile history replaces the thread: the composer/log are hidden, so the dialog focus loop must
 * never fall back onto their display:none descendants.
 */
function openMobileHistory() {
  vi.stubEnv('NEXT_PUBLIC_COACH_CHAT_HISTORY_ENABLED', '1');
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query.includes('max-width: 767px'), addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  render(<I18nProvider defaultLang="en"><GlobalCoach identity="focus-actor" example={vi.fn()} historyTransport={{ list: vi.fn(), read: vi.fn() }} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
  const dialog = screen.getByRole('dialog', { name: 'Ask Trophē' });
  const history = screen.getByRole('button', { name: 'Saved conversations' });
  history.focus();
  fireEvent.click(history);
  const log = dialog.querySelector('[role="log"]') as HTMLElement;
  const composer = dialog.querySelector('form') as HTMLFormElement;
  const sidebar = dialog.querySelector('aside') as HTMLElement;
  return { dialog, history, log, composer, sidebar };
}

it('excludes the hidden thread from the dialog focus loop while mobile history is open', () => {
  const { dialog, history, log, composer, sidebar } = openMobileHistory();
  expect(dialog.getAttribute('data-history')).toBe('true');
  // The CSS hides both regions on mobile; the inert marker is what keeps them out of the loop.
  expect(log.hasAttribute('inert')).toBe(true);
  expect(composer.hasAttribute('inert')).toBe(true);
  // Reverse wrap from the first focusable must land on visible history content, never the hidden composer.
  history.focus();
  fireEvent.keyDown(history, { key: 'Tab', shiftKey: true });
  expect(sidebar.contains(document.activeElement)).toBe(true);
  expect(composer.contains(document.activeElement)).toBe(false);
  // Forward wrap returns to the first focusable control.
  fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Tab' });
  expect(document.activeElement).toBe(history);
});

it('restores the thread to the focus loop once the mobile history closes', () => {
  const { history, log, composer } = openMobileHistory();
  fireEvent.click(history);
  expect(log.hasAttribute('inert')).toBe(false);
  expect(composer.hasAttribute('inert')).toBe(false);
  history.focus();
  fireEvent.keyDown(history, { key: 'Tab', shiftKey: true });
  expect(composer.contains(document.activeElement)).toBe(true);
  expect(document.activeElement).not.toBe(screen.getByRole('textbox', { name: 'Your question' }));
  fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Tab' });
  expect(document.activeElement).toBe(history);
});

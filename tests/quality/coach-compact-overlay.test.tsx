// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import GlobalCoach from '@/components/assistant/GlobalCoach';
import { I18nProvider } from '@/lib/i18n';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/workout' }));
Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('opens a compact conversation overlay with progressive media and history controls', () => {
  vi.stubEnv('NEXT_PUBLIC_COACH_CHAT_HISTORY_ENABLED', '1');
  vi.stubGlobal('innerHeight', 844);
  vi.stubGlobal('visualViewport', { height: 500, offsetTop: 0, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  const { container } = render(<I18nProvider defaultLang="en"><GlobalCoach identity="compact-actor" example={vi.fn()} historyTransport={{ list: vi.fn(), read: vi.fn() }} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));

  const dialog = screen.getByRole('dialog', { name: 'Ask Trophē' });
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  expect(dialog.style.getPropertyValue('--coach-viewport-height')).toBe('500px');
  expect(dialog.style.getPropertyValue('--coach-keyboard-inset')).toBe('344px');
  expect(container.hasAttribute('inert')).toBe(true);
  expect(screen.getByRole('textbox', { name: 'Your question' })).toBeTruthy();
  expect(screen.getByLabelText('Photos')).toBeTruthy();
  expect(screen.getByLabelText('Voice')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Send question' }).hasAttribute('disabled')).toBe(true);
  expect(screen.queryByText(/Up to 3 JPEG/)).toBeNull();
  expect(screen.queryByText(/Record up to 30 seconds/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Remove screen selection: Workout' })).toBeTruthy();

  const menu = screen.getByLabelText('Saved conversations');
  const voice = screen.getByLabelText('Voice');
  voice.focus();
  fireEvent.keyDown(voice, { key: 'Tab' });
  expect(document.activeElement).toBe(menu);
  menu.focus();
  fireEvent.keyDown(menu, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(voice);

  fireEvent.click(menu);
  expect(screen.getByRole('button', { name: 'New conversation' })).toBeTruthy();
});

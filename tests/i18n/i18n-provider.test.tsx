// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Language } from '@/lib/types';
import { I18nProvider, useI18n } from '@/lib/i18n';

function Probe() {
  const { lang, setLang, t } = useI18n();
  return <div><output aria-label="language">{lang}</output><output aria-label="home-copy">{t('nav.home')}</output><button type="button" onClick={() => setLang('de')}>German</button><button type="button" onClick={() => setLang('el')}>Greek</button></div>;
}

function renderProvider(defaultLang: Language = 'en') {
  return render(<I18nProvider defaultLang={defaultLang}><Probe /></I18nProvider>);
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.lang = '';
});

describe('I18nProvider language ownership', () => {
  it('honors the requested default, accepts an explicit language, persists it, and updates html lang', async () => {
    renderProvider('es');
    expect(screen.getByLabelText('language').textContent).toBe('es');
    await waitFor(() => expect(document.documentElement.lang).toBe('es'));

    fireEvent.click(screen.getByRole('button', { name: 'German' }));
    expect(screen.getByLabelText('language').textContent).toBe('de');
    expect(window.localStorage.getItem('trophe_lang')).toBe('de');
    expect(document.documentElement.lang).toBe('de');
  });

  it('restores only a supported stored language after mount', async () => {
    window.localStorage.setItem('trophe_lang', 'el');
    const view = renderProvider('en');
    await waitFor(() => expect(screen.getByLabelText('language').textContent).toBe('el'));
    expect(document.documentElement.lang).toBe('el');

    view.unmount();
    window.localStorage.setItem('trophe_lang', 'not-a-locale');
    renderProvider('en');
    await waitFor(() => expect(screen.getByLabelText('language').textContent).toBe('en'));
    expect(document.documentElement.lang).toBe('en');
  });

  it('keeps rendering and switching when browser storage access is denied', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => { throw new DOMException('Denied', 'SecurityError'); } });
    try {
      renderProvider('en');
      fireEvent.click(screen.getByRole('button', { name: 'Greek' }));
      expect(screen.getByLabelText('language').textContent).toBe('el');
      expect(screen.getByLabelText('home-copy').textContent).toBe('Αρχική');
      await waitFor(() => expect(document.documentElement.lang).toBe('el'));
    } finally {
      if (descriptor) Object.defineProperty(window, 'localStorage', descriptor);
    }
  });
});

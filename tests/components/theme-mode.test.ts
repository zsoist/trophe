// @vitest-environment jsdom

import React, { act } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { applyThemeMode, isThemeMode, resolveInitialTheme } from '@/lib/theme';
import { ThemeModeProvider, ThemeModeToggle } from '@/components/shared/ThemeMode';

function setThemeColorMeta(content = '#0A0A0A') {
  document.head.innerHTML = `<meta name="theme-color" content="${content}">`;
}

function setStoredTheme(value: string | null) {
  vi.stubGlobal('localStorage', {
    clear: vi.fn(),
    getItem: vi.fn(() => value),
    key: vi.fn(() => null),
    get length() { return value === null ? 0 : 1; },
    removeItem: vi.fn(),
    setItem: vi.fn(),
  } satisfies Storage);
}

beforeEach(() => {
  document.documentElement.className = 'font-vars h-full';
  document.documentElement.style.colorScheme = '';
  setThemeColorMeta();
  setStoredTheme(null);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.head.innerHTML = '';
});

describe('theme mode contracts', () => {
  it('recognizes only supported theme modes', () => {
    expect(isThemeMode('light')).toBe(true);
    expect(isThemeMode('sepia')).toBe(false);
  });

  it('uses the pre-painted root class before storage and falls back to dark', () => {
    expect(resolveInitialTheme('light', 'font-vars h-full light')).toBe('light');
    expect(resolveInitialTheme('dark', 'font-vars h-full light')).toBe('light');
    expect(resolveInitialTheme('sepia', 'font-vars h-full')).toBe('dark');
  });

  it('applies exactly one theme class and synchronizes document metadata', () => {
    document.documentElement.className = 'font-vars dark light';

    applyThemeMode('light', document);

    expect(document.documentElement.className).toBe('font-vars light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#FAFAF9');
  });

  it('initializes from the pre-painted DOM and synchronizes a toggle', () => {
    document.documentElement.className = 'font-vars h-full light';
    setStoredTheme('dark');

    render(React.createElement(ThemeModeProvider, null, React.createElement(ThemeModeToggle)));

    const toggle = screen.getByRole('button', { name: 'Toggle color theme' });
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(toggle.querySelectorAll('[data-theme-icon]')).toHaveLength(2);

    fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: 'Toggle color theme' })).toBeTruthy();
    expect(document.documentElement.className).toBe('font-vars h-full dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#0A0A0A');
    expect(localStorage.setItem).toHaveBeenCalledWith('trophe_theme_mode', 'dark');
  });

  it('records one provider mount and does not treat a theme toggle as a provider remount', () => {
    render(React.createElement(ThemeModeProvider, null, React.createElement(ThemeModeToggle)));
    const initialMountCount = Number(document.documentElement.dataset.tropheThemeProviderMounts);
    expect(initialMountCount).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle color theme' }));

    expect(Number(document.documentElement.dataset.tropheThemeProviderMounts)).toBe(initialMountCount);
  });

  it('keeps the toggle target at least 44px', () => {
    const source = readFileSync(join(process.cwd(), 'components/shared/ThemeMode.tsx'), 'utf8');
    expect(source).toContain('min-h-11 min-w-11');
  });

  it('keeps the toggle accessible name and icon tree independent of provider mode', () => {
    const source = readFileSync(join(process.cwd(), 'components/shared/ThemeMode.tsx'), 'utf8');

    expect(source).toContain('aria-label="Toggle color theme"');
    expect(source).toContain('data-theme-icon="dark"');
    expect(source).toContain('data-theme-icon="light"');
    expect(source).toContain('[.light_&]:hidden');
    expect(source).toContain('hidden [.light_&]:block');
  });

  it('hydrates pre-painted light mode over the dark server fallback without recovering markup', async () => {
    const browserDocument = document;
    vi.stubGlobal('document', undefined);
    const serverMarkup = renderToString(
      React.createElement(ThemeModeProvider, null, React.createElement(ThemeModeToggle)),
    );
    vi.stubGlobal('document', browserDocument);

    document.documentElement.className = 'font-vars h-full light';
    setStoredTheme('light');
    const container = document.createElement('div');
    container.innerHTML = serverMarkup;
    document.body.append(container);
    const recoverableErrors: unknown[] = [];
    let root: Root | undefined;

    await act(async () => {
      root = hydrateRoot(
        container,
        React.createElement(ThemeModeProvider, null, React.createElement(ThemeModeToggle)),
        { onRecoverableError: error => recoverableErrors.push(error) },
      );
    });

    expect(recoverableErrors).toEqual([]);
    expect(container.querySelector('button')?.getAttribute('aria-label')).toBe('Toggle color theme');
    expect(container.querySelectorAll('[data-theme-icon]')).toHaveLength(2);

    await act(async () => root?.unmount());
    container.remove();
  });
});

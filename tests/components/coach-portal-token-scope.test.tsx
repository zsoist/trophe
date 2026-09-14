// @vitest-environment jsdom
//
// Regression for the browser-confirmed portal token bug: the dialog is portaled into `document.body`
// and the launcher into `#global-coach-anchor` (AppHeader), so neither surface inherits `.root`.
// The premium `--at-*` tokens must therefore be declared on the portal surfaces themselves.
// jsdom has no CSS engine, so the structural half proves *where* the surfaces render and the
// source half proves *what* tokens those surfaces declare.

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import GlobalCoach from '@/components/assistant/GlobalCoach';
import { I18nProvider } from '@/lib/i18n';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));

afterEach(() => cleanup());

const css = readFileSync(join(process.cwd(), 'components/assistant/GlobalCoach.module.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

it('declares the premium surface tokens on both portal surfaces, not only on the in-tree wrapper', () => {
  const owner = /([^{}]*)\{[^{}]*--at-bg\s*:/.exec(css);
  expect(owner).not.toBeNull();
  const selectors = owner![1].split(',').map(part => part.trim());
  // The launcher is portaled into the header anchor and the dialog into document.body.
  expect(selectors).toContain('.launcher');
  expect(selectors).toContain('.panel');
  expect(selectors).toContain('.root');

  const declared = new Set(Array.from(css.matchAll(/(--at-[a-z-]+)\s*:/g), match => match[1]));
  const referenced = new Set(Array.from(css.matchAll(/var\((--at-[a-z-]+)/g), match => match[1]));
  expect(referenced.size).toBeGreaterThan(0);
  // Every token the stylesheet consumes is declared by that one owner rule for every portal surface.
  for (const name of referenced) expect(declared).toContain(name);
});

it('renders the launcher and the open dialog outside the token-owning wrapper', () => {
  window.scrollTo = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
  const anchor = document.createElement('span');
  anchor.id = 'global-coach-anchor';
  document.body.append(anchor);

  const { container } = render(
    <I18nProvider defaultLang="en"><GlobalCoach identity={crypto.randomUUID()} example={vi.fn()} /></I18nProvider>,
  );
  const wrapper = container.firstElementChild as HTMLElement;

  const launcher = screen.getByRole('button', { name: 'Ask Trophē' });
  expect(launcher.parentElement).toBe(anchor);
  expect(wrapper.contains(launcher)).toBe(false);

  fireEvent.click(launcher);
  const dialog = screen.getByRole('dialog');
  expect(dialog.parentElement).toBe(document.body);
  expect(wrapper.contains(dialog)).toBe(false);
  // Negative control: the wrapper is the token owner, so the fix cannot rely on its inheritance.
  expect(wrapper.className.length).toBeGreaterThan(0);
});

it('keeps launcher feedback smooth while honoring reduced motion', () => {
  expect(css).toMatch(/\.launcher\s*\{[^}]*transition:\s*background-color 180ms ease/);
  expect(css).toContain('.launcher:active');
  expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.launcher\s*\{[^}]*transition:\s*none;/);
});

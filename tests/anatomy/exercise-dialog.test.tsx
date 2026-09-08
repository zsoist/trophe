// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AtlasExercises, { AtlasExerciseSuggestions } from '../../components/anatomy/AtlasExercises';
import { I18nProvider } from '../../lib/i18n';
Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', ''); } });
Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open'); } });
Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
afterEach(cleanup);
const target = { group: 'chest', selection: 'pectoral-sternocostal', label: 'Chest · sternocostal' };
it('opens template guidance, goes back to the same selection list and closes without navigating', () => {
  const close = vi.fn();
  render(<I18nProvider defaultLang="en"><AtlasExercises target={target} onClose={close} libraryHref="/dashboard/workout/exercises?atlas=chest" /></I18nProvider>);
  expect(screen.getByRole('dialog')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Bench Press Barbell/ }));
  expect(screen.getByRole('heading', { name: 'Bench Press' })).toBeTruthy();
  expect(screen.getByText(/Keep shoulder blades pinched/)).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Movement phases' })).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Muscle activation atlas' })).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Training evidence' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^Add$/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Back to exercises' }));
  expect(screen.getByText(/catalogue does not distinguish this portion/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Close exercise details' }));
  expect(close).toHaveBeenCalledOnce();
});
it('inline selection suggestions hand off the chosen exercise and target', () => {
  const open = vi.fn();
  render(<I18nProvider defaultLang="en"><AtlasExerciseSuggestions target={target} onOpen={open} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: /Bench Press Barbell/ }));
  expect(open.mock.calls[0][0]).toMatchObject({ ...target, exercise: { name: 'Bench Press' } });
});

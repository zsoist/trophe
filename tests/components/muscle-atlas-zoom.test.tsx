// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import { MuscleAtlas } from '@/components/workout/MuscleAtlas';
import type { MuscleActivation } from '@/lib/workout/anatomy';

const activations: MuscleActivation[] = [
  { id: 'pectoralis-major', label: 'Pectoralis major', role: 'primary', view: 'front', confidence: 'curated' },
  { id: 'triceps-brachii', label: 'Triceps brachii', role: 'secondary', view: 'front', confidence: 'curated' },
];

afterEach(cleanup);

function map() {
  return screen.getByRole('group', { name: 'Front anatomy map' });
}

it('zooms the existing geometry viewport and restores it on reset', () => {
  render(<I18nProvider defaultLang="en"><MuscleAtlas activations={activations} selected={null} onSelect={vi.fn()} /></I18nProvider>);

  const fitted = map().getAttribute('viewBox');
  const zoomOut = screen.getByRole('button', { name: 'Zoom out' });
  expect(zoomOut.hasAttribute('disabled')).toBe(true);

  fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
  const zoomed = map().getAttribute('viewBox');
  expect(zoomed).not.toBe(fitted);

  fireEvent.click(screen.getByRole('button', { name: 'Reset view' }));
  expect(map().getAttribute('viewBox')).toBe(fitted);
  expect(zoomOut.hasAttribute('disabled')).toBe(true);
});

it('caps magnification so the smallest hit target cannot shrink below the compact floor', () => {
  render(<I18nProvider defaultLang="en"><MuscleAtlas activations={activations} selected={null} onSelect={vi.fn()} /></I18nProvider>);

  const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
  for (let step = 0; step < 8; step += 1) fireEvent.click(zoomIn);
  expect(zoomIn.hasAttribute('disabled')).toBe(true);

  const hit = screen.getByTestId('atlas-hit-pectoralis-major-0');
  expect(Number(hit.getAttribute('r'))).toBeGreaterThan(0);
  expect(hit.getAttribute('data-min-hit-target')).toBe('44');
});

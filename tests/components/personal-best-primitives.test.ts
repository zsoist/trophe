// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MovementVisual } from '@/components/workout/MovementVisual';
import { PerformanceSection } from '@/components/client/PerformanceSection';
import { ResultRow } from '@/components/client/ResultRow';

vi.mock('next/image', () => ({
  default: ({ alt, src, priority, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => {
    void priority;
    return React.createElement('img', { ...props, alt, src: String(src) });
  },
}));

afterEach(cleanup);

describe('Personal Best primitives', () => {
  it('renders movement-specific art with useful alternative text', () => {
    render(React.createElement(MovementVisual, {
      exerciseName: 'Bench Press',
      bodyArea: 'chest',
      alt: 'Bench press movement',
    }));

    expect(screen.getByRole('img', { name: 'Bench press movement' }).getAttribute('src'))
      .toBe('/workout/exercises/bench-press.webp');
  });

  it('falls back to body-area orientation for a custom movement', () => {
    render(React.createElement(MovementVisual, {
      exerciseName: 'Nick custom press',
      bodyArea: 'chest',
      alt: 'Chest area',
    }));

    expect(screen.getByRole('img', { name: 'Chest area' }).getAttribute('src'))
      .toBe('/workout/body-areas/chest.webp');
  });

  it('groups dense evidence under one semantic section instead of separate cards', () => {
    render(React.createElement(
      PerformanceSection,
      { title: 'Recent sessions', eyebrow: 'Evidence' },
      React.createElement(ResultRow, {
        title: 'Push',
        meta: 'May 24 · 58 min',
        metric: '16.7k kg',
      }),
    ));

    expect(screen.getByRole('region', { name: 'Recent sessions' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Recent sessions' })).toBeTruthy();
    expect(screen.getByText('Push')).toBeTruthy();
    expect(screen.getByText('16.7k kg')).toBeTruthy();
  });
});

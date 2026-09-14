// @vitest-environment jsdom

// Regression: the fullscreen meal-photo viewer had no keyboard dismissal — it
// was a visual-only overlay. Escape must close it and focus must enter the
// dialog so keyboard users are not stranded behind the viewer.

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  rows: [{
    id: 'photo-1', food_name: 'Greek salad', photo_url: 'https://example.test/salad.jpg',
    logged_date: '2026-08-12', calories: 210,
  }],
}));

vi.mock('framer-motion', async () => {
  const ReactModule = await import('react');
  const ignored = new Set(['animate', 'exit', 'initial', 'layout', 'transition', 'whileTap']);
  const element = (tag: string) => ReactModule.forwardRef<HTMLElement, Record<string, unknown>>(
    ({ children, ...props }, ref) => ReactModule.createElement(tag, {
      ...Object.fromEntries(Object.entries(props).filter(([key]) => !ignored.has(key))),
      ref,
    }, children as React.ReactNode),
  );
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: { button: element('button'), div: element('div'), span: element('span') },
  };
});

vi.mock('lucide-react', async () => {
  const ReactModule = await import('react');
  const Icon = () => ReactModule.createElement('span', { 'aria-hidden': true });
  return { Image: Icon, X: Icon, ChevronDown: Icon, ChevronUp: Icon };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          not: () => ({
            order: () => ({
              limit: async () => ({ data: h.rows }),
            }),
          }),
        }),
      }),
    }),
  },
}));

import MealPhotoGallery from '@/components/meals/MealPhotoGallery';

afterEach(cleanup);

describe('MealPhotoGallery fullscreen viewer', () => {
  it('closes on Escape and moves focus into the dialog when opened', async () => {
    render(React.createElement(MealPhotoGallery, { userId: 'user-1' }));

    const toggle = await screen.findByRole('button', { name: /Photo Gallery/ });
    fireEvent.click(toggle);

    fireEvent.click(await screen.findByRole('button', { name: 'Greek salad' }));
    const dialog = screen.getByRole('dialog', { name: 'Greek salad' });
    expect(dialog).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close fullscreen photo' })));

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

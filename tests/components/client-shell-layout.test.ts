// @vitest-environment jsdom

import React from 'react';
import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement('a', { ...props, href }, children) }));
vi.mock('framer-motion', async () => {
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: { div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => React.createElement('div', props, children) },
    useReducedMotion: () => true,
  };
});
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/shared/Providers', () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/lib/trpc/provider', () => ({ TRPCProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/components/shared/InstallCard', () => ({ InstallCard: () => null }));

import DashboardLayout from '@/app/dashboard/layout';

describe('client shell layout', () => {
  it('owns one stable primary navigation outside the animated page content', () => {
    render(React.createElement(DashboardLayout, null, React.createElement('p', null, 'Dashboard content')));
    expect(screen.getAllByRole('navigation', { name: 'Primary' })).toHaveLength(1);
    expect(screen.getByText('Dashboard content').closest('.client-shell__content')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Primary' }).className).toContain('client-shell__nav');
  });

  it('keeps one shell-owned nav at the safe-area edge', () => {
    const css = readFileSync('app/globals.css', 'utf8');
    expect(css).toContain('bottom: 0');
    expect(css).toContain('--client-shell-nav-base-height: 3.875rem');
    expect(css).toContain('--client-shell-nav-min-bottom-padding: 1rem');
    expect(css).toContain('max(env(safe-area-inset-bottom, 0px), var(--client-shell-nav-min-bottom-padding))');

    const rem = 16;
    const navBaseHeight = 3.875 * rem;
    const minimumBottomPadding = rem;
    const contentBuffer = 0.5 * rem;
    const navHeight = (safeAreaInset: number) => navBaseHeight + Math.max(safeAreaInset, minimumBottomPadding);
    const contentClearance = (safeAreaInset: number) => navHeight(safeAreaInset) + contentBuffer;

    expect(contentClearance(34)).toBe(104);
    expect(contentClearance(34)).toBe(navHeight(34) + 8);
  });
});

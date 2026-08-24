// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
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
});

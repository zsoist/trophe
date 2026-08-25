// @vitest-environment jsdom

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { BotNav } from '@/components/ui/BotNav';
import { CoachNav } from '@/components/coach/CoachNav';
import { AppHeader } from '@/components/shared/AppHeader';
import DashboardLayout from '@/app/dashboard/layout';
import CoachLayout from '@/app/coach/layout';
import AdminLayout from '@/app/admin/layout';
import SuperLayout from '@/app/super/layout';
import { getSession } from '@/lib/auth/get-session';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    React.createElement('a', { ...props, href: String(href) }, children),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  usePathname: () => '/dashboard',
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@/components/shared/Providers', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/lib/trpc/provider', () => ({
  TRPCProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/components/shared/InstallCard', () => ({ InstallCard: () => null }));
vi.mock('@/components/shared/FeedbackWidget', () => ({ default: () => null }));

vi.mock('@/lib/auth/get-session', () => ({
  getSession: vi.fn(),
  roleAtLeast: vi.fn(() => true),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('authenticated navigation accessibility', () => {
  it('gives every bottom navigation destination a 56px target on a semantic overlay', () => {
    render(React.createElement(BotNav, {
      routes: [
        { href: '/dashboard', label: 'Home', icon: React.createElement('span', null, 'H') },
        { href: '/dashboard/log', label: 'Log', icon: React.createElement('span', null, 'L') },
      ],
    }));

    const navigation = screen.getByRole('navigation', { name: 'Primary' });
    expect(navigation.className).toContain('bg-[var(--surface-overlay)]');
    expect(navigation.className).toContain('border-[var(--border-default)]');
    expect(navigation.className).toContain('safe-bottom');
    screen.getAllByRole('link').forEach((link) => {
      expect(link.className).toContain('min-h-14');
      expect(link.className).toContain('min-w-11');
    });
    const animatedElements = Array.from(navigation.querySelectorAll<HTMLElement>('[class*="transition"]'));
    expect(animatedElements.length).toBeGreaterThan(0);
    animatedElements.forEach((element) => {
      expect(element.className).toContain('motion-reduce:transition-none');
    });
    expect(navigation.querySelector('[class*="scale"], [class*="transform"]')).toBeNull();
    expect(screen.getByRole('link', { name: /Home/ }).className).toContain('text-[var(--action-primary)]');
    expect(screen.getByRole('link', { name: /Log/ }).className).toContain('text-[var(--content-muted)]');
  });

  it('keeps secondary coach destinations in an explicit Escape-safe disclosure', () => {
    render(React.createElement(CoachNav, { active: '/coach' }));

    const navigation = screen.getByRole('navigation', { name: 'Coach destinations' });
    for (const label of ['Clients', 'Calendar', 'Inbox', 'Habits']) {
      expect(within(navigation).getByRole('link', { name: label })).toBeTruthy();
    }

    const more = within(navigation).getByRole('button', { name: 'More coach destinations' });
    expect(more.parentElement?.className).toContain('md:hidden');
    expect(within(navigation).getByRole('link', { name: 'Protocols' }).parentElement?.className).toContain('md:flex');
    expect(more.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    const disclosure = within(navigation).getByRole('group', { name: 'More coach destinations' });
    for (const label of ['Protocols', 'Foods', 'Templates', 'Intake']) {
      expect(within(disclosure).getByRole('link', { name: label })).toBeTruthy();
    }

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(within(navigation).queryByRole('group', { name: 'More coach destinations' })).toBeNull();
    expect(document.activeElement).toBe(more);
  });

  it('provides a semantic sticky header, skip link, back target, actions, and theme access', () => {
    render(React.createElement(AppHeader, {
      title: 'Workspace',
      eyebrow: 'Coach',
      backHref: '/dashboard',
      actions: React.createElement('a', { href: '/help' }, 'Help'),
    }));

    expect(screen.getByRole('link', { name: 'Skip to main content' }).getAttribute('href')).toBe('#main-content');
    expect(screen.getByRole('banner').className).toContain('sticky');
    expect(screen.getByRole('banner').className).toContain('bg-[var(--surface-overlay)]');
    expect(screen.getByRole('banner').className).toContain('pt-[env(safe-area-inset-top)]');
    expect(screen.getByRole('link', { name: 'Back' }).className).toContain('min-h-11');
    expect(screen.getByRole('button', { name: 'Toggle color theme' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Help' })).toBeTruthy();
  });

  it('mounts shell-level theme access for client and coach routes', () => {
    const { unmount } = render(React.createElement(DashboardLayout, null, React.createElement('p', null, 'Client content')));
    expect(screen.getByRole('heading', { name: 'Trophē' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Toggle color theme' })).toBeTruthy();
    expect(document.getElementById('main-content')?.textContent).toContain('Client content');
    unmount();

    render(React.createElement(CoachLayout, null, React.createElement('p', null, 'Coach content')));
    expect(screen.getByRole('heading', { name: 'Coach workspace' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Toggle color theme' })).toBeTruthy();
    expect(document.getElementById('main-content')?.textContent).toContain('Coach content');
  });

  it('renders admin and super-admin routes through readable theme-aware shells', async () => {
    vi.mocked(getSession).mockResolvedValue({
      user: { id: 'admin-user' },
      role: 'admin',
    } as Awaited<ReturnType<typeof getSession>>);

    const adminTree = await AdminLayout({ children: React.createElement('p', null, 'Admin content') });
    const { unmount } = render(adminTree);
    expect(screen.getByRole('heading', { name: 'Administration' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Toggle color theme' })).toBeTruthy();
    expect(document.getElementById('main-content')?.className).toContain('max-w-6xl');
    for (const name of ['Organizations', 'AI costs']) {
      const shortcut = screen.getByRole('link', { name });
      expect(shortcut.className).toContain('inline-flex');
      expect(shortcut.className).toContain('min-h-11');
      expect(shortcut.className).toContain('min-w-11');
      expect(shortcut.className).toContain('items-center');
      expect(shortcut.className).toContain('justify-center');
      expect(shortcut.className).toContain('px-3');
      expect(shortcut.className).toContain('focus-visible:ring-2');
    }
    unmount();

    vi.mocked(getSession).mockResolvedValue({
      user: { id: 'super-user' },
      role: 'super_admin',
    } as Awaited<ReturnType<typeof getSession>>);
    const superTree = await SuperLayout({ children: React.createElement('p', null, 'Super content') });
    render(superTree);
    expect(screen.getByRole('heading', { name: 'Operations' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Toggle color theme' })).toBeTruthy();
    expect(document.getElementById('main-content')?.className).toContain('max-w-6xl');
    const adminShortcut = screen.getByRole('link', { name: 'Administration' });
    for (const targetClass of ['inline-flex', 'min-h-11', 'min-w-11', 'items-center', 'justify-center', 'px-3', 'focus-visible:ring-2']) {
      expect(adminShortcut.className).toContain(targetClass);
    }
  });
});

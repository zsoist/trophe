// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let pathname = '/dashboard';
export const mockPathname = (value: string) => { pathname = value; };
export const mockRouterReplace = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ replace: mockRouterReplace }),
}));
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement('a', { ...props, href }, children) }));

import { BotNav } from '@/components/ui/BotNav';
import { ClientShellNavigationProvider } from '@/components/shared/ClientShellContext';

describe('client shell navigation ownership', () => {
  const routes = [{ href: '/dashboard', label: 'Home', icon: React.createElement('span', null, 'H') }];

  const clientRoutes = [
    ...routes,
    { href: '/dashboard/workout', label: 'Workout', icon: React.createElement('span', null, 'W') },
  ];

  afterEach(() => {
    cleanup();
    mockRouterReplace.mockClear();
    mockPathname('/dashboard');
  });

  it('suppresses page-local navigation when the dashboard shell owns it', () => {
    render(React.createElement(ClientShellNavigationProvider, { value: true }, React.createElement(BotNav, { routes })));
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
  });

  it('reselects the active Workout tab and returns to Workout Home', () => {
    mockPathname('/dashboard/workout/live');
    render(React.createElement(BotNav, {
      routes: clientRoutes,
      onActiveRouteSelect: mockRouterReplace,
    }));

    fireEvent.click(screen.getByRole('link', { name: /Workout/i }));

    expect(mockRouterReplace).toHaveBeenCalledWith('/dashboard/workout');
  });

  it('keeps five equal safe-area slots and icon-only accessible labels through 430px', () => {
    render(React.createElement(BotNav, { routes: clientRoutes }));

    for (const label of ['Home', 'Workout']) {
      const link = screen.getByRole('link', { name: label });
      expect(link.getAttribute('aria-label')).toBe(label);
      expect(link.querySelector('[data-bot-nav-label]')?.className).toContain('min-[431px]:inline');
      expect(link.querySelector('[data-bot-nav-label]')?.className).not.toContain('text-ellipsis');
      expect(link.querySelector('[data-bot-nav-icon]')).toBeTruthy();
      expect(link.className).toContain('min-h-14');
      expect(link.className).toContain('basis-0');
    }
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(nav.className).toContain('grid-cols-[repeat(5,minmax(0,1fr))]');
    expect(nav.className).toContain('bottom-0');
    expect(nav.className).toContain('safe-bottom');
  });

  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Cmd', { metaKey: true }],
    ['Alt', { altKey: true }],
    ['Shift', { shiftKey: true }],
    ['middle', { button: 1 }],
  ])('preserves native link behavior for a %s activation', (_name, eventInit) => {
    mockPathname('/dashboard/workout/live');
    render(React.createElement(BotNav, {
      routes: clientRoutes,
      onActiveRouteSelect: mockRouterReplace,
    }));

    const workoutLink = screen.getByRole('link', { name: /Workout/i });
    workoutLink.setAttribute('target', '_blank');
    const result = fireEvent.click(workoutLink, eventInit);

    expect(result).toBe(true);
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });
});

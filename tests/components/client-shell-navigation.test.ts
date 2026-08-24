// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement('a', { ...props, href }, children) }));

import { BotNav } from '@/components/ui/BotNav';
import { ClientShellNavigationProvider } from '@/components/shared/ClientShellContext';

describe('client shell navigation ownership', () => {
  const routes = [{ href: '/dashboard', label: 'Home', icon: React.createElement('span', null, 'H') }];

  it('suppresses page-local navigation when the dashboard shell owns it', () => {
    render(React.createElement(ClientShellNavigationProvider, { value: true }, React.createElement(BotNav, { routes })));
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
  });
});

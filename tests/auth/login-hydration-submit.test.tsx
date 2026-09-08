import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={typeof href === 'string' ? href : '/'} {...props}>{children}</a>
  ),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(),
  },
}));

import LoginPage from '@/app/login/page';

describe('login hydration boundary', () => {
  it('keeps the auth submit disabled in server markup until client handlers exist', () => {
    const markup = renderToString(<LoginPage />);
    expect(markup).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>[\s\S]*Log in/);
  });
});

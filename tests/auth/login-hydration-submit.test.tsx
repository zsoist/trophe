// @vitest-environment jsdom

import React from 'react';
import { renderToString } from 'react-dom/server';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  getUser: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
}));

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
    auth,
    from: vi.fn(),
  },
}));

import LoginPage from '@/app/login/page';

describe('login hydration boundary', () => {
  afterEach(() => {
    cleanup();
    auth.getUser.mockReset();
  });

  it('keeps the auth submit disabled in server markup until client handlers exist', () => {
    const markup = renderToString(<LoginPage />);
    expect(markup).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>[\s\S]*Log in/);
  });

  it('keeps login disabled until the initial browser-session check releases the auth client', async () => {
    let release!: (value: { error: null }) => void;
    auth.getUser.mockReturnValue(new Promise(resolve => { release = resolve; }));

    render(<LoginPage />);
    const submit = screen.getAllByRole('button', { name: 'Log in' })
      .find(button => button.getAttribute('type') === 'submit');
    expect(submit).toBeDefined();
    expect(submit?.hasAttribute('disabled')).toBe(true);

    await act(async () => { release({ error: null }); });
    await waitFor(() => expect(submit?.hasAttribute('disabled')).toBe(false));
  });
});

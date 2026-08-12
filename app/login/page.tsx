'use client';

import { Suspense, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, ArrowRight, Loader2, Eye, EyeOff } from 'lucide-react';
import { submitSignup, resendConfirmation, fetchDeps } from '@/lib/auth/signup-client';
import { authCallbackErrorNotice, confirmedLoginNotice } from '@/lib/auth/auth-messages';
import { recoverInvalidBrowserSession } from '@/lib/auth/recover-browser-session';
import { ThemeModeProvider, ThemeModeToggle } from '@/components/shared/ThemeMode';
import { Button, IconButton } from '@/components/ui';

const clearInvalidLocalSession = () => supabase.auth.signOut({ scope: 'local' });

function safeRedirectTo(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/login')) {
    return null;
  }
  return value;
}

function passwordStrength(password: string): { label: 'Weak' | 'Good' | 'Strong'; percent: number } {
  const checks = [
    password.length >= 8,
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;

  if (score >= 4) return { label: 'Strong', percent: 100 };
  if (score >= 2) return { label: 'Good', percent: 66 };
  return { label: 'Weak', percent: 33 };
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeRedirectTo(searchParams.get('redirectTo'));
  // Coach beta invite code (?code=…) — elevates signup to a coach account (B1).
  const inviteCode = searchParams.get('code')?.trim() || undefined;
  // A code link implies signup intent.
  const initialMode = (searchParams.get('mode') === 'signup' || inviteCode) ? 'signup' : 'login';

  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [fullName, setFullName] = useState('');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pendingEmail, setPendingEmail] = useState<string | null>(null); // 202 → check-email screen
  const strength = passwordStrength(password);

  // Sync mode with URL param changes; surface the post-confirmation success notice (P1).
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const urlMode = searchParams.get('mode');
      if (urlMode === 'signup') setMode('signup');
      const callbackError = authCallbackErrorNotice(searchParams.get('error'));
      if (callbackError) {
        setMode('login');
        setSuccess('');
        setError(callbackError);
        return;
      }
      const notice = confirmedLoginNotice(searchParams.get('confirmed'));
      if (notice) { setMode('login'); setSuccess(notice); }
    });
    return () => { active = false; };
  }, [searchParams]);

  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(async ({ error: authError }) => {
      if (!active || !authError) return;
      await recoverInvalidBrowserSession(authError, clearInvalidLocalSession);
    }).catch(() => {
      // Network failures leave browser auth state untouched and the form usable.
    });

    return () => { active = false; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (mode === 'login') {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        if (redirectTo) {
          router.replace(redirectTo);
          return;
        }
        // Route by role — coaches go to /coach, clients to /dashboard
        const userId = authData.user?.id;
        if (userId) {
          const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
          if (profile?.role === 'coach') {
            router.replace('/coach');
            return;
          }
        }
        router.replace('/dashboard');
      } else {
        // Server-side reservation flow (WP1): creates an UNCONFIRMED account + emails a
        // confirmation link. submitSignup has NO sign-in dependency, so a 202 can only ever
        // become a "check your email" state — never an auto-login over an unconfirmed account.
        const result = await submitSignup(fetchDeps(), { email, password, fullName, inviteCode, consent });
        if (result.kind === 'pending') setPendingEmail(result.email);
        else setError(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!pendingEmail) return;
    setLoading(true); setError(''); setSuccess('');
    const result = await resendConfirmation(fetchDeps(), '/api/auth/signup', { email: pendingEmail, password, full_name: fullName, inviteCode, consent: true });
    setLoading(false);
    if (result.kind === 'pending') setSuccess('Confirmation email re-sent.');
    else setError(result.message);
  }

  async function handleMagicLink() {
    if (!email) { setError('Enter your email first'); return; }
    setLoading(true);
    setError('');
    // Route through the server endpoint (not the browser client) so the
    // magic link inherits shouldCreateUser:false, a safe redirect, IP rate
    // limiting, and no email-enumeration leak. A raw signInWithOtp here would
    // provision a brand-new account for any address and skip all of that.
    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Could not send the magic link — try again');
      } else {
        setSuccess(data.message ?? 'Magic link sent! Check your email.');
      }
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-x-hidden bg-[var(--canvas)] px-5 py-20 text-[var(--content-primary)]">
      <div className="fixed right-4 top-4 z-20">
        <ThemeModeToggle />
      </div>
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-[#D4A853] rounded-full opacity-[0.02] blur-[120px]" />
      </div>

      <div className="login-enter w-full max-w-sm relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex min-h-11 min-w-11 items-center justify-center no-underline">
            <span className="font-serif italic text-[#D4A853] text-3xl tracking-tight select-none">
              trophē
            </span>
          </Link>
          <p className="mt-2 text-xs font-mono uppercase tracking-widest text-[var(--content-muted)]">
            Precision Nutrition
          </p>
        </div>

        {/* Card */}
        <div className="glass-elevated p-6 sm:p-7">
          {pendingEmail ? (
            <div className="text-center py-4">
              <Mail size={28} className="mx-auto text-[#D4A853] mb-3" />
              <h2 className="mb-1 text-base font-semibold text-[var(--content-primary)]">Check your email</h2>
              <p className="mb-4 text-sm leading-relaxed text-[var(--content-muted)]">
                We sent a confirmation link to <span className="text-[var(--content-secondary)]">{pendingEmail}</span>. Click it to
                activate your account, then come back and log in.
              </p>
              {error && <p className="mb-2 text-sm text-[var(--status-danger-fg)]">{error}</p>}
              {success && <p className="mb-2 text-sm text-[var(--status-success-fg)]">{success}</p>}
              <Button type="button" variant="secondary" fullWidth onClick={handleResend} disabled={loading} className="mb-2">
                {loading ? 'Sending…' : 'Resend confirmation email'}
              </Button>
              <button type="button" onClick={() => { setPendingEmail(null); setMode('login'); setError(''); setSuccess(''); }} className="min-h-11 text-sm text-[var(--content-muted)] hover:text-[var(--content-primary)]">
                ← Back to log in
              </button>
            </div>
          ) : (<>
          {/* Mode Toggle */}
          <div className="mb-5 flex gap-0.5 rounded-xl bg-[var(--surface-2)] p-1">
            <button
              type="button"
              aria-pressed={mode === 'login'}
              onClick={() => { setMode('login'); setError(''); }}
              className={`min-h-11 flex-1 rounded-lg text-sm font-semibold transition-all ${
                mode === 'login'
                  ? 'bg-[var(--surface-1)] text-[var(--action-primary)] shadow-sm'
                  : 'text-[var(--content-muted)] hover:text-[var(--content-primary)]'
              }`}
            >
              Log in
            </button>
            <button
              type="button"
              aria-pressed={mode === 'signup'}
              onClick={() => { setMode('signup'); setError(''); }}
              className={`min-h-11 flex-1 rounded-lg text-sm font-semibold transition-all ${
                mode === 'signup'
                  ? 'bg-[var(--surface-1)] text-[var(--action-primary)] shadow-sm'
                  : 'text-[var(--content-muted)] hover:text-[var(--content-primary)]'
              }`}
            >
              Sign up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'signup' && (
              <div>
                <label htmlFor="full-name" className="mb-1.5 block text-sm font-medium text-[var(--content-secondary)]">Your name</label>
                <input
                  id="full-name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="input-dark"
                  placeholder="Your name"
                  required
                  autoComplete="name"
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[var(--content-secondary)]">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-dark"
                placeholder="Email"
                required
                autoComplete="email"
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-[var(--content-secondary)]">{mode === 'signup' ? 'Create password' : 'Password'}</label>
              <div className="relative">
              <input
                id="password"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-dark pr-12"
                placeholder={mode === 'signup' ? 'Create password (8+ chars)' : 'Password'}
                required
                minLength={mode === 'signup' ? 8 : 6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
              <IconButton
                type="button"
                aria-label={showPw ? 'Hide password' : 'Show password'}
                onClick={() => setShowPw(!showPw)}
                className="absolute right-0 top-1/2 -translate-y-1/2 border-0 text-[var(--content-muted)]"
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </IconButton>
              </div>
            </div>

            {mode === 'signup' && password.length > 0 && (
              <div
                aria-live="polite"
                className="space-y-1"
                role="status"
              >
                <div className="h-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
                  <div
                    className="password-strength-fill h-full rounded-full bg-[#D4A853]"
                    style={{ width: `${strength.percent}%` }}
                  />
                </div>
                <p className="text-xs text-[var(--content-muted)]">
                  Password strength: <span className="text-[var(--content-secondary)]">{strength.label}</span>
                </p>
              </div>
            )}

            {mode === 'signup' && (
              <label className="flex items-start gap-3 py-1 text-sm leading-relaxed text-[var(--content-muted)]">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required className="mt-0.5" />
                <span>I consent to trophē processing my nutrition &amp; body-composition data (special-category health data) for personalised coaching. I can withdraw anytime in Settings. See the <a href="/trust" target="_blank" className="inline-flex min-h-11 items-center text-[var(--action-primary)]">Trust &amp; Data page</a>.</span>
              </label>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-3 py-2"
              >
                <p className="text-sm text-[var(--status-danger-fg)]">{error}</p>
              </div>
            )}

            {success && (
              <div
                role="status"
                className="rounded-xl border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-3 py-2"
              >
                <p className="text-sm text-[var(--status-success-fg)]">{success}</p>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              fullWidth
              className="gap-2"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <>
                  {mode === 'login' ? 'Log in' : 'Create Account'}
                  <ArrowRight size={14} />
                </>
              )}
            </Button>
          </form>

          {mode === 'login' && (
            <>
              <div className="flex items-center gap-3 my-4">
                <div className="h-px flex-1 bg-[var(--border-subtle)]" />
                <span className="font-mono text-xs uppercase text-[var(--content-muted)]">or</span>
                <div className="h-px flex-1 bg-[var(--border-subtle)]" />
              </div>

              <Button
                type="button"
                onClick={handleMagicLink}
                disabled={loading}
                variant="secondary"
                fullWidth
                className="gap-2"
              >
                <Mail size={13} />
                Send magic link
              </Button>
            </>
          )}

          {mode === 'signup' && (
            <p className="mt-4 text-center text-xs leading-relaxed text-[var(--content-muted)]">
              Creates a client account. Coach seats by invite only.
            </p>
          )}
          </>)}
        </div>

        {/* Back to home */}
        <div className="text-center mt-6">
          <Link href="/" className="inline-flex min-h-11 items-center text-sm text-[var(--content-muted)] transition-colors hover:text-[var(--content-primary)] no-underline">
            ← Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <ThemeModeProvider>
      <Suspense fallback={<div className="min-h-screen bg-[var(--canvas)]" />}>
        <LoginForm />
      </Suspense>
    </ThemeModeProvider>
  );
}

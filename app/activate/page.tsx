'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { submitActivation, resendConfirmation, fetchDeps } from '@/lib/auth/signup-client';
import { ThemeModeProvider, ThemeModeToggle } from '@/components/shared/ThemeMode';
import { Button, Card } from '@/components/ui';

/**
 * Client activation via a coach invite link (/activate?token=…). Plan B1.
 * Shows the inviting coach, collects name/email/password + mandatory Art.9 consent,
 * creates the client account linked to the coach (EMAIL-UNCONFIRMED), then shows a
 * "check your email" screen — the user confirms via email, it does NOT auto-sign-in.
 */
function ActivateForm() {
  const token = useSearchParams().get('token') ?? '';

  const [state, setState] = useState<'loading' | 'invalid' | 'ready'>(token ? 'loading' : 'invalid');
  const [coachName, setCoachName] = useState('your coach');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null); // 202 → check-email

  useEffect(() => {
    if (!token) return;
    fetch(`/api/auth/activate-client?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.valid) { setCoachName(d.coachName); if (d.clientName) setFullName(d.clientName); setState('ready'); }
        else setState('invalid');
      })
      .catch(() => setState('invalid'));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    // submitActivation has NO sign-in dependency → a 202 can only become "check your email",
    // never an auto-login over the deliberately-unconfirmed account.
    const result = await submitActivation(fetchDeps(), { token, email, password, fullName, consent });
    setSubmitting(false);
    if (result.kind === 'pending') setPendingEmail(result.email);
    else setError(result.message);
  }

  async function handleResend() {
    if (!pendingEmail) return;
    setSubmitting(true); setError('');
    const result = await resendConfirmation(fetchDeps(), '/api/auth/activate-client', { token, email: pendingEmail, password, full_name: fullName, consent: true });
    setSubmitting(false);
    if (result.kind === 'error') setError(result.message);
  }

  if (pendingEmail) {
    return (
      <Card className="mx-auto max-w-[420px] p-6 text-center sm:p-8">
        <h1 className="mb-3 text-2xl font-bold">Check your email</h1>
        <p className="mb-5 text-sm text-[var(--content-muted)]">We sent a confirmation link to <span className="text-[var(--content-secondary)]">{pendingEmail}</span>. Click it to activate your account, then log in.</p>
        {error && <p role="alert" className="mb-3 text-sm text-[var(--status-danger-fg)]">{error}</p>}
        <Button type="button" variant="secondary" onClick={handleResend} disabled={submitting} className="mb-3">{submitting ? 'Sending…' : 'Resend confirmation email'}</Button>
        <div><a href="/login" className="inline-flex min-h-11 items-center text-sm text-[var(--content-muted)]">← Go to log in</a></div>
      </Card>
    );
  }

  if (state === 'loading') {
    return <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}><Loader2 className="animate-spin" /></div>;
  }
  if (state === 'invalid') {
    return (
      <Card className="mx-auto max-w-[420px] p-6 text-center sm:p-8">
        <h1 className="mb-3 text-2xl font-bold">Invite not valid</h1>
        <p className="text-sm text-[var(--content-muted)]">This invitation link is invalid or has expired. Please ask your coach to send you a new one.</p>
        <a href="/login" className="mt-4 inline-flex min-h-11 items-center text-sm text-[var(--action-primary)]">Go to log in</a>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-[420px] p-6 sm:p-8">
      <div className="mb-2 font-mono text-xs uppercase tracking-[.12em] text-[var(--action-primary)]">Activate your account</div>
      <h1 className="mb-2 text-2xl font-bold">{coachName} invited you to trophē</h1>
      <p className="mb-6 text-sm text-[var(--content-muted)]">Create your account to start working with your nutritionist.</p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block text-sm font-medium text-[var(--content-secondary)]">Your name<input className="input-dark mt-1.5" placeholder="Your name" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" /></label>
        <label className="block text-sm font-medium text-[var(--content-secondary)]">Email<input className="input-dark mt-1.5" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
        <label className="block text-sm font-medium text-[var(--content-secondary)]">Create password<input className="input-dark mt-1.5" type="password" placeholder="8 or more characters" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" /></label>
        <label className="flex items-start gap-3 py-2 text-sm leading-relaxed text-[var(--content-muted)]">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
          <span>I consent to trophē and {coachName} processing my nutrition and body-composition data (special-category health data) to provide personalised coaching. I can withdraw consent anytime from Settings. See the <a href="/trust" target="_blank" className="inline-flex min-h-11 items-center text-[var(--action-primary)]">Trust &amp; Data page</a>.</span>
        </label>
        {error && <p role="alert" className="text-sm text-[var(--status-danger-fg)]">{error}</p>}
        <Button type="submit" fullWidth disabled={submitting || !consent}>
          {submitting ? 'Creating account…' : 'Create my account'}
        </Button>
      </form>
    </Card>
  );
}

export default function ActivatePage() {
  return (
    <ThemeModeProvider>
      <main className="relative grid min-h-screen place-items-center bg-[var(--canvas)] px-5 py-20 text-[var(--content-primary)]">
        <div className="fixed right-4 top-4 z-20"><ThemeModeToggle /></div>
        <Suspense fallback={<div className="grid min-h-[60vh] place-items-center"><Loader2 className="animate-spin" /></div>}>
          <ActivateForm />
        </Suspense>
      </main>
    </ThemeModeProvider>
  );
}

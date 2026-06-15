'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * Client activation via a coach invite link (/activate?token=…). Plan B1.
 * Shows the inviting coach, collects name/email/password + mandatory Art.9
 * consent, creates the client account linked to the coach, then signs in.
 */
function ActivateForm() {
  const token = useSearchParams().get('token') ?? '';

  const [state, setState] = useState<'loading' | 'invalid' | 'ready'>('loading');
  const [coachName, setCoachName] = useState('your coach');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null); // 202 → check-email

  useEffect(() => {
    if (!token) { setState('invalid'); return; }
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
    if (!consent) { setError('Please consent to data processing to continue.'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/activate-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, password, full_name: fullName, consent: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Activation failed');
      // 202 verification_required — DO NOT auto-login; the account is unconfirmed until the
      // user clicks the email link. Show the check-email screen.
      setPendingEmail(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (!pendingEmail) return;
    setSubmitting(true); setError('');
    try {
      const res = await fetch('/api/auth/activate-client', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email: pendingEmail, password, full_name: fullName, consent: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not resend');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend');
    } finally {
      setSubmitting(false);
    }
  }

  if (pendingEmail) {
    return (
      <div style={{ maxWidth: 420, margin: '0 auto', padding: '64px 24px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Check your email</h1>
        <p style={{ color: '#a8a29e', fontSize: 14, marginBottom: 20 }}>We sent a confirmation link to <span style={{ color: '#e7e5e4' }}>{pendingEmail}</span>. Click it to activate your account, then log in.</p>
        {error && <p style={{ color: '#fca5a5', fontSize: 13, marginBottom: 12 }}>{error}</p>}
        <button type="button" onClick={handleResend} disabled={submitting} className="btn-ghost" style={{ marginBottom: 12 }}>{submitting ? 'Sending…' : 'Resend confirmation email'}</button>
        <div><a href="/login" style={{ color: '#a8a29e', fontSize: 13 }}>← Go to log in</a></div>
      </div>
    );
  }

  if (state === 'loading') {
    return <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}><Loader2 className="animate-spin" /></div>;
  }
  if (state === 'invalid') {
    return (
      <div style={{ maxWidth: 420, margin: '0 auto', padding: '64px 24px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Invite not valid</h1>
        <p style={{ color: '#a8a29e' }}>This invitation link is invalid or has expired. Please ask your coach to send you a new one.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '48px 24px' }}>
      <div style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '.12em', color: '#D4A853', textTransform: 'uppercase', marginBottom: 8 }}>Activate your account</div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>{coachName} invited you to trophē</h1>
      <p style={{ color: '#a8a29e', fontSize: 14, marginBottom: 24 }}>Create your account to start working with your nutritionist.</p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input className="input-dark w-full" placeholder="Your name" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
        <input className="input-dark w-full" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <input className="input-dark w-full" type="password" placeholder="Create password (8+ chars)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12.5, color: '#a8a29e', padding: '8px 0' }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
          <span>I consent to trophē and {coachName} processing my nutrition and body-composition data (special-category health data) to provide personalised coaching. I can withdraw consent anytime from Settings. See the <a href="/trust" target="_blank" style={{ color: '#D4A853' }}>Trust &amp; Data page</a>.</span>
        </label>
        {error && <p style={{ color: '#fca5a5', fontSize: 13 }}>{error}</p>}
        <button type="submit" className="btn-gold w-full py-3" disabled={submitting || !consent}>
          {submitting ? 'Creating account…' : 'Create my account'}
        </button>
      </form>
    </div>
  );
}

export default function ActivatePage() {
  return (
    <div style={{ background: 'var(--bg,#0a0a0a)', minHeight: '100vh', color: '#e7e5e4' }}>
      <Suspense fallback={<div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}><Loader2 className="animate-spin" /></div>}>
        <ActivateForm />
      </Suspense>
    </div>
  );
}

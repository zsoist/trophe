'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Copy, Check, UserPlus } from 'lucide-react';

/**
 * Coach generates a shareable client-invite link (plan B1). Copy → send via
 * WhatsApp/email; the client opens it to create a linked account with consent.
 */
export default function CoachInvitePage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  async function generate() {
    setLoading(true); setError(''); setLink('');
    try {
      const res = await fetch('/api/coach/invite-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientName: name || undefined, clientEmail: email || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create invite');
      setLink(data.link);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div data-coach-mobile-workspace className="min-h-screen min-w-0" style={{ background: 'var(--canvas)', color: 'var(--content-primary)' }}>
      <div className="min-w-0" style={{ maxWidth: 460, margin: '0 auto', padding: '32px 20px' }}>
        <Link href="/coach" className="min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--content-secondary)', fontSize: 13, marginBottom: 20 }}>
          <ArrowLeft size={15} /> Back
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <UserPlus size={20} className="gold-text" />
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Invite a client</h1>
        </div>
        <p style={{ color: 'var(--content-secondary)', fontSize: 14, marginBottom: 24 }}>
          Generate a private link and send it to your client (WhatsApp, email, anywhere). They&rsquo;ll
          create an account linked to you and give consent — no manual setup on your side.
        </p>
        <div className="space-y-3">
          <input className="input-dark min-h-11 w-full text-base" placeholder="Client name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input-dark min-h-11 w-full text-base" type="email" placeholder="Client email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn-gold min-h-11 w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]" onClick={generate} disabled={loading}>
            {loading ? 'Generating…' : 'Generate invite link'}
          </button>
          {error && <p style={{ color: 'var(--status-danger-foreground)', fontSize: 13 }}>{error}</p>}
          {link && (
            <div className="glass p-3 rounded-xl" style={{ marginTop: 8 }}>
              <p style={{ fontSize: 12, color: 'var(--content-secondary)', marginBottom: 6 }}>Share this link (valid 14 days):</p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <code style={{ flex: 1, fontSize: 12, wordBreak: 'break-all', color: 'var(--action-primary)' }}>{link}</code>
                <button onClick={copy} className="min-h-11 min-w-11 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]" style={{ background: 'var(--surface-active)', flexShrink: 0 }} aria-label="Copy link">
                  {copied ? <Check size={15} className="text-green-400" /> : <Copy size={15} className="gold-text" />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

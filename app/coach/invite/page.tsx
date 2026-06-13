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
    <div style={{ background: 'var(--bg,#0a0a0a)', minHeight: '100vh', color: '#e7e5e4' }}>
      <div style={{ maxWidth: 460, margin: '0 auto', padding: '32px 20px' }}>
        <Link href="/coach" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#a8a29e', fontSize: 13, marginBottom: 20 }}>
          <ArrowLeft size={15} /> Back
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <UserPlus size={20} className="gold-text" />
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Invite a client</h1>
        </div>
        <p style={{ color: '#a8a29e', fontSize: 14, marginBottom: 24 }}>
          Generate a private link and send it to your client (WhatsApp, email, anywhere). They&rsquo;ll
          create an account linked to you and give consent — no manual setup on your side.
        </p>
        <div className="space-y-3">
          <input className="input-dark w-full" placeholder="Client name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input-dark w-full" type="email" placeholder="Client email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn-gold w-full py-3" onClick={generate} disabled={loading}>
            {loading ? 'Generating…' : 'Generate invite link'}
          </button>
          {error && <p style={{ color: '#fca5a5', fontSize: 13 }}>{error}</p>}
          {link && (
            <div className="glass p-3 rounded-xl" style={{ marginTop: 8 }}>
              <p style={{ fontSize: 11, color: '#a8a29e', marginBottom: 6 }}>Share this link (valid 14 days):</p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <code style={{ flex: 1, fontSize: 11, wordBreak: 'break-all', color: '#D4A853' }}>{link}</code>
                <button onClick={copy} className="p-2 rounded-lg" style={{ background: 'rgba(212,168,83,0.15)', flexShrink: 0 }} aria-label="Copy link">
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

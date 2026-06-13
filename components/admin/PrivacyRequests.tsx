'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, LoaderCircle, ShieldCheck, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface PrivacyRequest {
  id: string;
  request_type: 'export' | 'deletion' | 'correction' | 'restriction';
  status: string;
  requested_at: string;
  due_at: string;
  completed_at: string | null;
  result_uri: string | null;
}

export default function PrivacyRequests() {
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const headers = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error('Your session expired. Sign in again.');
    return { Authorization: `Bearer ${data.session.access_token}` };
  }, []);

  const loadRequests = useCallback(async () => {
    try {
      const response = await fetch('/api/privacy/requests', { headers: await headers() });
      const body = await response.json() as { requests?: PrivacyRequest[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Unable to load privacy requests');
      setRequests(body.requests ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load privacy requests');
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => { void loadRequests(); }, [loadRequests]);

  async function submit(type: 'export' | 'deletion') {
    setSubmitting(type);
    setError(null);
    try {
      const response = await fetch('/api/privacy/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await headers() },
        body: JSON.stringify({ type }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Unable to submit privacy request');
      await loadRequests();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to submit privacy request');
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <section className="glass p-5 mb-4" aria-labelledby="privacy-controls-title">
      <h3 id="privacy-controls-title" className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-2">
        <ShieldCheck size={14} /> Privacy Controls
      </h3>
      <p className="text-xs text-stone-500 mb-4">Request a portable data export or account deletion review. Deletion is verified before processing and is not immediate.</p>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => void submit('export')} disabled={Boolean(submitting)} className="rounded-xl border border-white/10 px-3 py-2.5 text-xs text-stone-300 hover:bg-white/5 disabled:opacity-50">
          {submitting === 'export' ? <LoaderCircle size={14} className="mx-auto animate-spin" /> : <span className="flex items-center justify-center gap-2"><Download size={14} /> Request export</span>}
        </button>
        <button onClick={() => void submit('deletion')} disabled={Boolean(submitting)} className="rounded-xl border border-red-500/20 px-3 py-2.5 text-xs text-red-300 hover:bg-red-500/5 disabled:opacity-50">
          {submitting === 'deletion' ? <LoaderCircle size={14} className="mx-auto animate-spin" /> : <span className="flex items-center justify-center gap-2"><Trash2 size={14} /> Request deletion</span>}
        </button>
      </div>
      {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
      {!loading && requests.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-white/5 pt-3">
          {requests.slice(0, 5).map((request) => (
            <div key={request.id} className="flex justify-between gap-3 text-xs">
              <span className="capitalize text-stone-400">{request.request_type}</span>
              <span className="text-stone-500">{request.status} · due {new Date(request.due_at).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

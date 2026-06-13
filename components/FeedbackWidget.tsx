'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MessageSquarePlus, Loader2, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';

/**
 * Beta feedback widget (Daily Nutrafit Step 4).
 *
 * A floating button that opens the roadmap's three questions:
 *   - What saves you time?   → category 'saves_time'
 *   - What's missing?        → category 'missing'
 *   - What would you pay for? → category 'would_pay' (answer also stored in would_pay)
 *
 * One row per non-empty answer. Writes go straight through the browser Supabase
 * client; RLS ("Users manage own feedback") pins user_id = auth.uid(), so there
 * is no API route to abuse. Mounted in the coach layout — the beta cohort is
 * professionals (10 nutritionists / 10 coaches / 5 gyms).
 */

interface Prompt {
  category: 'saves_time' | 'missing' | 'would_pay';
  label: string;
  placeholder: string;
}

const PROMPTS: Prompt[] = [
  { category: 'saves_time', label: 'What saves you time?', placeholder: 'Which part of Trophē actually saves you work?' },
  { category: 'missing', label: "What's missing?", placeholder: 'What do you wish it did that it doesn\'t yet?' },
  { category: 'would_pay', label: 'What would you pay for?', placeholder: 'Which feature is worth paying for — and roughly how much?' },
];

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [role, setRole] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve the submitter's role once, for the row snapshot.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (!cancelled) setRole(data?.role ?? null);
    })();
    return () => { cancelled = true; };
  }, []);

  // Lock body scroll while the modal is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const close = () => {
    setOpen(false);
    // Reset after the exit animation so a re-open starts fresh.
    setTimeout(() => { setAnswers({}); setDone(false); setError(null); }, 250);
  };

  async function submit() {
    const rows = PROMPTS
      .filter((p) => (answers[p.category] ?? '').trim().length > 0)
      .map((p) => ({
        category: p.category,
        message: answers[p.category].trim().slice(0, 2000),
        would_pay: p.category === 'would_pay' ? answers[p.category].trim().slice(0, 2000) : null,
        role,
        page_context: typeof window !== 'undefined' ? window.location.pathname : null,
      }));

    if (rows.length === 0) { setError('Add at least one answer first.'); return; }

    setSubmitting(true);
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Please sign in again.'); setSubmitting(false); return; }

    // user_id must be set explicitly so the RLS WITH CHECK (user_id = auth.uid()) passes.
    const { error: insertError } = await supabase
      .from('feedback')
      .insert(rows.map((r) => ({ ...r, user_id: user.id })));

    setSubmitting(false);
    if (insertError) { setError('Could not send — try again.'); return; }
    setDone(true);
    setTimeout(close, 1600);
  }

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(true)}
        title="Send beta feedback"
        style={{
          position: 'fixed', right: 18, bottom: 18, zIndex: 9000,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', borderRadius: 999,
          background: 'var(--gold-300,#D4A853)', color: '#0a0a0a',
          border: 'none', cursor: 'pointer',
          fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
          letterSpacing: '.04em', textTransform: 'uppercase',
          boxShadow: '0 6px 20px rgba(0,0,0,.35)',
        }}
      >
        <MessageSquarePlus size={15} />
        Feedback
      </button>

      <AnimatePresence>
        {open && createPortal(
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
            onClick={close}
          >
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden"
              style={{
                background: 'var(--bg-1,#1c1917)',
                border: '1px solid var(--line-2,rgba(255,255,255,0.08))',
                maxHeight: '88vh', overflowY: 'auto',
              }}
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div>
                  <h2 className="text-lg font-bold" style={{ color: 'var(--t1,#f5f5f4)' }}>Help shape Trophē</h2>
                  <p className="text-xs" style={{ color: 'var(--t3,#a8a29e)' }}>Answer any one — it takes 30 seconds.</p>
                </div>
                <button onClick={close} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,.06)' }}>
                  <X size={14} style={{ color: 'var(--t3,#a8a29e)' }} />
                </button>
              </div>

              {done ? (
                <div className="px-5 py-12 flex flex-col items-center gap-3 text-center">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(34,197,94,.15)' }}>
                    <Check size={22} style={{ color: 'rgb(34,197,94)' }} />
                  </div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--t1,#f5f5f4)' }}>Thank you — noted.</p>
                  <p className="text-xs" style={{ color: 'var(--t3,#a8a29e)' }}>This shapes what we build next.</p>
                </div>
              ) : (
                <div className="px-5 pb-5">
                  {PROMPTS.map((p) => (
                    <div key={p.category} style={{ marginBottom: 14 }}>
                      <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--gold-300,#D4A853)' }}>
                        {p.label}
                      </label>
                      <textarea
                        value={answers[p.category] ?? ''}
                        onChange={(e) => setAnswers((a) => ({ ...a, [p.category]: e.target.value }))}
                        placeholder={p.placeholder}
                        rows={2}
                        style={{
                          width: '100%', background: 'var(--surface,#141414)',
                          border: '1px solid var(--line,rgba(255,255,255,.08))', borderRadius: 10,
                          padding: '9px 11px', color: 'var(--t1,#f5f5f4)', fontSize: 13,
                          resize: 'vertical', fontFamily: 'inherit',
                        }}
                      />
                    </div>
                  ))}

                  {error && <p className="text-xs mb-2" style={{ color: '#f87171' }}>{error}</p>}

                  <button
                    onClick={submit}
                    disabled={submitting}
                    style={{
                      width: '100%', padding: 13, borderRadius: 12,
                      background: 'var(--gold-300,#D4A853)', color: '#0a0a0a', border: 'none',
                      fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
                      letterSpacing: '.08em', textTransform: 'uppercase',
                      cursor: submitting ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    {submitting ? <><Loader2 size={14} className="animate-spin" /> Sending…</> : 'Send feedback'}
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>,
          document.body,
        )}
      </AnimatePresence>
    </>
  );
}

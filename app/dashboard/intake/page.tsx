'use client';

/**
 * Client intake questionnaire (Phase 2 coach module).
 * Standard 15-question interview set; answers go to the assigned coach.
 * Lifestyle questions only — no medical document upload (GDPR research pending).
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { Icon } from '@/components/ui';

interface Question {
  id: string;
  position: number;
  prompt: string;
  kind: 'text' | 'boolean' | 'scale';
  required: boolean;
}

const DEFAULT_QUESTIONNAIRE_ID = '11111111-1111-4111-8111-111111111101';

export default function IntakePage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    setUserId(user.id);

    const [cpRes, qRes, respRes] = await Promise.all([
      supabase.from('client_profiles').select('coach_id').eq('user_id', user.id).maybeSingle(),
      supabase.from('questionnaire_questions')
        .select('id, position, prompt, kind, required')
        .eq('questionnaire_id', DEFAULT_QUESTIONNAIRE_ID)
        .order('position'),
      supabase.from('questionnaire_responses')
        .select('answers, submitted_at')
        .eq('questionnaire_id', DEFAULT_QUESTIONNAIRE_ID)
        .eq('client_id', user.id)
        .maybeSingle(),
    ]);

    setCoachId(cpRes.data?.coach_id ?? null);
    setQuestions((qRes.data ?? []) as Question[]);
    if (respRes.data) {
      setAnswers((respRes.data.answers ?? {}) as Record<string, string>);
      setSubmitted(!!respRes.data.submitted_at);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const setAnswer = (qId: string, value: string) =>
    setAnswers((a) => ({ ...a, [qId]: value }));

  const missingRequired = questions.filter((q) => q.required && !(answers[q.id] ?? '').trim());

  const save = async (submit: boolean) => {
    if (!userId || !coachId) return;
    setSaving(true);
    await supabase.from('questionnaire_responses').upsert(
      {
        questionnaire_id: DEFAULT_QUESTIONNAIRE_ID,
        client_id: userId,
        coach_id: coachId,
        answers,
        submitted_at: submit ? new Date().toISOString() : null,
      },
      { onConflict: 'questionnaire_id,client_id' }
    );
    if (submit) setSubmitted(true);
    setSaving(false);
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg,#0a0a0a)', paddingBottom: 40 }}>
      <motion.div
        className="max-w-md mx-auto px-4 pt-3"
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      >
        <div className="row-b" style={{ marginBottom: 14 }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)' }}>
            <Icon name="i-chev-l" size={16} />
          </button>
          <span className="eye-d">Intake Interview</span>
          <div style={{ width: 16 }} />
        </div>

        {loading ? (
          <div className="ds-sub" style={{ textAlign: 'center', padding: 24 }}>Loading…</div>
        ) : !coachId ? (
          <div className="card p-8 text-center">
            <div style={{ fontSize: 13, color: 'var(--t3)' }}>
              The intake interview unlocks once a coach is assigned to you.
            </div>
          </div>
        ) : submitted ? (
          <div className="card p-8 text-center">
            <Icon name="i-check" size={28} style={{ color: 'var(--ok,#65D387)', margin: '0 auto 10px' }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)', marginBottom: 6 }}>
              Sent to your coach
            </div>
            <div className="ds-sub">
              Your answers help build your plan. You can review them together at your next session.
            </div>
          </div>
        ) : (
          <>
            <div className="ds-sub" style={{ marginBottom: 14, lineHeight: 1.5 }}>
              These answers go directly to your coach and shape your plan.
              Take your time — honest beats perfect.
            </div>

            {questions.map((q, i) => (
              <div key={q.id} className="card" style={{ padding: 14, marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', marginBottom: 8, lineHeight: 1.45 }}>
                  {i + 1}. {q.prompt}
                  {q.required && <span style={{ color: 'var(--gold-300,#D4A853)' }}> *</span>}
                </div>

                {q.kind === 'boolean' ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['Yes', 'No'].map((opt) => (
                      <button key={opt}
                        onClick={() => setAnswer(q.id, opt)}
                        style={{
                          flex: 1, padding: '8px 0', borderRadius: 10,
                          border: '1px solid', cursor: 'pointer', fontSize: 12,
                          borderColor: answers[q.id] === opt ? 'var(--gold-300,#D4A853)' : 'var(--line)',
                          background: answers[q.id] === opt ? 'rgba(212,168,83,.12)' : 'transparent',
                          color: answers[q.id] === opt ? 'var(--gold-300,#D4A853)' : 'var(--t2)',
                        }}>
                        {opt}
                      </button>
                    ))}
                  </div>
                ) : q.kind === 'scale' ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n}
                        onClick={() => setAnswer(q.id, String(n))}
                        style={{
                          flex: 1, padding: '8px 0', borderRadius: 10,
                          border: '1px solid', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-mono)',
                          borderColor: answers[q.id] === String(n) ? 'var(--gold-300,#D4A853)' : 'var(--line)',
                          background: answers[q.id] === String(n) ? 'rgba(212,168,83,.12)' : 'transparent',
                          color: answers[q.id] === String(n) ? 'var(--gold-300,#D4A853)' : 'var(--t2)',
                        }}>
                        {n}
                      </button>
                    ))}
                  </div>
                ) : (
                  <textarea
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                    onBlur={() => save(false)}
                    rows={2}
                    placeholder="Your answer…"
                    style={{
                      width: '100%', background: 'var(--surface,#141414)',
                      border: '1px solid var(--line)', borderRadius: 10,
                      padding: '8px 10px', color: 'var(--t1)', fontSize: 12,
                      resize: 'vertical', fontFamily: 'inherit',
                    }}
                  />
                )}
              </div>
            ))}

            <button
              onClick={() => save(true)}
              disabled={saving || missingRequired.length > 0}
              style={{
                width: '100%', padding: 14, borderRadius: 12, border: 'none',
                background: missingRequired.length > 0 ? 'rgba(255,255,255,.06)' : 'var(--gold-300,#D4A853)',
                color: missingRequired.length > 0 ? 'var(--t4)' : '#0a0a0a',
                fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
                letterSpacing: '.08em', textTransform: 'uppercase',
                cursor: missingRequired.length > 0 ? 'default' : 'pointer',
              }}
            >
              {saving ? 'Sending…'
                : missingRequired.length > 0 ? `${missingRequired.length} required left`
                : 'Send to my coach'}
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}

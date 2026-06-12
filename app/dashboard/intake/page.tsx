'use client';

/**
 * Intake — a 12-step conversation, not a form.
 * One question per screen, autosaved as you go, with a review pass and a
 * quarterly refresh ("things change — tell me what's different").
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
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
const GOLD = 'var(--gold-300,#D4A853)';

const ENERGY_LABELS = ['Running on fumes', 'Low most days', 'Up and down', 'Mostly good', 'Firing on all cylinders'];

type Stage = 'intro' | 'steps' | 'review' | 'done';

export default function IntakeWizard() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [coachName, setCoachName] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<Stage>('intro');
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [previouslySubmitted, setPreviouslySubmitted] = useState<string | null>(null);
  const [listening, setListening] = useState(false);

  // Answer by voice: browser speech-to-text appends to the current answer.
  // (DeepSeek has no audio API — STT is native, the polish is in the questions.)
  const startVoice = (questionId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR || listening) return;
    const rec = new SR();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    setListening(true);
    try { rec.start(); } catch { setListening(false); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (event: any) => {
      const transcript = String(event.results[0][0].transcript ?? '').trim();
      if (transcript) {
        setAnswers((a) => ({
          ...a,
          [questionId]: a[questionId]?.trim() ? `${a[questionId].trim()} ${transcript}` : transcript,
        }));
      }
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
  };

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

    const cId = cpRes.data?.coach_id ?? null;
    setCoachId(cId);
    if (cId) {
      const { data: coach } = await supabase.from('profiles').select('full_name').eq('id', cId).maybeSingle();
      setCoachName(coach?.full_name?.split(' ')[0] ?? null);
    }
    setQuestions((qRes.data ?? []) as Question[]);
    if (respRes.data) {
      setAnswers((respRes.data.answers ?? {}) as Record<string, string>);
      setPreviouslySubmitted(respRes.data.submitted_at);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const persist = useCallback(async (submit: boolean, current = answers) => {
    if (!userId || !coachId) return;
    setSaving(true);
    await supabase.from('questionnaire_responses').upsert(
      {
        questionnaire_id: DEFAULT_QUESTIONNAIRE_ID,
        client_id: userId,
        coach_id: coachId,
        answers: current,
        submitted_at: submit ? new Date().toISOString() : previouslySubmitted,
      },
      { onConflict: 'questionnaire_id,client_id' }
    );
    setSaving(false);
  }, [userId, coachId, answers, previouslySubmitted]);

  const q = questions[step];
  const answered = (id: string) => (answers[id] ?? '').trim().length > 0;
  const canAdvance = q ? (!q.required || answered(q.id)) : false;
  const missingRequired = questions.filter((x) => x.required && !answered(x.id));

  const go = (dir: 1 | -1) => {
    setDirection(dir);
    const next = step + dir;
    if (next < 0) { setStage('intro'); return; }
    if (next >= questions.length) { persist(false); setStage('review'); return; }
    persist(false);
    setStep(next);
  };

  const submit = async () => {
    await persist(true);
    setStage('done');
  };

  // ── Shared input renderer ──────────────────────────────────────────────
  const renderInput = (question: Question, autoFocus = false) => {
    if (question.kind === 'scale') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3, 4, 5].map((n) => {
            const active = answers[question.id] === String(n);
            return (
              <motion.button
                key={n}
                whileTap={{ scale: 0.97 }}
                onClick={() => setAnswers((a) => ({ ...a, [question.id]: String(n) }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '13px 16px', borderRadius: 14, cursor: 'pointer', textAlign: 'left',
                  border: `1px solid ${active ? GOLD : 'var(--line)'}`,
                  background: active ? 'rgba(212,168,83,.1)' : 'rgba(255,255,255,.03)',
                  transition: 'border-color .15s, background .15s',
                }}
              >
                <span style={{
                  width: 26, height: 26, borderRadius: 13, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
                  background: active ? GOLD : 'rgba(255,255,255,.06)',
                  color: active ? '#0a0a0a' : 'var(--t3)',
                }}>{n}</span>
                <span style={{ fontSize: 13, color: active ? 'var(--t1)' : 'var(--t2)' }}>
                  {ENERGY_LABELS[n - 1]}
                </span>
              </motion.button>
            );
          })}
        </div>
      );
    }
    if (question.kind === 'boolean') {
      return (
        <div style={{ display: 'flex', gap: 10 }}>
          {['Yes', 'No'].map((opt) => {
            const active = answers[question.id] === opt;
            return (
              <motion.button key={opt} whileTap={{ scale: 0.96 }}
                onClick={() => setAnswers((a) => ({ ...a, [question.id]: opt }))}
                style={{
                  flex: 1, padding: '14px 0', borderRadius: 14, cursor: 'pointer', fontSize: 14,
                  border: `1px solid ${active ? GOLD : 'var(--line)'}`,
                  background: active ? 'rgba(212,168,83,.1)' : 'rgba(255,255,255,.03)',
                  color: active ? GOLD : 'var(--t2)',
                }}>
                {opt}
              </motion.button>
            );
          })}
        </div>
      );
    }
    return (
      <div>
        <textarea
          value={answers[question.id] ?? ''}
          onChange={(e) => setAnswers((a) => ({ ...a, [question.id]: e.target.value }))}
          autoFocus={autoFocus}
          rows={4}
          placeholder="Take your time — plain words are perfect."
          style={{
            width: '100%', background: 'rgba(255,255,255,.03)',
            border: '1px solid var(--line)', borderRadius: 14,
            padding: '14px 16px', color: 'var(--t1)', fontSize: 14, lineHeight: 1.6,
            resize: 'vertical', fontFamily: 'inherit', outline: 'none',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(212,168,83,.4)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--line)'; }}
        />
        <button
          onClick={() => startVoice(question.id)}
          style={{
            marginTop: 8, display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer', padding: '4px 2px',
            color: listening ? 'rgb(248,113,113)' : 'var(--t4)',
            fontSize: 11, fontFamily: 'var(--font-mono)',
          }}
        >
          <Icon name="i-mic" size={13} />
          {listening ? 'Listening… speak naturally' : 'Answer by voice'}
        </button>
      </div>
    );
  };

  // ── Screens ────────────────────────────────────────────────────────────
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center ds-sub" style={{ background: 'var(--bg,#0a0a0a)' }}>Loading…</div>;
  }

  if (!coachId) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--bg,#0a0a0a)' }}>
        <div className="card p-8 text-center ds-sub" style={{ maxWidth: 340 }}>
          This conversation unlocks once a coach takes you on.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg,#0a0a0a)', display: 'flex', flexDirection: 'column' }}>
      <div className="max-w-md lg:max-w-lg mx-auto px-5 pt-4 w-full" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

        {/* Top bar: exit + progress */}
        <div className="row-b" style={{ marginBottom: 10 }}>
          <button onClick={() => { persist(false); router.push('/dashboard'); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4)' }}>
            <Icon name="i-x" size={15} />
          </button>
          {stage === 'steps' && (
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--t4)' }}>
              {step + 1} / {questions.length}{saving ? ' · saving…' : ''}
            </span>
          )}
          <div style={{ width: 15 }} />
        </div>

        {/* Progress bar */}
        {stage === 'steps' && (
          <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,.06)', marginBottom: 28, overflow: 'hidden' }}>
            <motion.div
              animate={{ width: `${((step + 1) / questions.length) * 100}%` }}
              transition={{ type: 'spring', stiffness: 200, damping: 26 }}
              style={{ height: '100%', background: GOLD, borderRadius: 2 }}
            />
          </div>
        )}

        <AnimatePresence mode="wait" custom={direction}>
          {/* ── Intro ── */}
          {stage === 'intro' && (
            <motion.div key="intro"
              initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingBottom: 80 }}
            >
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: GOLD, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 14 }}>
                {previouslySubmitted ? 'Quarterly check-in' : 'Before we start'}
              </div>
              <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--t1)', lineHeight: 1.25, marginBottom: 14 }}>
                {previouslySubmitted
                  ? 'Things change. Tell me what’s different.'
                  : `Twelve questions.\nThe plan starts with you.`}
              </h1>
              <p style={{ fontSize: 14, color: 'var(--t3)', lineHeight: 1.65, marginBottom: 30, whiteSpace: 'pre-line' }}>
                {previouslySubmitted
                  ? `Your earlier answers are below — update anything that moved.\n${coachName ?? 'Your coach'} reads every word.`
                  : `No right answers, no judgement — honest beats impressive.\n${coachName ?? 'Your coach'} reads every word, and it shapes everything that follows.\n\nAbout 5 minutes. Your progress saves as you go.`}
              </p>
              <motion.button whileTap={{ scale: 0.97 }}
                onClick={() => { setStage('steps'); setStep(0); setDirection(1); }}
                style={{
                  padding: '15px 0', borderRadius: 14, border: 'none', cursor: 'pointer',
                  background: GOLD, color: '#0a0a0a', fontSize: 13,
                  fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
                }}>
                {previouslySubmitted ? 'Review my answers' : 'Let’s begin'}
              </motion.button>
            </motion.div>
          )}

          {/* ── Question steps ── */}
          {stage === 'steps' && q && (
            <motion.div
              key={q.id}
              custom={direction}
              initial={{ opacity: 0, x: direction * 36 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -36 }}
              transition={{ type: 'spring', stiffness: 340, damping: 32 }}
              style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
            >
              <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.015em', color: 'var(--t1)', lineHeight: 1.35, marginBottom: 6 }}>
                {q.prompt}
              </h2>
              <div className="ds-sub" style={{ fontSize: 10, marginBottom: 22 }}>
                {q.required ? ' ' : 'Optional — skip if nothing comes to mind.'}
              </div>

              {renderInput(q, true)}

              {/* Nav */}
              <div style={{ display: 'flex', gap: 10, marginTop: 24, paddingBottom: 28 }}>
                <button onClick={() => go(-1)}
                  style={{
                    width: 52, borderRadius: 14, border: '1px solid var(--line)', background: 'transparent',
                    color: 'var(--t3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  <Icon name="i-chev-l" size={15} />
                </button>
                <motion.button whileTap={{ scale: 0.97 }}
                  onClick={() => canAdvance && go(1)}
                  disabled={!canAdvance}
                  style={{
                    flex: 1, padding: '14px 0', borderRadius: 14, border: 'none',
                    cursor: canAdvance ? 'pointer' : 'default',
                    background: canAdvance ? GOLD : 'rgba(255,255,255,.05)',
                    color: canAdvance ? '#0a0a0a' : 'var(--t4)',
                    fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700,
                    letterSpacing: '.08em', textTransform: 'uppercase',
                    transition: 'background .2s, color .2s',
                  }}>
                  {step === questions.length - 1 ? 'Review' : 'Next'}
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ── Review ── */}
          {stage === 'review' && (
            <motion.div key="review"
              initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              style={{ paddingBottom: 32 }}
            >
              <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>One last look</h2>
              <p className="ds-sub" style={{ marginBottom: 18 }}>Tap anything to change it.</p>
              {questions.map((question, i) => (
                <button key={question.id}
                  onClick={() => { setStage('steps'); setStep(i); setDirection(1); }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                    background: 'rgba(255,255,255,.03)', border: '1px solid var(--line)',
                    borderRadius: 12, padding: '11px 14px', marginBottom: 8,
                  }}>
                  <div style={{ fontSize: 10, color: 'var(--t4)', marginBottom: 3, lineHeight: 1.4 }}>{question.prompt}</div>
                  <div style={{ fontSize: 12.5, color: answered(question.id) ? 'var(--t1)' : 'rgba(239,68,68,.8)', lineHeight: 1.5 }}>
                    {question.kind === 'scale' && answers[question.id]
                      ? `${answers[question.id]} — ${ENERGY_LABELS[Number(answers[question.id]) - 1]}`
                      : answers[question.id]?.trim() || (question.required ? 'Still needs an answer' : '—')}
                  </div>
                </button>
              ))}
              <motion.button whileTap={{ scale: 0.97 }}
                onClick={submit}
                disabled={missingRequired.length > 0 || saving}
                style={{
                  width: '100%', padding: '15px 0', borderRadius: 14, border: 'none', marginTop: 10,
                  cursor: missingRequired.length > 0 ? 'default' : 'pointer',
                  background: missingRequired.length > 0 ? 'rgba(255,255,255,.05)' : GOLD,
                  color: missingRequired.length > 0 ? 'var(--t4)' : '#0a0a0a',
                  fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700,
                  letterSpacing: '.08em', textTransform: 'uppercase',
                }}>
                {saving ? 'Sending…'
                  : missingRequired.length > 0 ? `${missingRequired.length} answer${missingRequired.length > 1 ? 's' : ''} missing`
                  : `Send to ${coachName ?? 'my coach'}`}
              </motion.button>
            </motion.div>
          )}

          {/* ── Done ── */}
          {stage === 'done' && (
            <motion.div key="done"
              initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', paddingBottom: 80 }}
            >
              <motion.div
                initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.15 }}
                style={{
                  width: 72, height: 72, borderRadius: 36, marginBottom: 22,
                  background: 'rgba(212,168,83,.12)', border: '1px solid rgba(212,168,83,.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                <Icon name="i-check" size={30} style={{ color: GOLD }} />
              </motion.div>
              <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--t1)', marginBottom: 10 }}>
                {coachName ? `${coachName} has it` : 'Your coach has it'}
              </h2>
              <p style={{ fontSize: 13.5, color: 'var(--t3)', lineHeight: 1.65, maxWidth: 300, marginBottom: 28 }}>
                Your answers shape the plan from day one. You can update them
                any time — and we&rsquo;ll check in again each season.
              </p>
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => router.push('/dashboard')}
                style={{
                  padding: '13px 36px', borderRadius: 14, border: 'none', cursor: 'pointer',
                  background: GOLD, color: '#0a0a0a', fontSize: 12,
                  fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
                }}>
                Back to today
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

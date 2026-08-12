'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { Lock } from 'lucide-react';
import { Icon } from '@/components/ui';

/**
 * Coach custom questionnaire builder (Daily Nutrafit — Michael: "I have a
 * 15-question set, but I'd add 5-10 of my own per practice"). Coaches create
 * their own intake questionnaires on top of the global default. Writes go
 * straight through the browser client; RLS (q_coach_all / qq_coach_all in
 * migration 0027) pins coach_id = auth.uid().
 */

type Kind = 'text' | 'boolean' | 'scale';
interface DraftQ { prompt: string; kind: Kind; required: boolean; }
interface QSummary { id: string; title: string; is_default: boolean; count: number; }

const KIND_LABEL: Record<Kind, string> = { text: 'Free text', boolean: 'Yes / No', scale: 'Scale 1–5' };

export default function QuestionnaireBuilderPage() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [coachId, setCoachId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [existing, setExisting] = useState<QSummary[]>([]);

  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState<DraftQ[]>([{ prompt: '', kind: 'text', required: false }]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (!['coach', 'admin', 'super_admin'].includes(prof?.role ?? '')) { setAuthError(true); setLoading(false); return; }
    setCoachId(user.id);

    // Coach's own + default questionnaires, with question counts.
    const { data: qs } = await supabase
      .from('questionnaires')
      .select('id, title, is_default, questionnaire_questions(count)')
      .or(`coach_id.eq.${user.id},is_default.eq.true`)
      .order('is_default', { ascending: false });
    setExisting((qs ?? []).map((q) => {
      const row = q as unknown as { id: string; title: string; is_default: boolean; questionnaire_questions: { count: number }[] };
      return { id: row.id, title: row.title, is_default: row.is_default, count: row.questionnaire_questions?.[0]?.count ?? 0 };
    }));
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const setQ = (i: number, patch: Partial<DraftQ>) =>
    setQuestions((qq) => qq.map((q, idx) => idx === i ? { ...q, ...patch } : q));
  const addQ = () => setQuestions((qq) => [...qq, { prompt: '', kind: 'text', required: false }]);
  const removeQ = (i: number) => setQuestions((qq) => qq.filter((_, idx) => idx !== i));

  async function save() {
    if (!coachId) return;
    const clean = questions.filter((q) => q.prompt.trim());
    if (!title.trim() || clean.length === 0) return;
    setSaving(true);
    const { data: created } = await supabase
      .from('questionnaires')
      .insert({ coach_id: coachId, title: title.trim(), is_default: false })
      .select('id').maybeSingle();
    if (created?.id) {
      await supabase.from('questionnaire_questions').insert(
        clean.map((q, position) => ({
          questionnaire_id: created.id, position,
          prompt: q.prompt.trim(), kind: q.kind, required: q.required,
        })),
      );
      setSaved(true);
      setTitle(''); setQuestions([{ prompt: '', kind: 'text', required: false }]);
      setTimeout(() => setSaved(false), 2000);
      load();
    }
    setSaving(false);
  }

  if (loading) {
    return <div data-coach-mobile-workspace className="min-h-screen min-w-0 flex items-center justify-center" style={{ background: 'var(--canvas)' }}><span className="eye-d">Loading…</span></div>;
  }
  if (authError) {
    return (
      <div data-coach-mobile-workspace className="min-h-screen min-w-0 flex items-center justify-center px-4" style={{ background: 'var(--canvas)' }}>
        <div className="card" style={{ padding: 24, textAlign: 'center' }}><Lock size={28} style={{ color: 'var(--action-primary)', margin: '0 auto 8px', display: 'block' }} aria-hidden /><div style={{ fontSize: 14, color: 'var(--content-secondary)' }}>Coach access required</div></div>
      </div>
    );
  }

  const input: React.CSSProperties = {
    background: 'var(--surface-2)', border: '1px solid var(--border-default)', borderRadius: 8,
    padding: '8px 10px', color: 'var(--content-primary)', fontSize: 16, fontFamily: 'inherit', minHeight: 44,
  };

  return (
    <div data-coach-mobile-workspace className="min-h-screen min-w-0" style={{ background: 'var(--canvas)', paddingBottom: 40 }}>
      <motion.div className="max-w-md lg:max-w-2xl mx-auto min-w-0 px-4 pt-3" initial={reducedMotion ? false : { opacity: 0, y: 10 }} animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}>
        <div className="row-b" style={{ marginBottom: 16 }}>
          <button aria-label="Go back" onClick={() => router.back()} className="min-h-11 min-w-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--content-secondary)' }}><Icon name="i-chev-l" size={16} /></button>
          <span className="eye-d">Intake Questionnaires</span>
          <div style={{ width: 16 }} />
        </div>

        {/* Existing sets */}
        <div className="eye" style={{ marginBottom: 8 }}>YOUR SETS</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
          {existing.map((q) => (
            <div key={q.id} className="card row-b" style={{ padding: '10px 12px' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--content-primary)' }}>{q.title}</div>
                <div className="ds-sub">{q.count} questions{q.is_default ? ' · default' : ''}</div>
              </div>
              {q.is_default && <span className="ds-sub" style={{ color: 'var(--action-primary)' }}>standard</span>}
            </div>
          ))}
          {existing.length === 0 && <div className="card ds-sub" style={{ padding: 16, textAlign: 'center' }}>No sets yet</div>}
        </div>

        {/* Builder */}
        <div className="eye" style={{ marginBottom: 8 }}>NEW QUESTIONNAIRE</div>
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <input className="text-base" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title — e.g. My clinical intake" style={{ ...input, width: '100%', marginBottom: 12 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {questions.map((q, i) => (
              <div key={i} style={{ borderTop: i ? '1px solid var(--border-default)' : 'none', paddingTop: i ? 10 : 0 }}>
                <div className="row-b" style={{ marginBottom: 6, gap: 8 }}>
                  <input className="text-base" value={q.prompt} onChange={(e) => setQ(i, { prompt: e.target.value })} placeholder={`Question ${i + 1}`} style={{ ...input, flex: 1 }} />
                  <button aria-label="Remove question" onClick={() => removeQ(i)} title="Remove" className="min-h-11 min-w-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--content-muted)' }}><Icon name="i-x" size={14} /></button>
                </div>
                <div className="row-i" style={{ gap: 8 }}>
                  <select className="text-base" value={q.kind} onChange={(e) => setQ(i, { kind: e.target.value as Kind })} style={{ ...input }}>
                    {(['text', 'boolean', 'scale'] as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                  </select>
                  <label className="row-i" style={{ gap: 4, fontSize: 12, color: 'var(--content-secondary)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={q.required} onChange={(e) => setQ(i, { required: e.target.checked })} /> required
                  </label>
                </div>
              </div>
            ))}
          </div>
          <button onClick={addQ} className="row-i min-h-11 px-3 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]" style={{ gap: 5, marginTop: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--action-primary)', fontFamily: 'var(--font-mono)' }}>
            <Icon name="i-plus" size={12} style={{ color: 'var(--action-primary)' }} /> add question
          </button>
        </div>

        <button onClick={save} disabled={saving || !title.trim()} className="min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]" style={{
          width: '100%', padding: 14, borderRadius: 12, border: 'none',
          background: saved ? 'var(--status-success-surface)' : 'var(--action-primary)', color: saved ? 'var(--status-success-foreground)' : 'var(--action-on-primary)',
          fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase',
          cursor: saving || !title.trim() ? 'not-allowed' : 'pointer', opacity: title.trim() ? 1 : 0.5,
        }}>
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save questionnaire'}
        </button>
      </motion.div>
    </div>
  );
}

'use client';

/**
 * Coach calendar — Phase 3 coach module (Nutrafit MVP booking item).
 * Weekly availability windows, vacation blocks ("don't book me September"),
 * and the upcoming appointment list with complete/cancel/no-show actions.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { Icon } from '@/components/ui';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Window_ { id: string; day_of_week: number; start_minute: number; end_minute: number; active: boolean }
interface TimeOff { id: string; starts_on: string; ends_on: string; reason: string | null }
interface Appt {
  id: string; client_id: string; starts_at: string; duration_min: number;
  kind: string; status: string; note: string | null; client_name?: string;
}

const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const fromHHMM = (v: string) => { const [h, m] = v.split(':').map(Number); return h * 60 + (m || 0); };

export default function CoachCalendarPage() {
  const router = useRouter();
  const [coachId, setCoachId] = useState<string | null>(null);
  const [windows, setWindows] = useState<Window_[]>([]);
  const [timeOff, setTimeOff] = useState<TimeOff[]>([]);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOff, setNewOff] = useState({ from: '', to: '', reason: '' });
  const [instructions, setInstructions] = useState('');
  const [instrSaved, setInstrSaved] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    const { data: me } = await supabase.from('profiles').select('role, appointment_instructions').eq('id', user.id).maybeSingle();
    if (!me || !['coach', 'admin', 'super_admin'].includes(me.role)) { router.push('/dashboard'); return; }
    setCoachId(user.id);
    setInstructions(me.appointment_instructions ?? '');

    const [availRes, offRes, apptRes] = await Promise.all([
      supabase.from('coach_availability').select('*').eq('coach_id', user.id).order('day_of_week'),
      supabase.from('coach_time_off').select('*').eq('coach_id', user.id).order('starts_on'),
      supabase.from('appointments').select('*').eq('coach_id', user.id)
        .gte('starts_at', new Date().toISOString())
        .order('starts_at').limit(30),
    ]);
    setWindows((availRes.data ?? []) as Window_[]);
    setTimeOff((offRes.data ?? []) as TimeOff[]);

    const rows = (apptRes.data ?? []) as Appt[];
    if (rows.length > 0) {
      const ids = [...new Set(rows.map((a) => a.client_id))];
      const { data: names } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      const nameMap = new Map((names ?? []).map((n) => [n.id, n.full_name]));
      rows.forEach((a) => { a.client_name = nameMap.get(a.client_id) ?? 'Client'; });
    }
    setAppts(rows);
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const saveInstructions = async () => {
    if (!coachId) return;
    await supabase.from('profiles')
      .update({ appointment_instructions: instructions.trim() || null })
      .eq('id', coachId);
    setInstrSaved(true);
    setTimeout(() => setInstrSaved(false), 2000);
  };

  const addWindow = async (day: number) => {
    if (!coachId) return;
    const { data } = await supabase.from('coach_availability')
      .insert({ coach_id: coachId, day_of_week: day, start_minute: 9 * 60, end_minute: 17 * 60 })
      .select('*').maybeSingle();
    if (data) setWindows((w) => [...w, data as Window_]);
  };

  const updateWindow = async (id: string, patch: Partial<Window_>) => {
    setWindows((w) => w.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    await supabase.from('coach_availability').update(patch).eq('id', id);
  };

  const removeWindow = async (id: string) => {
    setWindows((w) => w.filter((x) => x.id !== id));
    await supabase.from('coach_availability').delete().eq('id', id);
  };

  const addTimeOff = async () => {
    if (!coachId || !newOff.from || !newOff.to) return;
    const { data } = await supabase.from('coach_time_off')
      .insert({ coach_id: coachId, starts_on: newOff.from, ends_on: newOff.to, reason: newOff.reason || null })
      .select('*').maybeSingle();
    if (data) { setTimeOff((t) => [...t, data as TimeOff]); setNewOff({ from: '', to: '', reason: '' }); }
  };

  const removeTimeOff = async (id: string) => {
    setTimeOff((t) => t.filter((x) => x.id !== id));
    await supabase.from('coach_time_off').delete().eq('id', id);
  };

  const setApptStatus = async (id: string, status: string) => {
    setAppts((a) => a.map((x) => (x.id === id ? { ...x, status } : x)));
    await supabase.from('appointments').update({
      status,
      ...(status === 'cancelled' ? { cancelled_by: 'coach', cancelled_at: new Date().toISOString() } : {}),
    }).eq('id', id);
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg,#0a0a0a)', paddingBottom: 40 }}>
      <motion.div
        className="max-w-md lg:max-w-3xl mx-auto px-4 pt-3"
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      >
        <div className="row-b" style={{ marginBottom: 14 }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)' }}>
            <Icon name="i-chev-l" size={16} />
          </button>
          <span className="eye-d">Calendar &amp; Availability</span>
          <div style={{ width: 16 }} />
        </div>

        {loading ? (
          <div className="ds-sub" style={{ textAlign: 'center', padding: 24 }}>Loading…</div>
        ) : (
          <>
            {/* ── Upcoming appointments ── */}
            <div className="eye" style={{ marginBottom: 8 }}>UPCOMING ({appts.filter((a) => a.status === 'booked').length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
              {appts.filter((a) => a.status === 'booked').length === 0 && (
                <div className="card ds-sub" style={{ padding: 14, textAlign: 'center', opacity: 0.6 }}>
                  No upcoming appointments
                </div>
              )}
              {appts.filter((a) => a.status === 'booked').map((a) => (
                <div key={a.id} className="card row-b" style={{ padding: '10px 12px' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)' }}>{a.client_name}</div>
                    <div className="ds-sub" style={{ fontSize: 10 }}>
                      {new Date(a.starts_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {' · '}{a.duration_min}min · {a.kind}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setApptStatus(a.id, 'completed')} title="Mark completed"
                      style={{ background: 'none', border: '1px solid rgba(101,211,135,.3)', borderRadius: 8, padding: '4px 8px', color: 'var(--ok,#65D387)', fontSize: 10, cursor: 'pointer' }}>
                      ✓
                    </button>
                    <button onClick={() => setApptStatus(a.id, 'cancelled')} title="Cancel"
                      style={{ background: 'none', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '4px 8px', color: 'rgb(239,68,68)', fontSize: 10, cursor: 'pointer' }}>
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Weekly availability ── */}
            <div className="eye" style={{ marginBottom: 8 }}>WEEKLY AVAILABILITY</div>
            <div className="card" style={{ padding: 12, marginBottom: 18 }}>
              {DAYS.map((label, day) => {
                const dayWindows = windows.filter((w) => w.day_of_week === day);
                return (
                  <div key={day} style={{ marginBottom: 8 }}>
                    <div className="row-b" style={{ marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, color: dayWindows.length ? 'var(--t1)' : 'var(--t4)' }}>
                        {label}
                      </span>
                      <button onClick={() => addWindow(day)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold-300,#D4A853)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
                        + window
                      </button>
                    </div>
                    {dayWindows.map((w) => (
                      <div key={w.id} className="row-i" style={{ gap: 6, marginBottom: 4 }}>
                        <input type="time" value={toHHMM(w.start_minute)}
                          onChange={(e) => updateWindow(w.id, { start_minute: fromHHMM(e.target.value) })}
                          className="input-dark text-xs py-1" style={{ width: 92 }} />
                        <span style={{ color: 'var(--t4)', fontSize: 10 }}>→</span>
                        <input type="time" value={toHHMM(w.end_minute)}
                          onChange={(e) => updateWindow(w.id, { end_minute: fromHHMM(e.target.value) })}
                          className="input-dark text-xs py-1" style={{ width: 92 }} />
                        <button onClick={() => removeWindow(w.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4)', padding: 2 }}>
                          <Icon name="i-x" size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* ── Time off ── */}
            <div className="eye" style={{ marginBottom: 8 }}>TIME OFF / VACATION</div>
            <div className="card" style={{ padding: 12, marginBottom: 18 }}>
              {timeOff.map((t) => (
                <div key={t.id} className="row-b" style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--t2)' }}>
                    {t.starts_on} → {t.ends_on}{t.reason ? ` · ${t.reason}` : ''}
                  </span>
                  <button onClick={() => removeTimeOff(t.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4)' }}>
                    <Icon name="i-x" size={12} />
                  </button>
                </div>
              ))}
              <div className="row-i" style={{ gap: 6, flexWrap: 'wrap' }}>
                <input type="date" value={newOff.from} onChange={(e) => setNewOff((o) => ({ ...o, from: e.target.value }))}
                  className="input-dark text-xs py-1" style={{ width: 130 }} />
                <input type="date" value={newOff.to} onChange={(e) => setNewOff((o) => ({ ...o, to: e.target.value }))}
                  className="input-dark text-xs py-1" style={{ width: 130 }} />
                <input placeholder="reason (optional)" value={newOff.reason} onChange={(e) => setNewOff((o) => ({ ...o, reason: e.target.value }))}
                  className="input-dark text-xs py-1" style={{ flex: 1, minWidth: 100 }} />
                <button onClick={addTimeOff} disabled={!newOff.from || !newOff.to}
                  style={{
                    background: newOff.from && newOff.to ? 'var(--gold-300,#D4A853)' : 'rgba(255,255,255,.06)',
                    color: newOff.from && newOff.to ? '#0a0a0a' : 'var(--t4)',
                    border: 'none', borderRadius: 8, padding: '5px 12px', fontSize: 10,
                    fontFamily: 'var(--font-mono)', fontWeight: 700, cursor: 'pointer',
                  }}>
                  ADD
                </button>
              </div>
            </div>

            {/* ── Pre-appointment instructions (Michael) — shown to clients on booking ── */}
            <div className="eye" style={{ marginBottom: 8 }}>PRE-APPOINTMENT INSTRUCTIONS</div>
            <div className="card" style={{ padding: 12, marginBottom: 18 }}>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. Bring recent blood work. No food or drink (water is fine) for 3h before. Please cancel at least 24h ahead or a fee applies."
                rows={4}
                className="input-dark w-full text-sm"
                style={{ resize: 'vertical', marginBottom: 8 }}
              />
              <div className="row-b">
                <span className="ds-sub" style={{ fontSize: 10 }}>Clients see this on the booking page.</span>
                <button onClick={saveInstructions}
                  style={{ background: instrSaved ? 'rgba(34,197,94,.15)' : 'var(--gold-300,#D4A853)', color: instrSaved ? 'rgb(34,197,94)' : '#0a0a0a', border: 'none', borderRadius: 8, padding: '5px 14px', fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase' }}>
                  {instrSaved ? '✓ Saved' : 'Save'}
                </button>
              </div>
            </div>

            <div className="ds-sub" style={{ fontSize: 10, lineHeight: 1.5 }}>
              Clients book within your windows. Cancellations under 24h are flagged
              automatically so you can apply your late-cancellation policy.
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

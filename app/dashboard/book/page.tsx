'use client';

/**
 * Client booking — Phase 3 coach module.
 * Shows the coach's open slots for the next 14 days (availability windows
 * minus time off minus existing bookings), books in one tap, and enforces
 * the 24h cancellation notice.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { Icon, ConfirmSheet } from '@/components/ui';

const SLOT_MIN = 30;

interface Window_ { day_of_week: number; start_minute: number; end_minute: number; active: boolean }
interface TimeOff { starts_on: string; ends_on: string }
interface Appt { id: string; starts_at: string; duration_min: number; status: string }

/** True when fewer than 24h remain before the appointment. */
function isLateCancellation(startsAt: string): boolean {
  return new Date(startsAt).getTime() - Date.now() < 24 * 60 * 60_000;
}

export default function BookPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [clientId, setClientId] = useState<string | null>(null);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [coachName, setCoachName] = useState<string | null>(null);
  const [coachInstructions, setCoachInstructions] = useState<string | null>(null);
  const [windows, setWindows] = useState<Window_[]>([]);
  const [timeOff, setTimeOff] = useState<TimeOff[]>([]);
  const [booked, setBooked] = useState<Set<string>>(new Set());
  const [mine, setMine] = useState<Appt[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingCancel, setPendingCancel] = useState<Appt | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [bookingSlot, setBookingSlot] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    setClientId(user.id);

    const { data: cp } = await supabase.from('client_profiles')
      .select('coach_id').eq('user_id', user.id).maybeSingle();
    if (!cp?.coach_id) { setLoading(false); return; }
    setCoachId(cp.coach_id);

    const horizon = new Date(); horizon.setDate(horizon.getDate() + 14);
    const [coachRes, availRes, offRes, coachApptsRes, mineRes] = await Promise.all([
      supabase.from('profiles').select('full_name, appointment_instructions').eq('id', cp.coach_id).maybeSingle(),
      supabase.from('coach_availability').select('day_of_week, start_minute, end_minute, active').eq('coach_id', cp.coach_id),
      supabase.from('coach_time_off').select('starts_on, ends_on').eq('coach_id', cp.coach_id),
      supabase.from('appointments').select('starts_at').eq('coach_id', cp.coach_id)
        .eq('status', 'booked').gte('starts_at', new Date().toISOString()).lte('starts_at', horizon.toISOString()),
      supabase.from('appointments').select('id, starts_at, duration_min, status')
        .eq('client_id', user.id).gte('starts_at', new Date().toISOString()).order('starts_at'),
    ]);

    setCoachName(coachRes.data?.full_name ?? null);
    setCoachInstructions(coachRes.data?.appointment_instructions ?? null);
    setWindows(((availRes.data ?? []) as Window_[]).filter((w) => w.active));
    setTimeOff((offRes.data ?? []) as TimeOff[]);
    setBooked(new Set(((coachApptsRes.data ?? []) as Array<{ starts_at: string }>).map((a) => new Date(a.starts_at).toISOString())));
    setMine(((mineRes.data ?? []) as Appt[]).filter((a) => a.status === 'booked'));
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  // Compute open slots for the next 14 days
  const slots = useMemo(() => {
    const out: Array<{ iso: string; label: string; dayLabel: string }> = [];
    const now = new Date();
    for (let d = 0; d < 14; d++) {
      const date = new Date(now); date.setDate(now.getDate() + d); date.setSeconds(0, 0);
      const jsDay = date.getDay();
      const dow = jsDay === 0 ? 6 : jsDay - 1; // Mon=0
      const dateStr = date.toISOString().split('T')[0];
      if (timeOff.some((t) => dateStr >= t.starts_on && dateStr <= t.ends_on)) continue;
      for (const w of windows.filter((x) => x.day_of_week === dow)) {
        for (let m = w.start_minute; m + SLOT_MIN <= w.end_minute; m += SLOT_MIN) {
          const slot = new Date(date); slot.setHours(Math.floor(m / 60), m % 60, 0, 0);
          if (slot.getTime() < now.getTime() + 60 * 60_000) continue; // ≥1h notice
          const iso = slot.toISOString();
          if (booked.has(iso)) continue;
          out.push({
            iso,
            label: slot.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            dayLabel: slot.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }),
          });
        }
      }
    }
    return out.slice(0, 80);
  }, [windows, timeOff, booked]);

  const slotsByDay = useMemo(() => {
    const map = new Map<string, typeof slots>();
    for (const s of slots) {
      if (!map.has(s.dayLabel)) map.set(s.dayLabel, []);
      map.get(s.dayLabel)!.push(s);
    }
    return [...map.entries()];
  }, [slots]);

  const book = async (iso: string) => {
    if (!clientId || !coachId || bookingSlot) return;
    setBookingSlot(iso);
    const { data, error } = await supabase.from('appointments')
      .insert({ coach_id: coachId, client_id: clientId, starts_at: iso, duration_min: SLOT_MIN, status: 'booked' })
      .select('id, starts_at, duration_min, status').maybeSingle();
    if (data && !error) {
      setMine((m) => [...m, data as Appt].sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
      setBooked((b) => new Set([...b, new Date(iso).toISOString()]));
    }
    setBookingSlot(null);
  };

  const doCancel = async (appt: Appt) => {
    const late = isLateCancellation(appt.starts_at);
    setMine((m) => m.filter((x) => x.id !== appt.id));
    await supabase.from('appointments').update({
      status: 'cancelled', cancelled_by: 'client',
      cancelled_at: new Date().toISOString(), late_cancellation: late,
    }).eq('id', appt.id);
  };

  const cancel = async (appt: Appt) => {
    if (isLateCancellation(appt.starts_at)) {
      setPendingCancel(appt);
      return;
    }
    await doCancel(appt);
  };

  const confirmLateCancel = async () => {
    if (!pendingCancel) return;
    setCancelling(true);
    try {
      await doCancel(pendingCancel);
    } finally {
      setCancelling(false);
      setPendingCancel(null);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg,#0a0a0a)', paddingBottom: 40 }}>
      <motion.div
        className="max-w-md lg:max-w-xl mx-auto px-4 pt-3"
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      >
        <div className="row-b" style={{ marginBottom: 14 }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)' }}>
            <Icon name="i-chev-l" size={16} />
          </button>
          <span className="eye-d">Book {coachName ? `with ${coachName.split(' ')[0]}` : 'a session'}</span>
          <div style={{ width: 16 }} />
        </div>

        {loading ? (
          <div className="ds-sub" style={{ textAlign: 'center', padding: 24 }}>Loading…</div>
        ) : !coachId ? (
          <div className="card p-8 text-center ds-sub">Booking unlocks once a coach is assigned to you.</div>
        ) : (
          <>
            {/* My upcoming */}
            {mine.length > 0 && (
              <>
                <div className="eye" style={{ marginBottom: 8 }}>YOUR APPOINTMENTS</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
                  {mine.map((a) => (
                    <motion.div key={a.id} layout className="card row-b" style={{ padding: '10px 12px' }}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                      <span style={{ fontSize: 12, color: 'var(--t1)' }}>
                        {new Date(a.starts_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        <span className="ds-sub"> · {a.duration_min}min</span>
                      </span>
                      <button onClick={() => cancel(a)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
                        cancel
                      </button>
                    </motion.div>
                  ))}
                </div>
              </>
            )}

            {/* Coach's pre-appointment instructions (Michael) */}
            {coachInstructions && (
              <div className="card" style={{ padding: 14, marginBottom: 18, borderColor: 'rgba(212,168,83,.3)', background: 'rgba(212,168,83,.06)' }}>
                <div className="eye" style={{ marginBottom: 6 }}>BEFORE YOUR APPOINTMENT</div>
                <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--t2)', whiteSpace: 'pre-wrap' }}>{coachInstructions}</p>
              </div>
            )}

            {/* Open slots */}
            <div className="eye" style={{ marginBottom: 8 }}>OPEN SLOTS · NEXT 14 DAYS</div>
            {slotsByDay.length === 0 ? (
              <div className="card p-8 text-center ds-sub">
                No open slots right now — message your coach to arrange a time.
              </div>
            ) : (
              slotsByDay.map(([day, daySlots]) => (
                <div key={day} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--t3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    {day}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {daySlots.map((s) => (
                      <motion.button
                        key={s.iso}
                        whileTap={{ scale: 0.94 }}
                        onClick={() => book(s.iso)}
                        disabled={bookingSlot !== null}
                        style={{
                          padding: '7px 12px', borderRadius: 10, cursor: 'pointer',
                          border: '1px solid var(--line)', background: 'rgba(255,255,255,.04)',
                          color: 'var(--t1)', fontSize: 12, fontFamily: 'var(--font-mono)',
                          opacity: bookingSlot && bookingSlot !== s.iso ? 0.4 : 1,
                        }}
                      >
                        {bookingSlot === s.iso ? '…' : s.label}
                      </motion.button>
                    ))}
                  </div>
                </div>
              ))
            )}

            <div className="ds-sub" style={{ fontSize: 10, marginTop: 8, lineHeight: 1.5 }}>
              Cancellations less than 24 hours before the session may be charged,
              per your coach&apos;s policy.
            </div>
          </>
        )}
      </motion.div>

      <ConfirmSheet
        open={pendingCancel !== null}
        title={t('confirm.late_cancel_title')}
        message={t('confirm.late_cancel_msg')}
        confirmLabel={t('confirm.cancel_anyway')}
        cancelLabel={t('confirm.keep_booking')}
        danger
        loading={cancelling}
        onConfirm={confirmLateCancel}
        onCancel={() => setPendingCancel(null)}
      />
    </div>
  );
}

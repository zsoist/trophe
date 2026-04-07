'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Calendar,
  TrendingUp,
  Flame,
  Trophy,
  Plus,
  Send,
  Pause,
  Play,
  ChevronRight,
  X,
  FileText,
} from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import ActivityTimeline from '@/components/ActivityTimeline';
import ComplianceTrend from '@/components/ComplianceTrend';
import type {
  Profile,
  ClientProfile,
  ClientHabit,
  HabitCheckin,
  Habit,
  FoodLogEntry,
  Measurement,
  CoachNote,
  SessionType,
  Mood,
} from '@/lib/types';

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

const moodEmoji: Record<Mood, string> = {
  great: '🌟',
  good: '😊',
  okay: '😐',
  tough: '😓',
  struggled: '😣',
};

const sessionLabels: Record<SessionType, string> = {
  check_in: 'Check-in',
  progression: 'Progression',
  concern: 'Concern',
  general: 'General',
};

const COACHING_TEMPLATES: { label: string; type: SessionType; text: string }[] = [
  {
    label: 'Initial Assessment',
    type: 'general',
    text: 'Client goals: ___ | Current habits: ___ | Main challenges: ___ | First habit recommendation: ___',
  },
  {
    label: 'Weekly Check-in',
    type: 'check_in',
    text: 'Adherence this week: ___/7 | Energy: ___/5 | Sleep: ___/5 | Challenges: ___ | Adjustments: ___',
  },
  {
    label: 'Habit Progression',
    type: 'progression',
    text: 'Completed habit: ___ | Days: ___/14 | Key learnings: ___ | Next habit: ___ | Rationale: ___',
  },
  {
    label: 'Concern/Flag',
    type: 'concern',
    text: 'Issue: ___ | Observed pattern: ___ | Recommended action: ___ | Follow-up date: ___',
  },
];

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ═══════════════════════════════════════════════
// Streak Calendar (14 days)
// ═══════════════════════════════════════════════

function StreakCalendar({ checkins, startDate }: { checkins: HabitCheckin[]; startDate?: string }) {
  const days: { date: string; status: 'completed' | 'missed' | 'future' }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const checkinDates = new Set(
    checkins.filter((c) => c.completed).map((c) => c.checked_date)
  );

  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    if (d > today) {
      days.push({ date: dateStr, status: 'future' });
    } else if (checkinDates.has(dateStr)) {
      days.push({ date: dateStr, status: 'completed' });
    } else {
      // Only mark as missed if after habit started
      const started = startDate ? new Date(startDate) : null;
      if (started && d >= started) {
        days.push({ date: dateStr, status: 'missed' });
      } else {
        days.push({ date: dateStr, status: 'future' });
      }
    }
  }

  return (
    <div className="grid grid-cols-7 gap-1.5">
      {days.map((day) => (
        <div
          key={day.date}
          className={`aspect-square rounded-lg flex items-center justify-center text-[10px] font-medium ${
            day.status === 'completed'
              ? 'bg-[#D4A853]/20 text-[#D4A853] border border-[#D4A853]/30'
              : day.status === 'missed'
              ? 'bg-red-500/10 text-red-400 border border-red-500/20'
              : 'bg-white/[0.03] text-stone-600 border border-white/5'
          }`}
          title={`${day.date}: ${day.status}`}
        >
          {new Date(day.date).getDate()}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════
// Weight Chart (SVG)
// ═══════════════════════════════════════════════

function WeightChart({ measurements }: { measurements: Measurement[] }) {
  if (measurements.length < 2) {
    return <p className="text-stone-600 text-sm text-center py-6">Need at least 2 measurements</p>;
  }

  const weights = measurements
    .filter((m) => m.weight_kg !== null)
    .sort((a, b) => new Date(a.measured_date).getTime() - new Date(b.measured_date).getTime());

  if (weights.length < 2) return null;

  const values = weights.map((w) => w.weight_kg!);
  const min = Math.min(...values) - 1;
  const max = Math.max(...values) + 1;
  const range = max - min || 1;

  const w = 360;
  const h = 120;
  const pad = 10;
  const chartW = w - pad * 2;
  const chartH = h - pad * 2;

  const points = weights.map((m, i) => {
    const x = pad + (i / (weights.length - 1)) * chartW;
    const y = pad + chartH - ((m.weight_kg! - min) / range) * chartH;
    return `${x},${y}`;
  });

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
        <line
          key={pct}
          x1={pad}
          y1={pad + chartH * (1 - pct)}
          x2={w - pad}
          y2={pad + chartH * (1 - pct)}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="1"
        />
      ))}
      {/* Line */}
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="#D4A853"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Dots */}
      {points.map((p, i) => {
        const [cx, cy] = p.split(',').map(Number);
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r="3"
            fill="#D4A853"
            stroke="#0a0a0a"
            strokeWidth="1.5"
          />
        );
      })}
      {/* Labels */}
      <text x={pad} y={h - 2} fill="#78716c" fontSize="8">
        {formatDate(weights[0].measured_date)}
      </text>
      <text x={w - pad} y={h - 2} fill="#78716c" fontSize="8" textAnchor="end">
        {formatDate(weights[weights.length - 1].measured_date)}
      </text>
      <text x={pad} y={pad - 2} fill="#78716c" fontSize="8">
        {max.toFixed(1)}kg
      </text>
      <text x={pad} y={h - pad + 10} fill="#78716c" fontSize="8">
        {min.toFixed(1)}kg
      </text>
    </svg>
  );
}

// ═══════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════

export default function ClientDetailPage() {
  const params = useParams();
  const clientId = params.id as string;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [activeHabit, setActiveHabit] = useState<(ClientHabit & { habit?: Habit }) | null>(null);
  const [pastHabits, setPastHabits] = useState<(ClientHabit & { habit?: Habit })[]>([]);
  const [checkins, setCheckins] = useState<HabitCheckin[]>([]);
  const [foodLog, setFoodLog] = useState<FoodLogEntry[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [notes, setNotes] = useState<CoachNote[]>([]);
  const [loading, setLoading] = useState(true);

  // Note form
  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState<SessionType>('check_in');
  const [savingNote, setSavingNote] = useState(false);

  // Assign habit modal
  const [showAssign, setShowAssign] = useState(false);
  const [habitTemplates, setHabitTemplates] = useState<Habit[]>([]);

  // Auto-progression
  const [suggestedNextHabit, setSuggestedNextHabit] = useState<Habit | null>(null);
  const [assigningNext, setAssigningNext] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const [
        profileRes,
        clientProfileRes,
        habitsRes,
        checkinsRes,
        foodRes,
        measurementsRes,
        notesRes,
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', clientId).maybeSingle(),
        supabase.from('client_profiles').select('*').eq('user_id', clientId).maybeSingle(),
        supabase.from('client_habits').select('*, habit:habits(*)').eq('client_id', clientId).order('created_at', { ascending: false }),
        supabase.from('habit_checkins').select('*').eq('user_id', clientId).order('checked_date', { ascending: false }).limit(30),
        supabase.from('food_log').select('*').eq('user_id', clientId).gte('logged_date', threeDaysAgo).order('logged_date', { ascending: false }),
        supabase.from('measurements').select('*').eq('user_id', clientId).gte('measured_date', thirtyDaysAgo).order('measured_date', { ascending: true }),
        supabase.from('coach_notes').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
      ]);

      setProfile(profileRes.data);
      setClientProfile(clientProfileRes.data);

      const allHabits = habitsRes.data || [];
      setActiveHabit(allHabits.find((h: ClientHabit) => h.status === 'active') || null);
      setPastHabits(allHabits.filter((h: ClientHabit) => h.status !== 'active'));
      setCheckins(checkinsRes.data || []);
      setFoodLog(foodRes.data || []);
      setMeasurements(measurementsRes.data || []);
      setNotes(notesRes.data || []);
    } catch (err) {
      console.error('Error loading client data:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function saveNote() {
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase.from('coach_notes').insert({
        coach_id: user.id,
        client_id: clientId,
        note: newNote.trim(),
        session_type: noteType,
      }).select().single();

      if (data) {
        setNotes([data, ...notes]);
        setNewNote('');
      }
    } catch (err) {
      console.error('Error saving note:', err);
    } finally {
      setSavingNote(false);
    }
  }

  async function loadTemplates() {
    const { data } = await supabase.from('habits').select('*').eq('is_template', true).order('suggested_order');
    setHabitTemplates(data || []);
    setShowAssign(true);
  }

  async function assignHabit(habit: Habit) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Pause current active habit if exists
      if (activeHabit) {
        await supabase.from('client_habits').update({ status: 'paused' }).eq('id', activeHabit.id);
      }

      // Create new client_habit
      const { data } = await supabase.from('client_habits').insert({
        client_id: clientId,
        habit_id: habit.id,
        assigned_by: user.id,
        status: 'active',
        started_at: new Date().toISOString(),
        current_streak: 0,
        best_streak: 0,
        total_completions: 0,
        sequence_number: (pastHabits.length || 0) + 2,
      }).select('*, habit:habits(*)').maybeSingle();

      if (data) {
        setActiveHabit(data);
        setShowAssign(false);
      }
    } catch (err) {
      console.error('Error assigning habit:', err);
    }
  }

  async function progressHabit() {
    if (!activeHabit) return;
    await supabase.from('client_habits').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', activeHabit.id);
    setPastHabits([{ ...activeHabit, status: 'completed' }, ...pastHabits]);
    setActiveHabit(null);
    loadTemplates();
  }

  async function pauseHabit() {
    if (!activeHabit) return;
    await supabase.from('client_habits').update({ status: 'paused' }).eq('id', activeHabit.id);
    setPastHabits([{ ...activeHabit, status: 'paused' }, ...pastHabits]);
    setActiveHabit(null);
  }

  // Group food by date
  const foodByDate: Record<string, FoodLogEntry[]> = {};
  foodLog.forEach((entry) => {
    const key = entry.logged_date;
    if (!foodByDate[key]) foodByDate[key] = [];
    foodByDate[key].push(entry);
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center text-stone-500">
        Loading...
      </div>
    );
  }

  if (!profile || !clientProfile) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center text-stone-500">
        Client not found
      </div>
    );
  }

  const goalLabels: Record<string, string> = {
    fat_loss: 'Fat Loss', muscle_gain: 'Muscle Gain', maintenance: 'Maintenance',
    recomp: 'Recomposition', endurance: 'Endurance', health: 'Health',
  };

  return (
    <div className="min-h-screen bg-stone-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Back link */}
          <Link href="/coach" className="inline-flex items-center gap-1.5 text-stone-500 hover:text-stone-300 text-sm mb-6 transition-colors">
            <ArrowLeft size={14} />
            Back to Clients
          </Link>

          {/* ─── Header ─── */}
          <div className="glass-elevated p-5 sm:p-6 mb-4">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-stone-100">{profile.full_name}</h1>
                <p className="text-stone-500 text-sm mt-0.5">{profile.email}</p>
              </div>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[#D4A853]/10 text-[#D4A853] capitalize">
                {clientProfile.coaching_phase}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <div>
                <div className="text-xs text-stone-500">Goal</div>
                <div className="text-sm font-medium text-stone-200">
                  {clientProfile.goal ? goalLabels[clientProfile.goal] || clientProfile.goal : '---'}
                </div>
              </div>
              <div>
                <div className="text-xs text-stone-500">Calories</div>
                <div className="text-sm font-medium text-stone-200">
                  {clientProfile.target_calories || '---'} kcal
                </div>
              </div>
              <div>
                <div className="text-xs text-stone-500">Protein</div>
                <div className="text-sm font-medium text-stone-200">
                  {clientProfile.target_protein_g || '---'}g
                </div>
              </div>
              <div>
                <div className="text-xs text-stone-500">Weight</div>
                <div className="text-sm font-medium text-stone-200">
                  {clientProfile.weight_kg || '---'} kg
                </div>
              </div>
            </div>
          </div>

          {/* ─── Active Habit ─── */}
          <div className="glass p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-stone-200 flex items-center gap-2">
                <Flame size={16} className="text-[#D4A853]" />
                Active Habit
              </h2>
              <div className="flex gap-1.5">
                {activeHabit && (
                  <>
                    <button onClick={progressHabit} className="text-xs btn-gold !py-1.5 !px-3 flex items-center gap-1">
                      <ChevronRight size={12} /> Progress
                    </button>
                    <button onClick={pauseHabit} className="text-xs btn-ghost !py-1.5 !px-3 flex items-center gap-1">
                      <Pause size={12} /> Pause
                    </button>
                  </>
                )}
                <button onClick={loadTemplates} className="text-xs btn-ghost !py-1.5 !px-3 flex items-center gap-1">
                  <Plus size={12} /> Assign
                </button>
              </div>
            </div>

            {activeHabit?.habit ? (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">{activeHabit.habit.emoji}</span>
                  <div>
                    <div className="font-medium text-stone-100">{activeHabit.habit.name_en}</div>
                    <div className="text-xs text-stone-500">
                      Day {activeHabit.current_streak} of {activeHabit.habit.cycle_days}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 mb-4 text-xs text-stone-400">
                  <span className="flex items-center gap-1"><Flame size={12} className="text-orange-400" /> Streak: {activeHabit.current_streak}</span>
                  <span className="flex items-center gap-1"><Trophy size={12} className="text-[#D4A853]" /> Best: {activeHabit.best_streak}</span>
                  <span className="flex items-center gap-1"><Calendar size={12} /> Total: {activeHabit.total_completions}</span>
                </div>
                {/* Streak Calendar */}
                <StreakCalendar
                  checkins={checkins.filter((c) => c.client_habit_id === activeHabit.id)}
                  startDate={activeHabit.started_at}
                />
              </div>
            ) : (
              <p className="text-stone-600 text-sm text-center py-4">No active habit assigned</p>
            )}
          </div>

          {/* ─── Food Log (last 3 days) ─── */}
          <div className="glass p-5 mb-4">
            <h2 className="font-semibold text-stone-200 mb-4 flex items-center gap-2">
              <Calendar size={16} className="text-[#D4A853]" />
              Recent Food Log
            </h2>
            {Object.keys(foodByDate).length === 0 ? (
              <p className="text-stone-600 text-sm text-center py-4">No food logged recently</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(foodByDate).slice(0, 3).map(([date, entries]) => {
                  const totals = entries.reduce(
                    (acc, e) => ({
                      cal: acc.cal + (e.calories || 0),
                      p: acc.p + (e.protein_g || 0),
                      c: acc.c + (e.carbs_g || 0),
                      f: acc.f + (e.fat_g || 0),
                    }),
                    { cal: 0, p: 0, c: 0, f: 0 }
                  );
                  return (
                    <div key={date}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-medium text-stone-400">{formatDate(date)}</span>
                        <span className="text-xs text-stone-500">
                          {Math.round(totals.cal)} kcal | P:{Math.round(totals.p)}g C:{Math.round(totals.c)}g F:{Math.round(totals.f)}g
                        </span>
                      </div>
                      <div className="space-y-1">
                        {entries.map((entry) => (
                          <div key={entry.id} className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-white/[0.03]">
                            <span className="text-stone-300 truncate">{entry.food_name}</span>
                            <span className="text-stone-500 whitespace-nowrap ml-2">
                              {entry.calories || 0} kcal
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ─── Weight Chart ─── */}
          <div className="glass p-5 mb-4">
            <h2 className="font-semibold text-stone-200 mb-4 flex items-center gap-2">
              <TrendingUp size={16} className="text-[#D4A853]" />
              Weight Trend (30d)
            </h2>
            <WeightChart measurements={measurements} />
          </div>

          {/* ─── Coach Notes ─── */}
          <div className="glass p-5 mb-4">
            <h2 className="font-semibold text-stone-200 mb-4">Coach Notes</h2>

            {/* Add note form */}
            <div className="mb-4">
              {/* Template selector */}
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <FileText size={12} className="text-stone-500" />
                  <span className="text-[10px] font-medium text-stone-500 uppercase tracking-wider">Template</span>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {COACHING_TEMPLATES.map((tmpl) => (
                    <button
                      key={tmpl.label}
                      onClick={() => {
                        setNewNote(tmpl.text);
                        setNoteType(tmpl.type);
                      }}
                      className="text-[11px] px-2.5 py-1.5 rounded-lg border border-white/5 text-stone-400 hover:border-[#D4A853]/30 hover:text-[#D4A853] hover:bg-[#D4A853]/5 transition-all"
                    >
                      {tmpl.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 mb-2">
                {(['check_in', 'progression', 'concern', 'general'] as SessionType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setNoteType(t)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                      noteType === t
                        ? 'border-[#D4A853]/40 bg-[#D4A853]/10 text-[#D4A853]'
                        : 'border-stone-800 text-stone-500 hover:border-stone-700'
                    }`}
                  >
                    {sessionLabels[t]}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Write a coaching note or select a template..."
                  className="input-dark flex-1 min-h-[60px] resize-none text-sm"
                  rows={3}
                />
                <button
                  onClick={saveNote}
                  disabled={savingNote || !newNote.trim()}
                  className="btn-gold self-end !p-3 disabled:opacity-40"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>

            {/* Notes list */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {notes.length === 0 ? (
                <p className="text-stone-600 text-sm text-center py-2">No notes yet</p>
              ) : (
                notes.map((note) => (
                  <div key={note.id} className="p-3 rounded-xl bg-white/[0.03] text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/5 text-stone-400">
                        {note.session_type ? sessionLabels[note.session_type] : 'Note'}
                      </span>
                      <span className="text-[10px] text-stone-600">
                        {formatDate(note.created_at)}
                      </span>
                    </div>
                    <p className="text-stone-300 whitespace-pre-wrap">{note.note}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ─── Activity Timeline ─── */}
          <div className="glass p-5 mb-4">
            <h2 className="font-semibold text-stone-200 mb-4 flex items-center gap-2">
              <Calendar size={16} className="text-[#D4A853]" />
              Activity Timeline
            </h2>
            <ActivityTimeline
              checkins={checkins}
              notes={notes}
              measurements={measurements}
              habits={[...(activeHabit ? [activeHabit] : []), ...pastHabits]}
            />
          </div>

          {/* ─── Past Habits ─── */}
          {pastHabits.length > 0 && (
            <div className="glass p-5 mb-4">
              <h2 className="font-semibold text-stone-200 mb-3">Habit History</h2>
              <div className="space-y-2">
                {pastHabits.map((h) => (
                  <div key={h.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] text-sm">
                    <div className="flex items-center gap-2">
                      <span>{h.habit?.emoji}</span>
                      <span className="text-stone-300">{h.habit?.name_en}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-stone-500">
                        {h.total_completions} days | Best: {h.best_streak}
                      </span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        h.status === 'completed'
                          ? 'bg-green-500/10 text-green-400'
                          : h.status === 'paused'
                          ? 'bg-yellow-500/10 text-yellow-400'
                          : 'bg-stone-800 text-stone-500'
                      }`}>
                        {h.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>

        {/* ─── Assign Habit Modal ─── */}
        {showAssign && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-elevated p-5 w-full max-w-md max-h-[70vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-stone-100">Assign Habit</h3>
                <button onClick={() => setShowAssign(false)} className="text-stone-500 hover:text-stone-300">
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-2">
                {habitTemplates.length === 0 ? (
                  <p className="text-stone-600 text-sm text-center py-4">No habit templates found</p>
                ) : (
                  habitTemplates.map((habit) => (
                    <button
                      key={habit.id}
                      onClick={() => assignHabit(habit)}
                      className="w-full text-left p-3 rounded-xl hover:bg-white/5 transition-colors flex items-center gap-3"
                    >
                      <span className="text-xl">{habit.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-stone-200">{habit.name_en}</div>
                        <div className="text-xs text-stone-500 flex items-center gap-2">
                          <span className="capitalize">{habit.category}</span>
                          <span>-</span>
                          <span>{habit.cycle_days}d cycle</span>
                        </div>
                      </div>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        habit.difficulty === 'beginner'
                          ? 'bg-green-500/10 text-green-400'
                          : habit.difficulty === 'intermediate'
                          ? 'bg-yellow-500/10 text-yellow-400'
                          : 'bg-red-500/10 text-red-400'
                      }`}>
                        {habit.difficulty}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}

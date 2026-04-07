'use client';
import { useRouter } from 'next/navigation';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  Eye,
  StickyNote,
  ArrowUpRight,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Search,
  LayoutGrid,
  Dumbbell,
  Pill,
  UtensilsCrossed,
  Calendar,
} from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type {
  Profile,
  ClientProfile,
  ClientHabit,
  HabitCheckin,
  Habit,
  Mood,
} from '@/lib/types';

// ═══════════════════════════════════════════════
// Coach Navigation
// ═══════════════════════════════════════════════

const coachNav = [
  { label: 'Clients', href: '/coach', icon: Users },
  { label: 'Habits', href: '/coach/habits', icon: Dumbbell },
  { label: 'Protocols', href: '/coach/protocols', icon: Pill },
  { label: 'Foods', href: '/coach/foods', icon: UtensilsCrossed },
];

function CoachNav({ active }: { active: string }) {
  return (
    <nav className="flex gap-1 p-1 rounded-2xl glass mb-8 overflow-x-auto">
      {coachNav.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
              isActive
                ? 'bg-[#D4A853]/15 text-[#D4A853]'
                : 'text-stone-400 hover:text-stone-200 hover:bg-white/5'
            }`}
          >
            <Icon size={16} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export { CoachNav, coachNav };

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

interface ClientCard {
  profile: Profile;
  clientProfile: ClientProfile;
  activeHabit: (ClientHabit & { habit?: Habit }) | null;
  lastCheckin: HabitCheckin | null;
  daysSinceCheckin: number;
  status: 'green' | 'yellow' | 'red';
  moodAvg: number | null;
  readyForProgression: boolean;
}

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

const moodValues: Record<Mood, number> = {
  great: 5,
  good: 4,
  okay: 3,
  tough: 2,
  struggled: 1,
};

function daysBetween(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function getStatus(daysSince: number): 'green' | 'yellow' | 'red' {
  if (daysSince <= 0) return 'green';
  if (daysSince <= 2) return 'yellow';
  return 'red';
}

// ═══════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════

export default function CoachDashboard() {
  const [clients, setClients] = useState<ClientCard[]>([]);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadClients();
  }, []);

  async function loadClients() {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      // Role gate — only coaches can access this page
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (profile?.role === 'client') { window.location.href = '/dashboard'; return; }

      // Fetch all client_profiles assigned to this coach
      const { data: clientProfiles } = await supabase
        .from('client_profiles')
        .select('*')
        .eq('coach_id', user.id);

      if (!clientProfiles || clientProfiles.length === 0) {
        setLoading(false);
        return;
      }

      const userIds = clientProfiles.map((cp: ClientProfile) => cp.user_id);

      // Fetch profiles, active habits, and recent checkins in parallel
      const [profilesRes, habitsRes, checkinsRes] = await Promise.all([
        supabase.from('profiles').select('*').in('id', userIds),
        supabase
          .from('client_habits')
          .select('*, habit:habits(*)')
          .in('client_id', userIds)
          .eq('status', 'active'),
        supabase
          .from('habit_checkins')
          .select('*')
          .in('user_id', userIds)
          .gte('checked_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
          .order('checked_date', { ascending: false }),
      ]);

      const profiles = profilesRes.data || [];
      const habits = habitsRes.data || [];
      const checkins = checkinsRes.data || [];

      const cards: ClientCard[] = clientProfiles.map((cp: ClientProfile) => {
        const profile = profiles.find((p: Profile) => p.id === cp.user_id);
        const activeHabit = habits.find((h: ClientHabit) => h.client_id === cp.user_id) || null;
        const clientCheckins = checkins.filter((c: HabitCheckin) => c.user_id === cp.user_id);
        const lastCheckin = clientCheckins[0] || null;
        const daysSince = lastCheckin ? daysBetween(lastCheckin.checked_date) : 999;

        // Calculate mood average from last 7 days
        const moodsWithValues = clientCheckins
          .filter((c: HabitCheckin) => c.mood)
          .map((c: HabitCheckin) => moodValues[c.mood!]);
        const moodAvg = moodsWithValues.length > 0
          ? moodsWithValues.reduce((a: number, b: number) => a + b, 0) / moodsWithValues.length
          : null;

        // Check if ready for progression
        const readyForProgression = activeHabit
          ? activeHabit.current_streak >= (activeHabit.habit?.cycle_days || 21)
          : false;

        return {
          profile: profile || { id: cp.user_id, full_name: 'Unknown', email: '', role: 'client' as const, avatar_url: null, language: 'en' as const, timezone: 'UTC', created_at: '' },
          clientProfile: cp,
          activeHabit,
          lastCheckin,
          daysSinceCheckin: daysSince,
          status: getStatus(daysSince),
          moodAvg,
          readyForProgression,
        };
      });

      // Sort: red first (at risk), then yellow, then green
      const order = { red: 0, yellow: 1, green: 2 };
      cards.sort((a, b) => order[a.status] - order[b.status]);

      setClients(cards);
    } catch (err) {
      console.error('Error loading clients:', err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = clients.filter((c) =>
    c.profile.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const onTrack = clients.filter((c) => c.status === 'green').length;
  const atRisk = clients.filter((c) => c.status !== 'green').length;

  // ═══ Weekly Summary calculations ═══
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6); // Sunday

  const weekLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  // Total check-ins this week (clients who checked in today = green status)
  const totalCheckins = clients.filter((c) => c.daysSinceCheckin <= 6).length;

  // Average streak progress
  const clientsWithHabits = clients.filter((c) => c.activeHabit?.habit);
  const avgStreakPct = clientsWithHabits.length > 0
    ? Math.round(
        clientsWithHabits.reduce((sum, c) => {
          const streak = c.activeHabit!.current_streak;
          const cycle = c.activeHabit!.habit!.cycle_days || 14;
          return sum + Math.min((streak / cycle) * 100, 100);
        }, 0) / clientsWithHabits.length
      )
    : 0;

  // Clients needing attention
  const needsAttention = clients.filter((c) => c.status === 'red' || c.daysSinceCheckin >= 3);

  return (
    <div className="min-h-screen bg-stone-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <CoachNav active="/coach" />

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-stone-100 mb-1">
              Client Overview
            </h1>
            <p className="text-stone-500 text-sm">
              Monitor progress and manage your coaching roster
            </p>
          </div>

          {/* ═══ Weekly Summary Card ═══ */}
          {!loading && clients.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass gold-border p-5 mb-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
                  <Calendar size={16} className="text-[#D4A853]" />
                  Weekly Summary
                </h2>
                <span className="text-xs text-stone-500">{weekLabel}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <div className="text-center">
                  <div className="text-xl font-bold text-stone-100">{totalCheckins}</div>
                  <div className="text-[10px] text-stone-500 uppercase tracking-wider">Active This Week</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-[#D4A853]">{avgStreakPct}%</div>
                  <div className="text-[10px] text-stone-500 uppercase tracking-wider">Avg. Streak</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-green-400">{clients.filter((c) => c.readyForProgression).length}</div>
                  <div className="text-[10px] text-stone-500 uppercase tracking-wider">Ready to Progress</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-red-400">{needsAttention.length}</div>
                  <div className="text-[10px] text-stone-500 uppercase tracking-wider">Need Attention</div>
                </div>
              </div>
              {needsAttention.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/5">
                  <p className="text-xs text-stone-500 mb-2">Needs attention:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {needsAttention.slice(0, 5).map((c) => (
                      <Link
                        key={c.profile.id}
                        href={`/coach/client/${c.clientProfile.user_id}`}
                        className="text-[11px] px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                      >
                        {c.profile.full_name} ({c.daysSinceCheckin === 999 ? 'never' : `${c.daysSinceCheckin}d`})
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Summary Bar */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="glass p-4 text-center">
              <div className="text-2xl font-bold text-stone-100">{clients.length}</div>
              <div className="text-xs text-stone-500 flex items-center justify-center gap-1">
                <Users size={12} /> Total
              </div>
            </div>
            <div className="glass p-4 text-center">
              <div className="text-2xl font-bold text-green-400">{onTrack}</div>
              <div className="text-xs text-stone-500 flex items-center justify-center gap-1">
                <CheckCircle2 size={12} /> On Track
              </div>
            </div>
            <div className="glass p-4 text-center">
              <div className="text-2xl font-bold text-red-400">{atRisk}</div>
              <div className="text-xs text-stone-500 flex items-center justify-center gap-1">
                <AlertTriangle size={12} /> At Risk
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-6">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500" />
            <input
              type="text"
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-dark pl-10"
            />
          </div>

          {/* Client Cards */}
          {loading ? (
            <div className="text-center py-20 text-stone-500">Loading clients...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <LayoutGrid size={48} className="mx-auto text-stone-700 mb-4" />
              <p className="text-stone-500">
                {clients.length === 0 ? 'No clients assigned yet' : 'No clients match your search'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((client, i) => (
                <motion.div
                  key={client.profile.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass p-4 sm:p-5"
                >
                  <div className="flex items-start gap-3">
                    {/* Status dot */}
                    <div className="pt-1.5">
                      <span className={`status-dot ${client.status}`} />
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-stone-100 truncate">
                          {client.profile.full_name}
                        </h3>
                        {client.readyForProgression && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#D4A853]/15 text-[#D4A853] whitespace-nowrap">
                            Ready for Progression
                          </span>
                        )}
                      </div>

                      {/* Habit info */}
                      {client.activeHabit?.habit ? (
                        <div className="mt-1.5">
                          <div className="flex items-center gap-1.5 text-sm text-stone-400">
                            <span>{client.activeHabit.habit.emoji}</span>
                            <span>{client.activeHabit.habit.name_en}</span>
                          </div>
                          {/* Streak bar */}
                          <div className="mt-2 flex items-center gap-2">
                            <div className="streak-bar flex-1 h-2">
                              <div
                                className="streak-fill h-full"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    (client.activeHabit.current_streak /
                                      (client.activeHabit.habit.cycle_days || 21)) *
                                      100
                                  )}%`,
                                }}
                              />
                            </div>
                            <span className="text-xs text-stone-500 whitespace-nowrap">
                              {client.activeHabit.current_streak}/{client.activeHabit.habit.cycle_days || 21}d
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-stone-600 mt-1">No active habit</p>
                      )}

                      {/* Mood + last activity */}
                      <div className="flex items-center gap-4 mt-2 text-xs text-stone-500">
                        {client.moodAvg !== null && (
                          <span>
                            Mood: {client.moodAvg.toFixed(1)}/5
                          </span>
                        )}
                        <span>
                          {client.daysSinceCheckin === 0
                            ? 'Checked in today'
                            : client.daysSinceCheckin === 999
                            ? 'Never checked in'
                            : `${client.daysSinceCheckin}d ago`}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Link
                        href={`/coach/client/${client.clientProfile.user_id}`}
                        className="p-2 rounded-lg hover:bg-white/5 text-stone-400 hover:text-stone-200 transition-colors"
                        title="View"
                      >
                        <Eye size={16} />
                      </Link>
                      <button
                        className="p-2 rounded-lg hover:bg-white/5 text-stone-400 hover:text-stone-200 transition-colors"
                        title="Add Note"
                      >
                        <StickyNote size={16} />
                      </button>
                      {client.readyForProgression && (
                        <button
                          className="p-2 rounded-lg hover:bg-[#D4A853]/10 text-[#D4A853] transition-colors"
                          title="Progress to next habit"
                        >
                          <ArrowUpRight size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

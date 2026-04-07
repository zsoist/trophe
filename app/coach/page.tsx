'use client';
import { useRouter } from 'next/navigation';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  MoreHorizontal,
  UserPlus,
  Bell,
  BarChart3,
  Clock,
} from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import Avatar from '@/components/Avatar';
import ShortcutsModal from '@/components/ShortcutsModal';
import { CoachSkeleton } from '@/components/Skeleton';
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
  { label: 'Templates', href: '/coach/templates', icon: LayoutGrid },
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
// Filter Types
// ═══════════════════════════════════════════════

type FilterStatus = 'all' | 'on_track' | 'at_risk' | 'inactive';

// ═══════════════════════════════════════════════
// Quick Actions Dropdown
// ═══════════════════════════════════════════════

function QuickActionsDropdown({
  clientId,
  onAddNote,
}: {
  clientId: string;
  onAddNote: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState(false);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg hover:bg-white/5 text-stone-400 hover:text-stone-200 transition-colors"
        title="More actions"
      >
        <MoreHorizontal size={16} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-1 z-50 w-48 rounded-xl border border-white/10 bg-stone-900/95 backdrop-blur-xl shadow-xl overflow-hidden"
          >
            <Link
              href={`/coach/client/${clientId}`}
              className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-stone-300 hover:bg-white/5 hover:text-stone-100 transition-colors"
              onClick={() => setOpen(false)}
            >
              <Eye size={14} className="text-stone-500" />
              View Profile
            </Link>
            <button
              onClick={() => { onAddNote(clientId); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-stone-300 hover:bg-white/5 hover:text-stone-100 transition-colors"
            >
              <StickyNote size={14} className="text-stone-500" />
              Add Note
            </button>
            <Link
              href={`/coach/client/${clientId}?assign=1`}
              className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-stone-300 hover:bg-white/5 hover:text-stone-100 transition-colors"
              onClick={() => setOpen(false)}
            >
              <Dumbbell size={14} className="text-stone-500" />
              Assign Habit
            </Link>
            <button
              onClick={() => {
                setOpen(false);
                setToast(true);
                setTimeout(() => setToast(false), 2000);
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-stone-300 hover:bg-white/5 hover:text-stone-100 transition-colors border-t border-white/5"
            >
              <Bell size={14} className="text-stone-500" />
              Send Reminder
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Coming Soon toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute right-0 top-full mt-1 z-50 px-3 py-2 rounded-lg bg-[#D4A853]/15 border border-[#D4A853]/30 text-[#D4A853] text-xs font-medium whitespace-nowrap"
          >
            Coming soon
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════
// Activity Bar Chart (SVG)
// ═══════════════════════════════════════════════

function ActivityBarChart({ data }: { data: number[] }) {
  const maxVal = Math.max(...data, 1);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const w = 320;
  const h = 100;
  const barW = 28;
  const gap = (w - barW * 7) / 8;

  return (
    <svg viewBox={`0 0 ${w} ${h + 20}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {/* Grid lines */}
      {[0, 0.5, 1].map((pct) => (
        <line
          key={pct}
          x1={0}
          y1={h * (1 - pct)}
          x2={w}
          y2={h * (1 - pct)}
          stroke="rgba(255,255,255,0.04)"
          strokeWidth="1"
        />
      ))}
      {data.map((val, i) => {
        const barH = maxVal > 0 ? (val / maxVal) * (h - 10) : 0;
        const x = gap + i * (barW + gap);
        const y = h - barH;
        return (
          <g key={i}>
            {/* Bar background */}
            <rect
              x={x}
              y={10}
              width={barW}
              height={h - 10}
              rx={4}
              fill="rgba(255,255,255,0.03)"
            />
            {/* Bar fill */}
            <motion.rect
              initial={{ height: 0, y: h }}
              animate={{ height: barH, y }}
              transition={{ delay: i * 0.05, duration: 0.4, ease: 'easeOut' }}
              x={x}
              width={barW}
              rx={4}
              fill="#D4A853"
              opacity={val > 0 ? 0.7 : 0.15}
            />
            {/* Value label */}
            {val > 0 && (
              <text
                x={x + barW / 2}
                y={y - 3}
                textAnchor="middle"
                fill="#D4A853"
                fontSize="9"
                fontWeight="600"
              >
                {val}
              </text>
            )}
            {/* Day label */}
            <text
              x={x + barW / 2}
              y={h + 14}
              textAnchor="middle"
              fill="#78716c"
              fontSize="9"
            >
              {days[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ═══════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════

export default function CoachDashboard() {
  const [clients, setClients] = useState<ClientCard[]>([]);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [sortKey, setSortKey] = useState<'name' | 'streak' | 'compliance' | 'avgKcal' | 'lastCheckin'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [inlineNoteId, setInlineNoteId] = useState<string | null>(null);
  const [inlineNoteText, setInlineNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [weeklyActivity, setWeeklyActivity] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadClients();
  }, []);

  // ═══ Keyboard Shortcuts ═══
  const clientsRef = useRef(clients);
  clientsRef.current = clients;
  const searchRef = useRef(search);
  searchRef.current = search;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if (e.key === 'Escape') {
        setShowShortcuts(false);
        if (searchRef.current) { setSearch(''); searchInputRef.current?.blur(); }
        return;
      }

      if (isInput) return;

      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShowShortcuts((v) => !v);
        return;
      }
      if (e.key === 'n' || e.key === 'N' || e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 9) {
        const idx = num - 1;
        const c = clientsRef.current[idx];
        if (c) {
          router.push(`/coach/client/${c.clientProfile.user_id}`);
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router]);

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

      // ═══ Weekly Activity Data (Feature 10) ═══
      // Get all checkins for the current week (Mon-Sun) grouped by day
      const now = new Date();
      const monday = new Date(now);
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      monday.setHours(0, 0, 0, 0);
      const mondayStr = monday.toISOString().split('T')[0];

      const { data: weekCheckins } = await supabase
        .from('habit_checkins')
        .select('checked_date')
        .in('user_id', userIds)
        .gte('checked_date', mondayStr)
        .eq('completed', true);

      if (weekCheckins) {
        const dayCounts = [0, 0, 0, 0, 0, 0, 0]; // Mon-Sun
        weekCheckins.forEach((c: { checked_date: string }) => {
          const d = new Date(c.checked_date);
          const dayIdx = (d.getDay() + 6) % 7; // 0=Mon, 6=Sun
          dayCounts[dayIdx]++;
        });
        setWeeklyActivity(dayCounts);
      }
    } catch (err) {
      console.error('Error loading clients:', err);
    } finally {
      setLoading(false);
    }
  }

  // ═══ Save inline note (Feature 7) ═══
  async function saveInlineNote() {
    if (!inlineNoteId || !inlineNoteText.trim()) return;
    setSavingNote(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('coach_notes').insert({
        coach_id: user.id,
        client_id: inlineNoteId,
        note: inlineNoteText.trim(),
        session_type: 'general',
      });
      setInlineNoteId(null);
      setInlineNoteText('');
    } catch (err) {
      console.error('Error saving note:', err);
    } finally {
      setSavingNote(false);
    }
  }

  // ═══ Separate onboarding clients (Feature 8) ═══
  const onboardingClients = clients.filter(
    (c) => c.clientProfile.coaching_phase === 'onboarding'
  );
  const activeClients = clients.filter(
    (c) => c.clientProfile.coaching_phase !== 'onboarding'
  );

  // ═══ Apply search + status filter (Feature 6) ═══
  const applyFilters = (list: ClientCard[]) => {
    let result = list;
    if (search) {
      result = result.filter((c) =>
        c.profile.full_name.toLowerCase().includes(search.toLowerCase())
      );
    }
    if (filter === 'on_track') {
      result = result.filter((c) => c.status === 'green');
    } else if (filter === 'at_risk') {
      result = result.filter((c) => c.status === 'yellow' || c.status === 'red');
    } else if (filter === 'inactive') {
      result = result.filter((c) => c.daysSinceCheckin >= 3);
    }
    return result;
  };

  const filtered = applyFilters(activeClients);
  const filteredOnboarding = applyFilters(onboardingClients);

  // ═══ Filter counts (Feature 6) ═══
  const countAll = activeClients.length + onboardingClients.length;
  const countOnTrack = clients.filter((c) => c.status === 'green').length;
  const countAtRisk = clients.filter((c) => c.status === 'yellow' || c.status === 'red').length;
  const countInactive = clients.filter((c) => c.daysSinceCheckin >= 3).length;


  // ═══ Comparison Table Data ═══
  const comparisonData = filtered.map((c) => {
    const streak = c.activeHabit?.current_streak ?? 0;
    const cycleDays = c.activeHabit?.habit?.cycle_days ?? 14;
    const compliance = cycleDays > 0 ? Math.round((streak / cycleDays) * 100) : 0;
    return {
      ...c,
      streak,
      compliance: Math.min(compliance, 100),
      avgKcal: 0, // Would need food_log query for real data
      lastCheckinLabel:
        c.daysSinceCheckin === 0
          ? 'Today'
          : c.daysSinceCheckin === 999
          ? 'Never'
          : `${c.daysSinceCheckin}d ago`,
    };
  });

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedComparison = [...comparisonData].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortKey) {
      case 'name':
        return a.profile.full_name.localeCompare(b.profile.full_name) * dir;
      case 'streak':
        return (a.streak - b.streak) * dir;
      case 'compliance':
        return (a.compliance - b.compliance) * dir;
      case 'lastCheckin':
        return (a.daysSinceCheckin - b.daysSinceCheckin) * dir;
      default:
        return 0;
    }
  });


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

          {/* ═══ Search + Filter Pills (Feature 6) ═══ */}
          <div className="relative mb-3">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-dark pl-10"
            />
          </div>

          {/* Filter pills */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
            {([
              { key: 'all' as FilterStatus, label: 'All', count: countAll },
              { key: 'on_track' as FilterStatus, label: 'On Track', count: countOnTrack },
              { key: 'at_risk' as FilterStatus, label: 'At Risk', count: countAtRisk },
              { key: 'inactive' as FilterStatus, label: 'Inactive', count: countInactive },
            ]).map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-all whitespace-nowrap ${
                  filter === f.key
                    ? 'border-[#D4A853]/40 bg-[#D4A853]/10 text-[#D4A853]'
                    : 'border-white/10 text-stone-400 hover:border-white/20 hover:text-stone-300'
                }`}
              >
                {f.label}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  filter === f.key ? 'bg-[#D4A853]/20' : 'bg-white/5'
                }`}>
                  {f.count}
                </span>
              </button>
            ))}
          </div>

          {/* ═══ Client Activity This Week Chart (Feature 10) ═══ */}
          {!loading && clients.length > 0 && weeklyActivity.some((v) => v > 0) && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="glass p-5 mb-6"
            >
              <h2 className="text-sm font-semibold text-stone-200 flex items-center gap-2 mb-3">
                <BarChart3 size={16} className="text-[#D4A853]" />
                Client Activity This Week
              </h2>
              <ActivityBarChart data={weeklyActivity} />
              <p className="text-[10px] text-stone-600 text-center mt-2">
                Total check-ins across all clients per day
              </p>
            </motion.div>
          )}

          {/* ═══ Pending Onboarding Section (Feature 8) ═══ */}
          {!loading && filteredOnboarding.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mb-6"
            >
              <h2 className="text-sm font-semibold text-stone-300 flex items-center gap-2 mb-3">
                <UserPlus size={14} className="text-amber-400" />
                Pending Onboarding
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400">
                  {filteredOnboarding.length}
                </span>
              </h2>
              <div className="space-y-2">
                <AnimatePresence mode="popLayout">
                  {filteredOnboarding.map((client, i) => (
                    <motion.div
                      key={client.profile.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: i * 0.03 }}
                      className="glass p-4 border border-amber-500/20"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400 text-sm font-bold shrink-0">
                          {client.profile.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-stone-100 text-sm truncate">
                            {client.profile.full_name}
                          </h3>
                          <div className="flex items-center gap-2 text-xs text-stone-500">
                            <span>{client.profile.email}</span>
                            <span className="flex items-center gap-1">
                              <Clock size={10} />
                              Joined {new Date(client.clientProfile.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        </div>
                        <Link
                          href={`/coach/client/${client.clientProfile.user_id}`}
                          className="btn-gold !py-2 !px-3.5 text-xs flex items-center gap-1.5 shrink-0"
                        >
                          Complete Setup
                        </Link>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {/* ═══ Active Client Cards ═══ */}
          {viewMode === 'table' && !loading ? (
            <div className="glass overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      {[
                        { key: 'name' as const, label: 'Client' },
                        { key: 'streak' as const, label: 'Streak' },
                        { key: 'compliance' as const, label: 'Compliance' },
                        { key: 'lastCheckin' as const, label: 'Last Check-in' },
                      ].map((col) => (
                        <th
                          key={col.key}
                          onClick={() => handleSort(col.key)}
                          className="text-left px-4 py-3 text-stone-400 text-xs uppercase tracking-wider font-semibold cursor-pointer hover:text-stone-200 transition-colors select-none"
                        >
                          <span className="flex items-center gap-1">
                            {col.label}
                            <ArrowUpDown size={10} className={sortKey === col.key ? 'text-[#D4A853]' : 'text-stone-600'} />
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedComparison.map((client) => (
                      <tr
                        key={client.profile.id}
                        className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors cursor-pointer"
                        onClick={() => window.location.href = `/coach/client/${client.clientProfile.user_id}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`status-dot ${client.status}`} />
                            <span className="text-stone-100 font-medium">{client.profile.full_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-stone-200">{client.streak}d</span>
                          {client.activeHabit?.habit && (
                            <span className="text-stone-500 text-xs ml-1">
                              / {client.activeHabit.habit.cycle_days}d
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${client.compliance}%`,
                                  backgroundColor: client.compliance >= 75 ? '#D4A853' : client.compliance >= 50 ? '#f59e0b' : '#ef4444',
                                }}
                              />
                            </div>
                            <span className={`text-xs font-medium ${
                              client.compliance >= 75 ? 'text-[#D4A853]' : client.compliance >= 50 ? 'text-amber-400' : 'text-red-400'
                            }`}>
                              {client.compliance}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs ${
                            client.daysSinceCheckin === 0
                              ? 'text-green-400'
                              : client.daysSinceCheckin <= 2
                              ? 'text-amber-400'
                              : 'text-red-400'
                          }`}>
                            {client.lastCheckinLabel}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="glass p-4 sm:p-5 animate-pulse">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-stone-800/60" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-28 rounded bg-stone-800/60" />
                      <div className="h-3 w-40 rounded bg-stone-800/40" />
                      <div className="h-2 w-full rounded-full bg-stone-800/40" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 && filteredOnboarding.length === 0 ? (
            <div className="text-center py-20">
              <LayoutGrid size={48} className="mx-auto text-stone-700 mb-4" />
              <p className="text-stone-500">
                {clients.length === 0 ? 'No clients assigned yet' : 'No clients match your search'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {filtered.map((client, i) => (
                  <motion.div
                    key={client.profile.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: i * 0.05 }}
                    className="glass p-4 sm:p-5"
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar with status */}
                      <div className="relative pt-0.5">
                        <Avatar name={client.profile.full_name} size={32} />
                        <span className={`status-dot ${client.status} absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 border-2 border-stone-900`} style={{ borderRadius: '50%' }} />
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

                        {/* Inline Note Input (Feature 7) */}
                        <AnimatePresence>
                          {inlineNoteId === client.clientProfile.user_id && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="mt-3 overflow-hidden"
                            >
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={inlineNoteText}
                                  onChange={(e) => setInlineNoteText(e.target.value)}
                                  placeholder="Quick note..."
                                  className="input-dark flex-1 !py-2 text-sm"
                                  autoFocus
                                  onKeyDown={(e) => { if (e.key === 'Enter') saveInlineNote(); if (e.key === 'Escape') setInlineNoteId(null); }}
                                />
                                <button
                                  onClick={saveInlineNote}
                                  disabled={savingNote || !inlineNoteText.trim()}
                                  className="btn-gold !py-2 !px-3 text-xs disabled:opacity-40"
                                >
                                  {savingNote ? '...' : 'Save'}
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Action buttons (Feature 7 - Quick Actions) */}
                      <div className="flex items-center gap-1 shrink-0">
                        <Link
                          href={`/coach/client/${client.clientProfile.user_id}`}
                          className="p-2 rounded-lg hover:bg-white/5 text-stone-400 hover:text-stone-200 transition-colors"
                          title="View"
                        >
                          <Eye size={16} />
                        </Link>
                        {client.readyForProgression && (
                          <button
                            className="p-2 rounded-lg hover:bg-[#D4A853]/10 text-[#D4A853] transition-colors"
                            title="Progress to next habit"
                          >
                            <ArrowUpRight size={16} />
                          </button>
                        )}
                        <QuickActionsDropdown
                          clientId={client.clientProfile.user_id}
                          onAddNote={(id) => {
                            setInlineNoteId(inlineNoteId === id ? null : id);
                            setInlineNoteText('');
                          }}
                        />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="fixed bottom-4 right-4 z-30">
        <button
          onClick={() => setShowShortcuts(true)}
          className="text-[11px] text-stone-600 hover:text-stone-400 transition-colors px-3 py-1.5 rounded-lg bg-stone-900/80 backdrop-blur-sm border border-stone-800/50"
        >
          Press <kbd className="font-mono text-[#D4A853] mx-0.5">?</kbd> for shortcuts
        </button>
      </div>

      {/* Shortcuts Modal */}
      <AnimatePresence>
        {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
      </AnimatePresence>
    </div>
  );
}

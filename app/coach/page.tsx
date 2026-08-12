'use client';
import { useRouter } from 'next/navigation';

import { useCallback, useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Eye,
  StickyNote,
  ArrowUpRight,
  AlertTriangle,
  CheckCircle2,
  Search,
  LayoutGrid,
  Dumbbell,
  Calendar,
  MoreHorizontal,
  UserPlus,
  Bell,
  BarChart3,
  Clock,
  LogOut,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import Avatar from '@/components/shared/Avatar';
import ShortcutsModal from '@/components/shared/ShortcutsModal';
import DashboardGreeting from '@/components/coach/DashboardGreeting';
import WeeklyPulseCards from '@/components/coach/WeeklyPulseCards';
import CoachingStreak from '@/components/coach/CoachingStreak';
import ClientRiskHeatmap from '@/components/coach/ClientRiskHeatmap';
import InsightChips from '@/components/coach/InsightChips';
import GoldGlowCard from '@/components/coach/GoldGlowCard';
import CoachAchievements from '@/components/coach/CoachAchievements';
import MonthlyCoachReport from '@/components/coach/MonthlyCoachReport';
import CoachLoadingSkeletons from '@/components/coach/CoachLoadingSkeletons';
import BatchHabitAssign from '@/components/coach/BatchHabitAssign';
import { CoachNav } from '@/components/coach/CoachNav';
import ClientComparison from '@/components/coach/ClientComparison';
import { PanelPrefsProvider, Panel } from '@/components/coach/PanelGate';
import CustomizePanelsBar from '@/components/coach/CustomizePanelsBar';
import {
  COACH_DASH_PANELS,
  parseDisplayPrefs,
  isPanelVisible,
  type CoachDashPanelId,
  type DisplayPrefs,
} from '@/lib/display-prefs';
import { localDateStr } from '../../lib/utils/dates';
import { weeklyHabitActivity } from '@/lib/habits/weekly-activity';
import { BotNav } from '@/components/ui/BotNav';
import { Icon } from '@/components/ui';
import type {
  Profile,
  ClientProfile,
  ClientHabit,
  HabitCheckin,
  Habit,
  Mood,
} from '@/lib/types';

// ═══════════════════════════════════════════════
// Coach Navigation — now in @/components/coach/CoachNav
// ═══════════════════════════════════════════════

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
        data-coach-primary-action
        data-icon-only
        onClick={() => setOpen(!open)}
        className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] min-h-11 min-w-11 p-2 rounded-lg hover:bg-[var(--surface-hover)] text-[var(--content-secondary)] hover:text-[var(--content-primary)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
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
            className="absolute right-0 top-full mt-1 z-50 w-48 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)] backdrop-blur-xl shadow-xl overflow-hidden"
          >
            <Link
              href={`/coach/client/${clientId}`}
              className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-[var(--content-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--content-primary)] transition-colors"
              onClick={() => setOpen(false)}
            >
              <Eye size={14} className="text-[var(--content-muted)]" />
              View Profile
            </Link>
            <button
              data-coach-primary-action
              onClick={() => { onAddNote(clientId); setOpen(false); }}
              className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] min-h-11 w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-[var(--content-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--content-primary)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              <StickyNote size={14} className="text-[var(--content-muted)]" />
              Add Note
            </button>
            <Link
              href={`/coach/client/${clientId}?assign=1`}
              className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-[var(--content-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--content-primary)] transition-colors"
              onClick={() => setOpen(false)}
            >
              <Dumbbell size={14} className="text-[var(--content-muted)]" />
              Assign Habit
            </Link>
            {/* Real action (was a "Coming soon" toast): open the 1:1 thread */}
            <Link
              href={`/coach/inbox/${clientId}`}
              className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-[var(--content-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--content-primary)] transition-colors border-t border-[var(--border-subtle)]"
              onClick={() => setOpen(false)}
            >
              <Bell size={14} className="text-[var(--content-muted)]" />
              Send Reminder
            </Link>
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
    <svg role="img" aria-describedby="activity-chart-summary" viewBox={`0 0 ${w} ${h + 20}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      <title>Client activity this week</title>
      {/* Grid lines */}
      {[0, 0.5, 1].map((pct) => (
        <line
          key={pct}
          x1={0}
          y1={h * (1 - pct)}
          x2={w}
          y2={h * (1 - pct)}
          stroke="var(--border-subtle)"
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
              fill="var(--border-subtle)"
            />
            {/* Bar fill */}
            <motion.rect
              initial={{ height: 0, y: h }}
              animate={{ height: barH, y }}
              transition={{ delay: i * 0.05, duration: 0.4, ease: 'easeOut' }}
              x={x}
              width={barW}
              rx={4}
              fill="var(--data-calories)"
              opacity={val > 0 ? 0.7 : 0.15}
            />
            {/* Value label */}
            {val > 0 && (
              <text
                x={x + barW / 2}
                y={y - 3}
                textAnchor="middle"
                fill="var(--data-calories)"
                fontSize="12"
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
              fill="var(--data-neutral)"
              fontSize="12"
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
  const { t } = useI18n();
  const [clients, setClients] = useState<ClientCard[]>([]);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [inlineNoteId, setInlineNoteId] = useState<string | null>(null);
  const [inlineNoteText, setInlineNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [weeklyActivity, setWeeklyActivity] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  // Larger-text mode (persisted; Michael: "letters are too small")
  const [largeText, setLargeText] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [biz, setBiz] = useState({ bookedThisMonth: 0, bookedLastMonth: 0, completedThisMonth: 0 });
  useEffect(() => {
    const saved = localStorage.getItem('coach-font-scale') === 'large';
    setLargeText(saved);
    document.documentElement.dataset.fontScale = saved ? 'large' : '';
  }, []);
  const toggleLargeText = () => {
    const next = !largeText;
    setLargeText(next);
    localStorage.setItem('coach-font-scale', next ? 'large' : 'normal');
    document.documentElement.dataset.fontScale = next ? 'large' : '';
  };
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [coachName, setCoachName] = useState('Coach');
  const [showBatchAssign, setShowBatchAssign] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [notesWrittenCount, setNotesWrittenCount] = useState(0);
  const [availableHabits, setAvailableHabits] = useState<{ id: string; name: string; emoji: string }[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ═══ Display prefs (Customize mode — profiles.display_prefs, overrides only) ═══
  const [panelEditMode, setPanelEditMode] = useState(false);
  const [dashOverrides, setDashOverrides] = useState<Partial<Record<CoachDashPanelId, boolean>>>({});
  const fullPrefsRef = useRef<DisplayPrefs>({});
  const coachIdRef = useRef<string | null>(null);

  const persistDashOverrides = useCallback(
    async (next: Partial<Record<CoachDashPanelId, boolean>>) => {
      if (!coachIdRef.current) return;
      const merged: DisplayPrefs = { ...fullPrefsRef.current, coachDash: next };
      if (Object.keys(next).length === 0) delete merged.coachDash;
      fullPrefsRef.current = merged;
      const { error } = await supabase
        .from('profiles')
        .update({ display_prefs: merged })
        .eq('id', coachIdRef.current);
      if (error) console.error('Error saving display prefs:', error);
    },
    [],
  );

  const togglePanel = useCallback(
    (id: string) => {
      const panelId = id as CoachDashPanelId;
      setDashOverrides((prev) => {
        const current = isPanelVisible(COACH_DASH_PANELS, prev, panelId);
        const nextValue = !current;
        const next = { ...prev };
        if (nextValue === COACH_DASH_PANELS[panelId]) delete next[panelId];
        else next[panelId] = nextValue;
        persistDashOverrides(next);
        return next;
      });
    },
    [persistDashOverrides],
  );

  const resetPanels = useCallback(() => {
    setDashOverrides({});
    persistDashOverrides({});
  }, [persistDashOverrides]);

  const panelVisible = useCallback(
    (id: string) => isPanelVisible(COACH_DASH_PANELS, dashOverrides, id as CoachDashPanelId),
    [dashOverrides],
  );

  // ═══ Compare Clients — coach picks the two; actual 7d intake vs targets ═══
  const [compareA, setCompareA] = useState<string>('');
  const [compareB, setCompareB] = useState<string>('');
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareActuals, setCompareActuals] = useState<
    Record<string, { protein: number; carbs: number; fat: number; fiber: number; water: number }>
  >({});

  // ═══ Keyboard Shortcuts ═══
  const clientsRef = useRef(clients);
  const searchRef = useRef(search);

  useEffect(() => {
    clientsRef.current = clients;
    searchRef.current = search;
  }, [clients, search]);

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

  const loadClients = useCallback(async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      coachIdRef.current = user.id;

      // Date windows used by the batched queries below.
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const lastMonthStart = new Date(monthStart); lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
      const nowD = new Date();
      const monday = new Date(nowD);
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      monday.setHours(0, 0, 0, 0);
      const mondayStr = localDateStr(monday);

      // ── Batch A: everything keyed on the coach's own id — ONE round trip ──
      // (was 5 sequential awaits: profile → appts → client_profiles →
      // habitsForAssign → notesCount. From Greece↔us-east-2 that's ~5 network
      // hops before render; batching pays the latency once.)
      const [profileRes, apptsRes, clientProfilesRes, habitsForAssignRes, notesCountRes] = await Promise.all([
        supabase.from('profiles').select('role, full_name, display_prefs').eq('id', user.id).maybeSingle(),
        supabase.from('appointments').select('starts_at, status, created_at').eq('coach_id', user.id).gte('created_at', lastMonthStart.toISOString()),
        supabase.from('client_profiles').select('*').eq('coach_id', user.id),
        // habits has no is_active column (that filter 400'd silently for months) — templates are is_template.
        supabase.from('habits').select('id, name_en, emoji').eq('is_template', true).order('suggested_order', { ascending: true }).limit(50),
        supabase.from('coach_notes').select('id', { count: 'exact', head: true }).eq('coach_id', user.id).gte('created_at', monthStart.toISOString()),
      ]);

      const profile = profileRes.data;
      // Role gate — only coaches. Batch A already ran (redirect is the rare path;
      // avoiding an extra serial round trip for every coach is the common win).
      if (profile?.role === 'client') { router.replace('/dashboard'); return; }
      setIsSuperAdmin(profile?.role === 'super_admin');

      const prefs = parseDisplayPrefs(profile?.display_prefs);
      fullPrefsRef.current = prefs;
      setDashOverrides((prefs.coachDash ?? {}) as Partial<Record<CoachDashPanelId, boolean>>);
      if (profile?.full_name) setCoachName(profile.full_name.split(' ')[0]);

      // P4 business numbers: bookings this month vs last, completed this month
      const rows = (apptsRes.data ?? []) as Array<{ starts_at: string; status: string; created_at: string }>;
      setBiz({
        bookedThisMonth: rows.filter((a) => a.created_at >= monthStart.toISOString()).length,
        bookedLastMonth: rows.filter((a) => a.created_at < monthStart.toISOString()).length,
        completedThisMonth: rows.filter((a) => a.status === 'completed' && a.starts_at >= monthStart.toISOString()).length,
      });

      if (habitsForAssignRes.data) {
        setAvailableHabits(habitsForAssignRes.data.map((h: { id: string; name_en: string; emoji: string }) => ({
          id: h.id, name: h.name_en, emoji: h.emoji,
        })));
      }
      setNotesWrittenCount(notesCountRes.count ?? 0);

      const clientProfiles = clientProfilesRes.data;
      if (!clientProfiles || clientProfiles.length === 0) {
        setLoading(false);
        return;
      }

      const userIds = clientProfiles.map((cp: ClientProfile) => cp.user_id);

      // ── Batch B: everything keyed on the client ids — ONE round trip ──
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
          .gte('checked_date', localDateStr(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)))
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
          // Graduated clients are intentionally "done" — keep them off the
          // at-risk/reach-out lists (Michael: "free to go, book when ready").
          status: cp.graduated_at ? ('green' as const) : getStatus(daysSince),
          moodAvg,
          readyForProgression,
        };
      });

      // Sort: red first (at risk), then yellow, then green
      const order = { red: 0, yellow: 1, green: 2 };
      cards.sort((a, b) => order[a.status] - order[b.status]);

      setClients(cards);

      // ═══ Weekly Activity Data (Feature 10) — from Batch B (no extra RT) ═══
      setWeeklyActivity(weeklyHabitActivity(checkins, mondayStr));
    } catch (err) {
      console.error('Error loading clients:', err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

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


  // ═══ Compare Clients: default picks + 7-day actual intake fetch ═══
  useEffect(() => {
    if (!showComparison || clients.length < 2) return;
    setCompareA((prev) => prev || clients[0].clientProfile.user_id);
    setCompareB((prev) => prev || clients[1].clientProfile.user_id);
  }, [showComparison, clients]);

  useEffect(() => {
    if (!showComparison || !compareA || !compareB || compareA === compareB) return;
    let cancelled = false;
    (async () => {
      setCompareLoading(true);
      try {
        const sevenDaysAgo = localDateStr(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
        const ids = [compareA, compareB];
        const [foodRes, waterRes] = await Promise.all([
          supabase
            .from('food_log')
            .select('user_id, logged_date, protein_g, carbs_g, fat_g, fiber_g')
            .in('user_id', ids)
            .gte('logged_date', sevenDaysAgo),
          supabase
            .from('water_log')
            .select('user_id, logged_date, amount_ml')
            .in('user_id', ids)
            .gte('logged_date', sevenDaysAgo),
        ]);
        if (cancelled) return;

        const actuals: typeof compareActuals = {};
        for (const id of ids) {
          type FoodRow = { user_id: string; logged_date: string; protein_g: number | null; carbs_g: number | null; fat_g: number | null; fiber_g: number | null };
          type WaterRow = { user_id: string; logged_date: string; amount_ml: number | null };
          const food = ((foodRes.data ?? []) as FoodRow[]).filter((r) => r.user_id === id);
          const water = ((waterRes.data ?? []) as WaterRow[]).filter((r) => r.user_id === id);
          const byDate: Record<string, { p: number; c: number; f: number; fib: number }> = {};
          for (const r of food) {
            if (!byDate[r.logged_date]) byDate[r.logged_date] = { p: 0, c: 0, f: 0, fib: 0 };
            byDate[r.logged_date].p += r.protein_g ?? 0;
            byDate[r.logged_date].c += r.carbs_g ?? 0;
            byDate[r.logged_date].f += r.fat_g ?? 0;
            byDate[r.logged_date].fib += r.fiber_g ?? 0;
          }
          const days = Object.values(byDate);
          const n = Math.max(days.length, 1);
          const waterByDate: Record<string, number> = {};
          for (const r of water) {
            waterByDate[r.logged_date] = (waterByDate[r.logged_date] ?? 0) + (r.amount_ml ?? 0);
          }
          const waterDays = Object.values(waterByDate);
          actuals[id] = {
            protein: Math.round(days.reduce((s, d) => s + d.p, 0) / n),
            carbs: Math.round(days.reduce((s, d) => s + d.c, 0) / n),
            fat: Math.round(days.reduce((s, d) => s + d.f, 0) / n),
            fiber: Math.round(days.reduce((s, d) => s + d.fib, 0) / n),
            water: Math.round(
              waterDays.reduce((s, d) => s + d, 0) / Math.max(waterDays.length, 1),
            ),
          };
        }
        setCompareActuals((prev) => ({ ...prev, ...actuals }));
      } catch (err) {
        console.error('Error loading comparison intake:', err);
      } finally {
        if (!cancelled) setCompareLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [showComparison, compareA, compareB]);

  const onTrack = clients.filter((c) => c.status === 'green').length;
  const atRisk = clients.filter((c) => c.status !== 'green').length;

  // ═══ Weekly Summary calculations ═══
  // weekLabel renders in the prerendered HTML, so it must be computed
  // client-side only: the static build bakes in the BUILD date (UTC), the
  // client recomputes with today's local date → hydration text mismatch
  // (React #418, was firing on every /coach load).
  const [weekLabel, setWeekLabel] = useState('');
  useEffect(() => {
    const ws = new Date();
    ws.setDate(ws.getDate() - ws.getDay() + 1); // Monday
    ws.setHours(0, 0, 0, 0);
    const we = new Date(ws);
    we.setDate(we.getDate() + 6); // Sunday
    setWeekLabel(`${ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${we.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`);
  }, []);
  const now = new Date();

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

  // Graduated clients stop checking in by design, so daysSinceCheckin climbs
  // forever — they must be excluded from every reach-out surface (the whole
  // point of graduation), exactly as the forced-green status already excludes
  // them from the atRisk summary.
  const isGraduated = (c: typeof clients[number]) => !!c.clientProfile.graduated_at;

  // Clients needing attention
  const needsAttention = clients.filter((c) => !isGraduated(c) && (c.status === 'red' || c.daysSinceCheckin >= 3));

  // P4 contact-due: clients past their personal cadence since last check-in.
  // Michael: "the app could notify me that the client should contact me" —
  // weekly clients surface after 7 quiet days, quarterly ones after 90.
  const contactDue = clients
    .filter((c) => !isGraduated(c))
    .map((c) => ({
      c,
      cadence: c.clientProfile.contact_cadence_days ?? 14,
      overdueDays: c.daysSinceCheckin - (c.clientProfile.contact_cadence_days ?? 14),
    }))
    .filter((x) => x.overdueDays > 0 && x.c.daysSinceCheckin < 999)
    .sort((a, b) => b.overdueDays - a.overdueDays);

  // Real coaching streak: consecutive days (ending today or yesterday) where
  // at least one client checked in, derived from daysSinceCheckin minima.
  const coachingStreakDays = (() => {
    const days = clients
      .map((c) => c.daysSinceCheckin)
      .filter((d) => Number.isFinite(d) && d >= 0)
      .sort((a, b) => a - b);
    if (days.length === 0 || days[0] > 1) return 0;
    // Count distinct consecutive day-offsets covered by client check-ins
    let streak = 0;
    const covered = new Set(days);
    for (let d = days[0]; covered.has(d); d++) streak++;
    return streak;
  })();

  // ═══ Computed data for new components ═══

  // Pulse stats — weeklyActivity counts HABIT CHECK-INS, not meals. Labeled
  // honestly as "Check-ins" (was fabricated as "Meals Logged").
  const pulseStats = {
    totalClients: clients.length,
    avgCompliance: avgStreakPct,
    checkinsThisWeek: weeklyActivity.reduce((a, b) => a + b, 0),
    needsAttention: needsAttention.length,
  };

  // Heatmap data
  const heatmapClients = clients.map((c) => {
    const streak = c.activeHabit?.current_streak ?? 0;
    const cycle = c.activeHabit?.habit?.cycle_days ?? 14;
    const adherence = cycle > 0 ? Math.min(Math.round((streak / cycle) * 100), 100) : 0;
    return { name: c.profile.full_name, status: c.status, adherence };
  });

  // Insight chips
  const insightChips: Array<{ emoji: string; text: string; type: 'positive' | 'warning' | 'info' }> = [];
  const bestStreaker = clients.reduce<ClientCard | null>((best, c) => {
    const streak = c.activeHabit?.current_streak ?? 0;
    const bestStreak = best?.activeHabit?.current_streak ?? 0;
    return streak > bestStreak ? c : best;
  }, null);
  // No emoji-as-icons (design rule) \u2014 the chip's type color carries the tone.
  if (bestStreaker && (bestStreaker.activeHabit?.current_streak ?? 0) > 0) {
    insightChips.push({
      emoji: '',
      text: `${bestStreaker.activeHabit!.current_streak}-day streak by ${bestStreaker.profile.full_name.split(' ')[0]}`,
      type: 'positive',
    });
  }
  if (countAtRisk > 0) {
    insightChips.push({
      emoji: '',
      text: `${countAtRisk} client${countAtRisk !== 1 ? 's' : ''} at risk`,
      type: 'warning',
    });
  }
  const readyCount = clients.filter((c) => c.readyForProgression).length;
  if (readyCount > 0) {
    insightChips.push({
      emoji: '',
      text: `${readyCount} ready for progression`,
      type: 'info',
    });
  }

  // Monthly report
  const currentMonth = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const topImprover = bestStreaker?.profile.full_name ?? 'N/A';
  const monthlyReport = {
    month: currentMonth,
    clientsManaged: clients.length,
    avgAdherence: avgStreakPct,
    habitsProgressed: clients.filter((c) => c.readyForProgression).length,
    notesWritten: notesWrittenCount,
    checkins: pulseStats.checkinsThisWeek,
    topImprover,
  };

  // Batch assign handler
  const handleBatchAssign = async (habitId: string, clientIds: string[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // Pause each client's existing active habit FIRST — the invariant is
      // exactly one active client_habit per client (single-assign already does
      // this). Without it a batch assign leaves two active rows, and the
      // dashboard vs client-detail pages pick different "active" habits →
      // inconsistent streak/adherence math.
      await supabase.from('client_habits')
        .update({ status: 'paused' })
        .in('client_id', clientIds)
        .eq('status', 'active');
      const inserts = clientIds.map((clientId) => ({
        client_id: clientId,
        habit_id: habitId,
        assigned_by: user.id,
        status: 'active' as const,
        current_streak: 0,
      }));
      await supabase.from('client_habits').insert(inserts);
      setShowBatchAssign(false);
      loadClients();
    } catch (err) {
      console.error('Batch assign error:', err);
    }
  };

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 lg:px-8" style={{ background: 'var(--canvas)' }}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <div /> {/* spacer */}
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-[var(--content-secondary)] hover:text-[var(--content-primary)] text-xs flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw size={12} />
              Client View
            </Link>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                router.push('/login');
              }}
              className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] text-[var(--content-muted)] hover:text-[var(--content-secondary)] text-xs flex items-center gap-1.5 transition-colors"
            >
              <LogOut size={14} />
              Log out
            </button>
            {isSuperAdmin && (
              <Link href="/super" title="Super Command Center"
                className="text-xs flex items-center gap-1 font-mono font-bold"
                style={{ color: 'var(--gold-300,#D4A853)' }}>
                ⌘ SUPER
              </Link>
            )}
            <button
              onClick={toggleLargeText}
              title="Toggle larger text"
              className={`min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] text-xs flex items-center gap-1 transition-colors ${largeText ? 'text-[#D4A853]' : 'text-[var(--content-muted)] hover:text-[var(--content-secondary)]'}`}
            >
              Aa
            </button>
            <CustomizePanelsBar
              editMode={panelEditMode}
              onToggleEdit={() => setPanelEditMode((v) => !v)}
              onReset={resetPanels}
            />
          </div>
        </div>
        <CoachNav active="/coach" />

        <PanelPrefsProvider
          value={{ prefs: dashOverrides, editMode: panelEditMode, toggle: togglePanel, visible: panelVisible }}
        >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Greeting */}
          <DashboardGreeting coachName={coachName} needsAttention={needsAttention.length} />

          {/* Weekly Pulse Cards */}
          <Panel id="pulseCards" title={t('coach.panel.pulseCards')}>
            {!loading && clients.length > 0 && (
              <div className="mb-6">
                <WeeklyPulseCards stats={pulseStats} />
              </div>
            )}
          </Panel>

          {/* Coaching Streak — consecutive days (ending today/yesterday) with at
              least one client check-in. Was hardcoded to 7; Michael flagged it. */}
          <Panel id="coachStreak" title={t('coach.panel.coachStreak')}>
            {!loading && (
              <div className="mb-6" title="Consecutive days where at least one of your clients checked in.">
                <CoachingStreak streakDays={coachingStreakDays} />
              </div>
            )}
          </Panel>

          {/* ═══ P4 · Business numbers ═══ */}
          <Panel id="business" title={t('coach.panel.business')}>
          {!loading && (
            <div className="glass p-5 mb-6">
              <h2 className="font-semibold text-[var(--content-primary)] mb-3 text-sm" title="Bookings counted by when they were made; completed by session date.">
                Business · {new Date().toLocaleDateString([], { month: 'long' })}
              </h2>
              <div className="grid grid-cols-3 gap-3 mb-1">
                <div className="text-center p-3 rounded-xl bg-[var(--surface-hover)] border border-[var(--border-subtle)]">
                  <div className="text-xl font-bold text-[var(--content-primary)] font-mono">{biz.bookedThisMonth}</div>
                  <div className="text-xs text-[var(--content-muted)] uppercase tracking-wider">Booked</div>
                  <div className={`text-xs font-mono mt-0.5 ${biz.bookedThisMonth >= biz.bookedLastMonth ? 'text-[var(--status-success-fg)]' : 'text-[var(--status-danger-fg)]'}`}>
                    {biz.bookedLastMonth === 0 ? '—' : `${biz.bookedThisMonth >= biz.bookedLastMonth ? '+' : ''}${biz.bookedThisMonth - biz.bookedLastMonth} vs last`}
                  </div>
                </div>
                <div className="text-center p-3 rounded-xl bg-[var(--surface-hover)] border border-[var(--border-subtle)]">
                  <div className="text-xl font-bold text-[var(--content-primary)] font-mono">{biz.completedThisMonth}</div>
                  <div className="text-xs text-[var(--content-muted)] uppercase tracking-wider">Sessions done</div>
                </div>
                <div className="text-center p-3 rounded-xl bg-[var(--surface-hover)] border border-[var(--border-subtle)]">
                  <div className="text-xl font-bold text-[var(--content-primary)] font-mono">{clients.length}</div>
                  <div className="text-xs text-[var(--content-muted)] uppercase tracking-wider">Active clients</div>
                  <div className="text-xs font-mono mt-0.5 text-[var(--content-muted)]">
                    {clients.length >= 100 ? 'at capacity' : clients.length >= 70 ? 'nearly full' : 'room to grow'}
                  </div>
                </div>
              </div>

              {contactDue.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
                  <div className="text-xs text-[var(--content-muted)] uppercase tracking-wider mb-2">
                    Reach out — past their cadence
                  </div>
                  {contactDue.slice(0, 5).map(({ c, cadence, overdueDays }) => (
                    <Link key={c.profile.id} href={`/coach/inbox/${c.profile.id}`}
                      className="flex items-center justify-between py-1.5 hover:bg-[var(--surface-hover)] rounded-lg px-2 -mx-2 transition-colors">
                      <span className="text-xs text-[var(--content-secondary)]">{c.profile.full_name}</span>
                      <span className="text-xs font-mono text-[var(--status-warning-fg)]">
                        {overdueDays}d past {cadence}d rhythm
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
          </Panel>

          {/* ═══ Weekly Summary Card ═══ */}
          <Panel id="weeklySummary" title={t('coach.panel.weeklySummary')}>
          {!loading && clients.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass gold-border p-5 mb-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-[var(--content-primary)] flex items-center gap-2">
                  <Calendar size={16} className="text-[#D4A853]" />
                  Weekly Summary
                </h2>
                <span className="text-xs text-[var(--content-muted)]">{weekLabel}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <div className="text-center">
                  <div className="text-xl font-bold text-[var(--content-primary)]">{totalCheckins}</div>
                  <div className="text-xs text-[var(--content-muted)] uppercase tracking-wider">Active This Week</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-[#D4A853]">{avgStreakPct}%</div>
                  <div className="text-xs text-[var(--content-muted)] uppercase tracking-wider">Avg. Streak</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-[var(--status-success-fg)]">{clients.filter((c) => c.readyForProgression).length}</div>
                  <div className="text-xs text-[var(--content-muted)] uppercase tracking-wider">Ready to Progress</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-[var(--status-danger-fg)]">{needsAttention.length}</div>
                  <div className="text-xs text-[var(--content-muted)] uppercase tracking-wider">Need Attention</div>
                </div>
              </div>
              {needsAttention.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
                  <p className="text-xs text-[var(--content-muted)] mb-2">Needs attention:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {needsAttention.slice(0, 5).map((c) => (
                      <Link
                        key={c.profile.id}
                        href={`/coach/client/${c.clientProfile.user_id}`}
                        className="text-xs px-2.5 py-1 rounded-full bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)] border border-[var(--status-danger-border)] hover:bg-[var(--status-danger-bg)] transition-colors"
                      >
                        {c.profile.full_name} ({c.daysSinceCheckin === 999 ? 'never' : `${c.daysSinceCheckin}d`})
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
          </Panel>

          {/* Summary Bar */}
          <Panel id="summaryBar" title={t('coach.panel.summaryBar')}>
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="glass p-4 text-center">
              <div className="text-2xl font-bold text-[var(--content-primary)]">{clients.length}</div>
              <div className="text-xs text-[var(--content-muted)] flex items-center justify-center gap-1">
                <Users size={12} /> Total
              </div>
            </div>
            <div className="glass p-4 text-center">
              <div className="text-2xl font-bold text-[var(--status-success-fg)]">{onTrack}</div>
              <div className="text-xs text-[var(--content-muted)] flex items-center justify-center gap-1">
                <CheckCircle2 size={12} /> On Track
              </div>
            </div>
            <div className="glass p-4 text-center">
              <div className="text-2xl font-bold text-[var(--status-danger-fg)]">{atRisk}</div>
              <div className="text-xs text-[var(--content-muted)] flex items-center justify-center gap-1">
                <AlertTriangle size={12} /> At Risk
              </div>
            </div>
          </div>
          </Panel>

          {/* ═══ Client Risk Heatmap ═══ */}
          <Panel id="riskHeatmap" title={t('coach.panel.riskHeatmap')}>
            {!loading && clients.length > 0 && (
              <div className="mb-6">
                <ClientRiskHeatmap clients={heatmapClients} />
              </div>
            )}
          </Panel>

          {/* ═══ Insight Chips ═══ */}
          <Panel id="insightChips" title={t('coach.panel.insightChips')}>
            {!loading && insightChips.length > 0 && (
              <div className="mb-4">
                <InsightChips insights={insightChips} />
              </div>
            )}
          </Panel>

          {/* ═══ Batch Assign + Compare Buttons ═══ */}
          {!loading && clients.length > 0 && (
            <div className="flex gap-2 mb-4 flex-wrap items-start">
              <button
                data-coach-primary-action
                onClick={() => setShowBatchAssign(true)}
                className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] min-h-11 text-xs px-3 py-1.5 rounded-lg border border-[#D4A853]/30 text-[#D4A853] hover:bg-[#D4A853]/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              >
                Batch Assign Habit
              </button>
              <Panel id="compareClients" title={t('coach.panel.compareClients')}>
                {clients.length >= 2 && (
                  <button
                    data-coach-primary-action
                    onClick={() => setShowComparison(true)}
                    className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] min-h-11 text-xs px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--content-secondary)] hover:text-[var(--content-primary)] hover:border-[var(--border-subtle)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  >
                    Compare Clients
                  </button>
                )}
              </Panel>
            </div>
          )}

          {/* ═══ Search + Filter Pills (Feature 6) ═══ */}
          <div className="relative mb-3">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--content-muted)]" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-dark text-base"
              style={{ paddingLeft: 40 }}
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
                data-coach-primary-action
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] min-h-11 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
                  filter === f.key
                    ? 'border-[#D4A853]/40 bg-[#D4A853]/10 text-[#D4A853]'
                    : 'border-[var(--border-subtle)] text-[var(--content-secondary)] hover:border-[var(--border-subtle)] hover:text-[var(--content-secondary)]'
                }`}
              >
                {f.label}
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                  filter === f.key ? 'bg-[#D4A853]/20' : 'bg-[var(--surface-hover)]'
                }`}>
                  {f.count}
                </span>
              </button>
            ))}
          </div>

          {/* ═══ Client Activity This Week Chart (Feature 10) ═══ */}
          <Panel id="activityChart" title={t('coach.panel.activityChart')}>
            {!loading && clients.length > 0 && weeklyActivity.some((v) => v > 0) && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="glass p-5 mb-6"
              >
                <h2 className="text-sm font-semibold text-[var(--content-primary)] flex items-center gap-2 mb-3">
                  <BarChart3 size={16} className="text-[#D4A853]" />
                  Client Activity This Week
                </h2>
                <ActivityBarChart data={weeklyActivity} />
                <p id="activity-chart-summary" className="text-xs text-[var(--content-muted)] text-center mt-2">
                  Total check-ins across all clients per day
                </p>
              </motion.div>
            )}
          </Panel>

          {/* ═══ Pending Onboarding Section (Feature 8) ═══ */}
          <Panel id="pendingOnboarding" title={t('coach.panel.pendingOnboarding')}>
          {!loading && filteredOnboarding.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mb-6"
            >
              <h2 className="text-sm font-semibold text-[var(--content-secondary)] flex items-center gap-2 mb-3">
                <UserPlus size={14} className="text-[var(--status-warning-fg)]" />
                Pending Onboarding
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]">
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
                      className="glass p-4 border border-[var(--status-warning-border)]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[var(--status-warning-bg)] flex items-center justify-center text-[var(--status-warning-fg)] text-sm font-bold shrink-0">
                          {client.profile.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-[var(--content-primary)] text-sm truncate">
                            {client.profile.full_name}
                          </h3>
                          <div className="flex items-center gap-2 text-xs text-[var(--content-muted)]">
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
          </Panel>

          {/* ═══ Active Client Cards ═══ */}
          {loading ? (
            <CoachLoadingSkeletons page="dashboard" />
          ) : filtered.length === 0 && filteredOnboarding.length === 0 ? (
            <div className="text-center py-20">
              <LayoutGrid size={48} className="mx-auto text-[var(--content-disabled)] mb-4" />
              <p className="text-[var(--content-muted)]">
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
                  >
                    <GoldGlowCard>
                    <div className="flex items-start gap-3">
                      {/* Avatar with status */}
                      <div className="relative pt-0.5">
                        <Avatar name={client.profile.full_name} size={32} />
                        <span className={`status-dot ${client.status} absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 border-2 border-[var(--border-default)]`} style={{ borderRadius: '50%' }} />
                      </div>

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-[var(--content-primary)] truncate">
                            {client.profile.full_name}
                          </h3>
                          {client.readyForProgression && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#D4A853]/15 text-[#D4A853] whitespace-nowrap">
                              Ready for Progression
                            </span>
                          )}
                        </div>

                        {/* Habit info */}
                        {client.activeHabit?.habit ? (
                          <div className="mt-1.5">
                            <div className="flex items-center gap-1.5 text-sm text-[var(--content-secondary)]">
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
                              <span className="text-xs text-[var(--content-muted)] whitespace-nowrap">
                                {client.activeHabit.current_streak}/{client.activeHabit.habit.cycle_days || 21}d
                              </span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-[var(--content-muted)] mt-1">No active habit</p>
                        )}

                        {/* Mood + last activity */}
                        <div className="flex items-center gap-4 mt-2 text-xs text-[var(--content-muted)]">
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
                                  className="input-dark text-base flex-1 !py-2"
                                  autoFocus
                                  onKeyDown={(e) => { if (e.key === 'Enter') saveInlineNote(); if (e.key === 'Escape') setInlineNoteId(null); }}
                                />
                                <button
                                  onClick={saveInlineNote}
                                  disabled={savingNote || !inlineNoteText.trim()}
                                  className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] btn-gold !py-2 !px-3 text-xs disabled:opacity-40"
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
                          className="p-2 rounded-lg hover:bg-[var(--surface-hover)] text-[var(--content-secondary)] hover:text-[var(--content-primary)] transition-colors"
                          title="View"
                        >
                          <Eye size={16} />
                        </Link>
                        {client.readyForProgression && (
                          <button
                            className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] p-2 rounded-lg hover:bg-[#D4A853]/10 text-[#D4A853] transition-colors"
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
                    </GoldGlowCard>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* ═══ Coach Achievements ═══ */}
          <Panel id="achievements" title={t('coach.panel.achievements')}>
            {!loading && clients.length > 0 && (
              <div className="mt-8">
                <GoldGlowCard>
                  <CoachAchievements />
                </GoldGlowCard>
              </div>
            )}
          </Panel>

          {/* ═══ Monthly Coach Report ═══ */}
          <Panel id="monthlyReport" title={t('coach.panel.monthlyReport')}>
            {!loading && clients.length > 0 && (
              <div className="mt-6">
                <MonthlyCoachReport report={monthlyReport} />
              </div>
            )}
          </Panel>
        </motion.div>
        </PanelPrefsProvider>
      </div>

      {/* ═══ Batch Habit Assign Modal ═══ */}
      <AnimatePresence>
        {showBatchAssign && availableHabits.length > 0 && (
          <BatchHabitAssign
            clients={clients.map((c) => ({
              id: c.clientProfile.user_id,
              name: c.profile.full_name,
              selected: false,
            }))}
            habits={availableHabits}
            onAssign={handleBatchAssign}
            onClose={() => setShowBatchAssign(false)}
          />
        )}
      </AnimatePresence>

      {/* ═══ Client Comparison Modal — actual 7d avg intake vs targets ═══ */}
      <AnimatePresence>
        {showComparison && clients.length >= 2 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowComparison(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="w-full max-w-md max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Client pickers */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                {([
                  { value: compareA, set: setCompareA, exclude: compareB, label: t('coach.compare.clientA') },
                  { value: compareB, set: setCompareB, exclude: compareA, label: t('coach.compare.clientB') },
                ] as const).map((picker) => (
                  <div key={picker.label}>
                    <label className="text-xs text-[var(--content-muted)] uppercase tracking-wider mb-1 block">
                      {picker.label}
                    </label>
                    <select
                      value={picker.value}
                      onChange={(e) => picker.set(e.target.value)}
                      className="input-dark text-base w-full !py-2"
                    >
                      {clients
                        .filter((c) => c.clientProfile.user_id !== picker.exclude)
                        .map((c) => (
                          <option key={c.clientProfile.user_id} value={c.clientProfile.user_id}>
                            {c.profile.full_name}
                          </option>
                        ))}
                    </select>
                  </div>
                ))}
              </div>

              {(() => {
                const cardA = clients.find((c) => c.clientProfile.user_id === compareA);
                const cardB = clients.find((c) => c.clientProfile.user_id === compareB);
                if (!cardA || !cardB) return null;
                if (compareLoading && (!compareActuals[compareA] || !compareActuals[compareB])) {
                  return (
                    <div className="bg-[var(--surface-hover)] border border-[var(--border-subtle)] rounded-xl p-8 text-center text-[var(--content-muted)] text-xs">
                      {t('coach.compare.loading')}
                    </div>
                  );
                }
                const toTargets = (cp: ClientCard['clientProfile']) => ({
                  protein: cp.target_protein_g ?? 0,
                  carbs: cp.target_carbs_g ?? 0,
                  fat: cp.target_fat_g ?? 0,
                  fiber: cp.target_fiber_g ?? 0,
                  water: cp.target_water_ml ?? 0,
                });
                const emptyIntake = { protein: 0, carbs: 0, fat: 0, fiber: 0, water: 0 };
                const targetsA = toTargets(cardA.clientProfile);
                const targetsB = toTargets(cardB.clientProfile);
                const actualA = compareActuals[compareA] ?? emptyIntake;
                const actualB = compareActuals[compareB] ?? emptyIntake;
                const noTargets =
                  !Object.values(targetsA).some((v) => v > 0) &&
                  !Object.values(targetsB).some((v) => v > 0);
                return (
                  <>
                    <ClientComparison
                      clientA={{ name: cardA.profile.full_name, macros: actualA, targets: targetsA }}
                      clientB={{ name: cardB.profile.full_name, macros: actualB, targets: targetsB }}
                    />
                    <p className="text-xs text-[var(--content-muted)] text-center mt-2">
                      {t('coach.compare.footnote')}
                    </p>
                    {noTargets && (
                      <p className="text-xs text-[var(--status-warning-fg)] text-center mt-1">
                        {t('coach.compare.noTargets')}
                      </p>
                    )}
                  </>
                );
              })()}
              <button
                onClick={() => setShowComparison(false)}
                className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] mt-3 w-full text-center text-xs text-[var(--content-muted)] hover:text-[var(--content-secondary)] transition-colors py-2"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Keyboard shortcuts hint */}
      <div className="fixed bottom-4 right-4 z-30">
        <button
          onClick={() => setShowShortcuts(true)}
          className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] text-xs text-[var(--content-muted)] hover:text-[var(--content-secondary)] transition-colors px-3 py-1.5 rounded-lg bg-[var(--surface-2)] backdrop-blur-sm border border-[var(--border-default)]"
        >
          Press <kbd className="font-mono text-[#D4A853] mx-0.5">?</kbd> for shortcuts
        </button>
      </div>

      {/* Shortcuts Modal */}
      <AnimatePresence>
        {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
      </AnimatePresence>

      {/* All four tabs point at routes that actually exist (were /coach/clients + /coach/profile 404s) */}
      <BotNav routes={[
        { href: '/coach',           label: 'Today',     icon: <Icon name="i-grid"     size={18} /> },
        { href: '/coach/inbox',     label: 'Inbox',     icon: <Icon name="i-message"  size={18} /> },
        { href: '/coach/calendar',  label: t('coach.nav.calendar'),  icon: <Icon name="i-calendar" size={18} /> },
        { href: '/coach/templates', label: t('coach.nav.workouts'),  icon: <Icon name="i-dumbbell" size={18} /> },
      ]} />
    </div>
  );
}

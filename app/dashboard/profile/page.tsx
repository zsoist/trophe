'use client';
import { useRouter } from 'next/navigation';

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { User, LogOut, Save, Globe, Sun, Moon, Palette, SlidersHorizontal, Download, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  calculateFullProfile,
  nutritionProfileInputIssue,
  ACTIVITY_DESCRIPTIONS,
} from '@/lib/food/nutrition-engine';
import type { ClientProfile, Profile, Sex, ActivityLevel, Goal, Language } from '@/lib/types';
import { BotNav } from '@/components/ui/BotNav';
import { Icon } from '@/components/ui';
import { useThemeMode } from '@/components/shared/ThemeMode';
import { useAppearance } from '@/components/shared/AppearanceProvider';
import { ACCENTS, CHART_PALETTES } from '@/lib/appearance';
import CustomizeSheet from '@/components/progress/CustomizeSheet';
import { CLIENT_VIEW_PANELS, isPanelVisible, parseClientViewPrefs } from '@/lib/display-prefs';
import { useI18n } from '@/lib/i18n';
import { useClientNav } from '@/lib/useClientNav';
import PrivacyRequests from '@/components/admin/PrivacyRequests';
import { MACRO_COLORS } from '@/lib/macro-colors';

/*
 * Settings — reorganized into anchored sections with a sticky pill nav:
 * Account · Body & Goals · Appearance · Language · Privacy.
 * Appearance is user-owned (lib/appearance.ts): accent, chart palette,
 * density, and the progress panel manager — applied live via CSS vars.
 * (Body-composition calculator moved to the Progress page where it belongs.)
 */

const ACTIVITY_OPTIONS: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
const GOAL_OPTIONS: Goal[] = ['fat_loss', 'muscle_gain', 'maintenance', 'recomp', 'endurance', 'health'];
const GOAL_ICONS: Record<Goal, string> = {
  fat_loss: 'i-flame', muscle_gain: 'i-dumbbell', maintenance: 'i-target',
  recomp: 'i-zap', endurance: 'i-shoe', health: 'i-heart',
};
// Text labels only — no emoji flags (house image rule).
const LANG_OPTIONS: { value: Language; code: string; native: string }[] = [
  { value: 'en', code: 'EN', native: 'English' },
  { value: 'es', code: 'ES', native: 'Español' },
  { value: 'el', code: 'EL', native: 'Ελληνικά' },
  { value: 'fr', code: 'FR', native: 'Français' },
  { value: 'de', code: 'DE', native: 'Deutsch' },
  { value: 'it', code: 'IT', native: 'Italiano' },
  { value: 'pt', code: 'PT', native: 'Português' },
  { value: 'nl', code: 'NL', native: 'Nederlands' },
];

const SECTIONS = [
  { id: 'account', labelKey: 'settings.nav_account' },
  { id: 'body', labelKey: 'settings.nav_body' },
  { id: 'appearance', labelKey: 'settings.nav_appearance' },
  { id: 'language', labelKey: 'settings.nav_language' },
  { id: 'privacy', labelKey: 'settings.nav_privacy' },
] as const;

function SectionCard({ id, title, icon, children, delay = 0 }: {
  id: string; title: string; icon: React.ReactNode; children: React.ReactNode; delay?: number;
}) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="glass p-5 mb-4"
      style={{ scrollMarginTop: 96 }}
    >
      <h3 className="text-[var(--content-secondary)] text-xs font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
        {icon} {title}
      </h3>
      {children}
    </motion.section>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [showPanelManager, setShowPanelManager] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('account');

  const { mode, toggleMode } = useThemeMode();
  const { prefs, setPrefs } = useAppearance();
  const { t, lang, setLang } = useI18n();
  const clientNav = useClientNav();
  const navRef = useRef<HTMLDivElement>(null);

  // Form state
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<Sex>('male');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [activity, setActivity] = useState<ActivityLevel>('moderate');
  const [goal, setGoal] = useState<Goal>('maintenance');
  const [language, setLanguage] = useState<Language>('en');

  const handleLangChange = (l: Language) => {
    setLanguage(l);
    setLang(l);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw new Error('profile_load_failed');
      if (!user) { router.push('/login'); return; }

      const [profRes, cpRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('client_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      ]);

      const loadFailure = profRes.error || cpRes.error;
      if (loadFailure || !profRes.data) {
        throw new Error('profile_load_failed');
      }
      if (!cpRes.data) {
        router.replace('/onboarding');
        return;
      }

      setProfile(profRes.data);
      setLanguage(profRes.data.language || 'en');
      const cp = cpRes.data;
      setClientProfile(cp);
      setAge(cp.age?.toString() ?? '');
      setSex(cp.sex ?? 'male');
      setHeightCm(cp.height_cm?.toString() ?? '');
      setWeightKg(cp.weight_kg?.toString() ?? '');
      setActivity(cp.activity_level ?? 'moderate');
      setGoal(cp.goal ?? 'maintenance');
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadData(); }, [loadData]);

  // Track which section is in view → highlight the nav pill
  useEffect(() => {
    if (loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActiveSection(e.target.id);
        }
      },
      { rootMargin: '-30% 0px -60% 0px' },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [loading]);

  const ageNum = Number(age);
  const heightNum = Number(heightCm);
  const weightNum = Number(weightKg);
  const bodyInputIssue = nutritionProfileInputIssue({
    age: ageNum,
    sex,
    height_cm: heightNum,
    weight_kg: weightNum,
    activityLevel: activity,
    goal,
  });
  const preview = !bodyInputIssue
    ? calculateFullProfile(weightNum, heightNum, ageNum, sex, activity, goal)
    : null;

  const handleSave = async () => {
    if (!clientProfile || !profile || saving) return;
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    let nutritionSaved = false;

    try {
      if (bodyInputIssue) {
        setSaveError(t('profile.invalid_body'));
        return;
      }

      const calc = calculateFullProfile(weightNum, heightNum, ageNum, sex, activity, goal);
      const updates = {
        age: ageNum, sex, height_cm: heightNum, weight_kg: weightNum,
        activity_level: activity, goal,
        bmr: calc.bmr, tdee: calc.tdee,
        target_calories: calc.calories, target_protein_g: calc.protein_g,
        target_carbs_g: calc.carbs_g, target_fat_g: calc.fat_g,
        target_fiber_g: calc.fiber_g, target_water_ml: calc.water_ml,
        updated_at: new Date().toISOString(),
      };

      const nutritionResult = await supabase
        .from('client_profiles')
        .update(updates)
        .eq('id', clientProfile.id)
        .select('id')
        .maybeSingle();
      if (nutritionResult.error || !nutritionResult.data) {
        setSaveError(t('profile.save_failed'));
        return;
      }

      nutritionSaved = true;
      setClientProfile((prev) => (prev ? { ...prev, ...updates } : prev));

      const languageResult = await supabase
        .from('profiles')
        .update({ language })
        .eq('id', profile.id)
        .select('id')
        .maybeSingle();
      if (languageResult.error || !languageResult.data) {
        setSaveError(t('profile.language_save_failed'));
        return;
      }

      setProfile((prev) => (prev ? { ...prev, language } : prev));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setSaveError(t(nutritionSaved ? 'profile.language_save_failed' : 'profile.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const viewPrefs = parseClientViewPrefs(
    (clientProfile as (ClientProfile & { client_view_prefs?: unknown }) | null)?.client_view_prefs,
  );
  const coachGates = {
    showCalories: isPanelVisible(CLIENT_VIEW_PANELS, viewPrefs, 'showCalories'),
    logAnalytics: isPanelVisible(CLIENT_VIEW_PANELS, viewPrefs, 'logAnalytics'),
    nutritionIntel: isPanelVisible(CLIENT_VIEW_PANELS, viewPrefs, 'nutritionIntel'),
  };

  if (loading) {
    return (
      <div className="min-h-screen pb-24" style={{ background: 'var(--bg,#0a0a0a)' }}>
        <div className="max-w-md mx-auto px-4 pt-12 space-y-4">
          <div className="h-7 w-32 rounded bg-stone-800/60 animate-pulse" />
          <div className="glass p-5 space-y-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-3 w-20 rounded bg-stone-800/60 animate-pulse" />
                <div className="h-11 w-full rounded-xl bg-stone-800/40 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ background: 'var(--canvas)' }}
      >
        <div className="glass w-full max-w-sm p-6 text-center">
          <p role="alert" className="mb-4 text-sm leading-relaxed text-[var(--content-secondary)]">
            {t('profile.load_failed')}
          </p>
          <button type="button" onClick={loadData} className="btn-gold w-full rounded-xl py-3 text-sm font-semibold">
            {t('food.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-[calc(6rem+env(safe-area-inset-bottom))]" style={{ background: 'var(--canvas)' }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-md mx-auto px-4 pt-8"
      >
        {/* ─── Account header ─── */}
        <div id="account" className="flex items-center gap-3 mb-4" style={{ scrollMarginTop: 96 }}>
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)' }}
          >
            <User size={22} style={{ color: 'var(--accent)' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="text-xl font-bold text-[var(--content-primary)]" style={{ letterSpacing: '-.02em' }}>
              {profile?.full_name ?? t('settings.nav_account')}
            </h1>
            <p className="text-[var(--content-muted)] text-xs" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile?.email}</p>
          </div>
        </div>

        {/* ─── Sticky section nav ─── */}
        <div
          ref={navRef}
          style={{
            position: 'sticky', top: 0, zIndex: 20, margin: '0 -16px 16px', padding: '10px 16px',
            background: 'color-mix(in srgb, var(--canvas) 88%, transparent)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none',
          }}
        >
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              style={{
                minHeight: 44, padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                cursor: 'pointer', transition: 'all .15s', flexShrink: 0,
                background: activeSection === s.id ? 'var(--accent-soft)' : 'rgba(255,255,255,.03)',
                border: `1px solid ${activeSection === s.id ? 'var(--accent)' : 'var(--line)'}`,
                color: activeSection === s.id ? 'var(--accent)' : 'var(--t3)',
              }}
            >
              {t(s.labelKey)}
            </button>
          ))}
        </div>

        {/* ─── Body & Goals ─── */}
        <SectionCard id="body" title={t('profile.body_stats')} icon={<Icon name="i-pulse" size={13} />} delay={0.05}>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-[var(--content-muted)] text-xs uppercase tracking-wider">{t('onboard.age')}</label>
              <input type="number" min="13" max="120" value={age} onChange={(e) => setAge(e.target.value)}
                className="input-dark text-sm mt-1" placeholder="30" />
            </div>
            <div>
              <label className="text-[var(--content-muted)] text-xs uppercase tracking-wider">{t('onboard.sex')}</label>
              <div className="flex gap-2 mt-1">
                {(['male', 'female'] as Sex[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSex(s)}
                    className={`min-h-11 flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
                      sex === s ? 'accent-chip-active bg-[var(--surface-2)]' : 'border-[var(--border-subtle)] text-[var(--content-secondary)]'
                    }`}
                  >
                    {t(s === 'male' ? 'onboard.male' : 'onboard.female')}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[var(--content-muted)] text-xs uppercase tracking-wider">{t('onboard.height')}</label>
              <input type="number" min="100" max="250" value={heightCm} onChange={(e) => setHeightCm(e.target.value)}
                className="input-dark text-sm mt-1" placeholder="175" />
            </div>
            <div>
              <label className="text-[var(--content-muted)] text-xs uppercase tracking-wider">{t('onboard.weight')}</label>
              <input type="number" min="20" max="300" step="0.1" value={weightKg} onChange={(e) => setWeightKg(e.target.value)}
                className="input-dark text-sm mt-1" placeholder="75" />
            </div>
          </div>

          <div className="mb-4">
            <label className="text-[var(--content-muted)] text-xs uppercase tracking-wider">{t('onboard.activity')}</label>
            <div className="space-y-1.5 mt-2">
              {ACTIVITY_OPTIONS.map((a) => (
                <button
                  key={a}
                  onClick={() => setActivity(a)}
                  className={`min-h-11 w-full text-left px-3 py-2.5 rounded-xl text-sm border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
                    activity === a ? 'accent-chip-active bg-[var(--surface-2)]' : 'border-[var(--border-subtle)] text-[var(--content-secondary)] hover:bg-[var(--surface-2)]'
                  }`}
                >
                  <span className="font-medium">{t(`activity.${a}`)}</span>
                  <span className="text-[var(--content-muted)] text-xs ml-2">
                    {ACTIVITY_DESCRIPTIONS[a][lang as keyof typeof ACTIVITY_DESCRIPTIONS[typeof a]] ?? ACTIVITY_DESCRIPTIONS[a].en}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[var(--content-muted)] text-xs uppercase tracking-wider">{t('onboard.your_goal')}</label>
            <div className="grid grid-cols-2 gap-1.5 mt-2">
              {GOAL_OPTIONS.map((g) => (
                <button
                  key={g}
                  onClick={() => setGoal(g)}
                  className={`min-h-11 text-left px-3 py-2.5 rounded-xl text-sm border transition-all flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
                    goal === g ? 'accent-chip-active bg-[var(--surface-2)]' : 'border-[var(--border-subtle)] text-[var(--content-secondary)] hover:bg-[var(--surface-2)]'
                  }`}
                >
                  <Icon
                    name={GOAL_ICONS[g] as Parameters<typeof Icon>[0]['name']}
                    size={11}
                    style={{ flexShrink: 0, color: goal === g ? 'var(--accent,#D4A853)' : 'var(--t4,#78716C)' }}
                  />
                  <span className="text-xs">{t(`goal.${g}`)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Macro preview */}
          {preview && (
            <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
              <div className="text-[var(--content-muted)] text-xs uppercase tracking-wider mb-3">{t('profile.calc_targets')}</div>
              <div className="grid grid-cols-3 gap-3 text-center mb-3">
                <div>
                  <p className="text-[var(--content-muted)] text-xs">BMR</p>
                  <p className="text-[var(--content-primary)] font-semibold">{preview.bmr}</p>
                </div>
                <div>
                  <p className="text-[var(--content-muted)] text-xs">TDEE</p>
                  <p className="text-[var(--content-primary)] font-semibold">{preview.tdee}</p>
                </div>
                <div>
                  <p className="text-[var(--content-muted)] text-xs">{t('profile.target')}</p>
                  <p className="font-bold" style={{ color: 'var(--accent)' }}>{preview.calories}</p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center pt-3 border-t border-[var(--border-subtle)]">
                {[
                  { v: `${preview.protein_g}g`, l: t('general.protein'), c: MACRO_COLORS.protein },
                  { v: `${preview.carbs_g}g`, l: t('general.carbs'), c: MACRO_COLORS.carbs },
                  { v: `${preview.fat_g}g`, l: t('general.fat'), c: MACRO_COLORS.fat },
                  { v: `${(preview.water_ml / 1000).toFixed(1)}L`, l: t('general.water'), c: MACRO_COLORS.water },
                ].map((m) => (
                  <div key={m.l}>
                    <p className="font-bold text-sm" style={{ color: m.c }}>{m.v}</p>
                    <p className="text-[var(--content-muted)] text-xs">{m.l}</p>
                  </div>
                ))}
              </div>
              {preview.macros_adjusted && (
                <p className="mt-3 text-xs leading-relaxed text-amber-300/80" role="note">
                  {t('profile.macros_adjusted')}
                </p>
              )}
            </div>
          )}
        </SectionCard>

        {/* ─── Appearance ─── */}
        <SectionCard id="appearance" title={t('settings.nav_appearance')} icon={<Palette size={14} />} delay={0.1}>
          {/* Theme mode */}
          <button
            onClick={toggleMode}
            className="min-h-11 w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm border border-[var(--border-subtle)] hover:bg-[var(--surface-2)] transition-all mb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            <span className="text-[var(--content-secondary)]">
              {mode === 'dark' ? t('profile.dark_mode') : t('profile.light_mode')}
            </span>
            <span className="theme-icon-in" key={mode}>
              {mode === 'dark' ? <Moon size={16} className="text-[var(--content-secondary)]" /> : <Sun size={16} className="text-amber-500" />}
            </span>
          </button>

          {/* Accent color */}
          <div className="mb-4">
            <div className="text-[var(--content-muted)] text-xs uppercase tracking-wider mb-2">{t('appearance.accent_title')}</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {ACCENTS.map((a) => {
                const on = prefs.accent === a.id;
                return (
                  <button
                    key={a.id}
                    aria-label={t(a.labelKey)}
                    aria-pressed={on}
                    title={t(a.labelKey)}
                    onClick={() => setPrefs({ ...prefs, accent: a.id })}
                    style={{
                      width: 44, height: 44, borderRadius: '50%', cursor: 'pointer',
                      background: a.value,
                      border: '3px solid',
                      borderColor: on ? 'var(--t1,#FAFAF9)' : 'transparent',
                      outline: on ? `2px solid ${a.value}` : 'none',
                      outlineOffset: 2,
                      transition: 'transform .15s, border-color .15s',
                      transform: on ? 'scale(1.08)' : 'scale(1)',
                    }}
                  />
                );
              })}
            </div>
            <div className="ds-sub" style={{ fontSize: 10, marginTop: 8 }}>
              {t('appearance.accent_hint')}
            </div>
          </div>

          {/* Chart palette */}
          <div className="mb-4">
            <div className="text-[var(--content-muted)] text-xs uppercase tracking-wider mb-2">{t('appearance.palette_title')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {CHART_PALETTES.map((p) => {
                const on = prefs.palette === p.id;
                const accentHex = ACCENTS.find((a) => a.id === prefs.accent)?.value ?? '#D4A853';
                const swatches = [p.colors.cal, p.colors.protein, p.colors.carbs, p.colors.fat, p.colors.fiber]
                  .map((c) => (c === 'accent' ? accentHex : c));
                return (
                  <button
                    key={p.id}
                    aria-pressed={on}
                    onClick={() => setPrefs({ ...prefs, palette: p.id })}
                    style={{
                      minHeight: 44, padding: '10px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                      background: on ? 'var(--accent-soft)' : 'rgba(255,255,255,.02)',
                      border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
                      transition: 'all .15s',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 3, marginBottom: 6, alignItems: 'flex-end', height: 20 }}>
                      {swatches.map((c, i) => (
                        <span key={i} style={{
                          width: 10, borderRadius: 2, background: c,
                          height: [20, 14, 17, 11, 15][i],
                        }} />
                      ))}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: on ? 'var(--accent)' : 'var(--t3)' }}>
                      {t(p.labelKey)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Density */}
          <div className="mb-4">
            <div className="text-[var(--content-muted)] text-xs uppercase tracking-wider mb-2">{t('appearance.density_title')}</div>
            <div className="flex gap-2">
              {(['comfortable', 'compact'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setPrefs({ ...prefs, density: d })}
                  className={`min-h-11 flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
                    prefs.density === d ? 'accent-chip-active bg-[var(--surface-2)]' : 'border-[var(--border-subtle)] text-[var(--content-secondary)]'
                  }`}
                >
                  {t(d === 'comfortable' ? 'appearance.density_comfortable' : 'appearance.density_compact')}
                </button>
              ))}
            </div>
          </div>

          {/* Progress panel manager */}
          <button
            onClick={() => setShowPanelManager(true)}
            className="min-h-11 w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm border border-[var(--border-subtle)] hover:bg-[var(--surface-2)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            <span className="text-[var(--content-secondary)] flex items-center gap-2">
              <SlidersHorizontal size={14} />
              {t('appearance.manage_panels')}
            </span>
            <span className="ds-sub" style={{ fontSize: 10 }}>{t('appearance.manage_panels_hint')}</span>
          </button>
        </SectionCard>

        {/* ─── Language ─── */}
        <SectionCard id="language" title={t('general.language')} icon={<Globe size={14} />} delay={0.15}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {LANG_OPTIONS.map((l) => {
              const on = language === l.value;
              return (
                <button
                  key={l.value}
                  onClick={() => handleLangChange(l.value)}
                  className={`min-h-11 py-2.5 px-3 rounded-xl text-sm border transition-all text-left flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
                    on ? 'accent-chip-active bg-[var(--surface-2)]' : 'border-[var(--border-subtle)] text-[var(--content-secondary)]'
                  }`}
                >
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                    padding: '2px 6px', borderRadius: 6,
                    background: on ? 'var(--accent-soft)' : 'rgba(255,255,255,.05)',
                  }}>
                    {l.code}
                  </span>
                  <span className="text-xs font-medium">{l.native}</span>
                </button>
              );
            })}
          </div>
        </SectionCard>

        {/* ─── Save ─── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          {saveError && (
            <div
              role="alert"
              className="mb-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-300"
            >
              {saveError}
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
              saved ? 'bg-green-500/15 text-green-400 border border-green-500/20' : 'btn-gold'
            }`}
          >
            {saved ? (
              <>{t('profile.saved')}</>
            ) : saving ? (
              <>{t('profile.saving')}</>
            ) : (
              <>
                <Save size={16} /> {t('profile.save_profile')}
              </>
            )}
          </button>
        </motion.div>

        {/* ─── Privacy & data ─── */}
        <SectionCard id="privacy" title={t('settings.nav_privacy')} icon={<ShieldCheck size={14} />} delay={0.25}>
          <a
            href="/api/privacy/export"
            className="min-h-11 w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm border border-[var(--border-subtle)] hover:bg-[var(--surface-2)] transition-all mb-3 no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            <span className="text-[var(--content-secondary)] flex items-center gap-2">
              <Download size={14} />
              {t('settings.export_data')}
            </span>
            <span className="ds-sub" style={{ fontSize: 10 }}>JSON</span>
          </a>
          <PrivacyRequests />
        </SectionCard>

        {/* ─── Logout ─── */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-2 mb-4">
          <button
            onClick={handleLogout}
            className="w-full py-3 rounded-xl text-sm font-medium text-red-400 border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 transition-all flex items-center justify-center gap-2"
          >
            <LogOut size={16} /> {t('profile.log_out')}
          </button>
        </motion.div>
      </motion.div>

      <CustomizeSheet open={showPanelManager} onClose={() => setShowPanelManager(false)} coachGates={coachGates} />
      <BotNav routes={clientNav} />
    </div>
  );
}

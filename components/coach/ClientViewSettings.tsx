'use client';

/**
 * Trophē — per-client view settings editor ("What this client sees").
 *
 * Coach-facing toggles for CLIENT_VIEW_PANELS keys, persisted to
 * client_profiles.client_view_prefs (migration 0050, coach-update RLS).
 * Replaces the hardcoded lib/client-view.ts module constants — the client
 * surface reads these prefs; this component only edits them.
 *
 * Contract: stores ONLY overrides vs the defaults in lib/display-prefs.ts.
 */

import { useEffect, useState, useCallback } from 'react';
import { Eye } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import {
  CLIENT_VIEW_PANELS,
  parseClientViewPrefs,
  isPanelVisible,
  type ClientViewPanelId,
} from '@/lib/display-prefs';

// `label`/`hint` are i18n keys — resolved with t() at render.
const TOGGLES: Array<{ id: ClientViewPanelId; label: string; hint: string }> = [
  { id: 'showCalories', label: 'coach.clientView.showCalories', hint: 'coach.clientView.showCaloriesHint' },
  { id: 'showFoodIdeas', label: 'coach.clientView.showFoodIdeas', hint: 'coach.clientView.showFoodIdeasHint' },
  { id: 'logAnalytics', label: 'coach.clientView.logAnalytics', hint: 'coach.clientView.logAnalyticsHint' },
  { id: 'nutritionIntel', label: 'coach.clientView.nutritionIntel', hint: 'coach.clientView.nutritionIntelHint' },
  { id: 'smartInsight', label: 'coach.clientView.smartInsight', hint: 'coach.clientView.smartInsightHint' },
  { id: 'weeklyCheckin', label: 'coach.clientView.weeklyCheckin', hint: 'coach.clientView.weeklyCheckinHint' },
];

export default function ClientViewSettings({ clientId }: { clientId: string }) {
  const { t } = useI18n();
  const [overrides, setOverrides] = useState<Partial<Record<ClientViewPanelId, boolean>>>({});
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('client_profiles')
        .select('client_view_prefs')
        .eq('user_id', clientId)
        .maybeSingle();
      if (cancelled) return;
      setOverrides(parseClientViewPrefs(data?.client_view_prefs));
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const toggle = useCallback(
    async (id: ClientViewPanelId) => {
      if (!loaded || saveState === 'saving') return;
      const current = isPanelVisible(CLIENT_VIEW_PANELS, overrides, id);
      const nextValue = !current;

      // Overrides-only storage: drop keys that match the default.
      const next: Partial<Record<ClientViewPanelId, boolean>> = { ...overrides };
      if (nextValue === CLIENT_VIEW_PANELS[id]) delete next[id];
      else next[id] = nextValue;

      const prev = overrides;
      setOverrides(next);
      setSaveState('saving');
      const { error } = await supabase
        .from('client_profiles')
        .update({ client_view_prefs: next, updated_at: new Date().toISOString() })
        .eq('user_id', clientId);
      if (error) {
        console.error('Error saving client view prefs:', error);
        setOverrides(prev);
        setSaveState('error');
        setTimeout(() => setSaveState('idle'), 2500);
      } else {
        setSaveState('saved');
        setTimeout(() => setSaveState('idle'), 1500);
      }
    },
    [clientId, loaded, overrides, saveState],
  );

  return (
    <div className="glass p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold text-[var(--content-primary)] text-sm flex items-center gap-2">
          <Eye size={14} className="text-[#D4A853]" />
          {t('coach.clientView.title')}
        </h2>
        <span className="text-xs text-[var(--content-muted)] font-mono">
          {saveState === 'saving'
            ? t('coach.clientView.saving')
            : saveState === 'saved'
            ? `✓ ${t('coach.clientView.saved')}`
            : saveState === 'error'
            ? t('coach.clientView.saveFailed')
            : t('coach.clientView.appliesTo')}
        </span>
      </div>
      {!loaded ? (
        <div className="space-y-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-9 rounded-lg bg-[var(--surface-hover)] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          {TOGGLES.map((row) => {
            const on = isPanelVisible(CLIENT_VIEW_PANELS, overrides, row.id);
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => toggle(row.id)}
                className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] w-full min-h-[44px] flex items-center justify-between gap-3 py-1.5 text-left group"
                aria-pressed={on}
              >
                <span className="min-w-0">
                  <span
                    className={`block text-xs font-medium ${
                      on ? 'text-[var(--content-primary)]' : 'text-[var(--content-secondary)]'
                    } group-hover:text-[var(--content-primary)] transition-colors`}
                  >
                    {t(row.label)}
                  </span>
                  <span className="block text-xs text-[var(--content-muted)] truncate">{t(row.hint)}</span>
                </span>
                <span
                  className={`w-9 h-5 rounded-full shrink-0 transition-colors relative ${
                    on ? 'bg-[#D4A853]' : 'bg-[var(--surface-hover)]'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-[var(--surface-2)] shadow-sm transition-transform ${
                      on ? 'translate-x-[18px]' : 'translate-x-0.5'
                    }`}
                  />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

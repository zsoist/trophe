'use client';

import { useCallback } from 'react';
import { useI18n } from '@/lib/i18n';
import { interpolateTranslation } from '@/lib/i18n-interpolate';
import { coachAssistantTranslations } from '@/lib/locales/coach-assistant';
import type { CoreLanguage } from '@/lib/types';

/** Feature copy follows the shared locale/interpolation, but loads only with this surface. */
export function useCoachI18n() {
  const i18n = useI18n();
  const { lang, t: shared } = i18n;
  const t = useCallback((key: string, values?: Record<string, string | number>) => {
    const row = coachAssistantTranslations[key];
    return row ? interpolateTranslation(row[lang as CoreLanguage] ?? row.en, values) : shared(key, values);
  }, [lang, shared]);
  return { ...i18n, t };
}

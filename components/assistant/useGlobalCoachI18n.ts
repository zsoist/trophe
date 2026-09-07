'use client';
import { useI18n } from '@/lib/i18n';
import { globalCoachTranslations } from '@/lib/locales/global-coach';
import { interpolateTranslation } from '@/lib/i18n-interpolate';
import type { CoreLanguage } from '@/lib/types';
export function useGlobalCoachI18n() {
  const i18n = useI18n();
  return { ...i18n, t: (key: string, values?: Record<string, string | number>) => {
    const row = globalCoachTranslations[key];
    return row ? interpolateTranslation(row[i18n.lang as CoreLanguage] ?? row.en, values) : i18n.t(key, values);
  } };
}

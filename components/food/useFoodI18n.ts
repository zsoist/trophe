'use client';
import { useCallback } from 'react';
import { useI18n } from '@/lib/i18n';
import { foodLoggingTranslations } from '@/lib/locales/food-logging';
import { interpolateTranslation } from '@/lib/i18n-interpolate';

export function useFoodI18n() {
  const context = useI18n();
  const { lang, t: sharedTranslate } = context;
  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    const entry = foodLoggingTranslations[key];
    if (!entry) return sharedTranslate(key, params);
    if (lang === 'en' || lang === 'es' || lang === 'el') return interpolateTranslation(entry[lang], params);
    const overlay = sharedTranslate(key, params);
    return overlay !== key ? overlay : interpolateTranslation(entry.en, params);
  }, [lang, sharedTranslate]);
  return { ...context, t };
}

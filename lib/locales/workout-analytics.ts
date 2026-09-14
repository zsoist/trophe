// Compatibility exports; runtime consumers import core or lazy overlays directly.
import type { Language } from '@/lib/types';
import { workoutAnalyticsEn, workoutAnalyticsEs, workoutAnalyticsEl, type WorkoutAnalyticsLocale } from './workout-analytics-core';
import { workoutAnalyticsDe, workoutAnalyticsFr, workoutAnalyticsIt, workoutAnalyticsPt, workoutAnalyticsNl } from './workout-analytics-overlays';
export * from './workout-analytics-core';
export * from './workout-analytics-overlays';

export const workoutAnalyticsCopy: Record<Language, WorkoutAnalyticsLocale> = {
  en: workoutAnalyticsEn,
  es: workoutAnalyticsEs,
  el: workoutAnalyticsEl,
  de: workoutAnalyticsDe,
  fr: workoutAnalyticsFr,
  it: workoutAnalyticsIt,
  pt: workoutAnalyticsPt,
  nl: workoutAnalyticsNl,
};

// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const locale = vi.hoisted(() => ({ value: 'es' as 'es' | 'el' | 'de' }));

vi.mock('@/lib/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/i18n')>();
  const { de } = await import('@/lib/locales/de');
  return {
    ...actual,
    useI18n: () => ({
      lang: locale.value,
      t: (key: string, params?: Record<string, string | number>) => {
        const source = locale.value === 'de' ? de[key] : actual.translations[key]?.[locale.value];
        return (source ?? key).replace(/\{(\w+)\}/g, (_match, name: string) => String(params?.[name] ?? `{${name}}`));
      },
    }),
  };
});

import { WorkoutCalendar } from '@/components/workout/analytics/WorkoutCalendar';
import { ExerciseProgressChart } from '@/components/workout/analytics/ExerciseProgressChart';
import { WorkoutSummaryMetrics } from '@/components/workout/analytics/WorkoutSummaryMetrics';

afterEach(cleanup);

describe('Task 9 rendered locale parity', () => {
  it.each([
    ['es', 'Calendario de entrenamientos', 'Duración', 'series de trabajo'],
    ['el', 'Ημερολόγιο προπονήσεων', 'Διάρκεια', 'σετ εργασίας'],
    ['de', 'Trainingskalender', 'Dauer', 'Arbeitssätze'],
  ] as const)('renders calendar, progress, dates, and units coherently in %s', (language, calendarName, duration, workingSets) => {
    locale.value = language;
    render(<>
      <WorkoutCalendar month="2026-09" scheduled={['2026-09-03']} completed={['2026-09-03']} today="2026-09-03" />
      <WorkoutSummaryMetrics sessions={[{ id: 'session', durationMinutes: 45, sets: [{ completed: true, isWarmup: false, weightKg: 80, reps: 5 }] }]} />
      <ExerciseProgressChart exerciseName="Barbell Bench Press" data={[
        { sessionId: 'a', date: '2026-09-01', weightKg: 75, reps: 5 },
        { sessionId: 'b', date: '2026-09-03', weightKg: 80, reps: 5 },
      ]} />
    </>);

    expect(screen.getByRole('grid', { name: new RegExp(calendarName, 'i') })).toBeTruthy();
    expect(screen.getByText(duration)).toBeTruthy();
    expect(screen.getAllByText(new RegExp(workingSets, 'i')).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/Workout calendar|Previous month|Working sets|Lifted volume|Personal records|completed weight progression/i);
  });
});

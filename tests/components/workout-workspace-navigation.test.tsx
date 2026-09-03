// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { workoutBackRoute, WORKOUT_ROUTES, workoutRouteForStage } from '@/lib/workout/workspace-routes';

let pathname: string = WORKOUT_ROUTES.live;
const storageValues = new Map<string, string>();
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storageValues.get(key) ?? null,
    setItem: (key: string, value: string) => storageValues.set(key, value),
    removeItem: (key: string) => storageValues.delete(key),
    clear: () => storageValues.clear(),
  },
});

const locale = vi.hoisted(() => ({
  language: 'en',
  copy: {
    en: ['Back', 'Review Workout', 'Workout Home', 'Paused', 'Back to Workout Home', 'Live Workout', 'Live'],
    es: ['Atrás', 'Revisar entrenamiento', 'Inicio de entrenamientos', 'Pausado', 'Volver al inicio de entrenamientos'],
    el: ['Πίσω', 'Έλεγχος προπόνησης', 'Αρχική προπονήσεων', 'Σε παύση', 'Πίσω στην αρχική προπονήσεων'],
    fr: ['Retour', 'Vérifier l’entraînement', 'Accueil entraînement', 'En pause', 'Retour à l’accueil des entraînements'],
    de: ['Zurück', 'Training prüfen', 'Trainingsstartseite', 'Pausiert', 'Zurück zur Trainingsstartseite'],
    it: ['Indietro', 'Rivedi allenamento', 'Home allenamenti', 'In pausa', 'Torna alla home degli allenamenti'],
    pt: ['Voltar', 'Rever treino', 'Início dos treinos', 'Em pausa', 'Voltar ao início dos treinos'],
    nl: ['Terug', 'Training controleren', 'Trainingshome', 'Gepauzeerd', 'Terug naar Trainingshome'],
  } as Record<string, string[]>,
}));

vi.mock('next/navigation', () => ({ usePathname: () => pathname, useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const [back, review, home, paused, backHome, liveTitle = 'Live Workout', live = 'Live'] = locale.copy[locale.language];
      const values: Record<string, string> = {
        'workout.workspace_back': back,
        'workout.workspace_review_title': review,
        'workout.workspace_home_title': home,
        'workout.workspace_status_paused': paused,
        'workout.back_home': backHome,
        'workout.workspace_live_title': liveTitle,
        'workout.workspace_exercises_title': 'Exercises',
        'workout.history': 'History',
        'workout.stats': 'Stats',
        'workout.form_check': 'Form Check',
        'workout.workspace_status_live': live,
        'workout.workspace_status_draft': 'Draft',
        'workout.workspace_status_label': String(params?.status ?? ''),
        'workout.weight_unit_label': `Weight unit: ${String(params?.unit ?? '')}`,
        'workout.weight_unit_switch': `Switch to ${String(params?.unit ?? '')}`,
      };
      return values[key] ?? key;
    },
  }),
}));
vi.mock('@/components/workout/workspace/WorkoutWorkspaceProvider', () => ({
  useWorkoutWorkspace: () => ({ state: { stage: 'home' } }),
}));

import { WorkoutWorkspaceHeader } from '@/components/workout/workspace/WorkoutWorkspaceHeader';

afterEach(() => {
  cleanup();
  locale.language = 'en';
  window.localStorage.removeItem('trophe_weight_unit');
});

describe('workout workspace navigation', () => {
  it('maps workspace stages to their routed workspaces', () => {
    expect(WORKOUT_ROUTES).toEqual({
      home: '/dashboard/workout',
      build: '/dashboard/workout/build',
      review: '/dashboard/workout/review',
      live: '/dashboard/workout/live',
      exercises: '/dashboard/workout/exercises',
    });
    expect(workoutRouteForStage('draft')).toBe(WORKOUT_ROUTES.build);
    expect(workoutRouteForStage('review')).toBe(WORKOUT_ROUTES.review);
    expect(workoutRouteForStage('live')).toBe(WORKOUT_ROUTES.live);
    expect(workoutRouteForStage('paused')).toBe(WORKOUT_ROUTES.live);
    expect(workoutRouteForStage('completed')).toBe(WORKOUT_ROUTES.live);
  });

  it.each([
    [WORKOUT_ROUTES.build, 'draft', WORKOUT_ROUTES.home],
    [WORKOUT_ROUTES.review, 'review', WORKOUT_ROUTES.build],
    [WORKOUT_ROUTES.exercises, 'draft', WORKOUT_ROUTES.build],
    [WORKOUT_ROUTES.exercises, 'review', WORKOUT_ROUTES.review],
    [`${WORKOUT_ROUTES.exercises}/bench`, 'review', WORKOUT_ROUTES.exercises],
  ] as const)('maps visible Back from %s in %s to its previous workspace stage', (route, stage, expected) => {
    expect(workoutBackRoute(route, stage)).toBe(expected);
  });

  it('keeps deterministic edit and replacement return paths on exercise routes', () => {
    expect(workoutBackRoute(`${WORKOUT_ROUTES.exercises}/bench`, 'draft', { returnRoute: 'build' })).toBe(WORKOUT_ROUTES.build);
    expect(workoutBackRoute(`${WORKOUT_ROUTES.exercises}/row`, 'review', { replaceExerciseId: 'bench', returnRoute: 'review' })).toBe(`${WORKOUT_ROUTES.exercises}?replace=bench&return=review`);
    expect(workoutBackRoute(WORKOUT_ROUTES.exercises, 'review', { replaceExerciseId: 'bench', returnRoute: 'review' })).toBe(WORKOUT_ROUTES.review);
  });

  it('keeps route-aware Back distinct from the explicit Workout Home action', () => {
    pathname = WORKOUT_ROUTES.review;
    render(<WorkoutWorkspaceHeader stage="review" />);

    expect(screen.getByRole('link', { name: /^Back$/i }).getAttribute('href')).toBe(WORKOUT_ROUTES.build);
    expect(screen.getByRole('heading', { name: 'Review Workout' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Workout Home' }).getAttribute('href')).toBe(WORKOUT_ROUTES.home);
    expect(screen.getByText('Draft')).toBeTruthy();
  });

  it('keeps complete workspace titles compact on the narrowest phones', () => {
    pathname = WORKOUT_ROUTES.review;
    render(<WorkoutWorkspaceHeader stage="review" />);

    const title = screen.getByRole('heading', { name: 'Review Workout' });
    expect(title.className).toContain('text-sm');
    expect(title.className).toContain('min-[375px]:text-base');
  });

  it('does not repeat home controls on the workspace landing route', () => {
    pathname = WORKOUT_ROUTES.home;
    render(<WorkoutWorkspaceHeader stage="draft" />);

    expect(screen.queryByRole('link', { name: /Back/i })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Workout Home' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Workout Home' })).toBeTruthy();
    expect(screen.queryByText('Draft')).toBeNull();
    expect(screen.queryByLabelText('Draft')).toBeNull();
  });

  it('exposes and persists the weight-unit preference on Workout Home', async () => {
    pathname = WORKOUT_ROUTES.home;
    window.localStorage.setItem('trophe_weight_unit', 'kg');
    render(<WorkoutWorkspaceHeader stage="home" />);

    const toggle = screen.getByRole('button', { name: 'Weight unit: kg' });
    expect(toggle.textContent).toBe('kg');
    expect(toggle.getAttribute('title')).toBe('Switch to lb');
    fireEvent.click(toggle);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Weight unit: lb' }).textContent).toBe('lb'));
    expect(window.localStorage.getItem('trophe_weight_unit')).toBe('lb');
  });

  it('shows a preserved draft status on Build instead of leaking it onto Home', () => {
    pathname = WORKOUT_ROUTES.build;
    render(<WorkoutWorkspaceHeader stage="draft" />);

    expect(screen.getByRole('heading', { name: 'workout.workspace_build_title' })).toBeTruthy();
    expect(screen.getByLabelText('Draft')).toBeTruthy();
  });

  it('keeps the Exercises workspace title on an addressable exercise detail route', () => {
    pathname = '/dashboard/workout/exercises/bench';
    render(<WorkoutWorkspaceHeader stage="draft" />);

    expect(screen.getByRole('heading', { name: 'Exercises' })).toBeTruthy();
  });

  it.each([
    ['/dashboard/workout/history', 'History'],
    ['/dashboard/workout/stats', 'Stats'],
    ['/dashboard/workout/form-check', 'Form Check'],
  ])('owns the single canonical support-page heading for %s', (route, title) => {
    pathname = route;
    render(<WorkoutWorkspaceHeader stage="home" />);
    expect(screen.getAllByRole('heading', { name: title })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Back' }).getAttribute('href')).toBe(WORKOUT_ROUTES.home);
  });

  it.each([
    ['en', 'Back', 'Review Workout', 'Workout Home', 'Paused'],
    ['es', 'Atrás', 'Revisar entrenamiento', 'Inicio de entrenamientos', 'Pausado'],
    ['el', 'Πίσω', 'Έλεγχος προπόνησης', 'Αρχική προπονήσεων', 'Σε παύση'],
    ['fr', 'Retour', 'Vérifier l’entraînement', 'Accueil entraînement', 'En pause'],
    ['de', 'Zurück', 'Training prüfen', 'Trainingsstartseite', 'Pausiert'],
    ['it', 'Indietro', 'Rivedi allenamento', 'Home allenamenti', 'In pausa'],
    ['pt', 'Voltar', 'Rever treino', 'Início dos treinos', 'Em pausa'],
    ['nl', 'Terug', 'Training controleren', 'Trainingshome', 'Gepauzeerd'],
  ] as const)('renders complete localized header chrome in %s', async (language, back, title, home, paused) => {
    locale.language = language;
    pathname = WORKOUT_ROUTES.review;
    render(<WorkoutWorkspaceHeader stage="paused" />);

    await waitFor(() => expect(screen.getByRole('heading', { name: title })).toBeTruthy());
    const backLink = screen.getByText(back).closest('a');
    expect(backLink?.getAttribute('href')).toBe(WORKOUT_ROUTES.build);
    expect(backLink?.getAttribute('aria-label')).toBeTruthy();
    if (language !== 'en') expect(backLink?.getAttribute('aria-label')).not.toContain('Workout Home');
    expect(screen.getByRole('link', { name: home })).toBeTruthy();
    expect(screen.getByText(paused)).toBeTruthy();
    if (language !== 'en') expect(document.body.textContent).not.toContain('Workout Home');
  });
});

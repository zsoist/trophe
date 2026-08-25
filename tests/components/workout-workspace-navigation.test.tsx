// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WORKOUT_ROUTES, workoutRouteForStage } from '@/lib/workout/workspace-routes';

let pathname: string = WORKOUT_ROUTES.live;

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

vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
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
        'workout.workspace_status_live': live,
        'workout.workspace_status_label': String(params?.status ?? ''),
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
    expect(workoutRouteForStage('completed')).toBe(WORKOUT_ROUTES.home);
  });

  it('renders a labeled Back action, the title, Workout Home, and live status', () => {
    pathname = WORKOUT_ROUTES.live;
    render(<WorkoutWorkspaceHeader stage="live" />);

    expect(screen.getByRole('link', { name: /Back/i }).getAttribute('href')).toBe(WORKOUT_ROUTES.home);
    expect(screen.getByRole('heading', { name: 'Live Workout' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Workout Home' }).getAttribute('href')).toBe(WORKOUT_ROUTES.home);
    expect(screen.getByText('Live')).toBeTruthy();
  });

  it('does not repeat home controls on the workspace landing route', () => {
    pathname = WORKOUT_ROUTES.home;
    render(<WorkoutWorkspaceHeader stage="home" />);

    expect(screen.queryByRole('link', { name: /Back/i })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Workout Home' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Workout Home' })).toBeTruthy();
    expect(screen.queryByText('workout.workspace_status_draft')).toBeNull();
    expect(screen.queryByLabelText(/Workout status/i)).toBeNull();
  });

  it('keeps the Exercises workspace title on an addressable exercise detail route', () => {
    pathname = '/dashboard/workout/exercises/bench';
    render(<WorkoutWorkspaceHeader stage="draft" />);

    expect(screen.getByRole('heading', { name: 'Exercises' })).toBeTruthy();
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
    expect(backLink?.getAttribute('href')).toBe(WORKOUT_ROUTES.home);
    expect(backLink?.getAttribute('aria-label')).toBeTruthy();
    if (language !== 'en') expect(backLink?.getAttribute('aria-label')).not.toContain('Workout Home');
    expect(screen.getByRole('link', { name: home })).toBeTruthy();
    expect(screen.getByText(paused)).toBeTruthy();
    if (language !== 'en') expect(document.body.textContent).not.toContain('Workout Home');
  });
});

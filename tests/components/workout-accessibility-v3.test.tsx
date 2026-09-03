// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import { PlanExerciseCard } from '@/components/workout/workspace/PlanExerciseCard';

afterEach(cleanup);

describe('workout edit accessibility v3', () => {
  it('names every exercise-specific icon action in the active locale and preserves complete media alternatives', async () => {
    render(<I18nProvider defaultLang="de"><PlanExerciseCard
      draftExercise={{ exerciseId: 'bench', exerciseName: 'Bankdrücken', muscleGroup: 'chest', targetSets: 3, targetReps: '8' }}
      exercise={{ id: 'bench', name: 'Bench Press', muscle_group: 'chest', equipment: 'Barbell' }}
      index={1} total={3} onTechnique={() => undefined}
    /></I18nProvider>);

    expect(await screen.findByRole('button', { name: 'Bankdrücken nach vorne verschieben' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bankdrücken nach hinten verschieben' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bankdrücken ersetzen' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Technik für Bankdrücken ansehen' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bankdrücken entfernen' })).toBeTruthy();
    expect(screen.getByRole('img').getAttribute('alt')).toContain('Bankdrücken');
  });
});

// @vitest-environment jsdom
/**
 * Regression: the dashboard muscle-map camera side is stateful, but the
 * Worked/Planned training-state tabs swap the whole activation set. A back-side
 * orientation left over from the previous tab used to persist onto a new state
 * whose muscles are all on the front, leaving the user looking at an empty back
 * silhouette. Switching training state must re-frame the side the new state shows
 * (and must not needlessly jump when the new state still has muscles on the
 * current side).
 */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import { WorkoutAtlasHome } from '@/components/workout/workspace/WorkoutAtlasHome';
import type { MuscleActivation } from '@/lib/workout/anatomy';

afterEach(cleanup);

const frontMuscle: MuscleActivation = { id: 'pectoralis-major', label: 'Pectoralis major', role: 'primary', view: 'front', confidence: 'curated' };
const backMuscle: MuscleActivation = { id: 'triceps-brachii', label: 'Triceps brachii', role: 'primary', view: 'back', confidence: 'curated' };

function renderHome(activations: MuscleActivation[], workedActivations: MuscleActivation[]) {
  render(
    <I18nProvider defaultLang="en">
      <WorkoutAtlasHome activations={activations} workedActivations={workedActivations} workedAvailable targetLabel="Chest" />
    </I18nProvider>,
  );
}

describe('WorkoutAtlasHome training-state switches re-frame the muscle map', () => {
  it('leaves an empty back orientation when the incoming planned state is front-only', () => {
    renderHome([frontMuscle], [backMuscle]);

    // The worked state is a back muscle; orienting to its side.
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('group', { name: 'Back anatomy map' })).toBeTruthy();

    // The planned state is front-only, so the back orientation is now empty.
    fireEvent.click(screen.getByRole('button', { name: /^Planned/ }));
    expect(screen.getByRole('button', { name: 'Front' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('group', { name: 'Front anatomy map' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Back anatomy map' })).toBeNull();
  });

  it('keeps the current side when the incoming state still has muscles on it', () => {
    // Planned spans both sides, so a back orientation the user chose is still valid.
    renderHome([frontMuscle, backMuscle], [backMuscle]);

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: 'Back' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: /^Planned/ }));
    expect(screen.getByRole('button', { name: 'Back' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('group', { name: 'Back anatomy map' })).toBeTruthy();
  });
});

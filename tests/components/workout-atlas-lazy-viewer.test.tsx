// @vitest-environment jsdom
import React, { useEffect } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import fixture from '../anatomy/catalogue.fixture.json';
import type { CanvasProps } from '../../components/anatomy/AtlasCanvas';
import type { MuscleActivation } from '@/lib/workout/anatomy';

const observed = vi.hoisted(() => ({ props: null as CanvasProps | null }));
vi.mock('next/dynamic', () => ({
  default: () => function Canvas(props: CanvasProps) {
    observed.props = props;
    useEffect(() => { props.onProgress(1, 1); }, [props]);
    return <div data-testid="atlas-canvas" />;
  },
}));
vi.mock('../../lib/anatomy/validation', () => ({ fetchAtlasManifest: vi.fn(async () => fixture) }));

import { WorkoutAtlasHome } from '@/components/workout/workspace/WorkoutAtlasHome';
import { WorkoutAnatomySource } from '@/components/anatomy/WorkoutAnatomySource';
import { fetchAtlasManifest } from '../../lib/anatomy/validation';
import { I18nProvider } from '../../lib/i18n';

const activations: MuscleActivation[] = [
  { id: 'pectoralis-major', label: 'Pectoralis major', role: 'primary', view: 'front', confidence: 'curated' },
  { id: 'triceps-brachii', label: 'Triceps brachii', role: 'secondary', view: 'front', confidence: 'curated' },
];

afterEach(() => { cleanup(); vi.clearAllMocks(); observed.props = null; });

it('does not mount or request the 3D viewer until the user asks to explore', async () => {
  render(
    <I18nProvider defaultLang="en">
      <WorkoutAnatomySource.Provider value={{ manifestUrl: '/anatomy/review/manifest.json' }}>
        <WorkoutAtlasHome activations={activations} targetLabel="Chest" />
      </WorkoutAnatomySource.Provider>
    </I18nProvider>,
  );

  const explore = screen.getByTestId('workout-atlas-explore');
  expect(fetchAtlasManifest).not.toHaveBeenCalled();
  expect(screen.queryByTestId('atlas-canvas')).toBeNull();
  expect(observed.props).toBeNull();

  fireEvent.click(explore);
  await waitFor(() => expect(observed.props).not.toBeNull());
  expect(fetchAtlasManifest).toHaveBeenCalledWith('/anatomy/review/manifest.json', expect.anything());
});

it('falls back to the compact muscle map without any manifest request when no private source is enabled', () => {
  render(
    <I18nProvider defaultLang="en">
      <WorkoutAtlasHome activations={activations} targetLabel="Chest" />
    </I18nProvider>,
  );

  expect(fetchAtlasManifest).not.toHaveBeenCalled();
  expect(screen.queryByTestId('workout-atlas-explore')).toBeNull();
  expect(screen.getByRole('group', { name: 'Front anatomy map' })).toBeTruthy();
});

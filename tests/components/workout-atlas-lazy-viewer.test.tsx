// @vitest-environment jsdom
/**
 * V3 progressive viewer mount.
 *
 * The real 3D viewer is the dashboard body and mounts when its stage becomes
 * visible (IntersectionObserver visibility intent). It must never request a
 * manifest or mount a canvas while the stage is hidden or off-screen, and the
 * private source gate must stay closed with zero manifest requests.
 */
import React, { useEffect } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fixture from '../anatomy/catalogue.fixture.json';
import type { CanvasProps } from '../../components/anatomy/AtlasCanvas';
import type { MuscleActivation } from '@/lib/workout/anatomy';

const observed = vi.hoisted(() => ({ props: null as CanvasProps | null }));
const stageObservers = vi.hoisted(() => [] as { callback: IntersectionObserverCallback; targets: Element[] }[]);

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

class MockIntersectionObserver {
  root = null;
  rootMargin = '';
  thresholds: number[] = [];
  private readonly targets: Element[] = [];
  constructor(private readonly callback: IntersectionObserverCallback) {
    stageObservers.push({ callback, targets: this.targets });
  }
  observe(target: Element) { this.targets.push(target); }
  unobserve() {}
  disconnect() { this.targets.length = 0; }
  takeRecords(): IntersectionObserverEntry[] { return []; }
}

/** Report the observed stages as visible, as a real viewport scroll would. */
function revealStage() {
  for (const observer of stageObservers) {
    for (const target of observer.targets) {
      observer.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], {} as IntersectionObserver);
    }
  }
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
});

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); observed.props = null; stageObservers.length = 0; });

it('mounts the real 3D viewer only once its stage is visible, with no request while hidden', async () => {
  render(
    <I18nProvider defaultLang="en">
      <WorkoutAnatomySource.Provider value={{ manifestUrl: '/anatomy/review/manifest.json' }}>
        <WorkoutAtlasHome activations={activations} targetLabel="Chest" />
      </WorkoutAnatomySource.Provider>
    </I18nProvider>,
  );

  // Hidden stage: honest skeleton only, zero manifest traffic, no canvas.
  expect(screen.getByTestId('workout-atlas-skeleton')).toBeTruthy();
  expect(fetchAtlasManifest).not.toHaveBeenCalled();
  expect(screen.queryByTestId('atlas-canvas')).toBeNull();
  expect(observed.props).toBeNull();

  revealStage();
  await waitFor(() => expect(observed.props).not.toBeNull());
  expect(fetchAtlasManifest).toHaveBeenCalledWith('/anatomy/review/manifest.json', expect.anything());
  expect(screen.queryByTestId('workout-atlas-skeleton')).toBeNull();
});

it('keeps the private gate closed: no source means the compact map and zero manifest requests', () => {
  render(
    <I18nProvider defaultLang="en">
      <WorkoutAtlasHome activations={activations} targetLabel="Chest" />
    </I18nProvider>,
  );

  expect(fetchAtlasManifest).not.toHaveBeenCalled();
  expect(screen.queryByTestId('workout-atlas-skeleton')).toBeNull();
  expect(screen.queryByTestId('atlas-canvas')).toBeNull();
  expect(screen.getByRole('group', { name: 'Front anatomy map' })).toBeTruthy();
});

it('releases the canvas when the dashboard surface unmounts', async () => {
  const { unmount } = render(
    <I18nProvider defaultLang="en">
      <WorkoutAnatomySource.Provider value={{ manifestUrl: '/anatomy/review/manifest.json' }}>
        <WorkoutAtlasHome activations={activations} targetLabel="Chest" />
      </WorkoutAnatomySource.Provider>
    </I18nProvider>,
  );
  revealStage();
  await waitFor(() => expect(screen.getByTestId('atlas-canvas')).toBeTruthy());

  unmount();
  expect(screen.queryByTestId('atlas-canvas')).toBeNull();
});

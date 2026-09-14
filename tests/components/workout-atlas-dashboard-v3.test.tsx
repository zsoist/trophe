// @vitest-environment jsdom
/**
 * V3 dashboard anatomy delta — causal coverage over the real, source-gated
 * viewer wiring:
 *  - the existing 3D renderer is the single dashboard render owner,
 *  - an unworked muscle is selectable only through the CURATED source mapping
 *    and never inflates worked/planned activation data,
 *  - unmapped hits stay honest (no selection),
 *  - the selected-muscle detail lives in flow below the stage,
 *  - selection neither remounts the renderer nor refetches the manifest,
 *  - the honest fallback/retry path and the zoom/reset camera controls work.
 */
import React, { useEffect, useRef } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import postcss from 'postcss';
import type { CanvasProps } from '../../components/anatomy/AtlasCanvas';
import type { AtlasManifest } from '@/lib/anatomy/types';
import type { MuscleActivation } from '@/lib/workout/anatomy';

const observed = vi.hoisted(() => ({ props: null as CanvasProps | null, mounts: 0 }));
const stageObservers = vi.hoisted(() => [] as { callback: IntersectionObserverCallback; targets: Element[] }[]);

vi.mock('next/dynamic', () => ({
  default: () => function Canvas(props: CanvasProps) {
    observed.props = props;
    const progress = useRef(props.onProgress);
    progress.current = props.onProgress;
    useEffect(() => { observed.mounts += 1; progress.current(1, 1); }, []);
    useEffect(() => { observed.props = props; });
    return <div data-testid="atlas-canvas" />;
  },
}));

const bounds = [[-0.34, -0.08, -0.05], [0.33, 1.65, 0.25]] as [number[], number[]];
const chunk = (id: string, system: 'muscles' | 'skeleton', elementIds: string[]) => ({ id, url: `/anatomy/${id}.glb`, sha256: 'a'.repeat(64), bytes: 128, system, region: 'test', element_ids: elementIds, bounds, vertices: 4, triangles: 2 });
const element = (id: string, system: 'muscles' | 'skeleton', conceptIds: string[]) => ({ id, concept_ids: conceptIds, availability: 'available' as const, system, region: 'test' });

// Minimal source manifest: FMA37692 is the curated triceps mapping, FMA37682 the
// curated biceps mapping. EL_OTHER belongs to muscles but no curated concept.
const manifest = {
  version: 'trophe.static-atlas/1',
  release: 'test-release',
  source: { release: 'test-release', sha256: 'b'.repeat(64) },
  license: { id: 'CC BY 4.0', url: 'https://example.test/license', attribution: 'Test body source', modifications: [] },
  transform: {},
  bounds,
  coverage: { source_elements: 4, converted: 4, rejected: 0, missing: 0 },
  relations: [],
  concepts: {
    FMA37692: { id: 'FMA37692', source_names: ['Triceps brachii'], representations: [], elements: ['EL_TRICEPS'], memberships: {}, trees: [], laterality: 'bilateral', availability: 'available', missing_elements: [] },
    FMA37682: { id: 'FMA37682', source_names: ['Biceps brachii'], representations: [], elements: ['EL_BICEPS'], memberships: {}, trees: [], laterality: 'bilateral', availability: 'available', missing_elements: [] },
  },
  elements: {
    EL_TRICEPS: element('EL_TRICEPS', 'muscles', ['FMA37692']),
    EL_BICEPS: element('EL_BICEPS', 'muscles', ['FMA37682']),
    EL_OTHER: element('EL_OTHER', 'muscles', []),
    EL_BONE: element('EL_BONE', 'skeleton', []),
  },
  chunks: [chunk('muscles-lower-0', 'muscles', ['EL_TRICEPS', 'EL_BICEPS', 'EL_OTHER']), chunk('skeleton-lower-0', 'skeleton', ['EL_BONE'])],
} as unknown as AtlasManifest;

vi.mock('../../lib/anatomy/validation', () => ({ fetchAtlasManifest: vi.fn(async () => manifest) }));

import { WorkoutAtlasHome } from '@/components/workout/workspace/WorkoutAtlasHome';
import { WorkoutAnatomySource } from '@/components/anatomy/WorkoutAnatomySource';
import { fetchAtlasManifest } from '../../lib/anatomy/validation';
import { I18nProvider, translations } from '../../lib/i18n';

const worked: MuscleActivation[] = [
  { id: 'triceps-brachii', label: 'Triceps brachii', role: 'primary', view: 'back', confidence: 'curated' },
];
const bicepsLabel = translations['workout.atlas_muscle_biceps_brachii'].en;

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

function revealStage() {
  for (const observer of stageObservers) for (const target of observer.targets) observer.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], {} as IntersectionObserver);
}

async function mountViewer() {
  render(
    <I18nProvider defaultLang="en">
      <WorkoutAnatomySource.Provider value={{ manifestUrl: '/anatomy/review/manifest.json' }}>
        <WorkoutAtlasHome activations={worked} workedActivations={worked} targetLabel="Back" />
      </WorkoutAnatomySource.Provider>
    </I18nProvider>,
  );
  act(() => revealStage());
  await waitFor(() => expect(observed.props).not.toBeNull());
  await waitFor(() => expect(observed.mounts).toBeGreaterThan(0));
}

beforeEach(() => { vi.stubGlobal('IntersectionObserver', MockIntersectionObserver); observed.mounts = 0; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); observed.props = null; observed.mounts = 0; stageObservers.length = 0; });

describe('progressive single render owner', () => {
  it('renders exactly one canvas and one manifest request, and keeps them on selection', async () => {
    await mountViewer();
    expect(observed.mounts).toBe(1);
    const requests = vi.mocked(fetchAtlasManifest).mock.calls.length;

    act(() => { observed.props!.onPick('EL_BICEPS'); });

    await waitFor(() => expect(screen.getByTestId('workout-muscle-detail')).toBeTruthy());
    expect(observed.mounts).toBe(1);
    expect(vi.mocked(fetchAtlasManifest).mock.calls.length).toBe(requests);
  });
});

describe('curated selection is separate from activation data', () => {
  it('selects an unworked curated muscle without adding it to activation colours', async () => {
    await mountViewer();
    expect(observed.props!.elementColors).toHaveProperty('EL_TRICEPS');
    expect(observed.props!.elementColors).not.toHaveProperty('EL_BICEPS');

    act(() => { observed.props!.onPick('EL_BICEPS'); });

    // The curated mapping selects the named muscle…
    const detail = screen.getByTestId('workout-muscle-detail');
    expect(detail.textContent).toContain(bicepsLabel);
    // Worked muscles remain gold; selection does not fabricate recorded work.
    expect(observed.props!.elementColors).not.toHaveProperty('EL_BICEPS');
    expect(observed.props!.elementColors).toHaveProperty('EL_TRICEPS', '#d4b574');
    // …and the camera keeps framing the whole body: selection never targets a
    // region, so the renderer still fits manifest.bounds rather than zooming in.
    expect(observed.props!.selectedElements).toEqual([]);
    expect(observed.props!.focusElements).toEqual([]);
    expect(observed.props!.framingScale).toBe(0.85);
    expect(typeof observed.props!.onManualView).toBe('function');
    // Honest status: it is not presented as recorded work.
    expect(detail.textContent).toContain(translations['anatomy.no_worked'].en);
  });

  it('ignores an unmapped mesh hit instead of fabricating a muscle', async () => {
    await mountViewer();
    act(() => { observed.props!.onPick('EL_OTHER'); });
    expect(screen.queryByTestId('workout-muscle-detail')).toBeNull();
  });

  it('maps the selected exercise action to the existing consumer callback', async () => {
    const onExerciseAction = vi.fn();
    render(
      <I18nProvider defaultLang="en">
        <WorkoutAnatomySource.Provider value={{ manifestUrl: '/anatomy/review/manifest.json' }}>
          <WorkoutAtlasHome activations={worked} workedActivations={worked} targetLabel="Back" onExerciseAction={onExerciseAction} />
        </WorkoutAnatomySource.Provider>
      </I18nProvider>,
    );
    act(() => revealStage());
    await waitFor(() => expect(observed.props).not.toBeNull());
    act(() => { observed.props!.onPick('EL_BICEPS'); });

    fireEvent.click(screen.getByTestId('workout-muscle-exercises'));
    expect(onExerciseAction).toHaveBeenCalledWith(expect.objectContaining({ selection: 'biceps-brachii' }));
  });
});

describe('worked view context follows the visible state', () => {
  it('does not show the planned target when no muscles were recorded today', () => {
    const { container } = render(
      <I18nProvider defaultLang="en">
        <WorkoutAtlasHome activations={worked} workedActivations={[]} workedAvailable targetLabel="Back · Full body · Core" />
      </I18nProvider>,
    );

    expect(container.querySelector('.workout-muscle-target-context')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe(translations['anatomy.no_worked'].en);
  });
});

describe('detail stays outside the stage viewport', () => {
  it('renders the selected-muscle detail below the stage, not over the body', async () => {
    await mountViewer();
    act(() => { observed.props!.onPick('EL_BICEPS'); });

    const stage = screen.getByTestId('workout-atlas-stage');
    const detail = screen.getByTestId('workout-muscle-detail');
    expect(stage.contains(detail)).toBe(false);
    // The detail follows the stage in document order (in-flow below it).
    expect(Boolean(stage.compareDocumentPosition(detail) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });
});

describe('camera controls and honest fallback reuse the existing renderer', () => {
  it('routes the shared zoom/reset controls into the renderer props', async () => {
    await mountViewer();
    expect(observed.props!.zoom).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(observed.props!.zoom).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(observed.props!.zoom).toBe(0);

    const resetBefore = observed.props!.reset;
    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }));
    expect(observed.props!.reset).toBe(resetBefore + 1);
  });

  it('shows the source-compatible fallback with a working retry after a renderer error', async () => {
    await mountViewer();
    const requests = vi.mocked(fetchAtlasManifest).mock.calls.length;

    act(() => { observed.props!.onError('webgl'); });
    expect(screen.getByText(translations['anatomy.model_fallback'].en)).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Front anatomy map' })).toBeTruthy();
    const map = screen.getByRole('group', { name: 'Front anatomy map' });
    const original = map.getAttribute('viewBox');
    expect(screen.getAllByRole('button', { name: 'Zoom in' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(map.getAttribute('viewBox')).not.toBe(original);
    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }));
    expect(map.getAttribute('viewBox')).toBe(original);


    fireEvent.click(screen.getByTestId('workout-model-retry'));
    await waitFor(() => expect(vi.mocked(fetchAtlasManifest).mock.calls.length).toBe(requests + 1));
  });
});

describe('dashboard stage layout contract', () => {
  const css = readFileSync(join(process.cwd(), 'components/workout/workspace/workout-muscle-home.css'), 'utf8');

  it('parses and defines the responsive stage bounds', () => {
    expect(() => postcss.parse(css)).not.toThrow();
    expect(css).toContain('--workout-stage-h: clamp(320px');
    expect(css).toContain('clamp(340px, 46vh, 430px)');
    expect(css).toContain('@media (max-height: 680px)');
    expect(css).toContain('@media (min-width: 640px)');
  });

  it('keeps the 44px tool floor and an in-flow detail block', () => {
    expect(css).toContain('.workout-muscle-camera button');
    expect(css).toMatch(/\.workout-muscle-tools button,[\s\S]*?min-width: 44px;/);
    const detailBlock = css.slice(css.indexOf('.workout-muscle-detail {'), css.indexOf('.workout-muscle-detail__copy'));
    expect(detailBlock).not.toContain('position: absolute');
  });

  it('gives atlas controls a smooth interaction contract with a reduced-motion escape hatch', () => {
    expect(css).toContain('transition: background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease, color 180ms ease, transform 180ms ease;');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('transition: none;');
  });
});

describe('atlas renderer observer fallback contract', () => {
  const source = readFileSync(join(process.cwd(), 'components/anatomy/AtlasCanvas.tsx'), 'utf8');

  it('keeps rendering when optional viewport observers are unavailable', () => {
    expect(source).toContain('typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize)');
    expect(source).toContain('typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver');
    expect(source).toContain('const windowResizeFallback = observer ? null : resize;');
    expect(source).toContain('observer?.disconnect();');
    expect(source).toContain('intersection?.disconnect();');
    expect(source).toContain('window.removeEventListener("resize", windowResizeFallback);');
  });
});

it('uses the same outer camera when no 3D source is available', () => {
  vi.stubEnv('NEXT_PUBLIC_ANATOMY_ATLAS_ENABLED', '0');
  try {
    render(<I18nProvider defaultLang="en"><WorkoutAtlasHome activations={worked} workedActivations={worked} targetLabel="Back" /></I18nProvider>);
    const map = screen.getByRole('group', { name: 'Front anatomy map' });
    const original = map.getAttribute('viewBox');
    expect(screen.getAllByRole('button', { name: 'Zoom in' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(map.getAttribute('viewBox')).not.toBe(original);
    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }));
    expect(map.getAttribute('viewBox')).toBe(original);
  } finally { vi.unstubAllEnvs(); }
});

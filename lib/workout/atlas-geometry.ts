import { BACK_MUSCLES, FRONT_MUSCLES } from 'body-muscles';
import type { AnatomyMuscleId, AnatomyView } from './anatomy';

export type AtlasSourceKind = 'licensed-surface' | 'deep-location-guide';

export interface AtlasGeometry {
  view: AnatomyView;
  sourceKind: AtlasSourceKind;
  /** Exact body-muscles@1.0.0 IDs. Empty only for an honest deep-location guide. */
  pathIds: readonly string[];
  /** A non-surface location cue; it is deliberately not a claimed contour. */
  guidePath?: string;
  hitCenter: readonly [number, number];
}

type SourcePath = { id: string; path: string };

const sourcePaths = new Map<string, SourcePath>([...FRONT_MUSCLES, ...BACK_MUSCLES].map((path) => [path.id, path]));

const surface = (view: AnatomyView, pathIds: readonly string[], hitCenter: readonly [number, number]): AtlasGeometry => ({
  view,
  sourceKind: 'licensed-surface',
  pathIds,
  hitCenter,
});

const deepGuide = (view: AnatomyView, guidePath: string, hitCenter: readonly [number, number]): AtlasGeometry => ({
  view,
  sourceKind: 'deep-location-guide',
  pathIds: [],
  guidePath,
  hitCenter,
});

/**
 * Atlas-facing mapping of Trophe IDs to body-muscles@1.0.0 records.
 *
 * The three guides have no corresponding published surface trace. Their location
 * cues are intentionally non-contour annotations, informed by OpenStax's muscle
 * naming overview and the OpenStax-derived front/back illustration cited in
 * THIRD_PARTY_NOTICES.md. They are not clinical or diagnostic representations.
 */
export const ATLAS_GEOMETRY: Record<AnatomyMuscleId, AtlasGeometry> = {
  'pectoralis-major': surface('front', ['chest-upper-left', 'chest-lower-left', 'chest-upper-right', 'chest-lower-right'], [17, 21]),
  'serratus-anterior': surface('front', ['serratus-anterior-left', 'serratus-anterior-right'], [17, 28]),
  'anterior-deltoid': surface('front', ['shoulder-front-left', 'shoulder-front-right'], [17, 14]),
  'middle-deltoid': surface('front', ['shoulder-side-left', 'shoulder-side-right'], [17, 19]),
  'posterior-deltoid': surface('back', ['deltoid-rear-left', 'deltoid-rear-right'], [54, 18]),
  'rotator-cuff': deepGuide('back', 'M48.8 18.6 C50.4 16.8 52.1 16.5 54 18.4 C55.9 16.5 57.6 16.8 59.2 18.6', [54, 20]),
  'upper-trapezius': surface('back', ['traps-upper-left', 'traps-upper-right'], [54, 15]),
  'lower-trapezius': surface('back', ['traps-lower-left', 'traps-lower-right'], [54, 24]),
  'latissimus-dorsi': surface('back', ['lats-upper-left', 'lats-mid-left', 'lats-lower-left', 'lats-upper-right', 'lats-mid-right', 'lats-lower-right'], [54, 28]),
  rhomboids: deepGuide('back', 'M49 22.4 L54 25.8 L59 22.4 M49 24.4 L54 27.8 L59 24.4', [54, 25]),
  'erector-spinae': surface('back', ['lower-back-erectors-left', 'lower-back-erectors-right'], [54, 39]),
  'biceps-brachii': surface('front', ['biceps-left', 'biceps-right'], [17, 27]),
  'triceps-brachii': surface('back', ['triceps-long-left', 'triceps-lateral-left', 'triceps-long-right', 'triceps-lateral-right'], [54, 26]),
  brachialis: deepGuide('front', 'M8.6 24.2 C10.3 23.3 11.7 24.6 12.2 27.9 M25.4 24.2 C23.7 23.3 22.3 24.6 21.8 27.9', [17, 26]),
  'forearm-flexors': surface('back', ['forearm-flexors-left', 'forearm-flexors-right'], [54, 35]),
  'forearm-extensors': surface('back', ['forearm-extensors-left', 'forearm-extensors-right'], [54, 35]),
  'rectus-abdominis': surface('front', ['abs-upper-left', 'abs-upper-right', 'abs-lower-left', 'abs-lower-right'], [17, 38]),
  obliques: surface('front', ['obliques-left', 'obliques-right'], [17, 31]),
  'gluteus-maximus': surface('back', ['gluteus-maximus-left', 'gluteus-maximus-right'], [54, 47]),
  'gluteus-medius': surface('back', ['gluteus-medius-left', 'gluteus-medius-right'], [54, 42]),
  quadriceps: surface('front', ['quads-left', 'quads-right'], [17, 52]),
  hamstrings: surface('back', ['hamstrings-medial-left', 'hamstrings-lateral-left', 'hamstrings-medial-right', 'hamstrings-lateral-right'], [54, 58]),
  adductors: surface('front', ['adductors-left', 'adductors-right'], [17, 52]),
  gastrocnemius: surface('back', ['calves-gastroc-medial-left', 'calves-gastroc-lateral-left', 'calves-gastroc-medial-right', 'calves-gastroc-lateral-right'], [54, 72]),
  soleus: surface('back', ['calves-soleus-left', 'calves-soleus-right'], [54, 80]),
  'tibialis-anterior': surface('front', ['tibialis-anterior-left', 'tibialis-anterior-right'], [17, 78]),
};

export function atlasViewFor(id: AnatomyMuscleId): AnatomyView {
  return ATLAS_GEOMETRY[id].view;
}

export function atlasPathsFor(id: AnatomyMuscleId): readonly SourcePath[] {
  return ATLAS_GEOMETRY[id].pathIds.map((pathId) => {
    const path = sourcePaths.get(pathId);
    if (!path) throw new Error(`Missing body-muscles path: ${pathId}`);
    return path;
  });
}

export function silhouettePathsFor(view: AnatomyView): readonly SourcePath[] {
  return view === 'front' ? FRONT_MUSCLES : BACK_MUSCLES;
}

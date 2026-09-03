import { describe, expect, it } from 'vitest';
import { ATLAS_GEOMETRY, resolveAtlasHit } from '@/lib/workout/atlas-geometry';
import type { AnatomyMuscleId, AnatomyView } from '@/lib/workout/anatomy';

describe('atlas geometry provenance', () => {
  it('maps every named region to a canonical view and truthful geometry source', () => {
    const entries = Object.entries(ATLAS_GEOMETRY);
    expect(entries).toHaveLength(26);
    expect(entries.filter(([, geometry]) => geometry.sourceKind === 'licensed-surface')).toHaveLength(23);
    expect(entries.filter(([, geometry]) => geometry.sourceKind === 'deep-location-guide').map(([id]) => id).sort()).toEqual([
      'brachialis', 'rhomboids', 'rotator-cuff',
    ]);
    for (const [, geometry] of entries) {
      expect(geometry.view).toMatch(/^(front|back)$/);
      expect(geometry.pathIds.length || geometry.guidePath).toBeTruthy();
    }
  });

  it('keeps independently named fine distinctions on their published paths', () => {
    expect(ATLAS_GEOMETRY['upper-trapezius'].pathIds).toEqual([
      'traps-upper-left', 'traps-upper-right',
    ]);
    expect(ATLAS_GEOMETRY['lower-trapezius'].pathIds).toEqual([
      'traps-lower-left', 'traps-lower-right',
    ]);
    expect(ATLAS_GEOMETRY['gluteus-medius'].pathIds).toEqual([
      'gluteus-medius-left', 'gluteus-medius-right',
    ]);
    expect(ATLAS_GEOMETRY['gluteus-maximus'].pathIds).toEqual([
      'gluteus-maximus-left', 'gluteus-maximus-right',
    ]);
    expect(ATLAS_GEOMETRY.gastrocnemius.pathIds).toEqual([
      'calves-gastroc-medial-left', 'calves-gastroc-lateral-left', 'calves-gastroc-medial-right', 'calves-gastroc-lateral-right',
    ]);
    expect(ATLAS_GEOMETRY.soleus.pathIds).toEqual(['calves-soleus-left', 'calves-soleus-right']);
    expect(ATLAS_GEOMETRY['forearm-flexors'].pathIds).toEqual(['forearm-flexors-left', 'forearm-flexors-right']);
    expect(ATLAS_GEOMETRY['forearm-extensors'].pathIds).toEqual(['forearm-extensors-left', 'forearm-extensors-right']);
    expect(ATLAS_GEOMETRY['tibialis-anterior'].pathIds).toEqual(['tibialis-anterior-left', 'tibialis-anterior-right']);
  });

  it.each([
    ['bench front', 'front', ['pectoralis-major'], [11, 21], 'pectoralis-major'],
    ['bench back triceps', 'back', ['triceps-brachii', 'rotator-cuff'], [44, 27], 'triceps-brachii'],
    ['bench back cuff', 'back', ['triceps-brachii', 'rotator-cuff'], [49, 19], 'rotator-cuff'],
    ['squat quadriceps', 'front', ['quadriceps', 'adductors'], [9, 53], 'quadriceps'],
    ['squat adductors', 'front', ['quadriceps', 'adductors'], [14, 48], 'adductors'],
    ['curl biceps', 'front', ['biceps-brachii', 'brachialis'], [7, 27], 'biceps-brachii'],
    ['curl brachialis', 'front', ['biceps-brachii', 'brachialis'], [11, 26], 'brachialis'],
    // These four points sit inside the published body-muscles@1.0.0 polygon
    // bounds, rather than at self-authored target centres.
    ['forearm flexors left', 'back', ['forearm-flexors', 'forearm-extensors'], [41, 35], 'forearm-flexors'],
    ['forearm extensors left', 'back', ['forearm-flexors', 'forearm-extensors'], [39, 35], 'forearm-extensors'],
    ['forearm flexors right', 'back', ['forearm-flexors', 'forearm-extensors'], [64, 35], 'forearm-flexors'],
    ['forearm extensors right', 'back', ['forearm-flexors', 'forearm-extensors'], [66, 35], 'forearm-extensors'],
  ] as const)('gives %s a deterministic reachable point owned by the visible contour', (_name, view, activeIds, point, expected) => {
    expect(resolveAtlasHit(activeIds, view, point, 7)).toBe(expected);
    expect(resolveAtlasHit([...activeIds].reverse(), view, point, 7)).toBe(expected);
  });

  it('provides contour-aligned bilateral hit zones without collapsing them to the torso midpoint', () => {
    const bilateralIds: AnatomyMuscleId[] = [
      'pectoralis-major', 'biceps-brachii', 'brachialis', 'forearm-flexors',
      'forearm-extensors', 'quadriceps', 'adductors', 'triceps-brachii',
    ];

    for (const id of bilateralIds) {
      const geometry = ATLAS_GEOMETRY[id];
      expect(geometry.hitCenters.length, id).toBeGreaterThanOrEqual(2);
      const localMidpoint = geometry.view === 'front' ? 17.5 : 54.5;
      expect(geometry.hitCenters.some(([x]) => x < localMidpoint), id).toBe(true);
      expect(geometry.hitCenters.some(([x]) => x > localMidpoint), id).toBe(true);
    }
  });

  it('ignores points on the wrong side and points outside every reachable zone', () => {
    const activeIds: AnatomyMuscleId[] = ['pectoralis-major', 'triceps-brachii'];
    expect(resolveAtlasHit(activeIds, 'front' satisfies AnatomyView, [54, 26], 7)).toBeNull();
    expect(resolveAtlasHit(activeIds, 'front', [17, 90], 7)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { ATLAS_GEOMETRY } from '@/lib/workout/atlas-geometry';

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
});

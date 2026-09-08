import { expect, it } from 'vitest';
import { MUSCLE_SECTIONS, muscleSections } from '../../lib/workout/muscle-sections';
import { ATLAS_MUSCLE_MAPPING } from '../../lib/anatomy/mapping';
import { resolveMuscleActivations } from '../../lib/workout/anatomy';
it('places every supported workout muscle in exactly one large region', () => {
  const ids = MUSCLE_SECTIONS.flatMap(section => section.muscles);
  expect(new Set(ids).size).toBe(ids.length);
  expect([...ids].sort()).toEqual(Object.keys(ATLAS_MUSCLE_MAPPING).sort());
});
it('groups a recorded bench press without inventing leg work or intensity', () => {
  const regions = muscleSections(resolveMuscleActivations({ name: 'Bench Press', muscleGroup: 'chest' }));
  expect(regions.map(region => region.id)).toEqual(['chest', 'triceps', 'neck']);
  expect(regions.flatMap(region => region.activations)).toHaveLength(4);
});

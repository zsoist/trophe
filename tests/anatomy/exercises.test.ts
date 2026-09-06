import { describe, expect, it } from 'vitest';
import { atlasExercises, ATLAS_EXERCISES } from '../../lib/anatomy/exercises';
describe('atlas exercise context', () => {
  it('uses group templates by default and respects upper/lower legs', () => {
    expect(atlasExercises('chest').items.every(x => x.exercise.muscle_group === 'chest')).toBe(true);
    expect(atlasExercises('legs', null, 'lower').items.every(x => x.exercise.muscle_group === 'calves')).toBe(true);
    expect(atlasExercises('legs', null, 'upper').items.some(x => x.exercise.muscle_group === 'calves')).toBe(false);
  });
  it('uses curated parent associations for source portions without claiming portion isolation', () => {
    const sternum = atlasExercises('chest', 'pectoral-sternocostal');
    expect(sternum.parent).toBe(true);
    expect(sternum.muscle).toBe('pectoralis-major');
    expect(sternum.items.find(x => x.exercise.name === 'Bench Press')?.role).toBe('primary');
    expect(sternum.items.some(x => x.exercise.name === 'Cable Crossover')).toBe(false);
    expect(sternum.items).toEqual(atlasExercises('chest', 'pectoral-clavicular').items);
    expect(atlasExercises('triceps', 'triceps-medial').muscle).toBe('triceps-brachii');
  });
  it('preserves stabilizer roles and never falls back to an unrelated muscle for unknown neck portions', () => {
    expect(atlasExercises('chest', 'serratus-anterior').items.map(x => [x.exercise.name, x.role])).toEqual([['Push-ups', 'stabilizer']]);
    expect(atlasExercises('neck', 'scalenes').items).toEqual([]);
    expect(atlasExercises('core', 'rectus-abdominis').parent).toBe(false);
    expect(atlasExercises('back', 'latissimus-dorsi').items[0].role).toBe('primary');
  });
  it('ships unique generic catalogue keys and complete existing instruction blocks', () => {
    expect(new Set(ATLAS_EXERCISES.map(x => x.id)).size).toBe(ATLAS_EXERCISES.length);
    expect(ATLAS_EXERCISES.every(x => x.instructions && x.instructions_es && x.instructions_el)).toBe(true);
  });
});

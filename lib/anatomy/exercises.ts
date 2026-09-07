import templates from './exercise-catalogue.json';
import { resolveCuratedMuscleActivations, type AnatomyMuscleId, type MuscleRole } from '../workout/anatomy';

/** Versioned, generic workout templates; IDs are catalogue keys, never database row IDs. */
export type AtlasExercise = (typeof templates)[number];
export const ATLAS_EXERCISES: readonly AtlasExercise[] = templates;
const parentMuscles: Record<string, AnatomyMuscleId> = {
  'pectoral-clavicular': 'pectoralis-major',
  'pectoral-sternocostal': 'pectoralis-major',
  'pectoral-abdominal': 'pectoralis-major',
  'triceps-long': 'triceps-brachii',
  'triceps-lateral': 'triceps-brachii',
  'triceps-medial': 'triceps-brachii',
};
const groups: Record<string, string[]> = {
  chest: ['chest'], back: ['back'], shoulders: ['shoulders'],
  arms: ['biceps', 'triceps', 'forearms'], biceps: ['biceps'], triceps: ['triceps'],
  legs: ['quads', 'hamstrings', 'glutes', 'calves'], glutes: ['glutes'], core: ['core'],
  neck: ['shoulders'],
};
export interface AtlasExerciseMatch { exercise: AtlasExercise; role?: MuscleRole }
/** Exact curated muscle associations only for a selection. No inference from mesh names or side. */
export function atlasExercises(group: string, selection?: string | null, legRegion = 'all') {
  const muscle = selection ? parentMuscles[selection] ?? selection : null;
  const parent = Boolean(selection && parentMuscles[selection]);
  const roleRank = { primary: 0, secondary: 1, stabilizer: 2 };
  let areas = groups[group];
  if (group === 'legs' && legRegion !== 'all') areas = legRegion === 'upper' ? ['quads', 'hamstrings', 'glutes'] : ['calves'];
  const items: AtlasExerciseMatch[] = [];
  for (const exercise of ATLAS_EXERCISES) {
    if (!muscle) {
      if (!group || areas?.includes(exercise.muscle_group)) items.push({ exercise });
      continue;
    }
    const match = resolveCuratedMuscleActivations({ name: exercise.name, muscle_group: exercise.muscle_group }).find(a => a.id === muscle);
    if (match) items.push({ exercise, role: match.role });
  }
  if (muscle) items.sort((a, b) => roleRank[a.role!] - roleRank[b.role!]);
  return { muscle, parent, items };
}

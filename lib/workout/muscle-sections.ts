import type { AnatomyMuscleId, MuscleActivation } from './anatomy';
/** Each muscle appears once; regions are navigation, never effort measurements. */
export const MUSCLE_SECTIONS: { id: string; muscles: AnatomyMuscleId[] }[] = [
  { id: 'chest', muscles: ['pectoralis-major', 'serratus-anterior'] },
  { id: 'back', muscles: ['latissimus-dorsi', 'lower-trapezius', 'rhomboids', 'erector-spinae'] },
  { id: 'biceps', muscles: ['biceps-brachii', 'brachialis'] },
  { id: 'triceps', muscles: ['triceps-brachii'] },
  { id: 'arms', muscles: ['forearm-flexors', 'forearm-extensors'] },
  { id: 'core', muscles: ['rectus-abdominis', 'obliques'] },
  { id: 'legs', muscles: ['quadriceps', 'hamstrings', 'adductors', 'gastrocnemius', 'soleus', 'tibialis-anterior'] },
  { id: 'glutes', muscles: ['gluteus-maximus', 'gluteus-medius'] },
  { id: 'neck', muscles: ['upper-trapezius', 'anterior-deltoid', 'middle-deltoid', 'posterior-deltoid', 'rotator-cuff'] },
];
export function muscleSections(activations: MuscleActivation[]) {
  return MUSCLE_SECTIONS.map(section => ({ ...section, activations: activations.filter(activation => section.muscles.includes(activation.id)) })).filter(section => section.activations.length);
}

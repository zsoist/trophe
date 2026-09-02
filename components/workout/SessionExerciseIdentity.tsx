import { ChevronDown, ChevronUp } from 'lucide-react';
import { MovementVisual } from './MovementVisual';

interface SessionExerciseIdentityProps {
  name: string;
  exerciseName: string;
  equipment?: string | null;
  setCount: number;
  lastPerformance?: string | null;
  expanded: boolean;
  onToggle: () => void;
}

export default function SessionExerciseIdentity({
  name,
  exerciseName,
  equipment,
  setCount,
  lastPerformance,
  expanded,
  onToggle,
}: SessionExerciseIdentityProps) {
  const setLabel = `${setCount} ${setCount === 1 ? 'set' : 'sets'}`;
  const equipmentLabel = equipment
    ? equipment.charAt(0).toUpperCase() + equipment.slice(1)
    : null;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${name}`}
      className="session-exercise-identity"
    >
      <span className="session-exercise-identity__visual">
        <MovementVisual exerciseName={exerciseName} equipment={equipment} alt={`${name} movement`} />
      </span>
      <span className="session-exercise-identity__copy">
        <strong>{name}</strong>
        <small>{setLabel}{equipmentLabel ? ` · ${equipmentLabel}` : ''}</small>
        {lastPerformance ? <small className="session-exercise-identity__last">Last {lastPerformance}</small> : null}
      </span>
      {expanded ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
    </button>
  );
}

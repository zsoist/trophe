'use client';
import type { ReactNode } from 'react';
import { useId, useState } from 'react';
import { Check, Layers } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { anatomyLabelKey, type AnatomyMuscleId, type AnatomyView, type MuscleActivation } from '@/lib/workout/anatomy';
import { ATLAS_GEOMETRY } from '@/lib/workout/atlas-geometry';
import { WorkoutAnatomyModel } from '@/components/anatomy/WorkoutAnatomyModel';
import './workout-muscle-home.css';
interface WorkoutAtlasHomeProps {
  activations: MuscleActivation[];
  workedActivations?: MuscleActivation[];
  workedAvailable?: boolean;
  targetLabel: string;
  emptyState?: 'strength' | 'cardio';
  action?: ReactNode;
}
export function WorkoutAtlasHome({ activations, workedActivations = [], workedAvailable = true, targetLabel, emptyState = 'strength', action }: WorkoutAtlasHomeProps) {
  const { t } = useI18n();
  const headingId = useId();
  const [mode, setMode] = useState<'planned' | 'worked'>('planned');
  const [selected, setSelected] = useState<AnatomyMuscleId | null>(null);
  const [view, setView] = useState<AnatomyView>('front');
  const visible = mode === 'planned' ? activations : workedActivations;
  const applied = visible.some(a => a.id === selected) ? selected : null;
  const choose = (id: AnatomyMuscleId | null) => { setSelected(id === applied ? null : id); if (id) setView(ATLAS_GEOMETRY[id].view); };
  return <section className="workout-muscle-home" data-mode={mode} aria-labelledby={headingId}>
    <header><div><span className="workout-muscle-eyebrow"><Layers size={14} aria-hidden="true" />{t('anatomy.workout_title')}</span><h2 id={headingId}>{t('workout.atlas_today_target')}</h2><p>{targetLabel}</p></div></header>
    <div className="workout-muscle-tabs" role="group" aria-label={t('anatomy.training_state')}>
      {(['planned', 'worked'] as const).map(item => <button key={item} aria-pressed={mode === item} onClick={() => { setMode(item); setSelected(null); }}><span>{t(`anatomy.${item}`)}</span><small>{item === 'planned' ? activations.length : workedAvailable ? workedActivations.length : '—'}</small></button>)}
    </div>
    <div className="workout-muscle-body">
      <div className="workout-muscle-figure"><div className="workout-muscle-views" role="group" aria-label={t('anatomy.orientation')}>{(['front','back'] as const).map(side => <button key={side} aria-pressed={view === side} onClick={() => setView(side)}>{t(`anatomy.${side}`)}</button>)}</div><WorkoutAnatomyModel activations={visible} selected={applied} onSelect={choose} view={view} color={mode === 'worked' ? '#78bdb2' : '#d4a853'} /></div>
      <div className="workout-muscle-groups">
        <p className="workout-muscle-state-label">{t(mode === 'worked' ? 'anatomy.worked_note' : 'anatomy.planned_note')}</p>
        {!visible.length && <p role="status">{t(mode === 'worked' ? workedAvailable ? 'anatomy.no_worked' : 'anatomy.worked_unavailable' : emptyState === 'cardio' ? 'workout.atlas_empty_cardio' : 'workout.atlas_empty_strength')}</p>}
        <ul>{visible.map(activation => <li key={activation.id}><button aria-pressed={applied === activation.id} onClick={() => choose(activation.id)}><span className={`workout-muscle-marker workout-muscle-marker--${mode}`}>{mode === 'worked' && <Check size={12} aria-hidden="true" />}</span><span><strong>{t(anatomyLabelKey(activation))}</strong><small>{t(activation.confidence === 'group' ? 'workout.atlas_role_group_label' : `workout.atlas_role_${activation.role}`)}</small></span></button></li>)}</ul>
      </div>
    </div>
    {action && <div className="workout-muscle-action">{action}</div>}
  </section>;
}

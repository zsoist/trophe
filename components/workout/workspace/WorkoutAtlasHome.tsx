'use client';
import type { ReactNode } from 'react';
import { useId, useState } from 'react';
import { Check, ChevronDown, Layers, RotateCcw } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { anatomyLabelKey, type AnatomyMuscleId, type AnatomyView, type MuscleActivation } from '@/lib/workout/anatomy';
import { ATLAS_GEOMETRY } from '@/lib/workout/atlas-geometry';
import { muscleSections } from '@/lib/workout/muscle-sections';
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
  const [mode, setMode] = useState<'planned' | 'worked'>('worked');
  const [selected, setSelected] = useState<AnatomyMuscleId | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [view, setView] = useState<AnatomyView>('front');
  const [manual, setManual] = useState(false);
  const [cameraRequest, setCameraRequest] = useState(0);
  const visible = mode === 'planned' ? activations : workedActivations;
  const groups = muscleSections(visible);
  const applied = visible.some(a => a.id === selected) ? selected : null;
  const choose = (id: AnatomyMuscleId | null) => {
    setSelected(id === applied ? null : id);
    if (id) { setView(ATLAS_GEOMETRY[id].view); setOpenGroup(groups.find(group => group.muscles.includes(id))?.id ?? null); setManual(false); setCameraRequest(n => n + 1); }
  };
  return <section className="workout-muscle-home" data-mode={mode} aria-labelledby={headingId}>
    <header><div><span className="workout-muscle-eyebrow"><Layers size={14} aria-hidden="true" />{t('anatomy.workout_title')}</span><h2 id={headingId}>{t('workout.atlas_today_target')}</h2><p>{targetLabel}</p></div></header>
    <div className="workout-muscle-tabs" role="group" aria-label={t('anatomy.training_state')}>
      {(['worked', 'planned'] as const).map(item => <button key={item} aria-pressed={mode === item} onClick={() => { setMode(item); setSelected(null); setOpenGroup(null); }}><span>{t(`anatomy.${item}`)}</span><small>{item === 'planned' ? muscleSections(activations).length : workedAvailable ? muscleSections(workedActivations).length : '—'}</small></button>)}
    </div>
    <div className="workout-muscle-body">
      <div className="workout-muscle-figure"><div className="workout-muscle-views" role="group" aria-label={t('anatomy.orientation')}>{(['front','back'] as const).map(side => <button key={side} aria-pressed={!manual && view === side} onClick={() => { setView(side); setManual(false); setCameraRequest(n => n + 1); }}>{t(`anatomy.${side}`)}</button>)}<button aria-label={t('anatomy.reset')} onClick={() => { setView('front'); setManual(false); setCameraRequest(n => n + 1); }}><RotateCcw size={16} /></button></div><WorkoutAnatomyModel activations={visible} selected={applied} focused={groups.find(group => group.id === openGroup)?.activations.map(a => a.id)} onSelect={choose} view={view} cameraRequest={cameraRequest} onManualView={() => setManual(true)} color={mode === 'worked' ? '#78bdb2' : '#d4a853'} /></div>
      <div className="workout-muscle-groups">
        <h3 className="workout-muscle-section-title">{t('anatomy.involved')}</h3>
        {!visible.length && <p role="status">{t(mode === 'worked' ? workedAvailable ? 'anatomy.no_worked' : 'anatomy.worked_unavailable' : emptyState === 'cardio' ? 'workout.atlas_empty_cardio' : 'workout.atlas_empty_strength')}</p>}
        <div className="workout-muscle-accordions">{groups.map(group => <section className="workout-muscle-section" key={group.id}>
          <h4><button className="workout-muscle-group-toggle" aria-expanded={openGroup === group.id} aria-controls={`${headingId}-${group.id}`} onClick={() => { setOpenGroup(openGroup === group.id ? null : group.id); setSelected(null); if (openGroup !== group.id) { setView(ATLAS_GEOMETRY[group.activations[0].id].view); setManual(false); setCameraRequest(n => n + 1); } }}><span className={`workout-muscle-marker workout-muscle-marker--${mode}`} /><strong>{t(`anatomy.focus_${group.id}`)}</strong><small>{group.activations.length}</small><ChevronDown size={16} aria-hidden="true" /></button></h4>
          <ul id={`${headingId}-${group.id}`} hidden={openGroup !== group.id}>{group.activations.map(activation => <li key={activation.id}><button aria-pressed={applied === activation.id} onClick={() => choose(activation.id)}><span><strong>{t(anatomyLabelKey(activation))}</strong><small className={`workout-muscle-role workout-muscle-role--${activation.role}`}>{t(activation.confidence === 'group' ? 'workout.atlas_role_group_label' : `workout.atlas_role_${activation.role}`)}</small></span>{applied === activation.id && <Check size={16} aria-hidden="true" />}</button></li>)}</ul>
        </section>)}</div>
      </div>
    </div>
    {action && <div className="workout-muscle-action">{action}</div>}
  </section>;
}

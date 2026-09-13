'use client';
import type { ReactNode } from 'react';
import { useContext, useEffect, useId, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Check, ChevronDown, Minus, Plus, RotateCcw } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { activeAtlasRelease } from '@/lib/anatomy/release';
import { WORKOUT_FOCUS_GROUPS, type WorkoutFocusGroup } from '@/lib/anatomy/workout-focus';
import { atlasExerciseLibraryHref } from '@/lib/anatomy/workout-navigation';
import { anatomyLabelKey, type AnatomyMuscleId, type AnatomyView, type MuscleActivation } from '@/lib/workout/anatomy';
import { ATLAS_GEOMETRY } from '@/lib/workout/atlas-geometry';
import { muscleSections } from '@/lib/workout/muscle-sections';
import type { WorkoutRouteContext } from '@/lib/workout/workspace-routes';
import { WorkoutAnatomyModel } from '@/components/anatomy/WorkoutAnatomyModel';
import { WorkoutAnatomySource } from '@/components/anatomy/WorkoutAnatomySource';
import type { AtlasExerciseTarget } from '@/components/anatomy/AtlasExercises';
import '@/components/workout/workout-exploration-v2.css';
import './workout-muscle-home.css';

// The exercise sheet is a heavyweight consumer (media + history + supabase).
// Keep it out of the dashboard bundle until the user opens a muscle's actions.
const AtlasExercises = dynamic(() => import('@/components/anatomy/AtlasExercises'), { ssr: false });

interface WorkoutAtlasHomeProps {
  activations: MuscleActivation[];
  workedActivations?: MuscleActivation[];
  workedAvailable?: boolean;
  targetLabel: string;
  emptyState?: 'strength' | 'cardio';
  action?: ReactNode;
  /**
   * Existing action seam for the selected muscle. AG1 owns the session/library
   * integration; without it the dashboard opens the existing curated exercise
   * catalogue (read-only) rather than inventing a server handler.
   */
  onExerciseAction?: (target: AtlasExerciseTarget) => void;
  exerciseLibraryContext?: WorkoutRouteContext;
}

const muscleLabelKey = (id: AnatomyMuscleId) => `workout.atlas_muscle_${id.replaceAll('-', '_')}`;

export function WorkoutAtlasHome({ activations, workedActivations = [], workedAvailable = true, targetLabel, emptyState = 'strength', action, onExerciseAction, exerciseLibraryContext }: WorkoutAtlasHomeProps) {
  const { t } = useI18n();
  const headingId = useId();
  const [mode, setMode] = useState<'planned' | 'worked'>('worked');
  const [selected, setSelected] = useState<AnatomyMuscleId | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [view, setView] = useState<AnatomyView>('front');
  const [manual, setManual] = useState(false);
  const [cameraRequest, setCameraRequest] = useState(0);
  const [zoom, setZoom] = useState(0);
  const [reset, setReset] = useState(0);
  const [exerciseTarget, setExerciseTarget] = useState<AtlasExerciseTarget | null>(null);
  // The real 3D viewer is the dashboard body. It is source-gated and mounts
  // progressively the first time its stage becomes visible; before that the
  // stage shows an honest loading skeleton and issues no manifest request.
  const source = useContext(WorkoutAnatomySource);
  const viewerAvailable = Boolean(source) || Boolean(activeAtlasRelease(process.env.NEXT_PUBLIC_ANATOMY_ATLAS_ENABLED));
  const stageRef = useRef<HTMLDivElement>(null);
  // No IntersectionObserver (older/embedded environments): the stage is treated as
  // already visible so the viewer still appears rather than hanging on a skeleton.
  const [stageVisible, setStageVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (!viewerAvailable) return;
    const node = stageRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) setStageVisible(true); }, { rootMargin: '240px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [viewerAvailable]);
  const visible = mode === 'planned' ? activations : workedActivations;
  const groups = muscleSections(visible);
  const selectedActivation = selected ? visible.find(a => a.id === selected) : undefined;
  const applied = selectedActivation ? selected : null;
  const selectedLabel = selected ? t(selectedActivation ? anatomyLabelKey(selectedActivation) : muscleLabelKey(selected)) : null;
  const choose = (id: AnatomyMuscleId | null) => {
    setSelected(id === selected ? null : id);
    if (id) { setView(ATLAS_GEOMETRY[id].view); setOpenGroup(groups.find(group => group.muscles.includes(id))?.id ?? null); setManual(false); setCameraRequest(n => n + 1); }
  };
  const openExercises = () => {
    if (!selected) return;
    const group = (Object.keys(WORKOUT_FOCUS_GROUPS) as WorkoutFocusGroup[]).find(key => (WORKOUT_FOCUS_GROUPS[key] as readonly string[]).includes(selected)) ?? '';
    const target: AtlasExerciseTarget = { group, selection: selected, label: selectedLabel ?? '' };
    if (onExerciseAction) onExerciseAction(target);
    else setExerciseTarget(target);
  };
  const requestView = (side: AnatomyView) => { setView(side); setManual(false); setCameraRequest(n => n + 1); };
  return <section className="wk2 workout-muscle-home" data-mode={mode} aria-labelledby={headingId}>
    <header><div><h2 id={headingId}>{t('workout.muscle_map')}</h2><p>{targetLabel}</p></div></header>
    <div className="workout-muscle-tabs" role="group" aria-label={t('anatomy.training_state')}>
      {(['worked', 'planned'] as const).map(item => <button key={item} aria-pressed={mode === item} onClick={() => { setMode(item); setSelected(null); setOpenGroup(null); }}><span>{t(`anatomy.${item}`)}</span><small>{item === 'planned' ? muscleSections(activations).length : workedAvailable ? muscleSections(workedActivations).length : '—'}</small></button>)}
    </div>
    <div className="workout-muscle-body">
      <div className="workout-muscle-figure" data-testid="workout-atlas-stage" ref={stageRef}>
        <div className="workout-muscle-tools" role="group" aria-label={t('anatomy.orientation')}>
          {(['front', 'back'] as const).map(side => <button key={side} aria-pressed={!manual && view === side} onClick={() => requestView(side)}>{t(`anatomy.${side}`)}</button>)}
        </div>
        {viewerAvailable && !stageVisible
          ? <div className="workout-muscle-lazy" data-testid="workout-atlas-skeleton"><p role="status">{t('anatomy.loading')}</p></div>
          : <WorkoutAnatomyModel activations={visible} selected={applied} focused={groups.find(group => group.id === openGroup)?.activations.map(a => a.id)} onSelect={choose} view={view} cameraRequest={cameraRequest} onManualView={() => setManual(true)} zoom={zoom} reset={reset} color={mode === 'worked' ? '#78bdb2' : '#d4a853'} />}
        <div className="workout-muscle-camera" role="group" aria-label={t('anatomy.viewer')}>
          <button type="button" disabled={zoom >= 12} aria-label={t('anatomy.zoom_in')} onClick={() => setZoom(current => Math.min(12, current + 1))}><Plus size={17} aria-hidden="true" /></button>
          <button type="button" disabled={zoom <= 0} aria-label={t('anatomy.zoom_out')} onClick={() => setZoom(current => Math.max(0, current - 1))}><Minus size={17} aria-hidden="true" /></button>
          <button type="button" aria-label={t('anatomy.reset')} onClick={() => { setZoom(0); setView('front'); setManual(false); setReset(n => n + 1); setCameraRequest(n => n + 1); }}><RotateCcw size={16} aria-hidden="true" /></button>
        </div>
      </div>
      <div className="workout-muscle-groups">
        {selected && <div className="workout-muscle-detail" data-testid="workout-muscle-detail">
          <div className="workout-muscle-detail__copy"><strong>{selectedLabel}</strong>{selectedActivation && <small className={`workout-muscle-role workout-muscle-role--${selectedActivation.role}`}>{t(selectedActivation.confidence === 'group' ? 'workout.atlas_role_group_label' : `workout.atlas_role_${selectedActivation.role}`)}</small>}</div>
          <button type="button" data-testid="workout-muscle-exercises" onClick={openExercises}>{t('anatomy.exercises_view_all')}</button>
          {!selectedActivation && <p role="status">{t(mode === 'worked' ? 'anatomy.no_worked' : 'anatomy.planned_note')}</p>}
        </div>}
        <h3 className="workout-muscle-section-title">{t('anatomy.involved')}</h3>
        {!visible.length && <p role="status">{t(mode === 'worked' ? workedAvailable ? 'anatomy.no_worked' : 'anatomy.worked_unavailable' : emptyState === 'cardio' ? 'workout.atlas_empty_cardio' : 'workout.atlas_empty_strength')}</p>}
        <div className="workout-muscle-accordions">{groups.map(group => <section className="workout-muscle-section" key={group.id}>
          <h4><button className="workout-muscle-group-toggle" aria-expanded={openGroup === group.id} aria-controls={`${headingId}-${group.id}`} onClick={() => { setOpenGroup(openGroup === group.id ? null : group.id); setSelected(null); if (openGroup !== group.id) requestView(ATLAS_GEOMETRY[group.activations[0].id].view); }}><span className={`workout-muscle-marker workout-muscle-marker--${mode}`} /><strong>{t(`anatomy.focus_${group.id}`)}</strong><small>{group.activations.length}</small><ChevronDown size={16} aria-hidden="true" /></button></h4>
          <ul id={`${headingId}-${group.id}`} hidden={openGroup !== group.id}>{group.activations.map(activation => <li key={activation.id}><button aria-pressed={applied === activation.id} onClick={() => choose(activation.id)}><span><strong>{t(anatomyLabelKey(activation))}</strong><small className={`workout-muscle-role workout-muscle-role--${activation.role}`}>{t(activation.confidence === 'group' ? 'workout.atlas_role_group_label' : `workout.atlas_role_${activation.role}`)}</small></span>{applied === activation.id && <Check size={16} aria-hidden="true" />}</button></li>)}</ul>
        </section>)}</div>
      </div>
    </div>
    {action && <div className="workout-muscle-action">{action}</div>}
    {exerciseTarget && <AtlasExercises target={exerciseTarget} libraryHref={atlasExerciseLibraryHref(exerciseTarget.group, exerciseLibraryContext)} onClose={() => setExerciseTarget(null)} />}
  </section>;
}

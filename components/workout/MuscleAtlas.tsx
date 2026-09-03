'use client';

import type { KeyboardEvent } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { ATLAS_GEOMETRY, atlasPathsFor, silhouettePathsFor } from '@/lib/workout/atlas-geometry';
import type { AnatomyMuscleId, AnatomyView, MuscleActivation, MuscleRole } from '@/lib/workout/anatomy';

export interface MuscleAtlasProps {
  activations: MuscleActivation[];
  selected?: AnatomyMuscleId | null;
  onSelect: (id: AnatomyMuscleId) => void;
  compact?: boolean;
  homeCompact?: boolean;
}

const ROLE_LABEL_KEYS: Record<MuscleRole, string> = { primary: 'workout.info_primary', secondary: 'workout.info_secondary', stabilizer: 'workout.info_stabilizer' };
const ROLE_ARIA_LABEL_KEYS: Record<MuscleRole, string> = { primary: 'workout.atlas_role_primary', secondary: 'workout.atlas_role_secondary', stabilizer: 'workout.atlas_role_stabilizer' };
const muscleLabelKey = (id: AnatomyMuscleId) => `workout.atlas_muscle_${id.replaceAll('-', '_')}`;

function regionClass(role: MuscleRole, isSelected: boolean, isDeep: boolean) {
  return `muscle-atlas__region muscle-atlas__region--${role}${isDeep ? ' muscle-atlas__region--deep-guide' : ''}${isSelected ? ' muscle-atlas__region--selected' : ''}`;
}

function handleRegionKeyDown(event: KeyboardEvent<SVGGElement>, id: AnatomyMuscleId, onSelect: (id: AnatomyMuscleId) => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onSelect(id);
  }
}

function AtlasRegion({ activation, selected, onSelect, hitRadius, label }: { activation: MuscleActivation; selected: AnatomyMuscleId | null; onSelect: (id: AnatomyMuscleId) => void; hitRadius: number; label: string }) {
  const geometry = ATLAS_GEOMETRY[activation.id];
  const isDeepGuide = geometry.sourceKind === 'deep-location-guide';
  const [hitX, hitY] = geometry.hitCenter;
  return <g role="button" tabIndex={0} aria-pressed={selected === activation.id} aria-label={label} data-testid={`atlas-region-${activation.id}`} data-anatomy-source={geometry.sourceKind} {...(isDeepGuide ? { 'data-anatomy-depth': 'deep-guide' } : {})} className={regionClass(activation.role, selected === activation.id, isDeepGuide)} onClick={() => onSelect(activation.id)} onKeyDown={(event) => handleRegionKeyDown(event, activation.id, onSelect)}>
    <circle className="muscle-atlas__hit-target" data-testid={`atlas-hit-${activation.id}`} data-min-hit-target="44" cx={hitX} cy={hitY} r={hitRadius} />
    {isDeepGuide
      ? <path d={geometry.guidePath} focusable="false" pointerEvents="none" aria-hidden="true" />
      : atlasPathsFor(activation.id).map((path) => <path key={path.id} d={path.path} data-source-path-id={path.id} focusable="false" pointerEvents="none" aria-hidden="true" />)}
  </g>;
}

export function MuscleAtlas({ activations, selected = null, onSelect, compact = false, homeCompact = false }: MuscleAtlasProps) {
  const { t } = useI18n();
  const selectedActivation = activations.find((activation) => activation.id === selected);
  const [view, setView] = useState<AnatomyView>(() => selected ? ATLAS_GEOMETRY[selected].view : 'front');
  const appliedSelected = useRef<AnatomyMuscleId | null>(selected);
  const visibleActivations = useMemo(() => activations.filter((activation) => ATLAS_GEOMETRY[activation.id].view === view), [activations, view]);
  const roleActivations = homeCompact ? selectedActivation && ATLAS_GEOMETRY[selectedActivation.id].view === view ? [selectedActivation] : visibleActivations.slice(0, 1) : visibleActivations;
  const selectedGeometry = selected ? ATLAS_GEOMETRY[selected] : null;
  const summaryId = `muscle-atlas-summary-${useId().replaceAll(':', '')}`;
  const viewLabel = t(view === 'front' ? 'workout.atlas_front' : 'workout.atlas_back');
  const hitRadius = homeCompact ? 10 : 7;
  const atlasSummary = selectedActivation && selectedGeometry
    ? <><strong>{t(muscleLabelKey(selectedActivation.id))}</strong>, {t(ROLE_ARIA_LABEL_KEYS[selectedActivation.role])}. {selectedGeometry.sourceKind === 'deep-location-guide' ? <><span className="muscle-atlas__deep-marker">{t('workout.atlas_deep_marker')}</span> {t('workout.atlas_deep_guide_detail', { muscle: t(muscleLabelKey(selectedActivation.id)) })}</> : t('workout.atlas_surface_contour')}</>
    : t('workout.atlas_summary', { view: viewLabel, count: visibleActivations.length });

  useEffect(() => {
    if (!selected) {
      appliedSelected.current = null;
      return;
    }
    if (appliedSelected.current !== selected) {
      appliedSelected.current = selected;
      queueMicrotask(() => setView(ATLAS_GEOMETRY[selected].view));
    }
  }, [selected]);

  return <section className={`muscle-atlas${compact ? ' muscle-atlas--compact' : ''}${homeCompact ? ' muscle-atlas--home-compact' : ''}`} aria-label={t('workout.atlas_label')}>
    {!compact ? <div className="muscle-atlas__header"><div><h2>{t('workout.atlas_focus_title')}</h2><p>{t('workout.atlas_focus_hint')}</p></div><ViewControls view={view} setView={setView} t={t} /></div> : <ViewControls view={view} setView={setView} t={t} compact />}
    {!compact ? <p id={summaryId} className="muscle-atlas__summary" aria-live="polite">{atlasSummary}</p> : <p id={summaryId} className="muscle-atlas__screen-reader-table" aria-live="polite">{atlasSummary}</p>}
    <div className="muscle-atlas__figure-wrap"><svg className={`muscle-atlas__figure muscle-atlas__figure--${view}`} height={homeCompact ? 212 : 296} viewBox={view === 'front' ? '0 0 35 93' : '37 0 35 93'} role="group" aria-describedby={summaryId} aria-label={t(view === 'front' ? 'workout.atlas_front_map' : 'workout.atlas_back_map')}>
      <g className="muscle-atlas__silhouette" aria-hidden="true">{silhouettePathsFor(view).map((path) => <path key={path.id} d={path.path} />)}</g>
      {visibleActivations.map((activation) => <AtlasRegion key={activation.id} activation={activation} selected={selected} onSelect={onSelect} hitRadius={hitRadius} label={t('workout.atlas_region_label', { muscle: t(muscleLabelKey(activation.id)), role: t(ROLE_ARIA_LABEL_KEYS[activation.role]) })} />)}
    </svg></div>
    <ul className="muscle-atlas__roles" aria-label={t('workout.atlas_roles_label')}>
      {roleActivations.map((activation) => <li key={activation.id} className={selected === activation.id ? 'is-selected' : ''}><span className={`muscle-atlas__swatch muscle-atlas__swatch--${activation.role}`} aria-hidden="true" /><span>{t(muscleLabelKey(activation.id))}{ATLAS_GEOMETRY[activation.id].sourceKind === 'deep-location-guide' ? ` · ${t('workout.atlas_deep_marker')}` : ''}</span><strong>{t(ROLE_LABEL_KEYS[activation.role])}</strong></li>)}
      {homeCompact && visibleActivations.length > roleActivations.length ? <li className="muscle-atlas__roles-summary"><span aria-hidden="true" /><span>{t('workout.atlas_more_highlighted', { n: visibleActivations.length - roleActivations.length })}</span></li> : null}
    </ul>
    <table className="muscle-atlas__screen-reader-table"><caption>{t('workout.atlas_roles_label')}</caption><tbody>{roleActivations.map((activation) => <tr key={activation.id}><th scope="row">{t(muscleLabelKey(activation.id))}</th><td>{t(ROLE_LABEL_KEYS[activation.role])}</td><td>{ATLAS_GEOMETRY[activation.id].sourceKind === 'deep-location-guide' ? t('workout.atlas_deep_guide') : t('workout.atlas_surface_contour')}</td></tr>)}</tbody></table>
  </section>;
}

function ViewControls({ view, setView, t, compact = false }: { view: AnatomyView; setView: (view: AnatomyView) => void; t: (key: string) => string; compact?: boolean }) {
  return <div className={`muscle-atlas__views${compact ? ' muscle-atlas__views--compact' : ''}`} aria-label={t('workout.atlas_view_label')}>
    {(['front', 'back'] as const).map((candidate) => <button key={candidate} type="button" aria-pressed={view === candidate} aria-label={t(candidate === 'front' ? 'workout.atlas_show_front' : 'workout.atlas_show_back')} onClick={() => setView(candidate)}>{t(candidate === 'front' ? 'workout.atlas_front' : 'workout.atlas_back')}</button>)}
  </div>;
}

export default MuscleAtlas;

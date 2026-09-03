'use client';

import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { ATLAS_GEOMETRY, atlasPathsFor, atlasViewportFor, resolveAtlasHit, silhouettePathsFor } from '@/lib/workout/atlas-geometry';
import type { AtlasViewport } from '@/lib/workout/atlas-geometry';
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
  return <g role="button" tabIndex={0} aria-pressed={selected === activation.id} aria-label={label} data-testid={`atlas-region-${activation.id}`} data-anatomy-source={geometry.sourceKind} {...(isDeepGuide ? { 'data-anatomy-depth': 'deep-guide' } : {})} className={regionClass(activation.role, selected === activation.id, isDeepGuide)} onClick={() => onSelect(activation.id)} onKeyDown={(event) => handleRegionKeyDown(event, activation.id, onSelect)}>
    {geometry.hitCenters.map(([hitX, hitY], index) => <circle key={`${hitX}-${hitY}`} className="muscle-atlas__hit-target" data-testid={`atlas-hit-${activation.id}-${index}`} data-min-hit-target="44" data-hit-owner={activation.id} cx={hitX} cy={hitY} r={hitRadius} />)}
    {isDeepGuide
      ? <path d={geometry.guidePath} data-atlas-hit-owner={activation.id} focusable="false" aria-hidden="true" />
      : atlasPathsFor(activation.id).map((path) => <path key={path.id} d={path.path} data-source-path-id={path.id} data-atlas-hit-owner={activation.id} focusable="false" aria-hidden="true" />)}
  </g>;
}

function pointerToAtlasPoint(svg: SVGSVGElement, event: ReactPointerEvent<SVGSVGElement>, viewport: AtlasViewport): readonly [number, number] | null {
  const matrix = svg.getScreenCTM?.();
  if (matrix && typeof svg.createSVGPoint === 'function') {
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(matrix.inverse());
    return [local.x, local.y];
  }

  const bounds = svg.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  return [
    viewport.minX + ((event.clientX - bounds.left) / bounds.width) * viewport.width,
    viewport.minY + ((event.clientY - bounds.top) / bounds.height) * viewport.height,
  ];
}

export function MuscleAtlas({ activations, selected = null, onSelect, compact = false, homeCompact = false }: MuscleAtlasProps) {
  const { t } = useI18n();
  const selectedActivation = activations.find((activation) => activation.id === selected);
  const [view, setView] = useState<AnatomyView>(() => selected ? ATLAS_GEOMETRY[selected].view : 'front');
  const appliedSelected = useRef<AnatomyMuscleId | null>(selected);
  const visibleActivations = useMemo(() => activations.filter((activation) => ATLAS_GEOMETRY[activation.id].view === view), [activations, view]);
  const roleActivations = homeCompact ? [selectedActivation ?? activations[0]].filter(Boolean) as MuscleActivation[] : activations;
  const selectedGeometry = selected ? ATLAS_GEOMETRY[selected] : null;
  const summaryId = `muscle-atlas-summary-${useId().replaceAll(':', '')}`;
  const hitRadius = homeCompact ? 10 : 7;
  const viewport = atlasViewportFor(view, hitRadius);
  const atlasSummary = selectedActivation && selectedGeometry
    ? <><strong>{t(muscleLabelKey(selectedActivation.id))}</strong>, {t(ROLE_ARIA_LABEL_KEYS[selectedActivation.role])}. {selectedGeometry.sourceKind === 'deep-location-guide' ? <span className="muscle-atlas__deep-detail">{`${t('workout.atlas_deep_marker')}. ${t('workout.atlas_deep_guide_detail', { muscle: t(muscleLabelKey(selectedActivation.id)) })}`}</span> : t('workout.atlas_surface_contour')}</>
    : t(view === 'front' ? 'workout.atlas_summary_front' : 'workout.atlas_summary_back', { visible: visibleActivations.length, total: activations.length });

  const selectActivation = (activation: MuscleActivation) => {
    setView(ATLAS_GEOMETRY[activation.id].view);
    onSelect(activation.id);
  };

  const handleAtlasPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    // A published contour belongs to its enclosing accessible region. Let the
    // ensuing click activate that exact owner once; use proximity only for the
    // surrounding transparent target area.
    const eventElement = event.target instanceof Element ? event.target : null;
    if (eventElement?.closest('[data-atlas-hit-owner]')) return;
    const point = pointerToAtlasPoint(event.currentTarget, event, viewport);
    if (!point) return;
    const hit = resolveAtlasHit(visibleActivations.map((activation) => activation.id), view, point, hitRadius);
    if (hit) onSelect(hit);
  };

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
    <div className="muscle-atlas__figure-wrap"><svg key={view} className={`muscle-atlas__figure muscle-atlas__figure--${view}`} height={homeCompact ? 212 : 296} viewBox={`${viewport.minX} ${viewport.minY} ${viewport.width} ${viewport.height}`} role="group" aria-describedby={summaryId} aria-label={t(view === 'front' ? 'workout.atlas_front_map' : 'workout.atlas_back_map')} onPointerUp={handleAtlasPointer}>
      <rect className="muscle-atlas__interaction-plane" x={viewport.minX} y={viewport.minY} width={viewport.width} height={viewport.height} aria-hidden="true" />
      <g className="muscle-atlas__silhouette" aria-hidden="true">{silhouettePathsFor(view).map((path) => <path key={path.id} d={path.path} />)}</g>
      {visibleActivations.map((activation) => <AtlasRegion key={activation.id} activation={activation} selected={selected} onSelect={onSelect} hitRadius={hitRadius} label={t('workout.atlas_region_label', { muscle: t(muscleLabelKey(activation.id)), role: t(ROLE_ARIA_LABEL_KEYS[activation.role]) })} />)}
    </svg></div>
    <ul className="muscle-atlas__roles" aria-label={t('workout.atlas_roles_label')}>
      {roleActivations.map((activation) => {
        const side = t(ATLAS_GEOMETRY[activation.id].view === 'front' ? 'workout.atlas_side_front' : 'workout.atlas_side_back');
        const actionKey = ATLAS_GEOMETRY[activation.id].view === 'front' ? 'workout.atlas_role_action_front' : 'workout.atlas_role_action_back';
        return <li key={activation.id} className={selected === activation.id ? 'is-selected' : ''}><button type="button" aria-pressed={selected === activation.id} aria-label={t(actionKey, { muscle: t(muscleLabelKey(activation.id)), role: t(ROLE_ARIA_LABEL_KEYS[activation.role]) })} onClick={() => selectActivation(activation)}><span className={`muscle-atlas__swatch muscle-atlas__swatch--${activation.role}`} aria-hidden="true" /><span>{t(muscleLabelKey(activation.id))}{ATLAS_GEOMETRY[activation.id].sourceKind === 'deep-location-guide' ? ` · ${t('workout.atlas_deep_marker')}` : ''}</span><span className="muscle-atlas__side">{side}</span><strong>{t(ROLE_LABEL_KEYS[activation.role])}</strong></button></li>;
      })}
      {homeCompact && activations.length > roleActivations.length ? <li className="muscle-atlas__roles-summary"><span aria-hidden="true" /><span>{t('workout.atlas_more_highlighted', { n: activations.length - roleActivations.length })}</span></li> : null}
    </ul>
  </section>;
}

function ViewControls({ view, setView, t, compact = false }: { view: AnatomyView; setView: (view: AnatomyView) => void; t: (key: string) => string; compact?: boolean }) {
  return <div className={`muscle-atlas__views${compact ? ' muscle-atlas__views--compact' : ''}`} aria-label={t('workout.atlas_view_label')}>
    {(['front', 'back'] as const).map((candidate) => <button key={candidate} type="button" aria-pressed={view === candidate} aria-label={t(candidate === 'front' ? 'workout.atlas_show_front' : 'workout.atlas_show_back')} onClick={() => setView(candidate)}>{t(candidate === 'front' ? 'workout.atlas_front' : 'workout.atlas_back')}</button>)}
  </div>;
}

export default MuscleAtlas;

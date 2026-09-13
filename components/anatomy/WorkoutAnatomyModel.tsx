'use client';
import { useContext, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useI18n } from '@/lib/i18n';
import { activeAtlasRelease } from '@/lib/anatomy/release';
import { fetchAtlasManifest } from '@/lib/anatomy/validation';
import { withAuthored } from '@/lib/anatomy/authored';
import { workoutContext, workoutOcularElements } from '@/lib/anatomy/workout-focus';
import { ATLAS_MUSCLE_MAPPING, mappingForMuscle } from '@/lib/anatomy/mapping';
import type { AtlasManifest } from '@/lib/anatomy/types';
import type { AnatomyMuscleId, AnatomyView, MuscleActivation } from '@/lib/workout/anatomy';
import { AtlasInformation } from './AtlasInformation';
import { MuscleAtlas } from '@/components/workout/MuscleAtlas';
import './anatomy.css';
import './../workout/workout-exploration-v2.css';
import { WorkoutAnatomySource } from './WorkoutAnatomySource';
export { WorkoutAnatomySource } from './WorkoutAnatomySource';
const Canvas = dynamic(() => import('./AtlasCanvas'), { ssr: false });
const systems = ['muscles', 'skeleton'];
const empty: string[] = [];
/** Every curated muscle id whose mapping can be resolved against the source manifest. */
const SELECTABLE_MUSCLES = Object.keys(ATLAS_MUSCLE_MAPPING) as AnatomyMuscleId[];
/** Same source meshes, curation and renderer as Muscle Atlas. Public availability follows the existing release gate. */
export function WorkoutAnatomyModel({ activations, selected, onSelect, view, color, focused, cameraRequest, onManualView, zoom, reset = 0, presentation }: { activations: MuscleActivation[]; selected: AnatomyMuscleId | null; onSelect: (id: AnatomyMuscleId | null) => void; view: AnatomyView; color: string; focused?: AnatomyMuscleId[]; cameraRequest?: number; onManualView?: () => void; zoom?: number; reset?: number; presentation?: "workout-premium" }) {
  const source = useContext(WorkoutAnatomySource);
  const release = activeAtlasRelease(process.env.NEXT_PUBLIC_ANATOMY_ATLAS_ENABLED);
  const manifestUrl = source?.manifestUrl ?? (release ? `/anatomy/${release}/manifest.json` : null);
  const supplement = source?.authoredSupplement;
  const [manifest, setManifest] = useState<AtlasManifest | null>(null);
  const [progress, setProgress] = useState([0, 0]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { t } = useI18n();
  useEffect(() => {
    if (!manifestUrl) return;
    let active = true;
    const controller = new AbortController();
    fetchAtlasManifest(manifestUrl, controller.signal).then(value => { if (active) setManifest(withAuthored(value, supplement)); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; controller.abort(); };
  }, [manifestUrl, supplement, attempt]);
  const context = useMemo(() => manifest ? workoutContext(manifest, []).manifest : null, [manifest]);
  const mapped = useMemo(() => activations.map(activation => ({ activation, elements: manifest?.authored?.muscleElements[activation.id] ?? mappingForMuscle(activation.id)?.concepts.flatMap(id => manifest?.concepts[id]?.elements ?? []) ?? [] })), [activations, manifest]);
  const colors = useMemo(() => Object.fromEntries(mapped.flatMap(({ activation, elements }) => elements.map(id => [id, (selected ? selected !== activation.id : focused?.length && !focused.includes(activation.id)) ? '#89948f' : color]))), [mapped, selected, color, focused]);
  const hidden = useMemo(() => manifest ? workoutOcularElements(manifest) : [], [manifest]);
  // Curated selectable mapping, kept strictly separate from worked/planned colour
  // data: it never adds an activation or highlights unworked tissue as activity.
  const selectionIndex = useMemo(() => {
    const index = new Map<string, AnatomyMuscleId>();
    if (!manifest) return index;
    for (const id of SELECTABLE_MUSCLES) {
      const authored = manifest.authored?.muscleElements[id];
      const elements = authored?.length ? authored : (mappingForMuscle(id)?.concepts ?? []).flatMap(concept => manifest.concepts[concept]?.elements ?? []);
      for (const element of elements) if (!index.has(element)) index.set(element, id);
    }
    return index;
  }, [manifest]);
  const presentedColors = useMemo(() => {
    if (presentation !== 'workout-premium' || !selected) return colors;
    return { ...colors, ...Object.fromEntries([...selectionIndex].filter(([, muscle]) => muscle === selected).map(([element]) => [element, '#d4b574'])) };
  }, [colors, presentation, selected, selectionIndex]);
  if (!manifestUrl || failed) return <div className="wk2 workout-model-fallback">{failed && <div className="workout-model-fallback__status"><p role="status">{t("anatomy.model_fallback")}</p><button type="button" data-testid="workout-model-retry" onClick={() => { setFailed(false); setAttempt(current => current + 1); }}>{t('anatomy.retry')}</button></div>}<MuscleAtlas activations={activations} selected={selected} onSelect={onSelect} viewOverride={view} camera={zoom === undefined ? undefined : { zoom }} compact /></div>;
  return <><div className="wk2 workout-anatomy-model anatomy-stage">
    {context ? <Canvas presentation={presentation} manifest={context} systems={systems} focusElements={empty} selectedElements={empty} elementColors={presentedColors} hiddenElements={hidden} isolated={false} view={view} reset={reset} zoom={zoom ?? 0} framingScale={presentation === 'workout-premium' ? 0.85 : 0.83} cameraRequest={cameraRequest} onManualView={onManualView} interactive={true} onPick={id => { const hit = mapped.find(item => item.elements.includes(id)); const next = hit ? hit.activation.id : selectionIndex.get(id); if (!next) return; onSelect(next === selected ? null : next); }} onError={() => setFailed(true)} onProgress={(loaded, total) => setProgress(previous => previous[0] === loaded && previous[1] === total ? previous : [loaded, total])} label={t('anatomy.viewer')} /> : <p role="status">{t('anatomy.loading')}</p>}
    {context && (progress[1] === 0 || progress[0] < progress[1]) && <p className="workout-model-loading" role="status">{t('anatomy.loading')}</p>}
  </div>{manifest && <AtlasInformation><p>{manifest.license.attribution} · <a href={manifest.license.url}>{manifest.license.id}</a></p>{supplement && <p>{t('anatomy.authored_explanation')} · {supplement.author} · {supplement.license}</p>}<p>{t('anatomy.worked_note')}</p></AtlasInformation>}</>;
}

'use client';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useI18n } from '@/lib/i18n';
import { activeAtlasRelease } from '@/lib/anatomy/release';
import { fetchAtlasManifest } from '@/lib/anatomy/validation';
import { withAuthored, type AuthoredSupplement } from '@/lib/anatomy/authored';
import { workoutContext, workoutOcularElements } from '@/lib/anatomy/workout-focus';
import { mappingForMuscle } from '@/lib/anatomy/mapping';
import type { AtlasManifest } from '@/lib/anatomy/types';
import type { AnatomyMuscleId, AnatomyView, MuscleActivation } from '@/lib/workout/anatomy';
import { MuscleAtlas } from '@/components/workout/MuscleAtlas';
import './anatomy.css';
const Canvas = dynamic(() => import('./AtlasCanvas'), { ssr: false });
export const WorkoutAnatomySource = createContext<{ manifestUrl: string; authoredSupplement?: AuthoredSupplement } | null>(null);
const systems = ['muscles', 'skeleton'];
const empty: string[] = [];
/** Same source meshes, curation and renderer as Muscle Atlas. Public availability follows the existing release gate. */
export function WorkoutAnatomyModel({ activations, selected, onSelect, view, color }: { activations: MuscleActivation[]; selected: AnatomyMuscleId | null; onSelect: (id: AnatomyMuscleId | null) => void; view: AnatomyView; color: string }) {
  const source = useContext(WorkoutAnatomySource);
  const release = activeAtlasRelease(process.env.NEXT_PUBLIC_ANATOMY_ATLAS_ENABLED);
  const manifestUrl = source?.manifestUrl ?? (release ? `/anatomy/${release}/manifest.json` : null);
  const supplement = source?.authoredSupplement;
  const [manifest, setManifest] = useState<AtlasManifest | null>(null);
  const [progress, setProgress] = useState([0, 0]);
  const [failed, setFailed] = useState(false);
  const { t } = useI18n();
  useEffect(() => {
    if (!manifestUrl) return;
    let active = true;
    const controller = new AbortController();
    fetchAtlasManifest(manifestUrl, controller.signal).then(value => { if (active) setManifest(withAuthored(value, supplement)); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; controller.abort(); };
  }, [manifestUrl, supplement]);
  const context = useMemo(() => manifest ? workoutContext(manifest, []).manifest : null, [manifest]);
  const mapped = useMemo(() => activations.map(activation => ({ activation, elements: manifest?.authored?.muscleElements[activation.id] ?? mappingForMuscle(activation.id)?.concepts.flatMap(id => manifest?.concepts[id]?.elements ?? []) ?? [] })), [activations, manifest]);
  const colors = useMemo(() => Object.fromEntries(mapped.flatMap(({ activation, elements }) => elements.map(id => [id, selected && selected !== activation.id ? '#89948f' : color]))), [mapped, selected, color]);
  const hidden = useMemo(() => manifest ? workoutOcularElements(manifest) : [], [manifest]);
  if (!manifestUrl || failed) return <div className="workout-model-fallback">{failed && <p role="status">{t("anatomy.model_fallback")}</p>}<MuscleAtlas activations={activations} selected={selected} onSelect={onSelect} viewOverride={view} compact /></div>;
  return <><div className="workout-anatomy-model anatomy-stage">
    {context ? <Canvas manifest={context} systems={systems} focusElements={empty} selectedElements={empty} elementColors={colors} hiddenElements={hidden} isolated={false} view={view} reset={0} zoom={0} interactive={false} onPick={id => { const hit = mapped.find(item => item.elements.includes(id)); if (hit) onSelect(hit.activation.id === selected ? null : hit.activation.id); }} onError={() => setFailed(true)} onProgress={(loaded, total) => setProgress(previous => previous[0] === loaded && previous[1] === total ? previous : [loaded, total])} label={t('anatomy.viewer')} /> : <p role="status">{t('anatomy.loading')}</p>}
    {context && (progress[1] === 0 || progress[0] < progress[1]) && <p className="workout-model-loading" role="status">{t('anatomy.loading')}</p>}
  </div>{manifest && <details className="workout-model-source"><summary>{t('anatomy.source_details')}</summary><p>{manifest.license.attribution} · <a href={manifest.license.url}>{manifest.license.id}</a></p>{supplement && <p>{t('anatomy.authored_model')} · {supplement.author} · {supplement.license}</p>}</details>}</>;
}

import type { ExerciseMediaRecord } from './exercise-media';

export interface VideoReleaseAsset {
  slug: string; buildKey: string; equipment: string; posterSrc: string; motionSrc: string;
  motionType: 'video/mp4' | 'video/webm'; artifactSetSha256: string; reviewedOn: string;
  phases: Array<{ id: string; startSeconds: number; endSeconds: number; labelKey: string }>;
}
/** Populated only from an operator-validated, human-approved release; empty for R1 infrastructure. */
export const APPROVED_VIDEO_RELEASE: readonly VideoReleaseAsset[] = [];
export function applyVideoRelease(base: ExerciseMediaRecord, release: readonly VideoReleaseAsset[], enabled: boolean): ExerciseMediaRecord {
  if (!enabled || base.tier !== 'verified-technique') return base;
  const matches = release.filter(a => a.slug === base.slug && base.equipment.includes(a.equipment));
  if (matches.length !== 1) return base;
  const asset = matches[0];
  if (!/^[a-f0-9]{64}$/.test(asset.buildKey) || !/^[a-f0-9]{64}$/.test(asset.artifactSetSha256)) return base;
  const prefix = `/workout-v4/${asset.buildKey}/assets/${asset.slug}/`;
  const safePath = (path: string, ext: RegExp) => path.startsWith(prefix) && /^[a-zA-Z0-9._-]+$/.test(path.slice(prefix.length)) && ext.test(path);
  if (!safePath(asset.posterSrc, /\.(webp|png)$/) || !safePath(asset.motionSrc, asset.motionType === 'video/mp4' ? /\.mp4$/ : /\.webm$/)) return base;
  return { ...base, posterSrc: asset.posterSrc, motionSrc: asset.motionSrc, motionType: asset.motionType, timedPhases: asset.phases, provenance: { kind: 'sourced', source: `public/workout-v4/${asset.buildKey}/${asset.slug}.manifest.json`, reviewedOn: asset.reviewedOn } };
}

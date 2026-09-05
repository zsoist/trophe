/** Operator-only UI. Never import into app/, components/ or the workout logger. */
import { useRef, useState, type FormEvent } from 'react';
import { ExerciseMotion } from '../../components/workout/ExerciseMotion';
import { useI18n } from '../../lib/i18n';
import type { ExerciseMediaRecord } from '../../lib/workout/exercise-media';
export interface ReviewRecord {
  releaseId: string; buildKey: string; manifestSha256: string; videoSha256?: string;
  releaseStatus: string; label: string; duration: number;
  media: Omit<ExerciseMediaRecord, 'tier'> & { tier: 'candidate-preview' };
}
export interface Diagnostic {
  url: string; label: string; category: string; sha256: string; sourceKind: string;
  sourceSha256: string; buildKey?: string; frameIndex?: number; ptsSeconds?: number;
  recipeRef?: string; recordingSeconds?: number;
}
function ReviewClip({ record }: { record: ReviewRecord }) {
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [paused, setPaused] = useState(true);
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [videoAvailable, setVideoAvailable] = useState(false);
  const video = () => viewport.current?.querySelector('video');
  const seek = (e: FormEvent<HTMLInputElement>) => { setPaused(true); const v = video(); if (v) { v.pause(); v.currentTime = Number(e.currentTarget.value); setTime(Number(e.currentTarget.value)); } };
  const reset = () => { setZoom(1); viewport.current?.scrollTo?.(0, 0); };
  return <section className="review-clip">
    <h2>{record.label}: {record.media.canonicalNames[0]}</h2>
    <p><strong>candidate — publication disabled</strong> · Manifest status: {record.releaseStatus}</p>
    <dl className="identity"><dt>Asset / release</dt><dd>{record.media.slug} / {record.releaseId}</dd><dt>Build</dt><dd>{record.buildKey}</dd><dt>Video SHA-256</dt><dd>{record.videoSha256 ?? 'No video'}</dd><dt>Manifest SHA-256</dt><dd>{record.manifestSha256}</dd></dl>
    <div className="review-viewport" ref={viewport} tabIndex={0} aria-label="Video viewport; scroll or drag to pan when enlarged"
      onPointerDown={e => { if (zoom === 1 || e.button !== 0) return; const el = e.currentTarget; drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop }; el.setPointerCapture?.(e.pointerId); }}
      onPointerMove={e => { if (!drag.current) return; e.currentTarget.scrollLeft = drag.current.left + drag.current.x - e.clientX; e.currentTarget.scrollTop = drag.current.top + drag.current.y - e.clientY; }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
      onLoadedMetadataCapture={() => { const v = video(); if (v) { v.playbackRate = speed; setVideoAvailable(true); } }}
      onTimeUpdateCapture={() => setTime(video()?.currentTime ?? 0)}>
      <div className={`review-scale review-scale-${zoom}`}>
        <ExerciseMotion media={record.media} alt={`Candidate: ${record.media.canonicalNames[0]}`} previewOnly autoplay playbackDisabled={paused} />
      </div>
    </div>
    <div className="review-toolbar" aria-label="Private review controls">
      <button onClick={() => { const v = video(); if (v) { v.playbackRate = speed; setVideoAvailable(true); } setPaused(!paused); }}>{paused ? 'Play review' : 'Pause review'}</button>
      <label>Time — approximate browser seek <input aria-label="Approximate clip time" type="range" min="0" max={record.duration} step="0.01" value={time} disabled={!videoAvailable} onInput={seek} onChange={seek} /></label>
      <output>{time.toFixed(2)} / {record.duration.toFixed(2)} s</output>
      <label>Speed <select aria-label="Review speed" value={speed} onChange={e => { const rate = Number(e.target.value); setSpeed(rate); const v = video(); if (v) v.playbackRate = rate; }}><option value="0.25">0.25x</option><option value="0.5">0.5x</option><option value="1">1x</option></select></label>
      <label>Zoom <select aria-label="Review zoom" value={zoom} onChange={e => setZoom(Number(e.target.value))}>{[1,2,3,4].map(x => <option key={x} value={x}>{x}x</option>)}</select></label>
      <button onClick={reset}>Reset view</button>
    </div>
    <p>Browser seeks are approximate, not exact frames. Reduced motion keeps the poster; review exported images below. Controls remain outside the grip area.</p>
  </section>;
}
export function PrivateReview({ records, diagnostics }: { records: ReviewRecord[]; diagnostics: Diagnostic[] }) {
  const { setLang } = useI18n();
  return <main><h1>Local candidate review</h1>
    <p>Private VISUAL-02 review. Candidate only; no human approval or publication.</p>
    <label>Locale <select aria-label="Locale" onChange={e => setLang(e.target.value as Parameters<typeof setLang>[0])}>{['en','es','el','fr','de','it','pt','nl'].map(x => <option key={x}>{x}</option>)}</select></label>
    <button onClick={() => document.documentElement.classList.toggle('light')}>Toggle theme</button>
    <p>File integrity: intake checked. Visual / geometry: pending review. Exercise technique: designated human review pending. Muscle appearance does not measure activation.</p>
    {records.map(record => <ReviewClip key={`${record.releaseId}:${record.buildKey}:${record.videoSha256}`} record={record} />)}
    <details><summary>Declared private diagnostics / before and after ({diagnostics.length})</summary>
      <p>Render exports show declared index/PTS and recipe; recording times belong to the recording and do not identify a master clip.</p>
      {!diagnostics.length && <p>No diagnostics declared. HANDS_GATE / ATHLETE_CURL_V2 pending.</p>}
      <div className="diagnostics">{diagnostics.map(item => <figure key={item.url}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <a href={item.url} target="_blank" rel="noreferrer"><img src={item.url} alt={item.label} loading="lazy" /></a>
        <figcaption>{item.category}: {item.label}<br />{item.sourceKind === 'screen_recording' ? `Screen recording ${item.recordingSeconds}s — master link unverified; enlarged capture, not HD render` : `AG2 export: index ${item.frameIndex ?? 'not supplied'}; PTS ${item.ptsSeconds ?? 'not supplied'}s; recipe ${item.recipeRef}`}<br />Source SHA: {item.sourceSha256}<br />Image SHA: {item.sha256}</figcaption>
      </figure>)}</div>
    </details>
  </main>;
}

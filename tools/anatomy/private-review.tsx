"use client";
/** Review-only wrapper. Never imported by product routes or the live logger. */
import { useEffect, useRef, useState } from "react";
import { useI18n, LANGUAGE_OPTIONS } from "../../lib/i18n";
import type { AuthoredSupplement } from "../../lib/anatomy/authored";
import { gestureMetrics, atlasResourceMetrics } from "./device-observation";
import type { Language } from "../../lib/types";
import { PrivateWorkoutWorkspace } from './workout-review/Workspace';
import { navigate, usePathname, useSearchParams } from './workout-review/navigation';
import { resetReview, reviewWorkspaceStorage, REVIEW_USER } from './workout-review/store';
import { clearWorkspaceState } from '../../lib/workout/workspace-storage';
import AnatomyExplorer from "../../components/anatomy/AnatomyExplorer";
import type { RenderObservation } from "../../components/anatomy/AtlasCanvas";
export function PrivateAtlasReview({
  manifestUrl,
  identity,
  authoredSupplement,
}: {
  manifestUrl: string;
  authoredSupplement?: AuthoredSupplement;
  identity: {
    codeSha: string;
    manifestSha256: string;
    release: string;
    authoredSha256?: string | null;
  };
}) {
  const { t, lang, setLang } = useI18n();
  const path = usePathname();
  const deviceCheck = useSearchParams().get('deviceCheck') === '1';
  const [revision, setRevision] = useState(0);
  const reset = (scenario: 'plan' | 'empty') => { resetReview(scenario); clearWorkspaceState(reviewWorkspaceStorage, REVIEW_USER); setRevision(value => value + 1); navigate('/dashboard/workout'); };
  const [device, setDevice] = useState("desktop/emulation");
  const [conditions, setConditions] = useState({ iosSafari: '', network: 'unknown', cache: 'unknown', lowPower: 'unknown' });
  const entry = useRef({ path, started: 0, firstSubmission: null as number | null });
  useEffect(() => { entry.current = { path, started: performance.now(), firstSubmission: null }; }, [path]);
  const onRender = (value: RenderObservation) => {
    entry.current.firstSubmission ??= value.timestamp;
    if (sample.current && sample.current.frames.length < 10000) sample.current.frames.push(value);
  };
  const [report, setReport] = useState<object | null>(null);
  const [copied, setCopied] = useState(false);
  const sample = useRef<{ start: number; frames: RenderObservation[] } | null>(
    null,
  );
  useEffect(() => {
    const internalLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
      const href = anchor?.getAttribute('href');
      if (href === '#main-content') { event.preventDefault(); document.getElementById('main-content')?.focus(); return; }
      if (href?.startsWith('/dashboard/')) { event.preventDefault(); navigate(href); }
    };
    document.addEventListener('click', internalLink);
    return () => document.removeEventListener('click', internalLink);
  }, []);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest(".anatomy-canvas"))
        sample.current = { start: performance.now(), frames: [] };
    };
    const up = (event: PointerEvent) => {
      const s = sample.current;
      if (!s) return;
      sample.current = null;
      const duration = (performance.now() - s.start) / 1000;

      setReport({
        identity,
        device_claim: device,
        conditions_claimed: conditions,
        route: entry.current.path,
        entryToFirstSubmissionMs: entry.current.firstSubmission === null ? null : Math.max(0, entry.current.firstSubmission - entry.current.started),
        firstSubmissionLimit: 'First renderer submission after route entry; not proof that all geometry is loaded.',
        viewport: { width: window.innerWidth, height: window.innerHeight, pixelRatio: window.devicePixelRatio },
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        visibility: document.visibilityState,
        userAgent: navigator.userAgent,
        observedAt: new Date().toISOString(),
        method:
          "Actual renderer submissions during a manual pointer gesture; browser cadence, not GPU presentation timing. No automatic camera motion.",
        ...gestureMetrics(s.frames, duration),
        validSample: gestureMetrics(s.frames, duration).validSample && event.type !== "pointercancel" && document.visibilityState === "visible",
        gestureEnd: event.type,
        anatomyResources: atlasResourceMetrics(performance.getEntriesByType('resource') as PerformanceResourceTiming[]),
      });
      setCopied(false);
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
    };
  }, [device, identity, conditions]);
  return (
    <>
      <aside className="private-device-review"><details open={deviceCheck || undefined}><summary>{t("anatomy.review_prototype")}</summary><p>{t("anatomy.review_sample_scope")}</p>
        <nav className="private-review-switch" aria-label={t("anatomy.review_home")}><button onClick={() => navigate("/dashboard/workout")}>{t("workout.workspace_home_title")}</button><button onClick={() => navigate("/dashboard/workout/atlas")}>{t("anatomy.workout_title")}</button><button onClick={() => reset("plan")}>{t("anatomy.review_reset_plan")}</button><button onClick={() => reset("empty")}>{t("anatomy.review_reset_empty")}</button></nav>
        <label className="private-review-language">
          {t("anatomy.review_language")}
          <select
            value={lang}
            onChange={(event) => setLang(event.target.value as Language)}
          >
            {LANGUAGE_OPTIONS.map(({ code, label }) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <details open={deviceCheck || undefined}>
          <summary>{t("anatomy.review_device_title")}</summary>
          <p>{t("anatomy.review_instructions")}</p><a href="/device-check.txt" target="_blank" rel="noreferrer">{t("anatomy.review_test_sheet")}</a>
          <label>
            {t("anatomy.review_device")}{" "}
            <select value={device} onChange={(e) => setDevice(e.target.value)}>
              <option value="desktop/emulation">
                {t("anatomy.review_desktop")}
              </option>
              <option value="iPhone 15 Pro Max">iPhone 15 Pro Max</option>
              <option value="iPhone 13">iPhone 13</option>
            </select>
          </label>
          <label>{t('anatomy.review_conditions')}<input value={conditions.iosSafari} maxLength={80} onChange={e => setConditions(value => ({ ...value, iosSafari: e.target.value }))} /></label>
          {(['network', 'cache', 'lowPower'] as const).map(key => <label key={key}>{t(`anatomy.${key === 'network' ? 'review_network' : key === 'cache' ? 'review_cache' : 'review_power'}`)}<select value={conditions[key]} onChange={e => setConditions(value => ({ ...value, [key]: e.target.value }))}>
            <option value="unknown">{t('anatomy.review_unknown')}</option>
            {key === 'network' ? <><option value="wifi">Wi-Fi</option><option value="cellular">{t('anatomy.review_cellular')}</option></> : key === 'cache' ? <><option value="first">{t('anatomy.review_first_load')}</option><option value="repeat">{t('anatomy.review_warm_load')}</option></> : <><option value="on">{t('anatomy.review_on')}</option><option value="off">{t('anatomy.review_off')}</option></>}
          </select></label>)}
          {report && (
            <>
              <pre>{JSON.stringify(report, null, 2)}</pre>
              <button onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'trophe-atlas-observation.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>{t('anatomy.review_download')}</button>
              <button
                onClick={() =>
                  void navigator.clipboard
                    .writeText(JSON.stringify(report, null, 2))
                    .then(() => setCopied(true)).catch(() => setCopied(false))
                }
              >
                {t(copied ? "anatomy.review_copied" : "anatomy.review_copy")}
              </button>
            </>
          )}
        </details>
      </details></aside>
      {path !== '/atlas' ? <PrivateWorkoutWorkspace key={revision} manifestUrl={manifestUrl} authoredSupplement={authoredSupplement} onRender={onRender} /> :
      <AnatomyExplorer
        workout
        authoredSupplement={authoredSupplement}
        manifestUrl={manifestUrl}
        onRender={onRender}
      />}
    </>
  );
}

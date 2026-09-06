"use client";
/** Review-only wrapper. Never imported by product routes or the live logger. */
import { useEffect, useRef, useState } from "react";
import { useI18n, LANGUAGE_OPTIONS } from "../../lib/i18n";
import type { AuthoredSupplement } from "../../lib/anatomy/authored";
import type { Language } from "../../lib/types";
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
  const [device, setDevice] = useState("desktop/emulation");
  const [report, setReport] = useState<object | null>(null);
  const [copied, setCopied] = useState(false);
  const sample = useRef<{ start: number; frames: RenderObservation[] } | null>(
    null,
  );
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest(".anatomy-canvas"))
        sample.current = { start: performance.now(), frames: [] };
    };
    const up = () => {
      const s = sample.current;
      if (!s) return;
      sample.current = null;
      const duration = (performance.now() - s.start) / 1000;
      const cpu = s.frames.map((f) => f.durationMs).sort((a, b) => a - b);
      setReport({
        identity,
        device_claim: device,
        userAgent: navigator.userAgent,
        observedAt: new Date().toISOString(),
        method:
          "Actual renderer submissions during a manual pointer gesture; browser cadence, not GPU presentation timing. No automatic camera motion.",
        durationSeconds: duration,
        renderedFrames: s.frames.length,
        framesPerSecond: s.frames.length / duration,
        cpuRenderP95Ms: cpu[Math.floor(cpu.length * 0.95)] ?? null,
        lastRenderer: s.frames.at(-1) ?? null,
        validSample: duration >= 3 && s.frames.length >= 30,
        transferBodyBytes: performance
          .getEntriesByType("resource")
          .reduce(
            (n, r) => n + (r as PerformanceResourceTiming).encodedBodySize,
            0,
          ),
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
  }, [device, identity]);
  return (
    <>
      <aside className="private-device-review">
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
        <details>
          <summary>{t("anatomy.review_device_title")}</summary>
          <p>{t("anatomy.review_instructions")}</p>
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
          {report && (
            <>
              <pre>{JSON.stringify(report, null, 2)}</pre>
              <button
                onClick={() =>
                  void navigator.clipboard
                    .writeText(JSON.stringify(report, null, 2))
                    .then(() => setCopied(true))
                }
              >
                {t(copied ? "anatomy.review_copied" : "anatomy.review_copy")}
              </button>
            </>
          )}
        </details>
      </aside>
      <AnatomyExplorer
        workout
        authoredSupplement={authoredSupplement}
        manifestUrl={manifestUrl}
        onRender={(value) => {
          if (sample.current && sample.current.frames.length < 10000)
            sample.current.frames.push(value);
        }}
      />
    </>
  );
}

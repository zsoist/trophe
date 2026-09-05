"use client";
/** Review-only wrapper. Never imported by product routes or the live logger. */
import { useEffect, useRef, useState } from "react";
import AnatomyExplorer from "../../components/anatomy/AnatomyExplorer";
import type { RenderObservation } from "../../components/anatomy/AtlasCanvas";
export function PrivateAtlasReview({
  manifestUrl,
  identity,
}: {
  manifestUrl: string;
  identity: { codeSha: string; manifestSha256: string; release: string };
}) {
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
        <details>
          <summary>Revisión privada del dispositivo</summary>
          <p>
            Activa el giro en el visor, arrastra el cuerpo durante al menos 5
            segundos y copia el informe. Repite con esqueleto y músculos. Esto
            mide el envío de cuadros del navegador; confirma también si observas
            saltos o defectos.
          </p>
          <label>
            Dispositivo{" "}
            <select value={device} onChange={(e) => setDevice(e.target.value)}>
              <option value="desktop/emulation">Escritorio / emulación</option>
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
                {copied ? "Copiado" : "Copiar informe"}
              </button>
            </>
          )}
        </details>
      </aside>
      <AnatomyExplorer
        workout
        manifestUrl={manifestUrl}
        onRender={(value) => {
          if (sample.current && sample.current.frames.length < 10000)
            sample.current.frames.push(value);
        }}
      />
    </>
  );
}

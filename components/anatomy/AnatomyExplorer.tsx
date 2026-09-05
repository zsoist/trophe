"use client";
import type { RenderObservation } from "./AtlasCanvas";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useI18n } from "@/lib/i18n";
import type { AtlasManifest } from "@/lib/anatomy/types";
import {
  conceptForElement,
  selectionElements,
  visibleSelection,
} from "@/lib/anatomy/selection";
import { fitsAtlasMemory } from "@/lib/anatomy/budget";
import { mappingForMuscle } from "@/lib/anatomy/mapping";
import { muscleLabel, type AnatomyMuscleId } from "@/lib/workout/anatomy";
import { fetchAtlasManifest } from "@/lib/anatomy/validation";
import "./anatomy.css";
const AtlasCanvas = dynamic(() => import("./AtlasCanvas"), { ssr: false });
const SYSTEMS = [
  "skeleton",
  "muscles",
  "connective",
  "vascular",
  "nervous",
  "organs",
  "other",
];
export default function AnatomyExplorer({
  manifestUrl,
  initialMuscle,
  onRender,
}: {
  manifestUrl: string;
  initialMuscle?: string;
  onRender?: (value: RenderObservation) => void;
}) {
  const { t, lang } = useI18n();
  const [manifest, setManifest] = useState<AtlasManifest | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [layerLimited, setLayerLimited] = useState(false);
  const openButton = useRef<HTMLButtonElement>(null);
  const focusOnClose = useRef(false);
  const [systems, setSystems] = useState(["skeleton"]);
  const [selected, setSelected] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [isolated, setIsolated] = useState(false);
  const [view, setView] = useState<"front" | "back" | "side">("front");
  const [zoom, setZoom] = useState(0);
  const [reset, setReset] = useState(0);
  const [interactive, setInteractive] = useState(false);
  const [show3d, setShow3d] = useState(false);
  const [progress, setProgress] = useState([0, 0]);
  useEffect(() => {
    const controller = new AbortController();
    void fetchAtlasManifest(manifestUrl, controller.signal)
      .then(setManifest)
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [manifestUrl, retry]);
  const onError = useCallback(() => {
    setError(true);
    setShow3d(false);
  }, []);
  const onProgress = useCallback(
    (a: number, b: number) =>
      setProgress((p) => (p[0] === a && p[1] === b ? p : [a, b])),
    [],
  );
  const selectedElements = useMemo(
    () => (manifest && selected ? selectionElements(manifest, [selected]) : []),
    [manifest, selected],
  );
  const selectionVisibility =
    manifest && selected
      ? visibleSelection(manifest, selected, new Set(systems), new Set(hidden))
      : null;
  const matches = useMemo(
    () =>
      manifest
        ? Object.values(manifest.concepts)
            .filter(
              (c) =>
                !query ||
                `${c.id} ${c.source_names.join(" ")}`
                  .toLowerCase()
                  .includes(query.toLowerCase()),
            )
            .sort((a, b) => a.source_names[0].localeCompare(b.source_names[0]))
        : [],
    [manifest, query],
  );
  const concept = manifest && selected ? manifest.concepts[selected] : null;
  const onPick = useCallback(
    (id: string) => {
      if (manifest) setSelected(conceptForElement(manifest, id));
    },
    [manifest],
  );
  const changeSystems = (next: string[]) => {
    if (manifest && !fitsAtlasMemory(manifest, next)) {
      setLayerLimited(true);
      return;
    }
    setLayerLimited(false);
    setSystems(next);
  };
  useEffect(() => {
    if (!show3d && focusOnClose.current) {
      openButton.current?.focus();
      focusOnClose.current = false;
    }
  }, [show3d]);
  const muscleMapping = initialMuscle ? mappingForMuscle(initialMuscle) : null;
  const parents =
    manifest && selected
      ? manifest.relations.filter((r) => r.child === selected)
      : [];
  return (
    <main className="anatomy-explorer">
      <header>
        <p className="anatomy-eyebrow">Trophē · BodyParts3D</p>
        <h1>{t("anatomy.title")}</h1>
        <p>{t("anatomy.scope")}</p>
        {!["en", "es", "el"].includes(lang) && (
          <p>{t("anatomy.english_chrome")}</p>
        )}
      </header>
      {muscleMapping && (
        <section aria-label={t("anatomy.mapped_group")}>
          <h2>{muscleLabel(initialMuscle as AnatomyMuscleId)}</h2>
          <p>{t("anatomy.mapping_scope")}</p>
          <p>{t(`anatomy.mapping_${muscleMapping.scope}`)}</p>
          <ul>
            {muscleMapping.concepts.map((id) => (
              <li key={id}>
                <button onClick={() => setSelected(id)}>
                  {manifest?.concepts[id]?.source_names[0] ?? id}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="anatomy-workspace">
        <section className="anatomy-stage" aria-label={t("anatomy.viewer")}>
          <div
            className="anatomy-viewbar"
            role="group"
            aria-label={t("anatomy.orientation")}
          >
            {(["front", "back", "side"] as const).map((v) => (
              <button
                key={v}
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {t(`anatomy.${v}`)}
              </button>
            ))}
            <button
              onClick={() => {
                setView("front");
                setReset((v) => v + 1);
                setHidden([]);
                setIsolated(false);
              }}
            >
              {t("anatomy.reset")}
            </button>
          </div>
          {show3d && (
            <div className="anatomy-viewbar">
              <button onClick={() => setZoom((z) => z + 1)}>
                {t("anatomy.zoom_in")}
              </button>
              <button onClick={() => setZoom((z) => z - 1)}>
                {t("anatomy.zoom_out")}
              </button>
            </div>
          )}
          {manifest && show3d && !error ? (
            <AtlasCanvas
              key={retry}
              manifest={manifest}
              onRender={onRender}
              systems={systems}
              selectedElements={selectedElements}
              hiddenElements={hidden}
              isolated={isolated}
              view={view}
              reset={reset}
              zoom={zoom}
              interactive={interactive}
              onPick={onPick}
              onError={onError}
              onProgress={onProgress}
              label={t("anatomy.viewer")}
            />
          ) : (
            <div className="anatomy-poster">
              {manifest?.poster && !error && (
                <Image
                  unoptimized
                  src={manifest.poster.url}
                  width={manifest.poster.width}
                  height={manifest.poster.height}
                  alt={t("anatomy.viewer")}
                />
              )}
              <p>
                {t(
                  error
                    ? "anatomy.fallback"
                    : manifest
                      ? "anatomy.open_hint"
                      : "anatomy.loading",
                )}
              </p>
              {manifest && !error && (
                <button ref={openButton} onClick={() => setShow3d(true)}>
                  {t("anatomy.open")}
                </button>
              )}
            </div>
          )}
          {error && (
            <button
              onClick={() => {
                setError(false);
                setRetry((n) => n + 1);
                setShow3d(true);
              }}
            >
              {t("anatomy.retry")}
            </button>
          )}
          {show3d && (
            <>
              <p role="status">
                {progress[0]} / {progress[1]} · {t("anatomy.layers_loaded")}
              </p>
              <button
                aria-pressed={interactive}
                onClick={() => setInteractive((v) => !v)}
              >
                {t(interactive ? "anatomy.unlock_scroll" : "anatomy.orbit")}
              </button>
              <button
                onClick={() => {
                  focusOnClose.current = true;
                  setShow3d(false);
                  setInteractive(false);
                }}
              >
                {t("anatomy.close")}
              </button>
            </>
          )}
          <fieldset>
            <legend>{t("anatomy.systems")}</legend>
            {SYSTEMS.map((s) => (
              <label key={s}>
                <input
                  type="checkbox"
                  checked={systems.includes(s)}
                  onChange={() =>
                    changeSystems(
                      systems.includes(s)
                        ? systems.filter((x) => x !== s)
                        : [...systems, s],
                    )
                  }
                />
                {t(`anatomy.${s}`)}{" "}
                {manifest
                  ? Object.values(manifest.elements).filter(
                      (e) => e.system === s && e.availability === "available",
                    ).length
                  : ""}
              </label>
            ))}
          </fieldset>
          {layerLimited && <p role="status">{t("anatomy.layer_limit")}</p>}
        </section>
        <aside className="anatomy-context">
          <h2>{t("anatomy.selection")}</h2>
          {concept ? (
            <>
              <h3>{concept.source_names[0]}</h3>
              <p>
                {t("anatomy.source_english")} · {concept.id}
              </p>
              <p>
                {t(`anatomy.${concept.laterality}`)} ·{" "}
                {t(`anatomy.${concept.availability}`)}
              </p>
              {selectionVisibility?.hidden.length !== 0 && (
                <p role="status">{t("anatomy.hidden_target")}</p>
              )}
              <div className="anatomy-actions">
                <button
                  onClick={() => {
                    setHidden((h) =>
                      h.filter((id) => !selectedElements.includes(id)),
                    );
                    changeSystems([
                      ...new Set([
                        ...systems,
                        ...selectedElements
                          .map((id) => manifest!.elements[id]?.system)
                          .filter(Boolean),
                      ]),
                    ]);
                  }}
                >
                  {t("anatomy.reveal")}
                </button>
                <button
                  onClick={() =>
                    setHidden((h) => [...new Set([...h, ...selectedElements])])
                  }
                >
                  {t("anatomy.hide")}
                </button>
                <button
                  aria-pressed={isolated}
                  onClick={() => setIsolated((v) => !v)}
                >
                  {t("anatomy.isolate")}
                </button>
              </div>
              <ul>
                {parents.map((p) => (
                  <li key={`${p.type}-${p.parent}`}>
                    <button onClick={() => setSelected(p.parent)}>
                      {p.type === "isa" ? "IS-A" : "PART-OF"} ·{" "}
                      {manifest!.concepts[p.parent]?.source_names[0] ??
                        p.parent}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>{t("anatomy.no_selection")}</p>
          )}
          <label className="anatomy-search">
            {t("anatomy.search")}
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={100}
            />
          </label>
          <p role="status">
            {matches.length} · {t("anatomy.results")}
          </p>
          <ul className="anatomy-results">
            {matches.slice(0, 100).map((c) => (
              <li key={c.id}>
                <button
                  aria-pressed={selected === c.id}
                  onClick={() => setSelected(c.id)}
                >
                  <span>{c.source_names[0]}</span>
                  <small>
                    {c.id} · {t(`anatomy.${c.laterality}`)}
                  </small>
                </button>
              </li>
            ))}
          </ul>
          {matches.length > 100 && <p>{t("anatomy.refine")}</p>}
        </aside>
      </div>
      <details>
        <summary>{t("anatomy.details")}</summary>
        {manifest && (
          <>
            <p>
              {manifest.license.attribution} ·{" "}
              <a href={manifest.license.url}>CC BY 4.0</a>
            </p>
            <p>{t("anatomy.not_clinical")}</p>
            <p>
              {t("anatomy.coverage")}: {manifest.coverage.converted}/
              {manifest.coverage.source_elements} · {t("anatomy.rejected")}:{" "}
              {manifest.coverage.rejected} · {t("anatomy.missing")}:{" "}
              {manifest.coverage.missing}
            </p>
            <p>{manifest.license.modifications.join(" ")}</p>
            <p className="anatomy-hash">
              {manifest.source.release} · SHA256 {manifest.source.sha256}
            </p>
          </>
        )}
      </details>
    </main>
  );
}

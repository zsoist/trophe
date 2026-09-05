"use client";
import type { RenderObservation } from "./AtlasCanvas";
import Image from "next/image";
import {
  Bone,
  Dumbbell,
  Link2,
  HeartPulse,
  Activity,
  Scan,
  Shapes,
  Search,
  RotateCcw,
  Plus,
  Minus,
  Move,
  X,
  Eye,
  EyeOff,
  Focus,
  Layers,
  ArrowUpRight,
} from "lucide-react";
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
const SYSTEM_ICONS = [
  Bone,
  Dumbbell,
  Link2,
  HeartPulse,
  Activity,
  Scan,
  Shapes,
];
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
  const [catalogueSystem, setCatalogueSystem] = useState("");
  const [panel, setPanel] = useState<"layers" | "search">("layers");
  const [catalogueSide, setCatalogueSide] = useState("");
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
                (!catalogueSystem ||
                  c.elements.some(
                    (id) => manifest.elements[id]?.system === catalogueSystem,
                  )) &&
                (!catalogueSide || c.laterality === catalogueSide) &&
                (!query ||
                  `${c.id} ${c.source_names.join(" ")}`
                    .toLowerCase()
                    .includes(query.trim().toLowerCase())),
            )
            .sort((a, b) => a.source_names[0].localeCompare(b.source_names[0]))
        : [],
    [manifest, query, catalogueSystem, catalogueSide],
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
        <h1>{t("anatomy.title")}</h1>
        <p className="anatomy-intro">{t("anatomy.scope")}</p>
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
              className="anatomy-icon-button"
              aria-label={t("anatomy.reset")}
              title={t("anatomy.reset")}
              onClick={() => {
                setView("front");
                setReset((v) => v + 1);
                setHidden([]);
                setIsolated(false);
              }}
            >
              <RotateCcw aria-hidden="true" size={18} />
            </button>
          </div>
          {show3d && (
            <div className="anatomy-zoom">
              <button
                aria-label={t("anatomy.zoom_in")}
                title={t("anatomy.zoom_in")}
                onClick={() => setZoom((z) => z + 1)}
              >
                <Plus aria-hidden="true" size={20} />
              </button>
              <button
                aria-label={t("anatomy.zoom_out")}
                title={t("anatomy.zoom_out")}
                onClick={() => setZoom((z) => z - 1)}
              >
                <Minus aria-hidden="true" size={20} />
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
            <div className="anatomy-stage-footer">
              <p
                role="status"
                className="anatomy-load-status"
                title={`${progress[0]} / ${progress[1]} · ${t("anatomy.layers_loaded")}`}
              >
                <span className="anatomy-status-dot" />
                {t(
                  progress[1] > 0 && progress[0] === progress[1]
                    ? "anatomy.ready"
                    : "anatomy.loading",
                )}
              </p>
              <button
                aria-pressed={interactive}
                aria-label={t(
                  interactive ? "anatomy.unlock_scroll" : "anatomy.orbit",
                )}
                onClick={() => setInteractive((v) => !v)}
              >
                <Move size={17} aria-hidden="true" />
                <span>
                  {t(
                    interactive
                      ? "anatomy.scroll_short"
                      : "anatomy.orbit_short",
                  )}
                </span>
              </button>
              <button
                className="anatomy-icon-button"
                aria-label={t("anatomy.close")}
                title={t("anatomy.close")}
                onClick={() => {
                  focusOnClose.current = true;
                  setShow3d(false);
                  setInteractive(false);
                }}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          )}
        </section>
        <aside className="anatomy-context" data-panel={panel}>
          <nav
            className="anatomy-panel-nav"
            aria-label={t("anatomy.explore_controls")}
          >
            <button
              aria-pressed={panel === "layers"}
              onClick={() => setPanel("layers")}
            >
              <Layers size={18} aria-hidden="true" />
              {t("anatomy.layers_tab")}
            </button>
            <button
              aria-pressed={panel === "search"}
              onClick={() => setPanel("search")}
            >
              <Search size={18} aria-hidden="true" />
              {t("anatomy.search_tab")}
            </button>
          </nav>
          <section
            className="anatomy-layer-panel"
            aria-label={t("anatomy.systems")}
          >
            <div className="anatomy-panel-heading">
              <Layers size={18} aria-hidden="true" />
              <h2>{t("anatomy.layers")}</h2>
              <span>
                {systems.length} / {SYSTEMS.length}
              </span>
            </div>
            <p className="anatomy-panel-hint">{t("anatomy.layers_hint")}</p>
            <fieldset>
              <legend className="anatomy-sr-only">
                {t("anatomy.systems")}
              </legend>
              {SYSTEMS.map((system, index) => {
                const SystemIcon = SYSTEM_ICONS[index];
                return (
                  <label
                    key={system}
                    className="anatomy-layer"
                    data-active={systems.includes(system)}
                  >
                    <SystemIcon
                      size={20}
                      strokeWidth={1.6}
                      aria-hidden="true"
                    />
                    <span>{t(`anatomy.short_${system}`)}</span>
                    <small>
                      {manifest
                        ? Object.values(manifest.elements).filter(
                            (e) =>
                              e.system === system &&
                              e.availability === "available",
                          ).length
                        : ""}
                    </small>
                    <input
                      aria-label={t(`anatomy.${system}`)}
                      type="checkbox"
                      checked={systems.includes(system)}
                      onChange={() =>
                        changeSystems(
                          systems.includes(system)
                            ? systems.filter((x) => x !== system)
                            : [...systems, system],
                        )
                      }
                    />
                  </label>
                );
              })}
            </fieldset>
            {layerLimited && (
              <p className="anatomy-notice" role="status">
                {t("anatomy.layer_limit")}
              </p>
            )}
          </section>
          <section className="anatomy-selection-panel">
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
                    <Eye size={16} aria-hidden="true" />
                    {t("anatomy.reveal")}
                  </button>
                  <button
                    onClick={() =>
                      setHidden((h) => [
                        ...new Set([...h, ...selectedElements]),
                      ])
                    }
                  >
                    <EyeOff size={16} aria-hidden="true" />
                    {t("anatomy.hide")}
                  </button>
                  <button
                    aria-pressed={isolated}
                    onClick={() => setIsolated((v) => !v)}
                  >
                    <Focus size={16} aria-hidden="true" />
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
          </section>
          <section
            className="anatomy-catalogue"
            aria-label={t("anatomy.catalogue")}
          >
            <div className="anatomy-panel-heading">
              <Search size={18} aria-hidden="true" />
              <h2>{t("anatomy.catalogue")}</h2>
            </div>
            <label className="anatomy-search">
              <span className="anatomy-sr-only">{t("anatomy.search")}</span>
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                placeholder={t("anatomy.search_placeholder")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={100}
              />
            </label>
            <div className="anatomy-filters">
              <label>
                <span>{t("anatomy.group_filter")}</span>
                <select
                  value={catalogueSystem}
                  onChange={(e) => setCatalogueSystem(e.target.value)}
                >
                  <option value="">{t("anatomy.all_systems")}</option>
                  {SYSTEMS.map((system) => (
                    <option key={system} value={system}>
                      {t(`anatomy.short_${system}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t("anatomy.side_filter")}</span>
                <select
                  value={catalogueSide}
                  onChange={(e) => setCatalogueSide(e.target.value)}
                >
                  <option value="">{t("anatomy.all_sides")}</option>
                  {["left", "right", "unspecified"].map((side) => (
                    <option key={side} value={side}>
                      {t(`anatomy.${side}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="anatomy-result-count" role="status">
              {matches.length} · {t("anatomy.results")}
            </p>
            {matches.length === 0 && manifest && (
              <div className="anatomy-empty">
                <Search size={24} aria-hidden="true" />
                <p>{t("anatomy.no_results")}</p>
                <button
                  onClick={() => {
                    setQuery("");
                    setCatalogueSystem("");
                    setCatalogueSide("");
                  }}
                >
                  {t("anatomy.clear_filters")}
                </button>
              </div>
            )}
            <ul className="anatomy-results">
              {matches.slice(0, 100).map((c) => (
                <li key={c.id}>
                  <button
                    aria-pressed={selected === c.id}
                    onClick={() => setSelected(c.id)}
                  >
                    <span className="anatomy-result-name">
                      {c.source_names[0]}
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </span>
                    <small>
                      {c.id} · {t(`anatomy.${c.laterality}`)}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
            {matches.length > 100 && (
              <p className="anatomy-panel-hint">{t("anatomy.refine")}</p>
            )}
          </section>
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

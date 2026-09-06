"use client";
import type { RenderObservation } from "./AtlasCanvas";
import Image from "next/image";
import { workoutAtlasFilter } from "@/lib/anatomy/workout-navigation";
import {
  PersonStanding,
  Shirt,
  BicepsFlexed,
  Footprints,
  Armchair,
  Shrink,
  MoveUpRight,
  MoveDownRight,
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
import { BROWSE_GROUPS, browseConcepts } from "@/lib/anatomy/browse";
import {
  WORKOUT_FOCUS_GROUPS,
  WORKOUT_SYSTEMS,
  workoutFocus,
  workoutContext,
  isWorkoutFocusGroup,
  type WorkoutFocusGroup,
} from "@/lib/anatomy/workout-focus";
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
const TRAINING_ICONS = {
  chest: Shirt,
  back: Layers,
  shoulders: MoveUpRight,
  arms: BicepsFlexed,
  biceps: BicepsFlexed,
  triceps: MoveDownRight,
  legs: Footprints,
  glutes: Armchair,
  core: Shrink,
  neck: Move,
};
export default function AnatomyExplorer({
  manifestUrl,
  initialMuscle,
  onRender,
  workout = false,
  initialGroup,
}: {
  manifestUrl: string;
  initialMuscle?: string;
  workout?: boolean;
  initialGroup?: string;
  onRender?: (value: RenderObservation) => void;
}) {
  const { t, lang } = useI18n();
  const [workoutMode, setWorkoutMode] = useState(workout);
  const [focusGroup, setFocusGroup] = useState<WorkoutFocusGroup | "">(() =>
    initialGroup && isWorkoutFocusGroup(initialGroup)
      ? initialGroup
      : initialMuscle
        ? ((Object.entries(WORKOUT_FOCUS_GROUPS).find(([, ids]) =>
            (ids as string[]).includes(initialMuscle),
          )?.[0] as WorkoutFocusGroup) ?? "")
        : "",
  );
  const [subgroupColors, setSubgroupColors] = useState(false);
  const [manifest, setManifest] = useState<AtlasManifest | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [catalogueSystem, setCatalogueSystem] = useState("");
  const [panel, setPanel] = useState<"layers" | "search">("layers");
  const [catalogueSide, setCatalogueSide] = useState("");
  const [browseGroup, setBrowseGroup] = useState("");
  const [fullCatalogue, setFullCatalogue] = useState(false);
  const [cardEdge, setCardEdge] = useState<"top" | "bottom">("top");
  const stage = useRef<HTMLElement>(null);
  const [layerLimited, setLayerLimited] = useState(false);
  const openButton = useRef<HTMLButtonElement>(null);
  const focusOnClose = useRef(false);
  const [systems, setSystems] = useState(
    workout ? WORKOUT_SYSTEMS : ["skeleton"],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [isolated, setIsolated] = useState(false);
  const [view, setView] = useState<"front" | "back" | "side">(
    ["back", "glutes", "triceps"].includes(focusGroup) ? "back" : "front",
  );
  const [zoom, setZoom] = useState(0);
  const [reset, setReset] = useState(0);
  const [cameraRequest, setCameraRequest] = useState(0);

  const [show3d, setShow3d] = useState(workout);
  const [progress, setProgress] = useState([0, 0]);
  const revealViewer = () => {
    if (window.matchMedia?.("(max-width: 899px)").matches)
      requestAnimationFrame(() =>
        stage.current?.scrollIntoView({
          block: "start",
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
        }),
      );
  };
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
  const focused = useMemo(
    () => (manifest ? workoutFocus(manifest, focusGroup) : null),
    [manifest, focusGroup],
  );
  const context = useMemo(
    () => (manifest && workoutMode ? workoutContext(manifest, []) : null),
    [manifest, workoutMode],
  );
  const colors = useMemo(() => {
    const values: Record<string, string> = {};
    if (subgroupColors)
      for (const subgroup of focused?.subgroups ?? [])
        for (const id of subgroup.elements)
          values[id] =
            values[id] && values[id] !== subgroup.color
              ? "#b9bdba"
              : subgroup.color;
    return values;
  }, [focused, subgroupColors]);
  const selectionVisibility =
    manifest && selected
      ? visibleSelection(manifest, selected, new Set(systems), new Set(hidden))
      : null;
  const matches = useMemo(
    () =>
      manifest
        ? browseConcepts(manifest, {
            query,
            system: catalogueSystem,
            side: catalogueSide,
            group: browseGroup,
            fullCatalogue,
          })
        : [],
    [
      manifest,
      query,
      catalogueSystem,
      catalogueSide,
      browseGroup,
      fullCatalogue,
    ],
  );
  const browsing = !!(query.trim() || catalogueSystem || fullCatalogue);
  const systemCounts = useMemo(
    () =>
      Object.fromEntries(
        SYSTEMS.map((system) => [
          system,
          manifest
            ? Object.values(manifest.elements).filter(
                (e) => e.system === system && e.availability === "available",
              ).length
            : 0,
        ]),
      ),
    [manifest],
  );
  const concept = manifest && selected ? manifest.concepts[selected] : null;
  const onPick = useCallback(
    (id: string, position?: { x: number; y: number }) => {
      setCardEdge(position && position.y < 0.5 ? "bottom" : "top");
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
    <main
      className={`anatomy-explorer ${workoutMode ? "anatomy-workout-mode" : ""}`}
    >
      <header>
        <h1>{t(workoutMode ? "anatomy.workout_title" : "anatomy.title")}</h1>
        <p className="anatomy-intro">
          {t(workoutMode ? "anatomy.workout_intro" : "anatomy.scope")}
        </p>
        {workout && (
          <button
            className="anatomy-depth-toggle"
            onClick={() => {
              setWorkoutMode((v) => !v);
              setSystems(
                workoutMode ? ["muscles", "skeleton"] : WORKOUT_SYSTEMS,
              );
              setSelected(null);
              setIsolated(false);
            }}
          >
            <Layers size={17} aria-hidden="true" />
            {t(
              workoutMode ? "anatomy.explore_deep" : "anatomy.back_to_workout",
            )}
          </button>
        )}
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
      {workoutMode && (
        <section
          className="anatomy-training-controls"
          aria-label={t("anatomy.training_groups")}
        >
          <div className="anatomy-training-groups">
            <button
              aria-pressed={!focusGroup}
              onClick={() => {
                setFocusGroup("");
                setSelected(null);
                setIsolated(false);
                setView("front");
                setReset((v) => v + 1);
                setShow3d(true);
                revealViewer();
              }}
            >
              <PersonStanding size={24} aria-hidden="true" />
              <span>{t("anatomy.whole_body")}</span>
            </button>
            {(Object.keys(WORKOUT_FOCUS_GROUPS) as WorkoutFocusGroup[]).map(
              (group) => {
                const GroupIcon = TRAINING_ICONS[group];
                return (
                  <button
                    key={group}
                    aria-pressed={focusGroup === group}
                    onClick={() => {
                      setFocusGroup(group);
                      setCameraRequest((v) => v + 1);
                      setSelected(null);
                      setIsolated(false);
                      setShow3d(true);
                      setView(
                        ["back", "glutes", "triceps"].includes(group)
                          ? "back"
                          : "front",
                      );
                      revealViewer();
                    }}
                  >
                    <GroupIcon size={24} aria-hidden="true" />
                    <span>{t(`anatomy.focus_${group}`)}</span>
                  </button>
                );
              },
            )}
          </div>
          {focusGroup && (
            <div className="anatomy-focus-summary">
              <h2>{t(`anatomy.focus_${focusGroup}`)}</h2>
              <button
                aria-pressed={subgroupColors}
                disabled={!focused?.elements.length}
                onClick={() => setSubgroupColors((v) => !v)}
              >
                <Shapes size={17} aria-hidden="true" />
                {t("anatomy.subgroup_colors")}
              </button>
            </div>
          )}
          {focused?.partial && (
            <p className="anatomy-panel-hint" role="status">
              {t(
                focused.elements.length
                  ? "anatomy.focus_partial"
                  : "anatomy.unmapped",
              )}
            </p>
          )}
          {focusGroup && (
            <ul className="anatomy-focus-legend">
              {focused?.subgroups.map((group) => (
                <li key={group.id}>
                  <span
                    style={{
                      background: subgroupColors
                        ? group.color
                        : "var(--accent)",
                    }}
                    aria-hidden="true"
                  />
                  <span>
                    {t(`workout.atlas_muscle_${group.id.replaceAll("-", "_")}`)}
                    {!group.elements.length
                      ? ` · ${t("anatomy.unmapped")}`
                      : group.scope === "partial"
                        ? ` · ${t("anatomy.partial")}`
                        : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="anatomy-panel-hint">{t("anatomy.focus_role_limit")}</p>
          {subgroupColors && Object.values(colors).includes("#b9bdba") && (
            <p className="anatomy-panel-hint">{t("anatomy.shared_geometry")}</p>
          )}
          {workoutAtlasFilter(focusGroup) && (
            <a
              className="anatomy-exercise-link"
              href={`${onRender ? "https://trophe.app" : ""}/dashboard/workout/exercises?atlas=${encodeURIComponent(focusGroup)}`}
            >
              {t("anatomy.find_group_exercises")}
              <ArrowUpRight size={17} aria-hidden="true" />
            </a>
          )}
        </section>
      )}
      <div className="anatomy-workspace">
        <section
          ref={stage}
          className="anatomy-stage"
          aria-label={t("anatomy.viewer")}
        >
          <div
            className="anatomy-viewbar"
            role="group"
            aria-label={t("anatomy.orientation")}
          >
            {(["front", "back", "side"] as const).map((v) => (
              <button
                key={v}
                aria-pressed={view === v}
                onClick={() => {
                  setView(v);
                  setCameraRequest((n) => n + 1);
                }}
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
              manifest={context?.manifest ?? manifest}
              focusElements={
                workoutMode && focusGroup ? focused?.elements : undefined
              }
              elementColors={workoutMode ? colors : undefined}
              onRender={onRender}
              systems={systems}
              selectedElements={selectedElements}
              hiddenElements={hidden}
              isolated={isolated}
              view={view}
              reset={reset}
              zoom={zoom}
              interactive
              cameraGroup={workoutMode ? focusGroup : undefined}
              cameraRequest={cameraRequest}
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
          {workoutMode && context && (
            <p className="anatomy-context-note">
              {t("anatomy.workout_layers")} ·{" "}
              {t("anatomy.vascular_context", {
                n: context.vascularChunks,
                total: context.totalVascularChunks,
              })}
            </p>
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
          {concept && show3d && !error && (
            <section
              className="anatomy-pick-card"
              data-edge={cardEdge}
              aria-label={t("anatomy.structure_card")}
            >
              <div className="anatomy-pick-title">
                <div>
                  <p>
                    {t("anatomy.source_english")} · {concept.id}
                  </p>
                  <h2>{concept.source_names[0]}</h2>
                </div>
                <button
                  aria-label={t("anatomy.dismiss_selection")}
                  onClick={() => {
                    setSelected(null);
                    setIsolated(false);
                  }}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              <p>
                {t(`anatomy.${concept.laterality}`)} ·{" "}
                {t(`anatomy.${concept.availability}`)}
              </p>
              {parents
                .filter((p) => p.type === "partof")
                .slice(0, 2)
                .map((p) => (
                  <p key={p.parent}>
                    {t("anatomy.part_of")}{" "}
                    <strong>
                      {manifest!.concepts[p.parent]?.source_names[0] ??
                        p.parent}
                    </strong>
                  </p>
                ))}
              {selectionVisibility?.hidden.length !== 0 && (
                <p role="status">{t("anatomy.hidden_target")}</p>
              )}
              <div className="anatomy-actions">
                <button
                  aria-pressed={isolated}
                  onClick={() => setIsolated((v) => !v)}
                >
                  <Focus size={16} aria-hidden="true" />
                  {t("anatomy.isolate")}
                </button>
                <button
                  onClick={() => {
                    setSelected(null);
                    setIsolated(false);
                  }}
                >
                  <Scan size={16} aria-hidden="true" />
                  {t("anatomy.whole_body")}
                </button>
              </div>
            </section>
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
              <span className="anatomy-gesture-hint">
                <Move size={17} aria-hidden="true" />
                {t("anatomy.gesture_hint")}
              </span>
              <button
                className="anatomy-icon-button"
                aria-label={t("anatomy.close")}
                title={t("anatomy.close")}
                onClick={() => {
                  focusOnClose.current = true;
                  setShow3d(false);
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
            <div
              className="anatomy-presets"
              role="group"
              aria-label={t("anatomy.presets")}
            >
              <button
                onClick={() => {
                  changeSystems(["skeleton"]);
                  setHidden([]);
                  setIsolated(false);
                }}
              >
                <Bone size={16} aria-hidden="true" />
                {t("anatomy.short_skeleton")}
              </button>
              <button
                onClick={() => {
                  changeSystems(["skeleton", "muscles"]);
                  setHidden([]);
                  setIsolated(false);
                }}
              >
                <Dumbbell size={16} aria-hidden="true" />
                {t("anatomy.movement_layers")}
              </button>
              <button onClick={() => changeSystems([])}>
                <EyeOff size={16} aria-hidden="true" />
                {t("anatomy.hide_all")}
              </button>
            </div>
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
                    <small>{systemCounts[system]}</small>
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
                        {t(
                          p.type === "isa"
                            ? "anatomy.kind_of"
                            : "anatomy.part_of",
                        )}{" "}
                        ·{" "}
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
            <p className="anatomy-panel-hint">{t("anatomy.browse_hint")}</p>
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
            <div
              className="anatomy-category-grid"
              role="group"
              aria-label={t("anatomy.group_filter")}
            >
              {SYSTEMS.map((system, index) => {
                const CategoryIcon = SYSTEM_ICONS[index];
                return (
                  <button
                    key={system}
                    aria-pressed={catalogueSystem === system}
                    onClick={() => {
                      setCatalogueSystem(
                        catalogueSystem === system ? "" : system,
                      );
                      setBrowseGroup("");
                    }}
                  >
                    <CategoryIcon
                      size={22}
                      strokeWidth={1.6}
                      aria-hidden="true"
                    />
                    <span>{t(`anatomy.short_${system}`)}</span>
                  </button>
                );
              })}
            </div>
            {BROWSE_GROUPS.some((g) => g.system === catalogueSystem) && (
              <div
                className="anatomy-group-list"
                role="group"
                aria-label={t("anatomy.groups")}
              >
                <p>{t("anatomy.groups")}</p>
                {BROWSE_GROUPS.filter((g) => g.system === catalogueSystem).map(
                  (group) => (
                    <button
                      key={group.id}
                      aria-pressed={browseGroup === group.id}
                      onClick={() =>
                        setBrowseGroup(browseGroup === group.id ? "" : group.id)
                      }
                    >
                      {t(`anatomy.group_${group.id}`)}
                    </button>
                  ),
                )}
              </div>
            )}
            {browsing && (
              <div className="anatomy-filters">
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
                <button
                  onClick={() => {
                    setQuery("");
                    setCatalogueSystem("");
                    setCatalogueSide("");
                    setBrowseGroup("");
                    setFullCatalogue(false);
                  }}
                >
                  <RotateCcw size={15} aria-hidden="true" />
                  {t("anatomy.clear_filters")}
                </button>
              </div>
            )}
            {!browsing && (
              <p className="anatomy-browse-start">
                {t("anatomy.browse_start")}
              </p>
            )}
            <label className="anatomy-full-catalogue">
              <input
                type="checkbox"
                checked={fullCatalogue}
                onChange={(e) => setFullCatalogue(e.target.checked)}
              />
              {t("anatomy.full_catalogue")}
            </label>
            {browsing && (
              <>
                <p className="anatomy-result-count" role="status">
                  {matches.length} · {t("anatomy.results")}
                </p>
                {matches.length === 0 && manifest && (
                  <div className="anatomy-empty">
                    <Search size={24} aria-hidden="true" />
                    <p>{t("anatomy.no_results")}</p>
                  </div>
                )}
                <ul className="anatomy-results">
                  {matches.slice(0, 100).map((c) => (
                    <li key={c.id}>
                      <button
                        aria-pressed={selected === c.id}
                        onClick={() => {
                          setSelected(c.id);
                          setCardEdge("top");
                          setShow3d(true);
                          stage.current?.scrollIntoView({
                            block: "start",
                            behavior: "instant",
                          });
                        }}
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
              </>
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

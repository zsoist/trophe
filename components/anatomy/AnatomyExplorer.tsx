"use client";
import { withAuthored, type AuthoredSupplement } from "@/lib/anatomy/authored";
import { MusclePreview, MuscleColorsIcon } from "./MusclePreview";
import { preferredView, partCameraGroup } from "@/lib/anatomy/camera";
import type { RenderObservation } from "./AtlasCanvas";
import Image from "next/image";
import { workoutAtlasFilter } from "@/lib/anatomy/workout-navigation";
import {
  Check,
  ChevronDown,
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
  workoutOcularElements,
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
  authoredSupplement,
}: {
  manifestUrl: string;
  authoredSupplement?: AuthoredSupplement;
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
  const [legRegion, setLegRegion] = useState<"all" | "upper" | "lower">("all");
  const [focusedPart, setFocusedPart] = useState<string | null>(null);
  const [manualView, setManualView] = useState(false);
  const onManualView = useCallback(() => setManualView(true), []);
  const [showSuperficial, setShowSuperficial] = useState(false);
  const [subgroupColors, setSubgroupColors] = useState(true);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const groupButton = useRef<HTMLButtonElement>(null);
  const [sourceManifest, setManifest] = useState<AtlasManifest | null>(null);
  const manifest = useMemo(
    () =>
      sourceManifest ? withAuthored(sourceManifest, authoredSupplement) : null,
    [sourceManifest, authoredSupplement],
  );
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
  const [viewOpen, setViewOpen] = useState(false);
  const viewButton = useRef<HTMLButtonElement>(null);
  const [zoom, setZoom] = useState(0);
  const [reset, setReset] = useState(0);
  const [cameraRequest, setCameraRequest] = useState(0);

  const [show3d, setShow3d] = useState(workout);
  const [progress, setProgress] = useState([0, 0]);
  const closeGroups = () => {
    setGroupsOpen(false);
    groupButton.current?.focus();
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
  }, [setError, setShow3d]);
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
    () => (manifest ? workoutFocus(manifest, focusGroup, legRegion) : null),
    [manifest, focusGroup, legRegion],
  );
  const part = focused?.subgroups.find((g) => g.id === focusedPart);
  const focusElements = part?.elements ?? focused?.elements;
  const showFullGroup = () => {
    setFocusedPart(null);
    setSelected(null);
    setIsolated(false);
    setManualView(false);
    setView(preferredView(focusGroup));
    setCameraRequest((n) => n + 1);
  };
  const ocularElements = useMemo(
    () => (manifest ? workoutOcularElements(manifest) : []),
    [manifest],
  );
  const effectiveHidden = useMemo(
    () =>
      workoutMode
        ? [
            ...hidden,
            ...ocularElements,
            ...(!showSuperficial ? (focused?.superficialElements ?? []) : []),
          ]
        : hidden,
    [hidden, ocularElements, focused, workoutMode, showSuperficial],
  );
  const context = useMemo(
    () => (manifest && workoutMode ? workoutContext(manifest, []) : null),
    [manifest, workoutMode],
  );
  const colors = useMemo(() => {
    const values: Record<string, string> = {};
    if (subgroupColors)
      for (const subgroup of part ? [part] : (focused?.subgroups ?? []))
        for (const id of subgroup.elements)
          values[id] =
            values[id] && values[id] !== subgroup.color
              ? "#b9bdba"
              : subgroup.color;
    return values;
  }, [focused, subgroupColors, part]);
  const selectionVisibility =
    manifest && selected
      ? visibleSelection(
          context?.manifest ?? manifest,
          selected,
          new Set(systems),
          new Set(effectiveHidden),
        )
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
      if (manifest) {
        const next = conceptForElement(manifest, id);
        setSelected((current) => (current === next ? null : next));
      }
    },
    [manifest, setCardEdge, setSelected],
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
  const selectedMuscles =
    focused?.subgroups.filter((g) =>
      selectedElements.some((id) => g.elements.includes(id)),
    ) ?? [];
  const selectionName =
    selectedMuscles.length === 1
      ? t(selectedMuscles[0].labelKey)
      : concept?.source_names[0];
  const parents =
    manifest && selected
      ? manifest.relations.filter((r) => r.child === selected)
      : [];
  return (
    <main
      className={`anatomy-explorer ${workoutMode ? "anatomy-workout-mode" : ""}`}
    >
      <header className={workoutMode ? "anatomy-brand-header" : undefined}>
        {workoutMode && (
          <Image
            className="anatomy-brand-mark"
            unoptimized
            src="/anatomy/muscle-atlas-mark.webp"
            width={96}
            height={96}
            alt=""
          />
        )}
        <div className="anatomy-brand-copy">
          <h1>{t(workoutMode ? "anatomy.workout_title" : "anatomy.title")}</h1>
          <p className="anatomy-intro">
            {t(workoutMode ? "anatomy.workout_intro" : "anatomy.scope")}
          </p>
        </div>
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
            <Layers size={25} aria-hidden="true" />
            <span>
              <strong>
                {t(
                  workoutMode
                    ? "anatomy.explore_deep"
                    : "anatomy.back_to_workout",
                )}
              </strong>
              <small>
                {t(
                  workoutMode
                    ? "anatomy.explore_deep_hint"
                    : "anatomy.workout_entry",
                )}
              </small>
            </span>
            <ArrowUpRight size={20} aria-hidden="true" />
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
      {workout && (
        <nav
          className="anatomy-selection-bar"
          aria-label={t("anatomy.training_groups")}
          onKeyDown={(e) => {
            if (e.key === "Escape") closeGroups();
          }}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null))
              setGroupsOpen(false);
          }}
        >
          <button
            ref={groupButton}
            aria-label={t("anatomy.choose_groups")}
            className="anatomy-group-selector"
            aria-expanded={groupsOpen}
            aria-controls="anatomy-group-options"
            onClick={() => setGroupsOpen((v) => !v)}
          >
            <span>
              <small>{t("anatomy.choose_groups")}</small>
              <strong>
                {t(
                  !workoutMode
                    ? "anatomy.full_atlas"
                    : focusGroup
                      ? `anatomy.focus_${focusGroup}`
                      : "anatomy.whole_body",
                )}
              </strong>
            </span>
            <ChevronDown size={18} aria-hidden="true" />
          </button>
          <a
            className="anatomy-exercise-button"
            href={`${onRender ? "https://trophe.app" : ""}/dashboard/workout/exercises${workoutMode && workoutAtlasFilter(focusGroup) ? `?atlas=${encodeURIComponent(focusGroup)}` : ""}`}
          >
            <Dumbbell size={18} aria-hidden="true" />
            {t("anatomy.exercises")}
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
          {groupsOpen && (
            <div
              id="anatomy-group-options"
              className="anatomy-training-groups"
              onKeyDown={(e) => {
                if (e.key === "Escape") closeGroups();
              }}
            >
              <button
                aria-pressed={workoutMode && !focusGroup}
                onClick={() => {
                  setWorkoutMode(true);
                  setSystems(WORKOUT_SYSTEMS);
                  setFocusGroup("");
                  setFocusedPart(null);
                  setManualView(false);
                  setSelected(null);
                  setIsolated(false);
                  setView("front");
                  setManualView(false);
                  setReset((v) => v + 1);
                  setShow3d(true);
                  closeGroups();
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
                      aria-pressed={workoutMode && focusGroup === group}
                      onClick={() => {
                        setWorkoutMode(true);
                        setSystems(WORKOUT_SYSTEMS);
                        setFocusGroup(group);
                        setFocusedPart(null);
                        setManualView(false);
                        setCameraRequest((v) => v + 1);
                        setSelected(null);
                        setIsolated(false);
                        setShow3d(true);
                        setView(
                          ["back", "glutes", "triceps"].includes(group)
                            ? "back"
                            : "front",
                        );
                        closeGroups();
                      }}
                    >
                      <GroupIcon size={24} aria-hidden="true" />
                      <span>{t(`anatomy.focus_${group}`)}</span>
                    </button>
                  );
                },
              )}
            </div>
          )}
        </nav>
      )}
      {workoutMode && (
        <section
          className="anatomy-training-controls"
          aria-label={t("anatomy.training_groups")}
        >
          <h2 className="anatomy-current-group">
            {t(
              focusGroup ? `anatomy.focus_${focusGroup}` : "anatomy.whole_body",
            )}
          </h2>
          <p className="anatomy-selection-help">
            {t(
              focusGroup
                ? "anatomy.inspect_group"
                : "anatomy.choose_group_hint",
            )}
          </p>
          {focusGroup === "legs" && (
            <div
              className="anatomy-region-tabs"
              role="group"
              aria-label={t("anatomy.leg_regions")}
            >
              {(["all", "upper", "lower"] as const).map((region) => (
                <button
                  key={region}
                  aria-pressed={legRegion === region}
                  onClick={() => {
                    setLegRegion(region);
                    setFocusedPart(null);
                    setSelected(null);
                    setManualView(false);
                    setCameraRequest((n) => n + 1);
                  }}
                >
                  {t(`anatomy.legs_${region}`)}
                </button>
              ))}
            </div>
          )}
          {focusGroup === "neck" && (
            <div className="anatomy-neck-layer">
              <button
                aria-pressed={showSuperficial}
                onClick={() => setShowSuperficial((v) => !v)}
              >
                {showSuperficial ? (
                  <EyeOff size={16} aria-hidden="true" />
                ) : (
                  <Eye size={16} aria-hidden="true" />
                )}
                {t(
                  showSuperficial
                    ? "anatomy.hide_neck_surface"
                    : "anatomy.show_neck_surface",
                )}
              </button>
              {!showSuperficial && (
                <p className="anatomy-selection-help">
                  {t("anatomy.neck_surface_hidden")}
                </p>
              )}
            </div>
          )}
          {focusGroup === "core" && (
            <p className="anatomy-selection-help">
              {t(
                manifest?.authored?.muscleElements["rectus-abdominis"]
                  ? "anatomy.core_intro"
                  : "anatomy.abdomen_coverage",
              )}
            </p>
          )}
          {focusGroup && (
            <>
              <div className="anatomy-focus-summary">
                <h3>{t("anatomy.explore_muscles")}</h3>
                <span className="anatomy-muscle-count">
                  {focused?.subgroups.length}
                </span>
              </div>
              <p className="anatomy-selection-help">
                {t("anatomy.part_selection_hint")}
              </p>
              <ul className="anatomy-muscle-options">
                {focused?.subgroups.map((group) => (
                  <li key={group.id}>
                    <button
                      disabled={!group.elements.length}
                      aria-pressed={focusedPart === group.id}
                      onClick={() => {
                        if (focusedPart === group.id) showFullGroup();
                        else {
                          setFocusedPart(group.id);
                          setSelected(null);
                          setIsolated(false);
                          setManualView(false);
                          setCameraRequest((n) => n + 1);
                          setView(preferredView(group.id));
                        }
                        if (window.matchMedia?.("(max-width: 899px)").matches)
                          requestAnimationFrame(() =>
                            stage.current?.scrollIntoView({
                              block: "start",
                              behavior: window.matchMedia(
                                "(prefers-reduced-motion: reduce)",
                              ).matches
                                ? "instant"
                                : "smooth",
                            }),
                          );
                      }}
                    >
                      <MusclePreview
                        id={group.id}
                        color={
                          group.elements.length
                            ? subgroupColors
                              ? group.color
                              : "var(--accent)"
                            : "var(--atlas-preview-line)"
                        }
                      />
                      <span>
                        <strong>{t(group.labelKey)}</strong>
                        {!group.elements.length && (
                          <small>{t("anatomy.highlight_unavailable")}</small>
                        )}
                      </span>
                      {focusedPart === group.id ? (
                        <Check size={16} aria-hidden="true" />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
              {part && (
                <button className="anatomy-show-group" onClick={showFullGroup}>
                  <RotateCcw size={17} aria-hidden="true" />
                  {t("anatomy.show_group")}
                </button>
              )}
              {!focused?.elements.length && (
                <p role="status" className="anatomy-panel-hint">
                  {t("anatomy.group_unavailable")}
                </p>
              )}
              <details className="anatomy-group-details">
                <summary>{t("anatomy.about_highlights")}</summary>
                <p>{t("anatomy.focus_role_limit")}</p>
                <p>{t("anatomy.preview_source")}</p>
                {manifest?.authored && (
                  <p>{t("anatomy.authored_explanation")}</p>
                )}
                {focused?.partial && <p>{t("anatomy.focus_partial")}</p>}
                {subgroupColors &&
                  Object.values(colors).includes("#b9bdba") && (
                    <p>{t("anatomy.shared_geometry")}</p>
                  )}
              </details>
            </>
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
            <div
              className="anatomy-view-picker"
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                  setViewOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setViewOpen(false);
                  viewButton.current?.focus();
                }
              }}
            >
              <button
                ref={viewButton}
                aria-label={t("anatomy.orientation")}
                aria-expanded={viewOpen}
                aria-controls="anatomy-view-options"
                onClick={() => setViewOpen((v) => !v)}
              >
                <Eye size={17} aria-hidden="true" />
                {t(manualView ? "anatomy.free_view" : `anatomy.${view}`)}
                <ChevronDown size={16} aria-hidden="true" />
              </button>
              {viewOpen && (
                <div
                  id="anatomy-view-options"
                  className="anatomy-view-options"
                  role="group"
                  aria-label={t("anatomy.orientation")}
                >
                  {(["front", "back", "side"] as const).map((v) => (
                    <button
                      key={v}
                      aria-pressed={view === v}
                      onClick={() => {
                        setManualView(false);
                        setView(v);
                        setCameraRequest((n) => n + 1);
                        setViewOpen(false);
                        viewButton.current?.focus();
                      }}
                    >
                      <span>{t(`anatomy.${v}`)}</span>
                      {view === v && <Check size={16} aria-hidden="true" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              className="anatomy-icon-button"
              aria-label={t("anatomy.reset")}
              title={t("anatomy.reset")}
              onClick={() => {
                setView("front");
                setManualView(false);
                setReset((v) => v + 1);
                setHidden([]);
                setIsolated(false);
              }}
            >
              <RotateCcw aria-hidden="true" size={18} />
            </button>
            {workoutMode && focusGroup && (
              <button
                className="anatomy-icon-button anatomy-color-toggle"
                aria-label={t("anatomy.subgroup_colors")}
                title={t("anatomy.subgroup_colors")}
                aria-pressed={subgroupColors}
                disabled={!focused?.elements.length}
                onClick={() => setSubgroupColors((v) => !v)}
              >
                <MuscleColorsIcon active={subgroupColors} />
              </button>
            )}
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
                workoutMode && focusGroup ? focusElements : undefined
              }
              elementColors={workoutMode ? colors : undefined}
              onRender={onRender}
              systems={systems}
              selectedElements={selectedElements}
              hiddenElements={effectiveHidden}
              isolated={isolated}
              view={view}
              reset={reset}
              zoom={zoom}
              interactive
              onManualView={onManualView}
              cameraGroup={
                workoutMode ? partCameraGroup(focusGroup, part?.id) : undefined
              }
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
          {workoutMode && part && (
            <div className="anatomy-focus-caption">
              <strong>
                {t(part.labelKey)}
                {manifest?.authored?.muscleElements[part.id] && (
                  <small className="anatomy-authored-label">
                    {t("anatomy.authored_model")}
                  </small>
                )}
              </strong>
              <button
                aria-pressed={isolated}
                aria-label={t("anatomy.isolate")}
                title={t("anatomy.isolate")}
                onClick={() => setIsolated((v) => !v)}
              >
                <Focus size={17} aria-hidden="true" />
              </button>
              <button className="anatomy-show-group" onClick={showFullGroup}>
                <RotateCcw size={16} aria-hidden="true" />
                {t("anatomy.show_group")}
              </button>
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
          {concept && show3d && !error && (
            <section
              className="anatomy-pick-card"
              data-edge={cardEdge}
              aria-label={t("anatomy.structure_card")}
            >
              <div className="anatomy-pick-title">
                <div>
                  <h2>{selectionName}</h2>
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
                {concept.source_names[0] !== selectionName
                  ? concept.source_names[0]
                  : t(`anatomy.${concept.laterality}`)}
              </p>
              <details className="anatomy-source-detail">
                <summary>{t("anatomy.source_details")}</summary>
                <p>
                  {concept.id.startsWith("AUTHORED_")
                    ? t("anatomy.authored_model")
                    : t("anatomy.source_english")}{" "}
                  · {concept.id}
                </p>
                <p>{t(`anatomy.${concept.availability}`)}</p>
                {parents
                  .filter((p) => p.type === "partof")
                  .slice(0, 2)
                  .map((p) => (
                    <p key={p.parent}>
                      {t("anatomy.part_of")}{" "}
                      {manifest!.concepts[p.parent]?.source_names[0] ??
                        p.parent}
                    </p>
                  ))}
              </details>
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
                  {concept.id.startsWith("AUTHORED_")
                    ? t("anatomy.authored_model")
                    : t("anatomy.source_english")}{" "}
                  · {concept.id}
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
            {workoutMode && context && (
              <p className="anatomy-context-note">
                {t("anatomy.workout_layers")} ·{" "}
                {t("anatomy.vascular_context", {
                  n: context.vascularChunks,
                  total: context.totalVascularChunks,
                })}
              </p>
            )}
            <p>{t("anatomy.not_clinical")}</p>
            {manifest.authored && (
              <p>
                {t("anatomy.authored_explanation")} · {manifest.authored.author}{" "}
                · {manifest.authored.license}
              </p>
            )}
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

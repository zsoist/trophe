// @vitest-environment jsdom

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Exercise } from "@/lib/types";

const pickerLocale = vi.hoisted(() => ({ value: "en" }));

vi.mock("framer-motion", async () => {
  const ReactModule = await import("react");
  const ignored = new Set([
    "animate",
    "exit",
    "initial",
    "layout",
    "transition",
    "whileTap",
  ]);
  const element = (tag: string) =>
    ReactModule.forwardRef<HTMLElement, Record<string, unknown>>(
      ({ children, ...props }, ref) =>
        ReactModule.createElement(
          tag,
          {
            ...Object.fromEntries(
              Object.entries(props).filter(([key]) => !ignored.has(key)),
            ),
            ref,
          },
          children as React.ReactNode,
        ),
    );
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: { button: element("button"), div: element("div"), p: element("p") },
    useReducedMotion: () => true,
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getUser: vi.fn() }, from: vi.fn() },
}));

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    lang: pickerLocale.value,
    t: (key: string, params?: Record<string, string | number>) => {
      const copy: Record<string, string> = {
        "workout.add_exercise": "Add exercise",
        "workout.picker_title": "Add exercise",
        "workout.picker_close": "Close exercise picker",
        "workout.search_exercises": "Search all exercises",
        "workout.picker_choose_area": "What are you training?",
        "workout.picker_choose_area_hint":
          "Choose a muscle group to see relevant exercises.",
        "workout.picker_options": "{n} options",
        "workout.picker_back_areas": "Back to muscle groups",
        "workout.picker_result_title": "{area} exercises",
        "workout.picker_result_count": "{n} exercises",
        "workout.picker_recent": "Recent",
        "workout.picker_equipment": "Equipment",
        "workout.picker_all_equipment": "All equipment",
        "workout.picker_add": "Add",
        "workout.picker_add_named": "Add {name}",
        "workout.picker_info_named": "Exercise info: {name}",
        "workout.picker_custom": "Create custom exercise",
        "workout.picker_custom_hint": "Can't find it?",
        "workout.picker_selected_one": "{n} exercise selected",
        "workout.picker_selected_many": "{n} exercises selected",
        "workout.picker_review_plan": "Review plan",
        "workout.picker_exact_poster": "Exact technique poster",
        "workout.picker_exact_poster_detail":
          "Exact movement and equipment poster",
        "workout.picker_exact_poster_alt": "{name} technique poster",
        "workout.picker_anatomy_poster_alt": "{name} anatomy reference",
        "workout.media_anatomy_reference": "Anatomy reference",
        "workout.media_anatomy_reference_detail":
          "Curated muscle roles; not a technique demonstration",
        "workout.media_no_exact_demo": "No exact demo yet",
        "workout.media_no_exact_demo_detail":
          "Use the exercise cues and equipment details",
        "workout.info_primary": "Primary",
        "workout.info_secondary": "Secondary",
        "workout.info_stabilizer": "Stabilizer",
        "workout.atlas_label": "Muscle activation atlas",
        "workout.atlas_view_label": "Anatomy view",
        "workout.atlas_front": "Front",
        "workout.atlas_back": "Back",
        "workout.atlas_show_front": "Show front anatomy",
        "workout.atlas_show_back": "Show back anatomy",
        "workout.atlas_front_map": "Front anatomy map",
        "workout.atlas_back_map": "Back anatomy map",
        "workout.atlas_roles_label": "Highlighted muscle roles",
        "workout.atlas_region_label": "{muscle}, {role} muscle",
        "workout.atlas_more_highlighted": "+{n} more highlighted",
        "workout.atlas_muscle_pectoralis_major": "Pectoralis major",
        "workout.atlas_muscle_anterior_deltoid": "Anterior deltoid",
        "workout.atlas_muscle_biceps_brachii": "Biceps brachii",
        "workout.atlas_muscle_rectus_abdominis": "Rectus abdominis",
        "workout.atlas_muscle_quadriceps": "Quadriceps",
        "workout.atlas_muscle_latissimus_dorsi": "Latissimus dorsi",
        "workout.atlas_muscle_triceps_brachii": "Triceps brachii",
        "workout.atlas_muscle_gluteus_maximus": "Gluteus maximus",
        "workout.atlas_muscle_hamstrings": "Hamstrings",
        "workout.atlas_muscle_gastrocnemius": "Gastrocnemius",
        "workout.compound": "Compound",
        "workout.body_area_chest": "Chest",
        "workout.body_area_back": "Back",
        "workout.body_area_shoulders": "Shoulders",
        "workout.body_area_arms": "Arms",
        "workout.body_area_legs": "Legs",
        "workout.body_area_core": "Core",
        "workout.body_area_full_body": "Full body",
        "workout.body_area_cardio": "Cardio",
        "workout.muscle_chest": "Chest",
        "workout.equipment_barbell": "Barbell",
        "workout.equipment_dumbbell": "Dumbbell",
        "workout.equipment_machine": "Machine",
        "workout.equipment_cable": "Cable",
        "workout.equipment_bodyweight": "Bodyweight",
        "workout.atlas_role_group": "muscle group",
        "workout.atlas_role_group_label": "Group",
      };
      const spanish: Record<string, string> = {
        "workout.picker_exact_poster_alt": "Póster técnico de {name}",
        "workout.picker_anatomy_poster_alt": "Referencia anatómica de {name}",
        "workout.media_anatomy_reference": "Referencia anatómica",
        "workout.media_anatomy_reference_detail":
          "Funciones musculares verificadas; no es una demostración técnica",
      };
      return Object.entries(params ?? {}).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
        (pickerLocale.value === "es" ? spanish[key] : undefined) ??
          copy[key] ??
          key,
      );
    },
  }),
}));

import ExercisePicker from "@/components/workout/ExercisePicker";

const EXERCISES: Exercise[] = [
  {
    id: "bench",
    name: "Barbell Bench Press",
    name_es: null,
    name_el: null,
    muscle_group: "chest",
    secondary_muscles: ["triceps"],
    equipment: "barbell",
    is_compound: true,
    is_template: true,
    created_by: null,
    created_at: "2026-09-02T00:00:00.000Z",
  },
  {
    id: "fly",
    name: "Standing Cable Chest Fly",
    name_es: null,
    name_el: null,
    muscle_group: "chest",
    secondary_muscles: null,
    equipment: "band",
    is_compound: false,
    is_template: true,
    created_by: null,
    created_at: "2026-09-02T00:00:00.000Z",
  },
];

function renderPicker() {
  const onAddToDraft = vi.fn();
  const onReturnToBuild = vi.fn();
  const view = render(
    <ExercisePicker
      presentation="page"
      exercises={EXERCISES}
      recentIds={["fly"]}
      addedExerciseIds={[]}
      onAddToDraft={onAddToDraft}
      onReturnToBuild={onReturnToBuild}
      onSelect={vi.fn()}
      onClose={vi.fn()}
      onInfo={vi.fn()}
      lang={pickerLocale.value}
    />,
  );
  return { ...view, onAddToDraft, onReturnToBuild };
}

beforeEach(() => {
  pickerLocale.value = "en";
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("exercise discovery atlas and plan tray", () => {
  it("starts from a selectable atlas without revealing the full exercise catalogue", () => {
    renderPicker();

    expect(
      screen.getByRole("heading", { name: "What are you training?" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "Muscle activation atlas" }),
    ).toBeTruthy();
    // Discovery regions are body-area selectors, so they are named by muscle group
    // and never presented as a specific primary muscle.
    expect(
      screen.getByRole("button", { name: /^chest, muscle group/i }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: /pectoralis major.*primary muscle/i,
      }),
    ).toBeNull();
    expect(screen.queryByText("Barbell Bench Press")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: /^chest, muscle group/i }),
    );
    expect(
      screen.getByRole("heading", { name: "Chest exercises" }),
    ).toBeTruthy();
  });

  it("uses exact resolver media and labels its coaching role without substituting another movement", () => {
    renderPicker();
    fireEvent.click(
      within(
        screen.getByRole("group", { name: "What are you training?" }),
      ).getByRole("button", { name: /^Chest/ }),
    );

    const row = screen.getByTestId("exercise-result-bench");
    const poster = within(row).getByRole("img", {
      name: /barbell bench press technique poster/i,
    });
    expect(poster.getAttribute("src")).toBe(
      "/workout-v3/posters/bench-press.webp",
    );
    expect(row.getAttribute("data-media-tier")).toBe("verified-technique");
    expect(within(row).getByText("Exact technique poster")).toBeTruthy();
    expect(within(row).getByText("Primary")).toBeTruthy();
    expect(within(row).getByText("Barbell")).toBeTruthy();
    expect(poster.getAttribute("loading")).toBe("lazy");
    expect(poster.getAttribute("decoding")).toBe("async");
  });

  it("keeps an explicit Add affordance visible at the 320px floor", () => {
    vi.stubGlobal("innerWidth", 320);
    renderPicker();
    fireEvent.click(
      within(
        screen.getByRole("group", { name: "What are you training?" }),
      ).getByRole("button", { name: /^Chest/ }),
    );

    const add = screen.getByRole("button", { name: "Add Barbell Bench Press" });
    const text = add.querySelector("span");
    expect(
      add.querySelector(".lucide-plus") ||
        (text && !text.className.includes("hidden")),
    ).toBeTruthy();
  });

  it("localizes fallback poster alt text and media badge copy", () => {
    pickerLocale.value = "es";
    renderPicker();
    fireEvent.click(
      within(
        screen.getByRole("group", { name: "What are you training?" }),
      ).getByRole("button", { name: /^Chest/ }),
    );

    const row = screen.getByTestId("exercise-result-fly");
    expect(
      within(row).getByRole("img", {
        name: "Referencia anatómica de Standing Cable Chest Fly",
      }),
    ).toBeTruthy();
    expect(within(row).getByText("Referencia anatómica")).toBeTruthy();
    expect(row.textContent).not.toMatch(
      /Anatomy reference|technique demonstration/,
    );
  });

  it("keeps optimistic multi-add selection in a persistent tray and reviews without starting live", () => {
    const { onAddToDraft, onReturnToBuild } = renderPicker();
    fireEvent.click(
      within(
        screen.getByRole("group", { name: "What are you training?" }),
      ).getByRole("button", { name: /^Chest/ }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add Barbell Bench Press" }),
    );

    expect(onAddToDraft).toHaveBeenCalledWith("bench");
    expect(screen.getByText("1 exercise selected")).toBeTruthy();
    expect(screen.queryByText(/live workout/i)).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Back to muscle groups" }),
    );
    expect(
      screen.getByRole("heading", { name: "What are you training?" }),
    ).toBeTruthy();
    expect(screen.getByText("1 exercise selected")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    expect(onReturnToBuild).toHaveBeenCalledTimes(1);
  });
});

it("opens an atlas-linked body area without adding exercises or starting a workout", () => {
  const onAdd = vi.fn();
  const onSelect = vi.fn();
  render(
    <ExercisePicker
      presentation="page"
      exercises={EXERCISES}
      recentIds={[]}
      lang="en"
      initialAtlasFilter={{ area: "chest", muscle: "all" }}
      onAddToDraft={onAdd}
      onSelect={onSelect}
      onClose={vi.fn()}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Add Standing Cable Chest Fly" }),
  ).toBeTruthy();
  expect(onAdd).not.toHaveBeenCalled();
  expect(onSelect).not.toHaveBeenCalled();
});

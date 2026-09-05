/** Existing exercise-library categories. Never inferred activation roles. */
export function workoutAtlasFilter(group: string | null | undefined) {
  const filters = {
    chest: { area: "chest", muscle: "all" },
    back: { area: "back", muscle: "all" },
    shoulders: { area: "shoulders", muscle: "all" },
    arms: { area: "arms", muscle: "all" },
    biceps: { area: "arms", muscle: "biceps" },
    triceps: { area: "arms", muscle: "triceps" },
    legs: { area: "legs", muscle: "all" },
    glutes: { area: "legs", muscle: "glutes" },
    core: { area: "core", muscle: "all" },
  } as const;
  return group && Object.prototype.hasOwnProperty.call(filters, group)
    ? filters[group as keyof typeof filters]
    : null;
}

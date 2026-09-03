'use client';

import { createContext, useContext, type ReactNode } from 'react';

const WorkoutRouteFocusContext = createContext(false);

export function WorkoutRouteFocusProvider({ children }: { children: ReactNode }) {
  return <WorkoutRouteFocusContext.Provider value>{children}</WorkoutRouteFocusContext.Provider>;
}

/** Standalone workout surfaces retain their own focus entry; routed surfaces defer to the transition owner. */
export function useWorkoutRouteFocusSuppressed(): boolean {
  return useContext(WorkoutRouteFocusContext);
}

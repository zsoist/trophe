import type { ReactNode } from 'react';
import { WorkoutWorkspaceHeader } from '@/components/workout/workspace/WorkoutWorkspaceHeader';
import { WorkoutWorkspaceProvider } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import { WorkoutRouteTransition } from '@/components/workout/workspace/WorkoutRouteTransition';
import { WorkoutCoachEntry } from '@/components/workout/workspace/WorkoutCoachEntry';

export default function WorkoutLayout({ children }: { children: ReactNode }) {
  return (
    <WorkoutWorkspaceProvider>
      <div className="workout-workspace">
        <WorkoutWorkspaceHeader />
        <WorkoutRouteTransition>{children}</WorkoutRouteTransition>
        <WorkoutCoachEntry />
      </div>
    </WorkoutWorkspaceProvider>
  );
}

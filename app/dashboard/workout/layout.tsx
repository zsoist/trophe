import type { ReactNode } from 'react';
import { WorkoutWorkspaceHeader } from '@/components/workout/workspace/WorkoutWorkspaceHeader';
import { WorkoutWorkspaceProvider } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import { WorkoutRouteTransition } from '@/components/workout/workspace/WorkoutRouteTransition';

export default function WorkoutLayout({ children }: { children: ReactNode }) {
  return (
    <WorkoutWorkspaceProvider>
      <div className="workout-workspace">
        <WorkoutWorkspaceHeader />
        <WorkoutRouteTransition>{children}</WorkoutRouteTransition>
      </div>
    </WorkoutWorkspaceProvider>
  );
}

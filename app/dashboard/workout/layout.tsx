import type { ReactNode } from 'react';
import { WorkoutWorkspaceHeader } from '@/components/workout/workspace/WorkoutWorkspaceHeader';
import { WorkoutWorkspaceProvider } from '@/components/workout/workspace/WorkoutWorkspaceProvider';

export default function WorkoutLayout({ children }: { children: ReactNode }) {
  return (
    <WorkoutWorkspaceProvider>
      <WorkoutWorkspaceHeader />
      {children}
    </WorkoutWorkspaceProvider>
  );
}

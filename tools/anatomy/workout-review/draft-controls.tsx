import type { CoachContextSlot } from '../../../components/assistant/GlobalCoach';
import { WorkoutDraftCoachControls } from '../../../components/assistant/WorkoutDraftCoachControls';
import { REVIEW_USER } from './store';

/** Private fixture controls. Receipt alone never means the shared workspace changed. */
export function PrivateDraftControls({ controller, state, conversationId, transport }: Parameters<CoachContextSlot>[0]) {
  return <WorkoutDraftCoachControls identity={REVIEW_USER} controller={controller} state={state} conversationId={conversationId} transport={transport} allowDirectProposal />;
}

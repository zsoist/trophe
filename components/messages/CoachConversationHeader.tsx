import { ChevronLeft, ShieldCheck } from 'lucide-react';

interface CoachConversationHeaderProps {
  coachName: string | null;
  onBack: () => void;
}

export default function CoachConversationHeader({ coachName, onBack }: CoachConversationHeaderProps) {
  const firstName = coachName?.trim().split(/\s+/)[0] || null;
  const title = firstName ? `Coach ${firstName}` : 'Your coach';
  const initial = firstName?.[0]?.toUpperCase() ?? 'C';

  return (
    <header className="coach-conversation-header">
      <button type="button" onClick={onBack} aria-label="Back to dashboard">
        <ChevronLeft size={21} aria-hidden="true" />
      </button>
      <div className="coach-conversation-header__avatar" aria-hidden="true">{initial}</div>
      <div className="coach-conversation-header__copy">
        <h1>{title}</h1>
        <p><ShieldCheck size={12} aria-hidden="true" /> Private coach line</p>
      </div>
    </header>
  );
}

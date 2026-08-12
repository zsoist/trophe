'use client';

/**
 * Trophē — workout Program Builder (Task 4.2/4.3).
 *
 * Replaces the fake Assign-to-Client flow (which wrote a nonexistent
 * client_profiles.current_template_id with an unchecked error + false toast).
 *
 * Pick a client → their ACTIVE program loads via trpc.workouts.program.forClient
 * and prefills name + week grid; edit days via WorkoutWeekPlanner (template per
 * weekday, or Rest); Save calls trpc.workouts.program.assign (archives the
 * previous active program server-side). Toast only on success; error toast on
 * failure.
 *
 * The draft form is a child keyed by client+program so its initial state comes
 * straight from props — no setState-in-effect prefill dance.
 *
 * Weekday convention: 0=Sunday … 6=Saturday (JS getDay()); displayed Mon-first.
 */

import { useState } from 'react';
import { ClipboardList, Save } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc/client';
import { useToast } from '@/components/shared/Toast';
import WorkoutWeekPlanner from '@/components/coach/WorkoutWeekPlanner';

export interface BuilderClient {
  id: string;
  name: string;
  email?: string | null;
}

export interface BuilderTemplate {
  id: string;
  name: string;
  exerciseCount: number;
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** Display name → JS getDay() number. */
const DAY_TO_WEEKDAY: Record<string, number> = {
  Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 0,
};

export default function ProgramBuilder({
  clients,
  templates,
  initialClientId = null,
  onAssigned,
}: {
  clients: BuilderClient[];
  templates: BuilderTemplate[];
  initialClientId?: string | null;
  onAssigned?: () => void;
}) {
  const { t } = useI18n();
  const [clientId, setClientId] = useState<string>(initialClientId ?? '');

  const programQuery = trpc.workouts.program.forClient.useQuery(
    { clientId },
    { enabled: Boolean(clientId) },
  );

  const activeProgram = clientId && !programQuery.isLoading ? programQuery.data ?? null : null;
  const clientName = clients.find((c) => c.id === clientId)?.name;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <ClipboardList size={15} className="text-[var(--action-primary)]" />
        <h3 className="text-sm font-semibold text-[var(--content-primary)]">{t('coach.builder.title')}</h3>
        {activeProgram && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--action-primary)]/10 text-[var(--action-primary)] font-medium">
            {t('coach.builder.editingActive')}
          </span>
        )}
      </div>

      <div className="mb-3">
        <label className="text-xs text-[var(--content-muted)] mb-1 block">{t('coach.builder.client')} *</label>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="input-dark w-full text-base"
        >
          <option value="">{t('coach.builder.selectClient')}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {!clientId ? (
        <p className="text-xs text-[var(--content-muted)] text-center py-3">
          {t('coach.builder.pickClientHint')}
        </p>
      ) : programQuery.isLoading ? (
        <div className="h-32 rounded-xl bg-[var(--surface-hover)] animate-pulse" />
      ) : (
        <ProgramDraftForm
          key={`${clientId}:${activeProgram?.program.id ?? 'new'}`}
          clientId={clientId}
          clientName={clientName}
          templates={templates}
          activeProgram={activeProgram}
          onAssigned={onAssigned}
        />
      )}
    </div>
  );
}

// ── Draft form (state initialized from props; remounts per client/program) ──

type ActiveProgram = {
  program: { id: string; name: string };
  days: Array<{ weekday: number; template: { id: string } }>;
} | null;

function ProgramDraftForm({
  clientId,
  clientName,
  templates,
  activeProgram,
  onAssigned,
}: {
  clientId: string;
  clientName?: string;
  templates: BuilderTemplate[];
  activeProgram: ActiveProgram;
  onAssigned?: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const utils = trpc.useUtils();

  const [programName, setProgramName] = useState<string>(() => {
    if (activeProgram) return activeProgram.program.name;
    const firstName = clientName?.split(' ')[0];
    return firstName ? t('coach.builder.possessiveProgram', { name: firstName }) : t('coach.builder.defaultProgramName');
  });

  /** weekday (0=Sun…6=Sat) → templateId or null (rest). */
  const [week, setWeek] = useState<Record<number, string | null>>(() => {
    const initial: Record<number, string | null> = {};
    for (const d of activeProgram?.days ?? []) {
      // One template per weekday in the builder; first (lowest sort) wins.
      if (initial[d.weekday] == null) initial[d.weekday] = d.template.id;
    }
    return initial;
  });

  const assignMutation = trpc.workouts.program.assign.useMutation({
    onSuccess: () => {
      toast.success(t('coach.builder.assignedToast'));
      utils.workouts.program.forClient.invalidate({ clientId });
      onAssigned?.();
    },
    onError: (err) => {
      toast.error(err.message || t('coach.builder.assignFailedToast'));
    },
  });

  const templateById = new Map(templates.map((t) => [t.id, t]));
  const plannerDays = DAY_NAMES.map((day) => {
    const templateId = week[DAY_TO_WEEKDAY[day]] ?? null;
    const tpl = templateId ? templateById.get(templateId) : null;
    return {
      day,
      template: tpl ? { name: tpl.name, exerciseCount: tpl.exerciseCount } : null,
    };
  });

  const trainingDays = Object.values(week).filter(Boolean).length;
  const canSave = programName.trim().length > 0 && trainingDays > 0 && !assignMutation.isPending;

  function save() {
    if (!canSave) return;
    assignMutation.mutate({
      clientId,
      name: programName.trim(),
      days: Object.entries(week)
        .filter(([, templateId]) => templateId != null)
        .map(([weekday, templateId]) => ({
          weekday: Number(weekday),
          templateId: templateId as string,
        })),
    });
  }

  return (
    <div>
      <div className="mb-3">
        <label className="text-xs text-[var(--content-muted)] mb-1 block">{t('coach.builder.programName')} *</label>
        <input
          value={programName}
          onChange={(e) => setProgramName(e.target.value)}
          placeholder={t('coach.builder.programNamePlaceholder')}
          className="input-dark w-full text-base"
        />
      </div>

      <div className="mb-3">
        <WorkoutWeekPlanner
          days={plannerDays}
          templates={templates}
          onAssign={(day, templateId) =>
            setWeek((prev) => ({ ...prev, [DAY_TO_WEEKDAY[day]]: templateId }))
          }
        />
      </div>

      <button
        type="button"
        onClick={save}
        disabled={!canSave}
        className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-40"
      >
        <Save size={15} />
        {assignMutation.isPending
          ? t('coach.builder.assigning')
          : activeProgram
          ? t('coach.builder.saveReplace')
          : t('coach.builder.assignProgram')}
      </button>
      {trainingDays === 0 && (
        <p className="text-xs text-[var(--content-muted)] text-center mt-2">
          {t('coach.builder.addTrainingDay')}
        </p>
      )}
    </div>
  );
}

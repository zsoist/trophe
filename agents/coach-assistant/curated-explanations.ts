import type { CoachEvidence } from './contracts';

/** General record-interpretation rules, maintained with the deterministic tools.
 * These are not physiological, diagnostic or individualized training claims.
 */
export const GENERAL_EXPLANATION_VERSION='coach-general.v1';
export const GENERAL_EXPLANATIONS={
  records_are_partial_view:{en:'A log describes what was recorded. It does not establish everything that happened outside the log.',es:'Un registro describe lo que se anotó. No establece todo lo que ocurrió fuera del registro.'},
  planned_is_not_completed:{en:'A planned activity describes an intention. Completion must be checked in the completed-session records.',es:'Una actividad planificada describe una intención. Su realización debe comprobarse en los registros de sesiones completadas.'},
  nutrition_log_is_not_intake:{en:'Missing food entries do not establish that a meal was skipped or that total intake was inadequate.',es:'La ausencia de registros de comida no demuestra que se haya omitido una comida ni que la ingesta total fuera insuficiente.'},
} as const;
export type GeneralExplanationId=keyof typeof GENERAL_EXPLANATIONS;
export function availableGeneralExplanations(facts:CoachEvidence[]):GeneralExplanationId[] {
  return ['records_are_partial_view',...(facts.some(f=>f.source==='plan')?['planned_is_not_completed' as const]:[]),...(facts.some(f=>f.source==='nutrition')?['nutrition_log_is_not_intake' as const]:[])];
}

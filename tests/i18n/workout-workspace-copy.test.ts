import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const keys = [
  'workout.templates', 'workout.preview', 'workout.draft_not_started', 'workout.review_workout',
  'workout.start_live', 'workout.log_completed', 'workout.save_plan', 'workout.pause', 'workout.resume',
  'workout.report_pain', 'workout.finish_confirmation',
  'workout.start_live_failed', 'workout.workspace_home_title', 'workout.workspace_build_title',
  'workout.workspace_review_title', 'workout.workspace_live_title', 'workout.workspace_exercises_title',
  'workout.workspace_back', 'workout.workspace_status_draft', 'workout.workspace_status_live',
  'workout.workspace_status_paused', 'workout.workspace_status_label',
  'workout.repeat_replace_title', 'workout.repeat_replace_message',
  'workout.repeat_replace_confirm', 'workout.repeat_replace_cancel',
] as const;

describe('workout workspace copy coverage', () => {
  it('defines every workspace state in every supported locale', () => {
    const core = readFileSync(join(process.cwd(), 'lib/i18n.tsx'), 'utf8');
    for (const key of keys) {
      expect(core).toContain(`'${key}':`);
      for (const locale of ['de', 'fr', 'it', 'nl', 'pt']) {
        const overlay = readFileSync(join(process.cwd(), `lib/locales/${locale}.ts`), 'utf8');
        expect(overlay).toContain(`'${key}':`);
      }
    }
  });
});

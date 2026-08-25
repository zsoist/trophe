import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { translations } from '@/lib/i18n';
import { de } from '@/lib/locales/de';
import { fr } from '@/lib/locales/fr';
import { it as italian } from '@/lib/locales/it';
import { nl } from '@/lib/locales/nl';
import { pt } from '@/lib/locales/pt';

const keys = [
  'formCheck.title', 'formCheck.intro', 'formCheck.exercise', 'formCheck.exercise.bulgarian_split_squat',
  'formCheck.side', 'formCheck.right', 'formCheck.left', 'formCheck.tips', 'formCheck.tip_profile',
  'formCheck.tip_full_body', 'formCheck.tip_light', 'formCheck.tip_reps', 'formCheck.start',
  'formCheck.finish', 'formCheck.back', 'formCheck.recording', 'formCheck.first_load',
  'formCheck.reps', 'formCheck.knee', 'formCheck.torso', 'formCheck.neck', 'formCheck.status',
  'formCheck.start_recording', 'formCheck.try_again', 'formCheck.save', 'formCheck.saving',
  'formCheck.saved', 'formCheck.save_error', 'formCheck.rep_detail', 'formCheck.descent',
  'formCheck.ascent', 'formCheck.reps_analyzed', 'formCheck.assessment.excellent',
  'formCheck.assessment.improve', 'formCheck.assessment.adjust', 'formCheck.assessment.deep_adjust',
  'formCheck.assessment.injury_risk', 'formCheck.assessment.no_reps', 'formCheck.loading_model',
  'formCheck.requesting_camera', 'formCheck.camera_denied', 'formCheck.camera_unavailable',
  'formCheck.model_error', 'formCheck.init_error', 'formCheck.privacy',
] as const;

describe('Form Check localization inventory', () => {
  it('has meaningful copy in all eight supported locales', () => {
    const locales: Array<Record<string, string>> = [
      Object.fromEntries(keys.map((key) => [key, translations[key]?.en])),
      Object.fromEntries(keys.map((key) => [key, translations[key]?.es])),
      Object.fromEntries(keys.map((key) => [key, translations[key]?.el])),
      de, fr, italian, nl, pt,
    ];
    for (const locale of locales) for (const key of keys) expect(locale[key]).toMatch(/\S/);
  });

  it('does not hardcode Spanish copy or select nameEs in Form Check UI', () => {
    const files = ['app/dashboard/workout/form-check/page.tsx', 'components/workout/FormCheck.tsx', 'components/workout/FormScore.tsx'];
    const source = files.map((file) => readFileSync(join(process.cwd(), file), 'utf8')).join('\n');
    expect(source).not.toContain('.nameEs');
    for (const spanish of ['Ejercicio', 'Derecho', 'Izquierdo', 'Iniciar Form Check', 'Intentar de nuevo', 'Guardando…', 'Rodilla', 'Detalle por rep']) {
      expect(source).not.toContain(spanish);
    }
  });
});

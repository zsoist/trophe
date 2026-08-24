import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const pickerSource = readFileSync(
  join(process.cwd(), 'components/workout/ExercisePicker.tsx'),
  'utf8',
);
const builderSource = readFileSync(
  join(process.cwd(), 'components/workout/workspace/WorkoutBuilder.tsx'),
  'utf8',
);

describe('mobile exercise picker layering', () => {
  it('renders the picker as an accessible body-level modal', () => {
    expect(pickerSource).toContain("import { createPortal } from 'react-dom'");
    expect(pickerSource).toContain('return createPortal(');
    expect(pickerSource).toContain('document.body');
    expect(pickerSource).toContain('role="dialog"');
    expect(pickerSource).toContain('aria-modal="true"');
    expect(pickerSource).toContain('z-[var(--z-modal,60)]');
    expect(pickerSource).toContain("background: 'var(--canvas)'");
    expect(pickerSource).not.toContain("background: '#0a0a0a'");
  });

  it('locks and restores document scrolling while the picker is open', () => {
    expect(pickerSource).toContain("document.body.style.overflow = 'hidden'");
    expect(pickerSource).toContain(
      'document.body.style.overflow = previousOverflow',
    );
  });

  it('keeps draft exercise selection inline so it cannot collide with a modal information sheet', () => {
    expect(builderSource).toContain("aria-label={t('workout.add_exercise')}");
    expect(builderSource).not.toContain('<ExercisePicker');
    expect(builderSource).not.toContain('role="dialog"');
  });
});

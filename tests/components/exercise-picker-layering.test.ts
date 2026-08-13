import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const pickerSource = readFileSync(
  join(process.cwd(), 'components/workout/ExercisePicker.tsx'),
  'utf8',
);
const workoutSource = readFileSync(
  join(process.cwd(), 'app/dashboard/workout/page.tsx'),
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

  it('closes the picker before opening exercise information', () => {
    expect(workoutSource).toContain(
      'onInfo={(ex) => { setShowPicker(false); setInfoExercise(ex); }}',
    );
  });
});

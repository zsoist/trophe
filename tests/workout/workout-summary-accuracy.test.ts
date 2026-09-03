import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('workout completion summaries', () => {
  it('excludes warm-up sets from guided work volume and set totals', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/workout/GuidedSession.tsx'),
      'utf8',
    );
    const start = source.indexOf('const handleFinish = async');
    const end = source.indexOf('const handleBack =');
    const finish = source.slice(start, end);

    expect(finish).toContain('.filter((s) => s.completed && !s.is_warmup)');
  });

  it('does not fabricate completion totals while a workout is still a draft', () => {
    const review = readFileSync(
      join(process.cwd(), 'components/workout/workspace/WorkoutReview.tsx'),
      'utf8',
    );

    expect(review).toContain("t('workout.review_ready')");
    expect(review).toContain("t('workout.log_completed')");
    expect(review).not.toContain('finishSummary');
    expect(review).not.toContain('kgToDisplay');
  });
});

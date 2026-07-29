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

  it('converts freestyle summary volume to the preferred display unit', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/dashboard/workout/page.tsx'),
      'utf8',
    );
    const start = source.indexOf('{/* ── Session-complete celebration');
    const finish = source.slice(start);

    expect(finish).toContain(
      'value={kgToDisplay(finishSummary.volume, unit)}',
    );
    expect(finish).toContain('>{unit}</span>');
    expect(finish).not.toContain('>kg</span>');
  });
});

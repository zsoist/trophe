import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(process.cwd(), 'app/coach/client/[id]/plan/page.tsx'),
  'utf8',
);

describe('coach habit action persistence', () => {
  it('reports assignment failures and only adds a returned row', () => {
    const block = source.slice(
      source.indexOf('const addHabit = async'),
      source.indexOf('const removeHabit = async'),
    );

    expect(block).toContain('const { data, error }');
    expect(block).toContain('if (error || !data)');
    expect(block).toContain(
      "setHabitActionError('Habit was not added — try again');",
    );
    expect(block.indexOf('if (error || !data)')).toBeLessThan(
      block.indexOf('setActiveHabits((prev) => [...prev, typed])'),
    );
  });

  it('keeps a habit visible unless the pause update returns its row', () => {
    const block = source.slice(
      source.indexOf('const removeHabit = async'),
      source.indexOf('// ── Step helpers'),
    );

    expect(block).toContain(".select('id')");
    expect(block).toContain('.maybeSingle()');
    expect(block).toContain('if (error || !data)');
    expect(block).toContain(
      "setHabitActionError('Habit was not removed — try again');",
    );
    expect(block.indexOf('if (error || !data)')).toBeLessThan(
      block.indexOf('setActiveHabits((prev) => prev.filter'),
    );
  });

  it('disables habit controls during a write and renders failure feedback', () => {
    expect(source).toContain(
      'const [habitActionPending, setHabitActionPending]',
    );
    expect(source).toContain(
      'const [habitActionError, setHabitActionError]',
    );
    expect(source).toContain('disabled={habitActionPending !== null}');
    expect(source).toContain('{habitActionError && (');
    expect(source).toContain('{habitActionError}');
  });
});

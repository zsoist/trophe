import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { localDateStr, localWeekStart } from '@/lib/utils/dates';

const originalTimezone = process.env.TZ;

describe('local calendar utilities', () => {
  beforeAll(() => {
    process.env.TZ = 'Europe/Athens';
  });

  afterAll(() => {
    process.env.TZ = originalTimezone;
  });

  it('keeps a just-after-midnight Monday in the local week', () => {
    const localMonday = new Date('2026-07-26T21:30:00.000Z');

    expect(localDateStr(localMonday)).toBe('2026-07-27');
    expect(localWeekStart(localMonday)).toBe('2026-07-27');
  });

  it('maps a local Sunday back to the preceding Monday', () => {
    const localSunday = new Date('2026-08-02T09:00:00.000Z');

    expect(localWeekStart(localSunday)).toBe('2026-07-27');
  });
});

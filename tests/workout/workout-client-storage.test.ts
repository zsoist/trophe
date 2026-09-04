import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clearWorkoutClientStorage, WORKOUT_CLIENT_STORAGE_PREFIXES } from '@/lib/workout/workspace-storage';

function fakeStorage(initial: Record<string, string>) {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    key(index: number) { return Array.from(map.keys())[index] ?? null; },
    removeItem(key: string) { map.delete(key); },
    snapshot() { return Array.from(map.keys()).sort(); },
  };
}

describe('clearWorkoutClientStorage', () => {
  it('covers both namespaces the workout module writes', () => {
    expect(WORKOUT_CLIENT_STORAGE_PREFIXES).toEqual(['trophe:workout-workspace:', 'trophe:live-workout:']);
  });

  it('removes workspace drafts and pending-set queues but leaves unrelated keys', () => {
    const storage = fakeStorage({
      'trophe:workout-workspace:user-1': '{"stage":"draft"}',
      'trophe:live-workout:session-9:pending-sets:v1': '[]',
      'trophe:theme': 'dark',
      'sb-project-auth-token': 'not-ours',
    });

    expect(clearWorkoutClientStorage(storage)).toBe(2);
    expect(storage.snapshot()).toEqual(['sb-project-auth-token', 'trophe:theme']);
  });

  it('is a no-op without storage and never throws on a broken storage', () => {
    expect(clearWorkoutClientStorage(null)).toBe(0);
    const broken = {
      get length(): number { throw new Error('denied'); },
      key() { return null; },
      removeItem() { /* unreachable */ },
    };
    expect(clearWorkoutClientStorage(broken)).toBe(0);
  });

  it('is wired into every client sign-out path', () => {
    for (const file of ['app/dashboard/profile/page.tsx', 'app/coach/page.tsx']) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      expect(source, file).toContain('clearWorkoutClientStorage()');
      const signOut = source.indexOf('supabase.auth.signOut()');
      const clear = source.indexOf('clearWorkoutClientStorage()');
      expect(signOut, `${file} must sign out`).toBeGreaterThan(-1);
      expect(clear, `${file} must clear workout storage`).toBeGreaterThan(-1);
    }
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>();
  failWrites = false;
  get length() { return this.store.size; }
  clear() { this.store.clear(); }
  getItem(key: string) { return this.store.get(key) ?? null; }
  key(index: number) { return [...this.store.keys()][index] ?? null; }
  removeItem(key: string) { this.store.delete(key); }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.store.set(key, value);
  }
}

const STORAGE_KEY = 'trophe_rest_targets';
const globalObject = globalThis as typeof globalThis & { window?: unknown };
let originalWindow: unknown;
let storage: MemoryStorage;

async function loadModule() {
  vi.resetModules();
  return import('@/lib/workout/rest-targets');
}

beforeEach(() => {
  originalWindow = globalObject.window;
  storage = new MemoryStorage();
  Object.defineProperty(globalObject, 'window', { value: { localStorage: storage }, configurable: true, writable: true });
});

afterEach(() => {
  if (originalWindow === undefined) delete (globalObject as { window?: unknown }).window;
  else Object.defineProperty(globalObject, 'window', { value: originalWindow, configurable: true, writable: true });
});

describe('rest targets', () => {
  it('uses compound and isolation defaults when no override exists', async () => {
    const { defaultRestSeconds, getRestTarget } = await loadModule();
    expect(defaultRestSeconds(true)).toBe(150);
    expect(defaultRestSeconds(false)).toBe(90);
    expect(defaultRestSeconds(null)).toBe(90);
    expect(getRestTarget('bench', true)).toBe(150);
    expect(getRestTarget('curl', false)).toBe(90);
  });

  it('parses storage once across repeated reads of unchanged data', async () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ 'rest-a': 120, 'rest-b': 180 }));
    const { getRestTarget } = await loadModule();
    const parse = vi.spyOn(JSON, 'parse');
    for (let i = 0; i < 25; i += 1) {
      expect(getRestTarget('rest-a', false)).toBe(120);
      expect(getRestTarget('rest-b', true)).toBe(180);
    }
    expect(parse).toHaveBeenCalledTimes(1);
    parse.mockRestore();
  });

  it('still reflects an external write to storage', async () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ 'rest-c': 120 }));
    const { getRestTarget } = await loadModule();
    expect(getRestTarget('rest-c', false)).toBe(120);
    storage.setItem(STORAGE_KEY, JSON.stringify({ 'rest-c': 60 }));
    expect(getRestTarget('rest-c', false)).toBe(60);
  });

  it('ignores malformed, non-integer, and out-of-range stored values', async () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ bad: 'nope', zero: 0, small: 10, frac: 90.5, huge: 99999 }));
    const { getRestTarget } = await loadModule();
    expect(getRestTarget('bad', true)).toBe(150);
    expect(getRestTarget('zero', true)).toBe(150);
    expect(getRestTarget('small', false)).toBe(90);
    expect(getRestTarget('frac', false)).toBe(90);
    expect(getRestTarget('huge', false)).toBe(90);
  });

  it('persists a valid override and rejects invalid writes without clobbering storage', async () => {
    const { getRestTarget, setRestTarget } = await loadModule();
    setRestTarget('rest-d', 120);
    expect(getRestTarget('rest-d', false)).toBe(120);
    expect(JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}')).toEqual({ 'rest-d': 120 });

    setRestTarget('rest-d', 10);
    setRestTarget('rest-d', 120.5);
    setRestTarget('rest-d', Number.NaN);
    setRestTarget('', 120);
    setRestTarget('rest-d', 99999);
    expect(JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}')).toEqual({ 'rest-d': 120 });
  });

  it('does not expose an override that failed to persist', async () => {
    storage.failWrites = true;
    const { getRestTarget, setRestTarget } = await loadModule();
    expect(() => setRestTarget('rest-e', 150)).not.toThrow();
    expect(getRestTarget('rest-e', false)).toBe(90);
  });
});

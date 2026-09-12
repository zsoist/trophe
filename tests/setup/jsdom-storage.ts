// Node ≥22 exposes a lazy `globalThis.localStorage` accessor that evaluates to
// `undefined` unless the process was started with `--localstorage-file`. Vitest's
// jsdom environment copies jsdom's window onto the global but deliberately skips
// keys that already exist on `globalThis`, so jsdom's real `window.localStorage`
// (and `sessionStorage`) never gets installed and any test that touches browser
// storage throws "Cannot read properties of undefined".
//
// This setup restores a spec-faithful in-memory `Storage` for jsdom tests only.
// It is a no-op under the node environment and whenever storage already exists,
// and it does not weaken or skip any assertion — components still exercise real
// getItem/setItem/removeItem behaviour.

class MemoryStorage implements Storage {
  #store = new Map<string, string>();

  get length(): number {
    return this.#store.size;
  }

  clear(): void {
    this.#store.clear();
  }

  getItem(key: string): string | null {
    return this.#store.has(key) ? this.#store.get(key)! : null;
  }

  key(index: number): string | null {
    return [...this.#store.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#store.set(key, String(value));
  }
}

const globalObject = globalThis as typeof globalThis & { localStorage?: Storage };

if (typeof window !== 'undefined' && typeof document !== 'undefined' && !globalObject.localStorage) {
  Object.defineProperty(globalObject, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
    enumerable: false,
  });
}

export {};

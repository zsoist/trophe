import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('login hydration submit guard', () => {
  it('keeps native form submission disabled until the client handler is mounted', () => {
    const source = readFileSync('app/login/page.tsx', 'utf8');

    expect(source).toContain('const [hydrated, setHydrated] = useState(false)');
    expect(source).toContain('queueMicrotask(() => setHydrated(true))');
    expect(source).toContain('disabled={!hydrated || loading}');
  });
});

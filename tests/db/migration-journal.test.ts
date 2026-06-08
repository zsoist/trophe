import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Drizzle migration journal', () => {
  it('tracks every SQL migration exactly once', () => {
    const root = process.cwd();
    const files = readdirSync(join(root, 'drizzle'))
      .filter((name) => name.endsWith('.sql'))
      .map((name) => name.replace(/\.sql$/, ''))
      .sort();
    const journal = JSON.parse(readFileSync(join(root, 'drizzle/meta/_journal.json'), 'utf8')) as {
      entries: Array<{ tag: string; idx: number; when: number }>;
    };
    const tags = journal.entries.map((entry) => entry.tag).sort();
    expect(tags).toEqual(files);
    expect(new Set(tags).size).toBe(tags.length);
    expect(new Set(journal.entries.map((entry) => entry.when)).size).toBe(journal.entries.length);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chronologicalFromNewest } from '@/lib/chat/message-order';

describe('chat history window', () => {
  it('turns the newest-first database window into chronological display order', () => {
    const newestFirst = [{ id: '203' }, { id: '202' }, { id: '201' }];

    expect(chronologicalFromNewest(newestFirst).map(({ id }) => id)).toEqual([
      '201',
      '202',
      '203',
    ]);
    expect(newestFirst.map(({ id }) => id)).toEqual(['203', '202', '201']);
  });

  it('loads and polls the newest 200 while preserving distinct optimistic sends', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/shared/ChatThread.tsx'),
      'utf8',
    );

    expect(
      source.match(/\.order\('created_at', \{ ascending: false \}\)/g),
    ).toHaveLength(2);
    expect(
      source.match(/chronologicalFromNewest\(/g),
    ).toHaveLength(2);
    expect(source).toContain('return [...fresh, ...temps];');
    expect(source).not.toContain(
      'f.body === tm.body && f.attachment_type === tm.attachment_type',
    );
  });
});

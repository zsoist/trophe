import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  releaseAllPreviewUrls,
  releaseUnreferencedPreviewUrls,
} from '@/lib/chat/preview-url-lifecycle';

describe('chat attachment preview lifecycle', () => {
  it('releases only owned blob URLs that are no longer rendered', () => {
    const owned = new Set(['blob:old-photo', 'blob:active-audio']);
    const revoke = vi.fn();

    releaseUnreferencedPreviewUrls(
      owned,
      new Set(['blob:active-audio', 'https://signed.example/photo']),
      revoke,
    );

    expect(revoke).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith('blob:old-photo');
    expect([...owned]).toEqual(['blob:active-audio']);
  });

  it('releases every remaining preview when the thread unmounts', () => {
    const owned = new Set(['blob:photo', 'blob:audio']);
    const revoke = vi.fn();

    releaseAllPreviewUrls(owned, revoke);

    expect(revoke.mock.calls.map(([url]) => url)).toEqual([
      'blob:photo',
      'blob:audio',
    ]);
    expect(owned.size).toBe(0);
  });

  it('transitions successful sends to persisted URLs without breaking retries', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/shared/ChatThread.tsx'),
      'utf8',
    );

    expect(source).toContain('ownedPreviewUrlsRef');
    expect(source).toContain('releaseUnreferencedPreviewUrls(');
    expect(source).toContain('releaseAllPreviewUrls(');
    expect(source).toContain('const displayUrl = m.localUrl ?? remoteUrl;');
    expect(source).toContain(
      'const persistedUrl = attachment_path ? await signedUrl(attachment_path) : null;',
    );
    expect(source).toContain('localUrl: persistedUrl ?? att?.previewUrl');
    expect(source).toContain('setPending(att); // let the user retry');
  });
});

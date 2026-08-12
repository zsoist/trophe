import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { stopMediaStream } from '@/lib/chat/media-recorder-lifecycle';

describe('chat media resource lifecycle', () => {
  it('stops every track held by a recording stream', () => {
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];

    stopMediaStream({ getTracks: () => tracks });

    expect(tracks[0].stop).toHaveBeenCalledOnce();
    expect(tracks[1].stop).toHaveBeenCalledOnce();
  });

  it('cancels recorder callbacks and pending permission work on unmount', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/shared/ChatThread.tsx'),
      'utf8',
    );

    expect(source).toContain('activeStreamRef');
    expect(source).toContain('mediaMountedRef');
    expect(source).toContain('recordCancelledRef.current = true;');
    expect(source).toContain('recorder.ondataavailable = null;');
    expect(source).toContain('recorder.onstop = null;');
    expect(source).toContain('stopMediaStream(activeStreamRef.current);');
    expect(source).toContain('if (!mediaMountedRef.current)');
  });

  it('always closes the decoded image bitmap', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/shared/ChatThread.tsx'),
      'utf8',
    );

    expect(source).toContain('finally {');
    expect(source).toContain('bitmap.close();');
  });
});

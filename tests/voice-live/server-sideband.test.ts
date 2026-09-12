import { afterEach, expect, it, vi } from 'vitest';
import type { EventEmitter } from 'node:events';
const sockets = vi.hoisted(() => [] as Array<EventEmitter & { readyState: number; send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; url: string }>);
vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events');
  return { default: class extends EventEmitter {
    static OPEN = 1;
    readyState = 0;
    send = vi.fn();
    close = vi.fn(() => this.emit('close'));
    constructor(public url: string) { super(); sockets.push(this); }
  } };
});
import { openLiveSideband } from '../../lib/voice-live/server-sideband';
afterEach(() => { sockets.splice(0); });

it('keeps the opaque id on the fixed provider origin and drops reflected audio', async () => {
  const band = openLiveSideband('test-only-key', 'live_opaque/value');
  const socket = sockets[0]; socket.readyState = 1; socket.emit('open');
  expect(socket.url).toBe('wss://api.openai.com/v1/live/sessions/live_opaque%2Fvalue/attach');
  socket.emit('message', Buffer.from(JSON.stringify({ type: 'session.output_audio.delta', delta: 'private-audio' })));
  socket.emit('message', Buffer.from(JSON.stringify({ type: 'session.usage.updated', usage: { seconds: 12 } })));
  const iterator = band.events[Symbol.asyncIterator]();
  expect((await iterator.next()).value).toMatchObject({ type: 'session.usage.updated' });
  band.dispose();
  await iterator.return?.();
});

it('waits for provider finalization after sending close and keeps the receiver alive', async () => {
  const band = openLiveSideband('test-only-key', 'live_one');
  const socket = sockets[0]; socket.readyState = 1; socket.emit('open');
  const stop = band.close(new AbortController().signal);
  await Promise.resolve(); await Promise.resolve();
  expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'session.close' }));
  expect(socket.close).not.toHaveBeenCalled();
  socket.emit('message', Buffer.from(JSON.stringify({ type: 'session.closed', usage: { seconds: 20 } })));
  await stop;
  const iterator = band.events[Symbol.asyncIterator]();
  expect((await iterator.next()).value).toMatchObject({ type: 'session.closed', usage: { seconds: 20 } });
  band.dispose(); await iterator.return?.();
});

it('does not turn a socket failure into confirmed finalization', async () => {
  const band = openLiveSideband('test-only-key', 'live_one');
  const socket = sockets[0]; socket.readyState = 1; socket.emit('open');
  socket.emit('error', new Error('connection lost'));
  await expect(band.events[Symbol.asyncIterator]().next()).rejects.toThrow('sideband_lost');
  band.dispose();
});

it('bounds close confirmation with its independent abort signal', async () => {
  const band = openLiveSideband('test-only-key', 'live_one');
  const socket = sockets[0]; socket.readyState = 1; socket.emit('open');
  const abort = new AbortController();
  const stop = band.close(abort.signal);
  abort.abort();
  await expect(stop).rejects.toThrow('close_timeout');
  band.dispose();
});

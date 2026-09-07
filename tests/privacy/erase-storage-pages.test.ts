import { expect, it, vi } from 'vitest';
import { eraseStoragePages } from '../../lib/privacy/erase-storage-pages';
function fixture(size: number) {
  let objects = Array.from({ length: size }, (_, i) => String(i));
  const list = vi.fn(async (offset: number, limit: number) => ({ names: objects.slice(offset, offset + limit) }));
  const remove = vi.fn(async (names: string[]) => { const removed = new Set(names); objects = objects.filter(name => !removed.has(name)); return {}; });
  return { list, remove, remaining: () => objects.length };
}
it('removes all 2501 objects despite offsets shifting after deletion', async () => {
  const port = fixture(2501);
  expect(await eraseStoragePages(port, false)).toEqual({ count: 2501 });
  expect(port.remaining()).toBe(0);
  expect(port.list.mock.calls.map(call => call[0])).toEqual([0, 0, 0]);
});
it('dry run paginates without writes', async () => {
  const port = fixture(2501);
  expect(await eraseStoragePages(port, true)).toEqual({ count: 2501 });
  expect(port.remaining()).toBe(2501);
  expect(port.remove).not.toHaveBeenCalled();
  expect(port.list.mock.calls.map(call => call[0])).toEqual([0, 1000, 2000]);
});
it('stops on list failure instead of treating it as an empty inventory', async () => {
  const remove = vi.fn();
  expect(await eraseStoragePages({ list: async () => ({ names: [], error: 'unavailable' }), remove }, false)).toEqual({ count: 0, error: 'list: unavailable' });
  expect(remove).not.toHaveBeenCalled();
});
it('stops when a storage list returns no data without an error', async () => {
  const remove = vi.fn();
  expect(await eraseStoragePages({ list: async () => ({ names: null }), remove }, false)).toEqual({ count: 0, error: 'list: no data returned' });
});
it('stops on removal failure without advancing or claiming deletion', async () => {
  const list = vi.fn(async () => ({ names: ['one'] }));
  expect(await eraseStoragePages({ list, remove: async () => ({ error: 'unavailable' }) }, false)).toEqual({ count: 0, error: 'remove: unavailable' });
  expect(list).toHaveBeenCalledTimes(1);
});

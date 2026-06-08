export type MemoryWriteStatus = 'completed' | 'degraded';

export async function settleMemoryWrites(
  writes: Promise<unknown>[],
  timeoutMs = Number(process.env.MEMORY_WRITE_RESPONSE_BUDGET_MS ?? '1500'),
): Promise<MemoryWriteStatus> {
  const settled = Promise.allSettled(writes);
  const timeout = new Promise<'timeout'>((resolve) => {
    const timer = setTimeout(() => resolve('timeout'), timeoutMs);
    timer.unref?.();
  });
  const result = await Promise.race([settled, timeout]);
  if (result === 'timeout') return 'degraded';
  return result.some((item) => item.status === 'rejected') ? 'degraded' : 'completed';
}

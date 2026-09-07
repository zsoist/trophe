import { expect, it } from 'vitest';
import { atlasResourceMetrics, gestureMetrics } from '../../tools/anatomy/device-observation';
const frames = Array.from({ length: 300 }, (_, timestamp) => ({ timestamp, durationMs: 2, drawCalls: 10, triangles: 100, geometries: 2, textures: 0 }));
it('rejects short gestures and reports cadence without claiming GPU or memory measurements', () => {
  expect(gestureMetrics(frames, 2).validSample).toBe(false);
  expect(gestureMetrics([], 12).validSample).toBe(false);
  expect(gestureMetrics(frames, 0).submissionsPerSecond).toBeNull();
  expect(gestureMetrics(frames, 10)).toMatchObject({ validSample: true, submissionsPerSecond: 30, gpuFrameTime: 'not measured', browserOrGpuMemoryBytes: 'not measured' });
});
it('limits resource totals to anatomy and does not label zero transfer as a proven cache hit', () => {
  const resources = [{ name: 'https://local.test/anatomy/a.glb', encodedBodySize: 100, transferSize: 0 }, { name: 'https://local.test/workout.js', encodedBodySize: 900, transferSize: 900 }] as PerformanceResourceTiming[];
  expect(atlasResourceMetrics(resources)).toMatchObject({ resourceCount: 1, encodedBodyBytes: 100, transferredBytes: 0, zeroTransferResources: 1 });
});

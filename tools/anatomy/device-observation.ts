import type { RenderObservation } from '../../components/anatomy/AtlasCanvas';
/** Diagnostic quantities only; renderer submissions are not presented GPU frames. */
export function gestureMetrics(frames: RenderObservation[], durationSeconds: number) {
  const cpu = frames.map(frame => frame.durationMs).sort((a, b) => a - b);
  return {
    durationSeconds,
    renderedSubmissions: frames.length,
    submissionsPerSecond: durationSeconds > 0 ? frames.length / durationSeconds : null,
    cpuSubmissionP95Ms: cpu[Math.max(0, Math.ceil(cpu.length * 0.95) - 1)] ?? null,
    validSample: durationSeconds >= 10 && frames.length >= 30,
    lastRenderer: frames.at(-1) ?? null,
    gpuFrameTime: 'not measured',
    browserOrGpuMemoryBytes: 'not measured',
  };
}
export function atlasResourceMetrics(resources: PerformanceResourceTiming[]) {
  const atlas = resources.filter(resource => new URL(resource.name).pathname.startsWith('/anatomy/'));
  return {
    resourceCount: atlas.length,
    encodedBodyBytes: atlas.reduce((sum, resource) => sum + resource.encodedBodySize, 0),
    transferredBytes: atlas.reduce((sum, resource) => sum + resource.transferSize, 0),
    zeroTransferResources: atlas.filter(resource => resource.transferSize === 0).length,
    note: 'Navigation-cumulative /anatomy/ resource timing; zero transfer may be cache or unavailable timing. Not total resident memory.',
  };
}

const BLOCKED_UTC_HOURS = new Set([1, 2, 3, 6, 7, 8, 9]);

export function assertOffPeakEvalWindow(now = new Date()): void {
  if (BLOCKED_UTC_HOURS.has(now.getUTCHours())) {
    throw new Error(
      `Factory/simulator calls are blocked at ${now.toISOString()}; run outside UTC 01:00-04:00 and 06:00-10:00.`,
    );
  }
}

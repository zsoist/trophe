export function groupWorkoutSessionsByMonth<T extends { session_date: string }>(sessions: T[]) {
  const grouped = new Map<string, T[]>();
  for (const session of sessions) {
    const date = new Date(`${session.session_date}T12:00:00`);
    const month = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    grouped.set(month, [...(grouped.get(month) ?? []), session]);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => new Date(`1 ${b}`).getTime() - new Date(`1 ${a}`).getTime())
    .map(([month, monthSessions]) => ({ month, sessions: monthSessions }));
}

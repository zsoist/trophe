export function groupWorkoutSessionsByMonth<T extends { session_date: string }>(sessions: T[], locale = 'en-US') {
  const grouped = new Map<string, T[]>();
  for (const session of sessions) {
    const monthKey = session.session_date.slice(0, 7);
    const existing = grouped.get(monthKey);
    if (existing) existing.push(session);
    else grouped.set(monthKey, [session]);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([monthKey, monthSessions]) => ({
      monthKey,
      month: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
        new Date(`${monthKey}-01T12:00:00`),
      ),
      sessions: monthSessions.sort((left, right) => right.session_date.localeCompare(left.session_date)),
    }));
}

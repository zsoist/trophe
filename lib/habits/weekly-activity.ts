interface HabitActivityRow {
  checked_date: string;
  completed: boolean | null;
}

function mondayFirstWeekday(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    return null;
  }
  return (parsed.getUTCDay() + 6) % 7;
}

export function weeklyHabitActivity(
  checkins: HabitActivityRow[],
  mondayDate: string,
): number[] {
  const counts = [0, 0, 0, 0, 0, 0, 0];

  for (const checkin of checkins) {
    if (checkin.completed !== true || checkin.checked_date < mondayDate) continue;
    const dayIndex = mondayFirstWeekday(checkin.checked_date);
    if (dayIndex !== null) counts[dayIndex] += 1;
  }

  return counts;
}

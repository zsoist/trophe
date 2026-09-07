import type { WorkoutAnalyticsData } from '../../../lib/workout/analytics-data';
import { localToday } from '../../../lib/utils/dates';
import { reviewData, reviewExercises } from './store';
export * from '../../../lib/workout/analytics-data';
export async function loadWorkoutAnalyticsData(): Promise<WorkoutAnalyticsData> {
  const data = reviewData();
  const sessions = data.sessions.filter(session => session.completed_at);
  const sets = data.sets.flatMap(set => {
    const session = sessions.find(item => item.id === set.session_id);
    const exercise = [...reviewExercises, ...data.customExercises].find(item => item.id === set.exercise_id);
    return session && exercise ? [{ ...set, created_at: set.created_at ?? session.created_at, session, exercise }] : [];
  });
  return { sessions, sets, measurements: [], programs: data.scenario === 'plan' ? [{ starts_on: localToday(), workout_program_days: [{ weekday: new Date().getDay() }, { weekday: (new Date().getDay() + 2) % 7 }] }] : [], issues: { schedule: false, measurements: false, historyTruncated: false, measurementsTruncated: false } };
}

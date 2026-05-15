import { RoutineExercise, SetKind, Weekday } from '../domain/types';

export const weekdayOptions: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export function getTodayWeekday(): Weekday {
  const day = new Date().getDay();
  return weekdayOptions[day === 0 ? 6 : day - 1];
}

export function estimateRoutineMinutes(exercises: RoutineExercise[]) {
  const totalRestSeconds = exercises.reduce(
    (total, exercise) => total + exercise.restSeconds * Math.max(exercise.sets.length - 1, 0),
    0,
  );
  const activeSeconds = exercises.reduce((total, exercise) => total + exercise.sets.length * 45, 0);
  return Math.max(Math.round((totalRestSeconds + activeSeconds) / 60), 1);
}

export function splitRestTime(totalSeconds: number) {
  return {
    minutes: Math.floor(totalSeconds / 60).toString(),
    seconds: (totalSeconds % 60).toString(),
  };
}

export function combineRestTime(minutes: string, seconds: string) {
  const parsedMinutes = Number.parseInt(minutes, 10);
  const parsedSeconds = Number.parseInt(seconds, 10);
  return Math.max((Number.isFinite(parsedMinutes) ? parsedMinutes : 0) * 60 + (Number.isFinite(parsedSeconds) ? parsedSeconds : 0), 0);
}

export function getSetKindLabel(kind: SetKind, setIndex: number) {
  if (kind === 'drop') {
    return 'D';
  }
  if (kind === 'failure') {
    return 'F';
  }
  if (kind === 'warmup') {
    return 'W';
  }
  return (setIndex + 1).toString();
}

export function getNextSetKind(kind: SetKind): SetKind {
  if (kind === 'normal') {
    return 'warmup';
  }
  if (kind === 'warmup') {
    return 'failure';
  }
  if (kind === 'failure') {
    return 'drop';
  }
  return 'normal';
}

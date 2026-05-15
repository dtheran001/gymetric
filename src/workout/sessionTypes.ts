import { Achievement, Routine, SetLog } from '../domain/types';

export type Tab = 'today' | 'routines' | 'exercises' | 'progress';

export type WorkoutView = 'focus' | 'overview';

export type ActualSetInput = Record<string, { reps: string; weightKg: string }>;

export type SetEditorTarget = { exerciseIndex: number; setIndex: number } | null;

export type ActiveWorkout = {
  routine: Routine;
  exerciseIndex: number;
  setIndex: number;
  restRemaining: number;
  restEndsAt: number | null;
  restNotificationId: string | null;
  isResting: boolean;
  completedSetIds: string[];
  completedLogIds: Record<string, string>;
  completedAchievementIds: Record<string, string>;
  pendingLogs: Record<string, SetLog>;
  pendingAchievements: Record<string, Achievement>;
  skippedExerciseIds: string[];
  inputs: ActualSetInput;
  view: WorkoutView;
  startedAt: number;
  elapsedSeconds: number;
};

export type WorkoutSummary = {
  routine: Routine;
  completedSetIds: string[];
  inputs: ActualSetInput;
  logs: SetLog[];
  achievements: Achievement[];
  elapsedSeconds: number;
};

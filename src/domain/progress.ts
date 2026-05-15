import { Achievement, Exercise, SetLog } from './types';

export function getPersonalBest(logs: SetLog[], exerciseId: string) {
  return logs
    .filter((log) => log.exerciseId === exerciseId)
    .reduce((best, log) => Math.max(best, log.weightKg), 0);
}

export function buildAchievement(
  previousBest: number,
  log: SetLog,
  exercise: Exercise,
): Achievement | null {
  if (log.weightKg <= previousBest) {
    return null;
  }

  return {
    id: `achievement-${log.id}`,
    exerciseId: log.exerciseId,
    title: 'Record personal',
    description: `${exercise.name} sube a ${log.weightKg} kg`,
    earnedAt: log.completedAt,
  };
}

export function formatRestTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

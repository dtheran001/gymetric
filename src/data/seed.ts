import { Achievement, Exercise, Routine, SetLog } from '../domain/types';

export const seedExercises: Exercise[] = [
  {
    id: 'bench-press',
    name: 'Press banca',
    muscleGroup: 'chest',
    equipment: 'Barra',
    equipmentKind: 'barbell',
    grip: 'prone',
    movementFocus: 'none',
    isCustom: false,
  },
  {
    id: 'lat-pulldown',
    name: 'Jalón al pecho',
    muscleGroup: 'back',
    equipment: 'Polea',
    equipmentKind: 'cable',
    grip: 'prone',
    movementFocus: 'none',
    isCustom: false,
  },
  {
    id: 'leg-press',
    name: 'Prensa de piernas',
    muscleGroup: 'legs',
    equipment: 'Maquina',
    equipmentKind: 'machine',
    grip: 'none',
    movementFocus: 'none',
    isCustom: false,
  },
  {
    id: 'shoulder-press',
    name: 'Press hombro',
    muscleGroup: 'shoulders',
    equipment: 'Mancuernas',
    equipmentKind: 'dumbbell',
    grip: 'neutral',
    movementFocus: 'none',
    isCustom: false,
  },
];

export const seedRoutines: Routine[] = [
  {
    id: 'upper-a',
    name: 'Upper A',
    focus: 'Pecho, espalda y hombro',
    estimatedMinutes: 58,
    preferredDays: ['monday', 'thursday'],
    exercises: [
      {
        id: 'upper-a-bench',
        exerciseId: 'bench-press',
        restSeconds: 120,
        sets: [
          { id: 's1', kind: 'warmup', targetReps: 12, targetWeightKg: 40 },
          { id: 's2', kind: 'normal', targetReps: 8, targetWeightKg: 60 },
          { id: 's3', kind: 'normal', targetReps: 8, targetWeightKg: 62.5 },
          { id: 's4', kind: 'failure', targetReps: 6, targetWeightKg: 65 },
        ],
      },
      {
        id: 'upper-a-pulldown',
        exerciseId: 'lat-pulldown',
        restSeconds: 90,
        sets: [
          { id: 's1', kind: 'normal', targetReps: 10, targetWeightKg: 55 },
          { id: 's2', kind: 'normal', targetReps: 10, targetWeightKg: 57.5 },
          { id: 's3', kind: 'drop', targetReps: 12, targetWeightKg: 50 },
        ],
      },
      {
        id: 'upper-a-shoulder',
        exerciseId: 'shoulder-press',
        restSeconds: 90,
        sets: [
          { id: 's1', kind: 'normal', targetReps: 10, targetWeightKg: 18 },
          { id: 's2', kind: 'normal', targetReps: 10, targetWeightKg: 20 },
          { id: 's3', kind: 'failure', targetReps: 8, targetWeightKg: 20 },
        ],
      },
    ],
  },
  {
    id: 'legs-a',
    name: 'Pierna A',
    focus: 'Cuádriceps y empuje',
    estimatedMinutes: 46,
    preferredDays: ['tuesday'],
    exercises: [
      {
        id: 'legs-a-press',
        exerciseId: 'leg-press',
        restSeconds: 120,
        sets: [
          { id: 's1', kind: 'warmup', targetReps: 15, targetWeightKg: 90 },
          { id: 's2', kind: 'normal', targetReps: 10, targetWeightKg: 130 },
          { id: 's3', kind: 'normal', targetReps: 10, targetWeightKg: 140 },
          { id: 's4', kind: 'failure', targetReps: 8, targetWeightKg: 145 },
        ],
      },
    ],
  },
];

export const seedLogs: SetLog[] = [
  {
    id: 'log-1',
    exerciseId: 'bench-press',
    routineId: 'upper-a',
    reps: 8,
    weightKg: 60,
    kind: 'normal',
    completedAt: '2026-05-06T18:45:00.000Z',
  },
  {
    id: 'log-2',
    exerciseId: 'lat-pulldown',
    routineId: 'upper-a',
    reps: 10,
    weightKg: 55,
    kind: 'normal',
    completedAt: '2026-05-06T19:02:00.000Z',
  },
  {
    id: 'log-3',
    exerciseId: 'leg-press',
    routineId: 'legs-a',
    reps: 10,
    weightKg: 135,
    kind: 'normal',
    completedAt: '2026-05-09T12:30:00.000Z',
  },
];

export const seedAchievements: Achievement[] = [
  {
    id: 'ach-1',
    exerciseId: 'leg-press',
    title: 'Nuevo máximo',
    description: 'Prensa de piernas a 135 kg',
    earnedAt: '2026-05-09T12:30:00.000Z',
  },
];

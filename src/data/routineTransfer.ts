import { Exercise, Routine } from '../domain/types';

export const ROUTINE_TRANSFER_FORMAT = 'gymetric-routines';
export const ROUTINE_TRANSFER_VERSION = 1;

export type RoutineTransferFile = {
  format: typeof ROUTINE_TRANSFER_FORMAT;
  schemaVersion: typeof ROUTINE_TRANSFER_VERSION;
  exportedAt: string;
  exercises: Exercise[];
  routines: Routine[];
};

export function buildRoutineTransferFile(exercises: Exercise[], routines: Routine[]): RoutineTransferFile {
  const referencedExerciseIds = new Set(
    routines.flatMap((routine) => routine.exercises.map((routineExercise) => routineExercise.exerciseId)),
  );
  return {
    format: ROUTINE_TRANSFER_FORMAT,
    schemaVersion: ROUTINE_TRANSFER_VERSION,
    exportedAt: new Date().toISOString(),
    exercises: exercises.filter((exercise) => referencedExerciseIds.has(exercise.id)),
    routines,
  };
}

export function parseRoutineTransferFile(raw: string): RoutineTransferFile {
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value) || value.format !== ROUTINE_TRANSFER_FORMAT || value.schemaVersion !== ROUTINE_TRANSFER_VERSION) {
    throw new Error('El archivo no tiene un formato de rutinas compatible con Gymetric.');
  }
  if (!Array.isArray(value.exercises) || !value.exercises.every(isExercise)) {
    throw new Error('El archivo contiene ejercicios no válidos.');
  }
  if (!Array.isArray(value.routines) || !value.routines.length || !value.routines.every(isRoutine)) {
    throw new Error('El archivo no contiene rutinas válidas.');
  }

  const exerciseIds = new Set(value.exercises.map((exercise) => exercise.id));
  if (value.routines.some((routine) => routine.exercises.some((item) => !exerciseIds.has(item.exerciseId)))) {
    throw new Error('Hay ejercicios de rutina sin una definición asociada.');
  }
  return value as RoutineTransferFile;
}

export function mergeRoutineTransferFile(
  currentExercises: Exercise[],
  currentRoutines: Routine[],
  transfer: RoutineTransferFile,
) {
  const now = Date.now();
  const exerciseIdMap = new Map<string, string>();
  const addedExercises: Exercise[] = [];

  transfer.exercises.forEach((importedExercise, index) => {
    const match = currentExercises.find(
      (exercise) =>
        normalize(exercise.name) === normalize(importedExercise.name) &&
        exercise.equipmentKind === importedExercise.equipmentKind,
    );
    if (match) {
      exerciseIdMap.set(importedExercise.id, match.id);
      return;
    }
    const id = `exercise-import-${now}-${index}`;
    exerciseIdMap.set(importedExercise.id, id);
    addedExercises.push({ ...importedExercise, id, archivedAt: undefined });
  });

  const addedRoutines = transfer.routines.map((routine, routineIndex) => {
    const routineExerciseIdMap = new Map<string, string>();
    const setIdMap = new Map<string, string>();
    const importedExercises = routine.exercises.map((routineExercise, exerciseIndex) => {
      const id = `routine-exercise-import-${now}-${routineIndex}-${exerciseIndex}`;
      routineExerciseIdMap.set(routineExercise.id, id);
      return {
        ...routineExercise,
        id,
        exerciseId: exerciseIdMap.get(routineExercise.exerciseId)!,
        sets: routineExercise.sets.map((set, setIndex) => {
          const setId = `set-import-${now}-${routineIndex}-${exerciseIndex}-${setIndex}`;
          setIdMap.set(set.id, setId);
          return { ...set, id: setId };
        }),
      };
    });
    return {
      ...routine,
      id: `routine-import-${now}-${routineIndex}`,
      archivedAt: undefined,
      exercises: importedExercises,
      executionSequence: routine.executionSequence?.map((step) => ({
        routineExerciseId: routineExerciseIdMap.get(step.routineExerciseId)!,
        setId: setIdMap.get(step.setId)!,
      })),
    };
  });

  return {
    exercises: [...addedExercises, ...currentExercises],
    routines: [...addedRoutines, ...currentRoutines],
    addedExerciseCount: addedExercises.length,
    reusedExerciseCount: transfer.exercises.length - addedExercises.length,
    addedRoutineCount: addedRoutines.length,
  };
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isExercise(value: unknown): value is Exercise {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.muscleGroup === 'string' &&
    typeof value.equipment === 'string' &&
    typeof value.equipmentKind === 'string' &&
    typeof value.isCustom === 'boolean'
  );
}

function isRoutine(value: unknown): value is Routine {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.focus === 'string' &&
    typeof value.estimatedMinutes === 'number' &&
    Array.isArray(value.exercises) &&
    value.exercises.length > 0 &&
    value.exercises.every(
      (item) =>
        isRecord(item) &&
        typeof item.id === 'string' &&
        typeof item.exerciseId === 'string' &&
        typeof item.restSeconds === 'number' &&
        Array.isArray(item.sets) &&
        item.sets.length > 0 &&
        item.sets.every(
          (set) =>
            isRecord(set) &&
            typeof set.id === 'string' &&
            typeof set.kind === 'string' &&
            (typeof set.targetReps === 'number' || set.targetReps === null) &&
            (typeof set.targetWeightKg === 'number' || set.targetWeightKg === null),
        ),
    )
  );
}

export type SetKind = 'normal' | 'failure' | 'drop' | 'warmup';

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'legs'
  | 'shoulders'
  | 'arms'
  | 'core';

export type EquipmentKind = 'machine' | 'free_weight' | 'barbell' | 'dumbbell' | 'cable' | 'bodyweight' | 'other';

export type GripKind = 'none' | 'prone' | 'supine' | 'neutral' | 'mixed';

export type MovementFocus = 'none' | 'concentric' | 'eccentric' | 'tempo';

export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export type Exercise = {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  equipment: string;
  equipmentKind: EquipmentKind;
  grip?: GripKind;
  movementFocus?: MovementFocus;
  notes?: string;
  isCustom: boolean;
};

export type RoutineSet = {
  id: string;
  kind: SetKind;
  targetReps: number;
  targetWeightKg: number;
};

export type RoutineExercise = {
  id: string;
  exerciseId: string;
  restSeconds: number;
  sets: RoutineSet[];
};

export type Routine = {
  id: string;
  name: string;
  focus: string;
  estimatedMinutes: number;
  preferredDays?: Weekday[];
  exercises: RoutineExercise[];
};

export type SetLog = {
  id: string;
  exerciseId: string;
  routineId: string;
  reps: number;
  weightKg: number;
  kind: SetKind;
  completedAt: string;
};

export type Achievement = {
  id: string;
  exerciseId: string;
  title: string;
  description: string;
  earnedAt: string;
};

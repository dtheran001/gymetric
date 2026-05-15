import { EquipmentKind, GripKind, MovementFocus, MuscleGroup, Weekday } from '../domain/types';

export const muscleLabels: Record<MuscleGroup, string> = {
  chest: 'Pecho',
  back: 'Espalda',
  legs: 'Pierna',
  shoulders: 'Hombro',
  arms: 'Brazos',
  core: 'Core',
};

export const equipmentLabels: Record<EquipmentKind, string> = {
  machine: 'Maquina',
  free_weight: 'Peso libre',
  barbell: 'Barra',
  dumbbell: 'Mancuernas',
  cable: 'Polea',
  bodyweight: 'Peso corporal',
  other: 'Otro',
};

export const gripLabels: Record<GripKind, string> = {
  none: 'Sin agarre',
  prone: 'Prono',
  supine: 'Supino',
  neutral: 'Neutro',
  mixed: 'Mixto',
};

export const movementLabels: Record<MovementFocus, string> = {
  none: 'Sin foco',
  concentric: 'Concentrica',
  eccentric: 'Excentrica',
  tempo: 'Tempo',
};

export const weekdayLabels: Record<Weekday, string> = {
  monday: 'Lunes',
  tuesday: 'Martes',
  wednesday: 'Miercoles',
  thursday: 'Jueves',
  friday: 'Viernes',
  saturday: 'Sabado',
  sunday: 'Domingo',
};

import { MaterialIcons } from '@expo/vector-icons';
import { Dispatch, SetStateAction, useMemo } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useAppSettings } from '../../application/AppSettingsContext';
import { formatRestTime } from '../../domain/progress';
import { Achievement, Exercise, Routine, SetKind } from '../../domain/types';
import { ExerciseRow } from '../exercises/ExercisesScreen';
import { displayWeight, formatDecimal } from '../../domain/units';
import { createStyles } from '../../ui/legacyStyles';
import { darkTheme } from '../../ui/theme';
import { getSetKindLabel } from '../../workout/routineUtils';
import { ActiveWorkout, SetEditorTarget, WorkoutView } from '../../workout/sessionTypes';

let styles = createStyles(darkTheme);
function useStyles() { const { colors } = useAppSettings(); styles = useMemo(() => createStyles(colors), [colors]); return styles; }

export function TodayScreen({
  addSetToExercise,
  activeExercise,
  activeWorkout,
  achievements,
  adjustRest,
  completeCurrentSet,
  completeSetAt,
  deleteSetAt,
  exercises,
  latestAchievement,
  nextRoutine,
  openNoteEditor,
  openSetEditor,
  requestFinishRoutine,
  setWorkoutView,
  skipExerciseInActiveRoutine,
  skipRest,
  startRoutine,
  totalSetsLogged,
  uncompleteSetAt,
  updateActualSetValue,
  updateSetValueAt,
}: {
  addSetToExercise: (exerciseIndex: number) => void;
  activeExercise: Exercise | null;
  activeWorkout: ActiveWorkout | null;
  achievements: Achievement[];
  adjustRest: (seconds: number) => void;
  completeCurrentSet: () => void;
  completeSetAt: (exerciseIndex: number, setIndex: number) => void;
  deleteSetAt: (exerciseIndex: number, setIndex: number) => void;
  exercises: Exercise[];
  latestAchievement?: Achievement;
  nextRoutine?: Routine;
  openNoteEditor: (exerciseIndex: number, notes: string) => void;
  openSetEditor: (target: SetEditorTarget) => void;
  requestFinishRoutine: () => void;
  setWorkoutView: (view: WorkoutView) => void;
  skipExerciseInActiveRoutine: (exerciseIndex: number) => void;
  skipRest: () => void;
  startRoutine: (routine?: Routine) => void;
  totalSetsLogged: number;
  uncompleteSetAt: (exerciseIndex: number, setIndex: number) => void;
  updateActualSetValue: (field: 'reps' | 'weightKg', value: string) => void;
  updateSetValueAt: (exerciseIndex: number, setIndex: number, field: 'reps' | 'weightKg', value: string) => void;
}) {
  useStyles();
  const { colors, preferences } = useAppSettings();
  if (activeWorkout && activeExercise) {
    const routineExercise = activeWorkout.routine.exercises[activeWorkout.exerciseIndex];
    const set = routineExercise.sets[activeWorkout.setIndex];
    const setKey = `${routineExercise.id}:${set.id}`;
    const actualInput = activeWorkout.inputs[setKey];

    return (
      <View style={styles.stack}>
        <View style={styles.panel}>
          <View style={styles.sessionHeader}>
            <View style={styles.headerTitle}>
              <Text style={styles.sectionLabel}>Sesion activa</Text>
              <Text style={styles.h1}>{activeWorkout.routine.name}</Text>
              <Text style={styles.muted}>
                {activeWorkout.exerciseIndex + 1}/{activeWorkout.routine.exercises.length} ejercicios
              </Text>
              {!!activeWorkout.routine.conditioning && <Text style={styles.routineNote}>{activeWorkout.routine.conditioning}</Text>}
              {!!activeWorkout.routine.notes && <Text style={styles.generalExerciseNote}>{activeWorkout.routine.notes}</Text>}
            </View>
            <Pressable style={styles.endButton} onPress={requestFinishRoutine}>
              <Text style={styles.endButtonText}>Terminar</Text>
            </Pressable>
          </View>
          <View style={styles.segmented}>
            <SegmentButton active={activeWorkout.view === 'focus'} label="Foco" onPress={() => setWorkoutView('focus')} />
            <SegmentButton
              active={activeWorkout.view === 'overview'}
              label="Rutina"
              onPress={() => setWorkoutView('overview')}
            />
          </View>
        </View>
        <WorkoutStats activeWorkout={activeWorkout} />

        {activeWorkout.view === 'overview' ? (
          <WorkoutOverview
            activeWorkout={activeWorkout}
            addSetToExercise={addSetToExercise}
            completeSetAt={completeSetAt}
            deleteSetAt={deleteSetAt}
            exercises={exercises}
            openNoteEditor={openNoteEditor}
            openSetEditor={openSetEditor}
            skipExerciseInActiveRoutine={skipExerciseInActiveRoutine}
            uncompleteSetAt={uncompleteSetAt}
            updateSetValueAt={updateSetValueAt}
          />
        ) : (
          <View style={styles.workoutCard}>
            <Text style={styles.exerciseName}>{activeExercise.name}</Text>
            {!!activeExercise.notes && <Text style={styles.generalExerciseNote}>{activeExercise.notes}</Text>}
            {!!routineExercise.notes && <Text style={styles.routineNote}>{routineExercise.notes}</Text>}
            <Pressable
              style={styles.noteAction}
              onPress={() => openNoteEditor(activeWorkout.exerciseIndex, routineExercise.notes ?? '')}
            >
              <MaterialIcons color={colors.primary} name={routineExercise.notes ? 'edit-note' : 'note-add'} size={20} />
              <Text style={styles.noteActionText}>{routineExercise.notes ? 'Editar nota de rutina' : 'Añadir nota de rutina'}</Text>
            </Pressable>
            <Text style={styles.setMeta}>
              Serie {activeWorkout.setIndex + 1}/{routineExercise.sets.length} · {set.kind} · descanso{' '}
              {formatRestTime(routineExercise.restSeconds)}
            </Text>

            <View style={styles.actualGrid}>
              <ActualInput
                label={set.targetReps === null ? 'Reps al fallo' : `Reps objetivo ${set.targetReps}`}
                value={actualInput?.reps ?? ''}
                onChangeText={(value) => updateActualSetValue('reps', value)}
              />
              <ActualInput
                label={set.targetWeightKg === null ? `${preferences.weightUnit} por definir` : `${preferences.weightUnit} objetivo ${formatDecimal(displayWeight(set.targetWeightKg, preferences.weightUnit))}`}
                value={actualInput?.weightKg ?? ''}
                onChangeText={(value) => updateActualSetValue('weightKg', value)}
              />
            </View>

            {activeWorkout.isResting ? (
              <View style={styles.restBox}>
                <Text style={styles.restLabel}>Descanso</Text>
                <Text style={styles.restTime}>{formatRestTime(activeWorkout.restRemaining)}</Text>
                <View style={styles.timerControls}>
                  <Pressable style={styles.timerButton} onPress={() => adjustRest(-10)}>
                    <Text style={styles.timerButtonText}>-10s</Text>
                  </Pressable>
                  <Pressable style={styles.timerButtonPrimary} onPress={skipRest}>
                    <Text style={styles.timerButtonPrimaryText}>Saltar</Text>
                  </Pressable>
                  <Pressable style={styles.timerButton} onPress={() => adjustRest(10)}>
                    <Text style={styles.timerButtonText}>+10s</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable style={styles.primaryButton} onPress={completeCurrentSet}>
                <Text style={styles.primaryButtonText}>Completar serie</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      {nextRoutine ? (
        <View style={styles.hero}>
          <Text style={styles.sectionLabel}>Rutina sugerida</Text>
          <Text style={styles.h1}>{nextRoutine.name}</Text>
          <Text style={styles.heroCopy}>{nextRoutine.focus}</Text>
          <Pressable style={styles.primaryButton} onPress={() => startRoutine(nextRoutine)}>
            <Text style={styles.primaryButtonText}>Empezar entrenamiento</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.hero}>
          <Text style={styles.sectionLabel}>Rutina sugerida</Text>
          <Text style={styles.h1}>Sin rutinas</Text>
          <Text style={styles.heroCopy}>Crea una rutina desde la pestaña Rutinas para empezar.</Text>
        </View>
      )}

      <View style={styles.statsRow}>
        <Metric label="Series registradas" value={totalSetsLogged.toString()} />
        <Metric label="Logros" value={achievements.length.toString()} />
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionLabel}>Ultimo logro</Text>
        <Text style={styles.panelTitle}>{latestAchievement?.title ?? 'Sin logros todavia'}</Text>
        <Text style={styles.muted}>{latestAchievement?.description ?? 'Completa una serie para empezar.'}</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionLabel}>Ejercicios base</Text>
        {exercises.slice(0, 3).map((exercise) => (
          <ExerciseRow key={exercise.id} exercise={exercise} />
        ))}
      </View>
    </View>
  );
}

function WorkoutOverview({
  activeWorkout,
  addSetToExercise,
  completeSetAt,
  deleteSetAt,
  exercises,
  openNoteEditor,
  openSetEditor,
  skipExerciseInActiveRoutine,
  uncompleteSetAt,
  updateSetValueAt,
}: {
  activeWorkout: ActiveWorkout;
  addSetToExercise: (exerciseIndex: number) => void;
  completeSetAt: (exerciseIndex: number, setIndex: number) => void;
  deleteSetAt: (exerciseIndex: number, setIndex: number) => void;
  exercises: Exercise[];
  openNoteEditor: (exerciseIndex: number, notes: string) => void;
  openSetEditor: (target: SetEditorTarget) => void;
  skipExerciseInActiveRoutine: (exerciseIndex: number) => void;
  uncompleteSetAt: (exerciseIndex: number, setIndex: number) => void;
  updateSetValueAt: (exerciseIndex: number, setIndex: number, field: 'reps' | 'weightKg', value: string) => void;
}) {
  useStyles();
  const { colors, preferences } = useAppSettings();
  return (
    <View style={styles.stack}>
      {activeWorkout.routine.exercises.map((routineExercise, exerciseIndex) => {
        const exercise = exercises.find((item) => item.id === routineExercise.exerciseId);
        const isCurrentExercise = exerciseIndex === activeWorkout.exerciseIndex;
        const isSkipped = activeWorkout.skippedExerciseIds.includes(routineExercise.id);

        if (isSkipped) {
          return null;
        }

        return (
          <View key={routineExercise.id} style={styles.exercisePanel}>
            <View style={styles.overviewHeader}>
              <View style={styles.headerTitle}>
                <Text style={[styles.overviewExercise, isCurrentExercise && styles.currentOverviewExercise]}>
                  {exercise?.name ?? 'Ejercicio'}
                </Text>
                {!!exercise?.notes && <Text style={styles.generalExerciseNote}>{exercise.notes}</Text>}
                {!!routineExercise.notes && <Text style={styles.routineNote}>{routineExercise.notes}</Text>}
                <Pressable
                  style={styles.noteAction}
                  onPress={() => openNoteEditor(exerciseIndex, routineExercise.notes ?? '')}
                >
                  <MaterialIcons color={colors.primary} name={routineExercise.notes ? 'edit-note' : 'note-add'} size={18} />
                  <Text style={styles.noteActionText}>{routineExercise.notes ? 'Editar nota' : 'Añadir nota'}</Text>
                </Pressable>
                <Text style={styles.overviewRest}>Descanso: {formatRestTime(routineExercise.restSeconds)}</Text>
              </View>
              <Pressable style={styles.skipExerciseButton} onPress={() => skipExerciseInActiveRoutine(exerciseIndex)}>
                <Text style={styles.skipExerciseButtonText}>Saltar</Text>
              </Pressable>
            </View>
            <View style={styles.setTableHeader}>
              <Text style={styles.setColumnSmall}>Serie</Text>
              <Text style={styles.setColumn}>{preferences.weightUnit}</Text>
              <Text style={styles.setColumn}>Reps</Text>
              <Text style={styles.setColumnSmall}>OK</Text>
            </View>
            <View>
              {routineExercise.sets.map((set, setIndex) => {
                const setKey = `${routineExercise.id}:${set.id}`;
                const isDone = activeWorkout.completedSetIds.includes(setKey);
                const isCurrent = isCurrentExercise && setIndex === activeWorkout.setIndex;
                const input = activeWorkout.inputs[setKey];
                return (
                  <View
                    key={set.id}
                    style={[
                      styles.setRow,
                      isDone && styles.completedSetRow,
                      isCurrent && !isDone && styles.currentSetRow,
                    ]}
                  >
                    <Pressable style={styles.setKindButton} onPress={() => openSetEditor({ exerciseIndex, setIndex })}>
                      <Text
                        style={[
                          styles.setColumnSmallValue,
                          getSetKindTextStyle(set.kind),
                          isDone && set.kind === 'normal' && styles.completedSetText,
                        ]}
                      >
                        {getSetKindLabel(set.kind, setIndex)}
                      </Text>
                    </Pressable>
                    <TextInput
                      keyboardType="decimal-pad"
                      selectTextOnFocus
                      style={[styles.setCellInput, isDone && styles.completedSetText]}
                      value={
                        input?.weightKg ??
                        (set.targetWeightKg === null ? '' : formatDecimal(displayWeight(set.targetWeightKg, preferences.weightUnit)))
                      }
                      onChangeText={(value) => updateSetValueAt(exerciseIndex, setIndex, 'weightKg', value)}
                    />
                    <TextInput
                      keyboardType="number-pad"
                      selectTextOnFocus
                      style={[styles.setCellInput, isDone && styles.completedSetText]}
                      value={input?.reps ?? set.targetReps?.toString() ?? ''}
                      onChangeText={(value) => updateSetValueAt(exerciseIndex, setIndex, 'reps', value)}
                    />
                    <Pressable
                      style={[styles.checkMarkButton, isDone && styles.checkMarkDone]}
                      onPress={() =>
                        isDone ? uncompleteSetAt(exerciseIndex, setIndex) : completeSetAt(exerciseIndex, setIndex)
                      }
                      onLongPress={() => deleteSetAt(exerciseIndex, setIndex)}
                    >
                      <Text style={[styles.checkMarkText, isDone && styles.checkMarkTextDone]}>✓</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
            <Pressable style={styles.addSetButton} onPress={() => addSetToExercise(exerciseIndex)}>
              <Text style={styles.addSetButtonText}>+ Agregar serie</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

function WorkoutStats({ activeWorkout }: { activeWorkout: ActiveWorkout }) {
  useStyles();
  const { preferences } = useAppSettings();
  const volume = activeWorkout.completedSetIds.reduce((total, setKey) => {
    const input = activeWorkout.inputs[setKey];
    const reps = Number.parseFloat(input?.reps ?? '0');
    const weight = Number.parseFloat((input?.weightKg ?? '0').replace(',', '.'));
    return total + (Number.isFinite(reps) && Number.isFinite(weight) ? reps * weight : 0);
  }, 0);

  return (
    <View style={styles.sessionStats}>
      <Metric label="Duracion" value={formatRestTime(activeWorkout.elapsedSeconds)} />
      <Metric label="Volumen" value={`${Math.round(volume)} ${preferences.weightUnit}`} />
      <Metric label="Series" value={activeWorkout.completedSetIds.length.toString()} />
    </View>
  );
}

function getSetKindTextStyle(kind: SetKind) {
  if (kind === 'drop') {
    return styles.dropSetKind;
  }
  if (kind === 'failure') {
    return styles.failureSetKind;
  }
  if (kind === 'warmup') {
    return styles.warmupSetKind;
  }
  return null;
}

export function RoutineNoteModal({
  close,
  save,
  setTarget,
  target,
}: {
  close: () => void;
  save: () => void;
  setTarget: Dispatch<SetStateAction<{ exerciseIndex: number; notes: string } | null>>;
  target: { exerciseIndex: number; notes: string } | null;
}) {
  useStyles();
  if (!target) {
    return null;
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={close}>
      <View style={styles.modalScrim}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Nota de la rutina</Text>
          <Text style={styles.modalCopy}>Esta indicación solo se aplicará a este ejercicio dentro de esta rutina.</Text>
          <TextInput
            autoFocus
            multiline
            placeholder="Técnica, variante, sensaciones..."
            placeholderTextColor="#7C8797"
            style={[styles.editorInput, styles.editorTextArea]}
            value={target.notes}
            onChangeText={(notes) => setTarget((current) => (current ? { ...current, notes } : current))}
          />
          <View style={styles.modalActions}>
            <Pressable style={styles.modalSecondary} onPress={close}>
              <Text style={styles.modalSecondaryText}>Cancelar</Text>
            </Pressable>
            <Pressable style={styles.modalPrimary} onPress={save}>
              <Text style={styles.modalPrimaryText}>Guardar</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function SetKindModal({
  close,
  deleteSetAt,
  target,
  updateSetKindAt,
  workout,
}: {
  close: () => void;
  deleteSetAt: (exerciseIndex: number, setIndex: number) => void;
  target: SetEditorTarget;
  updateSetKindAt: (exerciseIndex: number, setIndex: number, kind: SetKind) => void;
  workout: ActiveWorkout | null;
}) {
  useStyles();
  if (!target || !workout) {
    return null;
  }

  const set = workout.routine.exercises[target.exerciseIndex]?.sets[target.setIndex];
  if (!set) {
    return null;
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={close}>
      <View style={styles.modalScrim}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Tipo de serie</Text>
          <Text style={styles.modalCopy}>Cambia el tipo de la serie o elimínala de la rutina actual.</Text>
          <View style={styles.kindOptions}>
            <KindOption
              active={set.kind === 'normal'}
              label="Normal"
              onPress={() => updateSetKindAt(target.exerciseIndex, target.setIndex, 'normal')}
            />
            <KindOption
              active={set.kind === 'drop'}
              label="Drop"
              onPress={() => updateSetKindAt(target.exerciseIndex, target.setIndex, 'drop')}
            />
            <KindOption
              active={set.kind === 'failure'}
              label="Fallo"
              onPress={() => updateSetKindAt(target.exerciseIndex, target.setIndex, 'failure')}
            />
            <KindOption
              active={set.kind === 'warmup'}
              label="Warmup"
              onPress={() => updateSetKindAt(target.exerciseIndex, target.setIndex, 'warmup')}
            />
          </View>
          <View style={styles.modalActions}>
            <Pressable style={styles.modalSecondary} onPress={close}>
              <Text style={styles.modalSecondaryText}>Cancelar</Text>
            </Pressable>
            <Pressable style={styles.modalDanger} onPress={() => deleteSetAt(target.exerciseIndex, target.setIndex)}>
              <Text style={styles.modalDangerText}>Eliminar</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ActualInput({ label, onChangeText, value }: { label: string; onChangeText: (value: string) => void; value: string }) { useStyles(); return <View style={styles.actualInputBox}><Text style={styles.actualInputLabel}>{label}</Text><TextInput keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#65717A" selectTextOnFocus style={styles.actualInput} value={value} onChangeText={onChangeText} /></View>; }
function Metric({ label, value }: { label: string; value: string }) { useStyles(); return <View style={styles.metric}><Text adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={1} style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
function SegmentButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) { useStyles(); return <Pressable style={[styles.segmentButton, active && styles.activeSegment]} onPress={onPress}><Text style={[styles.segmentText, active && styles.activeSegmentText]}>{label}</Text></Pressable>; }
function KindOption({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) { useStyles(); return <Pressable style={[styles.kindOption, active && styles.kindOptionActive]} onPress={onPress}><Text style={[styles.kindOptionText, active && styles.kindOptionTextActive]}>{label}</Text></Pressable>; }

import { MaterialIcons } from '@expo/vector-icons';
import { Dispatch, SetStateAction, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, Vibration, View } from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator, ShadowDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAppSettings } from '../../application/AppSettingsContext';
import { Exercise, RoutineCollection, RoutineExercise, RoutineSet, SetKind, Weekday } from '../../domain/types';
import { displayWeight, formatDecimal, weightToKg } from '../../domain/units';
import { MultiOptionGrid, RestTimeInput } from '../../ui/FormControls';
import { weekdayLabels } from '../../ui/labels';
import { createStyles } from '../../ui/legacyStyles';
import { darkTheme } from '../../ui/theme';
import { getNextSetKind, getSetKindLabel, weekdayOptions } from '../../workout/routineUtils';

export type RoutineDraft = { id?: string; name: string; focus: string; preferredDays: Weekday[]; collection: string; exercises: RoutineExercise[] };
let styles = createStyles(darkTheme);
function useStyles() { const { colors } = useAppSettings(); styles = useMemo(() => createStyles(colors), [colors]); return styles; }

function getSetKindTextStyle(kind: SetKind) {
  if (kind === 'drop') return styles.dropSetKind;
  if (kind === 'failure') return styles.failureSetKind;
  if (kind === 'warmup') return styles.warmupSetKind;
  return null;
}

function KindOption({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  useStyles();
  return (
    <Pressable style={[styles.kindOption, active && styles.kindOptionActive]} onPress={onPress}>
      <Text style={[styles.kindOptionText, active && styles.kindOptionTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function RoutineEditorModal({
  close,
  collections,
  deleteRoutine,
  draft,
  exercises,
  openExerciseEditor,
  save,
  setDraft,
}: {
  close: () => void;
  collections: RoutineCollection[];
  deleteRoutine: (routineId: string) => void;
  draft: RoutineDraft | null;
  exercises: Exercise[];
  openExerciseEditor: () => void;
  save: () => void;
  setDraft: Dispatch<SetStateAction<RoutineDraft | null>>;
}) {
  const { colors, preferences } = useAppSettings();
  const [collapsedExerciseIds, setCollapsedExerciseIds] = useState<string[]>([]);

  if (!draft) {
    return null;
  }
  const availableExercises = exercises.filter(
    (exercise) =>
      !exercise.archivedAt && !draft.exercises.some((routineExercise) => routineExercise.exerciseId === exercise.id),
  );

  function updateRoutineExercise(index: number, patch: Partial<RoutineExercise>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            exercises: current.exercises.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
          }
        : current,
    );
  }

  function addExerciseToRoutine(exercise: Exercise) {
    const routineExercise: RoutineExercise = {
      id: `routine-exercise-${Date.now()}`,
      exerciseId: exercise.id,
      notes: '',
      restSeconds: 90,
      sets: [{ id: `set-${Date.now()}`, kind: 'normal', targetReps: 10, targetWeightKg: 0 }],
    };
    setDraft((current) => (current ? { ...current, exercises: [...current.exercises, routineExercise] } : current));
  }

  function moveExercise(index: number, direction: -1 | 1) {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= current.exercises.length) {
        return current;
      }
      const nextExercises = [...current.exercises];
      const [moved] = nextExercises.splice(index, 1);
      nextExercises.splice(targetIndex, 0, moved);
      return { ...current, exercises: nextExercises };
    });
  }

  function reorderExercises(nextExercises: RoutineExercise[]) {
    setDraft((current) => (current ? { ...current, exercises: nextExercises } : current));
  }

  function removeExerciseFromRoutine(index: number) {
    setDraft((current) =>
      current ? { ...current, exercises: current.exercises.filter((_, itemIndex) => itemIndex !== index) } : current,
    );
  }

  function updateSet(exerciseIndex: number, setIndex: number, patch: Partial<RoutineSet>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            exercises: current.exercises.map((routineExercise, routineExerciseIndex) =>
              routineExerciseIndex === exerciseIndex
                ? {
                    ...routineExercise,
                    sets: routineExercise.sets.map((set, setMapIndex) =>
                      setMapIndex === setIndex ? { ...set, ...patch } : set,
                    ),
                  }
                : routineExercise,
            ),
          }
        : current,
    );
  }

  function addRoutineSet(exerciseIndex: number) {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      const routineExercise = current.exercises[exerciseIndex];
      const previous = routineExercise.sets[routineExercise.sets.length - 1];
      return {
        ...current,
        exercises: current.exercises.map((item, index) =>
          index === exerciseIndex
            ? { ...item, sets: [...item.sets, { ...previous, id: `set-${Date.now()}` }] }
            : item,
        ),
      };
    });
  }

  function removeRoutineSet(exerciseIndex: number, setIndex: number) {
    setDraft((current) =>
      current
        ? {
            ...current,
            exercises: current.exercises.map((item, index) =>
              index === exerciseIndex && item.sets.length > 1
                ? { ...item, sets: item.sets.filter((_, removeIndex) => removeIndex !== setIndex) }
                : item,
            ),
          }
        : current,
    );
  }

  function toggleExerciseCollapsed(routineExerciseId: string) {
    setCollapsedExerciseIds((current) =>
      current.includes(routineExerciseId)
        ? current.filter((id) => id !== routineExerciseId)
        : [...current, routineExerciseId],
    );
  }

  return (
    <Modal transparent animationType="slide" visible onRequestClose={close}>
      <GestureHandlerRootView style={styles.gestureRoot}>
        <View style={styles.modalScrim}>
          <DraggableFlatList
            activationDistance={12}
            animationConfig={{
              damping: 28,
              energyThreshold: 0.001,
              mass: 0.15,
              overshootClamping: true,
              stiffness: 260,
            }}
            containerStyle={styles.editorCard}
            contentContainerStyle={styles.editorContent}
            data={draft.exercises}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={
            <>
              <Text style={styles.modalTitle}>{draft.id ? 'Editar rutina' : 'Nueva rutina'}</Text>
              <TextInput
                placeholder="Nombre"
                placeholderTextColor="#7C8797"
                style={styles.editorInput}
                value={draft.name}
                onChangeText={(name) => setDraft((current) => (current ? { ...current, name } : current))}
              />
              <TextInput
                placeholder="Foco de la rutina"
                placeholderTextColor="#7C8797"
                style={styles.editorInput}
                value={draft.focus}
                onChangeText={(focus) => setDraft((current) => (current ? { ...current, focus } : current))}
              />
              <Text style={styles.editorLabel}>Colección</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                <KindOption active={!draft.collection} label="Sin colección" onPress={() => setDraft((current) => current ? { ...current, collection: '' } : current)} />
                {collections.filter((collection) => !collection.archivedAt).map((collection) => (
                  <KindOption key={collection.id} active={draft.collection === collection.name} label={collection.name} onPress={() => setDraft((current) => current ? { ...current, collection: collection.name } : current)} />
                ))}
              </ScrollView>
              <Text style={styles.editorLabel}>Días sugeridos</Text>
              <MultiOptionGrid
                options={weekdayOptions}
                labels={weekdayLabels}
                value={draft.preferredDays}
                onChange={(preferredDays) => setDraft((current) => (current ? { ...current, preferredDays } : current))}
              />

              <Text style={styles.editorLabel}>Añadir ejercicios</Text>
              <Pressable style={styles.secondaryButton} onPress={openExerciseEditor}>
                <Text style={styles.secondaryButtonText}>Crear ejercicio nuevo</Text>
              </Pressable>
              <ScrollView style={styles.exercisePicker} nestedScrollEnabled>
                {availableExercises.map((exercise) => (
                  <Pressable key={exercise.id} style={styles.exercisePickRow} onPress={() => addExerciseToRoutine(exercise)}>
                    <Text style={styles.exercisePickName}>{exercise.name}</Text>
                    <Text style={styles.badge}>Añadir</Text>
                  </Pressable>
                ))}
                {!availableExercises.length && (
                  <Text style={styles.emptyText}>Todos los ejercicios disponibles están añadidos.</Text>
                )}
              </ScrollView>

              <Text style={styles.editorLabel}>Rutina</Text>
            </>
            }
            ListFooterComponent={
            <>
              <View style={styles.modalActions}>
                <Pressable style={styles.modalSecondary} onPress={close}>
                  <Text style={styles.modalSecondaryText}>Cancelar</Text>
                </Pressable>
                <Pressable style={styles.modalPrimary} onPress={save}>
                  <Text style={styles.modalPrimaryText}>Guardar</Text>
                </Pressable>
              </View>
              {draft.id && (
                <Pressable style={styles.fullWidthDanger} onPress={() => deleteRoutine(draft.id!)}>
                  <Text style={styles.modalDangerText}>Eliminar rutina</Text>
                </Pressable>
              )}
            </>
            }
            onDragEnd={({ data }) => reorderExercises(data)}
            renderItem={({
            item: routineExercise,
            drag,
            isActive,
            getIndex,
          }: RenderItemParams<RoutineExercise>) => {
            const exerciseIndex = getIndex() ?? 0;
            const exercise = exercises.find((item) => item.id === routineExercise.exerciseId);
            const isCollapsed = collapsedExerciseIds.includes(routineExercise.id);
            return (
              <ScaleDecorator activeScale={1.015}>
                <ShadowDecorator elevation={16} opacity={0.32} radius={12}>
                  <View style={[styles.routineEditorBlock, isActive && styles.routineEditorBlockDragging]}>
                    <Pressable
                  accessibilityLabel={`${isCollapsed ? 'Desplegar' : 'Plegar'} ${exercise?.name ?? 'ejercicio'}`}
                  accessibilityHint="Mantén pulsado para cambiar su posición"
                  accessibilityRole="button"
                  accessibilityState={{ expanded: !isCollapsed }}
                  delayLongPress={250}
                  disabled={isActive}
                  style={styles.routineEditorTitleRow}
                  onLongPress={() => {
                    Vibration.vibrate(30);
                    drag();
                  }}
                  onPress={() => {
                    if (!isActive) {
                      toggleExerciseCollapsed(routineExercise.id);
                    }
                  }}
                    >
                      <MaterialIcons
                        color={colors.primary}
                        name={isCollapsed ? 'chevron-right' : 'expand-more'}
                        size={24}
                      />
                      <View style={styles.headerTitle}>
                        <Text style={styles.exerciseRowName}>{exercise?.name ?? 'Ejercicio'}</Text>
                        <Text style={styles.muted}>{routineExercise.sets.length} series</Text>
                      </View>
                    </Pressable>
                    <View style={styles.routineEditorControls}>
                      <Pressable
                    accessibilityLabel="Subir ejercicio"
                    accessibilityRole="button"
                    disabled={exerciseIndex === 0}
                    style={[styles.smallSquareButton, exerciseIndex === 0 && styles.controlButtonDisabled]}
                    onPress={() => moveExercise(exerciseIndex, -1)}
                      >
                        <Text style={styles.smallSquareButtonText}>↑</Text>
                      </Pressable>
                      <Pressable
                    accessibilityLabel="Bajar ejercicio"
                    accessibilityRole="button"
                    disabled={exerciseIndex === draft.exercises.length - 1}
                    style={[
                      styles.smallSquareButton,
                      exerciseIndex === draft.exercises.length - 1 && styles.controlButtonDisabled,
                    ]}
                    onPress={() => moveExercise(exerciseIndex, 1)}
                      >
                        <Text style={styles.smallSquareButtonText}>↓</Text>
                      </Pressable>
                      <Pressable
                    accessibilityLabel="Eliminar ejercicio de la rutina"
                    accessibilityRole="button"
                    style={styles.smallSquareButton}
                    onPress={() => removeExerciseFromRoutine(exerciseIndex)}
                      >
                        <Text style={styles.smallSquareButtonText}>×</Text>
                      </Pressable>
                    </View>
                    {!isCollapsed && (
                      <>
                    <TextInput
                      multiline
                      placeholder="Notas para este ejercicio en la rutina"
                      placeholderTextColor="#7C8797"
                      style={[styles.editorInput, styles.editorTextArea]}
                      value={routineExercise.notes ?? ''}
                      onChangeText={(notes) => updateRoutineExercise(exerciseIndex, { notes })}
                    />
                    <RestTimeInput
                      restSeconds={routineExercise.restSeconds}
                      onChange={(restSeconds) => updateRoutineExercise(exerciseIndex, { restSeconds })}
                    />
                    <View style={styles.routineSetHeader}>
                      <Text style={styles.routineSetIndexHeader}>Tipo</Text>
                      <Text style={styles.routineSetColumnHeader}>{preferences.weightUnit}</Text>
                      <Text style={styles.routineSetColumnHeader}>Reps</Text>
                      <Text style={styles.routineSetActionHeader}>Del</Text>
                    </View>
                    {routineExercise.sets.map((set, setIndex) => (
                      <View key={set.id} style={styles.routineSetEditorRow}>
                        <Pressable
                          style={styles.routineSetKindButton}
                          onPress={() => updateSet(exerciseIndex, setIndex, { kind: getNextSetKind(set.kind) })}
                        >
                          <Text style={[styles.routineSetIndex, getSetKindTextStyle(set.kind)]}>
                            {getSetKindLabel(set.kind, setIndex)}
                          </Text>
                        </Pressable>
                        <TextInput
                          keyboardType="decimal-pad"
                          placeholder={preferences.weightUnit}
                          placeholderTextColor="#7C8797"
                          style={styles.routineSetInput}
                          value={set.targetWeightKg === null ? '' : formatDecimal(displayWeight(set.targetWeightKg, preferences.weightUnit))}
                          onChangeText={(targetWeight) =>
                            updateSet(exerciseIndex, setIndex, {
                              targetWeightKg: weightToKg(
                                Number.parseFloat(targetWeight.replace(',', '.')) || 0,
                                preferences.weightUnit,
                              ),
                            })
                          }
                        />
                        <TextInput
                          keyboardType="number-pad"
                          placeholder="Reps"
                          placeholderTextColor="#7C8797"
                          style={styles.routineSetInput}
                          value={set.targetReps?.toString() ?? ''}
                          onChangeText={(targetReps) =>
                            updateSet(exerciseIndex, setIndex, { targetReps: targetReps.trim() ? Number.parseInt(targetReps, 10) || 0 : null })
                          }
                        />
                        <Pressable style={styles.smallSquareButton} onPress={() => removeRoutineSet(exerciseIndex, setIndex)}>
                          <Text style={styles.smallSquareButtonText}>×</Text>
                        </Pressable>
                      </View>
                    ))}
                    <Pressable style={styles.addSetButton} onPress={() => addRoutineSet(exerciseIndex)}>
                      <Text style={styles.addSetButtonText}>+ Agregar serie</Text>
                    </Pressable>
                      </>
                    )}
                  </View>
                </ShadowDecorator>
              </ScaleDecorator>
            );
            }}
          />
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

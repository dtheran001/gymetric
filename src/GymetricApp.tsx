import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as NavigationBar from 'expo-navigation-bar';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { Dispatch, SetStateAction, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AppState,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  Vibration,
  View,
} from 'react-native';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { seedAchievements, seedExercises, seedLogs, seedRoutines } from './data/seed';
import { loadPersistedData, PersistedData, savePersistedData } from './data/storage';
import {
  calculateBmi,
  estimateHeightForBmi,
  formatMeasurementDate,
  getBmiSummary,
  getBodyFatSummary,
  getBoneSummary,
  getLatestMeasurement,
  getMuscleSummary,
  getWaterSummary,
} from './domain/bodyProgress';
import { buildAchievement, formatRestTime, getPersonalBest } from './domain/progress';
import {
  Achievement,
  BodyMeasurement,
  BodyProfile,
  EquipmentKind,
  Exercise,
  GripKind,
  MovementFocus,
  MuscleGroup,
  ProgressPhoto,
  Routine,
  RoutineExercise,
  RoutineSet,
  SetKind,
  SetLog,
  Weekday,
} from './domain/types';
import { MultiOptionGrid, OptionGrid, RestTimeInput } from './ui/FormControls';
import { equipmentLabels, gripLabels, movementLabels, muscleLabels, weekdayLabels } from './ui/labels';
import {
  estimateRoutineMinutes,
  getNextSetKind,
  getSetKindLabel,
  getTodayWeekday,
  weekdayOptions,
} from './workout/routineUtils';
import { ActiveWorkout, ActualSetInput, SetEditorTarget, Tab, WorkoutSummary, WorkoutView } from './workout/sessionTypes';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type ExerciseDraft = {
  id?: string;
  name: string;
  muscleGroup: MuscleGroup;
  equipmentKind: EquipmentKind;
  equipment: string;
  grip: GripKind;
  movementFocus: MovementFocus;
  notes: string;
};

type RoutineDraft = {
  id?: string;
  name: string;
  focus: string;
  preferredDays: Weekday[];
  exercises: RoutineExercise[];
};

type BodyProfileDraft = {
  heightCm: string;
  age: string;
  sex: 'male' | 'female';
};

type BodyMeasurementDraft = {
  weightKg: string;
  bodyFatPct: string;
  musclePct: string;
  bonePct: string;
  waterPct: string;
};

const muscleOptions: MuscleGroup[] = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core'];
const equipmentOptions: EquipmentKind[] = ['machine', 'free_weight', 'barbell', 'dumbbell', 'cable', 'bodyweight', 'other'];
const gripOptions: GripKind[] = ['none', 'prone', 'supine', 'neutral', 'mixed'];
const movementOptions: MovementFocus[] = ['none', 'concentric', 'eccentric', 'tempo'];

export default function App() {
  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <SafeAreaProvider>
        <GymetricApp />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function GymetricApp() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('today');
  const [exercises, setExercises] = useState(seedExercises);
  const [routines, setRoutines] = useState(seedRoutines);
  const [logs, setLogs] = useState(seedLogs);
  const [achievements, setAchievements] = useState(seedAchievements);
  const [bodyProfile, setBodyProfile] = useState<BodyProfile | null>(null);
  const [bodyMeasurements, setBodyMeasurements] = useState<BodyMeasurement[]>([]);
  const [progressPhotos, setProgressPhotos] = useState<ProgressPhoto[]>([]);
  const [activeWorkout, setActiveWorkout] = useState<ActiveWorkout | null>(null);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [setEditorTarget, setSetEditorTarget] = useState<SetEditorTarget>(null);
  const [exerciseDraft, setExerciseDraft] = useState<ExerciseDraft | null>(null);
  const [routineDraft, setRoutineDraft] = useState<RoutineDraft | null>(null);
  const [bodyProfileDraft, setBodyProfileDraft] = useState<BodyProfileDraft | null>(null);
  const [bodyMeasurementDraft, setBodyMeasurementDraft] = useState<BodyMeasurementDraft | null>(null);
  const [selectedProgressPhoto, setSelectedProgressPhoto] = useState<ProgressPhoto | null>(null);
  const [workoutSummary, setWorkoutSummary] = useState<WorkoutSummary | null>(null);
  const [lastBackPressAt, setLastBackPressAt] = useState(0);
  const [isStorageReady, setIsStorageReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  const todayWeekday = getTodayWeekday();
  const suggestedRoutines = routines.filter((routine) => routine.preferredDays?.includes(todayWeekday));
  const nextRoutine = suggestedRoutines[0] ?? routines[0];
  const totalSetsLogged = logs.length;
  const latestAchievement = achievements[0];

  function buildPersistedData(overrides: Partial<PersistedData> = {}): PersistedData {
    return {
      exercises,
      routines,
      logs,
      achievements,
      bodyProfile,
      bodyMeasurements,
      progressPhotos,
      ...overrides,
    };
  }

  function persistData(overrides: Partial<PersistedData> = {}) {
    savePersistedData(buildPersistedData(overrides))
      .then(() => setStorageError(null))
      .catch((error: unknown) => {
        setStorageError(error instanceof Error ? error.message : 'No se pudo guardar SQLite.');
      });
  }

  useEffect(() => {
    Notifications.requestPermissionsAsync();
    if (Platform.OS === 'android') {
      NavigationBar.setBackgroundColorAsync('#0B1115').catch(() => {});
      NavigationBar.setBorderColorAsync('#0B1115').catch(() => {});
      NavigationBar.setButtonStyleAsync('light').catch(() => {});
      Notifications.setNotificationChannelAsync('rest-timer', {
        name: 'Descansos',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
      });
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    loadPersistedData()
      .then((data) => {
        if (!isMounted) {
          return;
        }
        setExercises(data.exercises);
        setRoutines(data.routines);
        setLogs(data.logs);
        setAchievements(data.achievements);
        setBodyProfile(data.bodyProfile);
        setBodyMeasurements(data.bodyMeasurements);
        setProgressPhotos(data.progressPhotos);
        setStorageError(null);
        setIsStorageReady(true);
      })
      .catch((error: unknown) => {
        if (!isMounted) {
          return;
        }
        setStorageError(error instanceof Error ? error.message : 'No se pudo cargar SQLite.');
        setIsStorageReady(true);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isStorageReady) {
      return;
    }

    savePersistedData(buildPersistedData())
      .then(() => setStorageError(null))
      .catch((error: unknown) => {
        setStorageError(error instanceof Error ? error.message : 'No se pudo guardar SQLite.');
      });
  }, [achievements, bodyMeasurements, bodyProfile, exercises, isStorageReady, logs, progressPhotos, routines]);

  useEffect(() => {
    if (!activeWorkout?.isResting || !activeWorkout.restEndsAt) {
      return;
    }

    const interval = setInterval(() => syncRestClock(), 1000);
    return () => clearInterval(interval);
  }, [activeWorkout?.isResting, activeWorkout?.restEndsAt]);

  useEffect(() => {
    if (!activeWorkout) {
      return;
    }

    const interval = setInterval(() => {
      setActiveWorkout((current) =>
        current ? { ...current, elapsedSeconds: Math.floor((Date.now() - current.startedAt) / 1000) } : current,
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [activeWorkout?.startedAt]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        syncRestClock();
      }
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (setEditorTarget) {
        setSetEditorTarget(null);
        return true;
      }
      if (showFinishConfirm) {
        setShowFinishConfirm(false);
        return true;
      }
      if (exerciseDraft) {
        setExerciseDraft(null);
        return true;
      }
      if (routineDraft) {
        setRoutineDraft(null);
        return true;
      }
      if (bodyMeasurementDraft) {
        setBodyMeasurementDraft(null);
        return true;
      }
      if (bodyProfileDraft) {
        setBodyProfileDraft(null);
        return true;
      }
      if (selectedProgressPhoto) {
        setSelectedProgressPhoto(null);
        return true;
      }
      if (tab !== 'today') {
        setTab('today');
        return true;
      }

      const now = Date.now();
      if (now - lastBackPressAt < 1800) {
        return false;
      }

      setLastBackPressAt(now);
      ToastAndroid.show('Pulsa atrás otra vez para salir', ToastAndroid.SHORT);
      return true;
    });

    return () => subscription.remove();
  }, [
    bodyMeasurementDraft,
    bodyProfileDraft,
    exerciseDraft,
    lastBackPressAt,
    routineDraft,
    selectedProgressPhoto,
    setEditorTarget,
    showFinishConfirm,
    tab,
  ]);

  function getSetKey(routine: Routine, exerciseIndex: number, setIndex: number) {
    const routineExercise = routine.exercises[exerciseIndex];
    const routineSet = routineExercise.sets[setIndex];
    return `${routineExercise.id}:${routineSet.id}`;
  }

  function buildInputs(routine: Routine): ActualSetInput {
    return routine.exercises.reduce<ActualSetInput>((inputMap, routineExercise, exerciseIndex) => {
      routineExercise.sets.forEach((set, setIndex) => {
        inputMap[getSetKey(routine, exerciseIndex, setIndex)] = {
          reps: set.targetReps.toString(),
          weightKg: set.targetWeightKg.toString(),
        };
      });
      return inputMap;
    }, {});
  }

  function syncRestClock() {
    setActiveWorkout((current) => {
      if (!current?.isResting || !current.restEndsAt) {
        return current;
      }

      const remaining = Math.max(Math.ceil((current.restEndsAt - Date.now()) / 1000), 0);
      if (remaining > 0) {
        return { ...current, restRemaining: remaining };
      }

      Vibration.vibrate([0, 250, 120, 250]);
      ToastAndroid.show('Descanso terminado', ToastAndroid.SHORT);
      return { ...current, restRemaining: 0, restEndsAt: null, restNotificationId: null, isResting: false };
    });
  }

  async function scheduleRestNotification(seconds: number) {
    const permissions = await Notifications.getPermissionsAsync();
    if (!permissions.granted) {
      return null;
    }

    return Notifications.scheduleNotificationAsync({
      content: {
        title: 'Descanso terminado',
        body: 'Ya puedes empezar la siguiente serie.',
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(seconds, 1),
        channelId: 'rest-timer',
      },
    });
  }

  function cancelRestNotification(notificationId: string | null) {
    if (notificationId) {
      Notifications.cancelScheduledNotificationAsync(notificationId);
    }
  }

  function startRoutine(routine?: Routine) {
    if (!routine) {
      return;
    }

    const startedAt = Date.now();
    setActiveWorkout({
      routine,
      exerciseIndex: 0,
      setIndex: 0,
      restRemaining: 0,
      restEndsAt: null,
      restNotificationId: null,
      isResting: false,
      completedSetIds: [],
      completedLogIds: {},
      completedAchievementIds: {},
      pendingLogs: {},
      pendingAchievements: {},
      skippedExerciseIds: [],
      inputs: buildInputs(routine),
      view: 'focus',
      startedAt,
      elapsedSeconds: 0,
    });
    setTab('today');
  }

  function requestFinishRoutine() {
    setShowFinishConfirm(true);
  }

  function finishRoutineEarly() {
    cancelRestNotification(activeWorkout?.restNotificationId ?? null);
    setShowFinishConfirm(false);
    setActiveWorkout(null);
  }

  function completeCurrentSet() {
    if (!activeWorkout) {
      return;
    }

    completeSetAt(activeWorkout.exerciseIndex, activeWorkout.setIndex);
  }

  function getNextOpenSet(workout: ActiveWorkout, completedSetIds: string[], fromExerciseIndex: number, fromSetIndex: number) {
    for (let exerciseIndex = fromExerciseIndex; exerciseIndex < workout.routine.exercises.length; exerciseIndex += 1) {
      const routineExercise = workout.routine.exercises[exerciseIndex];
      const firstSet = exerciseIndex === fromExerciseIndex ? fromSetIndex + 1 : 0;
      for (let setIndex = firstSet; setIndex < routineExercise.sets.length; setIndex += 1) {
        if (
          !workout.skippedExerciseIds.includes(routineExercise.id) &&
          !completedSetIds.includes(getSetKey(workout.routine, exerciseIndex, setIndex))
        ) {
          return { exerciseIndex, setIndex };
        }
      }
    }

    for (let exerciseIndex = 0; exerciseIndex < workout.routine.exercises.length; exerciseIndex += 1) {
      const routineExercise = workout.routine.exercises[exerciseIndex];
      for (let setIndex = 0; setIndex < routineExercise.sets.length; setIndex += 1) {
        if (
          !workout.skippedExerciseIds.includes(routineExercise.id) &&
          !completedSetIds.includes(getSetKey(workout.routine, exerciseIndex, setIndex))
        ) {
          return { exerciseIndex, setIndex };
        }
      }
    }

    return null;
  }

  async function completeSetAt(exerciseIndex: number, setIndex: number) {
    if (!activeWorkout) {
      return;
    }

    const setKey = getSetKey(activeWorkout.routine, exerciseIndex, setIndex);
    if (activeWorkout.completedSetIds.includes(setKey)) {
      return;
    }

    const selectedRoutineExercise = activeWorkout.routine.exercises[exerciseIndex];
    if (activeWorkout.skippedExerciseIds.includes(selectedRoutineExercise.id)) {
      return;
    }
    const routineSet = selectedRoutineExercise.sets[setIndex];
    const selectedExercise = exercises.find((item) => item.id === selectedRoutineExercise.exerciseId);

    if (!selectedExercise) {
      return;
    }

    const actualInput = activeWorkout.inputs[setKey];
    const actualReps = Number.parseInt(actualInput?.reps ?? '', 10);
    const actualWeight = Number.parseFloat((actualInput?.weightKg ?? '').replace(',', '.'));
    const reps = Number.isFinite(actualReps) ? actualReps : routineSet.targetReps;
    const weightKg = Number.isFinite(actualWeight) ? actualWeight : routineSet.targetWeightKg;
    const completedAt = new Date().toISOString();
    const previousBest = getPersonalBest(logs, selectedExercise.id);
    const logId = `log-${completedAt}`;
    const log: SetLog = {
      id: logId,
      exerciseId: selectedExercise.id,
      routineId: activeWorkout.routine.id,
      reps,
      weightKg,
      kind: routineSet.kind,
      completedAt,
    };
    const achievement = buildAchievement(previousBest, log, selectedExercise);

    const completedSetIds = [...activeWorkout.completedSetIds, setKey];
    const nextPosition = getNextOpenSet(activeWorkout, completedSetIds, exerciseIndex, setIndex);
    const completedLogIds = { ...activeWorkout.completedLogIds, [setKey]: logId };
    const completedAchievementIds = achievement
      ? { ...activeWorkout.completedAchievementIds, [setKey]: achievement.id }
      : activeWorkout.completedAchievementIds;
    const pendingLogs = { ...activeWorkout.pendingLogs, [setKey]: log };
    const pendingAchievements = achievement
      ? { ...activeWorkout.pendingAchievements, [setKey]: achievement }
      : activeWorkout.pendingAchievements;

    if (!nextPosition) {
      setWorkoutSummary({
        routine: activeWorkout.routine,
        completedSetIds,
        inputs: activeWorkout.inputs,
        logs: Object.values(pendingLogs),
        achievements: Object.values(pendingAchievements),
        elapsedSeconds: activeWorkout.elapsedSeconds,
      });
      setActiveWorkout(null);
      return;
    }

    const notificationId = await scheduleRestNotification(selectedRoutineExercise.restSeconds);

    setActiveWorkout({
      ...activeWorkout,
      ...nextPosition,
      completedSetIds,
      completedLogIds,
      completedAchievementIds,
      pendingLogs,
      pendingAchievements,
      restRemaining: selectedRoutineExercise.restSeconds,
      restEndsAt: Date.now() + selectedRoutineExercise.restSeconds * 1000,
      restNotificationId: notificationId,
      isResting: true,
    });
  }

  function uncompleteSetAt(exerciseIndex: number, setIndex: number) {
    if (!activeWorkout) {
      return;
    }

    const setKey = getSetKey(activeWorkout.routine, exerciseIndex, setIndex);
    setActiveWorkout({
      ...activeWorkout,
      exerciseIndex,
      setIndex,
      completedSetIds: activeWorkout.completedSetIds.filter((id) => id !== setKey),
      completedLogIds: Object.fromEntries(
        Object.entries(activeWorkout.completedLogIds).filter(([key]) => key !== setKey),
      ),
      completedAchievementIds: Object.fromEntries(
        Object.entries(activeWorkout.completedAchievementIds).filter(([key]) => key !== setKey),
      ),
      pendingLogs: Object.fromEntries(Object.entries(activeWorkout.pendingLogs).filter(([key]) => key !== setKey)),
      pendingAchievements: Object.fromEntries(
        Object.entries(activeWorkout.pendingAchievements).filter(([key]) => key !== setKey),
      ),
      isResting: false,
      restRemaining: 0,
      restEndsAt: null,
    });
  }

  function skipRest() {
    cancelRestNotification(activeWorkout?.restNotificationId ?? null);
    setActiveWorkout((current) =>
      current ? { ...current, isResting: false, restRemaining: 0, restEndsAt: null, restNotificationId: null } : current,
    );
  }

  async function adjustRest(seconds: number) {
    if (!activeWorkout?.isResting) {
      return;
    }

    const nextRest = Math.max(activeWorkout.restRemaining + seconds, 0);
    if (nextRest === 0) {
      skipRest();
      return;
    }

    cancelRestNotification(activeWorkout.restNotificationId);
    const notificationId = await scheduleRestNotification(nextRest);
    setActiveWorkout({
      ...activeWorkout,
      restRemaining: nextRest,
      restEndsAt: Date.now() + nextRest * 1000,
      restNotificationId: notificationId,
    });
  }

  function updateActualSetValue(field: 'reps' | 'weightKg', value: string) {
    setActiveWorkout((current) => {
      if (!current) {
        return current;
      }

      const setKey = getSetKey(current.routine, current.exerciseIndex, current.setIndex);
      return updateSetInput(current, setKey, field, value);
    });
  }

  function updateSetValueAt(exerciseIndex: number, setIndex: number, field: 'reps' | 'weightKg', value: string) {
    setActiveWorkout((current) => {
      if (!current) {
        return current;
      }

      const setKey = getSetKey(current.routine, exerciseIndex, setIndex);
      return updateSetInput(current, setKey, field, value);
    });
  }

  function updateSetInput(current: ActiveWorkout, setKey: string, field: 'reps' | 'weightKg', value: string) {
    return {
      ...current,
      inputs: {
        ...current.inputs,
        [setKey]: {
          ...current.inputs[setKey],
          [field]: value,
        },
      },
    };
  }

  function addSetToExercise(exerciseIndex: number) {
    setActiveWorkout((current) => {
      if (!current) {
        return current;
      }

      const routineExercise = current.routine.exercises[exerciseIndex];
      const previousSet = routineExercise.sets[routineExercise.sets.length - 1];
      const newSet: RoutineSet = {
        ...previousSet,
        id: `set-${Date.now()}`,
      };
      const nextRoutine = {
        ...current.routine,
        exercises: current.routine.exercises.map((item, index) =>
          index === exerciseIndex ? { ...item, sets: [...item.sets, newSet] } : item,
        ),
      };
      const setKey = `${routineExercise.id}:${newSet.id}`;

      return {
        ...current,
        routine: nextRoutine,
        inputs: {
          ...current.inputs,
          [setKey]: {
            reps: previousSet.targetReps.toString(),
            weightKg: previousSet.targetWeightKg.toString(),
          },
        },
      };
    });
  }

  function deleteSetAt(exerciseIndex: number, setIndex: number) {
    setActiveWorkout((current) => {
      if (!current) {
        return current;
      }

      const routineExercise = current.routine.exercises[exerciseIndex];
      if (routineExercise.sets.length <= 1) {
        return current;
      }

      const setKey = getSetKey(current.routine, exerciseIndex, setIndex);
      const nextRoutine = {
        ...current.routine,
        exercises: current.routine.exercises.map((item, index) =>
          index === exerciseIndex ? { ...item, sets: item.sets.filter((_, indexSet) => indexSet !== setIndex) } : item,
        ),
      };
      const nextInputs = { ...current.inputs };
      delete nextInputs[setKey];
      const logId = current.completedLogIds[setKey];
      const achievementId = current.completedAchievementIds[setKey];
      const nextCompletedLogIds = { ...current.completedLogIds };
      delete nextCompletedLogIds[setKey];
      const nextCompletedAchievementIds = { ...current.completedAchievementIds };
      delete nextCompletedAchievementIds[setKey];
      const nextPendingLogs = { ...current.pendingLogs };
      delete nextPendingLogs[setKey];
      const nextPendingAchievements = { ...current.pendingAchievements };
      delete nextPendingAchievements[setKey];
      const nextSetIndex = Math.min(current.setIndex, nextRoutine.exercises[current.exerciseIndex].sets.length - 1);

      setLogs((logsCurrent) => (logId ? logsCurrent.filter((log) => log.id !== logId) : logsCurrent));
      setAchievements((achievementsCurrent) =>
        achievementId
          ? achievementsCurrent.filter((achievement) => achievement.id !== achievementId)
          : achievementsCurrent,
      );
      setSetEditorTarget(null);
      return {
        ...current,
        routine: nextRoutine,
        setIndex: nextSetIndex,
        inputs: nextInputs,
        completedSetIds: current.completedSetIds.filter((id) => id !== setKey),
        completedLogIds: nextCompletedLogIds,
        completedAchievementIds: nextCompletedAchievementIds,
        pendingLogs: nextPendingLogs,
        pendingAchievements: nextPendingAchievements,
      };
    });
  }

  function updateSetKindAt(exerciseIndex: number, setIndex: number, kind: SetKind) {
    setActiveWorkout((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        routine: {
          ...current.routine,
          exercises: current.routine.exercises.map((exercise, exerciseMapIndex) =>
            exerciseMapIndex === exerciseIndex
              ? {
                  ...exercise,
                  sets: exercise.sets.map((set, setMapIndex) =>
                    setMapIndex === setIndex ? { ...set, kind } : set,
                  ),
                }
              : exercise,
          ),
        },
      };
    });
    setSetEditorTarget(null);
  }

  function setWorkoutView(view: WorkoutView) {
    setActiveWorkout((current) => (current ? { ...current, view } : current));
  }

  function skipExerciseInActiveRoutine(exerciseIndex: number) {
    setActiveWorkout((current) => {
      if (!current) {
        return current;
      }

      const routineExercise = current.routine.exercises[exerciseIndex];
      const skippedExerciseIds = [...current.skippedExerciseIds, routineExercise.id];
      const nextWorkout = { ...current, skippedExerciseIds };
      const nextPosition = getNextOpenSet(nextWorkout, current.completedSetIds, exerciseIndex, -1);

      if (!nextPosition) {
        return null;
      }

      return {
        ...nextWorkout,
        ...nextPosition,
        isResting: false,
        restRemaining: 0,
        restEndsAt: null,
      };
    });
  }

  function openExerciseEditor(exercise?: Exercise) {
    setExerciseDraft({
      id: exercise?.id,
      name: exercise?.name ?? '',
      muscleGroup: exercise?.muscleGroup ?? 'chest',
      equipmentKind: exercise?.equipmentKind ?? 'machine',
      equipment: exercise?.equipment ?? '',
      grip: exercise?.grip ?? 'none',
      movementFocus: exercise?.movementFocus ?? 'none',
      notes: exercise?.notes ?? '',
    });
  }

  function saveExerciseDraft() {
    if (!exerciseDraft?.name.trim()) {
      return;
    }

    const exercise: Exercise = {
      id: exerciseDraft.id ?? `custom-${Date.now()}`,
      name: exerciseDraft.name.trim(),
      muscleGroup: exerciseDraft.muscleGroup,
      equipment: exerciseDraft.equipment.trim() || equipmentLabels[exerciseDraft.equipmentKind],
      equipmentKind: exerciseDraft.equipmentKind,
      grip: exerciseDraft.grip,
      movementFocus: exerciseDraft.movementFocus,
      notes: exerciseDraft.notes.trim(),
      isCustom: true,
    };

    const nextExercises = exercises.some((item) => item.id === exercise.id)
      ? exercises.map((item) => (item.id === exercise.id ? exercise : item))
      : [exercise, ...exercises];

    setExercises(nextExercises);
    persistData({ exercises: nextExercises });
    setExerciseDraft(null);
  }

  function deleteExerciseFromLibrary(exerciseId: string) {
    const nextExercises = exercises.filter((exercise) => exercise.id !== exerciseId);
    const nextRoutines = routines.map((routine) => ({
        ...routine,
        estimatedMinutes: estimateRoutineMinutes(
          routine.exercises.filter((routineExercise) => routineExercise.exerciseId !== exerciseId),
        ),
        exercises: routine.exercises.filter((routineExercise) => routineExercise.exerciseId !== exerciseId),
      }));
    const nextLogs = logs.filter((log) => log.exerciseId !== exerciseId);
    const nextAchievements = achievements.filter((achievement) => achievement.exerciseId !== exerciseId);

    setExercises(nextExercises);
    setRoutines(nextRoutines);
    setRoutineDraft((current) =>
      current
        ? {
            ...current,
            exercises: current.exercises.filter((routineExercise) => routineExercise.exerciseId !== exerciseId),
          }
        : current,
    );
    setLogs(nextLogs);
    setAchievements(nextAchievements);
    persistData({ exercises: nextExercises, routines: nextRoutines, logs: nextLogs, achievements: nextAchievements });
    setExerciseDraft(null);
  }

  function openRoutineEditor(routine?: Routine) {
    setRoutineDraft({
      id: routine?.id,
      name: routine?.name ?? '',
      focus: routine?.focus ?? '',
      preferredDays: routine?.preferredDays ?? [],
      exercises: routine?.exercises.map((routineExercise) => ({
        ...routineExercise,
        sets: routineExercise.sets.map((set) => ({ ...set })),
      })) ?? [],
    });
  }

  function saveRoutineDraft() {
    if (!routineDraft?.name.trim()) {
      return;
    }

    const routine: Routine = {
      id: routineDraft.id ?? `routine-${Date.now()}`,
      name: routineDraft.name.trim(),
      focus: routineDraft.focus.trim() || 'Rutina personalizada',
      estimatedMinutes: estimateRoutineMinutes(routineDraft.exercises),
      preferredDays: routineDraft.preferredDays,
      exercises: routineDraft.exercises,
    };

    const nextRoutines = routines.some((item) => item.id === routine.id)
      ? routines.map((item) => (item.id === routine.id ? routine : item))
      : [routine, ...routines];

    setRoutines(nextRoutines);
    persistData({ routines: nextRoutines });
    setRoutineDraft(null);
  }

  function deleteRoutineFromLibrary(routineId: string) {
    const nextRoutines = routines.filter((routine) => routine.id !== routineId);
    const nextLogs = logs.filter((log) => log.routineId !== routineId);

    setRoutines(nextRoutines);
    setLogs(nextLogs);
    persistData({ routines: nextRoutines, logs: nextLogs });
    setRoutineDraft(null);
  }

  function saveWorkoutSummary() {
    if (!workoutSummary) {
      return;
    }

    const updatedRoutine = applySummaryToRoutine(workoutSummary);
    const nextRoutines = routines.map((routine) => (routine.id === updatedRoutine.id ? updatedRoutine : routine));
    const nextLogs = [...workoutSummary.logs, ...logs];
    const nextAchievements = [...workoutSummary.achievements, ...achievements];

    setRoutines(nextRoutines);
    setLogs(nextLogs);
    setAchievements(nextAchievements);
    persistData({ routines: nextRoutines, logs: nextLogs, achievements: nextAchievements });
    setWorkoutSummary(null);
  }

  function discardWorkoutSummary() {
    setWorkoutSummary(null);
  }

  function openBodyProfileEditor() {
    setBodyProfileDraft({
      heightCm: bodyProfile?.heightCm ? bodyProfile.heightCm.toString() : '',
      age: bodyProfile?.age ? bodyProfile.age.toString() : '',
      sex: bodyProfile?.sex ?? 'male',
    });
  }

  function openBodyMeasurementEditor() {
    setBodyMeasurementDraft({
      weightKg: '',
      bodyFatPct: '',
      musclePct: '',
      bonePct: '',
      waterPct: '',
    });
  }

  function saveBodyProfileDraft() {
    if (!bodyProfileDraft) {
      return;
    }

    const heightCm = Number.parseFloat(bodyProfileDraft.heightCm.replace(',', '.')) || 0;
    const age = Number.parseInt(bodyProfileDraft.age, 10) || 0;

    if (!heightCm || !age) {
      return;
    }

    const nextProfile: BodyProfile = {
      id: 'body-profile',
      heightCm,
      age,
      sex: bodyProfileDraft.sex,
      updatedAt: new Date().toISOString(),
    };

    setBodyProfile(nextProfile);
    persistData({ bodyProfile: nextProfile });
    setBodyProfileDraft(null);
  }

  function saveBodyMeasurementDraft() {
    if (!bodyMeasurementDraft) {
      return;
    }

    const measurement: BodyMeasurement = {
      id: `body-${Date.now()}`,
      measuredAt: new Date().toISOString(),
      weightKg: Number.parseFloat(bodyMeasurementDraft.weightKg.replace(',', '.')) || 0,
      bodyFatPct: Number.parseFloat(bodyMeasurementDraft.bodyFatPct.replace(',', '.')) || 0,
      musclePct: Number.parseFloat(bodyMeasurementDraft.musclePct.replace(',', '.')) || 0,
      bonePct: Number.parseFloat(bodyMeasurementDraft.bonePct.replace(',', '.')) || 0,
      waterPct: Number.parseFloat(bodyMeasurementDraft.waterPct.replace(',', '.')) || 0,
    };

    if (!measurement.weightKg) {
      return;
    }

    const nextMeasurements = [measurement, ...bodyMeasurements];
    setBodyMeasurements(nextMeasurements);
    persistData({ bodyMeasurements: nextMeasurements });
    setBodyMeasurementDraft(null);
  }

  function deleteBodyMeasurement(measurementId: string) {
    const nextMeasurements = bodyMeasurements.filter((measurement) => measurement.id !== measurementId);
    setBodyMeasurements(nextMeasurements);
    persistData({ bodyMeasurements: nextMeasurements });
  }

  async function addProgressPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setStorageError('Necesito permiso para acceder a tus fotos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]?.uri) {
      return;
    }

    const photoId = `photo-${Date.now()}`;
    const linkedMeasurement = getLatestMeasurement(bodyMeasurements);
    const groupDate = linkedMeasurement?.measuredAt ?? new Date().toISOString();
    const folderName = groupDate.slice(0, 10);
    const folder = `${FileSystem.documentDirectory}progress-photos/${folderName}`;
    const extension = result.assets[0].uri.split('.').pop()?.split('?')[0] || 'jpg';
    const destination = `${folder}/${photoId}.${extension}`;

    await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
    await FileSystem.copyAsync({ from: result.assets[0].uri, to: destination });

    const nextPhoto: ProgressPhoto = {
      id: photoId,
      uri: destination,
      capturedAt: new Date().toISOString(),
      measurementId: linkedMeasurement?.id,
      measurementDate: linkedMeasurement?.measuredAt,
    };
    const nextPhotos = [nextPhoto, ...progressPhotos];
    setProgressPhotos(nextPhotos);
    persistData({ progressPhotos: nextPhotos });
  }

  async function deleteProgressPhoto(photoId: string) {
    const photo = progressPhotos.find((item) => item.id === photoId);
    const nextPhotos = progressPhotos.filter((item) => item.id !== photoId);
    setProgressPhotos(nextPhotos);
    persistData({ progressPhotos: nextPhotos });
    if (photo?.uri) {
      await FileSystem.deleteAsync(photo.uri, { idempotent: true });
    }
  }

  async function saveProgressPhotoToGallery(photo: ProgressPhoto) {
    try {
      const fileInfo = await FileSystem.getInfoAsync(photo.uri);
      if (!fileInfo.exists) {
        throw new Error('No encuentro el archivo original de la foto.');
      }

      const permission = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
      if (!permission.granted) {
        throw new Error('Necesito permiso para guardar la foto en la galeria.');
      }

      const asset = await MediaLibrary.createAssetAsync(photo.uri);
      const album = await MediaLibrary.getAlbumAsync('Gymetric');
      if (album) {
        await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
      } else {
        await MediaLibrary.createAlbumAsync('Gymetric', asset, false);
      }

      ToastAndroid.show('Foto guardada en la galeria', ToastAndroid.SHORT);
      setStorageError(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar la foto en la galeria.';
      setStorageError(message);
      ToastAndroid.show(message, ToastAndroid.LONG);
    }
  }

  function applySummaryToRoutine(summary: WorkoutSummary) {
    return {
      ...summary.routine,
      exercises: summary.routine.exercises.map((routineExercise) => ({
        ...routineExercise,
        sets: routineExercise.sets.map((set) => {
          const setKey = `${routineExercise.id}:${set.id}`;
          const actual = summary.inputs[setKey];
          if (!summary.completedSetIds.includes(setKey) || !actual) {
            return set;
          }

          const reps = Number.parseInt(actual.reps, 10);
          const weightKg = Number.parseFloat(actual.weightKg.replace(',', '.'));
          return {
            ...set,
            targetReps: Number.isFinite(reps) ? reps : set.targetReps,
            targetWeightKg: Number.isFinite(weightKg) ? weightKg : set.targetWeightKg,
          };
        }),
      })),
      estimatedMinutes: estimateRoutineMinutes(summary.routine.exercises),
    };
  }

  const activeExercise = useMemo(() => {
    if (!activeWorkout) {
      return null;
    }

    const routineExercise = activeWorkout.routine.exercises[activeWorkout.exerciseIndex];
    if (!routineExercise) {
      return null;
    }

    return exercises.find((exercise) => exercise.id === routineExercise.exerciseId) ?? null;
  }, [activeWorkout, exercises]);

  if (!isStorageReady) {
    return (
      <View style={styles.loadingScreen}>
        <StatusBar style="light" />
        <Text style={styles.kicker}>Gymetric</Text>
        <Text style={styles.loadingTitle}>Cargando datos locales</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.shell}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 10, 18) }]}>
        <View style={styles.headerTitle}>
          <Text style={styles.kicker}>Gymetric</Text>
          <Text style={styles.title}>Entrena con datos claros</Text>
        </View>
        <View style={styles.scorePill}>
          <Text style={styles.scoreValue}>{achievements.length}</Text>
          <Text style={styles.scoreLabel}>PRs</Text>
        </View>
      </View>

      {storageError && (
        <Pressable style={styles.storageBanner} onPress={() => setStorageError(null)}>
          <Text style={styles.storageBannerText}>{storageError}</Text>
        </Pressable>
      )}

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom:
              activeWorkout?.view === 'overview' && activeWorkout.isResting ? 158 + insets.bottom : 90 + insets.bottom,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {tab === 'today' && (
          <TodayScreen
            activeExercise={activeExercise}
            activeWorkout={activeWorkout}
            addSetToExercise={addSetToExercise}
            achievements={achievements}
            adjustRest={adjustRest}
            completeCurrentSet={completeCurrentSet}
            completeSetAt={completeSetAt}
            deleteSetAt={deleteSetAt}
            exercises={exercises}
            latestAchievement={latestAchievement}
            nextRoutine={nextRoutine}
            openSetEditor={setSetEditorTarget}
            requestFinishRoutine={requestFinishRoutine}
            setWorkoutView={setWorkoutView}
            skipRest={skipRest}
            skipExerciseInActiveRoutine={skipExerciseInActiveRoutine}
            startRoutine={startRoutine}
            totalSetsLogged={totalSetsLogged}
            uncompleteSetAt={uncompleteSetAt}
            updateActualSetValue={updateActualSetValue}
            updateSetValueAt={updateSetValueAt}
          />
        )}

        {tab === 'routines' && (
          <RoutinesScreen
            exercises={exercises}
            openRoutineEditor={openRoutineEditor}
            routines={routines}
            startRoutine={startRoutine}
          />
        )}

        {tab === 'exercises' && (
          <ExercisesScreen
            exercises={exercises}
            openExerciseEditor={openExerciseEditor}
          />
        )}

        {tab === 'progress' && (
          <ProgressScreen
            achievements={achievements}
            addProgressPhoto={addProgressPhoto}
            bodyMeasurements={bodyMeasurements}
            bodyProfile={bodyProfile}
            deleteBodyMeasurement={deleteBodyMeasurement}
            deleteProgressPhoto={deleteProgressPhoto}
            exercises={exercises}
            logs={logs}
            openBodyMeasurementEditor={openBodyMeasurementEditor}
            openBodyProfileEditor={openBodyProfileEditor}
            openProgressPhoto={setSelectedProgressPhoto}
            progressPhotos={progressPhotos}
          />
        )}
      </ScrollView>

      <View style={[styles.tabs, { bottom: Math.max(insets.bottom, 10) }]}>
        <TabButton active={tab === 'today'} label="Hoy" onPress={() => setTab('today')} />
        <TabButton active={tab === 'routines'} label="Rutinas" onPress={() => setTab('routines')} />
        <TabButton active={tab === 'exercises'} label="Ejercicios" onPress={() => setTab('exercises')} />
        <TabButton active={tab === 'progress'} label="Progreso" onPress={() => setTab('progress')} />
      </View>

      {activeWorkout?.view === 'overview' && activeWorkout.isResting && (
        <View style={[styles.pinnedTimer, { bottom: Math.max(insets.bottom, 10) + 74 }]}>
          <Pressable style={styles.pinnedTimerButton} onPress={() => adjustRest(-10)}>
            <Text style={styles.pinnedTimerButtonText}>-10s</Text>
          </Pressable>
          <View style={styles.pinnedTimerCenter}>
            <Text style={styles.pinnedTimerLabel}>Descanso</Text>
            <Text style={styles.pinnedTimerValue}>{formatRestTime(activeWorkout.restRemaining)}</Text>
          </View>
          <Pressable style={styles.pinnedTimerButton} onPress={() => adjustRest(10)}>
            <Text style={styles.pinnedTimerButtonText}>+10s</Text>
          </Pressable>
          <Pressable style={styles.pinnedTimerSkip} onPress={skipRest}>
            <Text style={styles.pinnedTimerSkipText}>Saltar</Text>
          </Pressable>
        </View>
      )}

      <Modal transparent animationType="fade" visible={showFinishConfirm} onRequestClose={() => setShowFinishConfirm(false)}>
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Terminar rutina</Text>
            <Text style={styles.modalCopy}>Se guardaran las series completadas hasta ahora y se cerrara la sesion activa.</Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalSecondary} onPress={() => setShowFinishConfirm(false)}>
                <Text style={styles.modalSecondaryText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.modalPrimary} onPress={finishRoutineEarly}>
                <Text style={styles.modalPrimaryText}>Terminar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <SetKindModal
        target={setEditorTarget}
        workout={activeWorkout}
        close={() => setSetEditorTarget(null)}
        deleteSetAt={deleteSetAt}
        updateSetKindAt={updateSetKindAt}
      />

      <ExerciseEditorModal
        draft={exerciseDraft}
        setDraft={setExerciseDraft}
        close={() => setExerciseDraft(null)}
        deleteExercise={deleteExerciseFromLibrary}
        save={saveExerciseDraft}
      />

      <RoutineEditorModal
        draft={routineDraft}
        deleteRoutine={deleteRoutineFromLibrary}
        exercises={exercises}
        openExerciseEditor={() => openExerciseEditor()}
        setDraft={setRoutineDraft}
        close={() => setRoutineDraft(null)}
        save={saveRoutineDraft}
      />

      <WorkoutSummaryModal
        exercises={exercises}
        summary={workoutSummary}
        discard={discardWorkoutSummary}
        save={saveWorkoutSummary}
      />

      <BodyProfileModal
        draft={bodyProfileDraft}
        setDraft={setBodyProfileDraft}
        close={() => setBodyProfileDraft(null)}
        save={saveBodyProfileDraft}
      />

      <BodyMeasurementModal
        draft={bodyMeasurementDraft}
        setDraft={setBodyMeasurementDraft}
        close={() => setBodyMeasurementDraft(null)}
        save={saveBodyMeasurementDraft}
      />

      <ProgressPhotoViewer
        close={() => setSelectedProgressPhoto(null)}
        deletePhoto={deleteProgressPhoto}
        photo={selectedProgressPhoto}
        saveToGallery={saveProgressPhotoToGallery}
      />
    </KeyboardAvoidingView>
  );
}

function TodayScreen({
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
            openSetEditor={openSetEditor}
            skipExerciseInActiveRoutine={skipExerciseInActiveRoutine}
            uncompleteSetAt={uncompleteSetAt}
            updateSetValueAt={updateSetValueAt}
          />
        ) : (
          <View style={styles.workoutCard}>
            <Text style={styles.exerciseName}>{activeExercise.name}</Text>
            <Text style={styles.setMeta}>
              Serie {activeWorkout.setIndex + 1}/{routineExercise.sets.length} · {set.kind} · descanso{' '}
              {formatRestTime(routineExercise.restSeconds)}
            </Text>

            <View style={styles.actualGrid}>
              <ActualInput
                label={`Reps objetivo ${set.targetReps}`}
                value={actualInput?.reps ?? ''}
                onChangeText={(value) => updateActualSetValue('reps', value)}
              />
              <ActualInput
                label={`Kg objetivo ${set.targetWeightKg}`}
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
  openSetEditor: (target: SetEditorTarget) => void;
  skipExerciseInActiveRoutine: (exerciseIndex: number) => void;
  uncompleteSetAt: (exerciseIndex: number, setIndex: number) => void;
  updateSetValueAt: (exerciseIndex: number, setIndex: number, field: 'reps' | 'weightKg', value: string) => void;
}) {
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
                <Text style={styles.overviewRest}>Descanso: {formatRestTime(routineExercise.restSeconds)}</Text>
              </View>
              <Pressable style={styles.skipExerciseButton} onPress={() => skipExerciseInActiveRoutine(exerciseIndex)}>
                <Text style={styles.skipExerciseButtonText}>Saltar</Text>
              </Pressable>
            </View>
            <View style={styles.setTableHeader}>
              <Text style={styles.setColumnSmall}>Serie</Text>
              <Text style={styles.setColumn}>Kg</Text>
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
                      value={input?.weightKg ?? set.targetWeightKg.toString()}
                      onChangeText={(value) => updateSetValueAt(exerciseIndex, setIndex, 'weightKg', value)}
                    />
                    <TextInput
                      keyboardType="number-pad"
                      selectTextOnFocus
                      style={[styles.setCellInput, isDone && styles.completedSetText]}
                      value={input?.reps ?? set.targetReps.toString()}
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
  const volume = activeWorkout.completedSetIds.reduce((total, setKey) => {
    const input = activeWorkout.inputs[setKey];
    const reps = Number.parseFloat(input?.reps ?? '0');
    const weight = Number.parseFloat((input?.weightKg ?? '0').replace(',', '.'));
    return total + (Number.isFinite(reps) && Number.isFinite(weight) ? reps * weight : 0);
  }, 0);

  return (
    <View style={styles.sessionStats}>
      <Metric label="Duracion" value={formatRestTime(activeWorkout.elapsedSeconds)} />
      <Metric label="Volumen" value={`${Math.round(volume)} kg`} />
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

function SetKindModal({
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

function KindOption({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable style={[styles.kindOption, active && styles.kindOptionActive]} onPress={onPress}>
      <Text style={[styles.kindOptionText, active && styles.kindOptionTextActive]}>{label}</Text>
    </Pressable>
  );
}

function RoutinesScreen({
  exercises,
  openRoutineEditor,
  routines,
  startRoutine,
}: {
  exercises: Exercise[];
  openRoutineEditor: (routine?: Routine) => void;
  routines: Routine[];
  startRoutine: (routine?: Routine) => void;
}) {
  return (
    <View style={styles.stack}>
      <Pressable style={styles.primaryButton} onPress={() => openRoutineEditor()}>
        <Text style={styles.primaryButtonText}>Crear rutina</Text>
      </Pressable>
      {routines.map((routine) => (
        <View key={routine.id} style={styles.panel}>
          <Text style={styles.sectionLabel}>
            {routine.preferredDays?.length ? routine.preferredDays.map((day) => weekdayLabels[day]).join(', ') : 'Sin día sugerido'}
          </Text>
          <Text style={styles.panelTitle}>{routine.name}</Text>
          <Text style={styles.muted}>{routine.focus}</Text>
          <View style={styles.exerciseList}>
            {routine.exercises.map((routineExercise) => {
              const exercise = exercises.find((item) => item.id === routineExercise.exerciseId);
              return (
                <Text key={routineExercise.id} style={styles.routineLine}>
                  {exercise?.name ?? 'Ejercicio'} · {routineExercise.sets.length} series ·{' '}
                  {formatRestTime(routineExercise.restSeconds)} descanso
                </Text>
              );
            })}
          </View>
          <View style={styles.actionRow}>
            <Pressable style={styles.actionButton} onPress={() => openRoutineEditor(routine)}>
              <Text style={styles.secondaryButtonText}>Editar</Text>
            </Pressable>
            <Pressable style={styles.actionButtonPrimary} onPress={() => startRoutine(routine)}>
              <Text style={styles.primaryButtonText}>Iniciar</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

function ExercisesScreen({
  exercises,
  openExerciseEditor,
}: {
  exercises: Exercise[];
  openExerciseEditor: (exercise?: Exercise) => void;
}) {
  return (
    <View style={styles.stack}>
      <Pressable style={styles.primaryButton} onPress={() => openExerciseEditor()}>
        <Text style={styles.primaryButtonText}>Añadir ejercicio</Text>
      </Pressable>

      <View style={styles.panel}>
        <Text style={styles.sectionLabel}>Biblioteca</Text>
        {exercises.map((exercise) => (
          <Pressable key={exercise.id} onPress={() => openExerciseEditor(exercise)}>
            <ExerciseRow exercise={exercise} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ExerciseEditorModal({
  close,
  deleteExercise,
  draft,
  save,
  setDraft,
}: {
  close: () => void;
  deleteExercise: (exerciseId: string) => void;
  draft: ExerciseDraft | null;
  save: () => void;
  setDraft: Dispatch<SetStateAction<ExerciseDraft | null>>;
}) {
  if (!draft) {
    return null;
  }

  return (
    <Modal transparent animationType="slide" visible onRequestClose={close}>
      <View style={styles.modalScrim}>
        <ScrollView style={styles.editorCard} contentContainerStyle={styles.editorContent}>
          <Text style={styles.modalTitle}>{draft.id ? 'Editar ejercicio' : 'Nuevo ejercicio'}</Text>
          <TextInput
            placeholder="Nombre del ejercicio"
            placeholderTextColor="#7C8797"
            style={styles.editorInput}
            value={draft.name}
            onChangeText={(name) => setDraft((current) => (current ? { ...current, name } : current))}
          />

          <Text style={styles.editorLabel}>Grupo muscular</Text>
          <OptionGrid
            options={muscleOptions}
            labels={muscleLabels}
            value={draft.muscleGroup}
            onChange={(muscleGroup) => setDraft((current) => (current ? { ...current, muscleGroup } : current))}
          />

          <Text style={styles.editorLabel}>Equipo</Text>
          <OptionGrid
            options={equipmentOptions}
            labels={equipmentLabels}
            value={draft.equipmentKind}
            onChange={(equipmentKind) =>
              setDraft((current) =>
                current ? { ...current, equipmentKind, equipment: current.equipment || equipmentLabels[equipmentKind] } : current,
              )
            }
          />
          <TextInput
            placeholder="Detalle: máquina, barra, polea..."
            placeholderTextColor="#7C8797"
            style={styles.editorInput}
            value={draft.equipment}
            onChangeText={(equipment) => setDraft((current) => (current ? { ...current, equipment } : current))}
          />

          <Text style={styles.editorLabel}>Agarre opcional</Text>
          <OptionGrid
            options={gripOptions}
            labels={gripLabels}
            value={draft.grip}
            onChange={(grip) => setDraft((current) => (current ? { ...current, grip } : current))}
          />

          <Text style={styles.editorLabel}>Foco opcional</Text>
          <OptionGrid
            options={movementOptions}
            labels={movementLabels}
            value={draft.movementFocus}
            onChange={(movementFocus) => setDraft((current) => (current ? { ...current, movementFocus } : current))}
          />

          <TextInput
            multiline
            placeholder="Notas opcionales"
            placeholderTextColor="#7C8797"
            style={[styles.editorInput, styles.editorTextArea]}
            value={draft.notes}
            onChangeText={(notes) => setDraft((current) => (current ? { ...current, notes } : current))}
          />

          <View style={styles.modalActions}>
            <Pressable style={styles.modalSecondary} onPress={close}>
              <Text style={styles.modalSecondaryText}>Cancelar</Text>
            </Pressable>
            <Pressable style={styles.modalPrimary} onPress={save}>
              <Text style={styles.modalPrimaryText}>Guardar</Text>
            </Pressable>
          </View>
          {draft.id && (
            <Pressable style={styles.fullWidthDanger} onPress={() => deleteExercise(draft.id!)}>
              <Text style={styles.modalDangerText}>Eliminar ejercicio</Text>
            </Pressable>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function RoutineEditorModal({
  close,
  deleteRoutine,
  draft,
  exercises,
  openExerciseEditor,
  save,
  setDraft,
}: {
  close: () => void;
  deleteRoutine: (routineId: string) => void;
  draft: RoutineDraft | null;
  exercises: Exercise[];
  openExerciseEditor: () => void;
  save: () => void;
  setDraft: Dispatch<SetStateAction<RoutineDraft | null>>;
}) {
  const [collapsedExerciseIds, setCollapsedExerciseIds] = useState<string[]>([]);

  if (!draft) {
    return null;
  }
  const availableExercises = exercises.filter(
    (exercise) => !draft.exercises.some((routineExercise) => routineExercise.exerciseId === exercise.id),
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
      <View style={styles.modalScrim}>
        <DraggableFlatList
          activationDistance={1}
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
          renderItem={({ item: routineExercise, drag, isActive, getIndex }: RenderItemParams<RoutineExercise>) => {
            const exerciseIndex = getIndex() ?? 0;
            const exercise = exercises.find((item) => item.id === routineExercise.exerciseId);
            const isCollapsed = collapsedExerciseIds.includes(routineExercise.id);
            return (
              <View style={[styles.routineEditorBlock, isActive && styles.routineEditorBlockActive]}>
                <View style={styles.routineEditorHeader}>
                  <Pressable style={styles.headerTitle} onPress={() => toggleExerciseCollapsed(routineExercise.id)}>
                    <Text style={styles.exerciseRowName}>{exercise?.name ?? 'Ejercicio'}</Text>
                    <Text style={styles.muted}>
                      {routineExercise.sets.length} series · {isCollapsed ? 'Plegado' : 'Desplegado'}
                    </Text>
                  </Pressable>
                  <Pressable style={styles.dragHandle} onPressIn={drag}>
                    <Text style={styles.dragHandleText}>≡</Text>
                  </Pressable>
                  <Pressable style={styles.smallSquareButton} onPress={() => moveExercise(exerciseIndex, -1)}>
                    <Text style={styles.smallSquareButtonText}>↑</Text>
                  </Pressable>
                  <Pressable style={styles.smallSquareButton} onPress={() => moveExercise(exerciseIndex, 1)}>
                    <Text style={styles.smallSquareButtonText}>↓</Text>
                  </Pressable>
                  <Pressable style={styles.smallSquareButton} onPress={() => removeExerciseFromRoutine(exerciseIndex)}>
                    <Text style={styles.smallSquareButtonText}>×</Text>
                  </Pressable>
                </View>
                {!isCollapsed && (
                  <>
                    <RestTimeInput
                      restSeconds={routineExercise.restSeconds}
                      onChange={(restSeconds) => updateRoutineExercise(exerciseIndex, { restSeconds })}
                    />
                    <View style={styles.routineSetHeader}>
                      <Text style={styles.routineSetIndexHeader}>Tipo</Text>
                      <Text style={styles.routineSetColumnHeader}>Kg</Text>
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
                          placeholder="Kg"
                          placeholderTextColor="#7C8797"
                          style={styles.routineSetInput}
                          value={set.targetWeightKg.toString()}
                          onChangeText={(targetWeightKg) =>
                            updateSet(exerciseIndex, setIndex, {
                              targetWeightKg: Number.parseFloat(targetWeightKg.replace(',', '.')) || 0,
                            })
                          }
                        />
                        <TextInput
                          keyboardType="number-pad"
                          placeholder="Reps"
                          placeholderTextColor="#7C8797"
                          style={styles.routineSetInput}
                          value={set.targetReps.toString()}
                          onChangeText={(targetReps) =>
                            updateSet(exerciseIndex, setIndex, { targetReps: Number.parseInt(targetReps, 10) || 0 })
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
            );
          }}
        />
      </View>
    </Modal>
  );
}

function WorkoutSummaryModal({
  discard,
  exercises,
  save,
  summary,
}: {
  discard: () => void;
  exercises: Exercise[];
  save: () => void;
  summary: WorkoutSummary | null;
}) {
  if (!summary) {
    return null;
  }

  const volume = summary.logs.reduce((total, log) => total + log.reps * log.weightKg, 0);

  return (
    <Modal transparent animationType="slide" visible onRequestClose={discard}>
      <View style={styles.modalScrim}>
        <ScrollView style={styles.editorCard} contentContainerStyle={styles.editorContent}>
          <Text style={styles.modalTitle}>Resumen del entrenamiento</Text>
          <View style={styles.sessionStats}>
            <Metric label="Duracion" value={formatRestTime(summary.elapsedSeconds)} />
            <Metric label="Volumen" value={`${Math.round(volume)} kg`} />
            <Metric label="Series" value={summary.logs.length.toString()} />
          </View>

          <Text style={styles.editorLabel}>{summary.routine.name}</Text>
          {summary.logs.map((log) => {
            const exercise = exercises.find((item) => item.id === log.exerciseId);
            return (
              <View key={log.id} style={styles.summaryRow}>
                <View style={styles.headerTitle}>
                  <Text style={styles.exerciseRowName}>{exercise?.name ?? 'Ejercicio'}</Text>
                  <Text style={styles.muted}>{log.kind}</Text>
                </View>
                <Text style={styles.summaryValue}>
                  {log.weightKg} kg x {log.reps}
                </Text>
              </View>
            );
          })}

          {!!summary.achievements.length && (
            <View style={styles.panel}>
              <Text style={styles.sectionLabel}>Nuevos logros</Text>
              {summary.achievements.map((achievement) => (
                <Text key={achievement.id} style={styles.routineLine}>
                  {achievement.description}
                </Text>
              ))}
            </View>
          )}

          <View style={styles.modalActions}>
            <Pressable style={styles.modalSecondary} onPress={discard}>
              <Text style={styles.modalSecondaryText}>Descartar</Text>
            </Pressable>
            <Pressable style={styles.modalPrimary} onPress={save}>
              <Text style={styles.modalPrimaryText}>Guardar</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function ProgressScreen({
  achievements,
  addProgressPhoto,
  bodyMeasurements,
  bodyProfile,
  deleteBodyMeasurement,
  deleteProgressPhoto,
  exercises,
  logs,
  openBodyMeasurementEditor,
  openBodyProfileEditor,
  openProgressPhoto,
  progressPhotos,
}: {
  achievements: Achievement[];
  addProgressPhoto: () => void;
  bodyMeasurements: BodyMeasurement[];
  bodyProfile: BodyProfile | null;
  deleteBodyMeasurement: (measurementId: string) => void;
  deleteProgressPhoto: (photoId: string) => void;
  exercises: Exercise[];
  logs: SetLog[];
  openBodyMeasurementEditor: () => void;
  openBodyProfileEditor: () => void;
  openProgressPhoto: (photo: ProgressPhoto) => void;
  progressPhotos: ProgressPhoto[];
}) {
  const [openPhotoGroupKey, setOpenPhotoGroupKey] = useState<string | null>(null);
  const latestMeasurement = getLatestMeasurement(bodyMeasurements);
  const bmi = calculateBmi(bodyProfile, latestMeasurement);
  const bmiSummary = getBmiSummary(bmi);
  const bodySex = bodyProfile?.sex ?? 'male';
  const referenceHeight = latestMeasurement ? estimateHeightForBmi(latestMeasurement.weightKg, 23.7) : null;
  const weightHistory = [...bodyMeasurements].sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt));
  const photoGroups = groupProgressPhotos(progressPhotos, bodyMeasurements);

  return (
    <View style={styles.stack}>
      <View style={styles.heroPanel}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.eyebrow}>Progreso corporal</Text>
            <Text style={styles.h2}>Datos que si importan</Text>
          </View>
          <Pressable style={styles.iconButton} onPress={openBodyProfileEditor}>
            <Text style={styles.iconButtonText}>Perfil</Text>
          </Pressable>
        </View>
        <View style={styles.bodyProfileRow}>
          <Metric label="Altura" value={bodyProfile?.heightCm ? `${bodyProfile.heightCm} cm` : '--'} />
          <Metric label="Edad" value={bodyProfile?.age ? `${bodyProfile.age}` : '--'} />
          <Metric label="Sexo" value={bodySex === 'female' ? 'Mujer' : 'Hombre'} />
          <Metric label="Mediciones" value={bodyMeasurements.length.toString()} />
        </View>
        <Pressable style={styles.primaryButton} onPress={openBodyMeasurementEditor}>
          <Text style={styles.primaryButtonText}>Registrar medicion</Text>
        </Pressable>
      </View>

      <View style={styles.panel}>
        <View style={styles.headerRow}>
          <Text style={styles.sectionLabel}>Peso</Text>
          <Text style={styles.muted}>{latestMeasurement ? formatMeasurementDate(latestMeasurement.measuredAt) : 'Sin mediciones'}</Text>
        </View>
        <View style={styles.weightSummaryRow}>
          <View>
            <Text style={styles.bigMetric}>{latestMeasurement ? latestMeasurement.weightKg.toFixed(1) : '--'}</Text>
            <Text style={styles.metricLabel}>kg</Text>
          </View>
          <Sparkline measurements={weightHistory} metric="weightKg" color="#F4B860" />
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionLabel}>Composicion corporal</Text>
        <View style={styles.compositionGrid}>
          <BodyMetricCard
            label="Grasa"
            value={latestMeasurement?.bodyFatPct}
            suffix="%"
            summary={getBodyFatSummary(latestMeasurement?.bodyFatPct, bodySex)}
          />
          <BodyMetricCard
            label="Musculo"
            value={latestMeasurement?.musclePct}
            suffix="%"
            summary={getMuscleSummary(latestMeasurement?.musclePct, bodySex)}
          />
          <BodyMetricCard
            label="Hueso"
            value={latestMeasurement?.bonePct}
            suffix="%"
            summary={getBoneSummary(latestMeasurement?.bonePct, bodySex)}
          />
          <BodyMetricCard
            label="Agua"
            value={latestMeasurement?.waterPct}
            suffix="%"
            summary={getWaterSummary(latestMeasurement?.waterPct, bodySex)}
          />
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionLabel}>IMC</Text>
        <View style={styles.bmiRow}>
          <Text style={styles.bigMetric}>{bmi ? bmi.toFixed(1) : '--'}</Text>
          <View style={styles.headerTitle}>
            <Text style={[styles.panelTitle, getStatusTextStyle(bmiSummary.status)]}>{bmiSummary.label}</Text>
            <Text style={styles.muted}>{bmiSummary.description}</Text>
          </View>
        </View>
        <View style={styles.bmiTrack}>
          <View style={[styles.bmiMarker, { left: `${getBmiMarkerPosition(bmi)}%` }]} />
        </View>
        <View style={styles.bmiLabels}>
          <Text style={styles.muted}>Bajo</Text>
          <Text style={styles.muted}>Saludable</Text>
          <Text style={styles.muted}>Sobrepeso</Text>
          <Text style={styles.muted}>Obesidad</Text>
        </View>
        {!!referenceHeight && !!bodyProfile?.heightCm && Math.abs(bodyProfile.heightCm - referenceHeight) > 5 && (
          <Text style={styles.bmiHint}>
            Con {latestMeasurement?.weightKg.toFixed(1)} kg y {bodyProfile.heightCm} cm, este IMC es correcto. Para un IMC
            cercano a 23.7 la altura seria aprox. {Math.round(referenceHeight)} cm.
          </Text>
        )}
      </View>

      <View style={styles.panel}>
        <View style={styles.headerRow}>
          <Text style={styles.sectionLabel}>Fotos de progreso</Text>
          <Pressable style={styles.smallActionButton} onPress={addProgressPhoto}>
            <Text style={styles.smallActionText}>+ Foto</Text>
          </Pressable>
        </View>
        <View style={styles.photoGroups}>
          {photoGroups.map((group) => (
            <View key={group.key} style={styles.photoFolder}>
              <Pressable
                style={styles.photoFolderHeader}
                onPress={() => setOpenPhotoGroupKey(openPhotoGroupKey === group.key ? null : group.key)}
              >
                <View style={styles.folderIcon}>
                  <Text style={styles.folderIconText}>▰</Text>
                </View>
                <View style={styles.headerTitle}>
                  <Text style={styles.photoGroupTitle}>{group.title}</Text>
                  <Text style={styles.muted}>{group.photos.length} fotos</Text>
                </View>
                <Text style={styles.folderChevron}>{openPhotoGroupKey === group.key ? '−' : '+'}</Text>
              </Pressable>
              {openPhotoGroupKey === group.key && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoStrip}>
                  {group.photos.map((photo) => (
                    <Pressable key={photo.id} style={styles.photoCard} onPress={() => openProgressPhoto(photo)}>
                      <Image source={{ uri: photo.uri }} style={styles.progressPhoto} />
                      <Text style={styles.photoDate}>{formatMeasurementDate(photo.capturedAt)}</Text>
                      <Pressable style={styles.photoDelete} onPress={() => deleteProgressPhoto(photo.id)}>
                        <Text style={styles.photoDeleteText}>Eliminar</Text>
                      </Pressable>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          ))}
          {!progressPhotos.length && <Text style={styles.emptyText}>Todavia no hay fotos guardadas.</Text>}
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionLabel}>Historial corporal</Text>
        {bodyMeasurements.map((measurement) => (
          <View key={measurement.id} style={styles.bodyHistoryRow}>
            <View style={styles.headerTitle}>
              <Text style={styles.panelTitle}>{formatMeasurementDate(measurement.measuredAt)}</Text>
              <Text style={styles.muted}>
                {measurement.weightKg} kg · grasa {measurement.bodyFatPct}% · musculo {measurement.musclePct}% · agua{' '}
                {measurement.waterPct}%
              </Text>
            </View>
            <Pressable style={styles.smallSquareButton} onPress={() => deleteBodyMeasurement(measurement.id)}>
              <Text style={styles.smallSquareButtonText}>×</Text>
            </Pressable>
          </View>
        ))}
        {!bodyMeasurements.length && <Text style={styles.emptyText}>Registra tu primera medicion corporal.</Text>}
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionLabel}>Records por ejercicio</Text>
        {exercises.map((exercise) => (
          <View key={exercise.id} style={styles.progressRow}>
            <Text style={styles.progressName}>{exercise.name}</Text>
            <Text style={styles.progressValue}>{getPersonalBest(logs, exercise.id)} kg</Text>
          </View>
        ))}
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionLabel}>Medallas</Text>
        {achievements.map((achievement) => (
          <View key={achievement.id} style={styles.medal}>
            <Text style={styles.medalIcon}>PR</Text>
            <View style={styles.medalText}>
              <Text style={styles.panelTitle}>{achievement.title}</Text>
              <Text style={styles.muted}>{achievement.description}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function BodyProfileModal({
  close,
  draft,
  save,
  setDraft,
}: {
  close: () => void;
  draft: BodyProfileDraft | null;
  save: () => void;
  setDraft: Dispatch<SetStateAction<BodyProfileDraft | null>>;
}) {
  if (!draft) {
    return null;
  }

  return (
    <Modal transparent animationType="slide" visible onRequestClose={close}>
      <View style={styles.modalScrim}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Datos personales</Text>
          <TextInput
            keyboardType="decimal-pad"
            placeholder="Altura en cm"
            placeholderTextColor="#7C8797"
            style={styles.editorInput}
            value={draft.heightCm}
            onChangeText={(heightCm) => setDraft((current) => (current ? { ...current, heightCm } : current))}
          />
          <TextInput
            keyboardType="number-pad"
            placeholder="Edad"
            placeholderTextColor="#7C8797"
            style={styles.editorInput}
            value={draft.age}
            onChangeText={(age) => setDraft((current) => (current ? { ...current, age } : current))}
          />
          <Text style={styles.editorLabel}>Sexo para rangos corporales</Text>
          <View style={styles.segmentedControl}>
            <Pressable
              style={[styles.profileSegmentButton, draft.sex === 'male' && styles.profileSegmentButtonActive]}
              onPress={() => setDraft((current) => (current ? { ...current, sex: 'male' } : current))}
            >
              <Text style={[styles.profileSegmentButtonText, draft.sex === 'male' && styles.profileSegmentButtonTextActive]}>Hombre</Text>
            </Pressable>
            <Pressable
              style={[styles.profileSegmentButton, draft.sex === 'female' && styles.profileSegmentButtonActive]}
              onPress={() => setDraft((current) => (current ? { ...current, sex: 'female' } : current))}
            >
              <Text style={[styles.profileSegmentButtonText, draft.sex === 'female' && styles.profileSegmentButtonTextActive]}>Mujer</Text>
            </Pressable>
          </View>
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

function ProgressPhotoViewer({
  close,
  deletePhoto,
  photo,
  saveToGallery,
}: {
  close: () => void;
  deletePhoto: (photoId: string) => void;
  photo: ProgressPhoto | null;
  saveToGallery: (photo: ProgressPhoto) => void;
}) {
  const insets = useSafeAreaInsets();

  if (!photo) {
    return null;
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={close}>
      <View
        style={[
          styles.viewerScrim,
          {
            paddingTop: insets.top + 78,
            paddingBottom: Math.max(insets.bottom, 18) + 98,
          },
        ]}
      >
        <View style={[styles.viewerTopBar, { top: insets.top + 12 }]}>
          <Pressable style={styles.viewerButton} onPress={close}>
            <Text style={styles.viewerButtonText}>Cerrar</Text>
          </Pressable>
          <Text style={styles.viewerDate}>{formatMeasurementDate(photo.capturedAt)}</Text>
        </View>
        <Image source={{ uri: photo.uri }} style={styles.viewerImage} resizeMode="contain" />
        <View style={[styles.viewerActions, { bottom: Math.max(insets.bottom, 18) + 14 }]}>
          <Pressable style={styles.viewerSaveButton} onPress={() => saveToGallery(photo)}>
            <Text style={styles.viewerSaveButtonText}>Guardar</Text>
          </Pressable>
          <Pressable
            style={styles.viewerDeleteButton}
            onPress={() => {
              deletePhoto(photo.id);
              close();
            }}
          >
            <Text style={styles.viewerDeleteButtonText}>Eliminar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function BodyMeasurementModal({
  close,
  draft,
  save,
  setDraft,
}: {
  close: () => void;
  draft: BodyMeasurementDraft | null;
  save: () => void;
  setDraft: Dispatch<SetStateAction<BodyMeasurementDraft | null>>;
}) {
  if (!draft) {
    return null;
  }

  return (
    <Modal transparent animationType="slide" visible onRequestClose={close}>
      <View style={styles.modalScrim}>
        <ScrollView style={styles.editorCard} contentContainerStyle={styles.editorContent}>
          <Text style={styles.modalTitle}>Nueva medicion</Text>
          <Text style={styles.muted}>La fecha se guarda automaticamente con el momento actual.</Text>
          <MeasurementInput label="Peso kg" value={draft.weightKg} onChange={(weightKg) => setDraft((current) => (current ? { ...current, weightKg } : current))} />
          <MeasurementInput label="Grasa %" value={draft.bodyFatPct} onChange={(bodyFatPct) => setDraft((current) => (current ? { ...current, bodyFatPct } : current))} />
          <MeasurementInput label="Musculo %" value={draft.musclePct} onChange={(musclePct) => setDraft((current) => (current ? { ...current, musclePct } : current))} />
          <MeasurementInput label="Hueso %" value={draft.bonePct} onChange={(bonePct) => setDraft((current) => (current ? { ...current, bonePct } : current))} />
          <MeasurementInput label="Agua %" value={draft.waterPct} onChange={(waterPct) => setDraft((current) => (current ? { ...current, waterPct } : current))} />
          <View style={styles.modalActions}>
            <Pressable style={styles.modalSecondary} onPress={close}>
              <Text style={styles.modalSecondaryText}>Cancelar</Text>
            </Pressable>
            <Pressable style={styles.modalPrimary} onPress={save}>
              <Text style={styles.modalPrimaryText}>Guardar</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function MeasurementInput({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <View>
      <Text style={styles.editorLabel}>{label}</Text>
      <TextInput
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor="#7C8797"
        style={styles.editorInput}
        value={value}
        onChangeText={onChange}
      />
    </View>
  );
}

function BodyMetricCard({
  label,
  suffix,
  summary,
  value,
}: {
  label: string;
  suffix: string;
  summary: ReturnType<typeof getBodyFatSummary>;
  value?: number;
}) {
  return (
    <View style={styles.bodyMetricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.bodyMetricValue}>{value ? `${value}${suffix}` : '--'}</Text>
      <Text style={[styles.metricStatus, getStatusTextStyle(summary.status)]}>{summary.label}</Text>
    </View>
  );
}

function Sparkline({
  color,
  measurements,
  metric,
}: {
  color: string;
  measurements: BodyMeasurement[];
  metric: keyof Pick<BodyMeasurement, 'weightKg' | 'bodyFatPct' | 'musclePct' | 'bonePct' | 'waterPct'>;
}) {
  const values = measurements.slice(-8).map((measurement) => measurement[metric]);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;

  return (
    <View style={styles.sparkline}>
      {values.map((value, index) => {
        const height = max === min ? 18 : 12 + ((value - min) / (max - min)) * 44;
        return <View key={`${value}-${index}`} style={[styles.sparkBar, { height, backgroundColor: color }]} />;
      })}
      {!values.length && <Text style={styles.muted}>Sin historial</Text>}
    </View>
  );
}

function groupProgressPhotos(photos: ProgressPhoto[], measurements: BodyMeasurement[]) {
  const measurementById = new Map(measurements.map((measurement) => [measurement.id, measurement]));
  const groups = new Map<string, { key: string; photos: ProgressPhoto[]; title: string; timestamp: number }>();

  photos.forEach((photo) => {
    const measurement = photo.measurementId ? measurementById.get(photo.measurementId) : null;
    const date = measurement?.measuredAt ?? photo.measurementDate ?? photo.capturedAt;
    const key = date.slice(0, 10);
    const existing = groups.get(key);

    if (existing) {
      existing.photos.push(photo);
      return;
    }

    groups.set(key, {
      key,
      photos: [photo],
      title: measurement ? `Medicion ${formatMeasurementDate(measurement.measuredAt)}` : formatMeasurementDate(date),
      timestamp: Date.parse(date),
    });
  });

  return [...groups.values()].sort((a, b) => b.timestamp - a.timestamp);
}

function getBmiMarkerPosition(bmi: number | null) {
  if (!bmi) {
    return 0;
  }
  return Math.max(0, Math.min(100, ((bmi - 16) / 20) * 100));
}

function getStatusTextStyle(status: ReturnType<typeof getBmiSummary>['status']) {
  if (status === 'healthy') {
    return styles.statusHealthy;
  }
  if (status === 'high') {
    return styles.statusHigh;
  }
  if (status === 'very_high') {
    return styles.statusVeryHigh;
  }
  if (status === 'low') {
    return styles.statusLow;
  }
  return styles.statusUnknown;
}

function ActualInput({
  label,
  onChangeText,
  value,
}: {
  label: string;
  onChangeText: (value: string) => void;
  value: string;
}) {
  return (
    <View style={styles.actualInputBox}>
      <Text style={styles.actualInputLabel}>{label}</Text>
      <TextInput
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor="#65717A"
        selectTextOnFocus
        style={styles.actualInput}
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
}

function ExerciseRow({ exercise }: { exercise: Exercise }) {
  const equipmentKindLabel = equipmentLabels[exercise.equipmentKind];
  const equipmentDetail = exercise.equipment && exercise.equipment !== equipmentKindLabel ? ` · ${exercise.equipment}` : '';

  return (
    <View style={styles.exerciseRow}>
      <View style={styles.headerTitle}>
        <Text style={styles.exerciseRowName}>{exercise.name}</Text>
        <Text style={styles.muted}>
          {muscleLabels[exercise.muscleGroup]} · {equipmentKindLabel}
          {equipmentDetail}
        </Text>
      </View>
      <Text style={styles.badge}>{exercise.isCustom ? 'Custom' : 'Base'}</Text>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function SegmentButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable style={[styles.segmentButton, active && styles.activeSegment]} onPress={onPress}>
      <Text style={[styles.segmentText, active && styles.activeSegmentText]}>{label}</Text>
    </Pressable>
  );
}

function TabButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable style={[styles.tabButton, active && styles.activeTab]} onPress={onPress}>
      <Text style={[styles.tabText, active && styles.activeTabText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: '#101418',
  },
  gestureRoot: {
    flex: 1,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: '#101418',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingTitle: {
    color: '#F7FAFC',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 8,
  },
  storageBanner: {
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: '#D84A4A',
    padding: 10,
  },
  storageBannerText: {
    color: '#FFFFFF',
    fontWeight: '900',
    textAlign: 'center',
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 14,
  },
  headerTitle: {
    flex: 1,
  },
  kicker: {
    color: '#7DD3C7',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    color: '#F7FAFC',
    fontSize: 26,
    fontWeight: '900',
    marginTop: 4,
  },
  scorePill: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: '#F0B35B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreValue: {
    color: '#16110A',
    fontSize: 22,
    fontWeight: '900',
  },
  scoreLabel: {
    color: '#16110A',
    fontSize: 11,
    fontWeight: '800',
  },
  content: {
    padding: 20,
  },
  stack: {
    gap: 14,
  },
  hero: {
    backgroundColor: '#1B242B',
    borderRadius: 8,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2D3A43',
  },
  panel: {
    backgroundColor: '#172027',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27343D',
  },
  workoutCard: {
    backgroundColor: '#EAF2EE',
    borderRadius: 8,
    padding: 18,
    gap: 16,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  sectionLabel: {
    color: '#7DD3C7',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  eyebrow: {
    color: '#7DD3C7',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  h1: {
    color: '#F7FAFC',
    fontSize: 32,
    fontWeight: '900',
  },
  h2: {
    color: '#F7FAFC',
    fontSize: 24,
    fontWeight: '900',
  },
  heroCopy: {
    color: '#BAC6CF',
    fontSize: 16,
    lineHeight: 23,
    marginTop: 8,
    marginBottom: 18,
  },
  panelTitle: {
    color: '#F7FAFC',
    fontSize: 18,
    fontWeight: '900',
  },
  muted: {
    color: '#9BA8B4',
    fontSize: 13,
    lineHeight: 19,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: '#7DD3C7',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: '#071313',
    fontWeight: '900',
    fontSize: 15,
  },
  secondaryButton: {
    marginTop: 14,
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#7DD3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#7DD3C7',
    fontWeight: '900',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  actionButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#7DD3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonPrimary: {
    flex: 1,
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: '#7DD3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactButton: {
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: '#7DD3C7',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  compactButtonText: {
    color: '#071313',
    fontWeight: '900',
  },
  endButton: {
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F0B35B',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endButtonText: {
    color: '#F0B35B',
    fontSize: 12,
    fontWeight: '900',
  },
  segmented: {
    marginTop: 16,
    backgroundColor: '#0F151A',
    borderRadius: 8,
    flexDirection: 'row',
    padding: 4,
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeSegment: {
    backgroundColor: '#EAF2EE',
  },
  segmentText: {
    color: '#8F9CA7',
    fontWeight: '900',
  },
  activeSegmentText: {
    color: '#111A1F',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  sessionStats: {
    flexDirection: 'row',
    gap: 10,
  },
  metric: {
    flex: 1,
    backgroundColor: '#222D35',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#31404A',
  },
  metricValue: {
    color: '#F7FAFC',
    fontSize: 24,
    fontWeight: '900',
  },
  metricLabel: {
    color: '#AAB6C1',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '700',
  },
  actualGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  actualInputBox: {
    flex: 1,
    backgroundColor: '#DDE8E3',
    borderRadius: 8,
    padding: 12,
  },
  actualInputLabel: {
    color: '#52606A',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 8,
  },
  actualInput: {
    color: '#111A1F',
    fontSize: 26,
    fontWeight: '900',
    minHeight: 42,
    padding: 0,
  },
  exerciseName: {
    color: '#111A1F',
    fontSize: 28,
    fontWeight: '900',
  },
  setMeta: {
    color: '#54616B',
    fontSize: 14,
    fontWeight: '800',
  },
  restBox: {
    borderRadius: 8,
    padding: 18,
    backgroundColor: '#111A1F',
    alignItems: 'center',
  },
  restLabel: {
    color: '#F0B35B',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  restTime: {
    color: '#F7FAFC',
    fontSize: 42,
    fontWeight: '900',
    marginTop: 4,
  },
  timerControls: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    width: '100%',
  },
  timerButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#52616B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerButtonText: {
    color: '#D7E0E7',
    fontWeight: '900',
  },
  timerButtonPrimary: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: '#F0B35B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerButtonPrimaryText: {
    color: '#16110A',
    fontWeight: '900',
  },
  pinnedTimer: {
    position: 'absolute',
    left: 14,
    right: 14,
    minHeight: 66,
    borderRadius: 8,
    backgroundColor: '#111A1F',
    borderWidth: 1,
    borderColor: '#2F3E48',
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pinnedTimerButton: {
    width: 54,
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: '#222D35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinnedTimerButtonText: {
    color: '#D7E0E7',
    fontWeight: '900',
  },
  pinnedTimerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  pinnedTimerLabel: {
    color: '#F0B35B',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  pinnedTimerValue: {
    color: '#F7FAFC',
    fontSize: 26,
    fontWeight: '900',
  },
  pinnedTimerSkip: {
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: '#7DD3C7',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinnedTimerSkipText: {
    color: '#071313',
    fontWeight: '900',
  },
  overviewTimer: {
    borderRadius: 8,
    backgroundColor: '#111A1F',
    borderWidth: 1,
    borderColor: '#2F3E48',
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  overviewTimerLabel: {
    color: '#F0B35B',
    fontWeight: '900',
    textTransform: 'uppercase',
    fontSize: 12,
  },
  overviewTimerValue: {
    color: '#F7FAFC',
    fontSize: 26,
    fontWeight: '900',
  },
  exercisePanel: {
    backgroundColor: '#172027',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#27343D',
  },
  overviewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  overviewExercise: {
    color: '#D8E1E8',
    fontSize: 20,
    fontWeight: '900',
  },
  currentOverviewExercise: {
    color: '#7DD3C7',
  },
  overviewRest: {
    color: '#7DD3C7',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 8,
  },
  skipExerciseButton: {
    minHeight: 38,
    borderRadius: 8,
    backgroundColor: '#26343D',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipExerciseButtonText: {
    color: '#F0B35B',
    fontWeight: '900',
    fontSize: 12,
  },
  setTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2B3943',
  },
  setRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#24313A',
  },
  currentSetRow: {
    backgroundColor: '#25353A',
  },
  completedSetRow: {
    backgroundColor: '#BDFCA1',
  },
  setColumnSmall: {
    width: 54,
    color: '#87939D',
    fontWeight: '900',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  setColumn: {
    flex: 1,
    color: '#87939D',
    fontWeight: '900',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  setKindButton: {
    width: 54,
    minHeight: 52,
    justifyContent: 'center',
  },
  setColumnSmallValue: {
    color: '#F7FAFC',
    fontSize: 18,
    fontWeight: '900',
    paddingLeft: 4,
  },
  warmupSetKind: {
    color: '#F0B35B',
  },
  failureSetKind: {
    color: '#D84A4A',
  },
  dropSetKind: {
    color: '#7DD3C7',
  },
  setCellInput: {
    flex: 1,
    color: '#F7FAFC',
    fontSize: 18,
    fontWeight: '900',
    minHeight: 52,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  setColumnValue: {
    flex: 1,
    color: '#F7FAFC',
    fontSize: 18,
    fontWeight: '900',
  },
  completedSetText: {
    color: '#111A1F',
  },
  checkMarkButton: {
    width: 42,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#E7EAEE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMarkDone: {
    backgroundColor: '#33B93B',
  },
  checkMarkText: {
    color: '#A5ADB5',
    fontSize: 22,
    fontWeight: '900',
  },
  checkMarkTextDone: {
    color: '#FFFFFF',
  },
  addSetButton: {
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: '#222D35',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  addSetButtonText: {
    color: '#F7FAFC',
    fontSize: 16,
    fontWeight: '900',
  },
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.58)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    borderRadius: 8,
    backgroundColor: '#172027',
    borderWidth: 1,
    borderColor: '#27343D',
    padding: 20,
  },
  editorCard: {
    width: '100%',
    maxHeight: '88%',
    borderRadius: 8,
    backgroundColor: '#172027',
  },
  editorContent: {
    padding: 18,
    gap: 12,
  },
  editorLabel: {
    color: '#7DD3C7',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginTop: 4,
  },
  editorInput: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#34444F',
    color: '#F7FAFC',
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '700',
  },
  editorTextArea: {
    minHeight: 86,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  exercisePicker: {
    maxHeight: 220,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#27343D',
  },
  exercisePickRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#26343E',
  },
  exercisePickName: {
    color: '#F7FAFC',
    fontWeight: '800',
    flex: 1,
  },
  emptyText: {
    color: '#9BA8B4',
    padding: 14,
    fontWeight: '700',
  },
  routineEditorBlock: {
    borderRadius: 8,
    backgroundColor: '#101820',
    borderWidth: 1,
    borderColor: '#27343D',
    padding: 12,
    gap: 10,
  },
  routineEditorBlockActive: {
    borderColor: '#7DD3C7',
    backgroundColor: '#16242A',
  },
  routineEditorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dragHandle: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#222D35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragHandleText: {
    color: '#7DD3C7',
    fontSize: 22,
    fontWeight: '900',
  },
  routineSetEditorRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routineSetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
  },
  routineSetIndexHeader: {
    width: 42,
    color: '#87939D',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  routineSetColumnHeader: {
    flex: 1,
    color: '#87939D',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  routineSetActionHeader: {
    width: 38,
    color: '#87939D',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  routineSetKindButton: {
    width: 42,
    minHeight: 44,
    justifyContent: 'center',
  },
  routineSetIndex: {
    color: '#F7FAFC',
    fontSize: 16,
    fontWeight: '900',
  },
  routineSetInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#34444F',
    color: '#F7FAFC',
    paddingHorizontal: 12,
    fontWeight: '800',
  },
  summaryRow: {
    minHeight: 58,
    borderRadius: 8,
    backgroundColor: '#101820',
    borderWidth: 1,
    borderColor: '#27343D',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryValue: {
    color: '#7DD3C7',
    fontSize: 16,
    fontWeight: '900',
  },
  smallSquareButton: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#222D35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallSquareButtonText: {
    color: '#F0B35B',
    fontSize: 18,
    fontWeight: '900',
  },
  modalTitle: {
    color: '#F7FAFC',
    fontSize: 22,
    fontWeight: '900',
  },
  modalCopy: {
    color: '#AAB6C1',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  modalSecondary: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: '#D9E2DF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSecondaryText: {
    color: '#111A1F',
    fontWeight: '900',
  },
  modalPrimary: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: '#F0B35B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryText: {
    color: '#16110A',
    fontWeight: '900',
  },
  modalDanger: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: '#D84A4A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDangerText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  fullWidthDanger: {
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: '#D84A4A',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  kindOptions: {
    gap: 8,
    marginTop: 18,
  },
  kindOption: {
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: '#D9E2DF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindOptionActive: {
    backgroundColor: '#111A1F',
  },
  kindOptionText: {
    color: '#52606A',
    fontWeight: '900',
  },
  kindOptionTextActive: {
    color: '#F7FAFC',
  },
  exerciseList: {
    marginTop: 12,
    gap: 8,
  },
  routineLine: {
    color: '#D6DEE5',
    fontSize: 14,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#34444F',
    color: '#F7FAFC',
    paddingHorizontal: 14,
    fontSize: 15,
  },
  exerciseRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#26343E',
    gap: 14,
  },
  exerciseRowName: {
    color: '#F7FAFC',
    fontSize: 16,
    fontWeight: '800',
  },
  badge: {
    color: '#F0B35B',
    fontSize: 12,
    fontWeight: '900',
  },
  heroPanel: {
    borderRadius: 8,
    backgroundColor: '#172027',
    borderWidth: 1,
    borderColor: '#27343D',
    padding: 18,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  iconButton: {
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#7DD3C7',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonText: {
    color: '#7DD3C7',
    fontSize: 12,
    fontWeight: '900',
  },
  bodyProfileRow: {
    flexDirection: 'row',
    gap: 10,
  },
  weightSummaryRow: {
    minHeight: 86,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 16,
  },
  bigMetric: {
    color: '#F7FAFC',
    fontSize: 42,
    fontWeight: '900',
  },
  sparkline: {
    flex: 1,
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    gap: 7,
  },
  sparkBar: {
    width: 9,
    borderRadius: 6,
    opacity: 0.95,
  },
  compositionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  bodyMetricCard: {
    width: '48%',
    minHeight: 108,
    borderRadius: 8,
    backgroundColor: '#101820',
    borderWidth: 1,
    borderColor: '#27343D',
    padding: 12,
    justifyContent: 'space-between',
  },
  bodyMetricValue: {
    color: '#F7FAFC',
    fontSize: 28,
    fontWeight: '900',
  },
  metricStatus: {
    fontSize: 12,
    fontWeight: '900',
  },
  statusHealthy: {
    color: '#7DD3C7',
  },
  statusHigh: {
    color: '#F0B35B',
  },
  statusVeryHigh: {
    color: '#E15D5D',
  },
  statusLow: {
    color: '#8BB8FF',
  },
  statusUnknown: {
    color: '#9BA8B4',
  },
  bmiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  bmiTrack: {
    height: 8,
    borderRadius: 8,
    marginTop: 18,
    backgroundColor: '#F0B35B',
  },
  bmiMarker: {
    position: 'absolute',
    top: -7,
    width: 22,
    height: 22,
    marginLeft: -11,
    borderRadius: 11,
    backgroundColor: '#7DD3C7',
    borderWidth: 3,
    borderColor: '#172027',
  },
  bmiLabels: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bmiHint: {
    marginTop: 12,
    color: '#F0B35B',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '800',
  },
  segmentedControl: {
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: '#101820',
    borderWidth: 1,
    borderColor: '#27343D',
    padding: 4,
    flexDirection: 'row',
    gap: 4,
  },
  profileSegmentButton: {
    flex: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileSegmentButtonActive: {
    backgroundColor: '#7DD3C7',
  },
  profileSegmentButtonText: {
    color: '#9BA8B4',
    fontWeight: '900',
  },
  profileSegmentButtonTextActive: {
    color: '#071313',
  },
  smallActionButton: {
    minHeight: 36,
    borderRadius: 8,
    backgroundColor: '#222D35',
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  smallActionText: {
    color: '#7DD3C7',
    fontWeight: '900',
  },
  photoStrip: {
    gap: 10,
    paddingVertical: 6,
  },
  photoGroups: {
    gap: 14,
  },
  photoFolder: {
    borderRadius: 8,
    backgroundColor: '#101820',
    borderWidth: 1,
    borderColor: '#27343D',
    overflow: 'hidden',
  },
  photoFolderHeader: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  folderIcon: {
    width: 46,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#223038',
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderIconText: {
    color: '#F0B35B',
    fontSize: 22,
    fontWeight: '900',
  },
  folderChevron: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#222D35',
    color: '#7DD3C7',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 32,
    textAlign: 'center',
  },
  photoGroup: {
    gap: 6,
  },
  photoGroupTitle: {
    color: '#D6DEE5',
    fontSize: 13,
    fontWeight: '900',
  },
  photoCard: {
    width: 128,
    borderRadius: 8,
    backgroundColor: '#101820',
    borderWidth: 1,
    borderColor: '#27343D',
    padding: 8,
    gap: 6,
  },
  viewerScrim: {
    flex: 1,
    backgroundColor: 'rgba(5,9,12,0.96)',
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  viewerTopBar: {
    position: 'absolute',
    left: 18,
    right: 18,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  viewerButton: {
    minHeight: 40,
    borderRadius: 8,
    backgroundColor: '#EAF2EE',
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  viewerButtonText: {
    color: '#111A1F',
    fontWeight: '900',
  },
  viewerDate: {
    color: '#D6DEE5',
    fontWeight: '900',
    flex: 1,
    textAlign: 'right',
  },
  viewerImage: {
    width: '100%',
    flex: 1,
  },
  viewerActions: {
    position: 'absolute',
    left: 18,
    right: 18,
    minHeight: 64,
    borderRadius: 8,
    backgroundColor: 'rgba(17,26,31,0.92)',
    borderWidth: 1,
    borderColor: '#2B3A43',
    padding: 8,
    flexDirection: 'row',
    gap: 10,
  },
  viewerSaveButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: '#EAF2EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerSaveButtonText: {
    color: '#111A1F',
    fontWeight: '900',
    fontSize: 14,
  },
  viewerDeleteButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: '#D84A4A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerDeleteButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
  },
  progressPhoto: {
    width: '100%',
    height: 144,
    borderRadius: 6,
    backgroundColor: '#222D35',
  },
  photoDate: {
    color: '#D6DEE5',
    fontSize: 11,
    fontWeight: '700',
  },
  photoDelete: {
    minHeight: 30,
    borderRadius: 6,
    backgroundColor: '#D84A4A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoDeleteText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  bodyHistoryRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#26343E',
    gap: 12,
  },
  progressRow: {
    minHeight: 46,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#26343E',
  },
  progressName: {
    color: '#F7FAFC',
    fontSize: 15,
    fontWeight: '800',
  },
  progressValue: {
    color: '#7DD3C7',
    fontSize: 15,
    fontWeight: '900',
  },
  medal: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingVertical: 10,
  },
  medalIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#F0B35B',
    color: '#16110A',
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 42,
  },
  medalText: {
    flex: 1,
  },
  tabs: {
    position: 'absolute',
    left: 14,
    right: 14,
    minHeight: 64,
    borderRadius: 8,
    backgroundColor: '#EAF2EE',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    gap: 6,
  },
  tabButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTab: {
    backgroundColor: '#111A1F',
  },
  tabText: {
    color: '#52606A',
    fontSize: 12,
    fontWeight: '900',
  },
  activeTabText: {
    color: '#F7FAFC',
  },
});

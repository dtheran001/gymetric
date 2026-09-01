import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as IntentLauncher from 'expo-intent-launcher';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as MediaLibrary from 'expo-media-library';
import * as NavigationBar from 'expo-navigation-bar';
import * as Notifications from 'expo-notifications';
import * as Sharing from 'expo-sharing';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import {
  createContext,
  Dispatch,
  ReactNode,
  SetStateAction,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ActivityIndicator,
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
  Switch,
  Text,
  TextInput,
  ToastAndroid,
  useColorScheme,
  Vibration,
  View,
} from 'react-native';
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
  ShadowDecorator,
} from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { seedAchievements, seedExercises, seedLogs, seedRoutines } from './data/seed';
import {
  loadAppPreferences,
  loadPersistedData,
  PersistedData,
  replacePersistedData,
  saveAppPreferences,
  savePersistedData,
} from './data/storage';
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
  AppPreferences,
  defaultAppPreferences,
} from './domain/preferences';
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
  darkTheme,
  lightTheme,
  resolveLegacyColor,
  ResolvedTheme,
  ThemeColorsContext,
  ThemeColors,
} from './ui/theme';
import {
  estimateRoutineMinutes,
  getNextSetKind,
  getSetKindLabel,
  getTodayWeekday,
  weekdayOptions,
} from './workout/routineUtils';
import { ActiveWorkout, ActualSetInput, SetEditorTarget, Tab, WorkoutSummary, WorkoutView } from './workout/sessionTypes';

const ACTIVE_WORKOUT_NOTIFICATION_ID = 'gymetric-active-workout';
const REST_FINISHED_NOTIFICATION_ID = 'gymetric-rest-finished';
const WORKOUT_NOTIFICATION_CHANNEL_ID = 'workout-status';
const REST_NOTIFICATION_CHANNEL_ID = 'rest-timer-vibrate-v2';
const REST_NOTIFICATION_SOUND_ONLY_CHANNEL_ID = 'rest-timer-sound-only-v2';

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const notificationType = notification.request.content.data?.type;
    const isRestFinished = notificationType === 'rest-finished';

    return {
      shouldShowAlert: true,
      shouldShowBanner: isRestFinished,
      shouldShowList: true,
      shouldPlaySound: isRestFinished,
      shouldSetBadge: false,
      priority: isRestFinished
        ? Notifications.AndroidNotificationPriority.MAX
        : Notifications.AndroidNotificationPriority.LOW,
    };
  },
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
const KG_TO_LB = 2.2046226218;
const CM_TO_IN = 0.3937007874;

function displayWeight(valueKg: number, unit: AppPreferences['weightUnit']) {
  return unit === 'lb' ? valueKg * KG_TO_LB : valueKg;
}

function weightToKg(value: number, unit: AppPreferences['weightUnit']) {
  return unit === 'lb' ? value / KG_TO_LB : value;
}

function displayBodyLength(valueCm: number, unit: AppPreferences['bodyUnit']) {
  return unit === 'in' ? valueCm * CM_TO_IN : valueCm;
}

function bodyLengthToCm(value: number, unit: AppPreferences['bodyUnit']) {
  return unit === 'in' ? value / CM_TO_IN : value;
}

function formatDecimal(value: number, digits = 1) {
  return Number(value.toFixed(digits)).toString();
}

type AppSettingsContextValue = {
  colors: ThemeColors;
  preferences: AppPreferences;
  preferencesReady: boolean;
  updatePreferences: (changes: Partial<AppPreferences>) => void;
};

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

function useAppSettings() {
  const value = useContext(AppSettingsContext);
  if (!value) {
    throw new Error('useAppSettings debe usarse dentro de AppSettingsContext.');
  }
  return value;
}

export default function App() {
  const systemScheme = useColorScheme();
  const [preferences, setPreferences] = useState(defaultAppPreferences);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const resolvedTheme: ResolvedTheme =
    preferences.theme === 'system'
      ? systemScheme === 'light'
        ? 'light'
        : 'dark'
      : preferences.theme;
  const colors = resolvedTheme === 'light' ? lightTheme : darkTheme;

  styles = resolvedTheme === 'light' ? lightStyles : darkStyles;

  useEffect(() => {
    let mounted = true;
    loadAppPreferences()
      .then((loadedPreferences) => {
        if (mounted) {
          setPreferences(loadedPreferences);
          setPreferencesReady(true);
        }
      })
      .catch(() => {
        if (mounted) {
          setPreferencesReady(true);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'android') {
      NavigationBar.setBackgroundColorAsync(colors.background).catch(() => undefined);
      NavigationBar.setBorderColorAsync(colors.background).catch(() => undefined);
      NavigationBar.setButtonStyleAsync(colors.scheme === 'dark' ? 'light' : 'dark').catch(() => undefined);
    }
  }, [colors]);

  function updatePreferences(changes: Partial<AppPreferences>) {
    setPreferences((current) => {
      const next = { ...current, ...changes };
      saveAppPreferences(next).catch(() => undefined);
      return next;
    });
  }

  return (
    <AppSettingsContext.Provider value={{ colors, preferences, preferencesReady, updatePreferences }}>
      <ThemeColorsContext.Provider value={colors}>
        <GestureHandlerRootView style={styles.gestureRoot}>
          <SafeAreaProvider>
            <GymetricApp />
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </ThemeColorsContext.Provider>
    </AppSettingsContext.Provider>
  );
}

function GymetricApp() {
  const { colors, preferences, preferencesReady, updatePreferences } = useAppSettings();
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
  const [minimumLaunchReady, setMinimumLaunchReady] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  const todayWeekday = getTodayWeekday();
  const suggestedRoutines = routines.filter((routine) => routine.preferredDays?.includes(todayWeekday));
  const nextRoutine = suggestedRoutines[0] ?? routines[0];
  const totalSetsLogged = logs.length;
  const latestAchievement = achievements[0];
  const notificationRoutineExercise = activeWorkout?.routine.exercises[activeWorkout.exerciseIndex];
  const notificationRoutineSet = notificationRoutineExercise?.sets[activeWorkout?.setIndex ?? 0];
  const notificationSetKey =
    notificationRoutineExercise && notificationRoutineSet
      ? `${notificationRoutineExercise.id}:${notificationRoutineSet.id}`
      : null;
  const notificationInput = notificationSetKey ? activeWorkout?.inputs[notificationSetKey] : null;
  const activeNotificationSignature = activeWorkout
    ? [
        activeWorkout.routine.id,
        activeWorkout.exerciseIndex,
        activeWorkout.setIndex,
        activeWorkout.isResting,
        notificationInput?.weightKg,
        notificationInput?.reps,
        preferences.weightUnit,
      ].join('|')
    : 'inactive';

  useEffect(() => {
    const tag = 'gymetric-active-workout';
    if (preferences.keepScreenAwake && activeWorkout) {
      activateKeepAwakeAsync(tag).catch(() => undefined);
    } else {
      deactivateKeepAwake(tag);
    }
    return () => {
      deactivateKeepAwake(tag);
    };
  }, [activeWorkout, preferences.keepScreenAwake]);

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
    const timeout = setTimeout(() => setMinimumLaunchReady(true), 700);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (preferences.restNotificationsEnabled) {
      Notifications.requestPermissionsAsync();
    } else {
      Notifications.cancelScheduledNotificationAsync(REST_FINISHED_NOTIFICATION_ID).catch(() => undefined);
      Notifications.dismissNotificationAsync(REST_FINISHED_NOTIFICATION_ID).catch(() => undefined);
    }
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync(REST_NOTIFICATION_CHANNEL_ID, {
        name: 'Fin del descanso',
        description: 'Avisos cuando termina un temporizador de descanso.',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        audioAttributes: {
          usage: Notifications.AndroidAudioUsage.MEDIA,
          contentType: Notifications.AndroidAudioContentType.SONIFICATION,
        },
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
      Notifications.setNotificationChannelAsync(REST_NOTIFICATION_SOUND_ONLY_CHANNEL_ID, {
        name: 'Fin del descanso sin vibración',
        description: 'Avisos sonoros sin vibración cuando termina un descanso.',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        enableVibrate: false,
        audioAttributes: {
          usage: Notifications.AndroidAudioUsage.MEDIA,
          contentType: Notifications.AndroidAudioContentType.SONIFICATION,
        },
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
      Notifications.setNotificationChannelAsync(WORKOUT_NOTIFICATION_CHANNEL_ID, {
        name: 'Entrenamiento activo',
        description: 'Información persistente del ejercicio y la serie actuales.',
        importance: Notifications.AndroidImportance.LOW,
        sound: null,
        enableVibrate: false,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }
  }, [preferences.restNotificationsEnabled]);

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
    if (activeWorkout) {
      updateActiveWorkoutNotification(activeWorkout).catch(() => undefined);
    } else {
      dismissActiveWorkoutNotification();
      Notifications.dismissNotificationAsync(REST_FINISHED_NOTIFICATION_ID).catch(() => undefined);
      Notifications.cancelScheduledNotificationAsync(REST_FINISHED_NOTIFICATION_ID).catch(() => undefined);
    }
  }, [activeNotificationSignature]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        Notifications.dismissNotificationAsync(REST_FINISHED_NOTIFICATION_ID).catch(() => undefined);
        syncRestClock();
      }
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showSettings) {
        setShowSettings(false);
        return true;
      }
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
    showSettings,
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
          weightKg: formatDecimal(displayWeight(set.targetWeightKg, preferences.weightUnit)),
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

      if (preferences.restVibrationEnabled) {
        Vibration.vibrate([0, 250, 120, 250]);
      }
      ToastAndroid.show('Descanso terminado', ToastAndroid.SHORT);
      return { ...current, restRemaining: 0, restEndsAt: null, restNotificationId: null, isResting: false };
    });
  }

  async function updateActiveWorkoutNotification(workout: ActiveWorkout) {
    const routineExercise = workout.routine.exercises[workout.exerciseIndex];
    const routineSet = routineExercise?.sets[workout.setIndex];
    if (!routineExercise || !routineSet) {
      return;
    }

    const exercise = exercises.find((item) => item.id === routineExercise.exerciseId);
    const setKey = `${routineExercise.id}:${routineSet.id}`;
    const input = workout.inputs[setKey];
    const weight = input?.weightKg || formatDecimal(displayWeight(routineSet.targetWeightKg, preferences.weightUnit));
    const reps = input?.reps || routineSet.targetReps.toString();
    const seriesText = `Serie ${workout.setIndex + 1}/${routineExercise.sets.length} · ${weight} ${
      preferences.weightUnit
    } × ${reps} reps`;

    const permissions = await Notifications.getPermissionsAsync();
    if (!permissions.granted) {
      return;
    }

    await Notifications.scheduleNotificationAsync({
      identifier: ACTIVE_WORKOUT_NOTIFICATION_ID,
      content: {
        title: exercise?.name ?? workout.routine.name,
        subtitle: 'Gymetric · Entrenamiento activo',
        body: workout.isResting
          ? `${seriesText} · Descanso ${formatRestTime(workout.restRemaining)}`
          : seriesText,
        data: {
          type: 'active-workout',
          routineId: workout.routine.id,
          exerciseId: routineExercise.exerciseId,
        },
        color: '#294BFF',
        sticky: Platform.OS === 'android',
        autoDismiss: false,
        sound: false,
        priority: Notifications.AndroidNotificationPriority.LOW,
      },
      trigger:
        Platform.OS === 'android'
          ? {
              channelId: WORKOUT_NOTIFICATION_CHANNEL_ID,
            }
          : null,
    });
  }

  function dismissActiveWorkoutNotification() {
    Notifications.dismissNotificationAsync(ACTIVE_WORKOUT_NOTIFICATION_ID).catch(() => undefined);
  }

  async function scheduleRestNotification(seconds: number) {
    if (!preferences.restNotificationsEnabled) {
      return null;
    }

    await Notifications.cancelScheduledNotificationAsync(REST_FINISHED_NOTIFICATION_ID).catch(() => undefined);
    await Notifications.dismissNotificationAsync(REST_FINISHED_NOTIFICATION_ID).catch(() => undefined);

    const permissions = await Notifications.getPermissionsAsync();
    if (!permissions.granted) {
      return null;
    }

    return Notifications.scheduleNotificationAsync({
      identifier: REST_FINISHED_NOTIFICATION_ID,
      content: {
        title: 'Descanso terminado',
        subtitle: 'Gymetric',
        body: 'Ya puedes empezar la siguiente serie.',
        data: {
          type: 'rest-finished',
        },
        color: '#294BFF',
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        vibrate: preferences.restVibrationEnabled ? [0, 250, 120, 250] : undefined,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(seconds, 1),
        channelId: preferences.restVibrationEnabled
          ? REST_NOTIFICATION_CHANNEL_ID
          : REST_NOTIFICATION_SOUND_ONLY_CHANNEL_ID,
      },
    });
  }

  function cancelRestNotification(notificationId: string | null) {
    if (notificationId) {
      Notifications.cancelScheduledNotificationAsync(notificationId);
      Notifications.dismissNotificationAsync(notificationId).catch(() => undefined);
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
    const weightKg = Number.isFinite(actualWeight)
      ? weightToKg(actualWeight, preferences.weightUnit)
      : routineSet.targetWeightKg;
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
            weightKg: formatDecimal(displayWeight(previousSet.targetWeightKg, preferences.weightUnit)),
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
      heightCm: bodyProfile?.heightCm
        ? formatDecimal(displayBodyLength(bodyProfile.heightCm, preferences.bodyUnit))
        : '',
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

    const enteredHeight = Number.parseFloat(bodyProfileDraft.heightCm.replace(',', '.')) || 0;
    const heightCm = bodyLengthToCm(enteredHeight, preferences.bodyUnit);
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
      weightKg: weightToKg(
        Number.parseFloat(bodyMeasurementDraft.weightKg.replace(',', '.')) || 0,
        preferences.weightUnit,
      ),
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
          const enteredWeight = Number.parseFloat(actual.weightKg.replace(',', '.'));
          const weightKg = weightToKg(enteredWeight, preferences.weightUnit);
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

  async function exportData() {
    try {
      const backup = {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        app: 'Gymetric',
        preferences,
        data: {
          ...buildPersistedData(),
          progressPhotos: [],
        },
      };
      const fileUri = `${FileSystem.cacheDirectory}gymetric-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(backup, null, 2));
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('Compartir archivos no está disponible en este dispositivo.');
      }
      await Sharing.shareAsync(fileUri, {
        dialogTitle: 'Exportar copia de Gymetric',
        mimeType: 'application/json',
      });
    } catch (error: unknown) {
      Alert.alert('No se pudo exportar', error instanceof Error ? error.message : 'Error desconocido.');
    }
  }

  async function importData() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (result.canceled) {
        return;
      }
      const raw = await FileSystem.readAsStringAsync(result.assets[0].uri);
      const backup = JSON.parse(raw) as {
        schemaVersion?: number;
        preferences?: Partial<AppPreferences>;
        data?: Partial<PersistedData>;
      };
      const data = backup.data;
      if (
        backup.schemaVersion !== 1 ||
        !data ||
        !Array.isArray(data.exercises) ||
        !Array.isArray(data.routines) ||
        !Array.isArray(data.logs) ||
        !Array.isArray(data.achievements) ||
        !Array.isArray(data.bodyMeasurements)
      ) {
        throw new Error('El archivo no es una copia válida de Gymetric.');
      }

      Alert.alert(
        'Importar copia',
        'Se reemplazarán rutinas, ejercicios, entrenamientos y mediciones. Las fotos guardadas en este móvil se conservarán.',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Importar',
            style: 'destructive',
            onPress: () => {
              const importedData: PersistedData = {
                exercises: data.exercises!,
                routines: data.routines!,
                logs: data.logs!,
                achievements: data.achievements!,
                bodyProfile: data.bodyProfile ?? null,
                bodyMeasurements: data.bodyMeasurements!,
                progressPhotos,
              };
              replacePersistedData(importedData)
                .then(() => {
                  setExercises(importedData.exercises);
                  setRoutines(importedData.routines);
                  setLogs(importedData.logs);
                  setAchievements(importedData.achievements);
                  setBodyProfile(importedData.bodyProfile);
                  setBodyMeasurements(importedData.bodyMeasurements);
                  if (backup.preferences) {
                    updatePreferences(backup.preferences);
                  }
                  Alert.alert('Copia importada', 'Tus datos se han restaurado correctamente.');
                })
                .catch((error: unknown) =>
                  Alert.alert('No se pudo importar', error instanceof Error ? error.message : 'Error desconocido.'),
                );
            },
          },
        ],
      );
    } catch (error: unknown) {
      Alert.alert('No se pudo importar', error instanceof Error ? error.message : 'Error desconocido.');
    }
  }

  if (!isStorageReady || !preferencesReady || !minimumLaunchReady) {
    return (
      <View style={styles.loadingScreen}>
        <StatusBar style={colors.scheme === 'dark' ? 'light' : 'dark'} />
        <Image source={require('../assets/gymetric-icon-dark.png')} style={styles.launchLogo} />
        <Text style={styles.kicker}>Gymetric</Text>
        <Text style={styles.loadingTitle}>Entrena con datos claros</Text>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (showSettings) {
    return (
      <SettingsScreen
        close={() => setShowSettings(false)}
        exportData={exportData}
        importData={importData}
      />
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.shell}>
      <StatusBar style={colors.scheme === 'dark' ? 'light' : 'dark'} />
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 10, 18) }]}>
        <View style={styles.headerTitle}>
          <Text style={styles.kicker}>Gymetric</Text>
          <Text style={styles.title}>Entrena con datos claros</Text>
        </View>
        <Pressable
          accessibilityLabel="Abrir ajustes"
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => setShowSettings(true)}
          style={styles.settingsButton}
        >
          <MaterialIcons color={colors.text} name="settings" size={26} />
        </Pressable>
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

function SettingsScreen({
  close,
  exportData,
  importData,
}: {
  close: () => void;
  exportData: () => void;
  importData: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors, preferences, updatePreferences } = useAppSettings();

  async function openExactAlarmSettings() {
    try {
      await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.REQUEST_SCHEDULE_EXACT_ALARM, {
        data: 'package:com.danyk.gymetric',
      });
    } catch {
      Alert.alert(
        'No se pudieron abrir los ajustes',
        'Busca Gymetric en Ajustes > Aplicaciones > Acceso especial > Alarmas y recordatorios.',
      );
    }
  }

  return (
    <View style={styles.settingsScreen}>
      <StatusBar style={colors.scheme === 'dark' ? 'light' : 'dark'} />
      <View style={[styles.settingsHeader, { paddingTop: Math.max(insets.top + 8, 18) }]}>
        <Pressable accessibilityLabel="Volver" hitSlop={10} onPress={close} style={styles.settingsBack}>
          <MaterialIcons color={colors.text} name="arrow-back" size={26} />
        </Pressable>
        <Text style={styles.settingsTitle}>Ajustes</Text>
        <View style={styles.settingsBack} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.settingsContent, { paddingBottom: Math.max(insets.bottom, 18) + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <SettingsSection icon="palette" title="Apariencia">
          <Text style={styles.settingDescription}>
            Elige el aspecto de Gymetric. Con “Sistema”, la app seguirá el modo de tu móvil.
          </Text>
          <View style={styles.themeChoices}>
            <ThemeChoice
              active={preferences.theme === 'system'}
              icon="brightness-auto"
              label="Sistema"
              onPress={() => updatePreferences({ theme: 'system' })}
            />
            <ThemeChoice
              active={preferences.theme === 'light'}
              icon="light-mode"
              label="Claro"
              onPress={() => updatePreferences({ theme: 'light' })}
            />
            <ThemeChoice
              active={preferences.theme === 'dark'}
              icon="dark-mode"
              label="Oscuro"
              onPress={() => updatePreferences({ theme: 'dark' })}
            />
          </View>
        </SettingsSection>

        <SettingsSection icon="straighten" title="Unidades">
          <UnitSetting
            label="Peso"
            options={[
              { label: 'kg', value: 'kg' },
              { label: 'lb', value: 'lb' },
            ]}
            selected={preferences.weightUnit}
            onSelect={(weightUnit) => updatePreferences({ weightUnit: weightUnit as AppPreferences['weightUnit'] })}
          />
          <UnitSetting
            label="Distancia"
            options={[
              { label: 'km', value: 'km' },
              { label: 'mi', value: 'mi' },
            ]}
            selected={preferences.distanceUnit}
            onSelect={(distanceUnit) =>
              updatePreferences({ distanceUnit: distanceUnit as AppPreferences['distanceUnit'] })
            }
          />
          <UnitSetting
            label="Medidas corporales"
            options={[
              { label: 'cm', value: 'cm' },
              { label: 'in', value: 'in' },
            ]}
            selected={preferences.bodyUnit}
            onSelect={(bodyUnit) => updatePreferences({ bodyUnit: bodyUnit as AppPreferences['bodyUnit'] })}
          />
        </SettingsSection>

        <SettingsSection icon="notifications" title="Notificaciones">
          <SwitchSetting
            description="Avisa cuando termina el descanso, incluso con la app en segundo plano."
            label="Temporizador de descanso"
            value={preferences.restNotificationsEnabled}
            onValueChange={(restNotificationsEnabled) => updatePreferences({ restNotificationsEnabled })}
          />
          <SwitchSetting
            description="Añade vibración al aviso de fin de descanso."
            label="Vibración"
            value={preferences.restVibrationEnabled}
            onValueChange={(restVibrationEnabled) => updatePreferences({ restVibrationEnabled })}
          />
          {Platform.OS === 'android' && (
            <Pressable onPress={openExactAlarmSettings} style={styles.settingAction}>
              <MaterialIcons color={colors.primary} name="alarm-on" size={23} />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Permitir alarmas precisas</Text>
                <Text style={styles.settingDescription}>
                  Evita que Android retrase el aviso cuando termina el descanso.
                </Text>
              </View>
              <MaterialIcons color={colors.textSubtle} name="open-in-new" size={21} />
            </Pressable>
          )}
          <View style={styles.settingRow}>
            <View style={styles.settingText}>
              <Text style={styles.settingLabel}>Tono</Text>
              <Text style={styles.settingDescription}>Predeterminado · más tonos próximamente</Text>
            </View>
            <MaterialIcons color={colors.textSubtle} name="chevron-right" size={24} />
          </View>
        </SettingsSection>

        <SettingsSection icon="fitness-center" title="Entrenamiento">
          <SwitchSetting
            description="Evita que la pantalla se apague mientras entrenas."
            label="Mantener pantalla activa"
            value={preferences.keepScreenAwake}
            onValueChange={(keepScreenAwake) => updatePreferences({ keepScreenAwake })}
          />
        </SettingsSection>

        <SettingsSection icon="save-alt" title="Tus datos">
          <Pressable onPress={exportData} style={styles.settingAction}>
            <MaterialIcons color={colors.primary} name="ios-share" size={23} />
            <View style={styles.settingText}>
              <Text style={styles.settingLabel}>Exportar copia</Text>
              <Text style={styles.settingDescription}>Guarda rutinas, registros, medidas y preferencias.</Text>
            </View>
          </Pressable>
          <Pressable onPress={importData} style={styles.settingAction}>
            <MaterialIcons color={colors.primary} name="file-download" size={23} />
            <View style={styles.settingText}>
              <Text style={styles.settingLabel}>Importar copia</Text>
              <Text style={styles.settingDescription}>Las fotos permanecen guardadas solo en este móvil.</Text>
            </View>
          </Pressable>
        </SettingsSection>

        <View style={styles.settingsFooter}>
          <Text style={styles.kicker}>Gymetric</Text>
          <Text style={styles.settingDescription}>Versión 1.0.0 · Datos locales y bajo tu control</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function SettingsSection({
  children,
  icon,
  title,
}: {
  children: ReactNode;
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
}) {
  const { colors } = useAppSettings();
  return (
    <View style={styles.settingsSection}>
      <View style={styles.settingsSectionHeader}>
        <View style={styles.settingsSectionIcon}>
          <MaterialIcons color={colors.primary} name={icon} size={21} />
        </View>
        <Text style={styles.settingsSectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function ThemeChoice({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useAppSettings();
  return (
    <Pressable onPress={onPress} style={[styles.themeChoice, active && styles.themeChoiceActive]}>
      <MaterialIcons color={active ? colors.onPrimary : colors.textMuted} name={icon} size={22} />
      <Text style={[styles.themeChoiceText, active && styles.themeChoiceTextActive]}>{label}</Text>
    </Pressable>
  );
}

function UnitSetting({
  label,
  onSelect,
  options,
  selected,
}: {
  label: string;
  onSelect: (value: string) => void;
  options: { label: string; value: string }[];
  selected: string;
}) {
  return (
    <View style={styles.unitSetting}>
      <Text style={styles.settingLabel}>{label}</Text>
      <View style={styles.unitOptions}>
        {options.map((option) => (
          <Pressable
            key={option.value}
            onPress={() => onSelect(option.value)}
            style={[styles.unitOption, selected === option.value && styles.unitOptionActive]}
          >
            <Text style={[styles.unitOptionText, selected === option.value && styles.unitOptionTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function SwitchSetting({
  description,
  label,
  onValueChange,
  value,
}: {
  description: string;
  label: string;
  onValueChange: (value: boolean) => void;
  value: boolean;
}) {
  const { colors } = useAppSettings();
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingText}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingDescription}>{description}</Text>
      </View>
      <Switch
        onValueChange={onValueChange}
        thumbColor={colors.scheme === 'dark' ? colors.text : '#FFFFFF'}
        trackColor={{ false: colors.borderStrong, true: colors.primary }}
        value={value}
      />
    </View>
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
  const { preferences } = useAppSettings();
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
                label={`${preferences.weightUnit} objetivo ${formatDecimal(
                  displayWeight(set.targetWeightKg, preferences.weightUnit),
                )}`}
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
  const { preferences } = useAppSettings();
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
                        formatDecimal(displayWeight(set.targetWeightKg, preferences.weightUnit))
                      }
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
  const { colors, preferences } = useAppSettings();
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
                          value={formatDecimal(displayWeight(set.targetWeightKg, preferences.weightUnit))}
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
  const { preferences } = useAppSettings();
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
            <Metric
              label="Volumen"
              value={`${Math.round(displayWeight(volume, preferences.weightUnit))} ${preferences.weightUnit}`}
            />
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
                  {formatDecimal(displayWeight(log.weightKg, preferences.weightUnit))} {preferences.weightUnit} x{' '}
                  {log.reps}
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
  const { colors, preferences } = useAppSettings();
  const [openPhotoGroupKey, setOpenPhotoGroupKey] = useState<string | null>(null);
  const [areRecordsExpanded, setAreRecordsExpanded] = useState(false);
  const [areAchievementsExpanded, setAreAchievementsExpanded] = useState(false);
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
          <Metric
            label="Altura"
            value={
              bodyProfile?.heightCm
                ? `${formatDecimal(displayBodyLength(bodyProfile.heightCm, preferences.bodyUnit))} ${
                    preferences.bodyUnit
                  }`
                : '--'
            }
          />
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
            <Text style={styles.bigMetric}>
              {latestMeasurement
                ? formatDecimal(displayWeight(latestMeasurement.weightKg, preferences.weightUnit))
                : '--'}
            </Text>
            <Text style={styles.metricLabel}>{preferences.weightUnit}</Text>
          </View>
          <Sparkline measurements={weightHistory} metric="weightKg" color={colors.warning} />
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
            Con{' '}
            {formatDecimal(displayWeight(latestMeasurement?.weightKg ?? 0, preferences.weightUnit))}{' '}
            {preferences.weightUnit} y {formatDecimal(displayBodyLength(bodyProfile.heightCm, preferences.bodyUnit))}{' '}
            {preferences.bodyUnit}, este IMC es correcto. Para un IMC cercano a 23.7 la altura sería aprox.{' '}
            {formatDecimal(displayBodyLength(referenceHeight, preferences.bodyUnit), 0)} {preferences.bodyUnit}.
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
                <MaterialIcons
                  color={colors.primary}
                  name={openPhotoGroupKey === group.key ? 'expand-more' : 'chevron-right'}
                  size={24}
                />
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
                {formatDecimal(displayWeight(measurement.weightKg, preferences.weightUnit))} {preferences.weightUnit} ·
                grasa {measurement.bodyFatPct}% · musculo {measurement.musclePct}% · agua{' '}
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
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: areRecordsExpanded }}
          style={styles.collapsibleHeader}
          onPress={() => setAreRecordsExpanded((current) => !current)}
        >
          <View style={styles.collapsibleContent}>
            <View style={styles.collapsibleTitleRow}>
              <Text style={styles.collapsibleTitle}>Récords por ejercicio</Text>
              <MaterialIcons
                color={colors.primary}
                name={areRecordsExpanded ? 'expand-more' : 'chevron-right'}
                size={24}
              />
            </View>
            <Text style={styles.muted}>{exercises.length} ejercicios</Text>
          </View>
        </Pressable>
        {areRecordsExpanded &&
          exercises.map((exercise) => (
            <View key={exercise.id} style={styles.progressRow}>
              <Text style={styles.progressName}>{exercise.name}</Text>
              <Text style={styles.progressValue}>
                {formatDecimal(displayWeight(getPersonalBest(logs, exercise.id), preferences.weightUnit))}{' '}
                {preferences.weightUnit}
              </Text>
            </View>
          ))}
      </View>

      <View style={styles.panel}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: areAchievementsExpanded }}
          style={styles.collapsibleHeader}
          onPress={() => setAreAchievementsExpanded((current) => !current)}
        >
          <View style={styles.collapsibleContent}>
            <View style={styles.collapsibleTitleRow}>
              <Text style={styles.collapsibleTitle}>Medallas</Text>
              <MaterialIcons
                color={colors.primary}
                name={areAchievementsExpanded ? 'expand-more' : 'chevron-right'}
                size={24}
              />
            </View>
            <Text style={styles.muted}>{achievements.length} conseguidas</Text>
          </View>
        </Pressable>
        {areAchievementsExpanded &&
          achievements.map((achievement) => (
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
  const { preferences } = useAppSettings();
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
            placeholder={`Altura en ${preferences.bodyUnit}`}
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
  const { preferences } = useAppSettings();
  if (!draft) {
    return null;
  }

  return (
    <Modal transparent animationType="slide" visible onRequestClose={close}>
      <View style={styles.modalScrim}>
        <ScrollView style={styles.editorCard} contentContainerStyle={styles.editorContent}>
          <Text style={styles.modalTitle}>Nueva medicion</Text>
          <Text style={styles.muted}>La fecha se guarda automaticamente con el momento actual.</Text>
          <MeasurementInput
            label={`Peso ${preferences.weightUnit}`}
            value={draft.weightKg}
            onChange={(weightKg) => setDraft((current) => (current ? { ...current, weightKg } : current))}
          />
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
      <Text adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={1} style={styles.metricValue}>
        {value}
      </Text>
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

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
  settingsScreen: {
    flex: 1,
    backgroundColor: theme.background,
  },
  settingsHeader: {
    minHeight: 76,
    paddingHorizontal: 18,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: theme.background,
  },
  settingsBack: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  settingsTitle: {
    color: theme.text,
    fontSize: 22,
    fontWeight: '900',
  },
  settingsContent: {
    padding: 18,
    gap: 16,
  },
  settingsSection: {
    padding: 18,
    gap: 16,
    borderRadius: 18,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  settingsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  settingsSectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surfaceElevated,
  },
  settingsSectionTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '900',
  },
  themeChoices: {
    flexDirection: 'row',
    gap: 8,
  },
  themeChoice: {
    flex: 1,
    minHeight: 76,
    borderRadius: 14,
    gap: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.border,
  },
  themeChoiceActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  themeChoiceText: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  themeChoiceTextActive: {
    color: theme.onPrimary,
  },
  unitSetting: {
    gap: 8,
  },
  unitOptions: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 12,
    backgroundColor: theme.surfaceElevated,
  },
  unitOption: {
    flex: 1,
    minHeight: 42,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitOptionActive: {
    backgroundColor: theme.primary,
  },
  unitOptionText: {
    color: theme.textMuted,
    fontWeight: '900',
  },
  unitOptionTextActive: {
    color: theme.onPrimary,
  },
  settingRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  settingAction: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 4,
  },
  settingText: {
    flex: 1,
    gap: 3,
  },
  settingLabel: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '800',
  },
  settingDescription: {
    color: theme.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  settingsFooter: {
    alignItems: 'center',
    gap: 5,
    paddingVertical: 18,
  },
  shell: {
    flex: 1,
    backgroundColor: resolveLegacyColor('#101418', theme),
  },
  gestureRoot: {
    flex: 1,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: resolveLegacyColor('#101418', theme),
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  launchLogo: {
    width: 152,
    height: 152,
    borderRadius: 34,
    marginBottom: 4,
  },
  loadingTitle: {
    color: resolveLegacyColor('#F7FAFC', theme),
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 8,
  },
  storageBanner: {
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: resolveLegacyColor('#D84A4A', theme),
    padding: 10,
  },
  storageBannerText: {
    color: resolveLegacyColor('#FFFFFF', theme),
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
    color: resolveLegacyColor('#7DD3C7', theme),
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    color: resolveLegacyColor('#F7FAFC', theme),
    fontSize: 26,
    fontWeight: '900',
    marginTop: 4,
  },
  content: {
    padding: 20,
  },
  stack: {
    gap: 14,
  },
  hero: {
    backgroundColor: resolveLegacyColor('#1B242B', theme),
    borderRadius: 8,
    padding: 20,
    borderWidth: 1,
    borderColor: resolveLegacyColor('#2D3A43', theme),
  },
  panel: {
    backgroundColor: resolveLegacyColor('#172027', theme),
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: resolveLegacyColor('#27343D', theme),
  },
  workoutCard: {
    backgroundColor: resolveLegacyColor('#EAF2EE', theme),
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
    color: resolveLegacyColor('#7DD3C7', theme),
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  eyebrow: {
    color: resolveLegacyColor('#7DD3C7', theme),
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  h1: {
    color: resolveLegacyColor('#F7FAFC', theme),
    fontSize: 32,
    fontWeight: '900',
  },
  h2: {
    color: resolveLegacyColor('#F7FAFC', theme),
    fontSize: 24,
    fontWeight: '900',
  },
  heroCopy: {
    color: resolveLegacyColor('#BAC6CF', theme),
    fontSize: 16,
    lineHeight: 23,
    marginTop: 8,
    marginBottom: 18,
  },
  panelTitle: {
    color: resolveLegacyColor('#F7FAFC', theme),
    fontSize: 18,
    fontWeight: '900',
  },
  muted: {
    color: resolveLegacyColor('#9BA8B4', theme),
    fontSize: 13,
    lineHeight: 19,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: resolveLegacyColor('#7DD3C7', theme),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: resolveLegacyColor('#071313', theme),
    fontWeight: '900',
    fontSize: 15,
  },
  secondaryButton: {
    marginTop: 14,
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: resolveLegacyColor('#7DD3C7', theme),
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: resolveLegacyColor('#7DD3C7', theme),
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
    borderColor: resolveLegacyColor('#7DD3C7', theme),
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonPrimary: {
    flex: 1,
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: resolveLegacyColor('#7DD3C7', theme),
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactButton: {
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: resolveLegacyColor('#7DD3C7', theme),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  compactButtonText: {
    color: resolveLegacyColor('#071313', theme),
    fontWeight: '900',
  },
  endButton: {
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: resolveLegacyColor('#F0B35B', theme),
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endButtonText: {
    color: resolveLegacyColor('#F0B35B', theme),
    fontSize: 12,
    fontWeight: '900',
  },
  segmented: {
    marginTop: 16,
    backgroundColor: resolveLegacyColor('#0F151A', theme),
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
    backgroundColor: resolveLegacyColor('#EAF2EE', theme),
  },
  segmentText: {
    color: resolveLegacyColor('#8F9CA7', theme),
    fontWeight: '900',
  },
  activeSegmentText: {
    color: resolveLegacyColor('#111A1F', theme),
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
    width: '48%',
    minHeight: 92,
    backgroundColor: resolveLegacyColor('#222D35', theme),
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: resolveLegacyColor('#31404A', theme),
    justifyContent: 'space-between',
  },
  metricValue: {
    color: resolveLegacyColor('#F7FAFC', theme),
    fontSize: 24,
    fontWeight: '900',
  },
  metricLabel: {
    color: resolveLegacyColor('#AAB6C1', theme),
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
    backgroundColor: resolveLegacyColor('#DDE8E3', theme),
    borderRadius: 8,
    padding: 12,
  },
  actualInputLabel: {
    color: resolveLegacyColor('#52606A', theme),
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 8,
  },
  actualInput: {
    color: resolveLegacyColor('#111A1F', theme),
    fontSize: 26,
    fontWeight: '900',
    minHeight: 42,
    padding: 0,
  },
  exerciseName: {
    color: resolveLegacyColor('#111A1F', theme),
    fontSize: 28,
    fontWeight: '900',
  },
  setMeta: {
    color: resolveLegacyColor('#54616B', theme),
    fontSize: 14,
    fontWeight: '800',
  },
  restBox: {
    borderRadius: 8,
    padding: 18,
    backgroundColor: theme.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.borderStrong,
    alignItems: 'center',
  },
  restLabel: {
    color: theme.warning,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  restTime: {
    color: theme.text,
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
    borderColor: theme.borderStrong,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerButtonText: {
    color: theme.text,
    fontWeight: '900',
  },
  timerButtonPrimary: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: theme.warning,
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
    backgroundColor: theme.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.borderStrong,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pinnedTimerButton: {
    width: 54,
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinnedTimerButtonText: {
    color: theme.text,
    fontWeight: '900',
  },
  pinnedTimerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  pinnedTimerLabel: {
    color: theme.warning,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  pinnedTimerValue: {
    color: theme.text,
    fontSize: 26,
    fontWeight: '900',
  },
  pinnedTimerSkip: {
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: theme.primary,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinnedTimerSkipText: {
    color: theme.onPrimary,
    fontWeight: '900',
  },
  overviewTimer: {
    borderRadius: 8,
    backgroundColor: theme.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.borderStrong,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  overviewTimerLabel: {
    color: theme.warning,
    fontWeight: '900',
    textTransform: 'uppercase',
    fontSize: 12,
  },
  overviewTimerValue: {
    color: theme.text,
    fontSize: 26,
    fontWeight: '900',
  },
  exercisePanel: {
    backgroundColor: resolveLegacyColor('#172027', theme),
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: resolveLegacyColor('#27343D', theme),
  },
  overviewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  overviewExercise: {
    color: resolveLegacyColor('#D8E1E8', theme),
    fontSize: 20,
    fontWeight: '900',
  },
  currentOverviewExercise: {
    color: resolveLegacyColor('#7DD3C7', theme),
  },
  overviewRest: {
    color: resolveLegacyColor('#7DD3C7', theme),
    fontSize: 14,
    fontWeight: '800',
    marginTop: 8,
  },
  skipExerciseButton: {
    minHeight: 38,
    borderRadius: 8,
    backgroundColor: resolveLegacyColor('#26343D', theme),
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipExerciseButtonText: {
    color: resolveLegacyColor('#F0B35B', theme),
    fontWeight: '900',
    fontSize: 12,
  },
  setTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: resolveLegacyColor('#2B3943', theme),
  },
  setRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: resolveLegacyColor('#24313A', theme),
  },
  currentSetRow: {
    backgroundColor: resolveLegacyColor('#25353A', theme),
  },
  completedSetRow: {
    backgroundColor: resolveLegacyColor('#BDFCA1', theme),
  },
  setColumnSmall: {
    width: 54,
    color: resolveLegacyColor('#87939D', theme),
    fontWeight: '900',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  setColumn: {
    flex: 1,
    color: resolveLegacyColor('#87939D', theme),
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
    color: resolveLegacyColor('#F7FAFC', theme),
    fontSize: 18,
    fontWeight: '900',
    paddingLeft: 4,
  },
  warmupSetKind: {
    color: resolveLegacyColor('#F0B35B', theme),
  },
  failureSetKind: {
    color: resolveLegacyColor('#D84A4A', theme),
  },
  dropSetKind: {
    color: resolveLegacyColor('#7DD3C7', theme),
  },
  setCellInput: {
    flex: 1,
    color: resolveLegacyColor('#F7FAFC', theme),
    fontSize: 18,
    fontWeight: '900',
    minHeight: 52,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  setColumnValue: {
    flex: 1,
    color: resolveLegacyColor('#F7FAFC', theme),
    fontSize: 18,
    fontWeight: '900',
  },
  completedSetText: {
    color: resolveLegacyColor('#111A1F', theme),
  },
  checkMarkButton: {
    width: 42,
    height: 34,
    borderRadius: 8,
    backgroundColor: resolveLegacyColor('#E7EAEE', theme),
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMarkDone: {
    backgroundColor: resolveLegacyColor('#33B93B', theme),
  },
  checkMarkText: {
    color: resolveLegacyColor('#A5ADB5', theme),
    fontSize: 22,
    fontWeight: '900',
  },
  checkMarkTextDone: {
    color: resolveLegacyColor('#FFFFFF', theme),
  },
  addSetButton: {
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: resolveLegacyColor('#222D35', theme),
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  addSetButtonText: {
    color: resolveLegacyColor('#F7FAFC', theme),
    fontSize: 16,
    fontWeight: '900',
  },
  modalScrim: {
    flex: 1,
    backgroundColor: theme.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    borderRadius: 8,
    backgroundColor: resolveLegacyColor('#172027', theme),
    borderWidth: 1,
    borderColor: resolveLegacyColor('#27343D', theme),
    padding: 20,
  },
  editorCard: {
    width: '100%',
    maxHeight: '88%',
    borderRadius: 8,
    backgroundColor: resolveLegacyColor('#172027', theme),
  },
  editorContent: {
    padding: 18,
    gap: 12,
  },
  editorLabel: {
    color: resolveLegacyColor('#7DD3C7', theme),
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginTop: 4,
  },
  editorInput: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: resolveLegacyColor('#34444F', theme),
    color: resolveLegacyColor('#F7FAFC', theme),
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
    borderColor: resolveLegacyColor('#27343D', theme),
  },
  exercisePickRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: resolveLegacyColor('#26343E', theme),
  },
  exercisePickName: {
    color: resolveLegacyColor('#F7FAFC', theme),
    fontWeight: '800',
    flex: 1,
  },
  emptyText: {
    color: resolveLegacyColor('#9BA8B4', theme),
    padding: 14,
    fontWeight: '700',
  },
  routineEditorBlock: {
    borderRadius: 8,
    backgroundColor: resolveLegacyColor('#101820', theme),
    borderWidth: 1,
    borderColor: resolveLegacyColor('#27343D', theme),
    padding: 12,
    gap: 10,
  },
  routineEditorBlockDragging: {
    borderColor: resolveLegacyColor('#7DD3C7', theme),
    backgroundColor: resolveLegacyColor('#16242A', theme),
  },
  routineEditorControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
  },
  routineEditorTitleRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  controlButtonDisabled: {
    opacity: 0.35,
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
    color: resolveLegacyColor('#87939D', theme),
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  routineSetColumnHeader: {
    flex: 1,
    color: resolveLegacyColor('#87939D', theme),
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  routineSetActionHeader: {
    width: 38,
    color: resolveLegacyColor('#87939D', theme),
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
    color: resolveLegacyColor('#F7FAFC', theme),
    fontSize: 16,
    fontWeight: '900',
  },
  routineSetInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: resolveLegacyColor('#34444F', theme),
    color: resolveLegacyColor('#F7FAFC', theme),
    paddingHorizontal: 12,
    fontWeight: '800',
  },
  summaryRow: {
    minHeight: 58,
    borderRadius: 8,
    backgroundColor: resolveLegacyColor('#101820', theme),
    borderWidth: 1,
    borderColor: resolveLegacyColor('#27343D', theme),
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryValue: {
    color: resolveLegacyColor('#7DD3C7', theme),
    fontSize: 16,
    fontWeight: '900',
  },
  smallSquareButton: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: resolveLegacyColor('#222D35', theme),
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallSquareButtonText: {
    color: resolveLegacyColor('#F0B35B', theme),
    fontSize: 18,
    fontWeight: '900',
  },
  modalTitle: {
    color: resolveLegacyColor('#F7FAFC', theme),
    fontSize: 22,
    fontWeight: '900',
  },
  modalCopy: {
    color: resolveLegacyColor('#AAB6C1', theme),
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
    backgroundColor: resolveLegacyColor('#D9E2DF', theme),
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSecondaryText: {
    color: resolveLegacyColor('#111A1F', theme),
    fontWeight: '900',
  },
  modalPrimary: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: resolveLegacyColor('#F0B35B', theme),
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryText: {
    color: resolveLegacyColor('#16110A', theme),
    fontWeight: '900',
  },
  modalDanger: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: resolveLegacyColor('#D84A4A', theme),
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDangerText: {
    color: resolveLegacyColor('#FFFFFF', theme),
    fontWeight: '900',
  },
  fullWidthDanger: {
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: resolveLegacyColor('#D84A4A', theme),
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
    backgroundColor: resolveLegacyColor('#D9E2DF', theme),
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindOptionActive: {
    backgroundColor: resolveLegacyColor('#111A1F', theme),
  },
  kindOptionText: {
    color: resolveLegacyColor('#52606A', theme),
    fontWeight: '900',
  },
  kindOptionTextActive: {
    color: resolveLegacyColor('#F7FAFC', theme),
  },
  exerciseList: {
    marginTop: 12,
    gap: 8,
  },
  routineLine: {
    color: resolveLegacyColor('#D6DEE5', theme),
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
    borderColor: resolveLegacyColor('#34444F', theme),
    color: resolveLegacyColor('#F7FAFC', theme),
    paddingHorizontal: 14,
    fontSize: 15,
  },
  exerciseRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: resolveLegacyColor('#26343E', theme),
    gap: 14,
  },
  exerciseRowName: {
    color: resolveLegacyColor('#F7FAFC', theme),
    fontSize: 16,
    fontWeight: '800',
  },
  badge: {
    color: resolveLegacyColor('#F0B35B', theme),
    fontSize: 12,
    fontWeight: '900',
  },
  heroPanel: {
    borderRadius: 8,
    backgroundColor: resolveLegacyColor('#172027', theme),
    borderWidth: 1,
    borderColor: resolveLegacyColor('#27343D', theme),
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
    borderColor: resolveLegacyColor('#7DD3C7', theme),
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonText: {
    color: resolveLegacyColor('#7DD3C7', theme),
    fontSize: 12,
    fontWeight: '900',
  },
  bodyProfileRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  collapsibleHeader: {
    minHeight: 48,
  },
  collapsibleContent: {
    flex: 1,
  },
  collapsibleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  collapsibleTitle: {
    color: resolveLegacyColor('#7DD3C7', theme),
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  weightSummaryRow: {
    minHeight: 86,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 16,
  },
  bigMetric: {
    color: resolveLegacyColor('#F7FAFC', theme),
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
    backgroundColor: resolveLegacyColor('#101820', theme),
    borderWidth: 1,
    borderColor: resolveLegacyColor('#27343D', theme),
    padding: 12,
    justifyContent: 'space-between',
  },
  bodyMetricValue: {
    color: resolveLegacyColor('#F7FAFC', theme),
    fontSize: 28,
    fontWeight: '900',
  },
  metricStatus: {
    fontSize: 12,
    fontWeight: '900',
  },
  statusHealthy: {
    color: resolveLegacyColor('#33BFA6', theme),
  },
  statusHigh: {
    color: resolveLegacyColor('#F0B35B', theme),
  },
  statusVeryHigh: {
    color: resolveLegacyColor('#E15D5D', theme),
  },
  statusLow: {
    color: resolveLegacyColor('#8BB8FF', theme),
  },
  statusUnknown: {
    color: resolveLegacyColor('#9BA8B4', theme),
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
    backgroundColor: resolveLegacyColor('#F0B35B', theme),
  },
  bmiMarker: {
    position: 'absolute',
    top: -7,
    width: 22,
    height: 22,
    marginLeft: -11,
    borderRadius: 11,
    backgroundColor: resolveLegacyColor('#7DD3C7', theme),
    borderWidth: 3,
    borderColor: resolveLegacyColor('#172027', theme),
  },
  bmiLabels: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bmiHint: {
    marginTop: 12,
    color: resolveLegacyColor('#F0B35B', theme),
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '800',
  },
  segmentedControl: {
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: resolveLegacyColor('#101820', theme),
    borderWidth: 1,
    borderColor: resolveLegacyColor('#27343D', theme),
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
    backgroundColor: resolveLegacyColor('#7DD3C7', theme),
  },
  profileSegmentButtonText: {
    color: resolveLegacyColor('#9BA8B4', theme),
    fontWeight: '900',
  },
  profileSegmentButtonTextActive: {
    color: resolveLegacyColor('#071313', theme),
  },
  smallActionButton: {
    minHeight: 36,
    borderRadius: 8,
    backgroundColor: resolveLegacyColor('#222D35', theme),
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  smallActionText: {
    color: resolveLegacyColor('#7DD3C7', theme),
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
    backgroundColor: resolveLegacyColor('#101820', theme),
    borderWidth: 1,
    borderColor: resolveLegacyColor('#27343D', theme),
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
    backgroundColor: resolveLegacyColor('#223038', theme),
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderIconText: {
    color: resolveLegacyColor('#F0B35B', theme),
    fontSize: 22,
    fontWeight: '900',
  },
  photoGroup: {
    gap: 6,
  },
  photoGroupTitle: {
    color: resolveLegacyColor('#D6DEE5', theme),
    fontSize: 13,
    fontWeight: '900',
  },
  photoCard: {
    width: 128,
    borderRadius: 8,
    backgroundColor: resolveLegacyColor('#101820', theme),
    borderWidth: 1,
    borderColor: resolveLegacyColor('#27343D', theme),
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
    backgroundColor: resolveLegacyColor('#EAF2EE', theme),
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  viewerButtonText: {
    color: resolveLegacyColor('#111A1F', theme),
    fontWeight: '900',
  },
  viewerDate: {
    color: resolveLegacyColor('#D6DEE5', theme),
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
    borderColor: resolveLegacyColor('#2B3A43', theme),
    padding: 8,
    flexDirection: 'row',
    gap: 10,
  },
  viewerSaveButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: resolveLegacyColor('#EAF2EE', theme),
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerSaveButtonText: {
    color: resolveLegacyColor('#111A1F', theme),
    fontWeight: '900',
    fontSize: 14,
  },
  viewerDeleteButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: resolveLegacyColor('#D84A4A', theme),
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerDeleteButtonText: {
    color: resolveLegacyColor('#FFFFFF', theme),
    fontWeight: '900',
    fontSize: 14,
  },
  progressPhoto: {
    width: '100%',
    height: 144,
    borderRadius: 6,
    backgroundColor: resolveLegacyColor('#222D35', theme),
  },
  photoDate: {
    color: resolveLegacyColor('#D6DEE5', theme),
    fontSize: 11,
    fontWeight: '700',
  },
  photoDelete: {
    minHeight: 30,
    borderRadius: 6,
    backgroundColor: resolveLegacyColor('#D84A4A', theme),
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoDeleteText: {
    color: resolveLegacyColor('#FFFFFF', theme),
    fontSize: 11,
    fontWeight: '900',
  },
  bodyHistoryRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: resolveLegacyColor('#26343E', theme),
    gap: 12,
  },
  progressRow: {
    minHeight: 46,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: resolveLegacyColor('#26343E', theme),
  },
  progressName: {
    color: resolveLegacyColor('#F7FAFC', theme),
    fontSize: 15,
    fontWeight: '800',
  },
  progressValue: {
    color: resolveLegacyColor('#7DD3C7', theme),
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
    backgroundColor: resolveLegacyColor('#F0B35B', theme),
    color: resolveLegacyColor('#16110A', theme),
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
    backgroundColor: resolveLegacyColor('#EAF2EE', theme),
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
    backgroundColor: theme.onNavigation,
  },
  tabText: {
    color: resolveLegacyColor('#52606A', theme),
    fontSize: 12,
    fontWeight: '900',
  },
  activeTabText: {
    color: '#FFFFFF',
  },
  });
}

const darkStyles = createStyles(darkTheme);
const lightStyles = createStyles(lightTheme);
let styles = darkStyles;

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as MediaLibrary from 'expo-media-library';
import * as NavigationBar from 'expo-navigation-bar';
import * as Notifications from 'expo-notifications';
import * as Sharing from 'expo-sharing';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
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
  Text,
  ToastAndroid,
  useColorScheme,
  Vibration,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomNavigation } from './application/BottomNavigation';
import { AppSettingsProvider, useAppSettings } from './application/AppSettingsContext';
import { DietScreen } from './features/diets/DietScreen';
import { ExercisesScreen } from './features/exercises/ExercisesScreen';
import { ExerciseDraft, ExerciseEditorModal } from './features/exercises/ExerciseEditorModal';
import { ProgressScreen } from './features/progress/ProgressScreen';
import {
  BodyMeasurementDraft,
  BodyMeasurementModal,
  BodyProfileDraft,
  BodyProfileModal,
  ProgressPhotoViewer,
} from './features/progress/ProgressModals';
import { RoutinesScreen } from './features/routines/RoutinesScreen';
import { RoutineDraft, RoutineEditorModal } from './features/routines/RoutineEditorModal';
import { SettingsScreen } from './features/settings/SettingsScreen';
import { RoutineNoteModal, SetKindModal, TodayScreen } from './features/workout/WorkoutScreens';
import { WorkoutSummaryModal } from './features/workout/WorkoutSummaryModal';
import { seedAchievements, seedExercises, seedLogs, seedRoutines } from './data/seed';
import { buildDietTransferFile, parseDietTransferFile } from './data/dietTransfer';
import {
  buildRoutineTransferFile,
  mergeRoutineTransferFile,
  parseRoutineTransferFile,
} from './data/routineTransfer';
import {
  loadAppPreferences,
  loadPersistedData,
  PersistedData,
  replacePersistedData,
  saveAppPreferences,
  savePersistedData,
} from './data/storage';
import { getLatestMeasurement } from './domain/bodyProgress';
import { buildAchievement, formatRestTime, getPersonalBest } from './domain/progress';
import { bodyLengthToCm, displayBodyLength, displayWeight, formatDecimal, weightToKg } from './domain/units';
import {
  AppPreferences,
  defaultAppPreferences,
} from './domain/preferences';
import {
  BodyMeasurement,
  BodyProfile,
  Diet,
  Exercise,
  ProgressPhoto,
  Routine,
  RoutineCollection,
  RoutineSet,
  SetKind,
  SetLog,
} from './domain/types';
import { createStyles } from './ui/legacyStyles';
import { equipmentLabels } from './ui/labels';
import {
  darkTheme,
  lightTheme,
  ResolvedTheme,
  ThemeColorsContext,
} from './ui/theme';
import {
  estimateRoutineMinutes,
  getRoutineSetPositions,
  getTodayWeekday,
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
    <AppSettingsProvider value={{ colors, preferences, preferencesReady, updatePreferences }}>
      <ThemeColorsContext.Provider value={colors}>
        <GestureHandlerRootView style={styles.gestureRoot}>
          <SafeAreaProvider>
            <GymetricApp />
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </ThemeColorsContext.Provider>
    </AppSettingsProvider>
  );
}

function GymetricApp() {
  const { colors, preferences, preferencesReady, updatePreferences } = useAppSettings();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('today');
  const [exercises, setExercises] = useState(seedExercises);
  const [routines, setRoutines] = useState(seedRoutines);
  const [routineCollections, setRoutineCollections] = useState<RoutineCollection[]>([]);
  const [diets, setDiets] = useState<Diet[]>([]);
  const [logs, setLogs] = useState(seedLogs);
  const [achievements, setAchievements] = useState(seedAchievements);
  const [bodyProfile, setBodyProfile] = useState<BodyProfile | null>(null);
  const [bodyMeasurements, setBodyMeasurements] = useState<BodyMeasurement[]>([]);
  const [progressPhotos, setProgressPhotos] = useState<ProgressPhoto[]>([]);
  const [activeWorkout, setActiveWorkout] = useState<ActiveWorkout | null>(null);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [setEditorTarget, setSetEditorTarget] = useState<SetEditorTarget>(null);
  const [noteEditorTarget, setNoteEditorTarget] = useState<{ exerciseIndex: number; notes: string } | null>(null);
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
  const archivedCollectionNames = new Set(routineCollections.filter((collection) => collection.archivedAt).map((collection) => collection.name));
  const activeRoutines = routines.filter((routine) => !routine.archivedAt && !archivedCollectionNames.has(routine.collection ?? ''));
  const suggestedRoutines = activeRoutines.filter((routine) => routine.preferredDays?.includes(todayWeekday));
  const nextRoutine = suggestedRoutines[0] ?? activeRoutines[0];
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
      routineCollections,
      diets,
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
        const knownCollectionNames = new Set(data.routineCollections.map((collection) => collection.name.toLocaleLowerCase('es')));
        const migratedCollections = data.routines
          .map((routine) => routine.collection?.trim())
          .filter((name): name is string => typeof name === 'string' && name.length > 0)
          .filter((name) => !knownCollectionNames.has(name.toLocaleLowerCase('es')))
          .filter((name, index, names) => names.findIndex((item) => item.toLocaleLowerCase('es') === name.toLocaleLowerCase('es')) === index)
          .map((name, index) => ({ id: `collection-migrated-${Date.now()}-${index}`, name, createdAt: new Date().toISOString() }));
        setRoutineCollections([...data.routineCollections, ...migratedCollections]);
        setDiets(data.diets);
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
  }, [achievements, bodyMeasurements, bodyProfile, diets, exercises, isStorageReady, logs, progressPhotos, routineCollections, routines]);

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
      if (noteEditorTarget) {
        setNoteEditorTarget(null);
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
    noteEditorTarget,
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
          reps: set.targetReps?.toString() ?? '',
          weightKg: set.targetWeightKg === null ? '' : formatDecimal(displayWeight(set.targetWeightKg, preferences.weightUnit)),
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
    const weight = input?.weightKg || (routineSet.targetWeightKg === null ? '—' : formatDecimal(displayWeight(routineSet.targetWeightKg, preferences.weightUnit)));
    const reps = input?.reps || routineSet.targetReps?.toString() || 'fallo';
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
    const firstPosition = getRoutineSetPositions(routine)[0] ?? { exerciseIndex: 0, setIndex: 0 };
    setActiveWorkout({
      routine,
      exerciseIndex: firstPosition.exerciseIndex,
      setIndex: firstPosition.setIndex,
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
    const positions = getRoutineSetPositions(workout.routine);
    const currentPositionIndex = positions.findIndex(
      (position) => position.exerciseIndex === fromExerciseIndex && position.setIndex === fromSetIndex,
    );
    const candidates = [...positions.slice(currentPositionIndex + 1), ...positions.slice(0, currentPositionIndex + 1)];
    for (const position of candidates) {
      const routineExercise = workout.routine.exercises[position.exerciseIndex];
      if (!workout.skippedExerciseIds.includes(routineExercise.id) && !completedSetIds.includes(getSetKey(workout.routine, position.exerciseIndex, position.setIndex))) {
        return { exerciseIndex: position.exerciseIndex, setIndex: position.setIndex };
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
    const reps = Number.isFinite(actualReps) ? actualReps : routineSet.targetReps ?? 0;
    const weightKg = Number.isFinite(actualWeight)
      ? weightToKg(actualWeight, preferences.weightUnit)
      : routineSet.targetWeightKg ?? 0;
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

    const nextRoutineSet = activeWorkout.routine.exercises[nextPosition.exerciseIndex].sets[nextPosition.setIndex];
    const restSeconds = nextRoutineSet.kind === 'drop' ? 0 : selectedRoutineExercise.restSeconds;
    const notificationId = restSeconds > 0 ? await scheduleRestNotification(restSeconds) : null;

    setActiveWorkout({
      ...activeWorkout,
      ...nextPosition,
      completedSetIds,
      completedLogIds,
      completedAchievementIds,
      pendingLogs,
      pendingAchievements,
      restRemaining: restSeconds,
      restEndsAt: restSeconds > 0 ? Date.now() + restSeconds * 1000 : null,
      restNotificationId: notificationId,
      isResting: restSeconds > 0,
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
            reps: previousSet.targetReps?.toString() ?? '',
            weightKg: previousSet.targetWeightKg === null ? '' : formatDecimal(displayWeight(previousSet.targetWeightKg, preferences.weightUnit)),
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

  function saveActiveRoutineExerciseNote() {
    if (!activeWorkout || !noteEditorTarget) {
      return;
    }

    const notes = noteEditorTarget.notes.trim();
    const exerciseIndex = noteEditorTarget.exerciseIndex;
    const updatedRoutine: Routine = {
      ...activeWorkout.routine,
      exercises: activeWorkout.routine.exercises.map((exercise, index) =>
        index === exerciseIndex ? { ...exercise, notes: notes || undefined } : exercise,
      ),
    };
    const nextRoutines = routines.map((routine) => (routine.id === updatedRoutine.id ? updatedRoutine : routine));

    setActiveWorkout((current) => (current ? { ...current, routine: updatedRoutine } : current));
    setRoutines(nextRoutines);
    persistData({ routines: nextRoutines });
    setNoteEditorTarget(null);
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
      collection: routine?.collection ?? '',
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

    const existingRoutine = routines.find((item) => item.id === routineDraft.id);
    const routine: Routine = {
      id: routineDraft.id ?? `routine-${Date.now()}`,
      name: routineDraft.name.trim(),
      focus: routineDraft.focus.trim() || 'Rutina personalizada',
      estimatedMinutes: estimateRoutineMinutes(routineDraft.exercises),
      preferredDays: routineDraft.preferredDays,
      collection: routineDraft.collection.trim() || undefined,
      archivedAt: existingRoutine?.archivedAt,
      notes: existingRoutine?.notes,
      conditioning: existingRoutine?.conditioning,
      executionSequence: existingRoutine?.executionSequence,
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

  function toggleRoutineArchived(routineId: string) {
    const nextRoutines = routines.map((routine) =>
      routine.id === routineId
        ? { ...routine, archivedAt: routine.archivedAt ? undefined : new Date().toISOString() }
        : routine,
    );
    setRoutines(nextRoutines);
    persistData({ routines: nextRoutines });
  }

  function createRoutineCollection(name: string) {
    const trimmedName = name.trim();
    if (!trimmedName || routineCollections.some((collection) => collection.name.toLocaleLowerCase('es') === trimmedName.toLocaleLowerCase('es'))) return false;
    const nextCollections = [{ id: `collection-${Date.now()}`, name: trimmedName, createdAt: new Date().toISOString() }, ...routineCollections];
    setRoutineCollections(nextCollections);
    persistData({ routineCollections: nextCollections });
    return true;
  }

  function toggleRoutineCollectionArchived(collectionId: string) {
    const collection = routineCollections.find((item) => item.id === collectionId);
    if (!collection) return;
    const archivedAt = collection.archivedAt ? undefined : new Date().toISOString();
    const nextCollections = routineCollections.map((item) => item.id === collectionId ? { ...item, archivedAt } : item);
    const nextRoutines = routines.map((routine) => routine.collection === collection.name ? { ...routine, archivedAt } : routine);
    setRoutineCollections(nextCollections);
    setRoutines(nextRoutines);
    persistData({ routineCollections: nextCollections, routines: nextRoutines });
  }

  function assignRoutineToCollection(routineId: string, collectionName?: string) {
    const nextRoutines = routines.map((routine) =>
      routine.id === routineId ? { ...routine, collection: collectionName || undefined } : routine,
    );
    setRoutines(nextRoutines);
    persistData({ routines: nextRoutines });
  }

  function deleteRoutineCollection(collectionId: string) {
    const collection = routineCollections.find((item) => item.id === collectionId);
    if (!collection) return;
    const nextCollections = routineCollections.filter((item) => item.id !== collectionId);
    const nextRoutines = routines.map((routine) =>
      routine.collection === collection.name ? { ...routine, collection: undefined } : routine,
    );
    setRoutineCollections(nextCollections);
    setRoutines(nextRoutines);
    persistData({ routineCollections: nextCollections, routines: nextRoutines });
  }

  function toggleExerciseArchived(exerciseId: string) {
    const nextExercises = exercises.map((exercise) =>
      exercise.id === exerciseId
        ? { ...exercise, archivedAt: exercise.archivedAt ? undefined : new Date().toISOString() }
        : exercise,
    );
    setExercises(nextExercises);
    persistData({ exercises: nextExercises });
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
        schemaVersion: 2,
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

  async function exportRoutines() {
    try {
      if (!routines.length) {
        Alert.alert('Sin rutinas', 'No hay rutinas para exportar.');
        return;
      }
      const transfer = buildRoutineTransferFile(exercises, routines);
      const fileUri = `${FileSystem.cacheDirectory}gymetric-routines-${new Date().toISOString().slice(0, 10)}.json`;
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(transfer, null, 2));
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('Compartir archivos no está disponible en este dispositivo.');
      }
      await Sharing.shareAsync(fileUri, {
        dialogTitle: 'Exportar rutinas de Gymetric',
        mimeType: 'application/json',
      });
    } catch (error: unknown) {
      Alert.alert('No se pudieron exportar las rutinas', error instanceof Error ? error.message : 'Error desconocido.');
    }
  }

  async function importRoutines() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (result.canceled) {
        return;
      }
      const raw = await FileSystem.readAsStringAsync(result.assets[0].uri);
      const transfer = parseRoutineTransferFile(raw);
      const merged = mergeRoutineTransferFile(exercises, routines, transfer);

      Alert.alert(
        'Importar rutinas',
        `${merged.addedRoutineCount} rutinas · ${merged.addedExerciseCount} ejercicios nuevos · ${merged.reusedExerciseCount} reutilizados. No se reemplazará ningún dato.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Importar',
            onPress: () => {
              const existingNames = new Set(routineCollections.map((collection) => collection.name.toLocaleLowerCase('es')));
              const importedCollections = merged.routines
                .map((routine) => routine.collection?.trim())
                .filter((name): name is string => typeof name === 'string' && name.length > 0)
                .filter((name) => !existingNames.has(name.toLocaleLowerCase('es')))
                .filter((name, index, names) => names.findIndex((item) => item.toLocaleLowerCase('es') === name.toLocaleLowerCase('es')) === index)
                .map((name, index) => ({ id: `collection-import-${Date.now()}-${index}`, name, createdAt: new Date().toISOString() }));
              const nextCollections = [...routineCollections, ...importedCollections];
              setExercises(merged.exercises);
              setRoutines(merged.routines);
              setRoutineCollections(nextCollections);
              persistData({ exercises: merged.exercises, routines: merged.routines, routineCollections: nextCollections });
              Alert.alert('Rutinas importadas', 'Las nuevas rutinas se han añadido a tu biblioteca.');
            },
          },
        ],
      );
    } catch (error: unknown) {
      Alert.alert('No se pudieron importar las rutinas', error instanceof Error ? error.message : 'Error desconocido.');
    }
  }

  async function exportDiets() {
    try {
      if (!diets.length) {
        Alert.alert('Sin dietas', 'No hay dietas para exportar.');
        return;
      }
      const fileUri = `${FileSystem.cacheDirectory}gymetric-diets-${new Date().toISOString().slice(0, 10)}.json`;
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(buildDietTransferFile(diets), null, 2));
      if (!(await Sharing.isAvailableAsync())) throw new Error('Compartir archivos no está disponible.');
      await Sharing.shareAsync(fileUri, { dialogTitle: 'Exportar dietas de Gymetric', mimeType: 'application/json' });
    } catch (error: unknown) {
      Alert.alert('No se pudieron exportar las dietas', error instanceof Error ? error.message : 'Error desconocido.');
    }
  }

  async function importDiets() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (result.canceled) return;
      const imported = parseDietTransferFile(await FileSystem.readAsStringAsync(result.assets[0].uri));
      Alert.alert('Importar dietas', `Se añadirán ${imported.length} dietas al histórico.`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Importar', onPress: () => {
          const nextDiets = [...imported, ...diets];
          setDiets(nextDiets);
          persistData({ diets: nextDiets });
        } },
      ]);
    } catch (error: unknown) {
      Alert.alert('No se pudieron importar las dietas', error instanceof Error ? error.message : 'Error desconocido.');
    }
  }

  function setCurrentDiet(dietId: string) {
    const nextDiets = diets.map((diet) => ({ ...diet, isCurrent: diet.id === dietId }));
    setDiets(nextDiets);
    persistData({ diets: nextDiets });
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
        (backup.schemaVersion !== 1 && backup.schemaVersion !== 2) ||
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
                diets: Array.isArray(data.diets) ? data.diets : [],
                routineCollections: Array.isArray(data.routineCollections) ? data.routineCollections : [],
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
                  setDiets(importedData.diets);
                  setRoutineCollections(importedData.routineCollections);
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
            openNoteEditor={(exerciseIndex, notes) => setNoteEditorTarget({ exerciseIndex, notes })}
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
            assignRoutineToCollection={assignRoutineToCollection}
            collections={routineCollections}
            createCollection={createRoutineCollection}
            deleteCollection={deleteRoutineCollection}
            exercises={exercises}
            exportRoutines={exportRoutines}
            importRoutines={importRoutines}
            openRoutineEditor={openRoutineEditor}
            routines={routines}
            startRoutine={startRoutine}
            toggleRoutineArchived={toggleRoutineArchived}
            toggleCollectionArchived={toggleRoutineCollectionArchived}
          />
        )}

        {tab === 'exercises' && (
          <ExercisesScreen
            exercises={exercises}
            openExerciseEditor={openExerciseEditor}
            toggleExerciseArchived={toggleExerciseArchived}
          />
        )}

        {tab === 'diet' && (
          <DietScreen
            diets={diets}
            exportDiets={exportDiets}
            importDiets={importDiets}
            setCurrentDiet={setCurrentDiet}
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

      <BottomNavigation bottom={Math.max(insets.bottom, 10)} value={tab} onChange={setTab} />

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

      <RoutineNoteModal
        target={noteEditorTarget}
        close={() => setNoteEditorTarget(null)}
        save={saveActiveRoutineExerciseNote}
        setTarget={setNoteEditorTarget}
      />

      <ExerciseEditorModal
        draft={exerciseDraft}
        setDraft={setExerciseDraft}
        close={() => setExerciseDraft(null)}
        deleteExercise={deleteExerciseFromLibrary}
        save={saveExerciseDraft}
      />

      <RoutineEditorModal
        collections={routineCollections}
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

const darkStyles = createStyles(darkTheme);
const lightStyles = createStyles(lightTheme);
let styles = darkStyles;

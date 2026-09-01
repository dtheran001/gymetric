export type ThemePreference = 'system' | 'light' | 'dark';
export type WeightUnit = 'kg' | 'lb';
export type DistanceUnit = 'km' | 'mi';
export type BodyUnit = 'cm' | 'in';
export type NotificationSound = 'default';

export type AppPreferences = {
  theme: ThemePreference;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  bodyUnit: BodyUnit;
  restNotificationsEnabled: boolean;
  restVibrationEnabled: boolean;
  notificationSound: NotificationSound;
  keepScreenAwake: boolean;
};

export const defaultAppPreferences: AppPreferences = {
  theme: 'system',
  weightUnit: 'kg',
  distanceUnit: 'km',
  bodyUnit: 'cm',
  restNotificationsEnabled: true,
  restVibrationEnabled: true,
  notificationSound: 'default',
  keepScreenAwake: false,
};

export function normalizeAppPreferences(value: unknown): AppPreferences {
  if (!value || typeof value !== 'object') {
    return defaultAppPreferences;
  }

  const preferences = value as Partial<AppPreferences>;
  return {
    theme: ['system', 'light', 'dark'].includes(preferences.theme ?? '')
      ? (preferences.theme as ThemePreference)
      : defaultAppPreferences.theme,
    weightUnit: preferences.weightUnit === 'lb' ? 'lb' : 'kg',
    distanceUnit: preferences.distanceUnit === 'mi' ? 'mi' : 'km',
    bodyUnit: preferences.bodyUnit === 'in' ? 'in' : 'cm',
    restNotificationsEnabled:
      typeof preferences.restNotificationsEnabled === 'boolean'
        ? preferences.restNotificationsEnabled
        : defaultAppPreferences.restNotificationsEnabled,
    restVibrationEnabled:
      typeof preferences.restVibrationEnabled === 'boolean'
        ? preferences.restVibrationEnabled
        : defaultAppPreferences.restVibrationEnabled,
    notificationSound: 'default',
    keepScreenAwake:
      typeof preferences.keepScreenAwake === 'boolean'
        ? preferences.keepScreenAwake
        : defaultAppPreferences.keepScreenAwake,
  };
}


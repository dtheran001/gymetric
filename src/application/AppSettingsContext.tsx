import { createContext, ReactNode, useContext } from 'react';
import { AppPreferences } from '../domain/preferences';
import { ThemeColors } from '../ui/theme';

export type AppSettingsContextValue = {
  colors: ThemeColors;
  preferences: AppPreferences;
  preferencesReady: boolean;
  updatePreferences: (changes: Partial<AppPreferences>) => void;
};

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

export function AppSettingsProvider({ children, value }: { children: ReactNode; value: AppSettingsContextValue }) {
  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings() {
  const value = useContext(AppSettingsContext);
  if (!value) throw new Error('useAppSettings debe usarse dentro de AppSettingsProvider.');
  return value;
}

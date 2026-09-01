export type ResolvedTheme = 'light' | 'dark';

export type ThemeColors = {
  scheme: ResolvedTheme;
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceSubtle: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  warning: string;
  success: string;
  danger: string;
  onDanger: string;
  navigation: string;
  onNavigation: string;
  scrim: string;
};

export const darkTheme: ThemeColors = {
  scheme: 'dark',
  background: '#101418',
  surface: '#172027',
  surfaceElevated: '#222D35',
  surfaceSubtle: '#101820',
  border: '#27343D',
  borderStrong: '#34444F',
  text: '#F7FAFC',
  textMuted: '#AAB6C1',
  textSubtle: '#87939D',
  primary: '#7DD3C7',
  primaryPressed: '#5CB9AD',
  onPrimary: '#071313',
  warning: '#F0B35B',
  success: '#33BFA6',
  danger: '#D84A4A',
  onDanger: '#FFFFFF',
  navigation: '#EAF2EE',
  onNavigation: '#111A1F',
  scrim: 'rgba(0,0,0,0.58)',
};

export const lightTheme: ThemeColors = {
  scheme: 'light',
  background: '#F4F7FA',
  surface: '#FFFFFF',
  surfaceElevated: '#EEF3F8',
  surfaceSubtle: '#F7F9FC',
  border: '#D8E1EA',
  borderStrong: '#B8C5D1',
  text: '#111827',
  textMuted: '#526170',
  textSubtle: '#718096',
  primary: '#294BFF',
  primaryPressed: '#1737D6',
  onPrimary: '#FFFFFF',
  warning: '#C97916',
  success: '#16836F',
  danger: '#C83D48',
  onDanger: '#FFFFFF',
  navigation: '#FFFFFF',
  onNavigation: '#17202A',
  scrim: 'rgba(15,23,42,0.38)',
};

export const ThemeColorsContext = createContext<ThemeColors>(darkTheme);

export function useThemeColors() {
  return useContext(ThemeColorsContext);
}

const lightLegacyColors: Record<string, string> = {
  '#101418': lightTheme.background,
  '#0F151A': '#E8EEF5',
  '#101820': lightTheme.surfaceSubtle,
  '#111A1F': lightTheme.text,
  '#16110A': '#3A2505',
  '#16242A': '#E4F1F0',
  '#172027': lightTheme.surface,
  '#1B242B': lightTheme.surface,
  '#222D35': lightTheme.surfaceElevated,
  '#223038': '#E3EBF3',
  '#24313A': lightTheme.border,
  '#25353A': '#E2EEED',
  '#26343D': lightTheme.border,
  '#26343E': lightTheme.border,
  '#27343D': lightTheme.border,
  '#2B3943': lightTheme.border,
  '#2B3A43': lightTheme.border,
  '#2D3A43': lightTheme.border,
  '#2F3E48': lightTheme.borderStrong,
  '#31404A': lightTheme.borderStrong,
  '#34444F': lightTheme.borderStrong,
  '#52606A': lightTheme.textMuted,
  '#52616B': lightTheme.textMuted,
  '#54616B': lightTheme.textMuted,
  '#65717A': lightTheme.textMuted,
  '#7C8797': '#8794A3',
  '#87939D': lightTheme.textSubtle,
  '#8F9CA7': lightTheme.textSubtle,
  '#9BA8B4': lightTheme.textMuted,
  '#A5ADB5': '#7B8794',
  '#AAB6C1': lightTheme.textMuted,
  '#BAC6CF': lightTheme.textMuted,
  '#D6DEE5': lightTheme.text,
  '#D7E0E7': lightTheme.text,
  '#D8E1E8': lightTheme.text,
  '#D9E2DF': '#E8EEF5',
  '#DDE8E3': '#EAF0F7',
  '#E7EAEE': '#E2E8F0',
  '#EAF2EE': lightTheme.navigation,
  '#F7FAFC': lightTheme.text,
  '#7DD3C7': lightTheme.primary,
  '#5CB9AD': lightTheme.primaryPressed,
  '#071313': lightTheme.onPrimary,
  '#F0B35B': lightTheme.warning,
  '#F4B860': lightTheme.warning,
  '#33BFA6': lightTheme.success,
  '#33B93B': '#2E9C45',
  '#D84A4A': lightTheme.danger,
  '#E15D5D': lightTheme.danger,
  '#8BB8FF': '#3974D8',
  '#FFFFFF': '#FFFFFF',
};

export function resolveLegacyColor(color: string, theme: ThemeColors) {
  if (theme.scheme === 'dark') {
    return color;
  }
  return lightLegacyColors[color.toUpperCase()] ?? color;
}
import { createContext, useContext } from 'react';


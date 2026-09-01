import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Tab } from '../workout/sessionTypes';
import { ThemeColors, useThemeColors } from '../ui/theme';

const tabs: { key: Tab; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: 'routines', label: 'Rutinas' },
  { key: 'diet', label: 'Dieta' },
  { key: 'exercises', label: 'Ejercicios' },
  { key: 'progress', label: 'Progreso' },
];

export function BottomNavigation({ bottom, onChange, value }: { bottom: number; onChange: (tab: Tab) => void; value: Tab }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.tabs, { bottom }]}>
      {tabs.map((tab) => (
        <Pressable key={tab.key} style={[styles.tabButton, value === tab.key && styles.activeTab]} onPress={() => onChange(tab.key)}>
          <Text style={[styles.tabText, value === tab.key && styles.activeTabText]}>{tab.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    tabs: { position: 'absolute', left: 14, right: 14, minHeight: 64, borderRadius: 8, backgroundColor: colors.navigation, flexDirection: 'row', alignItems: 'center', padding: 6, gap: 6 },
    tabButton: { flex: 1, minHeight: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    activeTab: { backgroundColor: colors.onNavigation },
    tabText: { color: colors.textMuted, fontSize: 12, fontWeight: '900' },
    activeTabText: { color: '#FFFFFF' },
  });
}

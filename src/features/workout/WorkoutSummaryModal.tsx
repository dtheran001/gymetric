import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useAppSettings } from '../../application/AppSettingsContext';
import { formatRestTime } from '../../domain/progress';
import { Exercise } from '../../domain/types';
import { displayWeight, formatDecimal } from '../../domain/units';
import { createStyles } from '../../ui/legacyStyles';
import { darkTheme } from '../../ui/theme';
import { WorkoutSummary } from '../../workout/sessionTypes';

let styles = createStyles(darkTheme);
function useStyles() { const { colors } = useAppSettings(); styles = useMemo(() => createStyles(colors), [colors]); return styles; }

export function WorkoutSummaryModal({
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
function Metric({ label, value }: { label: string; value: string }) { useStyles(); return <View style={styles.metric}><Text adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={1} style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }

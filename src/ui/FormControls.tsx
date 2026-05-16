import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { combineRestTime, splitRestTime } from '../workout/routineUtils';

export function OptionGrid<T extends string>({
  labels,
  onChange,
  options,
  value,
}: {
  labels: Record<T, string>;
  onChange: (value: T) => void;
  options: T[];
  value: T;
}) {
  return (
    <View style={styles.optionGrid}>
      {options.map((option) => (
        <Pressable
          key={option}
          style={[styles.optionChip, value === option && styles.optionChipActive]}
          onPress={() => onChange(option)}
        >
          <Text style={[styles.optionChipText, value === option && styles.optionChipTextActive]}>{labels[option]}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function MultiOptionGrid<T extends string>({
  labels,
  onChange,
  options,
  value,
}: {
  labels: Record<T, string>;
  onChange: (value: T[]) => void;
  options: T[];
  value: T[];
}) {
  return (
    <View style={styles.optionGrid}>
      {options.map((option) => {
        const active = value.includes(option);
        return (
          <Pressable
            key={option}
            style={[styles.optionChip, active && styles.optionChipActive]}
            onPress={() => onChange(active ? value.filter((item) => item !== option) : [...value, option])}
          >
            <Text style={[styles.optionChipText, active && styles.optionChipTextActive]}>{labels[option]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function RestTimeInput({ onChange, restSeconds }: { onChange: (seconds: number) => void; restSeconds: number }) {
  const split = splitRestTime(restSeconds);

  return (
    <View>
      <Text style={styles.editorLabel}>Descanso</Text>
      <View style={styles.restEditorRow}>
        <View style={styles.restEditorField}>
          <TextInput
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor="#7C8797"
            style={styles.restEditorInput}
            value={split.minutes}
            onChangeText={(minutes) => onChange(combineRestTime(minutes, split.seconds))}
          />
          <Text style={styles.restEditorLabel}>min</Text>
        </View>
        <View style={styles.restEditorField}>
          <TextInput
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor="#7C8797"
            style={styles.restEditorInput}
            value={split.seconds}
            onChangeText={(seconds) => onChange(combineRestTime(split.minutes, seconds))}
          />
          <Text style={styles.restEditorLabel}>seg</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  editorLabel: {
    color: '#7DD3C7',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginTop: 4,
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    minHeight: 38,
    borderRadius: 8,
    backgroundColor: '#222D35',
    borderWidth: 1,
    borderColor: '#31404A',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionChipActive: {
    backgroundColor: '#7DD3C7',
    borderColor: '#7DD3C7',
  },
  optionChipText: {
    color: '#D7E0E7',
    fontWeight: '900',
    fontSize: 12,
  },
  optionChipTextActive: {
    color: '#071313',
  },
  restEditorRow: {
    flexDirection: 'row',
    gap: 10,
  },
  restEditorField: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#34444F',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  restEditorInput: {
    flex: 1,
    color: '#F7FAFC',
    fontSize: 18,
    fontWeight: '900',
    paddingVertical: 0,
  },
  restEditorLabel: {
    color: '#9BA8B4',
    fontWeight: '900',
  },
});

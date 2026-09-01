import { MaterialIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatRestTime } from '../../domain/progress';
import { Exercise, Routine, RoutineCollection } from '../../domain/types';
import { weekdayLabels } from '../../ui/labels';
import { ThemeColors, useThemeColors } from '../../ui/theme';

type Props = {
  assignRoutineToCollection: (routineId: string, collectionName?: string) => void;
  collections: RoutineCollection[];
  createCollection: (name: string) => boolean;
  deleteCollection: (collectionId: string) => void;
  exercises: Exercise[];
  exportRoutines: () => void;
  importRoutines: () => void;
  openRoutineEditor: (routine?: Routine) => void;
  routines: Routine[];
  startRoutine: (routine?: Routine) => void;
  toggleRoutineArchived: (routineId: string) => void;
  toggleCollectionArchived: (collectionId: string) => void;
};

export function RoutinesScreen(props: Props) {
  const { colors, styles } = useStyles();
  const [showArchived, setShowArchived] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<'all' | 'none' | string>('all');
  const [showCollectionCreator, setShowCollectionCreator] = useState(false);
  const [collectionName, setCollectionName] = useState('');
  const [collectionPickerRoutine, setCollectionPickerRoutine] = useState<Routine | null>(null);
  const visibleCollections = props.collections.filter((collection) => Boolean(collection.archivedAt) === showArchived);
  const visibleRoutines = props.routines.filter((routine) => Boolean(routine.archivedAt) === showArchived && (selectedCollection === 'all' || (selectedCollection === 'none' ? !routine.collection : routine.collection === selectedCollection)));
  const groupedRoutines = visibleRoutines.reduce<Record<string, Routine[]>>((groups, routine) => {
    const collection = routine.collection?.trim() || 'Sin colección';
    groups[collection] = [...(groups[collection] ?? []), routine];
    return groups;
  }, {});

  function requestDeleteCollection(collection: RoutineCollection) {
    const routineCount = props.routines.filter((routine) => routine.collection === collection.name).length;
    Alert.alert('Eliminar colección', routineCount ? `La colección se eliminará y sus ${routineCount} rutinas pasarán a Sin colección. No se borrará ningún entrenamiento.` : 'La colección se eliminará. No contiene rutinas.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => { props.deleteCollection(collection.id); setSelectedCollection('all'); } },
    ]);
  }

  return <View style={styles.stack}>
    <Pressable style={styles.primaryButton} onPress={() => props.openRoutineEditor()}><Text style={styles.primaryButtonText}>Crear rutina</Text></Pressable>
    <View style={styles.actionRow}>
      <Action label="Crear colección" onPress={() => setShowCollectionCreator((current) => !current)} />
      <Action label="Importar" onPress={props.importRoutines} />
      <Action label="Exportar" onPress={props.exportRoutines} />
    </View>
    {showCollectionCreator && <View style={styles.panel}>
      <Text style={styles.sectionLabel}>Nueva colección</Text>
      <TextInput placeholder="Nombre de la colección" placeholderTextColor={colors.textSubtle} style={styles.input} value={collectionName} onChangeText={setCollectionName} />
      <Pressable style={styles.secondaryButton} onPress={() => { if (props.createCollection(collectionName)) { setCollectionName(''); setShowCollectionCreator(false); } else Alert.alert('Colección no válida', 'Escribe un nombre nuevo para la colección.'); }}><Text style={styles.secondaryButtonText}>Guardar colección</Text></Pressable>
    </View>}
    <View style={styles.segmented}><Segment active={!showArchived} label="Activas" onPress={() => { setShowArchived(false); setSelectedCollection('all'); }} /><Segment active={showArchived} label="Archivadas" onPress={() => { setShowArchived(true); setSelectedCollection('all'); }} /></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
      <Chip active={selectedCollection === 'all'} label="Todas" onPress={() => setSelectedCollection('all')} />
      <Chip active={selectedCollection === 'none'} label="Sin colección" onPress={() => setSelectedCollection('none')} />
      {visibleCollections.map((collection) => <Chip key={collection.id} active={selectedCollection === collection.name} label={collection.name} onPress={() => setSelectedCollection(collection.name)} />)}
    </ScrollView>
    {visibleCollections.filter((collection) => !props.routines.some((routine) => routine.collection === collection.name && Boolean(routine.archivedAt) === showArchived)).filter((collection) => selectedCollection === 'all' || selectedCollection === collection.name).map((collection) => <View key={collection.id} style={styles.panel}>
      <Text style={styles.panelTitle}>{collection.name}</Text><Text style={styles.muted}>Esta colección todavía no contiene rutinas.</Text>
      <Pressable style={styles.secondaryButton} onPress={() => { props.toggleCollectionArchived(collection.id); setSelectedCollection('all'); }}><Text style={styles.secondaryButtonText}>{showArchived ? 'Restaurar colección' : 'Archivar colección'}</Text></Pressable>
      <Pressable style={styles.dangerButton} onPress={() => requestDeleteCollection(collection)}><Text style={styles.dangerText}>Eliminar colección</Text></Pressable>
    </View>)}
    {Object.entries(groupedRoutines).map(([collectionName, collectionRoutines]) => {
      const collection = props.collections.find((item) => item.name === collectionName);
      return <View key={collectionName} style={styles.stack}>
        <View style={styles.collectionHeader}><Text style={styles.sectionLabel}>{collectionName}</Text>{collection && <View style={styles.collectionHeaderActions}>
          <Pressable onPress={() => { props.toggleCollectionArchived(collection.id); setSelectedCollection('all'); }}><Text style={styles.collectionAction}>{showArchived ? 'Restaurar' : 'Archivar'}</Text></Pressable>
          <Pressable onPress={() => requestDeleteCollection(collection)}><Text style={styles.deleteAction}>Eliminar</Text></Pressable>
        </View>}</View>
        {collectionRoutines.map((routine) => <View key={routine.id} style={styles.panel}>
          <View style={styles.routineHeader}><Text style={styles.sectionLabel}>{routine.preferredDays?.length ? routine.preferredDays.map((day) => weekdayLabels[day]).join(', ') : 'Sin día sugerido'}</Text><Pressable accessibilityLabel={`Cambiar colección de ${routine.name}`} accessibilityRole="button" hitSlop={8} style={styles.iconButton} onPress={() => setCollectionPickerRoutine(routine)}><MaterialIcons color={colors.primary} name="drive-file-move" size={22} /></Pressable></View>
          <Text style={styles.panelTitle}>{routine.name}</Text><Text style={styles.muted}>{routine.focus}</Text>
          <View style={styles.exerciseList}>{routine.exercises.map((routineExercise) => <Text key={routineExercise.id} style={styles.routineLine}>{props.exercises.find((item) => item.id === routineExercise.exerciseId)?.name ?? 'Ejercicio'} · {routineExercise.sets.length} series · {formatRestTime(routineExercise.restSeconds)} descanso</Text>)}</View>
          <View style={styles.actionRow}><Action label={routine.archivedAt ? 'Restaurar' : 'Archivar'} onPress={() => props.toggleRoutineArchived(routine.id)} /><Action label="Editar" onPress={() => props.openRoutineEditor(routine)} />{!routine.archivedAt && <Pressable style={styles.actionPrimary} onPress={() => props.startRoutine(routine)}><Text style={styles.primaryButtonText}>Iniciar</Text></Pressable>}</View>
        </View>)}
      </View>;
    })}
    {!visibleRoutines.length && <Text style={styles.emptyText}>{showArchived ? 'No hay rutinas archivadas.' : 'No hay rutinas activas.'}</Text>}
    <Modal transparent animationType="fade" visible={Boolean(collectionPickerRoutine)} onRequestClose={() => setCollectionPickerRoutine(null)}><View style={styles.scrim}><View style={styles.modalCard}>
      <Text style={styles.modalTitle}>Mover rutina</Text><Text style={styles.modalCopy}>{collectionPickerRoutine?.name}</Text>
      <ScrollView style={styles.pickerList} contentContainerStyle={styles.pickerContent} nestedScrollEnabled showsVerticalScrollIndicator>
        <Chip active={!collectionPickerRoutine?.collection} label="Sin colección" onPress={() => { if (collectionPickerRoutine) props.assignRoutineToCollection(collectionPickerRoutine.id); setCollectionPickerRoutine(null); }} />
        {props.collections.filter((collection) => !collection.archivedAt).map((collection) => <Chip key={collection.id} active={collectionPickerRoutine?.collection === collection.name} label={collection.name} onPress={() => { if (collectionPickerRoutine) props.assignRoutineToCollection(collectionPickerRoutine.id, collection.name); setCollectionPickerRoutine(null); }} />)}
      </ScrollView>
      <Pressable style={styles.cancelButton} onPress={() => setCollectionPickerRoutine(null)}><Text style={styles.secondaryButtonText}>Cancelar</Text></Pressable>
    </View></View></Modal>
  </View>;
}

function Action({ label, onPress }: { label: string; onPress: () => void }) { const { styles } = useStyles(); return <Pressable accessibilityRole="button" style={styles.actionButton} onPress={onPress}><Text style={styles.secondaryButtonText}>{label}</Text></Pressable>; }
function Segment({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) { const { styles } = useStyles(); return <Pressable accessibilityRole="button" style={[styles.segment, active && styles.segmentActive]} onPress={onPress}><Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text></Pressable>; }
function Chip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) { const { styles } = useStyles(); return <Pressable accessibilityRole="button" style={[styles.chip, active && styles.chipActive]} onPress={onPress}><Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text></Pressable>; }
function useStyles() { const colors = useThemeColors(); return { colors, styles: useMemo(() => createStyles(colors), [colors]) }; }
function createStyles(c: ThemeColors) { return StyleSheet.create({
  stack: { gap: 16 }, primaryButton: { minHeight: 52, borderRadius: 8, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }, primaryButtonText: { color: c.onPrimary, fontWeight: '900', fontSize: 15 }, actionRow: { flexDirection: 'row', gap: 10 }, actionButton: { flex: 1, minHeight: 46, borderRadius: 8, borderWidth: 1, borderColor: c.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }, actionPrimary: { flex: 1, minHeight: 46, borderRadius: 8, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }, secondaryButton: { minHeight: 46, borderRadius: 8, borderWidth: 1, borderColor: c.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 }, secondaryButtonText: { color: c.primary, fontWeight: '900', textAlign: 'center' }, panel: { borderRadius: 8, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, padding: 18, gap: 12 }, sectionLabel: { flexShrink: 1, color: c.primary, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' }, input: { minHeight: 48, borderRadius: 8, borderWidth: 1, borderColor: c.borderStrong, color: c.text, paddingHorizontal: 14, fontSize: 15, fontWeight: '700' }, segmented: { backgroundColor: c.surfaceElevated, borderRadius: 8, flexDirection: 'row', padding: 4, gap: 4 }, segment: { flex: 1, minHeight: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, segmentActive: { backgroundColor: c.navigation }, segmentText: { color: c.textSubtle, fontWeight: '900' }, segmentTextActive: { color: c.onNavigation }, filterRow: { gap: 8, paddingVertical: 4 }, chip: { minHeight: 46, minWidth: 92, paddingHorizontal: 14, borderRadius: 8, backgroundColor: c.surfaceElevated, alignItems: 'center', justifyContent: 'center' }, chipActive: { backgroundColor: c.primary }, chipText: { color: c.textMuted, fontWeight: '900', textAlign: 'center' }, chipTextActive: { color: c.onPrimary }, panelTitle: { color: c.text, fontSize: 22, fontWeight: '900' }, muted: { color: c.textMuted, fontSize: 15, lineHeight: 21 }, dangerButton: { minHeight: 46, borderRadius: 8, borderWidth: 1, borderColor: c.danger, alignItems: 'center', justifyContent: 'center' }, dangerText: { color: c.danger, fontWeight: '900' }, collectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, collectionHeaderActions: { flexDirection: 'row', gap: 14 }, collectionAction: { color: c.warning, fontWeight: '900' }, deleteAction: { color: c.danger, fontWeight: '900' }, routineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, iconButton: { width: 38, height: 38, borderRadius: 8, borderWidth: 1, borderColor: c.borderStrong, alignItems: 'center', justifyContent: 'center' }, exerciseList: { gap: 8 }, routineLine: { color: c.text, fontSize: 15, lineHeight: 21 }, emptyText: { color: c.textMuted, textAlign: 'center', padding: 18 }, scrim: { flex: 1, backgroundColor: c.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 }, modalCard: { width: '100%', maxWidth: 480, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, padding: 20, gap: 12 }, modalTitle: { color: c.text, fontSize: 24, fontWeight: '900' }, modalCopy: { color: c.textMuted, fontSize: 16 }, pickerList: { maxHeight: 186 }, pickerContent: { gap: 8 }, cancelButton: { minHeight: 46, borderRadius: 8, backgroundColor: c.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
}); }

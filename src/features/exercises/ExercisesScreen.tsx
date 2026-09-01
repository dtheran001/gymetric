import { MaterialIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Exercise, MuscleGroup } from '../../domain/types';
import { equipmentLabels, muscleLabels } from '../../ui/labels';
import { ThemeColors, useThemeColors } from '../../ui/theme';

const muscleOptions: MuscleGroup[] = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core'];

export function ExercisesScreen({ exercises, openExerciseEditor, toggleExerciseArchived }: { exercises: Exercise[]; openExerciseEditor: (exercise?: Exercise) => void; toggleExerciseArchived: (exerciseId: string) => void }) {
  const colors = useThemeColors(); const styles = useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState(''); const [muscleFilter, setMuscleFilter] = useState<MuscleGroup | 'all'>('all'); const [showArchived, setShowArchived] = useState(false);
  const normalizedQuery = query.trim().toLocaleLowerCase('es');
  const visibleExercises = exercises.filter((exercise) => Boolean(exercise.archivedAt) === showArchived && (muscleFilter === 'all' || exercise.muscleGroup === muscleFilter) && (!normalizedQuery || exercise.name.toLocaleLowerCase('es').includes(normalizedQuery)));
  return <View style={styles.stack}>
    <Pressable style={styles.primaryButton} onPress={() => openExerciseEditor()}><Text style={styles.primaryButtonText}>Añadir ejercicio</Text></Pressable>
    <TextInput placeholder="Buscar ejercicio" placeholderTextColor={colors.textSubtle} style={styles.input} value={query} onChangeText={setQuery} />
    <View style={styles.segmented}><Segment active={!showArchived} label="Activos" onPress={() => setShowArchived(false)} /><Segment active={showArchived} label="Archivados" onPress={() => setShowArchived(true)} /></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
      <Chip active={muscleFilter === 'all'} label="Todos" onPress={() => setMuscleFilter('all')} />
      {muscleOptions.map((muscle) => <Chip key={muscle} active={muscleFilter === muscle} label={muscleLabels[muscle]} onPress={() => setMuscleFilter(muscle)} />)}
    </ScrollView>
    <View style={styles.panel}><Text style={styles.sectionLabel}>Biblioteca</Text>
      {visibleExercises.map((exercise) => <View key={exercise.id} style={styles.libraryRow}>
        <Pressable style={styles.grow} onPress={() => openExerciseEditor(exercise)}><ExerciseRow exercise={exercise} /></Pressable>
        <Pressable accessibilityLabel={exercise.archivedAt ? `Restaurar ${exercise.name}` : `Archivar ${exercise.name}`} accessibilityRole="button" style={styles.iconButton} onPress={() => toggleExerciseArchived(exercise.id)}><MaterialIcons color={colors.text} name={exercise.archivedAt ? 'unarchive' : 'archive'} size={20} /></Pressable>
      </View>)}
      {!visibleExercises.length && <Text style={styles.empty}>No hay ejercicios con estos filtros.</Text>}
    </View>
  </View>;
}

export function ExerciseRow({ exercise }: { exercise: Exercise }) { const styles=useStyles(); const kind=equipmentLabels[exercise.equipmentKind]; const detail=exercise.equipment&&exercise.equipment!==kind?` · ${exercise.equipment}`:''; return <View style={styles.exerciseRow}><View style={styles.grow}><Text style={styles.name}>{exercise.name}</Text><Text style={styles.muted}>{muscleLabels[exercise.muscleGroup]} · {kind}{detail}</Text></View><Text style={styles.badge}>{exercise.isCustom?'Custom':'Base'}</Text></View>; }
function Segment({active,label,onPress}:{active:boolean;label:string;onPress:()=>void}){const s=useStyles();return <Pressable style={[s.segment,active&&s.segmentActive]} onPress={onPress}><Text style={[s.segmentText,active&&s.segmentTextActive]}>{label}</Text></Pressable>}
function Chip({active,label,onPress}:{active:boolean;label:string;onPress:()=>void}){const s=useStyles();return <Pressable style={[s.chip,active&&s.chipActive]} onPress={onPress}><Text style={[s.chipText,active&&s.chipTextActive]}>{label}</Text></Pressable>}
function useStyles(){const c=useThemeColors();return useMemo(()=>createStyles(c),[c]);}
function createStyles(c:ThemeColors){return StyleSheet.create({stack:{gap:16},grow:{flex:1},primaryButton:{minHeight:52,borderRadius:8,backgroundColor:c.primary,alignItems:'center',justifyContent:'center',paddingHorizontal:16},primaryButtonText:{color:c.onPrimary,fontWeight:'900',fontSize:15},input:{minHeight:48,borderRadius:8,borderWidth:1,borderColor:c.borderStrong,color:c.text,paddingHorizontal:14,fontSize:15,fontWeight:'700'},segmented:{marginTop:16,backgroundColor:c.surfaceElevated,borderRadius:8,flexDirection:'row',padding:4,gap:4},segment:{flex:1,minHeight:40,borderRadius:8,alignItems:'center',justifyContent:'center'},segmentActive:{backgroundColor:c.navigation},segmentText:{color:c.textSubtle,fontWeight:'900'},segmentTextActive:{color:c.onNavigation},filterRow:{gap:8,paddingVertical:4},chip:{minHeight:46,minWidth:92,paddingHorizontal:14,borderRadius:8,backgroundColor:c.surfaceElevated,alignItems:'center',justifyContent:'center'},chipActive:{backgroundColor:c.primary},chipText:{color:c.textMuted,fontWeight:'900'},chipTextActive:{color:c.onPrimary},panel:{borderRadius:8,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,padding:18},sectionLabel:{color:c.primary,fontSize:12,fontWeight:'900',textTransform:'uppercase'},libraryRow:{flexDirection:'row',alignItems:'center',gap:10},exerciseRow:{minHeight:64,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:c.border,gap:14},name:{color:c.text,fontSize:16,fontWeight:'800'},muted:{color:c.textMuted,fontSize:13,lineHeight:19},badge:{color:c.warning,fontSize:12,fontWeight:'900'},iconButton:{width:38,height:38,borderRadius:8,borderWidth:1,borderColor:c.borderStrong,alignItems:'center',justifyContent:'center'},empty:{color:c.textMuted,padding:14}})}

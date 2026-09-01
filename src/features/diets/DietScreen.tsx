import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Diet } from '../../domain/types';
import { ThemeColors, useThemeColors } from '../../ui/theme';

export function DietScreen({ diets, exportDiets, importDiets, setCurrentDiet }: { diets: Diet[]; exportDiets: () => void; importDiets: () => void; setCurrentDiet: (dietId: string) => void }) {
  const styles = useDietStyles();
  const currentDiet = diets.find((diet) => diet.isCurrent);
  const historicalDiets = diets.filter((diet) => !diet.isCurrent);
  return (
    <View style={styles.stack}>
      <View style={styles.actionRow}>
        <ActionButton label="Importar" onPress={importDiets} />
        <ActionButton label="Exportar" onPress={exportDiets} />
      </View>
      {currentDiet ? <DietDetails diet={currentDiet} /> : (
        <View style={styles.hero}>
          <Text style={styles.sectionLabel}>Dieta actual</Text><Text style={styles.h1}>Sin dieta activa</Text>
          <Text style={styles.heroCopy}>Importa una dieta y selecciónala desde el histórico.</Text>
        </View>
      )}
      <Text style={styles.sectionLabel}>Histórico</Text>
      {historicalDiets.map((diet) => (
        <View key={diet.id} style={styles.panel}>
          <Text style={styles.panelTitle}>{diet.name}</Text>
          {!!diet.objective && <Text style={styles.muted}>{diet.objective}</Text>}
          <Text style={styles.line}>{diet.days.length} días o variantes</Text>
          <Pressable style={styles.secondaryButton} onPress={() => setCurrentDiet(diet.id)}><Text style={styles.secondaryButtonText}>Establecer como actual</Text></Pressable>
        </View>
      ))}
      {!historicalDiets.length && <Text style={styles.emptyText}>Todavía no hay dietas en el histórico.</Text>}
    </View>
  );
}

function DietDetails({ diet }: { diet: Diet }) {
  const styles = useDietStyles();
  return <View style={styles.stack}>
    <View style={styles.hero}>
      <Text style={styles.sectionLabel}>Dieta actual</Text><Text style={styles.h1}>{diet.name}</Text>
      {!!diet.objective && <Text style={styles.heroCopy}>{diet.objective}</Text>}
      {!!diet.startDate && <Text style={styles.muted}>{diet.startDate}{diet.endDate ? ` — ${diet.endDate}` : ''}</Text>}
      {!!diet.notes && <Text style={styles.note}>{diet.notes}</Text>}
    </View>
    {diet.days.map((day) => <View key={day.id} style={styles.panel}>
      <Text style={styles.panelTitle}>{day.name}</Text>
      {day.meals.map((meal) => <View key={meal.id} style={styles.meal}>
        <Text style={styles.sectionLabel}>{meal.name}</Text>
        {(meal.items ?? []).map((item) => <Text key={item.id} style={styles.line}>• {item.name}{item.quantity ? ` · ${item.quantity}` : ''}{item.notes ? ` — ${item.notes}` : ''}</Text>)}
        {(meal.entries ?? []).map((entry) => entry.type === 'item'
          ? <Text key={entry.id} style={styles.line}>• {entry.item.name}{entry.item.quantity ? ` · ${entry.item.quantity}` : ''}{entry.item.notes ? ` — ${entry.item.notes}` : ''}</Text>
          : <View key={entry.id} style={styles.choice}><Text style={styles.choiceLabel}>{entry.label ?? 'Elige una opción'}</Text>
              {entry.options.map((option, index) => <Text key={option.id} style={styles.line}>{index + 1}. {option.items.map((item) => `${item.quantity ? `${item.quantity} ` : ''}${item.name}`).join(' + ')}{option.notes ? ` — ${option.notes}` : ''}</Text>)}
            </View>)}
        {!!meal.notes && <Text style={styles.muted}>{meal.notes}</Text>}
      </View>)}
    </View>)}
  </View>;
}

function ActionButton({ label, onPress }: { label: string; onPress: () => void }) { const styles = useDietStyles(); return <Pressable style={styles.actionButton} onPress={onPress}><Text style={styles.secondaryButtonText}>{label}</Text></Pressable>; }
function useDietStyles() { const colors = useThemeColors(); return useMemo(() => createStyles(colors), [colors]); }
function createStyles(c: ThemeColors) { return StyleSheet.create({
  stack:{gap:16}, actionRow:{flexDirection:'row',gap:10}, actionButton:{flex:1,minHeight:46,borderRadius:8,borderWidth:1,borderColor:c.primary,alignItems:'center',justifyContent:'center'}, secondaryButton:{marginTop:14,minHeight:46,borderRadius:8,borderWidth:1,borderColor:c.primary,alignItems:'center',justifyContent:'center'}, secondaryButtonText:{color:c.primary,fontWeight:'900',textAlign:'center'},
  hero:{borderRadius:8,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,padding:20}, panel:{borderRadius:8,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,padding:18}, sectionLabel:{color:c.primary,fontSize:12,fontWeight:'900',textTransform:'uppercase'}, h1:{color:c.text,fontSize:26,fontWeight:'900',marginTop:4}, heroCopy:{color:c.textMuted,fontSize:16,lineHeight:23,marginTop:8,marginBottom:18}, panelTitle:{color:c.text,fontSize:18,fontWeight:'900'}, muted:{color:c.textMuted,fontSize:13,lineHeight:19}, line:{color:c.text,fontSize:14}, emptyText:{color:c.textMuted,padding:14}, note:{color:c.textMuted,fontSize:14,fontStyle:'italic',lineHeight:20,borderLeftWidth:3,borderLeftColor:c.primary,paddingLeft:10}, meal:{marginTop:14,gap:7,paddingTop:12,borderTopWidth:1,borderTopColor:c.border}, choice:{gap:5,padding:10,borderRadius:8,backgroundColor:c.surfaceElevated}, choiceLabel:{color:c.warning,fontSize:12,fontWeight:'900',textTransform:'uppercase'},
}); }

import { MaterialIcons } from '@expo/vector-icons';
import * as IntentLauncher from 'expo-intent-launcher';
import { StatusBar } from 'expo-status-bar';
import { ReactNode, useMemo } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppSettings } from '../../application/AppSettingsContext';
import { AppPreferences } from '../../domain/preferences';
import { ThemeColors } from '../../ui/theme';

export function SettingsScreen({ close, exportData, importData }: { close: () => void; exportData: () => void; importData: () => void }) {
  const insets = useSafeAreaInsets();
  const { colors, preferences, updatePreferences } = useAppSettings();
  const styles = useMemo(() => createStyles(colors), [colors]);

  async function openExactAlarmSettings() {
    try {
      await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.REQUEST_SCHEDULE_EXACT_ALARM, { data: 'package:com.danyk.gymetric' });
    } catch {
      Alert.alert('No se pudieron abrir los ajustes', 'Busca Gymetric en Ajustes > Aplicaciones > Acceso especial > Alarmas y recordatorios.');
    }
  }

  return <View style={styles.screen}>
    <StatusBar style={colors.scheme === 'dark' ? 'light' : 'dark'} />
    <View style={[styles.header, { paddingTop: Math.max(insets.top + 8, 18) }]}>
      <Pressable accessibilityLabel="Volver" accessibilityRole="button" hitSlop={10} onPress={close} style={styles.back}><MaterialIcons color={colors.text} name="arrow-back" size={26} /></Pressable>
      <Text style={styles.title}>Ajustes</Text><View style={styles.back} />
    </View>
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 18) + 24 }]} showsVerticalScrollIndicator={false}>
      <Section icon="palette" title="Apariencia"><Text style={styles.description}>Elige el aspecto de Gymetric. Con “Sistema”, la app seguirá el modo de tu móvil.</Text><View style={styles.themeChoices}>
        <ThemeChoice active={preferences.theme === 'system'} icon="brightness-auto" label="Sistema" onPress={() => updatePreferences({ theme: 'system' })} />
        <ThemeChoice active={preferences.theme === 'light'} icon="light-mode" label="Claro" onPress={() => updatePreferences({ theme: 'light' })} />
        <ThemeChoice active={preferences.theme === 'dark'} icon="dark-mode" label="Oscuro" onPress={() => updatePreferences({ theme: 'dark' })} />
      </View></Section>
      <Section icon="straighten" title="Unidades">
        <UnitSetting label="Peso" options={[{ label: 'kg', value: 'kg' }, { label: 'lb', value: 'lb' }]} selected={preferences.weightUnit} onSelect={(weightUnit) => updatePreferences({ weightUnit: weightUnit as AppPreferences['weightUnit'] })} />
        <UnitSetting label="Distancia" options={[{ label: 'km', value: 'km' }, { label: 'mi', value: 'mi' }]} selected={preferences.distanceUnit} onSelect={(distanceUnit) => updatePreferences({ distanceUnit: distanceUnit as AppPreferences['distanceUnit'] })} />
        <UnitSetting label="Medidas corporales" options={[{ label: 'cm', value: 'cm' }, { label: 'in', value: 'in' }]} selected={preferences.bodyUnit} onSelect={(bodyUnit) => updatePreferences({ bodyUnit: bodyUnit as AppPreferences['bodyUnit'] })} />
      </Section>
      <Section icon="notifications" title="Notificaciones">
        <SwitchSetting description="Avisa cuando termina el descanso, incluso con la app en segundo plano." label="Temporizador de descanso" value={preferences.restNotificationsEnabled} onValueChange={(restNotificationsEnabled) => updatePreferences({ restNotificationsEnabled })} />
        <SwitchSetting description="Añade vibración al aviso de fin de descanso." label="Vibración" value={preferences.restVibrationEnabled} onValueChange={(restVibrationEnabled) => updatePreferences({ restVibrationEnabled })} />
        {Platform.OS === 'android' && <Pressable accessibilityRole="button" onPress={openExactAlarmSettings} style={styles.action}><MaterialIcons color={colors.primary} name="alarm-on" size={23} /><View style={styles.settingText}><Text style={styles.label}>Permitir alarmas precisas</Text><Text style={styles.description}>Evita que Android retrase el aviso cuando termina el descanso.</Text></View><MaterialIcons color={colors.textSubtle} name="open-in-new" size={21} /></Pressable>}
        <View style={styles.row}><View style={styles.settingText}><Text style={styles.label}>Tono</Text><Text style={styles.description}>Predeterminado · más tonos próximamente</Text></View><MaterialIcons color={colors.textSubtle} name="chevron-right" size={24} /></View>
      </Section>
      <Section icon="fitness-center" title="Entrenamiento"><SwitchSetting description="Evita que la pantalla se apague mientras entrenas." label="Mantener pantalla activa" value={preferences.keepScreenAwake} onValueChange={(keepScreenAwake) => updatePreferences({ keepScreenAwake })} /></Section>
      <Section icon="save-alt" title="Tus datos">
        <Pressable accessibilityRole="button" onPress={exportData} style={styles.action}><MaterialIcons color={colors.primary} name="ios-share" size={23} /><View style={styles.settingText}><Text style={styles.label}>Exportar copia</Text><Text style={styles.description}>Guarda rutinas, registros, medidas y preferencias.</Text></View></Pressable>
        <Pressable accessibilityRole="button" onPress={importData} style={styles.action}><MaterialIcons color={colors.primary} name="file-download" size={23} /><View style={styles.settingText}><Text style={styles.label}>Importar copia</Text><Text style={styles.description}>Las fotos permanecen guardadas solo en este móvil.</Text></View></Pressable>
      </Section>
      <View style={styles.footer}><Text style={styles.kicker}>Gymetric</Text><Text style={styles.description}>Versión 1.0.0 · Datos locales y bajo tu control</Text></View>
    </ScrollView>
  </View>;
}

function Section({ children, icon, title }: { children: ReactNode; icon: keyof typeof MaterialIcons.glyphMap; title: string }) { const { colors } = useAppSettings(); const s = useMemo(() => createStyles(colors), [colors]); return <View style={s.section}><View style={s.sectionHeader}><View style={s.sectionIcon}><MaterialIcons color={colors.primary} name={icon} size={21} /></View><Text style={s.sectionTitle}>{title}</Text></View>{children}</View>; }
function ThemeChoice({ active, icon, label, onPress }: { active: boolean; icon: keyof typeof MaterialIcons.glyphMap; label: string; onPress: () => void }) { const { colors } = useAppSettings(); const s = useMemo(() => createStyles(colors), [colors]); return <Pressable accessibilityRole="button" onPress={onPress} style={[s.themeChoice, active && s.themeChoiceActive]}><MaterialIcons color={active ? colors.onPrimary : colors.textMuted} name={icon} size={22} /><Text style={[s.themeChoiceText, active && s.themeChoiceTextActive]}>{label}</Text></Pressable>; }
function UnitSetting({ label, onSelect, options, selected }: { label: string; onSelect: (value: string) => void; options: { label: string; value: string }[]; selected: string }) { const { colors } = useAppSettings(); const s = useMemo(() => createStyles(colors), [colors]); return <View style={s.unitSetting}><Text style={s.label}>{label}</Text><View style={s.unitOptions}>{options.map((option) => <Pressable accessibilityRole="button" key={option.value} onPress={() => onSelect(option.value)} style={[s.unitOption, selected === option.value && s.unitOptionActive]}><Text style={[s.unitOptionText, selected === option.value && s.unitOptionTextActive]}>{option.label}</Text></Pressable>)}</View></View>; }
function SwitchSetting({ description, label, onValueChange, value }: { description: string; label: string; onValueChange: (value: boolean) => void; value: boolean }) { const { colors } = useAppSettings(); const s = useMemo(() => createStyles(colors), [colors]); return <View style={s.row}><View style={s.settingText}><Text style={s.label}>{label}</Text><Text style={s.description}>{description}</Text></View><Switch onValueChange={onValueChange} thumbColor={colors.scheme === 'dark' ? colors.text : '#FFFFFF'} trackColor={{ false: colors.borderStrong, true: colors.primary }} value={value} /></View>; }

function createStyles(c: ThemeColors) { return StyleSheet.create({
  screen:{flex:1,backgroundColor:c.background},header:{minHeight:76,paddingHorizontal:18,paddingBottom:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:c.border,backgroundColor:c.background},back:{width:42,height:42,alignItems:'center',justifyContent:'center'},title:{color:c.text,fontSize:22,fontWeight:'900'},content:{padding:18,gap:16},section:{padding:18,gap:16,borderRadius:18,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},sectionHeader:{flexDirection:'row',alignItems:'center',gap:11},sectionIcon:{width:38,height:38,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:c.surfaceElevated},sectionTitle:{color:c.text,fontSize:18,fontWeight:'900'},themeChoices:{flexDirection:'row',gap:8},themeChoice:{flex:1,minHeight:76,borderRadius:14,gap:7,alignItems:'center',justifyContent:'center',backgroundColor:c.surfaceElevated,borderWidth:1,borderColor:c.border},themeChoiceActive:{backgroundColor:c.primary,borderColor:c.primary},themeChoiceText:{color:c.textMuted,fontSize:13,fontWeight:'800'},themeChoiceTextActive:{color:c.onPrimary},unitSetting:{gap:8},unitOptions:{flexDirection:'row',padding:4,borderRadius:12,backgroundColor:c.surfaceElevated},unitOption:{flex:1,minHeight:42,borderRadius:9,alignItems:'center',justifyContent:'center'},unitOptionActive:{backgroundColor:c.primary},unitOptionText:{color:c.textMuted,fontWeight:'900'},unitOptionTextActive:{color:c.onPrimary},row:{minHeight:62,flexDirection:'row',alignItems:'center',gap:14},action:{minHeight:66,flexDirection:'row',alignItems:'center',gap:14,paddingVertical:4},settingText:{flex:1,gap:3},label:{color:c.text,fontSize:15,fontWeight:'800'},description:{color:c.textMuted,fontSize:13,lineHeight:19},footer:{alignItems:'center',gap:5,paddingVertical:18},kicker:{color:c.primary,fontWeight:'900',fontSize:14,textTransform:'uppercase',letterSpacing:1.2},
}); }

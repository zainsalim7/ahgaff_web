import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DASH } from './dashTheme';

export type DashView = 'academic' | 'hr';

export const DashViewTabs = ({ view, onChange, showHR }: { view: DashView; onChange: (v: DashView) => void; showHR: boolean }) => {
  const tabs: { key: DashView; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'academic', label: 'الأداء الأكاديمي', icon: 'school' },
    ...(showHR ? [{ key: 'hr' as DashView, label: 'شؤون الموظفين', icon: 'people-circle' as const }] : []),
  ];
  if (tabs.length < 2) return null;
  return (
    <View style={styles.wrap} testID="dash-view-tabs">
      {tabs.map((t) => {
        const on = view === t.key;
        return (
          <TouchableOpacity key={t.key} style={[styles.tab, on && styles.tabOn]} onPress={() => onChange(t.key)} activeOpacity={0.8} testID={`dash-view-tab-${t.key}`}>
            <Ionicons name={t.icon} size={15} color={on ? '#fff' : DASH.navy} />
            <Text style={[styles.text, on && styles.textOn]}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row-reverse', backgroundColor: '#fff', borderWidth: 1, borderColor: DASH.line, borderRadius: 12, padding: 4, gap: 4 },
  tab: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 14, borderRadius: 9 },
  tabOn: { backgroundColor: DASH.navy },
  text: { fontSize: 13, fontWeight: '800', color: DASH.navy },
  textOn: { color: '#fff' },
});

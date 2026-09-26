import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { DASH, NUM_FONT, dashStyles } from './dashTheme';

interface Kpi { key: string; label: string; value: string | number; sub?: string; icon: keyof typeof Ionicons.glyphMap; color: string; route: string }

export const DashHRKpis = ({ h, periodLabel, compact }: { h: any; periodLabel: string; compact: boolean }) => {
  const router = useRouter();
  const hc = h.headcount, p = h.period;
  const cat = (k: string) => hc?.by_category?.find((c: any) => c.key === k)?.count ?? 0;
  const rate = p?.commitment_rate ?? null;
  const rateColor = rate === null ? DASH.muted : rate >= 90 ? DASH.green : rate >= 75 ? DASH.orange : DASH.red;
  const unitQ = h.scope?.org_unit_id ? `?org_unit_id=${h.scope.org_unit_id}` : '';
  const kpis: Kpi[] = [
    { key: 'employees', label: 'الموظفون على رأس العمل', value: hc?.total_active ?? h.employees_active, icon: 'people', color: DASH.navy, route: `/hr-employees${unitQ}`, sub: `أكاديمي ${cat('academic')} · إداري ${cat('administrative')} · فني ${cat('technical')} · خدمات ${cat('service')}` },
    { key: 'units', label: 'الوحدات التنظيمية', value: hc?.units_with_staff ?? 0, icon: 'git-network', color: DASH.purple, route: '/hr-org-units', sub: `بها موظفون من ${hc?.units_count ?? 0} وحدة` },
    { key: 'present', label: 'حضر اليوم', value: h.present_today, icon: 'checkmark-done', color: DASH.green, route: '/hr-attendance', sub: h.is_work_day ? `متأخر ${h.late_today} · لم يُسجَّل ${h.unmarked_today}` : 'اليوم عطلة' },
    { key: 'absent', label: 'غائب اليوم', value: h.absent_today.length, icon: 'close-circle', color: h.absent_today.length ? DASH.red : DASH.muted, route: '/hr-attendance', sub: `في إجازة ${h.on_leave_today.length}` },
    { key: 'rate', label: `الالتزام بالدوام · ${periodLabel}`, value: rate === null ? '—' : `${rate}%`, icon: 'pulse', color: rateColor, route: '/hr-attendance', sub: p ? `حاضر ${p.attended} · متأخر ${p.late} · غائب ${p.absent}` : '' },
    { key: 'pending', label: 'بانتظار قرار', value: h.pending_leaves_count + h.pending_appraisals + h.overdue_tasks, icon: 'hourglass', color: DASH.orange, route: '/hr-leaves', sub: `إجازات ${h.pending_leaves_count} · تقييمات ${h.pending_appraisals} · مهام متأخرة ${h.overdue_tasks}` },
  ];
  return (
    <View style={styles.grid} testID="dash-hr-kpis">
      {kpis.map((k) => (
        <TouchableOpacity key={k.key} style={[dashStyles.card, styles.kpi, compact && styles.kpiCompact]} onPress={() => router.push(k.route as any)} activeOpacity={0.75} testID={`dash-hr-kpi-${k.key}`}>
          <View style={[styles.accent, { backgroundColor: k.color }]} />
          <View style={styles.top}>
            <View style={[dashStyles.iconBox, { backgroundColor: k.color + '1a' }]}><Ionicons name={k.icon} size={18} color={k.color} /></View>
            <Text style={styles.label}>{k.label}</Text>
          </View>
          <Text style={[styles.value, NUM_FONT, { color: k.color }]} testID={`dash-hr-kpi-${k.key}-value`}>{k.value}</Text>
          {!!k.sub && <Text style={[styles.sub, NUM_FONT]} numberOfLines={1}>{k.sub}</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  kpi: { flexGrow: 1, flexBasis: 200, minWidth: 180, overflow: 'hidden' },
  kpiCompact: { flexBasis: '46%', minWidth: 150 },
  accent: { position: 'absolute', top: 0, right: 0, left: 0, height: 4 },
  top: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 10 },
  label: { fontSize: 12, fontWeight: '700', color: DASH.muted, textAlign: 'right', flex: 1 },
  value: { fontSize: 30, fontWeight: '800', textAlign: 'right', lineHeight: 36 },
  sub: { fontSize: 11, color: '#94a3b8', textAlign: 'right', marginTop: 4 },
});

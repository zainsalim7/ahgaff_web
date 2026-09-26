import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { DASH, NUM_FONT, dashStyles } from './dashTheme';

/** 📅 موقف اليوم في شؤون الموظفين: بلاطات + قوائم (الغائبون، في إجازة، طلبات معلّقة، عقود) */
export const DashHR = ({ h }: { h: any }) => {
  const router = useRouter();
  const go = (p: string) => router.push(p as any);
  const tiles = [
    { label: 'حضر اليوم', value: h.present_today, sub: h.late_today ? `منهم ${h.late_today} متأخر` : '', color: DASH.green, route: '/hr-attendance', id: 'present' },
    { label: 'غائب اليوم', value: h.absent_today.length, sub: h.unmarked_today ? `${h.unmarked_today} لم يُسجَّل` : '', color: h.absent_today.length ? DASH.red : DASH.muted, route: '/hr-attendance', id: 'absent' },
    { label: 'في إجازة', value: h.on_leave_today.length, sub: `من ${h.employees_active} موظف`, color: DASH.blue, route: '/hr-leaves', id: 'leave' },
    { label: 'طلبات إجازة معلّقة', value: h.pending_leaves_count, sub: 'بانتظار قرار', color: h.pending_leaves_count ? DASH.orange : DASH.muted, route: '/hr-leaves', id: 'pending' },
    { label: 'مهام متأخرة', value: h.overdue_tasks, sub: '', color: h.overdue_tasks ? DASH.red : DASH.muted, route: '/hr-tasks', id: 'tasks' },
    { label: 'تقييمات للاعتماد', value: h.pending_appraisals, sub: '', color: h.pending_appraisals ? DASH.orange : DASH.muted, route: '/hr-appraisals', id: 'appraisals' },
  ];
  const lists: { title: string; items: any[]; render: (i: any) => string; empty: string; id: string }[] = [
    { id: 'absent', title: 'الغائبون اليوم', items: h.absent_today, render: (i) => `${i.employee_name}${i.org_unit_name ? ` (${i.org_unit_name})` : ''}${i.note ? ` — ${i.note}` : ''}`, empty: h.is_work_day ? 'لا غياب مسجّل' : 'اليوم عطلة' },
    { id: 'leave', title: 'في إجازة اليوم', items: h.on_leave_today, render: (i) => `${i.employee_name} — ${i.type} حتى ${i.end_date}`, empty: 'لا أحد في إجازة' },
    { id: 'pending', title: 'طلبات إجازة معلّقة', items: h.pending_leaves, render: (i) => `${i.employee_name} — ${i.type} من ${i.start_date} (${i.days} يوم) · ${i.status === 'pending' ? 'لدى المدير' : 'لدى HR'}`, empty: 'لا طلبات معلّقة' },
    { id: 'contracts', title: 'عقود تنتهي خلال 60 يوماً', items: h.expiring_contracts, render: (i) => `${i.employee_name} — ${i.contract_end_date}`, empty: 'لا عقود قريبة الانتهاء' },
  ];
  return (
    <View style={[dashStyles.card, { marginBottom: 16 }]} testID="dash-hr">
      <View style={dashStyles.sectionHead}>
        <View style={dashStyles.sectionTitleRow}>
          <View style={[dashStyles.iconBox, { backgroundColor: '#ede9fe' }]}><Ionicons name="today" size={17} color="#6d28d9" /></View>
          <View>
            <Text style={dashStyles.sectionTitle}>موقف اليوم</Text>
            <Text style={dashStyles.sectionSub}>{h.date} · {h.employees_active} موظف على رأس العمل{!h.is_work_day ? ' · اليوم عطلة' : ''}</Text>
          </View>
        </View>
        <TouchableOpacity style={dashStyles.linkBtn} onPress={() => go('/hr-attendance')} testID="dash-hr-route">
          <Text style={dashStyles.linkText}>كشف الدوام</Text>
          <Ionicons name="arrow-back" size={12} color={DASH.blue} />
        </TouchableOpacity>
      </View>
      <View style={styles.tiles}>
        {tiles.map((t) => (
          <TouchableOpacity key={t.id} style={styles.tile} onPress={() => go(t.route)} testID={`dash-hr-tile-${t.id}`}>
            <Text style={styles.tileLabel}>{t.label}</Text>
            <Text style={[styles.tileVal, NUM_FONT, { color: t.color }]}>{t.value}</Text>
            {!!t.sub && <Text style={styles.tileSub}>{t.sub}</Text>}
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.lists}>
        {lists.map((l) => (
          <View key={l.id} style={styles.listBox} testID={`dash-hr-list-${l.id}`}>
            <Text style={styles.listTitle}>{l.title}{l.items.length ? ` (${l.items.length})` : ''}</Text>
            {l.items.length === 0 ? <Text style={styles.listEmpty}>{l.empty}</Text> : l.items.slice(0, 6).map((i, idx) => <Text key={idx} style={styles.listItem}>• {l.render(i)}</Text>)}
            {l.items.length > 6 && <Text style={styles.listEmpty}>+{l.items.length - 6} آخرون</Text>}
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  tile: { flexGrow: 1, flexBasis: 140, backgroundColor: '#f8fafc', borderRadius: 12, padding: 10 },
  tileLabel: { fontSize: 11, color: DASH.muted, textAlign: 'right', fontWeight: '700' },
  tileVal: { fontSize: 22, fontWeight: '800', textAlign: 'right', marginTop: 2 },
  tileSub: { fontSize: 10.5, color: '#94a3b8', textAlign: 'right' },
  lists: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  listBox: { flexGrow: 1, flexBasis: 220, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 8 },
  listTitle: { fontSize: 12, fontWeight: '800', color: DASH.ink, textAlign: 'right', marginBottom: 4 },
  listItem: { fontSize: 11.5, color: '#475569', textAlign: 'right', paddingVertical: 2 },
  listEmpty: { fontSize: 11, color: '#94a3b8', textAlign: 'right' },
});

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { DASH, NUM_FONT } from './dashTheme';
import { DashAttendanceChart } from './DashAttendanceChart';

const rateColor = (r: number | null) => (r === null ? DASH.muted : r >= 90 ? DASH.green : r >= 75 ? DASH.orange : DASH.red);

const EmpList = ({ title, items, empty, id, tone }: { title: string; items: any[]; empty: string; id: string; tone: string }) => (
  <View style={styles.listBox} testID={`dash-hr-period-${id}`}>
    <Text style={styles.listTitle}>{title}</Text>
    {items.length === 0 ? <Text style={styles.listEmpty}>{empty}</Text> : items.map((e, i) => (
      <View key={e.employee_id || e.unit || i} style={styles.listRow}>
        <Text style={[styles.listRate, NUM_FONT, { color: e.rate === null ? DASH.muted : tone }]}>{e.rate === null ? '—' : `${Math.round(e.rate)}%`}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.listName} numberOfLines={1}>{e.name || e.unit}</Text>
          <Text style={[styles.listSub, NUM_FONT]}>{e.unit && e.name ? `${e.unit} · ` : ''}حاضر {e.present} · متأخر {e.late} · غائب {e.absent}{e.late_minutes ? ` · تأخير ${e.late_minutes} د` : ''}</Text>
        </View>
      </View>
    ))}
  </View>
);

export const DashHRPeriod = ({ p, periodLabel, width }: { p: any; periodLabel: string; width: number }) => {
  const kpis = [
    { id: 'rate', label: 'نسبة الالتزام بالدوام', value: p.commitment_rate === null ? '—' : `${p.commitment_rate}%`, sub: `${p.work_days} يوم عمل · متوقع ${p.expected} سجل`, color: rateColor(p.commitment_rate) },
    { id: 'attended', label: 'أيام الحضور', value: p.attended, sub: `منها ${p.late} متأخر${p.half_day ? ` · ${p.half_day} نصف يوم` : ''}${p.mission ? ` · ${p.mission} مهمة` : ''}`, color: DASH.green },
    { id: 'absent', label: 'أيام الغياب', value: p.absent, sub: `${p.excused} بعذر · ${p.unmarked} لم يُسجَّل`, color: p.absent ? DASH.red : DASH.muted },
    { id: 'late', label: 'ساعات التأخير', value: p.late_hours, sub: `${p.late_minutes} دقيقة إجمالاً`, color: p.late_minutes ? DASH.orange : DASH.muted },
    { id: 'leaves', label: 'إجازات معتمدة', value: p.leaves_approved, sub: p.leave_days ? `${p.leave_days} يوم عمل${p.leave_types[0] ? ` · أغلبها ${p.leave_types[0].label}` : ''}` : 'لا إجازات في الفترة', color: DASH.blue },
    { id: 'tasks', label: 'مهام منجزة / جديدة', value: `${p.tasks_done} / ${p.tasks_created}`, sub: 'خلال الفترة', color: DASH.purple },
  ];
  return (
    <View style={styles.wrap} testID="dash-hr-period">
      <View style={styles.tiles}>
        {kpis.map((k) => (
          <View key={k.id} style={styles.tile} testID={`dash-hr-period-${k.id}`}>
            <Text style={styles.tileLabel}>{k.label}</Text>
            <Text style={[styles.tileVal, NUM_FONT, { color: k.color }]}>{k.value}</Text>
            <Text style={styles.tileSub}>{k.sub}</Text>
          </View>
        ))}
      </View>
      <DashAttendanceChart
        plain
        testID="dash-hr-chart"
        groupBy={p.chart.group_by}
        points={p.chart.points}
        periodLabel={periodLabel}
        width={width}
        title="مخطط الدوام الإداري"
        subtitle={`${p.chart.group_by === 'date' ? 'حسب يوم العمل' : 'حسب الوحدة التنظيمية'} · الأعمدة: حاضر/متأخر/غائب · الخط: نسبة الالتزام`}
        emptyText="لا توجد سجلات دوام إداري في هذه الفترة"
        tipRender={(s) => `حاضر ${s.present} · متأخر ${s.late} · غائب ${s.absent}${s.rate !== null ? ` · الالتزام ${s.rate}%` : ''}`}
      />
      <View style={styles.lists}>
        <EmpList id="top" title="الأكثر التزاماً" items={p.top_employees} empty="لا سجلات كافية" tone={DASH.green} />
        <EmpList id="bottom" title="الأقل التزاماً" items={p.bottom_employees} empty="لا غياب أو تأخر مسجّل" tone={DASH.red} />
        <EmpList id="units" title="الوحدات الأعلى غياباً وتأخراً" items={p.units_attendance} empty="لا سجلات" tone={DASH.orange} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginBottom: 4 },
  blockTitle: { fontSize: 12.5, fontWeight: '800', color: DASH.ink, textAlign: 'right', marginBottom: 8 },
  tiles: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  tile: { flexGrow: 1, flexBasis: 150, backgroundColor: '#f8fafc', borderRadius: 12, padding: 10 },
  tileLabel: { fontSize: 11, color: DASH.muted, textAlign: 'right', fontWeight: '700' },
  tileVal: { fontSize: 22, fontWeight: '800', textAlign: 'right', marginTop: 2 },
  tileSub: { fontSize: 10.5, color: '#94a3b8', textAlign: 'right' },
  lists: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  listBox: { flexGrow: 1, flexBasis: 240, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 8 },
  listTitle: { fontSize: 12, fontWeight: '800', color: DASH.ink, textAlign: 'right', marginBottom: 6 },
  listRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 4 },
  listRate: { fontSize: 13, fontWeight: '800', width: 44, textAlign: 'center' },
  listName: { fontSize: 12, fontWeight: '700', color: DASH.ink, textAlign: 'right' },
  listSub: { fontSize: 10.5, color: '#64748b', textAlign: 'right' },
  listEmpty: { fontSize: 11, color: '#94a3b8', textAlign: 'right' },
});

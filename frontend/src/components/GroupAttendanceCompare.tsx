import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { courseGroupsAPI } from '../services/api';
import { GROUP_COLORS } from './CourseGroupsModal';

interface GroupStat {
  key: string;
  name: string;
  students: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  total_records: number;
  attendance_rate: number;
  lectures_count: number;
}

const rateColor = (r: number) => (r >= 75 ? '#2e7d32' : r >= 50 ? '#ef6c00' : '#c62828');

/** 📊 مقارنة الحضور بين مجموعات المقرر — يُخفى تلقائياً إن لم يكن للمقرر مجموعات */
export const GroupAttendanceCompare: React.FC<{ courseId: string }> = ({ courseId }) => {
  const [data, setData] = useState<{ groups: GroupStat[]; best: string | null; spread: number } | null>(null);

  useEffect(() => {
    if (!courseId) return;
    courseGroupsAPI.attendance(courseId).then(r => setData(r.data)).catch(() => setData(null));
  }, [courseId]);

  if (!data || data.groups.filter(g => g.key).length === 0) return null;

  return (
    <View style={st.card} testID="group-attendance-compare">
      <View style={st.head}>
        {data.spread > 0 ? (
          <Text style={st.spread} testID="group-attendance-spread">الفارق بين المجموعات: {data.spread}%</Text>
        ) : <View />}
        <Text style={st.title}>👥 مقارنة الحضور بين المجموعات</Text>
      </View>
      {data.groups.map((g, i) => {
        const color = g.key ? GROUP_COLORS[i % GROUP_COLORS.length] : '#78909c';
        const isBest = data.best === g.key && g.total_records > 0 && data.spread > 0;
        return (
          <View key={g.key || '__none'} style={st.row} testID={`group-attendance-row-${g.key || 'none'}`}>
            <View style={st.rateBox}>
              <Text style={[st.rate, { color: rateColor(g.attendance_rate) }]}>{g.attendance_rate}%</Text>
              {isBest && <Ionicons name="trophy" size={14} color="#f9a825" />}
            </View>
            <View style={{ flex: 1 }}>
              <View style={st.nameRow}>
                <Text style={st.meta}>{g.students} طالب · {g.lectures_count} محاضرة</Text>
                <View style={[st.badge, { backgroundColor: color }]}><Text style={st.badgeTxt}>{g.name}</Text></View>
              </View>
              <View style={st.bar}>
                <View style={{ flex: Math.max(g.present, 0.0001), backgroundColor: '#4caf50' }} />
                <View style={{ flex: Math.max(g.late, 0.0001), backgroundColor: '#ff9800' }} />
                <View style={{ flex: Math.max(g.excused, 0.0001), backgroundColor: '#90a4ae' }} />
                <View style={{ flex: Math.max(g.absent, 0.0001), backgroundColor: '#f44336' }} />
              </View>
              <Text style={st.legend}>حضور {g.present} · تأخر {g.late} · عذر {g.excused} · غياب {g.absent}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
};

const st = StyleSheet.create({
  card: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 12, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#eef1f6' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 14, fontWeight: '800', color: '#1a2540' },
  spread: { fontSize: 11, color: '#5b6678', fontWeight: '700', backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f3f5f9' },
  rateBox: { width: 64, alignItems: 'center' },
  rate: { fontSize: 18, fontWeight: '900' },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  badgeTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  meta: { fontSize: 11, color: '#5b6678' },
  bar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: '#eceff1' },
  legend: { fontSize: 10, color: '#78909c', textAlign: 'right', marginTop: 4 },
});

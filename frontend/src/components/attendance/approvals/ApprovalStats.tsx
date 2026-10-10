import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface ApprovalStatsData {
  pending_total: number;
  pending_by_faculty: { faculty_id: string | null; faculty_name: string; count: number }[];
  oldest_pending_days: number | null;
  requested_today: number;
  reviewed_last_7_days: number;
}

interface Props {
  stats: ApprovalStatsData | null;
  activeFaculty: string;
  onFacultyPress: (facultyId: string) => void;
}

const Card = ({ icon, color, label, value, testID }: { icon: any; color: string; label: string; value: string | number; testID: string }) => (
  <View style={[st.card, { borderRightColor: color }]} testID={testID}>
    <View style={[st.iconBox, { backgroundColor: `${color}18` }]}><Ionicons name={icon} size={18} color={color} /></View>
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={[st.value, { color }]}>{value}</Text>
      <Text style={st.label}>{label}</Text>
    </View>
  </View>
);

export const ApprovalStats: React.FC<Props> = ({ stats, activeFaculty, onFacultyPress }) => {
  if (!stats) return null;
  const oldest = stats.oldest_pending_days;
  return (
    <View style={st.wrap} testID="approval-stats">
      <View style={st.cards}>
        <Card icon="time-outline" color="#c67c00" label="طلب معلّق" value={stats.pending_total} testID="stat-pending-total" />
        <Card icon="hourglass-outline" color={oldest !== null && oldest >= 3 ? '#c62828' : '#1565c0'} label="أقدم طلب معلّق" value={oldest === null ? '—' : oldest === 0 ? 'اليوم' : `منذ ${oldest} يوم`} testID="stat-oldest" />
        <Card icon="today-outline" color="#2e7d32" label="طلبات اليوم" value={stats.requested_today} testID="stat-today" />
        <Card icon="checkmark-done-outline" color="#4a148c" label="تمت مراجعته (7 أيام)" value={stats.reviewed_last_7_days} testID="stat-reviewed-week" />
      </View>
      {stats.pending_by_faculty.length > 0 && (
        <View style={st.facRow}>
          <Text style={st.facLabel}>المعلّق حسب الكلية:</Text>
          {stats.pending_by_faculty.map(f => {
            const on = !!f.faculty_id && activeFaculty === f.faculty_id;
            return (
              <TouchableOpacity key={f.faculty_id || 'none'} style={[st.facChip, on && st.facChipOn]} onPress={() => f.faculty_id && onFacultyPress(on ? '' : f.faculty_id)} testID={`stat-faculty-${f.faculty_id || 'none'}`}>
                <Text style={[st.facText, on && { color: '#fff' }]}>{f.faculty_name}</Text>
                <View style={[st.facCount, on && { backgroundColor: 'rgba(255,255,255,0.25)' }]}><Text style={[st.facCountText, on && { color: '#fff' }]}>{f.count}</Text></View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
};

const st = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 10, gap: 8 },
  cards: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  card: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderRightWidth: 3, minWidth: 170, flex: 1, borderWidth: 1, borderColor: '#eef1f6' },
  iconBox: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: 16, fontWeight: '800' },
  label: { fontSize: 11, color: '#8a95a8', fontWeight: '600', marginTop: 1 },
  facRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  facLabel: { fontSize: 11.5, color: '#5b6678', fontWeight: '700' },
  facChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  facChipOn: { backgroundColor: '#1565c0', borderColor: '#1565c0' },
  facText: { fontSize: 11.5, color: '#1a2540', fontWeight: '600' },
  facCount: { backgroundColor: '#fff3cd', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  facCountText: { fontSize: 11, color: '#8a6d3b', fontWeight: '800' },
});

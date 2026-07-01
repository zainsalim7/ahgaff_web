import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
} from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../src/services/api';

interface ChangeRequest {
  id: string;
  lecture_id: string;
  course_name: string;
  course_code: string;
  lecture_date: string;
  lecture_start_time: string;
  student_id: string;
  student_name: string;
  old_status: string | null;
  new_status: string;
  reason: string | null;
  requested_at: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  present: { label: 'حاضر', color: '#0d5a2c', bg: '#e8f5ee' },
  absent: { label: 'غائب', color: '#b71c1c', bg: '#ffe0e0' },
  late: { label: 'متأخر', color: '#c67c00', bg: '#fff3d6' },
  excused: { label: 'مأذون', color: '#4a148c', bg: '#f0e6ff' },
};

const REQ_STATUS: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  pending: { label: 'قيد الانتظار', color: '#8a6d3b', bg: '#fff3cd', icon: 'time' },
  approved: { label: 'مُعتمَد', color: '#0d5a2c', bg: '#e8f5ee', icon: 'checkmark-circle' },
  rejected: { label: 'مرفوض', color: '#b71c1c', bg: '#ffe0e0', icon: 'close-circle' },
  cancelled: { label: 'ملغى', color: '#546e7a', bg: '#eceff1', icon: 'ban' },
};

export default function MyAttendanceRequestsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<ChangeRequest[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'cancelled'>('all');
  const [cancelling, setCancelling] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    try {
      const url = filter === 'all' ? '/attendance-changes/mine' : `/attendance-changes/mine?status=${filter}`;
      const r = await api.get(url);
      setItems(r.data?.items || []);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'فشل تحميل الطلبات';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('خطأ', msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => { setLoading(true); fetchList(); }, [fetchList]);

  const onRefresh = () => { setRefreshing(true); fetchList(); };

  const doCancel = async (id: string) => {
    const confirmMsg = 'هل تريد إلغاء هذا الطلب؟';
    if (Platform.OS === 'web') {
      if (!window.confirm(confirmMsg)) return;
    }
    setCancelling(id);
    try {
      await api.delete(`/attendance-changes/${id}`);
      if (Platform.OS === 'web') window.alert('تم إلغاء الطلب');
      else Alert.alert('تم', 'تم إلغاء الطلب');
      await fetchList();
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'فشل الإلغاء';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('خطأ', msg);
    } finally { setCancelling(null); }
  };

  const renderItem = ({ item }: { item: ChangeRequest }) => {
    const oldSt = item.old_status ? STATUS_LABELS[item.old_status] : { label: '—', color: '#8a95a8', bg: '#f0f2f5' };
    const newSt = STATUS_LABELS[item.new_status] || { label: item.new_status, color: '#333', bg: '#eee' };
    const reqSt = REQ_STATUS[item.status] || REQ_STATUS.pending;
    const dt = item.requested_at ? new Date(item.requested_at).toLocaleString('ar', { dateStyle: 'short', timeStyle: 'short' }) : '';
    const canCancel = item.status === 'pending';

    return (
      <View style={styles.card} data-testid={`my-request-${item.id}`}>
        <View style={styles.cardHeader}>
          <View style={[styles.statusChip, { backgroundColor: reqSt.bg }]}>
            <Ionicons name={reqSt.icon} size={12} color={reqSt.color} />
            <Text style={[styles.statusChipText, { color: reqSt.color }]}>{reqSt.label}</Text>
          </View>
          <Text style={styles.dateText}>{dt}</Text>
        </View>

        <Text style={styles.studentName}>{item.student_name}</Text>
        <Text style={styles.courseText}>{item.course_name} ({item.course_code})</Text>
        <Text style={styles.metaText}>محاضرة: {item.lecture_date} {item.lecture_start_time}</Text>

        <View style={styles.diffRow}>
          <View style={[styles.pill, { backgroundColor: oldSt.bg }]}>
            <Text style={[styles.pillText, { color: oldSt.color }]}>{oldSt.label}</Text>
          </View>
          <Ionicons name="arrow-back" size={16} color="#8a95a8" />
          <View style={[styles.pill, { backgroundColor: newSt.bg }]}>
            <Text style={[styles.pillText, { color: newSt.color }]}>{newSt.label}</Text>
          </View>
        </View>

        {item.reason && (
          <Text style={styles.noteText}>سببي: {item.reason}</Text>
        )}
        {item.status === 'rejected' && item.review_notes && (
          <Text style={styles.rejectNote}>سبب الرفض: {item.review_notes}</Text>
        )}
        {(item.status === 'approved' || item.status === 'rejected') && item.reviewed_by_name && (
          <Text style={styles.metaText}>راجع: {item.reviewed_by_name}</Text>
        )}

        {canCancel && (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => doCancel(item.id)}
            disabled={cancelling === item.id}
            data-testid={`cancel-btn-${item.id}`}
          >
            {cancelling === item.id ? (
              <ActivityIndicator size="small" color="#c62828" />
            ) : (
              <>
                <Ionicons name="close-circle-outline" size={14} color="#c62828" />
                <Text style={styles.cancelBtnText}>إلغاء الطلب</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'طلباتي لتعديل الحضور', headerBackTitle: 'رجوع' }} />

      {/* Filter tabs */}
      <View style={styles.tabs}>
        {(['all', 'pending', 'approved', 'rejected', 'cancelled'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, filter === t && styles.tabActive]}
            onPress={() => setFilter(t)}
            data-testid={`my-filter-${t}`}
          >
            <Text style={[styles.tabText, filter === t && styles.tabTextActive]}>
              {t === 'all' ? 'الكل' : REQ_STATUS[t].label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.emptyBox}><ActivityIndicator size="large" color="#1565c0" /></View>
      ) : items.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="document-text-outline" size={48} color="#c0c8d4" />
          <Text style={styles.emptyText}>لا توجد طلبات {filter !== 'all' ? REQ_STATUS[filter]?.label : ''}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6fa' },
  tabs: { flexDirection: 'row-reverse', padding: 8, gap: 6, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eef1f6', flexWrap: 'wrap' },
  tab: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#f0f2f5' },
  tabActive: { backgroundColor: '#1565c0' },
  tabText: { fontSize: 12, color: '#555', fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#eef1f6' },
  cardHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  statusChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusChipText: { fontSize: 11, fontWeight: '700' },
  dateText: { fontSize: 11, color: '#8a95a8' },
  studentName: { fontSize: 14, fontWeight: '700', color: '#1a2540', textAlign: 'right' },
  courseText: { fontSize: 12, color: '#555', textAlign: 'right', marginTop: 2 },
  metaText: { fontSize: 11, color: '#8a95a8', textAlign: 'right', marginTop: 2 },
  diffRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 8 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  pillText: { fontSize: 12, fontWeight: '600' },
  noteText: { fontSize: 11, color: '#555', textAlign: 'right', marginTop: 6, fontStyle: 'italic' },
  rejectNote: { fontSize: 11, color: '#b71c1c', textAlign: 'right', marginTop: 6, backgroundColor: '#ffe0e0', padding: 6, borderRadius: 4 },
  cancelBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#c62828' },
  cancelBtnText: { color: '#c62828', fontWeight: '600', fontSize: 12 },
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { fontSize: 14, color: '#8a95a8', marginTop: 12, textAlign: 'center' },
});

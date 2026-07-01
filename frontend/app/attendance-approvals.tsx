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
  Modal,
  TextInput,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../src/services/api';
import { useAuth, PERMISSIONS } from '../src/contexts/AuthContext';

interface ChangeRequest {
  id: string;
  lecture_id: string;
  course_id: string;
  course_name: string;
  course_code: string;
  lecture_date: string;
  lecture_start_time: string;
  student_id: string;
  student_name: string;
  old_status: string | null;
  new_status: string;
  reason: string | null;
  requested_by: string;
  requested_by_name: string;
  requested_by_role: string;
  requested_at: string;
  status: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  present: { label: 'حاضر', color: '#0d5a2c', bg: '#e8f5ee' },
  absent: { label: 'غائب', color: '#b71c1c', bg: '#ffe0e0' },
  late: { label: 'متأخر', color: '#c67c00', bg: '#fff3d6' },
  excused: { label: 'مأذون', color: '#4a148c', bg: '#f0e6ff' },
};

export default function AttendanceApprovalsScreen() {
  const router = useRouter();
  const { hasPermission } = useAuth();

  const canApprove = hasPermission(PERMISSIONS.APPROVE_ATTENDANCE_CHANGES);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ChangeRequest[]>([]);
  const [filterStatus, setFilterStatus] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [rejectModal, setRejectModal] = useState<{ ids: string[] } | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/attendance-changes?status=${filterStatus}`);
      setItems(res.data?.items || []);
      setSelectedIds(new Set());
    } catch (e: any) {
      console.error(e);
      const msg = e?.response?.data?.detail || 'فشل تحميل الطلبات';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('خطأ', msg);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const toggleSelect = (id: string) => {
    const s = new Set(selectedIds);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelectedIds(s);
  };
  const selectAll = () => {
    if (selectedIds.size === items.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map(i => i.id)));
  };

  const doApprove = async (ids: string[]) => {
    if (!ids.length) return;
    setProcessing(true);
    try {
      if (ids.length === 1) {
        await api.post(`/api/attendance-changes/${ids[0]}/approve`, {});
      } else {
        await api.post(`/api/attendance-changes/batch/approve`, { request_ids: ids });
      }
      const msg = `تم اعتماد ${ids.length} طلب`;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('نجاح', msg);
      await fetchList();
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'فشل الاعتماد';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('خطأ', msg);
    } finally { setProcessing(false); }
  };

  const doReject = async () => {
    if (!rejectModal) return;
    const ids = rejectModal.ids;
    setProcessing(true);
    try {
      if (ids.length === 1) {
        await api.post(`/api/attendance-changes/${ids[0]}/reject`, { review_notes: rejectNotes });
      } else {
        await api.post(`/api/attendance-changes/batch/reject`, { request_ids: ids, review_notes: rejectNotes });
      }
      const msg = `تم رفض ${ids.length} طلب`;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('تم', msg);
      setRejectModal(null);
      setRejectNotes('');
      await fetchList();
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'فشل الرفض';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('خطأ', msg);
    } finally { setProcessing(false); }
  };

  if (!canApprove) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'اعتماد تعديلات الحضور' }} />
        <View style={styles.emptyBox}>
          <Ionicons name="lock-closed" size={48} color="#c0c8d4" />
          <Text style={styles.emptyText}>هذه الصفحة متاحة فقط لعميد الكلية والمدير</Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderItem = ({ item }: { item: ChangeRequest }) => {
    const oldSt = item.old_status ? STATUS_LABELS[item.old_status] : { label: '—', color: '#8a95a8', bg: '#f0f2f5' };
    const newSt = STATUS_LABELS[item.new_status] || { label: item.new_status, color: '#333', bg: '#eee' };
    const isSelected = selectedIds.has(item.id);
    const isPending = item.status === 'pending';

    return (
      <TouchableOpacity
        style={[styles.card, isSelected && styles.cardSelected]}
        onPress={() => isPending && toggleSelect(item.id)}
        activeOpacity={0.85}
        data-testid={`request-row-${item.id}`}
      >
        <View style={styles.cardHeader}>
          {isPending && (
            <View style={[styles.checkbox, isSelected && styles.checkboxOn]}>
              {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
          )}
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={styles.studentName}>{item.student_name}</Text>
            <Text style={styles.courseText}>{item.course_name} ({item.course_code})</Text>
            <Text style={styles.metaText}>محاضرة: {item.lecture_date} {item.lecture_start_time}</Text>
          </View>
        </View>
        <View style={styles.diffRow}>
          <View style={[styles.pill, { backgroundColor: oldSt.bg }]}>
            <Text style={[styles.pillText, { color: oldSt.color }]}>{oldSt.label}</Text>
          </View>
          <Ionicons name="arrow-back" size={16} color="#8a95a8" />
          <View style={[styles.pill, { backgroundColor: newSt.bg }]}>
            <Text style={[styles.pillText, { color: newSt.color }]}>{newSt.label}</Text>
          </View>
        </View>
        <Text style={styles.byText}>
          طلب: {item.requested_by_name} ({item.requested_by_role}) {item.reason ? `• ${item.reason}` : ''}
        </Text>
        {isPending && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.approveBtn]}
              onPress={() => doApprove([item.id])}
              disabled={processing}
              data-testid={`approve-btn-${item.id}`}
            >
              <Ionicons name="checkmark-circle" size={16} color="#fff" />
              <Text style={styles.actionText}>اعتماد</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn]}
              onPress={() => { setRejectModal({ ids: [item.id] }); setRejectNotes(''); }}
              disabled={processing}
              data-testid={`reject-btn-${item.id}`}
            >
              <Ionicons name="close-circle" size={16} color="#fff" />
              <Text style={styles.actionText}>رفض</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'اعتماد تعديلات الحضور', headerBackTitle: 'رجوع' }} />

      {/* Filter tabs */}
      <View style={styles.tabs}>
        {(['pending', 'approved', 'rejected', 'all'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, filterStatus === t && styles.tabActive]}
            onPress={() => setFilterStatus(t)}
            data-testid={`filter-${t}`}
          >
            <Text style={[styles.tabText, filterStatus === t && styles.tabTextActive]}>
              {t === 'pending' ? 'قيد الانتظار' : t === 'approved' ? 'معتمد' : t === 'rejected' ? 'مرفوض' : 'الكل'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Bulk actions */}
      {filterStatus === 'pending' && items.length > 0 && (
        <View style={styles.bulkBar}>
          <TouchableOpacity onPress={selectAll} style={styles.bulkBtnGhost} data-testid="select-all-btn">
            <Text style={styles.bulkBtnGhostText}>
              {selectedIds.size === items.length ? 'إلغاء الكل' : 'تحديد الكل'} ({selectedIds.size}/{items.length})
            </Text>
          </TouchableOpacity>
          {selectedIds.size > 0 && (
            <>
              <TouchableOpacity
                style={[styles.bulkBtn, styles.approveBtn]}
                onPress={() => doApprove(Array.from(selectedIds))}
                disabled={processing}
                data-testid="batch-approve-btn"
              >
                <Text style={styles.bulkBtnText}>اعتماد المحدد</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.bulkBtn, styles.rejectBtn]}
                onPress={() => { setRejectModal({ ids: Array.from(selectedIds) }); setRejectNotes(''); }}
                disabled={processing}
                data-testid="batch-reject-btn"
              >
                <Text style={styles.bulkBtnText}>رفض المحدد</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {loading ? (
        <View style={styles.emptyBox}><ActivityIndicator size="large" color="#1565c0" /></View>
      ) : items.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="checkmark-done-circle" size={48} color="#c0c8d4" />
          <Text style={styles.emptyText}>لا توجد طلبات {filterStatus === 'pending' ? 'قيد الانتظار' : ''}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
        />
      )}

      {/* Reject Modal */}
      <Modal visible={!!rejectModal} transparent animationType="fade" onRequestClose={() => setRejectModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>سبب الرفض (اختياري)</Text>
            <TextInput
              style={styles.textArea}
              value={rejectNotes}
              onChangeText={setRejectNotes}
              placeholder="اكتب سبب الرفض..."
              multiline
              numberOfLines={3}
              textAlign="right"
              data-testid="reject-notes-input"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.rejectBtn]}
                onPress={doReject}
                disabled={processing}
                data-testid="confirm-reject-btn"
              >
                <Text style={styles.actionText}>تأكيد الرفض</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#8a95a8' }]}
                onPress={() => setRejectModal(null)}
              >
                <Text style={styles.actionText}>إلغاء</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6fa' },
  tabs: { flexDirection: 'row-reverse', padding: 8, gap: 6, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eef1f6' },
  tab: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16, backgroundColor: '#f0f2f5' },
  tabActive: { backgroundColor: '#1565c0' },
  tabText: { fontSize: 12, color: '#555', fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  bulkBar: { flexDirection: 'row-reverse', padding: 8, gap: 8, backgroundColor: '#fff3cd', alignItems: 'center' },
  bulkBtnGhost: { paddingVertical: 6, paddingHorizontal: 10 },
  bulkBtnGhostText: { color: '#8a6d3b', fontWeight: '600', fontSize: 12 },
  bulkBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 },
  bulkBtnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#eef1f6' },
  cardSelected: { borderColor: '#1565c0', borderWidth: 2 },
  cardHeader: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8 },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: '#c0c8d4', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkboxOn: { backgroundColor: '#1565c0', borderColor: '#1565c0' },
  studentName: { fontSize: 14, fontWeight: '700', color: '#1a2540', textAlign: 'right' },
  courseText: { fontSize: 12, color: '#555', textAlign: 'right', marginTop: 2 },
  metaText: { fontSize: 11, color: '#8a95a8', textAlign: 'right', marginTop: 2 },
  diffRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 8 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  pillText: { fontSize: 12, fontWeight: '600' },
  byText: { fontSize: 11, color: '#8a95a8', textAlign: 'right', marginTop: 6 },
  actionsRow: { flexDirection: 'row-reverse', gap: 8, marginTop: 10 },
  actionBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
  approveBtn: { backgroundColor: '#2e7d32' },
  rejectBtn: { backgroundColor: '#c62828' },
  actionText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { fontSize: 14, color: '#8a95a8', marginTop: 12, textAlign: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, width: '100%', maxWidth: 400 },
  modalTitle: { fontSize: 15, fontWeight: '700', color: '#1a2540', marginBottom: 12, textAlign: 'right' },
  textArea: { borderWidth: 1, borderColor: '#c0c8d4', borderRadius: 8, padding: 10, minHeight: 70, textAlignVertical: 'top', fontSize: 13 },
  modalActions: { flexDirection: 'row-reverse', gap: 8, marginTop: 12, justifyContent: 'flex-start' },
});

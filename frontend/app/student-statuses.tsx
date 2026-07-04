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
  RefreshControl,
} from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../src/services/api';
import { useAuth, PERMISSIONS } from '../src/contexts/AuthContext';

interface StatusStudent {
  id: string;
  student_id: string;
  full_name: string;
  status: string;
  status_label: string;
  reason: string | null;
  changed_at: string;
  department_id: string | null;
  department_name: string | null;
  faculty_name: string | null;
  snapshot_level: number | null;
  snapshot_section: string | null;
  snapshot_semester_name: string | null;
  snapshot_academic_year: string | null;
  has_snapshot: boolean;
}

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  frozen: { label: 'مجمَّد', color: '#0369a1', bg: '#e0f2fe', icon: 'snow' },
  repeat: { label: 'إعادة', color: '#c67c00', bg: '#fff3d6', icon: 'refresh-circle' },
  expelled: { label: 'مفصول', color: '#b71c1c', bg: '#ffe0e0', icon: 'close-circle' },
};

export default function StudentStatusesScreen() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.MANAGE_STUDENTS);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<StatusStudent[]>([]);
  const [filter, setFilter] = useState<'all' | 'frozen' | 'repeat' | 'expelled'>('all');
  const [search, setSearch] = useState('');

  const [restoreModal, setRestoreModal] = useState<StatusStudent | null>(null);
  const [restoreLevel, setRestoreLevel] = useState<number>(1);
  const [restoreSection, setRestoreSection] = useState<string>('أ');
  const [restoreReason, setRestoreReason] = useState<string>('');
  const [availableSections, setAvailableSections] = useState<string[]>(['أ', 'ب']);
  const [processing, setProcessing] = useState(false);

  const fetchList = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('status', filter);
      if (search.trim()) params.set('q', search.trim());
      const url = `/student-statuses${params.toString() ? '?' + params.toString() : ''}`;
      const r = await api.get(url);
      setItems(r.data?.items || []);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'فشل تحميل القائمة';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('خطأ', msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, search]);

  useEffect(() => { setLoading(true); fetchList(); }, [fetchList]);

  const openRestoreModal = async (s: StatusStudent) => {
    setRestoreModal(s);
    setRestoreLevel(s.snapshot_level || 1);
    setRestoreSection(s.snapshot_section || 'أ');
    setRestoreReason('');
    try {
      const r = await api.get(`/student-status/available-sections${s.department_id ? '?department_id=' + s.department_id : ''}`);
      const secs = r.data?.sections || ['أ', 'ب'];
      setAvailableSections(secs);
      if (s.snapshot_section && !secs.includes(s.snapshot_section)) {
        // إضافة القسم الأصلي إن لم يكن ضمن القائمة
        setAvailableSections([...secs, s.snapshot_section]);
      }
    } catch (e) {
      setAvailableSections(['أ', 'ب']);
    }
  };

  const doRestore = async () => {
    if (!restoreModal) return;
    setProcessing(true);
    try {
      await api.post(`/student-status/${restoreModal.id}/restore`, {
        new_level: restoreLevel,
        new_section: restoreSection,
        reason: restoreReason.trim() || 'استرجاع للحالة النشطة',
      });
      const msg = `تم استرجاع ${restoreModal.full_name} إلى المستوى ${restoreLevel} ${restoreSection}`;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('نجاح', msg);
      setRestoreModal(null);
      await fetchList();
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'فشل الاسترجاع';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('خطأ', msg);
    } finally { setProcessing(false); }
  };

  const renderItem = ({ item }: { item: StatusStudent }) => {
    const meta = STATUS_META[item.status] || { label: item.status_label, color: '#333', bg: '#eee', icon: 'ellipse' };
    const dt = item.changed_at ? new Date(item.changed_at).toLocaleDateString('ar', { dateStyle: 'medium' }) : '—';
    return (
      <View style={styles.card} data-testid={`status-row-${item.id}`}>
        <View style={styles.cardHeader}>
          <View style={[styles.statusChip, { backgroundColor: meta.bg }]}>
            <Ionicons name={meta.icon} size={12} color={meta.color} />
            <Text style={[styles.statusChipText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <Text style={styles.dateText}>{dt}</Text>
        </View>
        <Text style={styles.studentName}>{item.full_name}</Text>
        <Text style={styles.metaText}>الرقم: {item.student_id || '—'} • {item.department_name || 'قسم غير محدد'}</Text>
        <View style={styles.snapshotBox}>
          <Text style={styles.snapshotHeader}>البيانات لحظة تغيير الحالة:</Text>
          <View style={styles.snapshotRow}>
            <Text style={styles.snapshotKey}>المستوى:</Text>
            <Text style={styles.snapshotVal}>{item.snapshot_level ?? '—'}</Text>
            <Text style={styles.snapshotKey}>الشعبة:</Text>
            <Text style={styles.snapshotVal}>{item.snapshot_section || '—'}</Text>
          </View>
          <View style={styles.snapshotRow}>
            <Text style={styles.snapshotKey}>الفصل:</Text>
            <Text style={styles.snapshotVal}>{item.snapshot_semester_name || '—'}</Text>
            <Text style={styles.snapshotKey}>العام:</Text>
            <Text style={styles.snapshotVal}>{item.snapshot_academic_year || '—'}</Text>
          </View>
          {!item.has_snapshot && (
            <Text style={styles.snapshotWarn}>⚠️ سجل قديم قبل تفعيل الـ snapshot (البيانات تقريبية)</Text>
          )}
        </View>
        {item.reason && (
          <Text style={styles.reasonText}>السبب: {item.reason}</Text>
        )}
        {canManage && (
          <TouchableOpacity
            style={styles.restoreBtn}
            onPress={() => openRestoreModal(item)}
            data-testid={`restore-btn-${item.id}`}
          >
            <Ionicons name="arrow-undo" size={14} color="#fff" />
            <Text style={styles.restoreBtnText}>إعادة إلى النشط</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'حالات الطالب (غير المستمرين)', headerBackTitle: 'رجوع' }} />

      {/* Search + Tabs */}
      <View style={styles.header}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="بحث بالاسم أو الرقم..."
          textAlign="right"
          data-testid="status-search-input"
        />
        <View style={styles.tabs}>
          {(['all', 'frozen', 'repeat', 'expelled'] as const).map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.tab, filter === t && styles.tabActive]}
              onPress={() => setFilter(t)}
              data-testid={`status-filter-${t}`}
            >
              <Text style={[styles.tabText, filter === t && styles.tabTextActive]}>
                {t === 'all' ? `الكل (${items.length})` : STATUS_META[t].label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.emptyBox}><ActivityIndicator size="large" color="#1565c0" /></View>
      ) : items.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="people-circle-outline" size={48} color="#c0c8d4" />
          <Text style={styles.emptyText}>لا يوجد طلاب في هذه الحالة</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchList(); }} />}
        />
      )}

      {/* Restore Modal */}
      <Modal visible={!!restoreModal} transparent animationType="fade" onRequestClose={() => setRestoreModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>استرجاع الطالب</Text>
            <Text style={styles.modalSub}>{restoreModal?.full_name}</Text>

            <Text style={styles.fieldLabel}>المستوى:</Text>
            <View style={styles.optionsRow}>
              {[1, 2, 3, 4].map(lv => (
                <TouchableOpacity
                  key={lv}
                  style={[styles.optionBtn, restoreLevel === lv && styles.optionBtnActive]}
                  onPress={() => setRestoreLevel(lv)}
                  data-testid={`restore-level-${lv}`}
                >
                  <Text style={[styles.optionText, restoreLevel === lv && styles.optionTextActive]}>{lv}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>الشعبة:</Text>
            <View style={styles.optionsRow}>
              {availableSections.map(sec => (
                <TouchableOpacity
                  key={sec}
                  style={[styles.optionBtn, restoreSection === sec && styles.optionBtnActive]}
                  onPress={() => setRestoreSection(sec)}
                  data-testid={`restore-section-${sec}`}
                >
                  <Text style={[styles.optionText, restoreSection === sec && styles.optionTextActive]}>{sec}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>ملاحظة (اختياري):</Text>
            <TextInput
              style={styles.textArea}
              value={restoreReason}
              onChangeText={setRestoreReason}
              placeholder="سبب الاسترجاع..."
              multiline
              textAlign="right"
              data-testid="restore-reason-input"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.approveBtn]}
                onPress={doRestore}
                disabled={processing}
                data-testid="confirm-restore-btn"
              >
                {processing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.actionText}>تأكيد الاسترجاع</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#8a95a8' }]}
                onPress={() => setRestoreModal(null)}
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
  header: { padding: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eef1f6', gap: 6 },
  searchInput: { borderWidth: 1, borderColor: '#c0c8d4', borderRadius: 8, padding: 8, fontSize: 13 },
  tabs: { flexDirection: 'row-reverse', gap: 6, flexWrap: 'wrap' },
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
  metaText: { fontSize: 11, color: '#8a95a8', textAlign: 'right', marginTop: 2 },
  snapshotBox: { backgroundColor: '#f8fafc', borderRadius: 6, padding: 8, marginTop: 8 },
  snapshotHeader: { fontSize: 11, color: '#556', fontWeight: '700', textAlign: 'right', marginBottom: 4 },
  snapshotRow: { flexDirection: 'row-reverse', gap: 8, marginTop: 2 },
  snapshotKey: { fontSize: 11, color: '#8a95a8', fontWeight: '600' },
  snapshotVal: { fontSize: 11, color: '#1a2540', fontWeight: '700' },
  snapshotWarn: { fontSize: 10, color: '#c67c00', marginTop: 4, textAlign: 'right' },
  reasonText: { fontSize: 12, color: '#555', textAlign: 'right', marginTop: 6, fontStyle: 'italic', backgroundColor: '#fff9e6', padding: 6, borderRadius: 4 },
  restoreBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: '#2e7d32' },
  restoreBtnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { fontSize: 14, color: '#8a95a8', marginTop: 12, textAlign: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, width: '100%', maxWidth: 420 },
  modalTitle: { fontSize: 15, fontWeight: '700', color: '#1a2540', marginBottom: 4, textAlign: 'right' },
  modalSub: { fontSize: 13, color: '#556', marginBottom: 12, textAlign: 'right' },
  fieldLabel: { fontSize: 12, color: '#556', fontWeight: '600', marginTop: 10, marginBottom: 4, textAlign: 'right' },
  optionsRow: { flexDirection: 'row-reverse', gap: 6, flexWrap: 'wrap' },
  optionBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#f0f2f5', borderWidth: 1, borderColor: '#e5e7eb' },
  optionBtnActive: { backgroundColor: '#1565c0', borderColor: '#1565c0' },
  optionText: { fontSize: 13, color: '#333', fontWeight: '600' },
  optionTextActive: { color: '#fff' },
  textArea: { borderWidth: 1, borderColor: '#c0c8d4', borderRadius: 8, padding: 8, minHeight: 60, textAlignVertical: 'top', fontSize: 13 },
  modalActions: { flexDirection: 'row-reverse', gap: 8, marginTop: 14, justifyContent: 'flex-start' },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6, minWidth: 100, alignItems: 'center' },
  approveBtn: { backgroundColor: '#2e7d32' },
  actionText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});

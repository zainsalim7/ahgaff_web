import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform, Modal, TextInput } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../src/services/api';
import { useAuth, PERMISSIONS } from '../src/contexts/AuthContext';
import { ExportButton } from '../src/components/ExportButton';
import { ChangeRequest, FilterOptions, REQ_STATUS, PAGE_SIZE, filtersToQuery } from '../src/components/attendance/approvals/types';
import { useApprovalFilters } from '../src/components/attendance/approvals/useApprovalFilters';
import { ApprovalFilterBar } from '../src/components/attendance/approvals/ApprovalFilterBar';
import { ApprovalStats, ApprovalStatsData } from '../src/components/attendance/approvals/ApprovalStats';
import { RequestCard } from '../src/components/attendance/approvals/RequestCard';
import { LectureGroupCard, groupByLecture } from '../src/components/attendance/approvals/LectureGroupCard';
import { Pagination } from '../src/components/attendance/approvals/Pagination';

const notify = (title: string, msg: string) => {
  if (Platform.OS === 'web') window.alert(msg);
  else Alert.alert(title, msg);
};

const STATUS_TABS = ['pending', 'approved', 'rejected', 'cancelled', 'all'] as const;

export default function AttendanceApprovalsScreen() {
  const { hasPermission, isLoading: authLoading } = useAuth();
  const canApprove = hasPermission(PERMISSIONS.APPROVE_ATTENDANCE_CHANGES);
  const ready = !authLoading && canApprove;
  const { filters, effective, update, reset, activeCount } = useApprovalFilters();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ChangeRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [stats, setStats] = useState<ApprovalStatsData | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [rejectModal, setRejectModal] = useState<{ ids: string[] } | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');

  const queryString = useMemo(() => filtersToQuery(effective), [effective]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/attendance-changes?${queryString}`);
      setItems(res.data?.items || []);
      setTotal(res.data?.total || 0);
      setPages(res.data?.pages || 1);
      setCounts(res.data?.counts || {});
      setSelectedIds(new Set());
    } catch (e: any) {
      notify('خطأ', e?.response?.data?.detail || 'فشل تحميل الطلبات');
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  const fetchMeta = useCallback(async () => {
    try {
      const [o, s] = await Promise.all([api.get('/attendance-changes/filter-options'), api.get('/attendance-changes/stats')]);
      setOptions(o.data);
      setStats(s.data);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { if (ready) fetchList(); }, [fetchList, ready]);
  useEffect(() => { if (ready) fetchMeta(); }, [fetchMeta, ready]);

  const refreshAll = useCallback(async () => { await Promise.all([fetchList(), fetchMeta()]); }, [fetchList, fetchMeta]);

  const toggleSelect = (id: string) => setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const toggleMany = (ids: string[], on: boolean) => setSelectedIds(prev => { const s = new Set(prev); ids.forEach(id => on ? s.add(id) : s.delete(id)); return s; });
  const pendingItems = items.filter(i => i.status === 'pending');
  const selectAll = () => setSelectedIds(selectedIds.size === pendingItems.length ? new Set() : new Set(pendingItems.map(i => i.id)));

  const doApprove = async (ids: string[]) => {
    if (!ids.length) return;
    setProcessing(true);
    try {
      if (ids.length === 1) await api.post(`/attendance-changes/${ids[0]}/approve`, {});
      else await api.post('/attendance-changes/batch/approve', { request_ids: ids });
      notify('نجاح', `تم اعتماد ${ids.length} طلب`);
      await refreshAll();
    } catch (e: any) {
      notify('خطأ', e?.response?.data?.detail || 'فشل الاعتماد');
    } finally { setProcessing(false); }
  };

  const openReject = (ids: string[]) => { setRejectModal({ ids }); setRejectNotes(''); };

  const doReject = async () => {
    if (!rejectModal) return;
    const ids = rejectModal.ids;
    setProcessing(true);
    try {
      if (ids.length === 1) await api.post(`/attendance-changes/${ids[0]}/reject`, { review_notes: rejectNotes });
      else await api.post('/attendance-changes/batch/reject', { request_ids: ids, review_notes: rejectNotes });
      notify('تم', `تم رفض ${ids.length} طلب`);
      setRejectModal(null);
      setRejectNotes('');
      await refreshAll();
    } catch (e: any) {
      notify('خطأ', e?.response?.data?.detail || 'فشل الرفض');
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

  const groups = filters.view === 'grouped' ? groupByLecture(items) : [];

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'اعتماد تعديلات الحضور', headerBackTitle: 'رجوع' }} />

      <ScrollView stickyHeaderIndices={[1]} contentContainerStyle={{ paddingBottom: 32 }}>
        <ApprovalStats stats={stats} activeFaculty={filters.faculty_id} onFacultyPress={id => update({ faculty_id: id, status: 'pending' })} />

        <View>
          <View style={styles.tabs}>
            {STATUS_TABS.map(t => {
              const on = filters.status === t;
              const n = counts[t] ?? 0;
              return (
                <TouchableOpacity key={t} style={[styles.tab, on && styles.tabActive]} onPress={() => update({ status: t })} testID={`filter-${t}`}>
                  <Text style={[styles.tabText, on && styles.tabTextActive]}>{REQ_STATUS[t].label}</Text>
                  <View style={[styles.tabCount, on && styles.tabCountOn]}><Text style={[styles.tabCountText, on && { color: '#fff' }]} testID={`filter-count-${t}`}>{n}</Text></View>
                </TouchableOpacity>
              );
            })}
            <View style={{ flex: 1 }} />
            <View style={styles.viewToggle} testID="view-toggle">
              {(['list', 'grouped'] as const).map(v => (
                <TouchableOpacity key={v} style={[styles.viewBtn, filters.view === v && styles.viewBtnOn]} onPress={() => update({ view: v })} testID={`view-${v}`}>
                  <Ionicons name={v === 'list' ? 'list' : 'albums-outline'} size={14} color={filters.view === v ? '#fff' : '#5b6678'} />
                  <Text style={[styles.viewText, filters.view === v && { color: '#fff' }]}>{v === 'list' ? 'قائمة' : 'حسب المحاضرة'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <ExportButton filename={`طلبات تعديل الحضور.xlsx`} onExport={() => api.get(`/attendance-changes/export?${filtersToQuery(effective, false)}`, { responseType: 'blob' })} />
          </View>
          <ApprovalFilterBar filters={filters} options={options} activeCount={activeCount} onChange={update} onReset={reset} />
        </View>

        {filters.status === 'pending' && pendingItems.length > 0 && (
          <View style={styles.bulkBar}>
            <TouchableOpacity onPress={selectAll} style={styles.bulkBtnGhost} testID="select-all-btn">
              <Text style={styles.bulkBtnGhostText}>{selectedIds.size === pendingItems.length ? 'إلغاء الكل' : 'تحديد الكل'} ({selectedIds.size}/{pendingItems.length})</Text>
            </TouchableOpacity>
            {selectedIds.size > 0 && (
              <>
                <TouchableOpacity style={[styles.bulkBtn, styles.approveBtn]} onPress={() => doApprove(Array.from(selectedIds))} disabled={processing} testID="batch-approve-btn">
                  <Text style={styles.bulkBtnText}>اعتماد المحدد ({selectedIds.size})</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.bulkBtn, styles.rejectBtn]} onPress={() => openReject(Array.from(selectedIds))} disabled={processing} testID="batch-reject-btn">
                  <Text style={styles.bulkBtnText}>رفض المحدد</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {loading ? (
          <View style={styles.emptyBox}><ActivityIndicator size="large" color="#1565c0" /></View>
        ) : items.length === 0 ? (
          <View style={styles.emptyBox} testID="empty-state">
            <Ionicons name="checkmark-done-circle" size={48} color="#c0c8d4" />
            <Text style={styles.emptyText}>لا توجد طلبات مطابقة{activeCount ? ' للفلاتر الحالية' : ''}</Text>
            {activeCount > 0 && (
              <TouchableOpacity onPress={reset} style={styles.emptyReset} testID="empty-reset-btn"><Text style={styles.emptyResetText}>مسح الفلاتر</Text></TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={{ padding: 12 }} testID="results-list">
            {filters.view === 'grouped'
              ? groups.map(g => (
                <LectureGroupCard key={g.lecture_id} group={g} selectedIds={selectedIds} processing={processing} onToggle={toggleSelect} onToggleMany={toggleMany} onApprove={doApprove} onReject={openReject} />
              ))
              : items.map(item => (
                <RequestCard key={item.id} item={item} selected={selectedIds.has(item.id)} processing={processing} onToggle={toggleSelect} onApprove={doApprove} onReject={openReject} />
              ))}
          </View>
        )}

        {!loading && <Pagination page={filters.page} pages={pages} total={total} pageSize={PAGE_SIZE} onChange={p => update({ page: p })} />}
      </ScrollView>

      <Modal visible={!!rejectModal} transparent animationType="fade" onRequestClose={() => setRejectModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>سبب الرفض (اختياري) — {rejectModal?.ids.length || 0} طلب</Text>
            <TextInput style={styles.textArea} value={rejectNotes} onChangeText={setRejectNotes} placeholder="اكتب سبب الرفض..." multiline numberOfLines={3} textAlign="right" testID="reject-notes-input" />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={doReject} disabled={processing} testID="confirm-reject-btn">
                <Text style={styles.actionText}>تأكيد الرفض</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#8a95a8' }]} onPress={() => setRejectModal(null)} testID="cancel-reject-btn">
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
  tabs: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 6, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eef1f6', flexWrap: 'wrap' },
  tab: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#f0f2f5' },
  tabActive: { backgroundColor: '#1565c0' },
  tabText: { fontSize: 12, color: '#555', fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  tabCount: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, minWidth: 22, alignItems: 'center' },
  tabCountOn: { backgroundColor: 'rgba(255,255,255,0.25)' },
  tabCountText: { fontSize: 11, fontWeight: '800', color: '#1a2540' },
  viewToggle: { flexDirection: 'row-reverse', backgroundColor: '#f0f2f5', borderRadius: 8, padding: 2, gap: 2 },
  viewBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  viewBtnOn: { backgroundColor: '#1565c0' },
  viewText: { fontSize: 11.5, fontWeight: '700', color: '#5b6678' },
  bulkBar: { flexDirection: 'row-reverse', paddingHorizontal: 12, paddingVertical: 8, gap: 8, backgroundColor: '#fff3cd', alignItems: 'center' },
  bulkBtnGhost: { paddingVertical: 6, paddingHorizontal: 10 },
  bulkBtnGhostText: { color: '#8a6d3b', fontWeight: '600', fontSize: 12 },
  bulkBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 },
  bulkBtnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  actionBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
  approveBtn: { backgroundColor: '#2e7d32' },
  rejectBtn: { backgroundColor: '#c62828' },
  actionText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  emptyBox: { alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { fontSize: 14, color: '#8a95a8', marginTop: 12, textAlign: 'center' },
  emptyReset: { marginTop: 10, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: '#e3f0ff' },
  emptyResetText: { color: '#1565c0', fontWeight: '700', fontSize: 12 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, width: '100%', maxWidth: 400 },
  modalTitle: { fontSize: 15, fontWeight: '700', color: '#1a2540', marginBottom: 12, textAlign: 'right' },
  textArea: { borderWidth: 1, borderColor: '#c0c8d4', borderRadius: 8, padding: 10, minHeight: 70, textAlignVertical: 'top', fontSize: 13 },
  modalActions: { flexDirection: 'row-reverse', gap: 8, marginTop: 12, justifyContent: 'flex-start' },
});

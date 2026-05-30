/**
 * مدير حالات الطلاب - تخرج / إعادة / فصل / تجميد / مستمر
 * إجراءات جماعية + فلاتر متعددة + سجل تاريخ
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Platform, Modal, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import api from '../src/services/api';

const STATUS_OPTIONS = [
  { value: 'active', label: 'مستمر', color: '#2e7d32', bg: '#e8f5e9', icon: 'checkmark-circle' },
  { value: 'repeat', label: 'إعادة', color: '#ef6c00', bg: '#fff3e0', icon: 'refresh-circle' },
  { value: 'graduated', label: 'متخرج', color: '#1565c0', bg: '#e3f2fd', icon: 'school' },
  { value: 'expelled', label: 'مفصول', color: '#c62828', bg: '#ffebee', icon: 'close-circle' },
  { value: 'frozen', label: 'مجمَّد', color: '#5e35b1', bg: '#ede7f6', icon: 'snow' },
];

const getStatusInfo = (s: string) => STATUS_OPTIONS.find(o => o.value === s) ||
  { value: s || 'unknown', label: s || 'غير محدد', color: '#999', bg: '#f5f5f5', icon: 'help-circle' };

export default function StudentStatusManager() {
  const [students, setStudents] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [faculties, setFaculties] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  // فلاتر
  const [filterFaculty, setFilterFaculty] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  // تحديد
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // modal الإجراء
  const [showAction, setShowAction] = useState(false);
  const [actionStatus, setActionStatus] = useState('repeat');
  const [actionLevel, setActionLevel] = useState<string>('');
  const [actionReason, setActionReason] = useState('');
  const [applying, setApplying] = useState(false);
  // history modal
  const [showHistory, setShowHistory] = useState(false);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [historyFor, setHistoryFor] = useState<any>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, d, f, st] = await Promise.all([
        api.get('/students', { params: { limit: 2000 } }),
        api.get('/departments'),
        api.get('/faculties'),
        api.get('/student-status/stats'),
      ]);
      setStudents(s.data?.items || s.data || []);
      setDepartments(d.data?.items || d.data || []);
      setFaculties(f.data?.items || f.data || []);
      setStats(st.data?.stats || {});
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'فشل التحميل';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('خطأ', msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // الطلاب بعد الفلترة
  const filtered = useMemo(() => {
    return students.filter((s: any) => {
      if (filterFaculty && s.faculty_id !== filterFaculty) return false;
      if (filterDept && s.department_id !== filterDept) return false;
      if (filterLevel && String(s.level) !== filterLevel) return false;
      if (filterStatus) {
        const sStatus = s.status || (s.is_active === false ? 'inactive' : 'active');
        if (sStatus !== filterStatus) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const name = (s.full_name || '').toLowerCase();
        const sid = (s.student_id || '').toString().toLowerCase();
        const ref = (s.reference_number || '').toLowerCase();
        if (!name.includes(q) && !sid.includes(q) && !ref.includes(q)) return false;
      }
      return true;
    });
  }, [students, filterFaculty, filterDept, filterLevel, filterStatus, search]);

  const toggleSelect = (id: string) => {
    const ns = new Set(selected);
    if (ns.has(id)) ns.delete(id); else ns.add(id);
    setSelected(ns);
  };

  const selectAllVisible = () => {
    setSelected(new Set(filtered.map((s: any) => s.id || s._id)));
  };

  const clearSelection = () => setSelected(new Set());

  const applyBulk = async () => {
    if (selected.size === 0) return;
    if (!actionStatus) return;

    // التأكيد بحسب نوع العملية
    const so = getStatusInfo(actionStatus);
    const confirmMsg = `تطبيق "${so.label}" على ${selected.size} طالب؟`;
    if (Platform.OS === 'web' && !window.confirm(confirmMsg)) return;

    setApplying(true);
    try {
      const body: any = {
        student_ids: Array.from(selected),
        new_status: actionStatus,
        reason: actionReason,
      };
      if (actionLevel) body.new_level = parseInt(actionLevel);
      const res = await api.post('/student-status/bulk-change', body);
      const r = res.data;
      const msg = `${r.message}\nنجح: ${r.success_count} | فشل: ${r.failed_count}`;
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('تم', msg);
      setShowAction(false);
      setSelected(new Set());
      setActionReason('');
      setActionLevel('');
      fetchAll();
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'فشل التطبيق';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('خطأ', msg);
    } finally {
      setApplying(false);
    }
  };

  const viewHistory = async (student: any) => {
    setHistoryFor(student);
    setShowHistory(true);
    try {
      const res = await api.get(`/student-status/${student.id || student._id}/history`);
      setHistoryData(res.data?.items || []);
    } catch (e) {
      setHistoryData([]);
    }
  };

  const deptFiltered = useMemo(() => {
    if (!filterFaculty) return departments;
    return departments.filter((d: any) => d.faculty_id === filterFaculty);
  }, [filterFaculty, departments]);

  return (
    <>
      <Stack.Screen options={{ title: 'إدارة حالات الطلاب', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>إدارة حالات الطلاب</Text>
          <Text style={styles.headerSubtitle}>
            تخرّج • إعادة • فصل • تجميد • نقل لمستوى
          </Text>
        </View>

        {/* بطاقات الإحصائيات */}
        <View style={styles.statsRow}>
          {STATUS_OPTIONS.map(o => (
            <View key={o.value} style={[styles.statCard, { backgroundColor: o.bg }]}>
              <Text style={[styles.statNum, { color: o.color }]}>{stats[o.value] || 0}</Text>
              <Text style={styles.statLabel}>{o.label}</Text>
            </View>
          ))}
        </View>

        {/* الفلاتر */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar}>
          <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 6 }}>
            <FilterChip label="كل الكليات" active={!filterFaculty} onPress={() => { setFilterFaculty(''); setFilterDept(''); }} />
            {faculties.map((f: any) => (
              <FilterChip
                key={f.id || f._id}
                label={f.name}
                active={filterFaculty === (f.id || f._id)}
                onPress={() => { setFilterFaculty(f.id || f._id); setFilterDept(''); }}
              />
            ))}
          </View>
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar}>
          <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 6 }}>
            <FilterChip label="كل الأقسام" active={!filterDept} onPress={() => setFilterDept('')} />
            {deptFiltered.map((d: any) => (
              <FilterChip
                key={d.id || d._id}
                label={d.name}
                active={filterDept === (d.id || d._id)}
                onPress={() => setFilterDept(d.id || d._id)}
              />
            ))}
          </View>
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar}>
          <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 6, alignItems: 'center' }}>
            <Text style={styles.miniLabel}>المستوى:</Text>
            <FilterChip label="الكل" active={!filterLevel} onPress={() => setFilterLevel('')} />
            {[1,2,3,4,5,6].map(lvl => (
              <FilterChip key={lvl} label={`م${lvl}`} active={filterLevel === String(lvl)}
                onPress={() => setFilterLevel(filterLevel === String(lvl) ? '' : String(lvl))} />
            ))}
            <Text style={[styles.miniLabel, { marginRight: 10 }]}>الحالة:</Text>
            <FilterChip label="الكل" active={!filterStatus} onPress={() => setFilterStatus('')} />
            {STATUS_OPTIONS.map(o => (
              <FilterChip key={o.value} label={o.label} active={filterStatus === o.value}
                onPress={() => setFilterStatus(filterStatus === o.value ? '' : o.value)}
                color={o.color} />
            ))}
          </View>
        </ScrollView>

        {/* البحث + التحديد الجماعي */}
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="ابحث بالاسم أو رقم الطالب..."
            value={search}
            onChangeText={setSearch}
            testID="search-input"
          />
          <TouchableOpacity style={styles.selectAllBtn} onPress={selectAllVisible} testID="select-all">
            <Text style={styles.selectAllText}>تحديد كل المعروض ({filtered.length})</Text>
          </TouchableOpacity>
        </View>

        {/* قائمة الطلاب */}
        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color="#5e35b1" /></View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 8, paddingBottom: selected.size > 0 ? 100 : 20 }}>
            <Text style={styles.resultCount}>
              عرض {filtered.length} من {students.length} طالب
            </Text>
            {filtered.map((s: any) => {
              const sid = s.id || s._id;
              const isSel = selected.has(sid);
              const sStatus = s.status || (s.is_active === false ? 'inactive' : 'active');
              const si = getStatusInfo(sStatus);
              return (
                <TouchableOpacity
                  key={sid}
                  style={[styles.studentRow, isSel && styles.studentRowSelected]}
                  onPress={() => toggleSelect(sid)}
                  testID={`student-${sid}`}
                >
                  <View style={[styles.checkbox, isSel && styles.checkboxOn]}>
                    {isSel && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.studentName} numberOfLines={1}>{s.full_name}</Text>
                    <Text style={styles.studentMeta} numberOfLines={1}>
                      {s.student_id} • م{s.level || '?'} {s.section ? `• شعبة ${s.section}` : ''} {s.reference_number ? `• ${s.reference_number}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: si.bg }]}>
                    <Ionicons name={si.icon as any} size={12} color={si.color} />
                    <Text style={[styles.statusBadgeText, { color: si.color }]}>{si.label}</Text>
                  </View>
                  <TouchableOpacity onPress={(e) => { e.stopPropagation(); viewHistory(s); }} testID={`hist-${sid}`}>
                    <Ionicons name="time" size={18} color="#888" />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
            {filtered.length === 0 && (
              <Text style={styles.empty}>لا يوجد طلاب بهذه الفلاتر</Text>
            )}
          </ScrollView>
        )}

        {/* شريط الإجراءات السفلي */}
        {selected.size > 0 && (
          <View style={styles.bottomBar}>
            <TouchableOpacity style={styles.clearBtn} onPress={clearSelection}>
              <Ionicons name="close" size={16} color="#666" />
              <Text style={styles.clearBtnText}>إلغاء ({selected.size})</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actBtn} onPress={() => setShowAction(true)} testID="open-action">
              <Ionicons name="construct" size={16} color="#fff" />
              <Text style={styles.actBtnText}>تغيير حالة {selected.size} طالب</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Modal الإجراء */}
        <Modal visible={showAction} transparent animationType="fade" onRequestClose={() => setShowAction(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>تغيير حالة {selected.size} طالب</Text>

              <Text style={styles.label}>اختر الحالة الجديدة:</Text>
              <View style={styles.statusOptions}>
                {STATUS_OPTIONS.map(o => (
                  <TouchableOpacity
                    key={o.value}
                    style={[
                      styles.statusOption,
                      actionStatus === o.value && { backgroundColor: o.color, borderColor: o.color },
                    ]}
                    onPress={() => setActionStatus(o.value)}
                    testID={`opt-${o.value}`}
                  >
                    <Ionicons name={o.icon as any} size={16} color={actionStatus === o.value ? '#fff' : o.color} />
                    <Text style={[styles.statusOptionText, actionStatus === o.value && { color: '#fff' }]}>
                      {o.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>المستوى الجديد (اختياري):</Text>
              <TextInput
                style={styles.input}
                placeholder="مثال: 2 (اتركه فارغاً للإبقاء على المستوى الحالي)"
                keyboardType="numeric"
                value={actionLevel}
                onChangeText={setActionLevel}
                testID="action-level"
              />
              {actionStatus === 'repeat' && (
                <Text style={styles.helpText}>
                  💡 الإعادة: اتركه فارغاً ليبقى في مستواه، أو اكتب رقم للنزول لمستوى أقل
                </Text>
              )}

              <Text style={styles.label}>السبب / ملاحظة (اختياري):</Text>
              <TextInput
                style={[styles.input, { minHeight: 60 }]}
                placeholder="مثال: رسوب في 3 مقررات"
                value={actionReason}
                onChangeText={setActionReason}
                multiline
                testID="action-reason"
              />

              <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#e0e0e0' }]}
                  onPress={() => setShowAction(false)}
                >
                  <Text style={[styles.modalBtnText, { color: '#555' }]}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: getStatusInfo(actionStatus).color }]}
                  onPress={applyBulk}
                  disabled={applying}
                  testID="apply-bulk"
                >
                  {applying ? <ActivityIndicator size="small" color="#fff" /> : (
                    <Text style={styles.modalBtnText}>تطبيق</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Modal التاريخ */}
        <Modal visible={showHistory} transparent animationType="fade" onRequestClose={() => setShowHistory(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>سجل حالات: {historyFor?.full_name}</Text>
              {historyData.length === 0 ? (
                <Text style={styles.empty}>لا يوجد تاريخ تغيير حالة لهذا الطالب</Text>
              ) : (
                <ScrollView style={{ maxHeight: 350 }}>
                  {historyData.map((h: any, i: number) => {
                    const o = getStatusInfo(h.old_status);
                    const n = getStatusInfo(h.new_status);
                    return (
                      <View key={i} style={styles.historyItem}>
                        <View style={styles.historyRow}>
                          <View style={[styles.statusBadge, { backgroundColor: o.bg }]}>
                            <Text style={[styles.statusBadgeText, { color: o.color }]}>{o.label}</Text>
                          </View>
                          <Ionicons name="arrow-back" size={14} color="#888" />
                          <View style={[styles.statusBadge, { backgroundColor: n.bg }]}>
                            <Text style={[styles.statusBadgeText, { color: n.color }]}>{n.label}</Text>
                          </View>
                          {h.old_level !== h.new_level && (
                            <Text style={styles.histLevel}>م{h.old_level} → م{h.new_level}</Text>
                          )}
                        </View>
                        {h.reason ? <Text style={styles.histReason}>📝 {h.reason}</Text> : null}
                        <Text style={styles.histDate}>
                          {h.changed_by_username || '?'} • {new Date(h.created_at || h.effective_date).toLocaleString('ar')}
                        </Text>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#e0e0e0', marginTop: 10 }]}
                onPress={() => setShowHistory(false)}
              >
                <Text style={[styles.modalBtnText, { color: '#555' }]}>إغلاق</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </>
  );
}

const FilterChip = ({ label, active, onPress, color }: any) => (
  <TouchableOpacity
    style={[styles.chip, active && { backgroundColor: color || '#5e35b1' }]}
    onPress={onPress}
  >
    <Text style={[styles.chipText, active && { color: '#fff' }]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f7' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  header: { backgroundColor: '#5e35b1', paddingTop: 18, paddingBottom: 14, paddingHorizontal: 16 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff', textAlign: 'right' },
  headerSubtitle: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 3, textAlign: 'right' },
  statsRow: { flexDirection: 'row', backgroundColor: '#fff', padding: 8, gap: 6 },
  statCard: { flex: 1, padding: 8, borderRadius: 8, alignItems: 'center' },
  statNum: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 10, color: '#555', marginTop: 2 },
  filterBar: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee', maxHeight: 40 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: '#f0f0f0' },
  chipText: { fontSize: 11, fontWeight: '600', color: '#555' },
  miniLabel: { fontSize: 11, color: '#888', fontWeight: '700', paddingHorizontal: 4 },
  searchRow: { flexDirection: 'row', padding: 8, gap: 6, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee' },
  searchInput: {
    flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7, fontSize: 12, textAlign: 'right',
    outlineWidth: 0 as any,
  },
  selectAllBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: '#ede7f6', justifyContent: 'center' },
  selectAllText: { color: '#5e35b1', fontSize: 11, fontWeight: '700' },
  resultCount: { fontSize: 11, color: '#888', marginBottom: 6, textAlign: 'right' },
  studentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', padding: 8, borderRadius: 8, marginBottom: 4,
  },
  studentRowSelected: { backgroundColor: '#ede7f6', borderWidth: 1, borderColor: '#5e35b1' },
  checkbox: {
    width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: '#bbb',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: '#5e35b1', borderColor: '#5e35b1' },
  studentName: { fontSize: 13, fontWeight: '700', color: '#222', textAlign: 'right' },
  studentMeta: { fontSize: 10, color: '#888', marginTop: 2, textAlign: 'right' },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10,
  },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
  empty: { textAlign: 'center', color: '#aaa', padding: 30, fontSize: 12 },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', gap: 8, padding: 10, backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#ddd',
  },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, backgroundColor: '#f0f0f0' },
  clearBtnText: { color: '#666', fontSize: 11, fontWeight: '700' },
  actBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, borderRadius: 8, backgroundColor: '#5e35b1',
  },
  actBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 16,
  },
  modal: { backgroundColor: '#fff', borderRadius: 12, padding: 18, width: '100%', maxWidth: 500 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#222', marginBottom: 10, textAlign: 'right' },
  label: { fontSize: 12, color: '#555', fontWeight: '700', marginBottom: 6, marginTop: 8, textAlign: 'right' },
  statusOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statusOption: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1.5, borderColor: '#e0e0e0', backgroundColor: '#fafafa',
  },
  statusOptionText: { fontSize: 12, fontWeight: '700', color: '#444' },
  input: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 12,
    textAlign: 'right', outlineWidth: 0 as any,
  },
  helpText: { fontSize: 10, color: '#5e35b1', marginTop: 4, textAlign: 'right' },
  modalBtn: { flex: 1, paddingVertical: 11, borderRadius: 8, alignItems: 'center' },
  modalBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  historyItem: {
    backgroundColor: '#fafafa', padding: 8, borderRadius: 6, marginBottom: 6,
    borderRightWidth: 3, borderRightColor: '#5e35b1',
  },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  histLevel: { fontSize: 11, color: '#666', fontWeight: '700' },
  histReason: { fontSize: 11, color: '#555', marginTop: 4, textAlign: 'right' },
  histDate: { fontSize: 9, color: '#999', marginTop: 4, textAlign: 'right' },
});

/**
 * صفحة الخريجين - إدارة شاملة
 * - فلاتر: السنة + الكلية + القسم + البحث
 * - تحرير بيانات التخرج (المعدل، التقدير، الشهادة، الفصل، الملاحظات)
 * - تصدير Excel + PDF
 * - استرجاع لقائمة الطلاب (حالات نادرة)
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Platform, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, Stack } from 'expo-router';
import { alumniAPI, facultiesAPI, departmentsAPI } from '../src/services/api';
import { useAuth, PERMISSIONS } from '../src/contexts/AuthContext';

interface AlumniRow {
  id: string;
  student_id: string;
  reference_number?: string;
  full_name: string;
  phone?: string;
  email?: string;
  department_id?: string;
  department_name?: string;
  faculty_id?: string;
  faculty_name?: string;
  level_graduated?: number;
  graduation_year?: number;
  graduation_date?: string;
  graduation_semester?: string;
  final_gpa?: number;
  total_credit_hours?: number;
  certificate_number?: string;
  honors?: string;
  notes?: string;
}

const SEM_LABEL: Record<string, string> = { first: 'الأول', second: 'الثاني', summer: 'الصيفي' };

export default function AlumniScreen() {
  const router = useRouter();
  const { hasAnyPermission, isLoading: authLoading, isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<AlumniRow[]>([]);
  const [byYear, setByYear] = useState<Record<string, number>>({});
  const [faculties, setFaculties] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [facultyFilter, setFacultyFilter] = useState<string>('');
  const [deptFilter, setDeptFilter] = useState<string>('');
  const [searchQ, setSearchQ] = useState('');
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);

  // Edit modal
  const [editing, setEditing] = useState<AlumniRow | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState<any>({});

  const canView = isAdmin || hasAnyPermission([PERMISSIONS.VIEW_STUDENTS, PERMISSIONS.MANAGE_STUDENTS]);
  const canManage = isAdmin || hasAnyPermission([PERMISSIONS.MANAGE_STUDENTS]);

  useEffect(() => {
    if (!authLoading && !canView) router.replace('/no-permission?from=/alumni' as any);
  }, [authLoading, canView, router]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (yearFilter) params.year = yearFilter;
      if (facultyFilter) params.faculty_id = facultyFilter;
      if (deptFilter) params.department_id = deptFilter;
      if (searchQ.trim()) params.q = searchQ.trim();
      const r = await alumniAPI.getAll(params);
      setItems(r.data.items || []);
      setByYear(r.data.by_year || {});
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'فشل تحميل قائمة الخريجين';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('خطأ', msg);
    } finally {
      setLoading(false);
    }
  }, [yearFilter, facultyFilter, deptFilter, searchQ]);

  useEffect(() => {
    if (!canView) return;
    Promise.allSettled([
      facultiesAPI.getAll(),
      departmentsAPI.getAll(),
    ]).then(([fRes, dRes]: any[]) => {
      setFaculties(fRes.status === 'fulfilled' ? (fRes.value.data || []) : []);
      setDepartments(dRes.status === 'fulfilled' ? (dRes.value.data || []) : []);
    });
  }, [canView]);

  useEffect(() => {
    if (!canView) return;
    const t = setTimeout(fetchData, 250);
    return () => clearTimeout(t);
  }, [fetchData, canView]);

  const availableYears = useMemo(
    () => Object.keys(byYear).map(Number).sort((a, b) => b - a),
    [byYear]
  );

  const filteredDepts = useMemo(() => {
    if (!facultyFilter) return departments;
    return departments.filter((d: any) => String(d.faculty_id || '') === facultyFilter);
  }, [departments, facultyFilter]);

  const handleRestore = async (a: AlumniRow) => {
    const ok = Platform.OS === 'web'
      ? window.confirm(`استرجاع "${a.full_name}" إلى قائمة الطلاب؟\n(ستُحذف بيانات التخرج)`)
      : await new Promise<boolean>((resolve) => Alert.alert(
        'استرجاع خريج', `استرجاع ${a.full_name}؟`,
        [{ text: 'إلغاء', onPress: () => resolve(false) }, { text: 'استرجاع', onPress: () => resolve(true), style: 'destructive' }]
      ));
    if (!ok) return;
    setRestoringId(a.id);
    try {
      const r = await alumniAPI.restore(a.id);
      if (Platform.OS === 'web') window.alert(r.data.message);
      else Alert.alert('تم', r.data.message);
      fetchData();
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'فشل الاسترجاع';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('خطأ', msg);
    } finally {
      setRestoringId(null);
    }
  };

  const openEdit = (a: AlumniRow) => {
    setEditing(a);
    setEditForm({
      graduation_year: a.graduation_year != null ? String(a.graduation_year) : '',
      graduation_semester: a.graduation_semester || '',
      graduation_date: a.graduation_date || '',
      final_gpa: a.final_gpa != null ? String(a.final_gpa) : '',
      total_credit_hours: a.total_credit_hours != null ? String(a.total_credit_hours) : '',
      certificate_number: a.certificate_number || '',
      honors: a.honors || '',
      notes: a.notes || '',
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSavingEdit(true);
    try {
      const payload: any = {};
      if (editForm.graduation_year !== '') payload.graduation_year = parseInt(editForm.graduation_year, 10);
      if (editForm.graduation_semester) payload.graduation_semester = editForm.graduation_semester;
      if (editForm.graduation_date) payload.graduation_date = editForm.graduation_date;
      if (editForm.final_gpa !== '') payload.final_gpa = parseFloat(editForm.final_gpa);
      if (editForm.total_credit_hours !== '') payload.total_credit_hours = parseInt(editForm.total_credit_hours, 10);
      if (editForm.certificate_number !== '') payload.certificate_number = editForm.certificate_number;
      if (editForm.honors !== '') payload.honors = editForm.honors;
      if (editForm.notes !== '') payload.notes = editForm.notes;
      await alumniAPI.update(editing.id, payload);
      if (Platform.OS === 'web') window.alert('تم حفظ التعديلات بنجاح');
      else Alert.alert('تم', 'تم حفظ التعديلات بنجاح');
      setEditing(null);
      fetchData();
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'فشل الحفظ';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('خطأ', msg);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleExport = async (kind: 'excel' | 'pdf') => {
    setExporting(kind);
    try {
      const params: any = {};
      if (yearFilter) params.year = yearFilter;
      if (facultyFilter) params.faculty_id = facultyFilter;
      if (deptFilter) params.department_id = deptFilter;
      if (searchQ.trim()) params.q = searchQ.trim();
      const fn = kind === 'excel' ? alumniAPI.exportExcel : alumniAPI.exportPDF;
      const res = await fn(params);
      const blob = new Blob([res.data], { type: kind === 'excel'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = kind === 'excel' ? `alumni-${Date.now()}.xlsx` : `alumni-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'فشل التصدير';
      if (Platform.OS === 'web') window.alert(msg);
    } finally {
      setExporting(null);
    }
  };

  const resetFilters = () => {
    setYearFilter(null);
    setFacultyFilter('');
    setDeptFilter('');
    setSearchQ('');
  };

  if (authLoading || !canView) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#1565c0" style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  const hasActiveFilter = !!yearFilter || !!facultyFilter || !!deptFilter || !!searchQ.trim();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: 'الخريجون', headerShown: false }} />

      {/* Header */}
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} data-testid="alumni-back-btn">
          <Ionicons name="arrow-forward" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>الخريجون</Text>
          <Text style={styles.headerSubtitle}>قائمة الطلاب المتخرجين</Text>
        </View>
        {/* Export buttons */}
        <TouchableOpacity
          onPress={() => handleExport('excel')}
          disabled={exporting !== null}
          style={[styles.exportBtn, { backgroundColor: '#1b5e20' }]}
          data-testid="alumni-export-excel"
        >
          {exporting === 'excel' ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="document" size={15} color="#fff" />}
          <Text style={styles.exportBtnText}>Excel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handleExport('pdf')}
          disabled={exporting !== null}
          style={[styles.exportBtn, { backgroundColor: '#b71c1c' }]}
          data-testid="alumni-export-pdf"
        >
          {exporting === 'pdf' ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="document-text" size={15} color="#fff" />}
          <Text style={styles.exportBtnText}>PDF</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* رأس مختصر */}
        <View style={styles.heroCard}>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
            <Ionicons name="school" size={28} color="#0d47a1" />
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>الخريجون</Text>
              <Text style={styles.heroSub}>إجمالي: {items.length} خريج · {availableYears.length} سنة تخرج</Text>
            </View>
          </View>
        </View>

        {/* رقائق السنوات */}
        {availableYears.length > 0 && (
          <View style={styles.statsRow}>
            {availableYears.map(y => (
              <TouchableOpacity
                key={y}
                onPress={() => setYearFilter(yearFilter === y ? null : y)}
                style={[styles.yearChip, yearFilter === y && styles.yearChipActive]}
                data-testid={`year-chip-${y}`}
              >
                <Text style={[styles.yearChipText, yearFilter === y && styles.yearChipTextActive]}>{y}</Text>
                <Text style={[styles.yearChipCount, yearFilter === y && styles.yearChipCountActive]}>{byYear[String(y)]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* الفلاتر */}
        <View style={styles.filterCard}>
          <View style={styles.filterRow}>
            <View style={{ flex: 1, minWidth: 200 }}>
              <Text style={styles.filterLabel}>بحث</Text>
              <TextInput
                style={styles.input}
                placeholder="اسم أو رقم القيد"
                placeholderTextColor="#a8b1c2"
                value={searchQ}
                onChangeText={setSearchQ}
                data-testid="alumni-search-input"
              />
            </View>
            <View style={{ flex: 1.2, minWidth: 200 }}>
              <Text style={styles.filterLabel}>الكلية</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                <TouchableOpacity
                  onPress={() => { setFacultyFilter(''); setDeptFilter(''); }}
                  style={[styles.chip, !facultyFilter && styles.chipActive]}
                >
                  <Text style={[styles.chipText, !facultyFilter && styles.chipTextActive]}>الكل</Text>
                </TouchableOpacity>
                {faculties.map((f: any) => (
                  <TouchableOpacity
                    key={f.id}
                    onPress={() => { setFacultyFilter(f.id); setDeptFilter(''); }}
                    style={[styles.chip, facultyFilter === f.id && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, facultyFilter === f.id && styles.chipTextActive]} numberOfLines={1}>{f.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={{ flex: 1.2, minWidth: 200 }}>
              <Text style={styles.filterLabel}>القسم</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                <TouchableOpacity
                  onPress={() => setDeptFilter('')}
                  style={[styles.chip, !deptFilter && styles.chipActive]}
                >
                  <Text style={[styles.chipText, !deptFilter && styles.chipTextActive]}>الكل</Text>
                </TouchableOpacity>
                {filteredDepts.map((d: any) => (
                  <TouchableOpacity
                    key={d.id}
                    onPress={() => setDeptFilter(d.id)}
                    style={[styles.chip, deptFilter === d.id && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, deptFilter === d.id && styles.chipTextActive]} numberOfLines={1}>{d.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            {hasActiveFilter && (
              <TouchableOpacity onPress={resetFilters} style={styles.resetFilterBtn} data-testid="reset-filters-btn">
                <Ionicons name="refresh" size={14} color="#c62828" />
                <Text style={{ fontSize: 12, color: '#c62828', fontWeight: '700' }}>إعادة تعيين</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* الجدول */}
        {loading ? (
          <ActivityIndicator size="large" color="#1565c0" style={{ marginTop: 40 }} />
        ) : items.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="school-outline" size={42} color="#cfd6e1" />
            <Text style={styles.emptyText}>لا يوجد خريجون مطابقون</Text>
            <Text style={styles.emptyHint}>عدّل الفلاتر أو خرّج طلاباً جدد من صفحة الطلاب</Text>
          </View>
        ) : (
          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={styles.thIdx}>#</Text>
              <Text style={[styles.thName, { flex: 2 }]}>الاسم</Text>
              <Text style={styles.th}>رقم القيد</Text>
              <Text style={styles.th}>القسم</Text>
              <Text style={styles.th}>الكلية</Text>
              <Text style={styles.th}>سنة</Text>
              <Text style={styles.th}>الفصل</Text>
              <Text style={styles.th}>المعدل</Text>
              <Text style={styles.th}>الشهادة</Text>
              <Text style={styles.th}>التقدير</Text>
              {canManage && <Text style={[styles.th, { width: 110, flex: 0 }]}>إجراءات</Text>}
            </View>
            {items.map((a, idx) => (
              <View key={a.id} style={[styles.tableRow, idx % 2 === 0 && { backgroundColor: '#fafbfc' }]}>
                <Text style={styles.tdIdx}>{idx + 1}</Text>
                <Text style={[styles.tdName, { flex: 2 }]} numberOfLines={1}>{a.full_name}</Text>
                <Text style={styles.td}>{a.student_id}</Text>
                <Text style={styles.td} numberOfLines={1}>{a.department_name || '-'}</Text>
                <Text style={styles.td} numberOfLines={1}>{a.faculty_name || '-'}</Text>
                <View style={[styles.td, { alignItems: 'flex-end' }]}>
                  <View style={styles.yearBadge}>
                    <Text style={styles.yearBadgeText}>{a.graduation_year || '-'}</Text>
                  </View>
                </View>
                <Text style={styles.td}>{SEM_LABEL[a.graduation_semester || ''] || '-'}</Text>
                <Text style={[styles.td, { fontWeight: '700', color: '#1565c0' }]}>{a.final_gpa != null ? a.final_gpa.toFixed(2) : '-'}</Text>
                <Text style={styles.td} numberOfLines={1}>{a.certificate_number || '-'}</Text>
                <Text style={styles.td} numberOfLines={1}>{a.honors || '-'}</Text>
                {canManage && (
                  <View style={[styles.tdActions, { width: 110, flex: 0 }]}>
                    <TouchableOpacity
                      onPress={() => openEdit(a)}
                      style={styles.editBtn}
                      data-testid={`edit-alumni-${a.id}`}
                    >
                      <Ionicons name="create-outline" size={14} color="#1565c0" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleRestore(a)}
                      disabled={restoringId === a.id}
                      style={styles.restoreBtn}
                      data-testid={`restore-${a.id}`}
                    >
                      {restoringId === a.id
                        ? <ActivityIndicator size="small" color="#ef6c00" />
                        : <Ionicons name="arrow-undo" size={14} color="#ef6c00" />}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ============ مودال التحرير ============ */}
      <Modal
        visible={editing !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setEditing(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                <Ionicons name="create" size={20} color="#1565c0" />
                <Text style={styles.modalTitle}>تحرير بيانات التخرج</Text>
              </View>
              <TouchableOpacity onPress={() => setEditing(null)} data-testid="close-edit-modal" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color="#5b6678" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ paddingHorizontal: 18, paddingVertical: 14, gap: 12 }}
            >
              {editing && (
                <View style={styles.editStudentInfo}>
                  <Text style={styles.editStudentName}>{editing.full_name}</Text>
                  <Text style={styles.editStudentMeta}>رقم القيد: {editing.student_id} · {editing.department_name || '-'}</Text>
                </View>
              )}

              <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>سنة التخرج</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={editForm.graduation_year}
                    onChangeText={(v) => setEditForm((p: any) => ({ ...p, graduation_year: v.replace(/[^0-9]/g, '').slice(0, 4) }))}
                    keyboardType="numeric"
                    placeholder="2025"
                    placeholderTextColor="#a8b1c2"
                    data-testid="edit-year"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>المعدل (0 - 4)</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={editForm.final_gpa}
                    onChangeText={(v) => setEditForm((p: any) => ({ ...p, final_gpa: v }))}
                    keyboardType="decimal-pad"
                    placeholder="3.85"
                    placeholderTextColor="#a8b1c2"
                    data-testid="edit-gpa"
                  />
                </View>
              </View>

              <View>
                <Text style={styles.fieldLabel}>الفصل</Text>
                <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                  {[
                    { v: 'first', label: 'الأول' },
                    { v: 'second', label: 'الثاني' },
                    { v: 'summer', label: 'الصيفي' },
                  ].map(s => {
                    const active = editForm.graduation_semester === s.v;
                    return (
                      <TouchableOpacity
                        key={s.v}
                        onPress={() => setEditForm((p: any) => ({ ...p, graduation_semester: active ? '' : s.v }))}
                        style={[styles.segBtn, active && styles.segBtnActive]}
                      >
                        <Text style={[styles.segBtnText, active && styles.segBtnTextActive]}>{s.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>تاريخ التخرج</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={editForm.graduation_date}
                    onChangeText={(v) => setEditForm((p: any) => ({ ...p, graduation_date: v }))}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#a8b1c2"
                    data-testid="edit-date"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>الساعات المعتمدة</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={editForm.total_credit_hours}
                    onChangeText={(v) => setEditForm((p: any) => ({ ...p, total_credit_hours: v.replace(/[^0-9]/g, '') }))}
                    keyboardType="numeric"
                    placeholder="132"
                    placeholderTextColor="#a8b1c2"
                    data-testid="edit-hours"
                  />
                </View>
              </View>

              <View>
                <Text style={styles.fieldLabel}>رقم الشهادة</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={editForm.certificate_number}
                  onChangeText={(v) => setEditForm((p: any) => ({ ...p, certificate_number: v }))}
                  placeholder="AHG-2025-0001"
                  placeholderTextColor="#a8b1c2"
                  data-testid="edit-cert"
                />
              </View>

              <View>
                <Text style={styles.fieldLabel}>التقدير</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={editForm.honors}
                  onChangeText={(v) => setEditForm((p: any) => ({ ...p, honors: v }))}
                  placeholder="ممتاز / جيد جداً / مع مرتبة الشرف"
                  placeholderTextColor="#a8b1c2"
                  data-testid="edit-honors"
                />
              </View>

              <View>
                <Text style={styles.fieldLabel}>ملاحظات</Text>
                <TextInput
                  style={[styles.fieldInput, { minHeight: 70, textAlignVertical: 'top', paddingTop: 10 }]}
                  value={editForm.notes}
                  onChangeText={(v) => setEditForm((p: any) => ({ ...p, notes: v }))}
                  multiline
                  numberOfLines={3}
                  placeholder="ملاحظات إضافية..."
                  placeholderTextColor="#a8b1c2"
                  data-testid="edit-notes"
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setEditing(null)}
                disabled={savingEdit}
              >
                <Text style={styles.modalCancelBtnText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, savingEdit && { opacity: 0.6 }]}
                onPress={saveEdit}
                disabled={savingEdit}
                data-testid="save-edit-btn"
              >
                {savingEdit
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="checkmark" size={16} color="#fff" />}
                <Text style={styles.modalConfirmBtnText}>{savingEdit ? 'جاري الحفظ...' : 'حفظ التعديلات'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  headerBar: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 8,
    backgroundColor: '#0d47a1', paddingHorizontal: 14, paddingVertical: 10,
  },
  backBtn: { padding: 6 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff', textAlign: 'right' },
  headerSubtitle: { fontSize: 11, color: '#cfd8dc', textAlign: 'right', marginTop: 2 },
  exportBtn: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
  },
  exportBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  heroCard: {
    backgroundColor: '#fff', padding: 14, borderRadius: 10,
    borderWidth: 1, borderColor: '#e0e7ee', marginBottom: 12,
  },
  heroTitle: { fontSize: 18, fontWeight: '700', color: '#0d47a1', textAlign: 'right' },
  heroSub: { fontSize: 12, color: '#5a6c7d', textAlign: 'right', marginTop: 2 },
  statsRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  yearChip: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 18,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e0e7ee',
  },
  yearChipActive: { backgroundColor: '#0d47a1', borderColor: '#0d47a1' },
  yearChipText: { fontSize: 13, fontWeight: '700', color: '#0d47a1' },
  yearChipTextActive: { color: '#fff' },
  yearChipCount: { fontSize: 11, color: '#5a6c7d', backgroundColor: '#f0f3f7', paddingHorizontal: 6, borderRadius: 8 },
  yearChipCountActive: { color: '#0d47a1', backgroundColor: '#fff' },
  filterCard: {
    backgroundColor: '#fff', padding: 12, borderRadius: 10,
    borderWidth: 1, borderColor: '#e0e7ee', marginBottom: 12,
  },
  filterRow: { flexDirection: 'row-reverse', gap: 12, flexWrap: 'wrap' },
  filterLabel: { fontSize: 12, color: '#5a6c7d', fontWeight: '600', textAlign: 'right', marginBottom: 4 },
  input: {
    backgroundColor: '#f5f7fa', borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 13,
    color: '#1a2540', textAlign: 'right', borderWidth: 1, borderColor: '#e0e7ee',
  },
  chip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6, backgroundColor: '#f5f7fa', borderWidth: 1, borderColor: '#e0e7ee' },
  chipActive: { backgroundColor: '#1565c0', borderColor: '#1565c0' },
  chipText: { fontSize: 12, color: '#333', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  resetFilterBtn: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6,
    backgroundColor: '#ffebee', borderWidth: 1, borderColor: '#ffcdd2',
    alignSelf: 'flex-end',
  },
  emptyBox: {
    backgroundColor: '#fff', padding: 40, borderRadius: 10, alignItems: 'center',
    gap: 8, borderWidth: 1, borderColor: '#e0e7ee',
  },
  emptyText: { fontSize: 14, color: '#5a6c7d', fontWeight: '600' },
  emptyHint: { fontSize: 11, color: '#90a4ae' },
  tableCard: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e0e7ee', overflow: 'hidden' },
  tableHeader: { flexDirection: 'row-reverse', backgroundColor: '#e3f2fd', padding: 10, gap: 6 },
  th: { flex: 1, fontSize: 11, fontWeight: '700', color: '#0d47a1', textAlign: 'right' },
  thIdx: { width: 32, fontSize: 11, fontWeight: '700', color: '#0d47a1', textAlign: 'right' },
  thName: { fontSize: 11, fontWeight: '700', color: '#0d47a1', textAlign: 'right' },
  tableRow: { flexDirection: 'row-reverse', padding: 10, gap: 6, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f0f3f7' },
  td: { flex: 1, fontSize: 12, color: '#333', textAlign: 'right' },
  tdIdx: { width: 32, fontSize: 11, color: '#90a4ae', fontWeight: '700', textAlign: 'right' },
  tdName: { fontSize: 13, fontWeight: '600', color: '#0d47a1', textAlign: 'right' },
  yearBadge: { backgroundColor: '#fff3e0', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, borderWidth: 1, borderColor: '#ef6c00' },
  yearBadgeText: { fontSize: 11, fontWeight: '700', color: '#ef6c00' },
  tdActions: { flexDirection: 'row-reverse', gap: 6, justifyContent: 'flex-end' },
  editBtn: { padding: 6, borderRadius: 6, backgroundColor: '#e3f2fd', borderWidth: 1, borderColor: '#bbdefb' },
  restoreBtn: { padding: 6, borderRadius: 6, backgroundColor: '#fff3e0', borderWidth: 1, borderColor: '#ffe0b2' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalContent: { backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '90%', overflow: 'hidden' },
  modalHeader: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e7ebf1',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#1a2540' },
  editStudentInfo: {
    backgroundColor: '#e3f2fd', padding: 10, borderRadius: 8,
    borderRightWidth: 3, borderRightColor: '#1565c0',
  },
  editStudentName: { fontSize: 14, fontWeight: '700', color: '#0d47a1', textAlign: 'right' },
  editStudentMeta: { fontSize: 11, color: '#5b6678', textAlign: 'right', marginTop: 3 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#1a2540', marginBottom: 5, textAlign: 'right' },
  fieldInput: {
    backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#1a2540', textAlign: 'right',
    borderWidth: 1, borderColor: '#d6dde6',
  },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1.5, borderColor: '#d6dde6', backgroundColor: '#fff', alignItems: 'center' },
  segBtnActive: { borderColor: '#0d47a1', backgroundColor: '#0d47a1' },
  segBtnText: { color: '#5b6678', fontSize: 12.5, fontWeight: '700' },
  segBtnTextActive: { color: '#fff' },
  modalFooter: {
    flexDirection: 'row-reverse', gap: 10, paddingHorizontal: 18, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: '#e7ebf1', backgroundColor: '#fafbfd',
  },
  modalConfirmBtn: {
    flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 8, backgroundColor: '#1565c0',
  },
  modalConfirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  modalCancelBtn: {
    paddingVertical: 12, paddingHorizontal: 22, borderRadius: 8,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#d6dde6',
  },
  modalCancelBtnText: { color: '#5b6678', fontWeight: '700', fontSize: 14 },
});

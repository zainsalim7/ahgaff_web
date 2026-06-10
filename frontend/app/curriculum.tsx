/**
 * صفحة الخطة الدراسية - إدارة المقررات الثابتة للقسم منظمة في شبكة (مستوى × فصل)
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Platform, Modal, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import api from '../src/services/api';

export default function CurriculumScreen() {
  const params = useLocalSearchParams<{ departmentId?: string }>();
  const router = useRouter();
  const [departments, setDepartments] = useState<any[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>(params.departmentId || '');
  const [grid, setGrid] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<any>({
    code: '', name: '', credit_hours: 3, weekly_hours: '', level: 1, term: 1,
  });
  const [generating, setGenerating] = useState(false);
  // ⭐ خريطة عدد الشعب لكل مقرر (curriculum_course_id → عدد)
  const [sectionsMap, setSectionsMap] = useState<Record<string, string>>({});
  const [activeSemester, setActiveSemester] = useState<any>(null);
  const [archives, setArchives] = useState<any[]>([]);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [d, s, a] = await Promise.all([
          api.get('/departments'),
          api.get('/semesters?status=active').catch(() => ({ data: [] })),
          api.get('/archives').catch(() => ({ data: { items: [] } })),
        ]);
        const deptItems = d.data?.items || d.data || [];
        setDepartments(deptItems);
        const sems = s.data?.items || s.data || [];
        const active = (Array.isArray(sems) ? sems : []).find((x: any) => x.status === 'active') || sems[0];
        setActiveSemester(active);
        setArchives(a.data?.items || []);
        if (!params.departmentId && deptItems.length > 0) {
          setSelectedDept(deptItems[0].id || deptItems[0]._id);
        }
      } catch (e) {
        // ignore
      }
    })();
  }, [params.departmentId]);

  const fetchGrid = useCallback(async () => {
    if (!selectedDept) return;
    setLoading(true);
    try {
      const res = await api.get(`/curriculum/by-department/${selectedDept}`);
      setGrid(res.data);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'فشل التحميل';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('خطأ', msg);
    } finally {
      setLoading(false);
    }
  }, [selectedDept]);

  useEffect(() => { fetchGrid(); }, [fetchGrid]);

  const submitAdd = async () => {
    if (!addForm.code || !addForm.name || !selectedDept) {
      if (Platform.OS === 'web') window.alert('الكود والاسم مطلوبان');
      return;
    }
    const dept = departments.find((d: any) => (d.id || d._id) === selectedDept);
    try {
      // معالجة weekly_hours: لو فارغة → null؛ غير ذلك → رقم
      const wh = addForm.weekly_hours === '' || addForm.weekly_hours == null
        ? null
        : (Number(addForm.weekly_hours) || null);
      await api.post('/curriculum/courses', {
        ...addForm,
        weekly_hours: wh,
        department_id: selectedDept,
        faculty_id: dept?.faculty_id,
      });
      setShowAdd(false);
      setAddForm({ code: '', name: '', credit_hours: 3, weekly_hours: '', level: 1, term: 1 });
      fetchGrid();
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'فشل الإضافة';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('خطأ', msg);
    }
  };

  const deleteCourse = async (id: string, name: string) => {
    const ok = Platform.OS === 'web'
      ? window.confirm(`حذف "${name}" من الخطة؟ (يمكن استرجاعه لاحقاً)`)
      : await new Promise<boolean>((resolve) => {
          Alert.alert('تأكيد', `حذف "${name}"؟`, [
            { text: 'إلغاء', onPress: () => resolve(false) },
            { text: 'حذف', style: 'destructive', onPress: () => resolve(true) },
          ]);
        });
    if (!ok) return;
    try {
      await api.delete(`/curriculum/courses/${id}`);
      fetchGrid();
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'فشل الحذف';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('خطأ', msg);
    }
  };

  const generateOfferings = async (term?: number) => {
    if (!activeSemester) {
      const msg = 'لا يوجد فصل نشط حالياً';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('خطأ', msg);
      return;
    }
    const semName = activeSemester.name || activeSemester._id;
    const termLabel = term === 1 ? 'الفصل الأول' : term === 2 ? 'الفصل الثاني' : term === 3 ? 'الفصل الصيفي' : 'كل الفصول';
    const ok = Platform.OS === 'web'
      ? window.confirm(`توليد جلسات (${termLabel}) من خطة هذا القسم للفصل النشط "${semName}"؟`)
      : true;
    if (!ok) return;
    setGenerating(true);
    try {
      const params: any = { semester_id: activeSemester.id || activeSemester._id, department_id: selectedDept };
      if (term) params.term = term;
      // ⭐ تجهيز خريطة الشعب (تحويل النصوص لأرقام، وتجاهل القيم الفارغة أو 1)
      const sectionsPayload: Record<string, number> = {};
      Object.entries(sectionsMap).forEach(([ccid, val]) => {
        const n = parseInt(val);
        if (n && n > 1) sectionsPayload[ccid] = Math.min(n, 10);
      });
      const body = { sections_map: sectionsPayload, default_sections: 1 };
      const res = await api.post('/curriculum/generate-offerings', body, { params });
      const r = res.data;
      const msg = `تم إنشاء ${r.created} جلسة، تخطي ${r.skipped} (موجودة مسبقاً)`;
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('تم', msg);
      // مسح خريطة الشعب بعد التوليد الناجح
      setSectionsMap({});
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'فشل التوليد';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('خطأ', msg);
    } finally {
      setGenerating(false);
    }
  };

  const importFromArchive = async (semesterId: string, semName: string) => {
    const ok = Platform.OS === 'web'
      ? window.confirm(`استيراد المقررات من أرشيف "${semName}" إلى الخطة الدراسية؟`)
      : true;
    if (!ok) return;
    try {
      const res = await api.post(`/curriculum/import-from-archive/${semesterId}`);
      const r = res.data;
      const msg = `تم استيراد ${r.imported} مقرر • تخطي ${r.skipped_existing} • إسنادات: ${r.assignments_created}`;
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('تم', msg);
      setShowImport(false);
      fetchGrid();
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'فشل الاستيراد';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('خطأ', msg);
    }
  };

  const backfillFromActive = async () => {
    const ok = Platform.OS === 'web'
      ? window.confirm('بناء الخطة الدراسية من المقررات النشطة حالياً؟ (آمن، لن يكرر الموجود)')
      : true;
    if (!ok) return;
    try {
      const res = await api.post('/curriculum/backfill-from-active');
      const r = res.data;
      const msg = `تم إنشاء ${r.created} مقرر • تخطي ${r.skipped_existing} موجود • ربط ${r.linked_active_courses} مقرر فعلي • ${r.assignments_created} إسناد`;
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('تم', msg);
      fetchGrid();
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'فشل البناء';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('خطأ', msg);
    }
  };

  // ===== مسح خطة القسم =====
  const wipeDepartment = async () => {
    if (!selectedDept) return;
    const deptObj = departments.find((d: any) => (d.id || d._id) === selectedDept);
    const deptName = deptObj?.name || 'القسم';
    if (Platform.OS === 'web') {
      const c1 = window.confirm(`⚠️ تحذير خطير\n\nستحذف كامل خطة قسم "${deptName}" نهائياً.\nهل أنت متأكد؟`);
      if (!c1) return;
      const c2 = window.prompt(`للتأكيد، اكتب اسم القسم بالضبط:\n"${deptName}"`);
      if (c2 !== deptName) {
        window.alert('الاسم غير مطابق - تم إلغاء العملية');
        return;
      }
    }
    try {
      const res = await api.delete(`/curriculum/department/${selectedDept}/wipe`);
      const r = res.data;
      const msg = `${r.message}\nتم إلغاء ${r.assignments_cleared} إسناد معلم`;
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('تم', msg);
      fetchGrid();
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'فشل المسح';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('خطأ', msg);
    }
  };

  // ===== تحميل نموذج Excel =====
  const downloadTemplate = async () => {
    try {
      const res = await api.get('/template/curriculum', { responseType: 'blob' as any });
      if (Platform.OS === 'web') {
        const url = window.URL.createObjectURL(new Blob([res.data]));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'curriculum_template.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
      } else {
        Alert.alert('تم', 'تم تحميل النموذج');
      }
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'فشل التحميل';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('خطأ', msg);
    }
  };

  // ===== رفع Excel - معاينة ثم تنفيذ =====
  const [uploadPreview, setUploadPreview] = useState<any>(null);
  const [uploadFile, setUploadFile] = useState<any>(null);
  const [uploadMode, setUploadMode] = useState<'merge' | 'replace'>('merge');
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);

  const pickAndPreview = async () => {
    if (Platform.OS !== 'web') {
      Alert.alert('غير مدعوم', 'الرفع متاح حالياً عبر المتصفح فقط');
      return;
    }
    if (!selectedDept) {
      window.alert('اختر القسم أولاً');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv';
    input.onchange = async (ev: any) => {
      const f = ev.target.files?.[0];
      if (!f) return;
      setUploadFile(f);
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append('file', f);
        const res = await api.post(
          `/curriculum/upload/preview?department_id=${selectedDept}`,
          fd,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        setUploadPreview(res.data);
        setShowUpload(true);
      } catch (e: any) {
        window.alert(e?.response?.data?.detail || 'فشل معاينة الملف');
      } finally {
        setUploading(false);
      }
    };
    input.click();
  };

  const executeUpload = async () => {
    if (!uploadFile || !selectedDept) return;
    if (uploadMode === 'replace') {
      const ok = window.confirm('وضع الاستبدال سيمسح خطة القسم القديمة بالكامل قبل الرفع. متأكد؟');
      if (!ok) return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      const res = await api.post(
        `/curriculum/upload?department_id=${selectedDept}&mode=${uploadMode}`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      const r = res.data;
      window.alert(
        `${r.message}\n` +
        `• تم إنشاء: ${r.created}\n` +
        `• تخطي مكرر: ${r.skipped_duplicates_or_existing}\n` +
        `• خارج نطاق المستوى: ${r.out_of_level}` +
        (r.wiped_in_replace_mode ? `\n• تم مسح ${r.wiped_in_replace_mode} قديم` : '')
      );
      setShowUpload(false);
      setUploadFile(null);
      setUploadPreview(null);
      fetchGrid();
    } catch (e: any) {
      window.alert(e?.response?.data?.detail || 'فشل الرفع');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'الخطة الدراسية', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {/* رأس */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>📚 الخطة الدراسية</Text>
          <Text style={styles.headerSubtitle}>المقررات الثابتة لكل قسم (المستوى × الفصل)</Text>
        </View>

        {/* اختيار القسم */}
        <View style={styles.deptBar}>
          <Text style={styles.deptLabel}>القسم:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {departments.map((d: any) => {
                const did = d.id || d._id;
                return (
                  <TouchableOpacity
                    key={did}
                    style={[styles.deptChip, selectedDept === did && styles.deptChipActive]}
                    onPress={() => setSelectedDept(did)}
                    testID={`dept-${did}`}
                  >
                    <Text style={[styles.deptChipText, selectedDept === did && { color: '#fff' }]}>
                      {d.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>

        {/* شريط إجراءات */}
        <View style={styles.actionsBar}>
          <TouchableOpacity style={styles.actBtn} onPress={() => setShowAdd(true)} testID="add-curr-btn">
            <Ionicons name="add-circle" size={16} color="#2e7d32" />
            <Text style={[styles.actBtnText, { color: '#2e7d32' }]}>إضافة مقرر</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actBtn} onPress={downloadTemplate} testID="dl-template-btn">
            <Ionicons name="download" size={16} color="#1565c0" />
            <Text style={[styles.actBtnText, { color: '#1565c0' }]}>تحميل نموذج</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actBtn} onPress={pickAndPreview} disabled={uploading} testID="upload-excel-btn">
            {uploading ? <ActivityIndicator size="small" color="#2e7d32" /> : <Ionicons name="cloud-upload" size={16} color="#2e7d32" />}
            <Text style={[styles.actBtnText, { color: '#2e7d32' }]}>رفع من Excel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actBtn}
            onPress={() => generateOfferings()}
            disabled={generating}
            testID="gen-offerings-btn"
          >
            {generating ? <ActivityIndicator size="small" color="#1565c0" /> : <Ionicons name="play-circle" size={16} color="#1565c0" />}
            <Text style={[styles.actBtnText, { color: '#1565c0' }]}>
              توليد للفصل النشط
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actBtn, { backgroundColor: '#ffebee' }]} onPress={wipeDepartment} testID="wipe-dept-btn">
            <Ionicons name="trash" size={16} color="#c62828" />
            <Text style={[styles.actBtnText, { color: '#c62828' }]}>مسح خطة القسم</Text>
          </TouchableOpacity>
        </View>

        {activeSemester && (
          <View style={styles.semInfo}>
            <Ionicons name="calendar" size={13} color="#1565c0" />
            <Text style={styles.semInfoText}>الفصل النشط: {activeSemester.name}</Text>
          </View>
        )}

        {/* الشبكة */}
        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color="#6a1b9a" /></View>
        ) : !grid ? (
          <View style={styles.center}><Text style={styles.emptyText}>اختر قسماً لعرض الخطة</Text></View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
            {(grid.grid || []).map((row: any) => (
              <View key={row.level} style={styles.levelBlock}>
                <Text style={styles.levelTitle}>المستوى {row.level}</Text>
                <View style={styles.termsRow}>
                  <TermColumn label="الفصل الأول" courses={row.term1} onDelete={deleteCourse}
                    sectionsMap={sectionsMap} setSectionsMap={setSectionsMap} />
                  <TermColumn label="الفصل الثاني" courses={row.term2} onDelete={deleteCourse}
                    sectionsMap={sectionsMap} setSectionsMap={setSectionsMap} />
                  <TermColumn label="الفصل الصيفي" courses={row.term3 || []} onDelete={deleteCourse}
                    sectionsMap={sectionsMap} setSectionsMap={setSectionsMap}
                    accentColor="#ef6c00" />
                </View>
              </View>
            ))}
            <Text style={styles.summaryText}>
              إجمالي المقررات في الخطة: {grid.total_courses}
            </Text>
          </ScrollView>
        )}

        {/* Modal إضافة */}
        <Modal visible={showAdd} transparent animationType="fade" onRequestClose={() => setShowAdd(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>إضافة مقرر للخطة</Text>
              <TextInput
                style={styles.input}
                placeholder="الكود (مثال: ISL101)"
                value={addForm.code}
                onChangeText={(v) => setAddForm({ ...addForm, code: v.toUpperCase() })}
                testID="form-code"
              />
              <TextInput
                style={styles.input}
                placeholder="اسم المقرر"
                value={addForm.name}
                onChangeText={(v) => setAddForm({ ...addForm, name: v })}
                testID="form-name"
              />
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="ساعات معتمدة"
                  keyboardType="numeric"
                  value={String(addForm.credit_hours)}
                  onChangeText={(v) => setAddForm({ ...addForm, credit_hours: parseInt(v) || 0 })}
                  testID="form-credit"
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="ساعات أسبوعية"
                  keyboardType="numeric"
                  value={String(addForm.weekly_hours ?? '')}
                  onChangeText={(v) => setAddForm({ ...addForm, weekly_hours: v })}
                  testID="form-weekly"
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="المستوى"
                  keyboardType="numeric"
                  value={String(addForm.level)}
                  onChangeText={(v) => setAddForm({ ...addForm, level: parseInt(v) || 1 })}
                  testID="form-level"
                />
              </View>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                <TouchableOpacity
                  style={[styles.termBtn, addForm.term === 1 && styles.termBtnActive]}
                  onPress={() => setAddForm({ ...addForm, term: 1 })}
                  testID="form-term-1"
                >
                  <Text style={[styles.termBtnText, addForm.term === 1 && { color: '#fff' }]}>الفصل الأول</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.termBtn, addForm.term === 2 && styles.termBtnActive]}
                  onPress={() => setAddForm({ ...addForm, term: 2 })}
                  testID="form-term-2"
                >
                  <Text style={[styles.termBtnText, addForm.term === 2 && { color: '#fff' }]}>الفصل الثاني</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.termBtn, addForm.term === 3 && { backgroundColor: '#ef6c00', borderColor: '#ef6c00' }]}
                  onPress={() => setAddForm({ ...addForm, term: 3 })}
                  testID="form-term-3"
                >
                  <Text style={[styles.termBtnText, addForm.term === 3 && { color: '#fff' }]}>الفصل الصيفي</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#e0e0e0' }]} onPress={() => setShowAdd(false)}>
                  <Text style={[styles.modalBtnText, { color: '#555' }]}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#2e7d32' }]} onPress={submitAdd} testID="submit-add-btn">
                  <Text style={styles.modalBtnText}>إضافة</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Modal استيراد */}
        <Modal visible={showImport} transparent animationType="fade" onRequestClose={() => setShowImport(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>استيراد من فصل مؤرشف</Text>
              <Text style={styles.modalDesc}>
                اختر فصلاً مؤرشفاً ليتم بناء الخطة الدراسية من مقرراته:
              </Text>
              {archives.length === 0 ? (
                <Text style={styles.emptyText}>لا توجد فصول مؤرشفة</Text>
              ) : (
                <ScrollView style={{ maxHeight: 250 }}>
                  {archives.map((a: any) => (
                    <TouchableOpacity
                      key={a.semester_id}
                      style={styles.archiveItem}
                      onPress={() => importFromArchive(a.semester_id, a.semester_name)}
                      testID={`import-${a.semester_id}`}
                    >
                      <Ionicons name="archive" size={18} color="#6a1b9a" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.archiveItemName}>{a.semester_name}</Text>
                        <Text style={styles.archiveItemMeta}>
                          {a.academic_year} • {a.summary?.total_courses || 0} مقرر
                        </Text>
                      </View>
                      <Ionicons name="chevron-back" size={16} color="#bbb" />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#e0e0e0', marginTop: 10 }]} onPress={() => setShowImport(false)}>
                <Text style={[styles.modalBtnText, { color: '#555' }]}>إغلاق</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Modal معاينة رفع Excel */}
        <Modal visible={showUpload} transparent animationType="fade" onRequestClose={() => setShowUpload(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modal, { maxWidth: 580 }]}>
              <Text style={styles.modalTitle}>معاينة رفع الخطة من Excel</Text>
              {uploadPreview && (
                <ScrollView style={{ maxHeight: 400 }}>
                  <View style={styles.previewSummary}>
                    <Text style={styles.previewSummaryText}>
                      📋 القسم: <Text style={{ fontWeight: '800' }}>{uploadPreview.department?.name}</Text>
                    </Text>
                    <Text style={styles.previewSummaryText}>
                      📚 إجمالي الصفوف: {uploadPreview.total_rows_read}
                    </Text>
                  </View>

                  <View style={styles.previewStats}>
                    <View style={[styles.statBox, { backgroundColor: '#e8f5e9' }]}>
                      <Text style={[styles.statNum, { color: '#2e7d32' }]}>{uploadPreview.valid_count}</Text>
                      <Text style={styles.statText}>صالح</Text>
                    </View>
                    <View style={[styles.statBox, { backgroundColor: '#fff3e0' }]}>
                      <Text style={[styles.statNum, { color: '#ef6c00' }]}>{uploadPreview.existing_in_db_count}</Text>
                      <Text style={styles.statText}>موجود مسبقاً</Text>
                    </View>
                    <View style={[styles.statBox, { backgroundColor: '#ffebee' }]}>
                      <Text style={[styles.statNum, { color: '#c62828' }]}>{uploadPreview.out_of_level_count}</Text>
                      <Text style={styles.statText}>خارج النطاق</Text>
                    </View>
                    <View style={[styles.statBox, { backgroundColor: '#f3e5f5' }]}>
                      <Text style={[styles.statNum, { color: '#6a1b9a' }]}>{uploadPreview.duplicates_in_file_count}</Text>
                      <Text style={styles.statText}>مكرر في الملف</Text>
                    </View>
                  </View>

                  {/* وضع الرفع */}
                  <Text style={styles.previewSectionTitle}>وضع الرفع:</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                    <TouchableOpacity
                      style={[styles.modeBtn, uploadMode === 'merge' && styles.modeBtnActive]}
                      onPress={() => setUploadMode('merge')}
                      testID="mode-merge"
                    >
                      <Text style={[styles.modeBtnText, uploadMode === 'merge' && { color: '#fff' }]}>دمج (إضافة فقط)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modeBtn, uploadMode === 'replace' && { backgroundColor: '#c62828' }]}
                      onPress={() => setUploadMode('replace')}
                      testID="mode-replace"
                    >
                      <Text style={[styles.modeBtnText, uploadMode === 'replace' && { color: '#fff' }]}>استبدال كامل</Text>
                    </TouchableOpacity>
                  </View>

                  {/* عينة من الصالح */}
                  {uploadPreview.valid_sample?.length > 0 && (
                    <>
                      <Text style={styles.previewSectionTitle}>عينة من المقررات الصالحة:</Text>
                      {uploadPreview.valid_sample.slice(0, 8).map((r: any, i: number) => (
                        <View key={i} style={styles.previewItem}>
                          <Text style={styles.previewItemText} numberOfLines={1}>
                            {r.code} • {r.name} • م{r.level} ف{r.term} • {r.credit_hours} س.م
                          </Text>
                        </View>
                      ))}
                      {uploadPreview.valid_sample.length > 8 && (
                        <Text style={styles.previewMore}>... و{uploadPreview.valid_count - 8} مقرر آخر</Text>
                      )}
                    </>
                  )}

                  {/* أخطاء التحليل */}
                  {uploadPreview.parse_errors?.length > 0 && (
                    <>
                      <Text style={[styles.previewSectionTitle, { color: '#c62828' }]}>أخطاء:</Text>
                      {uploadPreview.parse_errors.slice(0, 5).map((e: string, i: number) => (
                        <Text key={i} style={styles.errorItem}>• {e}</Text>
                      ))}
                    </>
                  )}

                  {/* الموجود مسبقاً */}
                  {uploadPreview.existing_in_db?.length > 0 && (
                    <>
                      <Text style={[styles.previewSectionTitle, { color: '#ef6c00' }]}>موجود مسبقاً (سيتم تخطيه):</Text>
                      {uploadPreview.existing_in_db.slice(0, 5).map((r: any, i: number) => (
                        <Text key={i} style={styles.warnItem}>• {r.code} - {r.name}</Text>
                      ))}
                    </>
                  )}
                </ScrollView>
              )}

              <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#e0e0e0' }]}
                  onPress={() => { setShowUpload(false); setUploadFile(null); setUploadPreview(null); }}
                  testID="cancel-upload"
                >
                  <Text style={[styles.modalBtnText, { color: '#555' }]}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, {
                    backgroundColor: uploadPreview?.valid_count > 0 ? '#2e7d32' : '#ccc',
                  }]}
                  onPress={executeUpload}
                  disabled={uploading || !uploadPreview?.valid_count}
                  testID="execute-upload"
                >
                  {uploading ? <ActivityIndicator size="small" color="#fff" /> : (
                    <Text style={styles.modalBtnText}>
                      تنفيذ الرفع ({uploadPreview?.valid_count || 0})
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </>
  );
}

const TermColumn = ({ label, courses, onDelete, sectionsMap, setSectionsMap, accentColor }: any) => (
  <View style={styles.termCol}>
    <Text style={[styles.termHeader, accentColor && { color: accentColor, borderBottomColor: accentColor }]}>{label}</Text>
    {courses.length === 0 ? (
      <Text style={styles.emptyTermText}>لا توجد مقررات</Text>
    ) : (
      courses.map((c: any) => (
        <View key={c.id} style={styles.courseCard} testID={`curr-${c.id}`}>
          <View style={{ flex: 1 }}>
            <Text style={styles.courseName} numberOfLines={2}>{c.name}</Text>
            <Text style={styles.courseMeta}>
              {c.code} • {c.credit_hours} س.م
            </Text>
            {c.teachers?.length > 0 && (
              <Text style={styles.teacherText} numberOfLines={1}>
                👨‍🏫 {c.teachers.map((t: any) => t.full_name).join('، ')}
              </Text>
            )}
          </View>
          {/* ⭐ مربع عدد الشعب — يُكتب قبل التوليد */}
          <View style={styles.sectionsBoxWrap} testID={`sections-wrap-${c.id}`}>
            <TextInput
              style={styles.sectionsBox}
              placeholder="1"
              placeholderTextColor="#bbb"
              keyboardType="numeric"
              maxLength={2}
              value={sectionsMap?.[c.id] ?? ''}
              onChangeText={(v) => {
                // قبول أرقام فقط من 1 إلى 10
                const cleaned = v.replace(/[^0-9]/g, '');
                setSectionsMap?.((prev: any) => ({ ...prev, [c.id]: cleaned }));
              }}
              testID={`sections-input-${c.id}`}
            />
            <Text style={styles.sectionsBoxLabel}>شعب</Text>
          </View>
          <TouchableOpacity onPress={() => onDelete(c.id, c.name)} testID={`del-${c.id}`}>
            <Ionicons name="trash-outline" size={16} color="#c62828" />
          </TouchableOpacity>
        </View>
      ))
    )}
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f7' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  header: { backgroundColor: '#6a1b9a', paddingTop: 18, paddingBottom: 16, paddingHorizontal: 18 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff', textAlign: 'right' },
  headerSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 4, textAlign: 'right' },
  deptBar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: '#fff' },
  deptLabel: { fontSize: 12, color: '#555', fontWeight: '700' },
  deptChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f0f0f0' },
  deptChipActive: { backgroundColor: '#6a1b9a' },
  deptChipText: { fontSize: 12, fontWeight: '600', color: '#555' },
  actionsBar: { flexDirection: 'row', padding: 8, gap: 6, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee' },
  actBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f9f9f9',
  },
  actBtnText: { fontSize: 11, fontWeight: '700' },
  semInfo: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#e3f2fd', paddingVertical: 6, paddingHorizontal: 12,
  },
  semInfoText: { color: '#1565c0', fontSize: 12, fontWeight: '600' },
  levelBlock: { marginBottom: 14 },
  levelTitle: { fontSize: 14, fontWeight: '800', color: '#222', marginBottom: 6, textAlign: 'right' },
  termsRow: { flexDirection: 'row', gap: 8 },
  termCol: { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 10, minHeight: 80 },
  termHeader: {
    fontSize: 12, fontWeight: '700', color: '#6a1b9a',
    paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', marginBottom: 6, textAlign: 'right',
  },
  emptyTermText: { textAlign: 'center', color: '#bbb', fontSize: 11, paddingVertical: 10 },
  courseCard: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fafafa', padding: 8, borderRadius: 6, marginBottom: 4,
  },
  // ⭐ مربع عدد الشعب الصغير في كل مقرر
  sectionsBoxWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 4,
  },
  sectionsBox: {
    width: 36,
    height: 30,
    borderWidth: 1,
    borderColor: '#bdbdbd',
    borderRadius: 6,
    backgroundColor: '#fff',
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    color: '#1565c0',
    paddingVertical: 0,
  },
  sectionsBoxLabel: {
    fontSize: 9,
    color: '#777',
    fontWeight: '600',
  },
  courseName: { fontSize: 12, fontWeight: '700', color: '#222' },
  courseMeta: { fontSize: 10, color: '#888', marginTop: 2 },
  teacherText: { fontSize: 10, color: '#1565c0', marginTop: 2 },
  emptyText: { textAlign: 'center', color: '#aaa', fontSize: 13, padding: 20 },
  summaryText: { textAlign: 'center', color: '#666', fontSize: 12, marginTop: 10, fontWeight: '700' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 16,
  },
  modal: { backgroundColor: '#fff', borderRadius: 12, padding: 18, width: '100%', maxWidth: 450 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#222', marginBottom: 12, textAlign: 'right' },
  modalDesc: { fontSize: 12, color: '#666', marginBottom: 10, textAlign: 'right' },
  input: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 9, fontSize: 13,
    marginBottom: 8, textAlign: 'right', outlineWidth: 0 as any,
  },
  termBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, backgroundColor: '#f0f0f0', alignItems: 'center' },
  termBtnActive: { backgroundColor: '#6a1b9a' },
  termBtnText: { fontSize: 12, fontWeight: '700', color: '#555' },
  modalBtn: {
    flex: 1, paddingVertical: 11, borderRadius: 8, alignItems: 'center',
  },
  modalBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  archiveItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 10, backgroundColor: '#fafafa', borderRadius: 8, marginBottom: 4,
  },
  archiveItemName: { fontSize: 13, fontWeight: '700', color: '#222' },
  archiveItemMeta: { fontSize: 11, color: '#888', marginTop: 2 },
  // Upload preview styles
  previewSummary: { backgroundColor: '#f0f4f8', padding: 10, borderRadius: 8, marginBottom: 10 },
  previewSummaryText: { fontSize: 12, color: '#333', marginBottom: 3, textAlign: 'right' },
  previewStats: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  statBox: { flex: 1, padding: 8, borderRadius: 8, alignItems: 'center' },
  statNum: { fontSize: 18, fontWeight: '800' },
  statText: { fontSize: 10, color: '#555', marginTop: 2 },
  previewSectionTitle: { fontSize: 12, fontWeight: '800', color: '#444', marginTop: 8, marginBottom: 4, textAlign: 'right' },
  previewItem: { backgroundColor: '#f9f9f9', padding: 6, borderRadius: 4, marginBottom: 2 },
  previewItemText: { fontSize: 11, color: '#333', textAlign: 'right' },
  previewMore: { fontSize: 10, color: '#888', textAlign: 'center', marginTop: 4, fontStyle: 'italic' },
  errorItem: { fontSize: 10, color: '#c62828', textAlign: 'right', marginBottom: 2 },
  warnItem: { fontSize: 10, color: '#ef6c00', textAlign: 'right', marginBottom: 2 },
  modeBtn: { flex: 1, paddingVertical: 8, borderRadius: 6, backgroundColor: '#f0f0f0', alignItems: 'center' },
  modeBtnActive: { backgroundColor: '#2e7d32' },
  modeBtnText: { fontSize: 12, fontWeight: '700', color: '#555' },
});

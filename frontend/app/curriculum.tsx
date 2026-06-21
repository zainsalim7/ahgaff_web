/**
 * صفحة الخطة الدراسية - تصميم حديث متّسق
 * تحفظ جميع الوظائف:
 *  - اختيار القسم
 *  - إضافة مقرر / تحميل نموذج / رفع من Excel (مع معاينة)
 *  - توليد جلسات للفصل النشط
 *  - مسح خطة القسم
 *  - استيراد من أرشيف
 *  - شبكة المستوى × الفصل مع مدخل عدد الشعب لكل مقرر
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Platform, Modal, Alert, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
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
    code: '', name: '', credit_hours: 3, level: 1, term: 1,
  });
  const [generating, setGenerating] = useState(false);
  const [sectionsMap, setSectionsMap] = useState<Record<string, string>>({});
  const [activeSemester, setActiveSemester] = useState<any>(null);
  const [archives, setArchives] = useState<any[]>([]);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [d, s] = await Promise.all([
          api.get('/departments'),
          api.get('/semesters?status=active').catch(() => ({ data: [] })),
        ]);
        const deptItems = d.data?.items || d.data || [];
        setDepartments(deptItems);
        const sems = s.data?.items || s.data || [];
        const active = (Array.isArray(sems) ? sems : []).find((x: any) => x.status === 'active') || sems[0];
        setActiveSemester(active);
        // 🔧 أزلنا /archives من التحميل الأساسي — يُستدعى فقط عند فتح زر "استيراد من أرشيف"
        // (يمنع 403 ثانوياً لمستخدمين بلا صلاحية الأرشيف)
        if (!params.departmentId && deptItems.length > 0) {
          setSelectedDept(deptItems[0].id || deptItems[0]._id);
        }
      } catch (e) {
        // ignore
      }
    })();
  }, [params.departmentId]);

  /** يُحمَّل الأرشيف بشكل lazy فقط عند الحاجة (زر "استيراد من أرشيف") */
  const loadArchivesLazy = async () => {
    try {
      const a = await api.get('/archives');
      setArchives(a.data?.items || []);
    } catch {
      setArchives([]);
    }
  };

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
      await api.post('/curriculum/courses', {
        ...addForm,
        department_id: selectedDept,
        faculty_id: dept?.faculty_id,
      });
      setShowAdd(false);
      setAddForm({ code: '', name: '', credit_hours: 3, level: 1, term: 1 });
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

  const downloadTemplate = async () => {
    try {
      const res = await api.get('/template/curriculum', { responseType: 'blob' as any });
      if (Platform.OS === 'web') {
        const url = window.URL.createObjectURL(new Blob([res.data]));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'curriculum_template.xlsx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        Alert.alert('تم', 'تم تحميل النموذج');
      }
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'فشل التحميل';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('خطأ', msg);
    }
  };

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

  const selectedDeptObj = departments.find((d: any) => (d.id || d._id) === selectedDept);

  const levelsCount = (grid?.grid || []).length;
  const totalCourses = grid?.total_courses || 0;

  return (
    <>
      <Stack.Screen options={{ title: 'الخطة الدراسية', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.pageScroll, { flexGrow: 1 }]} showsVerticalScrollIndicator={true}>
            {/* رأس الصفحة */}
            <View style={styles.pageHeader}>
              <View style={styles.pageHeaderRight}>
                <Text style={styles.pageTitle}>الخطة الدراسية</Text>
                <View style={styles.breadcrumb}>
                  <TouchableOpacity onPress={() => router.replace('/')}>
                    <Text style={styles.breadcrumbLink}>الرئيسية</Text>
                  </TouchableOpacity>
                  <Ionicons name="chevron-back" size={12} color="#8a95a8" />
                  <Text style={styles.breadcrumbCurrent}>الخطة الدراسية</Text>
                  {selectedDeptObj && (
                    <>
                      <Ionicons name="chevron-back" size={12} color="#8a95a8" />
                      <Text style={styles.breadcrumbCurrent} numberOfLines={1}>{selectedDeptObj.name}</Text>
                    </>
                  )}
                </View>
              </View>

              <View style={styles.pageHeaderActions}>
                <TouchableOpacity
                  style={[styles.headerBtn, styles.btnPrimary]}
                  onPress={() => setShowAdd(true)}
                  testID="add-curr-btn"
                  disabled={!selectedDept}
                >
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.btnPrimaryText}>إضافة مقرر</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.headerBtn, styles.btnGhost]} onPress={() => fetchGrid()}>
                  <Ionicons name="refresh" size={16} color="#1a2540" />
                  <Text style={styles.btnGhostText}>تحديث</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* البطاقات الإحصائية */}
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <View style={[styles.statIconWrap, { backgroundColor: '#6a1b9a' }]}><Ionicons name="library" size={22} color="#fff" /></View>
                <View style={styles.statTextCol}>
                  <Text style={styles.statLabel}>إجمالي مقررات الخطة</Text>
                  <Text style={styles.statValue}>{totalCourses}</Text>
                  <Text style={styles.statSubLabel}>مقرر دراسي</Text>
                </View>
              </View>
              <View style={styles.statCard}>
                <View style={[styles.statIconWrap, { backgroundColor: '#1565c0' }]}><Ionicons name="layers" size={22} color="#fff" /></View>
                <View style={styles.statTextCol}>
                  <Text style={styles.statLabel}>المستويات</Text>
                  <Text style={styles.statValue}>{levelsCount}</Text>
                  <Text style={styles.statSubLabel}>مستوى دراسي</Text>
                </View>
              </View>
              <View style={styles.statCard}>
                <View style={[styles.statIconWrap, { backgroundColor: '#2e7d32' }]}><Ionicons name="business" size={22} color="#fff" /></View>
                <View style={styles.statTextCol}>
                  <Text style={styles.statLabel}>الأقسام المتاحة</Text>
                  <Text style={styles.statValue}>{departments.length}</Text>
                  <Text style={styles.statSubLabel}>قسم</Text>
                </View>
              </View>
              <View style={styles.statCard}>
                <View style={[styles.statIconWrap, { backgroundColor: '#ef6c00' }]}><Ionicons name="calendar" size={22} color="#fff" /></View>
                <View style={styles.statTextCol}>
                  <Text style={styles.statLabel}>الفصل النشط</Text>
                  <Text style={styles.statValue} numberOfLines={1}>{activeSemester?.name || '—'}</Text>
                  <Text style={styles.statSubLabel}>{activeSemester ? 'نشط' : 'غير محدد'}</Text>
                </View>
              </View>
            </View>

            {/* بطاقة اختيار القسم */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionCardHeader}>
                <Text style={styles.sectionCardTitle}>اختر القسم</Text>
                {selectedDeptObj && (
                  <View style={styles.deptActiveChip}>
                    <Ionicons name="business" size={12} color="#6a1b9a" />
                    <Text style={styles.deptActiveChipText} numberOfLines={1}>{selectedDeptObj.name}</Text>
                  </View>
                )}
              </View>
              <View style={styles.deptDropdownWrap}>
                <View style={styles.deptDropdown}>
                  <Ionicons name="business-outline" size={16} color="#6a1b9a" style={{ marginHorizontal: 8 }} />
                  <Picker
                    selectedValue={selectedDept}
                    onValueChange={(v) => setSelectedDept(v)}
                    style={styles.deptDropdownPicker}
                    enabled={departments.length > 0}
                  >
                    {departments.length === 0 ? (
                      <Picker.Item label="لا توجد أقسام" value="" />
                    ) : (
                      <>
                        <Picker.Item label="-- اختر قسماً --" value="" />
                        {departments.map((d: any) => {
                          const did = d.id || d._id;
                          return <Picker.Item key={did} label={d.name} value={did} />;
                        })}
                      </>
                    )}
                  </Picker>
                  <Ionicons name="chevron-down" size={16} color="#8a95a8" style={{ marginHorizontal: 8 }} />
                </View>
                <Text style={styles.deptDropdownHint}>إجمالي الأقسام المتاحة: {departments.length}</Text>
              </View>
            </View>

            {/* شريط الإجراءات */}
            <View style={styles.toolbarCard}>
              <Text style={styles.toolbarTitle}>إجراءات الخطة</Text>
              <View style={styles.toolbarGrid}>
                <TouchableOpacity style={[styles.toolBtn, { backgroundColor: '#e3f2fd' }]} onPress={downloadTemplate} testID="dl-template-btn">
                  <Ionicons name="download" size={18} color="#1565c0" />
                  <Text style={[styles.toolBtnText, { color: '#1565c0' }]}>تحميل نموذج Excel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.toolBtn, { backgroundColor: '#e8f5e9' }]} onPress={pickAndPreview} disabled={uploading} testID="upload-excel-btn">
                  {uploading ? <ActivityIndicator size="small" color="#2e7d32" /> : <Ionicons name="cloud-upload" size={18} color="#2e7d32" />}
                  <Text style={[styles.toolBtnText, { color: '#2e7d32' }]}>رفع من Excel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toolBtn, { backgroundColor: '#fff3e0' }]}
                  onPress={() => setShowImport(true)}
                  testID="open-import-btn"
                  disabled={archives.length === 0}
                >
                  <Ionicons name="archive" size={18} color="#ef6c00" />
                  <Text style={[styles.toolBtnText, { color: '#ef6c00' }]}>استيراد من أرشيف</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toolBtn, { backgroundColor: '#e1f5fe' }]}
                  onPress={() => generateOfferings()}
                  disabled={generating || !activeSemester}
                  testID="gen-offerings-btn"
                >
                  {generating ? <ActivityIndicator size="small" color="#0277bd" /> : <Ionicons name="play-circle" size={18} color="#0277bd" />}
                  <Text style={[styles.toolBtnText, { color: '#0277bd' }]}>توليد للفصل النشط</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.toolBtn, { backgroundColor: '#ffebee' }]} onPress={wipeDepartment} testID="wipe-dept-btn">
                  <Ionicons name="trash" size={18} color="#c62828" />
                  <Text style={[styles.toolBtnText, { color: '#c62828' }]}>مسح خطة القسم</Text>
                </TouchableOpacity>
              </View>
              {activeSemester && (
                <View style={styles.semInfo}>
                  <Ionicons name="information-circle" size={13} color="#1565c0" />
                  <Text style={styles.semInfoText}>الفصل النشط حالياً: <Text style={{ fontWeight: '800' }}>{activeSemester.name}</Text></Text>
                </View>
              )}
            </View>

            {/* الشبكة (المستوى × الفصل) */}
            <View style={styles.gridCard}>
              <View style={styles.gridCardHeader}>
                <Text style={styles.gridCardTitle}>خطة المستويات والفصول</Text>
                {selectedDeptObj && (
                  <Text style={styles.gridCardSub}>القسم: <Text style={{ fontWeight: '700', color: '#6a1b9a' }}>{selectedDeptObj.name}</Text></Text>
                )}
              </View>

              {loading ? (
                <View style={styles.center}><ActivityIndicator size="large" color="#6a1b9a" /></View>
              ) : !grid ? (
                <View style={styles.center}>
                  <Ionicons name="library-outline" size={48} color="#cfd6e1" />
                  <Text style={styles.emptyText}>اختر قسماً لعرض خطته الدراسية</Text>
                </View>
              ) : (grid.grid || []).length === 0 ? (
                <View style={styles.center}>
                  <Ionicons name="document-text-outline" size={48} color="#cfd6e1" />
                  <Text style={styles.emptyText}>لا توجد مقررات في الخطة بعد</Text>
                  <TouchableOpacity
                    style={[styles.headerBtn, styles.btnPrimary, { marginTop: 10 }]}
                    onPress={() => setShowAdd(true)}
                  >
                    <Ionicons name="add" size={16} color="#fff" />
                    <Text style={styles.btnPrimaryText}>إضافة أول مقرر</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ padding: 14 }}>
                  {(grid.grid || []).map((row: any) => (
                    <View key={row.level} style={styles.levelBlock}>
                      <View style={styles.levelHeader}>
                        <View style={styles.levelBadge}>
                          <Text style={styles.levelBadgeText}>{row.level}</Text>
                        </View>
                        <Text style={styles.levelTitle}>المستوى {row.level}</Text>
                        <View style={styles.levelCountChip}>
                          <Text style={styles.levelCountChipText}>
                            {(row.term1?.length || 0) + (row.term2?.length || 0) + (row.term3?.length || 0)} مقرر
                          </Text>
                        </View>
                      </View>
                      <View style={styles.termsRow}>
                        <TermColumn label="الفصل الأول" courses={row.term1} onDelete={deleteCourse}
                          sectionsMap={sectionsMap} setSectionsMap={setSectionsMap} accentColor="#1565c0" />
                        <TermColumn label="الفصل الثاني" courses={row.term2} onDelete={deleteCourse}
                          sectionsMap={sectionsMap} setSectionsMap={setSectionsMap} accentColor="#6a1b9a" />
                        <TermColumn label="الفصل الصيفي" courses={row.term3 || []} onDelete={deleteCourse}
                          sectionsMap={sectionsMap} setSectionsMap={setSectionsMap} accentColor="#ef6c00" />
                      </View>
                    </View>
                  ))}
                  <View style={styles.summaryBox}>
                    <Ionicons name="checkmark-circle" size={16} color="#2e7d32" />
                    <Text style={styles.summaryText}>
                      إجمالي مقررات الخطة: <Text style={{ fontWeight: '800', color: '#2e7d32' }}>{grid.total_courses}</Text> مقرر
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Modal إضافة */}
        <Modal visible={showAdd} transparent animationType="fade" onRequestClose={() => setShowAdd(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>إضافة مقرر للخطة</Text>
              <Text style={styles.modalLabel}>الكود <Text style={{ color: '#e91e63' }}>*</Text></Text>
              <TextInput
                style={styles.input}
                placeholder="مثال: ISL101"
                placeholderTextColor="#a8b1c2"
                value={addForm.code}
                onChangeText={(v) => setAddForm({ ...addForm, code: v.toUpperCase() })}
                testID="form-code"
              />
              <Text style={styles.modalLabel}>اسم المقرر <Text style={{ color: '#e91e63' }}>*</Text></Text>
              <TextInput
                style={styles.input}
                placeholder="اسم المقرر"
                placeholderTextColor="#a8b1c2"
                value={addForm.name}
                onChangeText={(v) => setAddForm({ ...addForm, name: v })}
                testID="form-name"
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>الساعات</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="3"
                    keyboardType="numeric"
                    placeholderTextColor="#a8b1c2"
                    value={String(addForm.credit_hours)}
                    onChangeText={(v) => setAddForm({ ...addForm, credit_hours: parseInt(v) || 0 })}
                    testID="form-credit"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>المستوى</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="1"
                    keyboardType="numeric"
                    placeholderTextColor="#a8b1c2"
                    value={String(addForm.level)}
                    onChangeText={(v) => setAddForm({ ...addForm, level: parseInt(v) || 1 })}
                    testID="form-level"
                  />
                </View>
              </View>
              <Text style={styles.modalLabel}>الفصل</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                <TouchableOpacity
                  style={[styles.termBtn, addForm.term === 1 && { backgroundColor: '#1565c0', borderColor: '#1565c0' }]}
                  onPress={() => setAddForm({ ...addForm, term: 1 })}
                  testID="form-term-1"
                >
                  <Text style={[styles.termBtnText, addForm.term === 1 && { color: '#fff' }]}>الفصل الأول</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.termBtn, addForm.term === 2 && { backgroundColor: '#6a1b9a', borderColor: '#6a1b9a' }]}
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
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                <TouchableOpacity style={[styles.modalBtn, styles.modalBtnCancel]} onPress={() => setShowAdd(false)}>
                  <Text style={styles.modalBtnCancelText}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={submitAdd} testID="submit-add-btn">
                  <Text style={styles.modalBtnPrimaryText}>إضافة</Text>
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
              <Text style={styles.modalDesc}>اختر فصلاً مؤرشفاً لبناء الخطة من مقرراته:</Text>
              {archives.length === 0 ? (
                <View style={{ padding: 20 }}>
                  <Text style={styles.emptyText}>لا توجد فصول مؤرشفة</Text>
                </View>
              ) : (
                <ScrollView style={{ maxHeight: 280 }}>
                  {archives.map((a: any) => (
                    <TouchableOpacity
                      key={a.semester_id}
                      style={styles.archiveItem}
                      onPress={() => importFromArchive(a.semester_id, a.semester_name)}
                      testID={`import-${a.semester_id}`}
                    >
                      <View style={[styles.archiveIconWrap]}>
                        <Ionicons name="archive" size={18} color="#6a1b9a" />
                      </View>
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
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnCancel, { marginTop: 12 }]} onPress={() => setShowImport(false)}>
                <Text style={styles.modalBtnCancelText}>إغلاق</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Modal معاينة رفع Excel */}
        <Modal visible={showUpload} transparent animationType="fade" onRequestClose={() => setShowUpload(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modal, { maxWidth: 600 }]}>
              <Text style={styles.modalTitle}>معاينة رفع الخطة من Excel</Text>
              {uploadPreview && (
                <ScrollView style={{ maxHeight: 440 }}>
                  <View style={styles.previewSummary}>
                    <Text style={styles.previewSummaryText}>
                      القسم: <Text style={{ fontWeight: '800' }}>{uploadPreview.department?.name}</Text>
                    </Text>
                    <Text style={styles.previewSummaryText}>
                      إجمالي الصفوف المقروءة: {uploadPreview.total_rows_read}
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

                  <Text style={styles.previewSectionTitle}>وضع الرفع:</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                    <TouchableOpacity
                      style={[styles.modeBtn, uploadMode === 'merge' && styles.modeBtnMergeActive]}
                      onPress={() => setUploadMode('merge')}
                      testID="mode-merge"
                    >
                      <Text style={[styles.modeBtnText, uploadMode === 'merge' && { color: '#fff' }]}>دمج (إضافة فقط)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modeBtn, uploadMode === 'replace' && styles.modeBtnReplaceActive]}
                      onPress={() => setUploadMode('replace')}
                      testID="mode-replace"
                    >
                      <Text style={[styles.modeBtnText, uploadMode === 'replace' && { color: '#fff' }]}>استبدال كامل</Text>
                    </TouchableOpacity>
                  </View>

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

                  {uploadPreview.parse_errors?.length > 0 && (
                    <>
                      <Text style={[styles.previewSectionTitle, { color: '#c62828' }]}>أخطاء:</Text>
                      {uploadPreview.parse_errors.slice(0, 5).map((e: string, i: number) => (
                        <Text key={i} style={styles.errorItem}>• {e}</Text>
                      ))}
                    </>
                  )}

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

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnCancel]}
                  onPress={() => { setShowUpload(false); setUploadFile(null); setUploadPreview(null); }}
                  testID="cancel-upload"
                >
                  <Text style={styles.modalBtnCancelText}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, {
                    backgroundColor: uploadPreview?.valid_count > 0 ? '#2e7d32' : '#cfd6e1',
                  }]}
                  onPress={executeUpload}
                  disabled={uploading || !uploadPreview?.valid_count}
                  testID="execute-upload"
                >
                  {uploading ? <ActivityIndicator size="small" color="#fff" /> : (
                    <Text style={styles.modalBtnPrimaryText}>
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
    <View style={[styles.termHeader, { borderBottomColor: accentColor }]}>
      <View style={[styles.termHeaderDot, { backgroundColor: accentColor }]} />
      <Text style={[styles.termHeaderText, { color: accentColor }]}>{label}</Text>
      <Text style={styles.termHeaderCount}>({courses?.length || 0})</Text>
    </View>
    {!courses || courses.length === 0 ? (
      <View style={styles.emptyTermBox}>
        <Ionicons name="document-outline" size={20} color="#cfd6e1" />
        <Text style={styles.emptyTermText}>لا توجد مقررات</Text>
      </View>
    ) : (
      courses.map((c: any) => (
        <View key={c.id} style={styles.courseCard} testID={`curr-${c.id}`}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.courseName} numberOfLines={2}>{c.name}</Text>
            <View style={styles.courseMetaRow}>
              <View style={styles.codeChip}>
                <Text style={styles.codeChipText}>{c.code}</Text>
              </View>
              <Text style={styles.creditText}>{c.credit_hours} س.م</Text>
            </View>
            {c.teachers?.length > 0 && (
              <View style={styles.teacherRow}>
                <Ionicons name="person" size={10} color="#1565c0" />
                <Text style={styles.teacherText} numberOfLines={1}>
                  {c.teachers.map((t: any) => t.full_name).join('، ')}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.sectionsBoxWrap} testID={`sections-wrap-${c.id}`}>
            <TextInput
              style={styles.sectionsBox}
              placeholder="1"
              placeholderTextColor="#cfd6e1"
              keyboardType="numeric"
              maxLength={2}
              value={sectionsMap?.[c.id] ?? ''}
              onChangeText={(v) => {
                const cleaned = v.replace(/[^0-9]/g, '');
                setSectionsMap?.((prev: any) => ({ ...prev, [c.id]: cleaned }));
              }}
              testID={`sections-input-${c.id}`}
            />
            <Text style={styles.sectionsBoxLabel}>شعب</Text>
          </View>
          <TouchableOpacity onPress={() => onDelete(c.id, c.name)} testID={`del-${c.id}`} style={styles.delBtn}>
            <Ionicons name="trash-outline" size={15} color="#c62828" />
          </TouchableOpacity>
        </View>
      ))
    )}
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6fb' },
  pageScroll: { padding: 20, paddingBottom: 60, maxWidth: 1440, width: '100%', alignSelf: 'center' },
  center: { padding: 40, alignItems: 'center', gap: 10 },

  // Page header
  pageHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 },
  pageHeaderRight: { alignItems: 'flex-end' },
  pageTitle: { fontSize: 26, fontWeight: '700', color: '#1a2540', textAlign: 'right', marginBottom: 6 },
  breadcrumb: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  breadcrumbLink: { fontSize: 13, color: '#2962ff', fontWeight: '500' },
  breadcrumbCurrent: { fontSize: 13, color: '#8a95a8', fontWeight: '500', maxWidth: 280 },
  pageHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  headerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 8 },
  btnPrimary: { backgroundColor: '#6a1b9a' },
  btnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e7ee' },
  btnGhostText: { color: '#1a2540', fontSize: 13, fontWeight: '600' },

  // Stats grid
  statsGrid: { flexDirection: 'row', gap: 14, marginBottom: 18, flexWrap: 'wrap' },
  statCard: { flex: 1, minWidth: 200, backgroundColor: '#fff', borderRadius: 14, padding: 18, flexDirection: 'row-reverse', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: '#eef1f6' },
  statIconWrap: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  statTextCol: { flex: 1, alignItems: 'flex-end' },
  statLabel: { fontSize: 13, color: '#8a95a8', fontWeight: '500', marginBottom: 4 },
  statValue: { fontSize: 22, color: '#1a2540', fontWeight: '700', marginBottom: 2 },
  statSubLabel: { fontSize: 11, color: '#a8b1c2' },

  // Section card (dept selector)
  sectionCard: { backgroundColor: '#fff', borderRadius: 14, marginBottom: 18, borderWidth: 1, borderColor: '#eef1f6' },
  sectionCardHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: '#f3f5f9', gap: 12, flexWrap: 'wrap' },
  sectionCardTitle: { fontSize: 14, fontWeight: '700', color: '#1a2540' },
  deptActiveChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: '#f3e5f5', maxWidth: 260 },
  deptActiveChipText: { fontSize: 12, color: '#6a1b9a', fontWeight: '700' },
  deptDropdownWrap: { padding: 14, gap: 6 },
  deptDropdown: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: '#f7f9fc', borderRadius: 10, borderWidth: 1, borderColor: '#e3e7ee', height: 44 },
  deptDropdownPicker: { flex: 1, height: 44, fontSize: 14, color: '#1a2540', textAlign: 'right', backgroundColor: 'transparent', borderWidth: 0, outlineStyle: 'none' as any },
  deptDropdownHint: { fontSize: 11, color: '#8a95a8', textAlign: 'right', marginTop: 2 },

  // Toolbar card
  toolbarCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 18, borderWidth: 1, borderColor: '#eef1f6' },
  toolbarTitle: { fontSize: 14, fontWeight: '700', color: '#1a2540', marginBottom: 12, textAlign: 'right' },
  toolbarGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  toolBtn: { flex: 1, minWidth: 150, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10 },
  toolBtnText: { fontSize: 13, fontWeight: '700' },
  semInfo: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: '#e3f2fd', padding: 10, borderRadius: 8, marginTop: 12 },
  semInfoText: { color: '#1565c0', fontSize: 12, fontWeight: '600' },

  // Grid card
  gridCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#eef1f6' },
  gridCardHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: '#eef1f6', flexWrap: 'wrap', gap: 8 },
  gridCardTitle: { fontSize: 15, fontWeight: '700', color: '#1a2540' },
  gridCardSub: { fontSize: 12, color: '#5b6678' },

  // Level block
  levelBlock: { marginBottom: 18 },
  levelHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 10, paddingBottom: 6, borderBottomWidth: 2, borderBottomColor: '#f3e5f5' },
  levelBadge: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#6a1b9a', alignItems: 'center', justifyContent: 'center' },
  levelBadgeText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  levelTitle: { fontSize: 15, fontWeight: '800', color: '#1a2540', flex: 1, textAlign: 'right' },
  levelCountChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: '#f3e5f5' },
  levelCountChipText: { fontSize: 11, color: '#6a1b9a', fontWeight: '700' },
  termsRow: { flexDirection: 'row', gap: 10 },
  termCol: { flex: 1, backgroundColor: '#fafbfd', borderRadius: 10, padding: 10, minHeight: 110, borderWidth: 1, borderColor: '#eef1f6' },
  termHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingBottom: 8, borderBottomWidth: 1, marginBottom: 8 },
  termHeaderDot: { width: 8, height: 8, borderRadius: 4 },
  termHeaderText: { fontSize: 12, fontWeight: '800', flex: 1, textAlign: 'right' },
  termHeaderCount: { fontSize: 11, color: '#8a95a8', fontWeight: '600' },
  emptyTermBox: { alignItems: 'center', gap: 4, paddingVertical: 14 },
  emptyTermText: { textAlign: 'center', color: '#a8b1c2', fontSize: 11 },

  // Course card
  courseCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: '#fff', padding: 10, borderRadius: 8, marginBottom: 6, borderWidth: 1, borderColor: '#eef1f6' },
  courseName: { fontSize: 13, fontWeight: '700', color: '#1a2540', textAlign: 'right' },
  courseMetaRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 4 },
  codeChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: '#e3f2fd' },
  codeChipText: { fontSize: 10, fontWeight: '700', color: '#1565c0' },
  creditText: { fontSize: 11, color: '#5b6678' },
  teacherRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginTop: 4 },
  teacherText: { fontSize: 10, color: '#1565c0', flex: 1, textAlign: 'right' },
  sectionsBoxWrap: { alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 2 },
  sectionsBox: { width: 36, height: 30, borderWidth: 1, borderColor: '#cfd6e1', borderRadius: 6, backgroundColor: '#fff', textAlign: 'center', fontSize: 13, fontWeight: '700', color: '#1565c0', paddingVertical: 0, outlineStyle: 'none' as any },
  sectionsBoxLabel: { fontSize: 9, color: '#8a95a8', fontWeight: '600' },
  delBtn: { width: 30, height: 30, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffebee', borderWidth: 1, borderColor: '#ffcdd2' },

  // Summary box
  summaryBox: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#e8f5e9', padding: 12, borderRadius: 10, marginTop: 4 },
  summaryText: { fontSize: 13, color: '#1a2540', fontWeight: '600' },

  emptyText: { textAlign: 'center', color: '#8a95a8', fontSize: 13 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(20,30,55,0.45)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modal: { backgroundColor: '#fff', borderRadius: 14, padding: 22, width: '100%', maxWidth: 460 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#1a2540', marginBottom: 14, textAlign: 'right' },
  modalDesc: { fontSize: 13, color: '#5b6678', marginBottom: 12, textAlign: 'right' },
  modalLabel: { fontSize: 12, fontWeight: '600', color: '#1a2540', marginBottom: 4, marginTop: 4, textAlign: 'right' },
  input: { borderWidth: 1, borderColor: '#e3e7ee', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, marginBottom: 8, textAlign: 'right', outlineStyle: 'none' as any, backgroundColor: '#fff', color: '#1a2540' },
  termBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e7ee', alignItems: 'center' },
  termBtnText: { fontSize: 12, fontWeight: '700', color: '#5b6678' },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modalBtnCancel: { backgroundColor: '#f4f6fb', borderWidth: 1, borderColor: '#e3e7ee' },
  modalBtnCancelText: { color: '#5b6678', fontWeight: '700', fontSize: 13 },
  modalBtnPrimary: { backgroundColor: '#6a1b9a' },
  modalBtnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  archiveItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: 12, backgroundColor: '#fafbfd', borderRadius: 10, marginBottom: 6, borderWidth: 1, borderColor: '#eef1f6' },
  archiveIconWrap: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#f3e5f5', alignItems: 'center', justifyContent: 'center' },
  archiveItemName: { fontSize: 13, fontWeight: '700', color: '#1a2540', textAlign: 'right' },
  archiveItemMeta: { fontSize: 11, color: '#8a95a8', marginTop: 2, textAlign: 'right' },

  // Upload preview
  previewSummary: { backgroundColor: '#f7f9fc', padding: 12, borderRadius: 10, marginBottom: 12 },
  previewSummaryText: { fontSize: 12, color: '#1a2540', marginBottom: 4, textAlign: 'right' },
  previewStats: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statBox: { flex: 1, padding: 10, borderRadius: 10, alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: '800' },
  statText: { fontSize: 10, color: '#5b6678', marginTop: 2 },
  previewSectionTitle: { fontSize: 12, fontWeight: '800', color: '#1a2540', marginTop: 10, marginBottom: 6, textAlign: 'right' },
  previewItem: { backgroundColor: '#fafbfd', padding: 7, borderRadius: 6, marginBottom: 3 },
  previewItemText: { fontSize: 11, color: '#1a2540', textAlign: 'right' },
  previewMore: { fontSize: 10, color: '#8a95a8', textAlign: 'center', marginTop: 4, fontStyle: 'italic' },
  errorItem: { fontSize: 10, color: '#c62828', textAlign: 'right', marginBottom: 2 },
  warnItem: { fontSize: 10, color: '#ef6c00', textAlign: 'right', marginBottom: 2 },
  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e7ee', alignItems: 'center' },
  modeBtnMergeActive: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  modeBtnReplaceActive: { backgroundColor: '#c62828', borderColor: '#c62828' },
  modeBtnText: { fontSize: 12, fontWeight: '700', color: '#5b6678' },
});

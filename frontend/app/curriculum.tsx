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
    code: '', name: '', credit_hours: 3, level: 1, term: 1,
  });
  const [generating, setGenerating] = useState(false);
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
    const termLabel = term === 1 ? 'الفصل الأول' : term === 2 ? 'الفصل الثاني' : 'كل الفصول';
    const ok = Platform.OS === 'web'
      ? window.confirm(`توليد جلسات (${termLabel}) من خطة هذا القسم للفصل النشط "${semName}"؟`)
      : true;
    if (!ok) return;
    setGenerating(true);
    try {
      const params: any = { semester_id: activeSemester.id || activeSemester._id, department_id: selectedDept };
      if (term) params.term = term;
      const res = await api.post('/curriculum/generate-offerings', null, { params });
      const r = res.data;
      const msg = `تم إنشاء ${r.created} جلسة، تخطي ${r.skipped} (موجودة مسبقاً)`;
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('تم', msg);
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
          <TouchableOpacity style={styles.actBtn} onPress={() => setShowImport(true)} testID="import-btn">
            <Ionicons name="archive" size={16} color="#6a1b9a" />
            <Text style={[styles.actBtnText, { color: '#6a1b9a' }]}>استيراد من الأرشيف</Text>
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
                  <TermColumn label="الفصل الأول" courses={row.term1} onDelete={deleteCourse} />
                  <TermColumn label="الفصل الثاني" courses={row.term2} onDelete={deleteCourse} />
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
      </SafeAreaView>
    </>
  );
}

const TermColumn = ({ label, courses, onDelete }: any) => (
  <View style={styles.termCol}>
    <Text style={styles.termHeader}>{label}</Text>
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
});

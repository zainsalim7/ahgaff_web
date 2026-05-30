/**
 * صفحة إسناد المعلمين - إدارة الارتباط الدائم بين المعلم ومقررات الخطة الدراسية
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Platform, Modal, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, Stack } from 'expo-router';
import api from '../src/services/api';

export default function TeacherAssignmentsScreen() {
  const router = useRouter();
  const [teachers, setTeachers] = useState<any[]>([]);
  const [curriculumCourses, setCurriculumCourses] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTeacher, setFilterTeacher] = useState<string>('');
  const [filterDept, setFilterDept] = useState<string>('');
  const [showAdd, setShowAdd] = useState(false);
  const [newTeacher, setNewTeacher] = useState('');
  const [newCourse, setNewCourse] = useState('');
  const [searchCourse, setSearchCourse] = useState('');
  const [searchTeacher, setSearchTeacher] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [t, cc, a, d] = await Promise.all([
        api.get('/teachers'),
        api.get('/curriculum/courses'),
        api.get('/curriculum/assignments'),
        api.get('/departments'),
      ]);
      setTeachers(t.data?.items || t.data || []);
      setCurriculumCourses(cc.data?.items || []);
      setAssignments(a.data?.items || []);
      setDepartments(d.data?.items || d.data || []);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'فشل التحميل';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('خطأ', msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const teachersMap = useMemo(() => {
    const m: Record<string, any> = {};
    teachers.forEach((t) => { m[t.id || t._id] = t; });
    return m;
  }, [teachers]);

  const coursesMap = useMemo(() => {
    const m: Record<string, any> = {};
    curriculumCourses.forEach((c) => { m[c.id || c._id] = c; });
    return m;
  }, [curriculumCourses]);

  const deptsMap = useMemo(() => {
    const m: Record<string, any> = {};
    departments.forEach((d) => { m[d.id || d._id] = d; });
    return m;
  }, [departments]);

  // تجميع الإسنادات حسب المعلم
  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    assignments.forEach((a) => {
      if (filterTeacher && a.teacher_id !== filterTeacher) return;
      const c = coursesMap[a.curriculum_course_id];
      if (filterDept && c?.department_id !== filterDept) return;
      const key = a.teacher_id || 'unknown';
      if (!g[key]) g[key] = [];
      g[key].push(a);
    });
    return g;
  }, [assignments, filterTeacher, filterDept, coursesMap]);

  const removeAssignment = async (id: string, label: string) => {
    const ok = Platform.OS === 'web'
      ? window.confirm(`إلغاء الإسناد "${label}"؟`)
      : await new Promise<boolean>((resolve) => {
          Alert.alert('تأكيد', `إلغاء "${label}"؟`, [
            { text: 'إلغاء', onPress: () => resolve(false) },
            { text: 'حذف', style: 'destructive', onPress: () => resolve(true) },
          ]);
        });
    if (!ok) return;
    try {
      await api.delete(`/curriculum/assignments/${id}`);
      fetchAll();
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'فشل الإلغاء';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('خطأ', msg);
    }
  };

  const submitAdd = async () => {
    if (!newTeacher || !newCourse) {
      const msg = 'اختر المعلم والمقرر';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('تنبيه', msg);
      return;
    }
    try {
      await api.post('/curriculum/assignments', {
        teacher_id: newTeacher,
        curriculum_course_id: newCourse,
      });
      setShowAdd(false);
      setNewTeacher('');
      setNewCourse('');
      setSearchCourse('');
      setSearchTeacher('');
      fetchAll();
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'فشل الإسناد';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('خطأ', msg);
    }
  };

  const filteredCoursesForPicker = useMemo(() => {
    const q = searchCourse.trim().toLowerCase();
    if (!q) return curriculumCourses.slice(0, 80);
    return curriculumCourses.filter((c) =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.code || '').toLowerCase().includes(q)
    ).slice(0, 80);
  }, [searchCourse, curriculumCourses]);

  const filteredTeachersForPicker = useMemo(() => {
    const q = searchTeacher.trim().toLowerCase();
    if (!q) return teachers.slice(0, 80);
    return teachers.filter((t) =>
      (t.full_name || '').toLowerCase().includes(q) ||
      (t.teacher_id || '').toLowerCase().includes(q)
    ).slice(0, 80);
  }, [searchTeacher, teachers]);

  return (
    <>
      <Stack.Screen options={{ title: 'إسناد المعلمين', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>إسناد المعلمين</Text>
          <Text style={styles.headerSubtitle}>
            ربط المعلم بمقررات الخطة الدراسية بشكل دائم (مستقل عن الفصول)
          </Text>
        </View>

        <View style={styles.actionsBar}>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setShowAdd(true)} testID="add-assign-btn">
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>إسناد جديد</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkBtn} onPress={() => router.push('/curriculum')}>
            <Ionicons name="library" size={14} color="#6a1b9a" />
            <Text style={styles.linkBtnText}>الخطة الدراسية</Text>
          </TouchableOpacity>
        </View>

        {/* فلاتر */}
        <View style={styles.filterBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            <TouchableOpacity
              style={[styles.chip, !filterDept && styles.chipActive]}
              onPress={() => setFilterDept('')}
            >
              <Text style={[styles.chipText, !filterDept && { color: '#fff' }]}>كل الأقسام</Text>
            </TouchableOpacity>
            {departments.map((d: any) => {
              const did = d.id || d._id;
              return (
                <TouchableOpacity
                  key={did}
                  style={[styles.chip, filterDept === did && styles.chipActive]}
                  onPress={() => setFilterDept(filterDept === did ? '' : did)}
                  testID={`filter-dept-${did}`}
                >
                  <Text style={[styles.chipText, filterDept === did && { color: '#fff' }]}>{d.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{assignments.length}</Text>
            <Text style={styles.statLabel}>إجمالي الإسنادات</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{Object.keys(grouped).length}</Text>
            <Text style={styles.statLabel}>معلم مُسنَد</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{curriculumCourses.length}</Text>
            <Text style={styles.statLabel}>مقرر في الخطة</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color="#6a1b9a" /></View>
        ) : Object.keys(grouped).length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="people-circle-outline" size={56} color="#ccc" />
            <Text style={styles.emptyText}>لا توجد إسنادات</Text>
            <Text style={styles.emptySub}>اضغط "إسناد جديد" لربط معلم بمقرر</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
            {Object.entries(grouped).map(([teacherId, items]) => {
              const t = teachersMap[teacherId];
              return (
                <View key={teacherId} style={styles.teacherBlock}>
                  <View style={styles.teacherHead}>
                    <View style={styles.teacherAvatar}>
                      <Text style={styles.teacherInitial}>
                        {(t?.full_name || '?').charAt(0)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.teacherName} numberOfLines={1}>
                        {t?.full_name || '(غير معروف)'}
                      </Text>
                      <Text style={styles.teacherMeta}>
                        {t?.teacher_id ? `${t.teacher_id} • ` : ''}{items.length} مقرر مُسنَد
                      </Text>
                    </View>
                  </View>
                  <View style={styles.assignList}>
                    {items.map((a) => {
                      const c = coursesMap[a.curriculum_course_id];
                      const dept = c ? deptsMap[c.department_id] : null;
                      return (
                        <View key={a.id} style={styles.assignItem} testID={`assign-${a.id}`}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.assignCourseName} numberOfLines={1}>
                              {c?.name || '(مقرر محذوف)'}
                            </Text>
                            <Text style={styles.assignMeta} numberOfLines={1}>
                              {c?.code || '—'} • م{c?.level || '?'} ف{c?.term || '?'} • {dept?.name || ''}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => removeAssignment(a.id, `${t?.full_name} - ${c?.name}`)}
                            testID={`remove-assign-${a.id}`}
                            style={styles.removeBtn}
                          >
                            <Ionicons name="close-circle" size={18} color="#c62828" />
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}

        {/* Modal إضافة */}
        <Modal visible={showAdd} transparent animationType="fade" onRequestClose={() => setShowAdd(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>إسناد جديد</Text>

              <Text style={styles.label}>المعلم</Text>
              <TextInput
                style={styles.input}
                placeholder="ابحث عن معلم..."
                value={searchTeacher}
                onChangeText={setSearchTeacher}
                testID="picker-teacher-search"
              />
              <ScrollView style={styles.pickerList} nestedScrollEnabled>
                {filteredTeachersForPicker.map((t: any) => {
                  const tid = t.id || t._id;
                  return (
                    <TouchableOpacity
                      key={tid}
                      style={[styles.pickerItem, newTeacher === tid && styles.pickerItemActive]}
                      onPress={() => setNewTeacher(tid)}
                      testID={`pick-teacher-${tid}`}
                    >
                      <Text style={[styles.pickerText, newTeacher === tid && { color: '#fff' }]}>
                        {t.full_name} {t.teacher_id ? `(${t.teacher_id})` : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={[styles.label, { marginTop: 10 }]}>المقرر</Text>
              <TextInput
                style={styles.input}
                placeholder="ابحث عن مقرر..."
                value={searchCourse}
                onChangeText={setSearchCourse}
                testID="picker-course-search"
              />
              <ScrollView style={styles.pickerList} nestedScrollEnabled>
                {filteredCoursesForPicker.map((c: any) => {
                  const cid = c.id || c._id;
                  return (
                    <TouchableOpacity
                      key={cid}
                      style={[styles.pickerItem, newCourse === cid && styles.pickerItemActive]}
                      onPress={() => setNewCourse(cid)}
                      testID={`pick-course-${cid}`}
                    >
                      <Text style={[styles.pickerText, newCourse === cid && { color: '#fff' }]}>
                        {c.name} • {c.code} • م{c.level} ف{c.term}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#e0e0e0' }]}
                  onPress={() => setShowAdd(false)}
                >
                  <Text style={[styles.modalBtnText, { color: '#555' }]}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#6a1b9a' }]}
                  onPress={submitAdd}
                  testID="submit-assign-btn"
                >
                  <Text style={styles.modalBtnText}>إسناد</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f7' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  header: { backgroundColor: '#6a1b9a', paddingTop: 18, paddingBottom: 16, paddingHorizontal: 18 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff', textAlign: 'right' },
  headerSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 4, textAlign: 'right' },
  actionsBar: { flexDirection: 'row', padding: 10, gap: 8, backgroundColor: '#fff' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#6a1b9a', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  linkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: '#6a1b9a',
  },
  linkBtnText: { color: '#6a1b9a', fontWeight: '700', fontSize: 12 },
  filterBar: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee', padding: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, backgroundColor: '#f0f0f0' },
  chipActive: { backgroundColor: '#6a1b9a' },
  chipText: { fontSize: 11, fontWeight: '600', color: '#555' },
  statsRow: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee' },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRightWidth: 1, borderRightColor: '#f0f0f0' },
  statValue: { fontSize: 16, fontWeight: '800', color: '#6a1b9a' },
  statLabel: { fontSize: 10, color: '#888', marginTop: 2 },
  teacherBlock: { backgroundColor: '#fff', borderRadius: 10, marginBottom: 10, overflow: 'hidden' },
  teacherHead: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#f3e5f5', padding: 10,
  },
  teacherAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#6a1b9a',
    alignItems: 'center', justifyContent: 'center',
  },
  teacherInitial: { color: '#fff', fontSize: 16, fontWeight: '800' },
  teacherName: { fontSize: 13, fontWeight: '800', color: '#222' },
  teacherMeta: { fontSize: 11, color: '#666', marginTop: 2 },
  assignList: { padding: 8 },
  assignItem: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  assignCourseName: { fontSize: 12, fontWeight: '700', color: '#222' },
  assignMeta: { fontSize: 10, color: '#888', marginTop: 2 },
  removeBtn: { padding: 4 },
  emptyText: { fontSize: 14, color: '#777', marginTop: 10, fontWeight: '700' },
  emptySub: { fontSize: 12, color: '#aaa', marginTop: 4 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 16,
  },
  modal: { backgroundColor: '#fff', borderRadius: 12, padding: 18, width: '100%', maxWidth: 500 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#222', marginBottom: 12, textAlign: 'right' },
  label: { fontSize: 12, color: '#666', fontWeight: '700', marginBottom: 4, textAlign: 'right' },
  input: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 13,
    marginBottom: 6, textAlign: 'right', outlineWidth: 0 as any,
  },
  pickerList: {
    maxHeight: 140, borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 4,
  },
  pickerItem: { paddingVertical: 7, paddingHorizontal: 10, borderRadius: 6, marginBottom: 2 },
  pickerItemActive: { backgroundColor: '#6a1b9a' },
  pickerText: { fontSize: 12, color: '#333', textAlign: 'right' },
  modalBtn: { flex: 1, paddingVertical: 11, borderRadius: 8, alignItems: 'center' },
  modalBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});

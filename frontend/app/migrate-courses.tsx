import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, ActivityIndicator, Switch, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import api from '../src/services/api';

interface Semester {
  id: string;
  name: string;
  academic_year: string;
  courses_count: number;
  status?: string;
}

interface PreviewCourse {
  id: string;
  name: string;
  code: string;
  section: string;
  level?: number;
  department_name: string;
  teacher_name: string;
  students_count: number;
  exists_in_target: boolean;
}

const notify = (type: 'success' | 'error', msg: string) => {
  if (Platform.OS === 'web') {
    if (type === 'error') window.alert(msg);
  } else {
    Alert.alert(type === 'success' ? 'نجاح' : 'خطأ', msg);
  }
};

export default function MigrateCoursesScreen() {
  const { hasAnyPermission, user } = useAuth();
  const canAccess = user?.role === 'admin' || hasAnyPermission(['migrate_courses']);

  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [deptId, setDeptId] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [loadingSem, setLoadingSem] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [courses, setCourses] = useState<PreviewCourse[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copyTeacher, setCopyTeacher] = useState(true);
  const [copyStudents, setCopyStudents] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    api.get('/semesters')
      .then(res => setSemesters(res.data || []))
      .catch(() => notify('error', 'فشل تحميل الفصول الدراسية'))
      .finally(() => setLoadingSem(false));
    api.get('/departments')
      .then(res => setDepartments((res.data || []).map((d: any) => ({ id: d.id, name: (d.name || '').trim() }))))
      .catch(() => {});
  }, []);

  const sourceSem = semesters.find(s => s.id === sourceId);
  const targetSem = semesters.find(s => s.id === targetId);

  const loadPreview = async () => {
    if (!sourceId || !targetId) return;
    setPreviewing(true);
    setResult(null);
    setConfirming(false);
    try {
      const res = await api.get('/course-migration/preview', {
        params: {
          source_semester_id: sourceId,
          target_semester_id: targetId,
          ...(deptId ? { department_id: deptId } : {}),
        },
      });
      const list: PreviewCourse[] = res.data.courses || [];
      setCourses(list);
      setSelected(new Set(list.filter(c => !c.exists_in_target).map(c => c.id)));
    } catch (e: any) {
      notify('error', e?.response?.data?.detail || 'فشل تحميل المعاينة');
      setCourses(null);
    } finally {
      setPreviewing(false);
    }
  };

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectableCourses = useMemo(() => (courses || []).filter(c => !c.exists_in_target), [courses]);
  const allSelected = selectableCourses.length > 0 && selectableCourses.every(c => selected.has(c.id));

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(selectableCourses.map(c => c.id)));
  };

  const execute = async () => {
    setExecuting(true);
    try {
      const res = await api.post('/course-migration/execute', {
        source_semester_id: sourceId,
        target_semester_id: targetId,
        course_ids: Array.from(selected),
        copy_teacher: copyTeacher,
        copy_students: copyStudents,
      });
      setResult(res.data);
      setConfirming(false);
      setCourses(null);
      notify('success', `تم ترحيل ${res.data.migrated} مقرراً بنجاح`);
    } catch (e: any) {
      notify('error', e?.response?.data?.detail || 'فشل تنفيذ الترحيل');
    } finally {
      setExecuting(false);
    }
  };

  if (!canAccess) {
    return (
      <View style={s.center}>
        <Ionicons name="lock-closed" size={48} color="#cfd6e1" />
        <Text style={s.noPermText}>ليس لديك صلاحية ترحيل المقررات</Text>
      </View>
    );
  }

  const semLabel = (sem: Semester) => `${sem.name} (${sem.academic_year}) — ${sem.courses_count} مقرر`;

  const renderSemesterSelect = (
    label: string, value: string, onChange: (v: string) => void, excludeId: string, testID: string
  ) => (
    <View style={s.selectBlock}>
      <Text style={s.selectLabel}>{label}</Text>
      {Platform.OS === 'web' ? (
        <select
          value={value}
          onChange={(e: any) => onChange(e.target.value)}
          data-testid={testID}
          style={{
            width: '100%', padding: '12px', borderRadius: 10, border: '1px solid #e0e4ec',
            fontSize: 14, backgroundColor: '#fff', direction: 'rtl', boxSizing: 'border-box' as any,
          }}
        >
          <option value="">-- اختر الفصل --</option>
          {semesters.filter(sem => sem.id !== excludeId).map(sem => (
            <option key={sem.id} value={sem.id}>{semLabel(sem)}</option>
          ))}
        </select>
      ) : (
        <View>
          {semesters.filter(sem => sem.id !== excludeId).map(sem => (
            <TouchableOpacity
              key={sem.id}
              style={[s.semOption, value === sem.id && s.semOptionActive]}
              onPress={() => onChange(sem.id)}
            >
              <Text style={[s.semOptionText, value === sem.id && s.semOptionTextActive]}>{semLabel(sem)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} testID="migrate-back-btn">
          <Ionicons name="arrow-forward" size={24} color="#1a2540" />
        </TouchableOpacity>
        <Text style={s.title}>ترحيل المقررات لفصل جديد</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={s.infoBox}>
        <Ionicons name="information-circle" size={18} color="#1565c0" />
        <Text style={s.infoText}>
          انسخ مقررات فصل سابق إلى فصل جديد بضغطة واحدة. المقررات المكررة تُتخطى تلقائياً، والفصل المصدر لا يتأثر إطلاقاً.
        </Text>
      </View>

      {loadingSem ? (
        <ActivityIndicator size="large" color="#1565c0" style={{ marginTop: 40 }} />
      ) : (
        <>
          {/* اختيار الفصول */}
          <View style={s.card}>
            {renderSemesterSelect('الفصل المصدر (المنسوخ منه)', sourceId, (v) => { setSourceId(v); setCourses(null); setResult(null); }, targetId, 'source-semester-select')}
            <View style={s.arrowRow}>
              <Ionicons name="arrow-down" size={22} color="#1565c0" />
            </View>
            {renderSemesterSelect('الفصل الهدف (المنسوخ إليه)', targetId, (v) => { setTargetId(v); setCourses(null); setResult(null); }, sourceId, 'target-semester-select')}

            {/* فلتر القسم (اختياري) */}
            <View style={[s.selectBlock, { marginTop: 12 }]}>
              <Text style={s.selectLabel}>القسم (اختياري — لترحيل قسم واحد فقط)</Text>
              {Platform.OS === 'web' ? (
                <select
                  value={deptId}
                  onChange={(e: any) => { setDeptId(e.target.value); setCourses(null); setResult(null); }}
                  data-testid="department-filter-select"
                  style={{
                    width: '100%', padding: '12px', borderRadius: 10, border: '1px solid #e0e4ec',
                    fontSize: 14, backgroundColor: '#fff', direction: 'rtl', boxSizing: 'border-box' as any,
                  }}
                >
                  <option value="">كل الأقسام (ضمن نطاقك)</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              ) : (
                <View>
                  <TouchableOpacity
                    style={[s.semOption, deptId === '' && s.semOptionActive]}
                    onPress={() => { setDeptId(''); setCourses(null); setResult(null); }}
                  >
                    <Text style={[s.semOptionText, deptId === '' && s.semOptionTextActive]}>كل الأقسام (ضمن نطاقك)</Text>
                  </TouchableOpacity>
                  {departments.map(d => (
                    <TouchableOpacity
                      key={d.id}
                      style={[s.semOption, deptId === d.id && s.semOptionActive]}
                      onPress={() => { setDeptId(d.id); setCourses(null); setResult(null); }}
                    >
                      <Text style={[s.semOptionText, deptId === d.id && s.semOptionTextActive]}>{d.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <Text style={s.hintText}>
              💡 لا يظهر هنا إلا الفصول التي أنشأها المدير مسبقاً من إدارة الفصول
            </Text>

            <TouchableOpacity
              style={[s.previewBtn, (!sourceId || !targetId || previewing) && s.btnDisabled]}
              disabled={!sourceId || !targetId || previewing}
              onPress={loadPreview}
              testID="preview-migration-btn"
            >
              {previewing ? <ActivityIndicator size="small" color="#fff" /> : (
                <>
                  <Ionicons name="eye" size={18} color="#fff" />
                  <Text style={s.previewBtnText}>معاينة المقررات</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* نتيجة التنفيذ */}
          {result && (
            <View style={s.resultCard} testID="migration-result">
              <Text style={s.resultTitle}>✅ اكتمل الترحيل إلى "{result.target_semester_name}"</Text>
              <Text style={s.resultLine}>• تم ترحيل: {result.migrated} مقرر</Text>
              {result.skipped > 0 && <Text style={s.resultLine}>• تم تخطي (مكرر): {result.skipped}</Text>}
              <Text style={s.resultLine}>• إسنادات المدرّسين المنسوخة: {result.teacher_assignments}</Text>
              {result.enrollments_copied > 0 && <Text style={s.resultLine}>• تسجيلات الطلاب المنسوخة: {result.enrollments_copied}</Text>}
            </View>
          )}

          {/* المعاينة */}
          {courses !== null && (
            <View style={s.card}>
              <View style={s.previewHeader}>
                <Text style={s.previewTitle}>
                  المقررات في "{sourceSem?.name}" ({courses.length})
                </Text>
                {selectableCourses.length > 0 && (
                  <TouchableOpacity onPress={toggleAll} testID="toggle-all-courses">
                    <Text style={s.toggleAllText}>{allSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {courses.length === 0 ? (
                <Text style={s.emptyText}>لا توجد مقررات في الفصل المصدر ضمن نطاقك</Text>
              ) : (
                courses.map(c => {
                  const checked = selected.has(c.id);
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[s.courseRow, c.exists_in_target && s.courseRowDup]}
                      disabled={c.exists_in_target}
                      onPress={() => toggle(c.id)}
                      testID={`course-row-${c.id}`}
                    >
                      <Ionicons
                        name={c.exists_in_target ? 'remove-circle' : checked ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={c.exists_in_target ? '#bdbdbd' : checked ? '#1565c0' : '#90a4ae'}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={s.courseName}>
                          {c.name}{c.section ? ` (${c.section})` : ''} — {c.code}
                        </Text>
                        <Text style={s.courseMeta}>
                          {c.department_name}{c.level ? ` • مستوى ${c.level}` : ''}
                          {c.teacher_name ? ` • ${c.teacher_name}` : ' • بدون مدرّس'}
                          {` • ${c.students_count} طالب`}
                        </Text>
                        {c.exists_in_target && (
                          <Text style={s.dupBadge}>⚠️ موجود مسبقاً في الفصل الهدف — سيتم تخطيه</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}

              {selectableCourses.length > 0 && (
                <>
                  {/* خيارات النسخ */}
                  <View style={s.optionsBox}>
                    <View style={s.optionRow}>
                      <Switch value={copyTeacher} onValueChange={setCopyTeacher} testID="copy-teacher-switch" />
                      <Text style={s.optionText}>نسخ إسناد المدرّسين والعبء التدريسي</Text>
                    </View>
                    <View style={s.optionRow}>
                      <Switch value={copyStudents} onValueChange={setCopyStudents} testID="copy-students-switch" />
                      <Text style={s.optionText}>نسخ الطلاب المسجلين (غير مستحسن — الطلاب ينتقلون لمستوى أعلى غالباً)</Text>
                    </View>
                  </View>

                  {!confirming ? (
                    <TouchableOpacity
                      style={[s.executeBtn, selected.size === 0 && s.btnDisabled]}
                      disabled={selected.size === 0}
                      onPress={() => setConfirming(true)}
                      testID="execute-migration-btn"
                    >
                      <Ionicons name="swap-horizontal" size={18} color="#fff" />
                      <Text style={s.executeBtnText}>ترحيل {selected.size} مقرراً إلى "{targetSem?.name}"</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={s.confirmBox} testID="confirm-migration-box">
                      <Text style={s.confirmText}>
                        سيتم نسخ {selected.size} مقرراً من "{sourceSem?.name}" إلى "{targetSem?.name}"
                        {copyTeacher ? ' مع إسناد المدرّسين' : ' بدون إسناد المدرّسين'}
                        {copyStudents ? ' ومع الطلاب المسجلين' : ''}. متابعة؟
                      </Text>
                      <View style={s.confirmActions}>
                        <TouchableOpacity style={s.confirmYes} onPress={execute} disabled={executing} testID="confirm-migration-yes">
                          {executing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.confirmYesText}>نعم، رحّل الآن</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity style={s.confirmNo} onPress={() => setConfirming(false)} disabled={executing} testID="confirm-migration-no">
                          <Text style={s.confirmNoText}>إلغاء</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </>
              )}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6fa' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#f4f6fa' },
  noPermText: { fontSize: 15, color: '#5b6678', fontWeight: '600' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontSize: 18, fontWeight: '800', color: '#1a2540' },
  infoBox: {
    flexDirection: 'row-reverse', gap: 8, backgroundColor: '#e3f2fd', borderRadius: 10,
    padding: 12, marginBottom: 14, alignItems: 'flex-start',
  },
  infoText: { flex: 1, fontSize: 12.5, color: '#0d47a1', textAlign: 'right', lineHeight: 19 },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: '#e8ecf3',
  },
  selectBlock: { marginBottom: 4 },
  selectLabel: { fontSize: 13, fontWeight: '700', color: '#3a4560', marginBottom: 8, textAlign: 'right' },
  arrowRow: { alignItems: 'center', marginVertical: 8 },
  hintText: { fontSize: 11.5, color: '#8a95a8', textAlign: 'right', marginTop: 10 },
  semOption: { padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e0e4ec', marginBottom: 6 },
  semOptionActive: { borderColor: '#1565c0', backgroundColor: '#e3f2fd' },
  semOptionText: { fontSize: 13, color: '#3a4560', textAlign: 'right' },
  semOptionTextActive: { color: '#1565c0', fontWeight: '700' },
  previewBtn: {
    flexDirection: 'row-reverse', gap: 8, backgroundColor: '#1565c0', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center', justifyContent: 'center', marginTop: 14,
  },
  previewBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  btnDisabled: { opacity: 0.45 },
  previewHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  previewTitle: { fontSize: 14, fontWeight: '800', color: '#1a2540', textAlign: 'right' },
  toggleAllText: { fontSize: 12.5, color: '#1565c0', fontWeight: '700' },
  emptyText: { fontSize: 13, color: '#8a95a8', textAlign: 'center', padding: 20 },
  courseRow: {
    flexDirection: 'row-reverse', gap: 10, alignItems: 'flex-start',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f2f7',
  },
  courseRowDup: { opacity: 0.6 },
  courseName: { fontSize: 13.5, fontWeight: '700', color: '#1a2540', textAlign: 'right' },
  courseMeta: { fontSize: 11.5, color: '#5b6678', textAlign: 'right', marginTop: 3 },
  dupBadge: { fontSize: 11, color: '#e65100', fontWeight: '600', textAlign: 'right', marginTop: 4 },
  optionsBox: { backgroundColor: '#f7f9fc', borderRadius: 10, padding: 12, marginTop: 14, gap: 10 },
  optionRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  optionText: { flex: 1, fontSize: 12.5, color: '#3a4560', textAlign: 'right' },
  executeBtn: {
    flexDirection: 'row-reverse', gap: 8, backgroundColor: '#2e7d32', borderRadius: 10,
    paddingVertical: 13, alignItems: 'center', justifyContent: 'center', marginTop: 14,
  },
  executeBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  confirmBox: { backgroundColor: '#fff8e1', borderRadius: 10, borderWidth: 1, borderColor: '#ffe082', padding: 14, marginTop: 14 },
  confirmText: { fontSize: 13, color: '#5d4037', textAlign: 'right', lineHeight: 20, marginBottom: 12 },
  confirmActions: { flexDirection: 'row-reverse', gap: 10 },
  confirmYes: { flex: 1, backgroundColor: '#2e7d32', borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  confirmYesText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
  confirmNo: { flex: 1, backgroundColor: '#eceff1', borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  confirmNoText: { color: '#455a64', fontWeight: '700', fontSize: 13.5 },
  resultCard: {
    backgroundColor: '#e8f5e9', borderRadius: 14, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: '#a5d6a7',
  },
  resultTitle: { fontSize: 14.5, fontWeight: '800', color: '#1b5e20', textAlign: 'right', marginBottom: 8 },
  resultLine: { fontSize: 13, color: '#2e7d32', textAlign: 'right', marginBottom: 3 },
});

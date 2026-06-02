import { goBack } from '../src/utils/navigation';
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { teachingLoadAPI, departmentsAPI, teachersAPI, semestersAPI } from '../src/services/api';

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  overload: { bg: '#ffebee', text: '#c62828', label: 'حمل زائد' },
  optimal: { bg: '#e8f5e9', text: '#2e7d32', label: 'مثالي' },
  low: { bg: '#fff3e0', text: '#e65100', label: 'منخفض' },
  none: { bg: '#f5f5f5', text: '#999', label: 'بدون مقررات' },
};

type ReportScope = 'department' | 'teacher';

export default function TeachingLoadReport() {
  const [departments, setDepartments] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [semesters, setSemesters] = useState<any[]>([]);
  const [scope, setScope] = useState<ReportScope>('department');
  const [selectedSemester, setSelectedSemester] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState('');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'comparison' | 'unassigned_courses' | 'idle_teachers'>('comparison');

  useEffect(() => {
    (async () => {
      try {
        const [dRes, sRes] = await Promise.all([departmentsAPI.getAll(), semestersAPI.getAll()]);
        setDepartments(dRes.data || []);
        const sems = sRes.data || [];
        setSemesters(sems);
        // تعيين الفصل النشط افتراضياً
        const active = sems.find((x: any) => x.status === 'active');
        if (active) setSelectedSemester(active.id);
      } catch {}
    })();
  }, []);

  // عند تغيير القسم في وضع "معلم"، نُحدث قائمة المعلمين
  useEffect(() => {
    (async () => {
      if (scope !== 'teacher') return;
      try {
        const res = await teachersAPI.getAll(selectedDept ? { department_id: selectedDept } : {});
        setTeachers(res.data || []);
      } catch {}
    })();
  }, [scope, selectedDept]);

  // فلترة المعلمين بحسب البحث
  const filteredTeachers = useMemo(() => {
    if (!teacherSearch.trim()) return teachers;
    const q = teacherSearch.trim().toLowerCase();
    return teachers.filter((t: any) =>
      (t.full_name || '').toLowerCase().includes(q) ||
      (t.teacher_id || '').toLowerCase().includes(q) ||
      (t.name || '').toLowerCase().includes(q)
    );
  }, [teachers, teacherSearch]);

  const resetReport = () => { setReport(null); setHasRun(false); };

  const runReport = async () => {
    if (scope === 'department' && !selectedDept) return;
    if (scope === 'teacher' && !selectedTeacher) return;

    setLoading(true);
    try {
      const params: any = {};
      if (scope === 'department') params.department_id = selectedDept;
      if (scope === 'teacher') params.teacher_id = selectedTeacher;
      // الفصل الدراسي اختياري — يحدد الـ term تلقائياً من الفصل المختار
      if (selectedSemester) params.semester_id = selectedSemester;

      const res = await teachingLoadAPI.advancedReport(params);
      setReport(res.data);
      setHasRun(true);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const s = report?.summary;
  const canRun = scope === 'department' ? !!selectedDept : !!selectedTeacher;

  return (
    <SafeAreaView style={st.container} edges={['bottom']}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => goBack()}><Ionicons name="arrow-forward" size={24} color="#333" /></TouchableOpacity>
        <Text style={st.headerTitle}>تقارير العبء التدريسي</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={st.scroll}>
        {/* بطاقة الفلاتر — مدمجة وعملية */}
        <View style={st.card}>
          {/* صف 1: الفصل الدراسي (الأهم — أولاً) */}
          <View style={st.row}>
            <View style={{ flex: 1 }}>
              <Text style={st.lbl}>الفصل الدراسي</Text>
              <View style={st.pickerWrap}>
                <Picker selectedValue={selectedSemester} onValueChange={v => { setSelectedSemester(v); resetReport(); }} style={st.picker} testID="semester-picker">
                  <Picker.Item label="-- كل الفصول --" value="" />
                  {semesters.map((sem: any) => (
                    <Picker.Item key={sem.id} label={`${sem.name} ${sem.academic_year || ''}${sem.status === 'active' ? ' (النشط)' : ''}`} value={sem.id} />
                  ))}
                </Picker>
              </View>
            </View>
          </View>

          {/* صف 2: نوع التقرير (قسم/معلم) — أزرار صغيرة */}
          <View style={[st.row, { marginTop: 10 }]}>
            <Text style={st.lbl}>نوع التقرير</Text>
          </View>
          <View style={st.scopeRow}>
            <TouchableOpacity
              testID="scope-department"
              onPress={() => { setScope('department'); setSelectedTeacher(''); resetReport(); }}
              style={[st.pill, scope === 'department' && st.pillActive]}
            >
              <Text style={[st.pillText, scope === 'department' && st.pillTextActive]}>قسم كامل</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="scope-teacher"
              onPress={() => { setScope('teacher'); resetReport(); }}
              style={[st.pill, scope === 'teacher' && st.pillActive]}
            >
              <Text style={[st.pillText, scope === 'teacher' && st.pillTextActive]}>معلم محدد</Text>
            </TouchableOpacity>
          </View>

          {/* صف 3: القسم — مطلوب في وضع "قسم"، اختياري لتضييق قائمة المعلمين */}
          <View style={[st.row, { marginTop: 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={st.lbl}>
                القسم {scope === 'department' ? '*' : <Text style={st.hint}>(لتضييق قائمة المعلمين)</Text>}
              </Text>
              <View style={st.pickerWrap}>
                <Picker selectedValue={selectedDept} onValueChange={v => { setSelectedDept(v); resetReport(); }} style={st.picker} testID="dept-picker">
                  <Picker.Item label={scope === 'teacher' ? '-- كل الأقسام --' : '-- اختر القسم --'} value="" />
                  {departments.map(d => <Picker.Item key={d.id} label={d.name} value={d.id} />)}
                </Picker>
              </View>
            </View>
          </View>

          {/* صف 4: المعلم — بحث + قائمة (يظهر فقط في وضع "معلم") */}
          {scope === 'teacher' && (
            <View style={[st.row, { marginTop: 12 }]}>
              <View style={{ flex: 1 }}>
                <Text style={st.lbl}>المعلم *</Text>
                {/* مربع البحث */}
                <View style={st.searchWrap}>
                  <Ionicons name="search" size={16} color="#888" />
                  <TextInput
                    style={st.searchInput}
                    placeholder="ابحث باسم المعلم أو الرقم الوظيفي..."
                    placeholderTextColor="#aaa"
                    value={teacherSearch}
                    onChangeText={setTeacherSearch}
                    testID="teacher-search"
                  />
                  {teacherSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setTeacherSearch('')}>
                      <Ionicons name="close-circle" size={16} color="#999" />
                    </TouchableOpacity>
                  )}
                </View>
                {/* قائمة منسدلة (مفلترة) */}
                <View style={[st.pickerWrap, { marginTop: 6 }]}>
                  <Picker selectedValue={selectedTeacher} onValueChange={v => { setSelectedTeacher(v); resetReport(); }} style={st.picker} testID="teacher-picker">
                    <Picker.Item label={`-- اختر المعلم (${filteredTeachers.length}) --`} value="" />
                    {filteredTeachers.map((t: any) => (
                      <Picker.Item key={t.id} label={`${t.full_name || t.name}${t.teacher_id ? ' — ' + t.teacher_id : ''}`} value={t.id} />
                    ))}
                  </Picker>
                </View>
              </View>
            </View>
          )}

          {/* زر التنفيذ — مدمج */}
          <TouchableOpacity
            style={[st.runBtn, (loading || !canRun) && { opacity: 0.5 }]}
            onPress={runReport}
            disabled={loading || !canRun}
            testID="run-report-btn"
          >
            {loading ? (
              <>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={st.runBtnText}>جاري...</Text>
              </>
            ) : (
              <>
                <Ionicons name="play" size={14} color="#fff" />
                <Text style={st.runBtnText}>{hasRun ? 'إعادة التنفيذ' : 'تنفيذ التقرير'}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {loading && <View style={st.emptyCard}><ActivityIndicator size="large" color="#1565c0" /><Text style={st.emptyText}>جاري التحميل...</Text></View>}

        {!loading && !report && (
          <View style={st.emptyCard}>
            <Ionicons name="bar-chart-outline" size={36} color="#ccc" />
            <Text style={st.emptyText}>{canRun ? 'اضغط "تنفيذ" لعرض التقرير' : (scope === 'teacher' ? 'اختر المعلم' : 'اختر القسم')}</Text>
          </View>
        )}

        {!loading && report && (
          <>
            {/* Summary Cards */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              <View style={[st.statCard, { backgroundColor: '#e3f2fd' }]}>
                <Text style={[st.statNum, { color: '#1565c0' }]}>{s.total_teachers}</Text>
                <Text style={st.statLabel}>معلم</Text>
              </View>
              <View style={[st.statCard, { backgroundColor: '#e8f5e9' }]}>
                <Text style={[st.statNum, { color: '#2e7d32' }]}>{s.teachers_with_load}</Text>
                <Text style={st.statLabel}>لديهم عبء</Text>
              </View>
              <View style={[st.statCard, { backgroundColor: '#fff3e0' }]}>
                <Text style={[st.statNum, { color: '#e65100' }]}>{s.courses_without_teacher}</Text>
                <Text style={st.statLabel}>مقرر بدون معلم</Text>
              </View>
              <View style={[st.statCard, { backgroundColor: '#fce4ec' }]}>
                <Text style={[st.statNum, { color: '#c62828' }]}>{s.overloaded_teachers}</Text>
                <Text style={st.statLabel}>حمل زائد</Text>
              </View>
              <View style={[st.statCard, { backgroundColor: '#f3e5f5' }]}>
                <Text style={[st.statNum, { color: '#7b1fa2' }]}>{s.average_weekly_load}</Text>
                <Text style={st.statLabel}>متوسط ساعات/أسبوع</Text>
              </View>
              <View style={[st.statCard, { backgroundColor: '#e0f2f1' }]}>
                <Text style={[st.statNum, { color: '#00695c' }]}>{s.courses_assigned}/{s.total_courses}</Text>
                <Text style={st.statLabel}>مقرر مسند</Text>
              </View>
            </View>

            {/* Tabs */}
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
              {[
                { key: 'comparison', label: 'مقارنة المعلمين', icon: 'people' },
                { key: 'unassigned_courses', label: `بدون معلم (${s.courses_without_teacher})`, icon: 'book' },
                { key: 'idle_teachers', label: `بدون مقررات (${s.teachers_without_courses})`, icon: 'person' },
              ].map(tab => (
                <TouchableOpacity
                  key={tab.key}
                  style={[st.tab, activeTab === tab.key && st.tabActive]}
                  onPress={() => setActiveTab(tab.key as any)}
                >
                  <Ionicons name={tab.icon as any} size={14} color={activeTab === tab.key ? '#fff' : '#1565c0'} />
                  <Text style={[st.tabText, activeTab === tab.key && st.tabTextActive]}>{tab.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Tab Content */}
            {activeTab === 'comparison' && (
              <View>
                {report.teacher_comparison.map((t: any) => {
                  const sc = STATUS_COLORS[t.status] || STATUS_COLORS.none;
                  return (
                    <View key={t.teacher_id} style={[st.card, { borderRightWidth: 4, borderRightColor: sc.text }]}>
                      <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <View>
                          <Text style={{ fontSize: 15, fontWeight: '600', color: '#333', textAlign: 'right' }}>{t.teacher_name}</Text>
                          <Text style={{ fontSize: 11, color: '#888', textAlign: 'right' }}>{t.employee_id}</Text>
                        </View>
                        <View style={{ backgroundColor: sc.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: sc.text }}>{sc.label}</Text>
                        </View>
                      </View>
                      {/* Progress Bar */}
                      <View style={{ backgroundColor: '#f0f0f0', height: 8, borderRadius: 4, marginBottom: 6 }}>
                        <View style={{ backgroundColor: sc.text, height: 8, borderRadius: 4, width: `${Math.min(t.usage_percentage, 100)}%` }} />
                      </View>
                      <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 12, color: '#666' }}>{t.assigned_weekly_hours} / {t.max_weekly_hours} ساعة ({t.usage_percentage}%)</Text>
                        <Text style={{ fontSize: 12, color: '#888' }}>{t.courses_count} مقرر</Text>
                      </View>
                      {t.courses.length > 0 && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                          {t.courses.map((c: any, i: number) => (
                            <View key={i} style={{ backgroundColor: '#e3f2fd', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
                              <Text style={{ fontSize: 10, color: '#1565c0' }}>{c.name} ({c.code}){c.section ? ` ${c.section}` : ''}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {activeTab === 'unassigned_courses' && (
              <View>
                {report.courses_without_teacher.length === 0 ? (
                  <View style={st.emptyCard}><Ionicons name="checkmark-circle" size={48} color="#4caf50" /><Text style={st.emptyText}>جميع المقررات مسندة لمعلمين</Text></View>
                ) : report.courses_without_teacher.map((c: any) => (
                  <View key={c.course_id} style={[st.card, { borderRightWidth: 4, borderRightColor: '#ff9800' }]}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#333', textAlign: 'right' }}>{c.course_name}</Text>
                    <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 4 }}>
                      <Text style={{ fontSize: 12, color: '#666' }}>{c.course_code}</Text>
                      <Text style={{ fontSize: 12, color: '#888' }}>م{c.level}</Text>
                      {c.section ? <Text style={{ fontSize: 12, color: '#888' }}>{c.section}</Text> : null}
                      <Text style={{ fontSize: 12, color: '#1565c0' }}>{c.students_count} طالب</Text>
                      <Text style={{ fontSize: 12, color: '#999' }}>{c.credit_hours} ساعة</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {activeTab === 'idle_teachers' && (
              <View>
                {report.teachers_without_courses.length === 0 ? (
                  <View style={st.emptyCard}><Ionicons name="checkmark-circle" size={48} color="#4caf50" /><Text style={st.emptyText}>جميع المعلمين لديهم مقررات</Text></View>
                ) : report.teachers_without_courses.map((t: any) => (
                  <View key={t.teacher_id} style={[st.card, { borderRightWidth: 4, borderRightColor: '#9e9e9e' }]}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#333', textAlign: 'right' }}>{t.teacher_name}</Text>
                    <Text style={{ fontSize: 12, color: '#888', textAlign: 'right' }}>{t.employee_id} | نصاب: {t.max_weekly_hours} ساعة</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#333', flex: 1, textAlign: 'center' },
  scroll: { flex: 1, padding: 12 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  // عناصر مدمجة
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  lbl: { fontSize: 12, fontWeight: '600', color: '#444', marginBottom: 4, textAlign: 'right' },
  hint: { fontSize: 10, color: '#999', fontWeight: '400' },
  picker: { height: 38 },
  pickerWrap: { backgroundColor: '#fafafa', borderRadius: 6, borderWidth: 1, borderColor: '#ddd', overflow: 'hidden' },
  // أزرار "قسم/معلم" — pills صغيرة
  scopeRow: { flexDirection: 'row', gap: 6 },
  pill: {
    flex: 1, paddingVertical: 7, borderRadius: 16, alignItems: 'center',
    borderWidth: 1, borderColor: '#1565c0', backgroundColor: '#fff',
  },
  pillActive: { backgroundColor: '#1565c0' },
  pillText: { fontSize: 12, color: '#1565c0', fontWeight: '600' },
  pillTextActive: { color: '#fff' },
  // مربع البحث
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fafafa', borderRadius: 6, borderWidth: 1, borderColor: '#ddd',
    paddingHorizontal: 10, height: 36,
  },
  searchInput: {
    flex: 1, fontSize: 13, color: '#222', textAlign: 'right',
    ...Platform.select({ web: { outlineWidth: 0 } as any }),
  },
  // زر التنفيذ
  runBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#1565c0', paddingVertical: 9, borderRadius: 8, marginTop: 12,
  },
  runBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  // باقي العناصر
  emptyCard: { backgroundColor: '#fff', borderRadius: 10, padding: 28, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  emptyText: { marginTop: 8, fontSize: 13, color: '#999', textAlign: 'center' },
  // (متغيرات قديمة للتقرير)
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8, textAlign: 'right' },
  statCard: { flex: 1, minWidth: 100, borderRadius: 10, padding: 12, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 11, color: '#666', marginTop: 2 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, borderRadius: 8, backgroundColor: '#e3f2fd' },
  tabActive: { backgroundColor: '#1565c0' },
  tabText: { fontSize: 12, color: '#1565c0', fontWeight: '500' },
  tabTextActive: { color: '#fff' },
});

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { teachingLoadAPI, departmentsAPI, teachersAPI, semestersAPI } from '../src/services/api';

const STATUS_COLORS: Record<string, { bg: string; text: string; barBg: string; label: string; icon: any }> = {
  overload: { bg: '#ffebee', text: '#c62828', barBg: '#ef5350', label: 'حمل زائد', icon: 'warning' },
  optimal: { bg: '#e8f5e9', text: '#2e7d32', barBg: '#66bb6a', label: 'مثالي', icon: 'checkmark-circle' },
  low: { bg: '#fff3e0', text: '#e65100', barBg: '#ffa726', label: 'منخفض', icon: 'trending-down' },
  none: { bg: '#f5f5f5', text: '#757575', barBg: '#bdbdbd', label: 'بدون مقررات', icon: 'remove-circle' },
};

type ReportScope = 'department' | 'teacher';

export default function TeachingLoadReport() {
  const router = useRouter();
  const [departments, setDepartments] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [semesters, setSemesters] = useState<any[]>([]);
  const [scope, setScope] = useState<ReportScope>('department');
  const [selectedSemester, setSelectedSemester] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState('');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [showTeacherDropdown, setShowTeacherDropdown] = useState(false);
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
        const active = sems.find((x: any) => x.status === 'active');
        if (active) setSelectedSemester(active.id);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (scope !== 'teacher') return;
      try {
        const res = await teachersAPI.getAll(selectedDept ? { department_id: selectedDept } : {});
        setTeachers(res.data || []);
      } catch {}
    })();
  }, [scope, selectedDept]);

  const filteredTeachers = useMemo(() => {
    if (!teacherSearch.trim()) return teachers;
    const q = teacherSearch.trim().toLowerCase();
    return teachers.filter((t: any) =>
      (t.full_name || '').toLowerCase().includes(q) ||
      (t.teacher_id || '').toLowerCase().includes(q) ||
      (t.name || '').toLowerCase().includes(q)
    );
  }, [teachers, teacherSearch]);

  const selectedTeacherObj = useMemo(
    () => teachers.find((t: any) => t.id === selectedTeacher),
    [teachers, selectedTeacher]
  );

  const selectedSemesterObj = useMemo(
    () => semesters.find((s: any) => s.id === selectedSemester),
    [semesters, selectedSemester]
  );

  const resetReport = () => { setReport(null); setHasRun(false); };

  const runReport = async () => {
    if (scope === 'department' && !selectedDept) return;
    if (scope === 'teacher' && !selectedTeacher) return;
    setLoading(true);
    try {
      const params: any = {};
      if (scope === 'department') params.department_id = selectedDept;
      if (scope === 'teacher') params.teacher_id = selectedTeacher;
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
      <ScrollView
        dataSet={{ responsiveScrollRoot: 'true' }}
        style={{ flex: 1 }}
        contentContainerStyle={st.pageScroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ============ HEADER ============ */}
        <View dataSet={{ responsive: 'page-header' }} style={st.pageHeader}>
          <View style={st.pageHeaderRight}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
              <Text dataSet={{ responsive: 'page-title' }} style={st.pageTitle}>تقارير العبء التدريسي</Text>
              {!!selectedSemesterObj && (
                <View style={st.semBadge}>
                  <Ionicons name="calendar" size={11} color="#2962ff" />
                  <Text style={st.semBadgeText}>
                    {selectedSemesterObj.name}{selectedSemesterObj.status === 'active' ? ' (النشط)' : ''}
                  </Text>
                </View>
              )}
            </View>
            <View style={st.breadcrumb}>
              <TouchableOpacity onPress={() => router.replace('/')}>
                <Text style={st.breadcrumbLink}>الرئيسية</Text>
              </TouchableOpacity>
              <Ionicons name="chevron-back" size={12} color="#8a95a8" />
              <Text style={st.breadcrumbCurrent}>تقارير العبء</Text>
            </View>
          </View>
          <View dataSet={{ responsive: 'page-header-actions' }} style={st.pageHeaderActions}>
            <TouchableOpacity style={[st.headerBtn, st.btnGhost]} onPress={() => router.back()} testID="back-btn">
              <Ionicons name="arrow-forward" size={16} color="#1a2540" />
              <Text style={st.btnGhostText}>رجوع</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ============ FILTERS CARD ============ */}
        <View style={st.filterCard}>
          <View style={st.filterCardHeader}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
              <Ionicons name="options" size={16} color="#2962ff" />
              <Text style={st.filterCardTitle}>إعدادات التقرير</Text>
            </View>
          </View>

          <View style={st.filterCardBody}>
            {/* الفصل الدراسي */}
            <View style={st.filterField}>
              <Text style={st.filterLabel}>الفصل الدراسي</Text>
              <View dataSet={{ responsive: 'chip-grid' }} style={st.chipGrid}>
                <TouchableOpacity
                  style={[st.semChip, !selectedSemester && st.semChipActive]}
                  onPress={() => { setSelectedSemester(''); resetReport(); }}
                >
                  <Text style={[st.semChipText, !selectedSemester && st.semChipTextActive]}>كل الفصول</Text>
                </TouchableOpacity>
                {semesters.map((sem: any) => {
                  const active = selectedSemester === sem.id;
                  const isCurrent = sem.status === 'active';
                  return (
                    <TouchableOpacity
                      key={sem.id}
                      style={[
                        st.semChip,
                        active && st.semChipActive,
                        isCurrent && !active && st.semChipCurrent,
                      ]}
                      onPress={() => { setSelectedSemester(sem.id); resetReport(); }}
                    >
                      {isCurrent && (
                        <View style={[st.dot, { backgroundColor: active ? '#fff' : '#4caf50' }]} />
                      )}
                      <Text style={[st.semChipText, active && st.semChipTextActive]}>
                        {sem.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* نوع التقرير */}
            <View style={st.filterField}>
              <Text style={st.filterLabel}>نوع التقرير</Text>
              <View style={st.scopeRow}>
                <TouchableOpacity
                  testID="scope-department"
                  onPress={() => { setScope('department'); setSelectedTeacher(''); resetReport(); }}
                  style={[st.scopeTab, scope === 'department' && st.scopeTabActive]}
                >
                  <Ionicons name="business" size={14} color={scope === 'department' ? '#fff' : '#2962ff'} />
                  <Text style={[st.scopeTabText, scope === 'department' && st.scopeTabTextActive]}>قسم كامل</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="scope-teacher"
                  onPress={() => { setScope('teacher'); resetReport(); }}
                  style={[st.scopeTab, scope === 'teacher' && st.scopeTabActive]}
                >
                  <Ionicons name="person" size={14} color={scope === 'teacher' ? '#fff' : '#2962ff'} />
                  <Text style={[st.scopeTabText, scope === 'teacher' && st.scopeTabTextActive]}>معلم محدد</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* القسم */}
            <View style={st.filterField}>
              <Text style={st.filterLabel}>
                القسم {scope === 'department' ? <Text style={st.required}>*</Text> : <Text style={st.hint}>(اختياري)</Text>}
              </Text>
              <View dataSet={{ responsive: 'chip-grid' }} style={st.chipGrid}>
                {scope === 'teacher' && (
                  <TouchableOpacity
                    style={[st.deptChip, !selectedDept && st.deptChipActive]}
                    onPress={() => { setSelectedDept(''); resetReport(); }}
                  >
                    <Text style={[st.deptChipText, !selectedDept && st.deptChipTextActive]}>كل الأقسام</Text>
                  </TouchableOpacity>
                )}
                {departments.map((d: any) => {
                  const active = selectedDept === d.id;
                  return (
                    <TouchableOpacity
                      key={d.id}
                      style={[st.deptChip, active && st.deptChipActive]}
                      onPress={() => { setSelectedDept(d.id); resetReport(); }}
                    >
                      <Text style={[st.deptChipText, active && st.deptChipTextActive]}>{d.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* المعلم — يظهر فقط في وضع "معلم" */}
            {scope === 'teacher' && (
              <View style={st.filterField}>
                <Text style={st.filterLabel}>المعلم <Text style={st.required}>*</Text></Text>
                <View style={st.searchWrap}>
                  <Ionicons name="search" size={16} color="#8a95a8" />
                  <TextInput
                    style={st.searchInput}
                    placeholder="ابحث باسم المعلم أو الرقم الوظيفي..."
                    placeholderTextColor="#a8b1c2"
                    value={teacherSearch}
                    onFocus={() => setShowTeacherDropdown(true)}
                    onChangeText={(v) => { setTeacherSearch(v); setShowTeacherDropdown(true); }}
                    testID="teacher-search"
                  />
                  {selectedTeacherObj && !showTeacherDropdown && (
                    <TouchableOpacity onPress={() => { setSelectedTeacher(''); setTeacherSearch(''); resetReport(); }}>
                      <Ionicons name="close-circle" size={16} color="#8a95a8" />
                    </TouchableOpacity>
                  )}
                </View>

                {selectedTeacherObj && !showTeacherDropdown && (
                  <View style={st.selectedTeacherChip}>
                    <View style={st.miniAvatar}><Text style={st.miniAvatarText}>{(selectedTeacherObj.full_name || '?').charAt(0)}</Text></View>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={st.selectedTeacherName}>{selectedTeacherObj.full_name || selectedTeacherObj.name}</Text>
                      {!!selectedTeacherObj.teacher_id && <Text style={st.selectedTeacherSub}>{selectedTeacherObj.teacher_id}</Text>}
                    </View>
                    <Ionicons name="checkmark-circle" size={20} color="#4caf50" />
                  </View>
                )}

                {showTeacherDropdown && (
                  <View style={st.teacherDropdown}>
                    <View style={st.teacherDropdownHeader}>
                      <Text style={st.teacherDropdownCount}>
                        <Text style={st.teacherDropdownAccent}>{filteredTeachers.length}</Text> معلم
                      </Text>
                      <TouchableOpacity onPress={() => setShowTeacherDropdown(false)}>
                        <Text style={st.teacherDropdownClose}>إخفاء</Text>
                      </TouchableOpacity>
                    </View>
                    <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled>
                      {filteredTeachers.length === 0 ? (
                        <View style={{ padding: 20, alignItems: 'center' }}>
                          <Text style={st.hint}>لا توجد نتائج</Text>
                        </View>
                      ) : (
                        filteredTeachers.map((t: any) => {
                          const active = selectedTeacher === t.id;
                          return (
                            <TouchableOpacity
                              key={t.id}
                              style={[st.teacherRow, active && st.teacherRowActive]}
                              onPress={() => {
                                setSelectedTeacher(t.id);
                                setTeacherSearch(t.full_name || t.name || '');
                                setShowTeacherDropdown(false);
                                resetReport();
                              }}
                              testID={`teacher-row-${t.id}`}
                            >
                              <View style={st.miniAvatar}><Text style={st.miniAvatarText}>{(t.full_name || '?').charAt(0)}</Text></View>
                              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                                <Text style={st.teacherRowName}>{t.full_name || t.name}</Text>
                                {!!t.teacher_id && <Text style={st.teacherRowSub}>{t.teacher_id}</Text>}
                              </View>
                              {active && <Ionicons name="checkmark" size={18} color="#2962ff" />}
                            </TouchableOpacity>
                          );
                        })
                      )}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}

            {/* زر التنفيذ */}
            <TouchableOpacity
              style={[st.runBtn, (loading || !canRun) && { opacity: 0.5 }]}
              onPress={runReport}
              disabled={loading || !canRun}
              testID="run-report-btn"
            >
              {loading ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={st.runBtnText}>جاري التحميل...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="analytics" size={16} color="#fff" />
                  <Text style={st.runBtnText}>{hasRun ? 'إعادة التنفيذ' : 'عرض التقرير'}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* ============ STATES ============ */}
        {loading && (
          <View style={st.emptyCard}>
            <ActivityIndicator size="large" color="#2962ff" />
            <Text style={st.emptyText}>جاري إنشاء التقرير...</Text>
          </View>
        )}

        {!loading && !report && (
          <View style={st.emptyCard}>
            <View style={st.emptyIconCircle}>
              <Ionicons name="bar-chart" size={36} color="#2962ff" />
            </View>
            <Text style={st.emptyTitle}>{canRun ? 'جاهز لعرض التقرير' : 'اختر المعايير أولاً'}</Text>
            <Text style={st.emptyText}>
              {canRun ? 'اضغط زر "عرض التقرير" لتشغيل التحليل' : (scope === 'teacher' ? 'اختر المعلم لتشغيل التحليل' : 'اختر القسم لتشغيل التحليل')}
            </Text>
          </View>
        )}

        {!loading && report && s && (
          <>
            {/* بادج فصل مؤرشف */}
            {report.is_archived && (
              <View style={st.archivedBadge} testID="archived-banner">
                <Ionicons name="archive" size={16} color="#e65100" />
                <Text style={st.archivedText}>فصل مؤرشف — البيانات مأخوذة من الأرشيف</Text>
              </View>
            )}

            {/* ============ STATS GRID ============ */}
            <View dataSet={{ responsive: 'stats-grid' }} style={st.statsGrid}>
              <StatCard color="#2962ff" icon="people" label="إجمالي المعلمين" value={s.total_teachers} sub="معلم" />
              <StatCard color="#4caf50" icon="checkmark-circle" label="لديهم عبء" value={s.teachers_with_load} sub="معلم نشط" />
              <StatCard color="#ff9800" icon="alert-circle" label="مقرر بدون معلم" value={s.courses_without_teacher} sub="يحتاج إسناد" />
              <StatCard color="#f44336" icon="warning" label="حمل زائد" value={s.overloaded_teachers} sub="معلم" />
              <StatCard color="#9c27b0" icon="speedometer" label="متوسط الساعات" value={s.average_weekly_load} sub="س/أسبوع" />
              <StatCard color="#00897b" icon="book" label="مقرر مسند" value={`${s.courses_assigned}/${s.total_courses}`} sub="من الإجمالي" />
            </View>

            {/* ============ TABS ============ */}
            <View dataSet={{ responsive: 'tabs-row' }} style={st.tabsRow}>
              <TabBtn active={activeTab === 'comparison'} onPress={() => setActiveTab('comparison')} icon="people" label="مقارنة المعلمين" badge={(report.teacher_comparison || []).length} />
              <TabBtn active={activeTab === 'unassigned_courses'} onPress={() => setActiveTab('unassigned_courses')} icon="book" label="بدون معلم" badge={s.courses_without_teacher} badgeColor="#ff9800" />
              <TabBtn active={activeTab === 'idle_teachers'} onPress={() => setActiveTab('idle_teachers')} icon="person-remove" label="بدون مقررات" badge={s.teachers_without_courses} badgeColor="#9e9e9e" />
            </View>

            {/* ============ COMPARISON TAB ============ */}
            {activeTab === 'comparison' && (
              <View style={{ gap: 10 }}>
                {(report.teacher_comparison || []).length === 0 ? (
                  <View style={st.emptyCard}>
                    <Ionicons name="people-outline" size={48} color="#cfd6e1" />
                    <Text style={st.emptyText}>لا يوجد معلمون لعرضهم</Text>
                  </View>
                ) : report.teacher_comparison.map((t: any) => {
                  const sc = STATUS_COLORS[t.status] || STATUS_COLORS.none;
                  const pct = Math.min(t.usage_percentage || 0, 100);
                  return (
                    <View key={t.teacher_id} style={st.teacherCompareCard}>
                      <View style={st.teacherCompareHeader}>
                        <View style={[st.teacherCompareAvatar, { backgroundColor: sc.barBg }]}>
                          <Text style={st.teacherCompareAvatarText}>{(t.teacher_name || '?').charAt(0)}</Text>
                        </View>
                        <View style={{ flex: 1, alignItems: 'flex-end' }}>
                          <Text style={st.teacherCompareName}>{t.teacher_name}</Text>
                          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 3 }}>
                            {!!t.employee_id && <Text style={st.teacherCompareEmpId}>{t.employee_id}</Text>}
                            <View style={st.teacherCompareDot} />
                            <Text style={st.teacherCompareCount}>{t.courses_count} مقرر</Text>
                          </View>
                        </View>
                        <View style={[st.statusBadge, { backgroundColor: sc.bg }]}>
                          <Ionicons name={sc.icon} size={12} color={sc.text} />
                          <Text style={[st.statusBadgeText, { color: sc.text }]}>{sc.label}</Text>
                        </View>
                      </View>

                      {/* Progress Bar */}
                      <View style={st.progressWrap}>
                        <View style={st.progressBg}>
                          <View style={[st.progressFill, { width: `${pct}%`, backgroundColor: sc.barBg }]} />
                        </View>
                        <View style={st.progressMeta}>
                          <Text style={[st.progressPct, { color: sc.text }]}>{pct}%</Text>
                          <Text style={st.progressHours}>
                            <Text style={st.progressHoursBold}>{t.assigned_weekly_hours}</Text>
                            {' '}من{' '}
                            <Text style={st.progressHoursBold}>{t.max_weekly_hours}</Text>
                            {' '}ساعة
                          </Text>
                        </View>
                      </View>

                      {/* Course chips */}
                      {t.courses && t.courses.length > 0 && (
                        <View style={st.coursesChipWrap}>
                          {t.courses.map((c: any, i: number) => (
                            <View key={i} style={st.courseChip}>
                              <Ionicons name="book-outline" size={11} color="#1565c0" />
                              <Text style={st.courseChipText}>
                                {c.name}
                                {c.code ? ` (${c.code})` : ''}
                                {c.section ? ` · ${c.section}` : ''}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {/* ============ UNASSIGNED COURSES TAB ============ */}
            {activeTab === 'unassigned_courses' && (
              <View style={{ gap: 10 }}>
                {(report.courses_without_teacher || []).length === 0 ? (
                  <View style={st.emptyCard}>
                    <View style={[st.emptyIconCircle, { backgroundColor: '#e8f5e9' }]}>
                      <Ionicons name="checkmark-done" size={36} color="#4caf50" />
                    </View>
                    <Text style={st.emptyTitle}>ممتاز!</Text>
                    <Text style={st.emptyText}>جميع المقررات مسندة لمعلمين</Text>
                  </View>
                ) : (
                  report.courses_without_teacher.map((c: any) => (
                    <View key={c.course_id} style={[st.itemCard, { borderRightColor: '#ff9800' }]}>
                      <View style={[st.itemIconBox, { backgroundColor: '#fff3e0' }]}>
                        <Ionicons name="book" size={20} color="#e65100" />
                      </View>
                      <View style={{ flex: 1, alignItems: 'flex-end', gap: 5 }}>
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <Text style={st.itemName}>{c.course_name}</Text>
                          {!!c.course_code && <Text style={st.itemCode}>{c.course_code}</Text>}
                        </View>
                        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 }}>
                          <View style={[st.smallBadge, { backgroundColor: '#e7f0fe' }]}>
                            <Text style={[st.smallBadgeText, { color: '#1565c0' }]}>المستوى {c.level}</Text>
                          </View>
                          {!!c.section && (
                            <View style={[st.smallBadge, { backgroundColor: '#f3e5f5' }]}>
                              <Text style={[st.smallBadgeText, { color: '#7b1fa2' }]}>شعبة {c.section}</Text>
                            </View>
                          )}
                          <View style={[st.smallBadge, { backgroundColor: '#e8f5e9' }]}>
                            <Ionicons name="people-outline" size={10} color="#2e7d32" />
                            <Text style={[st.smallBadgeText, { color: '#2e7d32' }]}>{c.students_count} طالب</Text>
                          </View>
                          <View style={[st.smallBadge, { backgroundColor: '#fff3e0' }]}>
                            <Ionicons name="time-outline" size={10} color="#e65100" />
                            <Text style={[st.smallBadgeText, { color: '#e65100' }]}>{c.credit_hours} ساعة</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}

            {/* ============ IDLE TEACHERS TAB ============ */}
            {activeTab === 'idle_teachers' && (
              <View style={{ gap: 10 }}>
                {(report.teachers_without_courses || []).length === 0 ? (
                  <View style={st.emptyCard}>
                    <View style={[st.emptyIconCircle, { backgroundColor: '#e8f5e9' }]}>
                      <Ionicons name="checkmark-done" size={36} color="#4caf50" />
                    </View>
                    <Text style={st.emptyTitle}>كل المعلمين يعملون</Text>
                    <Text style={st.emptyText}>جميع المعلمين لديهم مقررات في هذا الفصل</Text>
                  </View>
                ) : (
                  report.teachers_without_courses.map((t: any) => (
                    <TouchableOpacity
                      key={t.teacher_id}
                      style={[st.itemCard, { borderRightColor: '#9e9e9e' }]}
                      onPress={() => router.push({ pathname: '/teacher-courses', params: { teacherId: t.teacher_id, teacherName: t.teacher_name } })}
                    >
                      <View style={[st.itemIconBox, { backgroundColor: '#f5f5f5' }]}>
                        <Ionicons name="person" size={20} color="#616161" />
                      </View>
                      <View style={{ flex: 1, alignItems: 'flex-end', gap: 4 }}>
                        <Text style={st.itemName}>{t.teacher_name}</Text>
                        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 }}>
                          {!!t.employee_id && (
                            <View style={[st.smallBadge, { backgroundColor: '#f5f5f5' }]}>
                              <Text style={[st.smallBadgeText, { color: '#5b6678' }]}>{t.employee_id}</Text>
                            </View>
                          )}
                          <View style={[st.smallBadge, { backgroundColor: '#e7f0fe' }]}>
                            <Ionicons name="time-outline" size={10} color="#1565c0" />
                            <Text style={[st.smallBadgeText, { color: '#1565c0' }]}>نصاب: {t.max_weekly_hours} س</Text>
                          </View>
                        </View>
                      </View>
                      <Ionicons name="chevron-back" size={18} color="#cfd6e1" />
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ============ HELPER COMPONENTS ============
function StatCard({ color, icon, label, value, sub }: { color: string; icon: any; label: string; value: any; sub: string }) {
  return (
    <View style={st.statCard}>
      <View style={[st.statIconWrap, { backgroundColor: color }]}>
        <Ionicons name={icon} size={20} color="#fff" />
      </View>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <Text style={st.statLabel}>{label}</Text>
        <Text style={st.statValue}>{value ?? 0}</Text>
        <Text style={st.statSub}>{sub}</Text>
      </View>
    </View>
  );
}

function TabBtn({ active, onPress, icon, label, badge, badgeColor }: { active: boolean; onPress: () => void; icon: any; label: string; badge?: number; badgeColor?: string }) {
  return (
    <TouchableOpacity style={[st.tabBtn, active && st.tabBtnActive]} onPress={onPress}>
      <Ionicons name={icon} size={14} color={active ? '#fff' : '#1a2540'} />
      <Text style={[st.tabBtnText, active && st.tabBtnTextActive]}>{label}</Text>
      {typeof badge === 'number' && badge > 0 && (
        <View style={[st.tabBtnBadge, { backgroundColor: active ? 'rgba(255,255,255,0.25)' : (badgeColor || '#2962ff') }]}>
          <Text style={[st.tabBtnBadgeText, { color: active ? '#fff' : '#fff' }]}>{badge}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6fb' },
  pageScroll: { padding: 20, paddingBottom: 60, maxWidth: 1440, width: '100%', alignSelf: 'center' },

  pageHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 },
  pageHeaderRight: { alignItems: 'flex-end' },
  pageTitle: { fontSize: 24, fontWeight: '700', color: '#1a2540', textAlign: 'right', marginBottom: 6 },
  semBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: '#e7f0fe', borderWidth: 1, borderColor: '#bdd4fd', marginBottom: 6 },
  semBadgeText: { fontSize: 11, color: '#1565c0', fontWeight: '700' },
  breadcrumb: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  breadcrumbLink: { fontSize: 13, color: '#2962ff', fontWeight: '500' },
  breadcrumbCurrent: { fontSize: 13, color: '#8a95a8', fontWeight: '500' },
  pageHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 8 },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e7ee' },
  btnGhostText: { color: '#1a2540', fontSize: 13, fontWeight: '600' },

  // Filter card
  filterCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#eef1f6', marginBottom: 18 },
  filterCardHeader: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#eef1f6', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  filterCardTitle: { fontSize: 15, fontWeight: '700', color: '#1a2540' },
  filterCardBody: { padding: 16, gap: 16 },
  filterField: { gap: 8 },
  filterLabel: { fontSize: 13, fontWeight: '600', color: '#1a2540', textAlign: 'right' },
  required: { color: '#f44336' },
  hint: { fontSize: 11, color: '#a8b1c2', fontWeight: '500' },

  // Chips
  chipGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 },
  semChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1, borderColor: '#e3e7ee', backgroundColor: '#fff' },
  semChipActive: { backgroundColor: '#2962ff', borderColor: '#2962ff' },
  semChipCurrent: { borderColor: '#4caf50' },
  semChipText: { fontSize: 12, color: '#5b6678', fontWeight: '600' },
  semChipTextActive: { color: '#fff' },
  dot: { width: 6, height: 6, borderRadius: 3 },

  deptChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1, borderColor: '#e3e7ee', backgroundColor: '#fff' },
  deptChipActive: { backgroundColor: '#2962ff', borderColor: '#2962ff' },
  deptChipText: { fontSize: 12, color: '#5b6678', fontWeight: '600' },
  deptChipTextActive: { color: '#fff' },

  // Scope tabs
  scopeRow: { flexDirection: 'row-reverse', gap: 8 },
  scopeTab: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#2962ff', backgroundColor: '#fff' },
  scopeTabActive: { backgroundColor: '#2962ff' },
  scopeTabText: { fontSize: 13, color: '#2962ff', fontWeight: '600' },
  scopeTabTextActive: { color: '#fff' },

  // Search
  searchWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: '#fafbfd', borderRadius: 8, borderWidth: 1, borderColor: '#e3e7ee', paddingHorizontal: 12, height: 42 },
  searchInput: { flex: 1, fontSize: 13, color: '#1a2540', textAlign: 'right', ...Platform.select({ web: { outlineStyle: 'none' as any } }) },

  // Selected teacher chip
  selectedTeacherChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: 10, backgroundColor: '#e8f5e9', borderRadius: 10, borderWidth: 1, borderColor: '#a5d6a7' },
  selectedTeacherName: { fontSize: 13, color: '#1a2540', fontWeight: '700' },
  selectedTeacherSub: { fontSize: 11, color: '#5b6678', marginTop: 2 },

  // Teacher dropdown
  teacherDropdown: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e3e7ee' },
  teacherDropdownHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: '#eef1f6' },
  teacherDropdownCount: { fontSize: 12, color: '#5b6678' },
  teacherDropdownAccent: { color: '#2962ff', fontWeight: '700' },
  teacherDropdownClose: { fontSize: 12, color: '#2962ff', fontWeight: '600' },
  teacherRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: 10, borderBottomWidth: 1, borderBottomColor: '#f4f6fb' },
  teacherRowActive: { backgroundColor: '#e7f0fe' },
  teacherRowName: { fontSize: 13, color: '#1a2540', fontWeight: '600' },
  teacherRowSub: { fontSize: 11, color: '#8a95a8', marginTop: 2 },
  miniAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#2962ff', alignItems: 'center', justifyContent: 'center' },
  miniAvatarText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Run button
  runBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2962ff', paddingVertical: 13, borderRadius: 10 },
  runBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Empty / Loading
  emptyCard: { backgroundColor: '#fff', borderRadius: 14, padding: 40, alignItems: 'center', borderWidth: 1, borderColor: '#eef1f6', gap: 10 },
  emptyIconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#e7f0fe', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#1a2540' },
  emptyText: { fontSize: 13, color: '#8a95a8', textAlign: 'center' },

  // Archived banner
  archivedBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: '#fff3e0', borderRightWidth: 4, borderRightColor: '#e65100', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, marginBottom: 12 },
  archivedText: { fontSize: 12, color: '#bf360c', fontWeight: '700', flex: 1, textAlign: 'right' },

  // Stats Grid
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 14 },
  statCard: { flex: 1, minWidth: 180, backgroundColor: '#fff', borderRadius: 12, padding: 14, flexDirection: 'row-reverse', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#eef1f6' },
  statIconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  statLabel: { fontSize: 11, color: '#8a95a8', fontWeight: '600', marginBottom: 2 },
  statValue: { fontSize: 20, color: '#1a2540', fontWeight: '700' },
  statSub: { fontSize: 10, color: '#a8b1c2', marginTop: 2 },

  // Tabs
  tabsRow: { flexDirection: 'row-reverse', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  tabBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef1f6' },
  tabBtnActive: { backgroundColor: '#2962ff', borderColor: '#2962ff' },
  tabBtnText: { fontSize: 13, color: '#1a2540', fontWeight: '600' },
  tabBtnTextActive: { color: '#fff' },
  tabBtnBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 9, minWidth: 20, alignItems: 'center' },
  tabBtnBadgeText: { fontSize: 11, fontWeight: '700' },

  // Teacher compare card
  teacherCompareCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#eef1f6' },
  teacherCompareHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 12 },
  teacherCompareAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  teacherCompareAvatarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  teacherCompareName: { fontSize: 15, fontWeight: '700', color: '#1a2540' },
  teacherCompareEmpId: { fontSize: 11, color: '#8a95a8' },
  teacherCompareDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#cfd6e1' },
  teacherCompareCount: { fontSize: 11, color: '#5b6678' },

  statusBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },

  progressWrap: { gap: 6 },
  progressBg: { height: 10, backgroundColor: '#f0f3f7', borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: 10, borderRadius: 5 },
  progressMeta: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  progressPct: { fontSize: 13, fontWeight: '700' },
  progressHours: { fontSize: 12, color: '#5b6678' },
  progressHoursBold: { fontWeight: '700', color: '#1a2540' },

  coursesChipWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eef1f6' },
  courseChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, backgroundColor: '#e7f0fe' },
  courseChipText: { fontSize: 11, color: '#1565c0', fontWeight: '600' },

  // Item card (used for unassigned courses + idle teachers)
  itemCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#eef1f6', borderRightWidth: 4, flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  itemIconBox: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  itemName: { fontSize: 14, fontWeight: '700', color: '#1a2540' },
  itemCode: { fontSize: 12, color: '#8a95a8', fontWeight: '500' },
  smallBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  smallBadgeText: { fontSize: 11, fontWeight: '700' },
});

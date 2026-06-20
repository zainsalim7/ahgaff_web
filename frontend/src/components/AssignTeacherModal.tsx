/**
 * AssignTeacherModal — مودال إسناد معلم لمقرر مع البحث والفلترة العابرة للقسم.
 *
 * المميزات:
 * - بحث فوري بالاسم/الرقم.
 * - badge أخضر "نفس القسم" / برتقالي "قسم آخر — عابر" / رمادي "بدون قسم".
 * - فلتر toggle: "إظهار معلمي القسم فقط" (افتراضياً off لإتاحة العبور).
 * - زر "إزالة الإسناد" لمسح teacher_id.
 * - الحفظ عبر PUT /api/courses/{id} → يقوم الخادم تلقائياً بمزامنة teaching_loads.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

export interface AssignTeacherTeacher {
  id: string;
  teacher_id?: string;
  full_name: string;
  department_id?: string;
  department_ids?: string[];
  faculty_id?: string;
  faculty_name?: string;
  specialization?: string;
  academic_title?: string;
}

export interface AssignTeacherDepartment {
  id: string;
  name: string;
  faculty_id?: string;
  faculty_name?: string;
}

export interface AssignTeacherFaculty {
  id: string;
  name: string;
}

export interface BulkCourseInfo {
  id: string;
  name: string;
  code?: string;
  credit_hours?: number;
  department_id?: string;
  current_teacher_id?: string;
  current_teacher_name?: string;
  level?: number | string;
  section?: string;
}

export interface BulkResultItem {
  course_id: string;
  course_name: string;
  ok: boolean;
  error?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  courseId: string;
  courseName?: string;
  courseDepartmentId?: string;
  /** Course extra context — displayed at modal top so user knows what they're assigning. */
  courseCode?: string;
  courseLevel?: number | string;
  courseSection?: string;
  currentTeacherId?: string;
  teachers: AssignTeacherTeacher[];
  departments: AssignTeacherDepartment[];
  /** Faculties for course/teacher context lookup. */
  faculties?: AssignTeacherFaculty[];
  onSaved: (newTeacherId: string | null, teacherName: string) => void;
  /** Form mode: skip API call, only return selection to caller (for embedded use in forms). */
  formMode?: boolean;
  /** Bulk mode: a list of courses to assign at once. If non-empty, modal switches to bulk UI. */
  bulkCourses?: BulkCourseInfo[];
  /** Callback when bulk save completes — passes per-course results so caller updates the table. */
  onBulkSaved?: (newTeacherId: string | null, teacherName: string, results: BulkResultItem[]) => void;
  /** Current teaching load (sum of weekly_hours) per teacher in the active semester. */
  teacherCurrentLoadMap?: Record<string, number>;
}

export function AssignTeacherModal({
  visible,
  onClose,
  courseId,
  courseName,
  courseDepartmentId,
  courseCode,
  courseLevel,
  courseSection,
  currentTeacherId,
  teachers,
  departments,
  faculties = [],
  onSaved,
  formMode = false,
  bulkCourses,
  onBulkSaved,
  teacherCurrentLoadMap = {},
}: Props) {
  const isBulk = !!(bulkCourses && bulkCourses.length > 0);
  const [query, setQuery] = useState('');
  const [pickedId, setPickedId] = useState<string>('');
  const [sameDeptOnly, setSameDeptOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  // Bulk options
  const [skipAlreadyAssigned, setSkipAlreadyAssigned] = useState(false);
  const [customWeeklyHours, setCustomWeeklyHours] = useState<string>('');
  const [bulkResults, setBulkResults] = useState<BulkResultItem[] | null>(null);

  useEffect(() => {
    if (visible) {
      setPickedId(isBulk ? '' : (currentTeacherId || ''));
      setQuery('');
      setSameDeptOnly(false);
      setSkipAlreadyAssigned(false);
      setCustomWeeklyHours('');
      setBulkResults(null);
    }
  }, [visible, currentTeacherId, isBulk]);

  const deptNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of departments) map[d.id] = d.name;
    return map;
  }, [departments]);

  const facultyNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const f of faculties) map[f.id] = f.name;
    return map;
  }, [faculties]);

  /** map department_id → faculty_name (للبحث السريع) */
  const deptToFacultyName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of departments) {
      if (d.faculty_name) map[d.id] = d.faculty_name;
      else if (d.faculty_id && facultyNameById[d.faculty_id]) map[d.id] = facultyNameById[d.faculty_id];
    }
    return map;
  }, [departments, facultyNameById]);

  const getTeacherDeptName = (t: AssignTeacherTeacher) => {
    const ids = t.department_ids && t.department_ids.length > 0
      ? t.department_ids
      : (t.department_id ? [t.department_id] : []);
    return ids.map(id => deptNameById[id]).filter(Boolean).join(' / ');
  };

  /** كلية المعلم: من faculty_id مباشرة أو عبر القسم */
  const getTeacherFacultyName = (t: AssignTeacherTeacher): string => {
    if (t.faculty_name) return t.faculty_name;
    if (t.faculty_id && facultyNameById[t.faculty_id]) return facultyNameById[t.faculty_id];
    const primaryDept = t.department_id || (t.department_ids && t.department_ids[0]);
    if (primaryDept && deptToFacultyName[primaryDept]) return deptToFacultyName[primaryDept];
    return '';
  };

  /** كلية المقرر: lookup عبر courseDepartmentId */
  const courseFacultyName = useMemo((): string => {
    if (!courseDepartmentId) return '';
    return deptToFacultyName[courseDepartmentId] || '';
  }, [courseDepartmentId, deptToFacultyName]);

  const courseDepartmentName = useMemo((): string => {
    if (!courseDepartmentId) return '';
    return deptNameById[courseDepartmentId] || '';
  }, [courseDepartmentId, deptNameById]);

  const isSameDept = (t: AssignTeacherTeacher) => {
    if (!courseDepartmentId) return false;
    const ids = t.department_ids && t.department_ids.length > 0
      ? t.department_ids
      : (t.department_id ? [t.department_id] : []);
    return ids.includes(courseDepartmentId);
  };

  const teacherDeptIds = (t: AssignTeacherTeacher) => (
    t.department_ids && t.department_ids.length > 0
      ? t.department_ids
      : (t.department_id ? [t.department_id] : [])
  );

  // 🔧 تحليل المقررات الجماعية مقابل المعلم المختار
  const pickedTeacher = teachers.find(t => t.id === pickedId);
  const bulkAnalysis = useMemo(() => {
    if (!isBulk || !pickedTeacher || !bulkCourses) {
      return null;
    }
    const ids = teacherDeptIds(pickedTeacher);
    let sameDeptCount = 0;
    let crossDeptCount = 0;
    let alreadyAssignedCount = 0;
    let alreadyAssignedToPicked = 0;
    let totalHoursAdded = 0;
    const custom = customWeeklyHours ? parseFloat(customWeeklyHours) : NaN;
    for (const c of bulkCourses) {
      const willSkip = skipAlreadyAssigned && !!c.current_teacher_id && c.current_teacher_id !== pickedId;
      if (c.current_teacher_id) {
        alreadyAssignedCount++;
        if (c.current_teacher_id === pickedId) alreadyAssignedToPicked++;
      }
      if (willSkip) continue;
      if (c.department_id && ids.includes(c.department_id)) sameDeptCount++;
      else if (c.department_id) crossDeptCount++;
      const hours = !isNaN(custom) ? custom : (c.credit_hours ?? 3);
      totalHoursAdded += hours;
    }
    const currentLoad = teacherCurrentLoadMap[pickedId] || 0;
    const maxHours = (teachers.find(t => t.id === pickedId) as any)?.weekly_hours ?? 12;
    return {
      sameDeptCount,
      crossDeptCount,
      alreadyAssignedCount,
      alreadyAssignedToPicked,
      totalHoursAdded,
      currentLoad,
      projectedTotal: currentLoad + totalHoursAdded,
      maxHours,
      overload: (currentLoad + totalHoursAdded) > maxHours,
      coursesToProcess: bulkCourses.length - (skipAlreadyAssigned ? bulkCourses.filter(c => c.current_teacher_id && c.current_teacher_id !== pickedId).length : 0),
    };
  }, [isBulk, pickedTeacher, bulkCourses, pickedId, skipAlreadyAssigned, customWeeklyHours, teacherCurrentLoadMap, teachers]);

  const filtered = useMemo(() => {
    const q = query.trim();
    let list = teachers;
    // In bulk mode, same-dept filter is disabled (each course has own dept)
    if (!isBulk && sameDeptOnly && courseDepartmentId) {
      list = list.filter(isSameDept);
    }
    if (q) {
      list = list.filter(t =>
        t.full_name?.includes(q) || t.teacher_id?.includes(q)
      );
    }
    return [...list].sort((a, b) => {
      if (!isBulk) {
        const aSame = isSameDept(a) ? 0 : 1;
        const bSame = isSameDept(b) ? 0 : 1;
        if (aSame !== bSame) return aSame - bSame;
      }
      return a.full_name.localeCompare(b.full_name, 'ar');
    });
  }, [teachers, query, sameDeptOnly, courseDepartmentId, deptNameById, isBulk]);

  const showMsg = (title: string, message: string) => {
    if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
    else Alert.alert(title, message);
  };

  const handleBulkSave = async () => {
    if (!bulkCourses || bulkCourses.length === 0) return;
    if (!bulkAnalysis) return;

    const teacherName = pickedTeacher?.full_name || '';
    const custom = customWeeklyHours ? parseFloat(customWeeklyHours) : NaN;

    // Build list of courses to update (respecting skipAlreadyAssigned)
    const targets = bulkCourses.filter(c => {
      if (skipAlreadyAssigned && c.current_teacher_id && c.current_teacher_id !== pickedId) return false;
      return true;
    });

    // Confirmation: cross-dept + overload + total count
    const parts: string[] = [];
    parts.push(`سيتم إسناد المعلم "${teacherName || 'بدون معلم'}" لـ ${targets.length} مقرر.`);
    if (bulkAnalysis.crossDeptCount > 0) {
      parts.push(`⚠️ ${bulkAnalysis.crossDeptCount} مقرر عابر للقسم.`);
    }
    if (bulkAnalysis.overload) {
      parts.push(`⚠️ ساعات المعلم ستصبح ${bulkAnalysis.projectedTotal} (الحد الأقصى ${bulkAnalysis.maxHours}).`);
    }
    parts.push('هل تريد المتابعة؟');
    const confirmMsg = parts.join('\n\n');
    const ok = Platform.OS === 'web' ? window.confirm(confirmMsg) : await new Promise<boolean>(resolve => {
      Alert.alert('تأكيد الإسناد الجماعي', confirmMsg, [
        { text: 'إلغاء', style: 'cancel', onPress: () => resolve(false) },
        { text: 'تأكيد', onPress: () => resolve(true) },
      ]);
    });
    if (!ok) return;

    try {
      setSaving(true);
      const payload: any = { teacher_id: pickedId || null };
      if (!isNaN(custom) && pickedId) payload.weekly_hours = custom;

      // Execute in parallel; collect per-course results
      const settled = await Promise.allSettled(
        targets.map(c => api.put(`/courses/${c.id}`, payload))
      );
      const results: BulkResultItem[] = targets.map((c, i) => {
        const r = settled[i];
        if (r.status === 'fulfilled') return { course_id: c.id, course_name: c.name, ok: true };
        const reason: any = (r as PromiseRejectedResult).reason;
        return {
          course_id: c.id,
          course_name: c.name,
          ok: false,
          error: reason?.response?.data?.detail || reason?.message || 'فشل غير معروف',
        };
      });
      setBulkResults(results);
      if (onBulkSaved) onBulkSaved(pickedId || null, teacherName, results);
    } catch (e: any) {
      showMsg('خطأ', e?.message || 'فشل التنفيذ');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (isBulk) return handleBulkSave();
    if (!courseId) return;
    // Detect cross-dept assignment for confirmation
    const target = teachers.find(t => t.id === pickedId);
    if (target && courseDepartmentId && !isSameDept(target)) {
      const teacherDept = getTeacherDeptName(target) || 'غير معروف';
      const confirmMsg = `المعلم "${target.full_name}" ينتمي لقسم "${teacherDept}" — هل تؤكد الإسناد العابر للقسم؟`;
      const ok = Platform.OS === 'web' ? window.confirm(confirmMsg) : await new Promise<boolean>(resolve => {
        Alert.alert('إسناد عابر للقسم', confirmMsg, [
          { text: 'إلغاء', style: 'cancel', onPress: () => resolve(false) },
          { text: 'تأكيد', onPress: () => resolve(true) },
        ]);
      });
      if (!ok) return;
    }

    try {
      setSaving(true);
      if (formMode) {
        // وضع النموذج: لا نحفظ على الخادم — فقط نُرجع الاختيار
        const name = pickedId ? (teachers.find(t => t.id === pickedId)?.full_name || '') : '';
        onSaved(pickedId || null, name);
        onClose();
        return;
      }
      await api.put(`/courses/${courseId}`, { teacher_id: pickedId || null });
      const name = pickedId ? (teachers.find(t => t.id === pickedId)?.full_name || '') : '';
      onSaved(pickedId || null, name);
      onClose();
    } catch (e: any) {
      showMsg('خطأ', e?.response?.data?.detail || 'فشل حفظ الإسناد');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.card} testID="assign-teacher-modal">
          <View style={styles.header}>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={styles.title}>
                {isBulk ? `إسناد جماعي لـ ${bulkCourses!.length} مقرر` : 'إسناد معلم للمقرر'}
              </Text>
              {isBulk ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {bulkCourses!.slice(0, 3).map(c => c.name).join('، ')}
                  {bulkCourses!.length > 3 ? ` +${bulkCourses!.length - 3}` : ''}
                </Text>
              ) : (!!courseName && <Text style={styles.subtitle} numberOfLines={1}>{courseName}</Text>)}
            </View>
            <TouchableOpacity onPress={onClose} testID="close-assign-teacher-modal">
              <Ionicons name="close" size={22} color="#5b6678" />
            </TouchableOpacity>
          </View>

          {/* 🔧 بطاقة معلومات المقرر — الكلية / القسم / المستوى / الشعبة / الكود */}
          {!isBulk && (courseFacultyName || courseDepartmentName || courseLevel || courseSection || courseCode) && (
            <View style={styles.courseInfoCard} testID="course-info-card">
              {!!courseFacultyName && (
                <View style={styles.infoChip}>
                  <Ionicons name="school-outline" size={11} color="#1565c0" />
                  <Text style={styles.infoChipLabel}>الكلية:</Text>
                  <Text style={styles.infoChipValue} numberOfLines={1}>{courseFacultyName}</Text>
                </View>
              )}
              {!!courseDepartmentName && (
                <View style={styles.infoChip}>
                  <Ionicons name="business-outline" size={11} color="#6a1b9a" />
                  <Text style={styles.infoChipLabel}>القسم:</Text>
                  <Text style={styles.infoChipValue} numberOfLines={1}>{courseDepartmentName}</Text>
                </View>
              )}
              {!!courseLevel && (
                <View style={styles.infoChip}>
                  <Ionicons name="layers-outline" size={11} color="#0277bd" />
                  <Text style={styles.infoChipLabel}>المستوى:</Text>
                  <Text style={styles.infoChipValue}>{courseLevel}</Text>
                </View>
              )}
              {!!courseSection && (
                <View style={styles.infoChip}>
                  <Ionicons name="people-outline" size={11} color="#558b2f" />
                  <Text style={styles.infoChipLabel}>الشعبة:</Text>
                  <Text style={styles.infoChipValue}>{courseSection}</Text>
                </View>
              )}
              {!!courseCode && (
                <View style={styles.infoChip}>
                  <Ionicons name="barcode-outline" size={11} color="#5b6678" />
                  <Text style={styles.infoChipValue}>{courseCode}</Text>
                </View>
              )}
            </View>
          )}

          {/* عرض نتائج التنفيذ الجماعي بعد الحفظ */}
          {isBulk && bulkResults ? (
            <ScrollView style={styles.bulkResultsBox} contentContainerStyle={{ padding: 16 }}>
              <View style={styles.bulkResultsSummary}>
                <Ionicons name="checkmark-circle" size={20} color="#1b5e20" />
                <Text style={styles.bulkResultsSummaryText}>
                  نجح: {bulkResults.filter(r => r.ok).length}/{bulkResults.length}
                </Text>
                {bulkResults.some(r => !r.ok) && (
                  <Text style={[styles.bulkResultsSummaryText, { color: '#bf360c' }]}>
                    فشل: {bulkResults.filter(r => !r.ok).length}
                  </Text>
                )}
              </View>
              {bulkResults.map(r => (
                <View key={r.course_id} style={styles.bulkResultRow}>
                  <Ionicons
                    name={r.ok ? 'checkmark-circle' : 'close-circle'}
                    size={16}
                    color={r.ok ? '#1b5e20' : '#c62828'}
                  />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={styles.bulkResultName}>{r.course_name}</Text>
                    {!r.ok && !!r.error && <Text style={styles.bulkResultErr}>{r.error}</Text>}
                  </View>
                </View>
              ))}
            </ScrollView>
          ) : (
          <>
          {/* البحث */}
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color="#8a95a8" />
            <TextInput
              style={styles.searchInput}
              placeholder="ابحث بالاسم أو رقم المعلم..."
              placeholderTextColor="#a8b1c2"
              value={query}
              onChangeText={setQuery}
              testID="teacher-search-input"
            />
            {!!query && (
              <TouchableOpacity onPress={() => setQuery('')} testID="clear-search-btn">
                <Ionicons name="close-circle" size={16} color="#a8b1c2" />
              </TouchableOpacity>
            )}
          </View>

          {/* فلتر نفس القسم — يُخفى في الوضع الجماعي (كل مقرر له قسم مختلف) */}
          {!isBulk && !!courseDepartmentId && (
            <TouchableOpacity
              style={styles.filterToggle}
              onPress={() => setSameDeptOnly(v => !v)}
              testID="same-dept-toggle"
            >
              <Ionicons
                name={sameDeptOnly ? 'checkbox' : 'square-outline'}
                size={16}
                color={sameDeptOnly ? '#2962ff' : '#8a95a8'}
              />
              <Text style={styles.filterToggleText}>إظهار معلمي القسم فقط</Text>
            </TouchableOpacity>
          )}

          {/* 🔧 خيارات الإسناد الجماعي */}
          {isBulk && (
            <View style={styles.bulkOptions}>
              <TouchableOpacity
                style={styles.bulkOptionRow}
                onPress={() => setSkipAlreadyAssigned(v => !v)}
                testID="skip-assigned-toggle"
              >
                <Ionicons
                  name={skipAlreadyAssigned ? 'checkbox' : 'square-outline'}
                  size={16}
                  color={skipAlreadyAssigned ? '#2962ff' : '#8a95a8'}
                />
                <Text style={styles.bulkOptionText}>تجاوز المقررات المُسندة سلفاً لمعلم آخر</Text>
              </TouchableOpacity>
              <View style={styles.bulkOptionRow}>
                <TextInput
                  style={styles.bulkHoursInput}
                  placeholder="مثل: 3"
                  placeholderTextColor="#a8b1c2"
                  value={customWeeklyHours}
                  onChangeText={setCustomWeeklyHours}
                  keyboardType="numeric"
                  testID="custom-weekly-hours-input"
                />
                <Text style={styles.bulkOptionText}>ساعات أسبوعية مخصصة (اختياري — افتراضي: ساعات المقرر)</Text>
              </View>
            </View>
          )}

          {/* القائمة */}
          <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 8 }}>
            {/* خيار "بدون معلم" */}
            <TouchableOpacity
              style={[styles.row, pickedId === '' && styles.rowActive]}
              onPress={() => setPickedId('')}
              testID="pick-no-teacher"
            >
              <Ionicons
                name={pickedId === '' ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={pickedId === '' ? '#e53935' : '#a8b1c2'}
              />
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={[styles.rowName, { color: '#e53935' }]}>إزالة الإسناد (بدون معلم)</Text>
              </View>
            </TouchableOpacity>

            {filtered.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="person-outline" size={32} color="#cfd6e1" />
                <Text style={styles.emptyText}>
                  {query ? 'لا يوجد معلم مطابق' : 'لا توجد نتائج'}
                </Text>
              </View>
            ) : (
              filtered.map((t) => {
                const same = isSameDept(t);
                const deptName = getTeacherDeptName(t);
                const facultyName = getTeacherFacultyName(t);
                const isPicked = t.id === pickedId;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.row, isPicked && styles.rowActive]}
                    onPress={() => setPickedId(t.id)}
                    testID={`pick-teacher-${t.id}`}
                  >
                    <Ionicons
                      name={isPicked ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={isPicked ? '#2962ff' : '#a8b1c2'}
                    />
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <View style={styles.rowTopLine}>
                        {courseDepartmentId ? (
                          same ? (
                            <View style={[styles.badge, styles.badgeSame]}>
                              <Ionicons name="checkmark-circle" size={10} color="#1b5e20" />
                              <Text style={[styles.badgeText, { color: '#1b5e20' }]}>نفس القسم</Text>
                            </View>
                          ) : (
                            <View style={[styles.badge, styles.badgeCross]}>
                              <Ionicons name="swap-horizontal" size={10} color="#bf360c" />
                              <Text style={[styles.badgeText, { color: '#bf360c' }]}>عابر للقسم</Text>
                            </View>
                          )
                        ) : null}
                        <Text style={styles.rowName} numberOfLines={1}>{t.full_name}</Text>
                      </View>
                      <View style={styles.rowMetaLine}>
                        {!!t.teacher_id && <Text style={styles.rowMeta}>#{t.teacher_id}</Text>}
                        {!!facultyName && (
                          <View style={styles.metaPair}>
                            <Ionicons name="school-outline" size={10} color="#1565c0" />
                            <Text style={[styles.rowMeta, { color: '#1565c0' }]}>{facultyName}</Text>
                          </View>
                        )}
                        {!!deptName && (
                          <View style={styles.metaPair}>
                            <Ionicons name="business-outline" size={10} color="#6a1b9a" />
                            <Text style={[styles.rowMeta, { color: '#6a1b9a' }]} numberOfLines={1}>{deptName}</Text>
                          </View>
                        )}
                        {!!t.specialization && (
                          <Text style={[styles.rowMeta, { fontStyle: 'italic' }]}>{t.specialization}</Text>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
          </>
          )}

          {/* 🔧 ملخص الإسناد الجماعي قبل الحفظ */}
          {isBulk && !bulkResults && bulkAnalysis && pickedTeacher && (
            <View style={styles.bulkSummary}>
              <View style={styles.bulkSummaryRow}>
                <Text style={styles.bulkSummaryValue}>{bulkAnalysis.coursesToProcess}</Text>
                <Text style={styles.bulkSummaryLabel}>سيتم إسنادها:</Text>
              </View>
              {bulkAnalysis.sameDeptCount > 0 && (
                <View style={styles.bulkSummaryRow}>
                  <View style={[styles.badge, styles.badgeSame]}>
                    <Text style={[styles.badgeText, { color: '#1b5e20' }]}>{bulkAnalysis.sameDeptCount} نفس القسم</Text>
                  </View>
                </View>
              )}
              {bulkAnalysis.crossDeptCount > 0 && (
                <View style={styles.bulkSummaryRow}>
                  <View style={[styles.badge, styles.badgeCross]}>
                    <Text style={[styles.badgeText, { color: '#bf360c' }]}>{bulkAnalysis.crossDeptCount} عابر للقسم</Text>
                  </View>
                </View>
              )}
              {bulkAnalysis.alreadyAssignedCount > 0 && (
                <View style={styles.bulkSummaryRow}>
                  <Text style={styles.bulkSummaryWarn}>
                    ⚠️ {bulkAnalysis.alreadyAssignedCount} مقرر مُسند سلفاً
                    {bulkAnalysis.alreadyAssignedToPicked > 0 ? ` (${bulkAnalysis.alreadyAssignedToPicked} لنفس المعلم)` : ''}
                  </Text>
                </View>
              )}
              {pickedId && (
                <View style={[styles.bulkSummaryRow, styles.bulkLoadRow, bulkAnalysis.overload && styles.bulkLoadOverload]}>
                  <Text style={[styles.bulkSummaryValue, bulkAnalysis.overload && { color: '#c62828' }]}>
                    {bulkAnalysis.projectedTotal} / {bulkAnalysis.maxHours} ساعة
                  </Text>
                  <Text style={styles.bulkSummaryLabel}>
                    عبء المعلم بعد الإسناد:
                  </Text>
                </View>
              )}
              {bulkAnalysis.overload && (
                <Text style={styles.bulkOverloadText}>
                  ⚠️ تجاوز الحد الأقصى لساعات المعلم بـ {bulkAnalysis.projectedTotal - bulkAnalysis.maxHours} ساعة
                </Text>
              )}
            </View>
          )}

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.btn, styles.btnGhost]}
              onPress={onClose}
              disabled={saving}
              testID="cancel-assign-btn"
            >
              <Text style={styles.btnGhostText}>{bulkResults ? 'إغلاق' : 'إلغاء'}</Text>
            </TouchableOpacity>
            {!bulkResults && (
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, saving && { opacity: 0.6 }, isBulk && !pickedId && { opacity: 0.5 }]}
                onPress={handleSave}
                disabled={saving || (isBulk && !pickedId && !bulkCourses?.some(c => c.current_teacher_id))}
                testID="save-assign-teacher-btn"
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name={isBulk ? 'people' : 'checkmark'} size={16} color="#fff" />
                    <Text style={styles.btnPrimaryText}>
                      {isBulk
                        ? (pickedId ? `إسناد لـ ${bulkAnalysis?.coursesToProcess ?? bulkCourses!.length} مقرر` : `إلغاء إسناد ${bulkCourses!.filter(c => c.current_teacher_id).length} مقرر`)
                        : 'حفظ'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '90%', display: 'flex', overflow: 'hidden' },
  header: { flexDirection: 'row-reverse', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eef1f5' },
  title: { fontSize: 16, fontWeight: '700', color: '#1f2a37', textAlign: 'right' },
  subtitle: { fontSize: 12, color: '#5b6678', marginTop: 2, textAlign: 'right' },
  // 🔧 بطاقة معلومات المقرر — chips متعددة الألوان
  courseInfoCard: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#eef1f5',
  },
  infoChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#f6f8fb',
    borderWidth: 1,
    borderColor: '#e3e7ee',
  },
  infoChipLabel: { fontSize: 10, color: '#8a95a8', fontWeight: '600' },
  infoChipValue: { fontSize: 11, color: '#1f2a37', fontWeight: '700', maxWidth: 200 },
  metaPair: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3 },
  searchBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, marginHorizontal: 16, marginTop: 12, backgroundColor: '#f6f8fb', borderRadius: 8, borderWidth: 1, borderColor: '#eef1f5' },
  searchInput: { flex: 1, fontSize: 13, color: '#1f2a37', textAlign: 'right', paddingVertical: 4, outlineWidth: 0 as any },
  filterToggle: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, padding: 12, marginHorizontal: 16, marginTop: 8, backgroundColor: '#f6f8fb', borderRadius: 8 },
  filterToggleText: { fontSize: 12, color: '#1f2a37' },
  list: { marginTop: 8, paddingHorizontal: 16, maxHeight: 380 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#eef1f5', marginBottom: 6 },
  rowActive: { borderColor: '#2962ff', backgroundColor: '#eef4ff' },
  rowTopLine: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  rowMetaLine: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' },
  rowName: { fontSize: 14, fontWeight: '700', color: '#1f2a37', textAlign: 'right' },
  rowMeta: { fontSize: 11, color: '#5b6678' },
  badge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeSame: { backgroundColor: '#e8f5e9' },
  badgeCross: { backgroundColor: '#ffebe9' },
  badgeText: { fontSize: 10, fontWeight: '700' },
  empty: { alignItems: 'center', padding: 24, gap: 8 },
  emptyText: { fontSize: 12, color: '#8a95a8' },
  footer: { flexDirection: 'row-reverse', justifyContent: 'flex-end', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: '#eef1f5' },
  btn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  btnPrimary: { backgroundColor: '#2962ff' },
  btnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  btnGhost: { backgroundColor: '#f6f8fb', borderWidth: 1, borderColor: '#eef1f5' },
  btnGhostText: { color: '#5b6678', fontSize: 13, fontWeight: '700' },
  // 🔧 الإسناد الجماعي
  bulkOptions: { marginHorizontal: 16, marginTop: 8, gap: 8 },
  bulkOptionRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, padding: 10, backgroundColor: '#f6f8fb', borderRadius: 8 },
  bulkOptionText: { fontSize: 12, color: '#1f2a37', flex: 1, textAlign: 'right' },
  bulkHoursInput: { width: 60, fontSize: 13, color: '#1f2a37', textAlign: 'center', paddingVertical: 4, paddingHorizontal: 6, borderWidth: 1, borderColor: '#e3e7ee', borderRadius: 6, backgroundColor: '#fff', outlineWidth: 0 as any },
  bulkSummary: { marginHorizontal: 16, marginTop: 10, padding: 12, backgroundColor: '#f8fafc', borderRadius: 8, borderWidth: 1, borderColor: '#e3e7ee', gap: 6 },
  bulkSummaryRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  bulkSummaryLabel: { fontSize: 12, color: '#5b6678' },
  bulkSummaryValue: { fontSize: 14, color: '#1f2a37', fontWeight: '700' },
  bulkSummaryWarn: { fontSize: 11, color: '#bf360c' },
  bulkLoadRow: { paddingTop: 6, borderTopWidth: 1, borderTopColor: '#eef1f5', marginTop: 4 },
  bulkLoadOverload: { backgroundColor: '#fff1f0', marginHorizontal: -4, paddingHorizontal: 8, borderRadius: 4 },
  bulkOverloadText: { fontSize: 11, color: '#c62828', fontWeight: '700', textAlign: 'right' },
  bulkResultsBox: { maxHeight: 380 },
  bulkResultsSummary: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: 10, backgroundColor: '#f1f8f4', borderRadius: 8, marginBottom: 10 },
  bulkResultsSummaryText: { fontSize: 13, color: '#1b5e20', fontWeight: '700' },
  bulkResultRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#eef1f5' },
  bulkResultName: { fontSize: 13, color: '#1f2a37', textAlign: 'right', fontWeight: '600' },
  bulkResultErr: { fontSize: 11, color: '#c62828', marginTop: 2, textAlign: 'right' },
});

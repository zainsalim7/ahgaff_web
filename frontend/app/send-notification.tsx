import { goBack } from '../src/utils/navigation';
import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform, Alert, FlatList, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import api, { facultiesAPI, departmentsAPI, coursesAPI } from '../src/services/api';
import { CourseFilter } from '../src/components/CourseFilter';

type TargetType = 'all' | 'role' | 'faculty' | 'department' | 'level' | 'section' | 'course' | 'teacher' | 'student';

const TARGET_OPTIONS: { value: TargetType; label: string; icon: string }[] = [
  { value: 'all', label: 'الجميع', icon: 'people' },
  { value: 'role', label: 'حسب الدور', icon: 'shield' },
  { value: 'faculty', label: 'كلية كاملة', icon: 'business' },
  { value: 'department', label: 'قسم كامل', icon: 'school' },
  { value: 'level', label: 'مستوى محدد', icon: 'layers' },
  { value: 'section', label: 'شعبة محددة', icon: 'grid' },
  { value: 'course', label: 'طلاب مقرر', icon: 'book' },
  { value: 'teacher', label: 'معلم محدد', icon: 'person' },
  { value: 'student', label: 'طالب محدد', icon: 'person-circle' },
];

export default function SendNotification() {
  const router = useRouter();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetType, setTargetType] = useState<TargetType>('all');
  const [selectedRole, setSelectedRole] = useState('');
  const [sending, setSending] = useState(false);

  const canSend = user?.role === 'admin' ||
    user?.permissions?.includes('send_notifications') ||
    user?.permissions?.includes('manage_notifications');

  // Cascading data
  const [faculties, setFaculties] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [metaLoading, setMetaLoading] = useState(true);

  // Selected cascading values
  const [selFaculty, setSelFaculty] = useState('');
  const [selDept, setSelDept] = useState('');
  const [selLevel, setSelLevel] = useState<string>('');
  const [selSection, setSelSection] = useState('');
  const [selCourse, setSelCourse] = useState('');

  // Teacher / Student picker (search modal)
  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [teacherQuery, setTeacherQuery] = useState('');
  const [teachersList, setTeachersList] = useState<any[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<any>(null);

  const [showStudentModal, setShowStudentModal] = useState(false);
  const [studentQuery, setStudentQuery] = useState('');
  const [studentsList, setStudentsList] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);

  // Audience preview
  const [previewCount, setPreviewCount] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    if (!canSend) {
      if (Platform.OS === 'web') {
        window.alert('ليس لديك صلاحية إرسال الإشعارات');
        goBack(router);
      } else {
        Alert.alert('غير مصرح', 'ليس لديك صلاحية إرسال الإشعارات', [
          { text: 'رجوع', onPress: () => goBack(router) }
        ]);
      }
    }
  }, [user, canSend]);

  // Load metadata
  useEffect(() => {
    (async () => {
      setMetaLoading(true);
      try {
        const [fRes, dRes, cRes] = await Promise.all([
          facultiesAPI.getAll(),
          departmentsAPI.getAll(),
          coursesAPI.getAll(),
        ]);
        setFaculties(fRes.data || []);
        setDepartments(dRes.data || []);
        setCourses(cRes.data || []);
      } catch (e) { console.error(e); }
      finally { setMetaLoading(false); }
    })();
  }, []);

  // Search teachers (debounced)
  useEffect(() => {
    if (!showTeacherModal) return;
    const t = setTimeout(async () => {
      try {
        const q = teacherQuery.trim();
        if (q.length === 0) {
          setTeachersList([]);
          return;
        }
        const res = await api.get(`/notifications/search-teachers?q=${encodeURIComponent(q)}`);
        setTeachersList(res.data || []);
      } catch (e) { console.error(e); }
    }, 250);
    return () => clearTimeout(t);
  }, [teacherQuery, showTeacherModal]);

  // Search students (debounced)
  useEffect(() => {
    if (!showStudentModal) return;
    const t = setTimeout(async () => {
      try {
        const q = studentQuery.trim();
        if (q.length === 0) {
          setStudentsList([]);
          return;
        }
        const res = await api.get(`/notifications/search-students?q=${encodeURIComponent(q)}`);
        setStudentsList(res.data || []);
      } catch (e) { console.error(e); }
    }, 250);
    return () => clearTimeout(t);
  }, [studentQuery, showStudentModal]);

  // Filtered cascades
  const filteredDepts = useMemo(
    () => departments.filter(d => !selFaculty || d.faculty_id === selFaculty),
    [departments, selFaculty]
  );

  // Available levels & sections from students data — derive from courses for now
  const availableLevels = useMemo(() => {
    const levels = new Set<number>();
    courses
      .filter(c => (!selFaculty || c.faculty_id === selFaculty) && (!selDept || c.department_id === selDept))
      .forEach(c => c.level && levels.add(c.level));
    return Array.from(levels).sort();
  }, [courses, selFaculty, selDept]);

  const availableSections = useMemo(() => {
    const sects = new Set<string>();
    courses
      .filter(c =>
        (!selFaculty || c.faculty_id === selFaculty) &&
        (!selDept || c.department_id === selDept) &&
        (!selLevel || String(c.level) === selLevel)
      )
      .forEach(c => c.section && sects.add(c.section));
    return Array.from(sects).sort();
  }, [courses, selFaculty, selDept, selLevel]);

  // Reset previewCount when target changes
  useEffect(() => { setPreviewCount(null); }, [targetType, selFaculty, selDept, selLevel, selSection, selCourse, selectedTeacher, selectedStudent, selectedRole]);

  const buildPayload = () => {
    const payload: any = { title, body, target_type: targetType };
    if (targetType === 'role') payload.target_role = selectedRole;
    else if (targetType === 'course') payload.course_id = selCourse;
    else if (targetType === 'teacher') payload.teacher_user_id = selectedTeacher?.user_id;
    else if (targetType === 'student') {
      payload.student_user_id = selectedStudent?.user_id;
      payload.student_name = selectedStudent?.full_name;
    }
    else if (targetType === 'faculty') {
      payload.faculty_id = selFaculty;
    } else if (targetType === 'department') {
      payload.faculty_id = selFaculty || undefined;
      payload.department_id = selDept;
    } else if (targetType === 'level') {
      payload.faculty_id = selFaculty || undefined;
      payload.department_id = selDept || undefined;
      payload.level = selLevel ? parseInt(selLevel) : undefined;
    } else if (targetType === 'section') {
      payload.faculty_id = selFaculty || undefined;
      payload.department_id = selDept || undefined;
      payload.level = selLevel ? parseInt(selLevel) : undefined;
      payload.section = selSection;
    }
    return payload;
  };

  const validate = (): string | null => {
    if (!title.trim() || !body.trim()) return 'يرجى كتابة العنوان والرسالة';
    if (targetType === 'role' && !selectedRole) return 'اختر الدور';
    if (targetType === 'course' && !selCourse) return 'اختر المقرر';
    if (targetType === 'teacher' && !selectedTeacher) return 'اختر المعلم';
    if (targetType === 'student' && !selectedStudent) return 'اختر الطالب';
    if (targetType === 'faculty' && !selFaculty) return 'اختر الكلية';
    if (targetType === 'department' && !selDept) return 'اختر القسم';
    if (targetType === 'level' && !selLevel) return 'اختر المستوى';
    if (targetType === 'section' && !selSection) return 'اختر الشعبة';
    return null;
  };

  const send = async () => {
    const err = validate();
    if (err) {
      if (Platform.OS === 'web') window.alert(err);
      else Alert.alert('تنبيه', err);
      return;
    }
    setSending(true);
    try {
      const res = await api.post('/notifications/send', buildPayload());
      const msg = res.data?.message || 'تم إرسال الإشعار بنجاح';
      const det = res.data?.users ? `\nعدد المستلمين: ${res.data.users}` : '';
      if (Platform.OS === 'web') {
        window.alert(msg + det);
        setTitle(''); setBody('');
      } else {
        Alert.alert('نجاح', msg + det, [{ text: 'حسناً', onPress: () => { setTitle(''); setBody(''); } }]);
      }
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'فشل إرسال الإشعار';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('خطأ', msg);
    } finally {
      setSending(false);
    }
  };

  if (!canSend) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => goBack(router)} style={styles.backBtn} testID="back-btn">
            <Ionicons name="arrow-forward" size={24} color="#1565c0" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>إرسال إشعار</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Ionicons name="lock-closed" size={48} color="#f44336" />
          <Text style={{ fontSize: 16, color: '#666', marginTop: 12, textAlign: 'center' }}>ليس لديك صلاحية إرسال الإشعارات</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack(router)} style={styles.backBtn} testID="back-btn">
          <Ionicons name="arrow-forward" size={24} color="#1565c0" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>إرسال إشعار</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Target type pills */}
        <Text style={styles.label}>اختر الفئة المستهدفة:</Text>
        <View style={styles.pillsWrap}>
          {TARGET_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.value}
              onPress={() => setTargetType(opt.value)}
              style={[styles.pill, targetType === opt.value && styles.pillActive]}
              testID={`target-${opt.value}`}
            >
              <Ionicons name={opt.icon as any} size={14} color={targetType === opt.value ? '#fff' : '#1565c0'} />
              <Text style={[styles.pillText, targetType === opt.value && styles.pillTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Filters depend on target type */}
        {targetType === 'role' && (
          <View style={styles.filterCard}>
            <Text style={styles.fieldLabel}>الدور</Text>
            <View style={styles.pillsWrap}>
              {[
                { v: 'teacher', l: 'المعلمون' },
                { v: 'student', l: 'الطلاب' },
                { v: 'employee', l: 'الموظفون' },
                { v: 'department_head', l: 'رؤساء الأقسام' },
                { v: 'dean', l: 'العمداء' },
              ].map(r => (
                <TouchableOpacity
                  key={r.v}
                  onPress={() => setSelectedRole(r.v)}
                  style={[styles.smallPill, selectedRole === r.v && styles.smallPillActive]}
                  testID={`role-${r.v}`}
                >
                  <Text style={[styles.pillText, selectedRole === r.v && styles.pillTextActive]}>{r.l}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {targetType === 'faculty' && (
          <View style={styles.filterCard}>
            <CourseFilter
              faculties={faculties}
              departments={[]}
              courses={[]}
              facultyId={selFaculty}
              departmentId=""
              courseId=""
              onFacultyChange={setSelFaculty}
              onDepartmentChange={() => {}}
              onCourseChange={() => {}}
              showCourse={false}
              required
              loading={metaLoading}
            />
          </View>
        )}

        {targetType === 'department' && (
          <View style={styles.filterCard}>
            <CourseFilter
              faculties={faculties}
              departments={departments}
              courses={[]}
              facultyId={selFaculty}
              departmentId={selDept}
              courseId=""
              onFacultyChange={setSelFaculty}
              onDepartmentChange={setSelDept}
              onCourseChange={() => {}}
              showCourse={false}
              required
              loading={metaLoading}
            />
          </View>
        )}

        {(targetType === 'level' || targetType === 'section') && (
          <View style={styles.filterCard}>
            <CourseFilter
              faculties={faculties}
              departments={departments}
              courses={[]}
              facultyId={selFaculty}
              departmentId={selDept}
              courseId=""
              onFacultyChange={(v) => { setSelFaculty(v); setSelLevel(''); setSelSection(''); }}
              onDepartmentChange={(v) => { setSelDept(v); setSelLevel(''); setSelSection(''); }}
              onCourseChange={() => {}}
              showCourse={false}
              required={false}
              loading={metaLoading}
            />
            <Text style={[styles.fieldLabel, { marginTop: 8 }]}>المستوى</Text>
            <View style={styles.pillsWrap}>
              {[1,2,3,4,5,6].map(l => (
                <TouchableOpacity
                  key={l}
                  onPress={() => { setSelLevel(String(l)); setSelSection(''); }}
                  style={[styles.smallPill, selLevel === String(l) && styles.smallPillActive]}
                  testID={`level-${l}`}
                >
                  <Text style={[styles.pillText, selLevel === String(l) && styles.pillTextActive]}>المستوى {l}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {targetType === 'section' && (
              <>
                <Text style={[styles.fieldLabel, { marginTop: 8 }]}>الشعبة</Text>
                <View style={styles.pillsWrap}>
                  {(availableSections.length > 0 ? availableSections : ['أ', 'ب', 'ج', 'د']).map(sec => (
                    <TouchableOpacity
                      key={sec}
                      onPress={() => setSelSection(sec)}
                      style={[styles.smallPill, selSection === sec && styles.smallPillActive]}
                      testID={`section-${sec}`}
                    >
                      <Text style={[styles.pillText, selSection === sec && styles.pillTextActive]}>{sec}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </View>
        )}

        {targetType === 'course' && (
          <View style={styles.filterCard}>
            <CourseFilter
              faculties={faculties}
              departments={departments}
              courses={courses}
              facultyId={selFaculty}
              departmentId={selDept}
              courseId={selCourse}
              onFacultyChange={setSelFaculty}
              onDepartmentChange={setSelDept}
              onCourseChange={setSelCourse}
              required
              loading={metaLoading}
            />
          </View>
        )}

        {targetType === 'teacher' && (
          <View style={styles.filterCard}>
            <Text style={styles.fieldLabel}>المعلم</Text>
            <TouchableOpacity
              style={styles.searchBtn}
              onPress={() => { setShowTeacherModal(true); setTeacherQuery(''); setTeachersList([]); }}
              testID="select-teacher-btn"
            >
              <Ionicons name="search" size={16} color="#666" />
              <Text style={styles.searchBtnText}>
                {selectedTeacher ? selectedTeacher.full_name : 'ابحث واختر المعلم...'}
              </Text>
              {selectedTeacher && (
                <TouchableOpacity onPress={(e: any) => { e.stopPropagation?.(); setSelectedTeacher(null); }}>
                  <Ionicons name="close-circle" size={18} color="#f44336" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          </View>
        )}

        {targetType === 'student' && (
          <View style={styles.filterCard}>
            <Text style={styles.fieldLabel}>الطالب</Text>
            <TouchableOpacity
              style={styles.searchBtn}
              onPress={() => { setShowStudentModal(true); setStudentQuery(''); setStudentsList([]); }}
              testID="select-student-btn"
            >
              <Ionicons name="search" size={16} color="#666" />
              <Text style={styles.searchBtnText}>
                {selectedStudent ? `${selectedStudent.full_name}${selectedStudent.student_id ? ` (${selectedStudent.student_id})` : ''}` : 'ابحث واختر الطالب...'}
              </Text>
              {selectedStudent && (
                <TouchableOpacity onPress={(e: any) => { e.stopPropagation?.(); setSelectedStudent(null); }}>
                  <Ionicons name="close-circle" size={18} color="#f44336" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Title & body */}
        <Text style={styles.label}>عنوان الإشعار</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="مثال: تذكير: اجتماع عام غداً"
          placeholderTextColor="#999"
          testID="title-input"
          maxLength={100}
        />

        <Text style={styles.label}>نص الرسالة</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={body}
          onChangeText={setBody}
          placeholder="اكتب الرسالة بوضوح..."
          placeholderTextColor="#999"
          multiline
          numberOfLines={4}
          testID="body-input"
          maxLength={500}
        />
        <Text style={styles.charCount}>{body.length}/500</Text>

        {/* Send button */}
        <TouchableOpacity
          style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
          onPress={send}
          disabled={sending}
          testID="send-btn"
        >
          {sending ? (
            <>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.sendBtnText}>جاري الإرسال...</Text>
            </>
          ) : (
            <>
              <Ionicons name="send" size={18} color="#fff" />
              <Text style={styles.sendBtnText}>إرسال الإشعار</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* Teacher search modal */}
      <Modal visible={showTeacherModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>ابحث عن معلم</Text>
              <TouchableOpacity onPress={() => setShowTeacherModal(false)} testID="teacher-modal-close">
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <View style={styles.modalSearch}>
              <Ionicons name="search" size={18} color="#999" />
              <TextInput
                value={teacherQuery}
                onChangeText={setTeacherQuery}
                placeholder="ابحث بالاسم أو الرقم..."
                placeholderTextColor="#aaa"
                style={styles.modalSearchInput}
                autoFocus
                testID="teacher-modal-search"
              />
            </View>
            <FlatList
              data={teachersList}
              keyExtractor={(item: any) => item.user_id || item.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => { setSelectedTeacher(item); setShowTeacherModal(false); }}
                  testID={`teacher-item-${item.user_id}`}
                >
                  <Text style={styles.modalItemTitle}>{item.full_name}</Text>
                  {item.username || item.teacher_id ? (
                    <Text style={styles.modalItemSub}>{item.teacher_id || item.username}</Text>
                  ) : null}
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.modalEmpty}>{teacherQuery ? 'لا توجد نتائج' : 'اكتب للبحث...'}</Text>}
            />
          </View>
        </View>
      </Modal>

      {/* Student search modal */}
      <Modal visible={showStudentModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>ابحث عن طالب</Text>
              <TouchableOpacity onPress={() => setShowStudentModal(false)} testID="student-modal-close">
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <View style={styles.modalSearch}>
              <Ionicons name="search" size={18} color="#999" />
              <TextInput
                value={studentQuery}
                onChangeText={setStudentQuery}
                placeholder="ابحث بالاسم أو رقم القيد..."
                placeholderTextColor="#aaa"
                style={styles.modalSearchInput}
                autoFocus
                testID="student-modal-search"
              />
            </View>
            <FlatList
              data={studentsList}
              keyExtractor={(item: any) => item.user_id || item.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => { setSelectedStudent(item); setShowStudentModal(false); }}
                  testID={`student-item-${item.user_id}`}
                >
                  <Text style={styles.modalItemTitle}>{item.full_name}</Text>
                  <Text style={styles.modalItemSub}>{item.student_id}{item.level ? ` • م${item.level}` : ''}{item.section ? ` (${item.section})` : ''}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.modalEmpty}>{studentQuery ? 'لا توجد نتائج' : 'اكتب للبحث...'}</Text>}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#333' },
  backBtn: { padding: 4 },
  content: { flex: 1, padding: 14 },
  label: { fontSize: 13, fontWeight: '700', color: '#444', marginBottom: 8, marginTop: 6, textAlign: 'right' },
  pillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 18,
    borderWidth: 1, borderColor: '#1565c0', backgroundColor: '#fff',
  },
  pillActive: { backgroundColor: '#1565c0' },
  pillText: { fontSize: 12, color: '#1565c0', fontWeight: '600' },
  pillTextActive: { color: '#fff' },
  smallPill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    borderWidth: 1, borderColor: '#1565c0', backgroundColor: '#fff',
  },
  smallPillActive: { backgroundColor: '#1565c0' },
  filterCard: { backgroundColor: '#fff', padding: 12, borderRadius: 10, marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#555', marginBottom: 6, textAlign: 'right' },
  searchBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f8f9fa', borderWidth: 1, borderColor: '#e0e0e0',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
  },
  searchBtnText: { flex: 1, fontSize: 13, color: '#333', textAlign: 'right' },
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#333', textAlign: 'right',
  },
  textarea: { minHeight: 100, textAlignVertical: 'top' },
  charCount: { fontSize: 11, color: '#999', textAlign: 'left', marginTop: 4, marginBottom: 8 },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#1565c0', paddingVertical: 14, borderRadius: 10, marginTop: 12,
  },
  sendBtnDisabled: { opacity: 0.6 },
  sendBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '80%', padding: 14 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#333' },
  modalSearch: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 10,
    backgroundColor: '#f5f5f5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  modalSearchInput: { flex: 1, fontSize: 14, color: '#333', textAlign: 'right' },
  modalItem: { paddingHorizontal: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  modalItemTitle: { fontSize: 14, color: '#333', fontWeight: '600', textAlign: 'right' },
  modalItemSub: { fontSize: 11, color: '#888', marginTop: 2, textAlign: 'right' },
  modalEmpty: { textAlign: 'center', padding: 24, color: '#999', fontSize: 13 },
});

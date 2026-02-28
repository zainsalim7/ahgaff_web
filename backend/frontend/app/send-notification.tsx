import { goBack } from '../src/utils/navigation';
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import { useAuth } from '../src/contexts/AuthContext';
import api from '../src/services/api';

export default function SendNotification() {
  const router = useRouter();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetType, setTargetType] = useState('all');
  const [selectedRole, setSelectedRole] = useState('');
  const [sending, setSending] = useState(false);

  // Course selection
  const [courses, setCourses] = useState<any[]>([]);
  const [selectedCourse, setSelectedCourse] = useState('');

  // Teacher search
  const [teacherSearch, setTeacherSearch] = useState('');
  const [teachers, setTeachers] = useState<any[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<any>(null);

  // Student search
  const [studentSearch, setStudentSearch] = useState('');
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);

  useEffect(() => {
    if (targetType === 'course') fetchCourses();
  }, [targetType]);

  const fetchCourses = async () => {
    try {
      const res = await api.get('/notifications/courses');
      setCourses(res.data);
    } catch (e) { console.error(e); }
  };

  const searchTeachers = async (q: string) => {
    setTeacherSearch(q);
    if (q.length < 2) { setTeachers([]); return; }
    try {
      const res = await api.get(`/notifications/search-teachers?q=${q}`);
      setTeachers(res.data);
    } catch (e) { console.error(e); }
  };

  const searchStudents = async (q: string) => {
    setStudentSearch(q);
    if (q.length < 2) { setStudents([]); return; }
    try {
      const res = await api.get(`/notifications/search-students?q=${q}`);
      setStudents(res.data);
    } catch (e) { console.error(e); }
  };

  const send = async () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert('تنبيه', 'يرجى كتابة العنوان والرسالة');
      return;
    }

    const payload: any = { title, body, target_type: targetType };

    if (targetType === 'course') {
      if (!selectedCourse) { Alert.alert('تنبيه', 'اختر المقرر'); return; }
      payload.course_id = selectedCourse;
    } else if (targetType === 'teacher') {
      if (!selectedTeacher) { Alert.alert('تنبيه', 'اختر المعلم'); return; }
      payload.teacher_user_id = selectedTeacher.user_id;
    } else if (targetType === 'student') {
      if (!selectedStudent) { Alert.alert('تنبيه', 'اختر الطالب'); return; }
      payload.student_user_id = selectedStudent.user_id;
      payload.student_name = selectedStudent.full_name;
    }

    setSending(true);
    try {
      await api.post('/notifications/send', payload);
      Alert.alert('نجاح', 'تم إرسال الإشعار بنجاح', [
        { text: 'حسناً', onPress: () => { setTitle(''); setBody(''); } }
      ]);
    } catch (e: any) {
      Alert.alert('خطأ', e?.response?.data?.detail || 'فشل إرسال الإشعار');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack(router)} style={styles.backBtn} data-testid="back-btn">
          <Ionicons name="arrow-forward" size={24} color="#1565c0" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>إرسال إشعار</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Target Type */}
        <Text style={styles.label}>إرسال إلى:</Text>
        <View style={styles.pickerWrapper} data-testid="target-type-picker">
          <Picker selectedValue={targetType} onValueChange={setTargetType} style={styles.picker}>
            <Picker.Item label="الجميع" value="all" />
            <Picker.Item label="طلاب مقرر" value="course" />
            <Picker.Item label="طالب محدد" value="student" />
            <Picker.Item label="معلم محدد" value="teacher" />
            <Picker.Item label="حسب الدور" value="role" />
          </Picker>
        </View>

        {/* Role selector */}
        {targetType === 'role' && (
          <View>
            <Text style={styles.label}>الدور:</Text>
            <View style={styles.pickerWrapper}>
              <Picker selectedValue={selectedRole} onValueChange={setSelectedRole} style={styles.picker}>
                <Picker.Item label="-- اختر الدور --" value="" />
                <Picker.Item label="المعلمون" value="teacher" />
                <Picker.Item label="الطلاب" value="student" />
                <Picker.Item label="الموظفون" value="employee" />
                <Picker.Item label="رؤساء الأقسام" value="department_head" />
                <Picker.Item label="العمداء" value="dean" />
              </Picker>
            </View>
          </View>
        )}

        {/* Course selector */}
        {targetType === 'course' && (
          <View>
            <Text style={styles.label}>المقرر:</Text>
            <View style={styles.pickerWrapper}>
              <Picker selectedValue={selectedCourse} onValueChange={setSelectedCourse} style={styles.picker}>
                <Picker.Item label="-- اختر مقرر --" value="" />
                {courses.map(c => (
                  <Picker.Item key={c.id} label={`${c.name} (${c.students_count} طالب)`} value={c.id} />
                ))}
              </Picker>
            </View>
          </View>
        )}

        {/* Teacher search */}
        {targetType === 'teacher' && (
          <View>
            <Text style={styles.label}>بحث عن معلم:</Text>
            <TextInput
              style={styles.input}
              placeholder="اكتب اسم المعلم..."
              value={teacherSearch}
              onChangeText={searchTeachers}
              data-testid="teacher-search-input"
            />
            {selectedTeacher && (
              <View style={styles.selectedItem}>
                <Text style={styles.selectedText}>{selectedTeacher.full_name}</Text>
                <TouchableOpacity onPress={() => { setSelectedTeacher(null); setTeacherSearch(''); }}>
                  <Ionicons name="close-circle" size={20} color="#d32f2f" />
                </TouchableOpacity>
              </View>
            )}
            {!selectedTeacher && teachers.map(t => (
              <TouchableOpacity
                key={t.user_id}
                style={styles.searchResult}
                onPress={() => { setSelectedTeacher(t); setTeachers([]); setTeacherSearch(t.full_name); }}
              >
                <Ionicons name="person" size={18} color="#1565c0" />
                <Text style={styles.searchResultText}>{t.full_name} ({t.teacher_id})</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Student search */}
        {targetType === 'student' && (
          <View>
            <Text style={styles.label}>بحث عن طالب:</Text>
            <TextInput
              style={styles.input}
              placeholder="اكتب اسم أو رقم الطالب..."
              value={studentSearch}
              onChangeText={searchStudents}
              data-testid="student-search-input"
            />
            {selectedStudent && (
              <View style={styles.selectedItem}>
                <Text style={styles.selectedText}>{selectedStudent.full_name}</Text>
                <TouchableOpacity onPress={() => { setSelectedStudent(null); setStudentSearch(''); }}>
                  <Ionicons name="close-circle" size={20} color="#d32f2f" />
                </TouchableOpacity>
              </View>
            )}
            {!selectedStudent && students.map(s => (
              <TouchableOpacity
                key={s.user_id}
                style={styles.searchResult}
                onPress={() => { setSelectedStudent(s); setStudents([]); setStudentSearch(s.full_name); }}
              >
                <Ionicons name="school" size={18} color="#4caf50" />
                <Text style={styles.searchResultText}>{s.full_name} ({s.student_id})</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Title */}
        <Text style={styles.label}>العنوان:</Text>
        <TextInput
          style={styles.input}
          placeholder="عنوان الإشعار"
          value={title}
          onChangeText={setTitle}
          data-testid="title-input"
        />

        {/* Body */}
        <Text style={styles.label}>الرسالة:</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="نص الإشعار..."
          value={body}
          onChangeText={setBody}
          multiline
          numberOfLines={4}
          data-testid="body-input"
        />

        {/* Send Button */}
        <TouchableOpacity
          style={[styles.sendBtn, sending && { opacity: 0.6 }]}
          onPress={send}
          disabled={sending}
          data-testid="send-btn"
        >
          {sending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="send" size={20} color="#fff" />
              <Text style={styles.sendBtnText}>إرسال</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0',
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a2e' },
  content: { flex: 1, padding: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6, marginTop: 12 },
  pickerWrapper: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8,
    backgroundColor: '#fff', overflow: 'hidden',
  },
  picker: { height: 50 },
  input: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8,
    backgroundColor: '#fff', padding: 12, fontSize: 14, textAlign: 'right',
  },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  searchResult: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  searchResultText: { fontSize: 14, color: '#333' },
  selectedItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 10, backgroundColor: '#e3f2fd', borderRadius: 8, marginTop: 6,
  },
  selectedText: { fontSize: 14, fontWeight: '600', color: '#1565c0' },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#1565c0', padding: 14, borderRadius: 10, marginTop: 20, marginBottom: 40,
  },
  sendBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import api, { API_URL } from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface EnrolledStudent {
  id: string;
  enrollment_id?: string;
  student_id: string;
  student_number?: string;
  full_name: string;
  level?: number;
  section?: string;
}

type ResultValue = 'pass' | 'fail' | null;

const showAlert = (title: string, msg: string) => {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${msg}`);
  else Alert.alert(title, msg);
};

export default function SendFinalResultsScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [course, setCourse] = useState<any>(null);
  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<Record<string, ResultValue>>({});
  const [grades, setGrades] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');

  const canSend =
    user?.role === 'admin' ||
    user?.permissions?.includes('send_notifications') ||
    user?.permissions?.includes('manage_courses') ||
    user?.permissions?.includes('manage_grades');

  useEffect(() => {
    if (!courseId) return;
    // wait for user to be hydrated before checking permissions
    if (!user) return;
    if (!canSend) {
      showAlert('غير مصرح', 'ليس لديك صلاحية إرسال النتائج النهائية');
      router.back();
      return;
    }
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, user]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [courseRes, studentsRes] = await Promise.all([
        api.get(`/courses/${courseId}`),
        api.get(`/enrollments/${courseId}/students`),
      ]);
      setCourse(courseRes.data);
      const list: EnrolledStudent[] = (studentsRes.data || []).map((s: any) => ({
        id: s.id,
        student_id: s.student_id,
        student_number: s.student_id,
        full_name: s.full_name,
        level: s.level,
        section: s.section,
      }));
      setStudents(list);
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'تعذر تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  const setResultFor = (sid: string, value: ResultValue) => {
    setResults((p) => ({ ...p, [sid]: p[sid] === value ? null : value }));
  };

  const setGradeFor = (sid: string, value: string) => {
    setGrades((p) => ({ ...p, [sid]: value }));
  };

  const markAll = (value: ResultValue) => {
    const m: Record<string, ResultValue> = {};
    students.forEach((s) => (m[s.id] = value));
    setResults(m);
  };

  const filtered = students.filter(
    (s) =>
      !search ||
      s.full_name.includes(search) ||
      (s.student_id || '').includes(search),
  );

  const counts = (() => {
    const passN = Object.values(results).filter((v) => v === 'pass').length;
    const failN = Object.values(results).filter((v) => v === 'fail').length;
    return { passN, failN, totalSet: passN + failN };
  })();

  const submit = async () => {
    const items = students
      .filter((s) => results[s.id])
      .map((s) => ({
        student_number: s.student_id,
        result: results[s.id] as string,
        grade: grades[s.id] || undefined,
      }));

    if (items.length === 0) {
      showAlert('تنبيه', 'يرجى تحديد النتيجة لطالب واحد على الأقل');
      return;
    }

    const ok = Platform.OS === 'web'
      ? window.confirm(`سيتم إرسال ${items.length} إشعار نتيجة نهائية. متابعة؟`)
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            'تأكيد الإرسال',
            `سيتم إرسال ${items.length} إشعار نتيجة نهائية للطلاب. هل تريد المتابعة؟`,
            [
              { text: 'إلغاء', onPress: () => resolve(false), style: 'cancel' },
              { text: 'إرسال', onPress: () => resolve(true) },
            ],
          );
        });
    if (!ok) return;

    try {
      setSending(true);
      const r = await api.post(`/courses/${courseId}/send-final-results`, { results: items });
      const d = r.data;
      let msg = `تم إرسال ${d.sent} إشعار${d.failed_count ? `\nفشل: ${d.failed_count}` : ''}`;
      if (d.failed && d.failed.length) {
        const sample = d.failed.slice(0, 3).map((f: any) => `${f.student_number}: ${f.reason}`).join('\n');
        msg += `\n\nأمثلة:\n${sample}`;
      }
      showAlert('تم', msg);
      // reset selections
      setResults({});
      setGrades({});
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'فشل إرسال النتائج');
    } finally {
      setSending(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const url = `${API_URL}/template/final-results`;
      if (Platform.OS === 'web') {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = window.URL.createObjectURL(blob);
        a.download = 'final_results_template.xlsx';
        a.click();
      } else {
        showAlert('معلومة', 'حمّل النموذج عبر النسخة الويب من التطبيق');
      }
    } catch (e: any) {
      showAlert('خطأ', 'تعذر تحميل النموذج');
    }
  };

  const uploadExcel = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
        ],
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      const file = picked.assets[0];

      setSending(true);
      const fd = new FormData();
      if (Platform.OS === 'web' && (file as any).file) {
        fd.append('file', (file as any).file, file.name || 'results.xlsx');
      } else {
        fd.append('file', {
          uri: file.uri,
          name: file.name || 'results.xlsx',
          type: file.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        } as any);
      }

      const r = await api.post(`/courses/${courseId}/send-final-results/upload`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const d = r.data;
      let msg = `تم إرسال ${d.sent} إشعار${d.failed_count ? `\nفشل: ${d.failed_count}` : ''}`;
      if (d.failed && d.failed.length) {
        const sample = d.failed.slice(0, 5).map((f: any) => `${f.student_number}: ${f.reason}`).join('\n');
        msg += `\n\nأمثلة:\n${sample}`;
      }
      showAlert('تم', msg);
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'فشل رفع الملف');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'إرسال النتائج النهائية' }} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1565c0" />
          <Text style={{ marginTop: 12 }}>جارٍ التحميل...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'إرسال النتائج النهائية', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 140 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header card */}
          <View style={styles.headerCard}>
            <Text style={styles.courseTitle} data-testid="final-results-course-name">
              {course?.name || 'المقرر'}
            </Text>
            {course?.code ? <Text style={styles.courseCode}>{course.code}</Text> : null}
            <Text style={styles.studentCount}>{students.length} طالب مسجل</Text>
          </View>

          {/* Action bar */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnPass]}
              onPress={() => markAll('pass')}
              data-testid="mark-all-pass-btn"
            >
              <Ionicons name="checkmark-done" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>تحديد الكل ناجح</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnFail]}
              onPress={() => markAll('fail')}
              data-testid="mark-all-fail-btn"
            >
              <Ionicons name="close-circle" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>تحديد الكل راسب</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnNeutral]}
              onPress={() => markAll(null)}
              data-testid="clear-all-btn"
            >
              <Ionicons name="refresh" size={18} color="#1565c0" />
              <Text style={[styles.actionBtnText, { color: '#1565c0' }]}>مسح التحديدات</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnAlt]}
              onPress={downloadTemplate}
              data-testid="download-template-btn"
            >
              <Ionicons name="download" size={18} color="#1565c0" />
              <Text style={[styles.actionBtnText, { color: '#1565c0' }]}>تحميل نموذج Excel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnAlt]}
              onPress={uploadExcel}
              data-testid="upload-excel-btn"
            >
              <Ionicons name="cloud-upload" size={18} color="#1565c0" />
              <Text style={[styles.actionBtnText, { color: '#1565c0' }]}>رفع نتائج من Excel</Text>
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="#666" />
            <TextInput
              style={styles.searchInput}
              placeholder="ابحث باسم الطالب أو رقم القيد"
              placeholderTextColor="#999"
              value={search}
              onChangeText={setSearch}
              data-testid="final-results-search"
            />
          </View>

          {/* Counts */}
          <View style={styles.countsRow}>
            <Text style={styles.countText} data-testid="count-pass">
              ناجح: {counts.passN}
            </Text>
            <Text style={styles.countText} data-testid="count-fail">
              راسب: {counts.failN}
            </Text>
            <Text style={styles.countText} data-testid="count-total">
              إجمالي: {counts.totalSet}/{students.length}
            </Text>
          </View>

          {/* Students list */}
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={48} color="#bbb" />
              <Text style={styles.emptyText}>لا يوجد طلاب</Text>
            </View>
          ) : (
            filtered.map((s) => {
              const r = results[s.id] || null;
              return (
                <View key={s.id} style={styles.studentCard}>
                  <View style={styles.studentInfo}>
                    <Text style={styles.studentName} numberOfLines={1}>
                      {s.full_name}
                    </Text>
                    <Text style={styles.studentMeta}>
                      رقم القيد: {s.student_id}
                      {s.level ? ` | المستوى ${s.level}` : ''}
                      {s.section ? ` | شعبة ${s.section}` : ''}
                    </Text>
                  </View>
                  <View style={styles.resultRow}>
                    <TouchableOpacity
                      style={[styles.pill, r === 'pass' && styles.pillPassActive]}
                      onPress={() => setResultFor(s.id, 'pass')}
                      data-testid={`result-pass-${s.student_id}`}
                    >
                      <Text style={[styles.pillText, r === 'pass' && styles.pillTextActive]}>
                        ناجح
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.pill, r === 'fail' && styles.pillFailActive]}
                      onPress={() => setResultFor(s.id, 'fail')}
                      data-testid={`result-fail-${s.student_id}`}
                    >
                      <Text style={[styles.pillText, r === 'fail' && styles.pillTextActive]}>
                        راسب
                      </Text>
                    </TouchableOpacity>
                    <TextInput
                      style={styles.gradeInput}
                      placeholder="درجة"
                      placeholderTextColor="#aaa"
                      keyboardType="numeric"
                      value={grades[s.id] || ''}
                      onChangeText={(t) => setGradeFor(s.id, t)}
                      data-testid={`grade-input-${s.student_id}`}
                    />
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.submitBtn,
              (sending || counts.totalSet === 0) && styles.submitBtnDisabled,
            ]}
            disabled={sending || counts.totalSet === 0}
            onPress={submit}
            data-testid="send-final-results-btn"
          >
            {sending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="send" size={18} color="#fff" />
                <Text style={styles.submitBtnText}>
                  إرسال النتائج عبر الإشعارات ({counts.totalSet})
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerCard: {
    backgroundColor: '#1565c0',
    padding: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    alignItems: 'center',
  },
  courseTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  courseCode: { color: '#cfd8dc', fontSize: 13, marginTop: 4 },
  studentCount: { color: '#fff', fontSize: 13, marginTop: 6, opacity: 0.9 },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  actionBtn: {
    flex: 1,
    minWidth: 130,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  actionBtnPass: { backgroundColor: '#2e7d32' },
  actionBtnFail: { backgroundColor: '#c62828' },
  actionBtnNeutral: {
    backgroundColor: '#fff',
    borderColor: '#1565c0',
    borderWidth: 1,
  },
  actionBtnAlt: {
    backgroundColor: '#fff',
    borderColor: '#1565c0',
    borderWidth: 1,
  },
  actionBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 12,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchInput: { flex: 1, textAlign: 'right', fontSize: 14, color: '#333' },
  countsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    marginHorizontal: 12,
    marginTop: 8,
    backgroundColor: '#e3f2fd',
    borderRadius: 10,
  },
  countText: { color: '#1565c0', fontWeight: '700', fontSize: 13 },
  empty: { alignItems: 'center', padding: 40 },
  emptyText: { color: '#666', marginTop: 8 },
  studentCard: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eceff1',
  },
  studentInfo: { marginBottom: 8 },
  studentName: { fontSize: 15, fontWeight: '700', color: '#212121', textAlign: 'right' },
  studentMeta: { fontSize: 12, color: '#666', marginTop: 2, textAlign: 'right' },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#cfd8dc',
    backgroundColor: '#f5f7fb',
  },
  pillPassActive: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  pillFailActive: { backgroundColor: '#c62828', borderColor: '#c62828' },
  pillText: { color: '#37474f', fontWeight: '700', fontSize: 13 },
  pillTextActive: { color: '#fff' },
  gradeInput: {
    flex: 1,
    minWidth: 80,
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fafafa',
    textAlign: 'center',
    fontSize: 13,
    color: '#333',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    borderTopWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#1565c0',
  },
  submitBtnDisabled: { backgroundColor: '#90a4ae' },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

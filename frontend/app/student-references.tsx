import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import api from '../src/services/api';

interface Preview {
  university_short_code?: string;
  faculties_with_code: number;
  faculties_total: number;
  total_students: number;
  students_with_ref: number;
  students_without_ref: number;
  ready_to_generate: number;
  missing_program_code: number;
  missing_enrollment_year: number;
  missing_faculty_code: number;
  missing_university_code?: boolean;
  warning?: string;
}

const showAlert = (title: string, msg: string) => {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${msg}`);
  else Alert.alert(title, msg);
};

const askConfirm = async (title: string, msg: string): Promise<boolean> => {
  if (Platform.OS === 'web') return window.confirm(`${title}\n\n${msg}`);
  return new Promise((resolve) => {
    Alert.alert(title, msg, [
      { text: 'إلغاء', style: 'cancel', onPress: () => resolve(false) },
      { text: 'تنفيذ', onPress: () => resolve(true) },
    ]);
  });
};

export default function StudentReferencesScreen() {
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [resultSamples, setResultSamples] = useState<any[]>([]);
  const [resultMsg, setResultMsg] = useState<string>('');

  const fetchPreview = useCallback(async () => {
    try {
      setLoading(true);
      setResultMsg('');
      setResultSamples([]);
      const res = await api.get('/admin/student-references/preview');
      setPreview(res.data);
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'فشل تحميل المعاينة');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleExecute = async () => {
    if (!preview || preview.ready_to_generate === 0) {
      showAlert('لا يوجد ما يُحدَّث', 'لا يوجد طلاب تكتمل بياناتهم لتوليد رقم مرجعي.');
      return;
    }
    const ok = await askConfirm(
      'تأكيد التنفيذ',
      `سيتم توليد ${preview.ready_to_generate} رقم مرجعي للطلاب الذين تكتمل بياناتهم.\n\nهل تريد المتابعة؟`
    );
    if (!ok) return;
    try {
      setExecuting(true);
      const res = await api.post('/admin/student-references/execute');
      setResultMsg(res.data?.message || 'تم التنفيذ');
      setResultSamples(res.data?.sample_details || []);
      await fetchPreview();
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'فشل التنفيذ');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'توليد الأرقام المرجعية', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={{ padding: 12 }}>
          <View style={styles.headerCard}>
            <Ionicons name="finger-print" size={32} color="#fff" />
            <Text style={styles.headerTitle}>توليد الأرقام المرجعية</Text>
            <Text style={styles.headerSub}>
              توليد رقم مرجعي تلقائي لكل طالب بصيغة: AU + برنامج + سنة + كلية + تسلسل
            </Text>
            <View style={styles.exampleBox}>
              <Text style={styles.exampleLabel}>مثال:</Text>
              <Text style={styles.exampleCode}>AUB2501001</Text>
            </View>
          </View>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={18} color="#1565c0" />
            <Text style={styles.infoText}>
              تتطلب هذه الأداة: short_code للجامعة، numeric_code للكلية، program_code و enrollment_year للطالب.
              الأرقام تُولَّد تلقائياً للطلاب الجدد إن اكتملت بياناتهم.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.btn, styles.previewBtn, loading && { opacity: 0.6 }]}
            onPress={fetchPreview}
            disabled={loading}
            testID="preview-btn"
          >
            {loading ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="eye" size={18} color="#fff" />
                <Text style={styles.btnText}>معاينة</Text>
              </>
            )}
          </TouchableOpacity>

          {preview && (
            <>
              {preview.missing_university_code && (
                <View style={styles.warnBox}>
                  <Ionicons name="warning" size={20} color="#c62828" />
                  <Text style={styles.warnText}>
                    لم يتم تعيين short_code للجامعة. يُرجى تعيينه (مثلاً "AU") من صفحة إعدادات الجامعة قبل المتابعة.
                  </Text>
                </View>
              )}

              {!preview.missing_university_code && (
                <>
                  <View style={styles.statsCard}>
                    <Text style={styles.cardTitle}>
                      رمز الجامعة: <Text style={styles.codeBadge}>{preview.university_short_code}</Text>
                    </Text>
                    <View style={styles.statRow}>
                      <Text style={styles.statLabel}>الكليات المُعرَّفة برمز رقمي</Text>
                      <Text style={styles.statValue}>
                        {preview.faculties_with_code} / {preview.faculties_total}
                      </Text>
                    </View>
                    <View style={styles.statRow}>
                      <Text style={styles.statLabel}>إجمالي الطلاب</Text>
                      <Text style={styles.statValue}>{preview.total_students}</Text>
                    </View>
                    <View style={styles.statRow}>
                      <Text style={styles.statLabel}>طلاب لديهم رقم مرجعي</Text>
                      <Text style={[styles.statValue, { color: '#2e7d32' }]}>{preview.students_with_ref}</Text>
                    </View>
                    <View style={styles.statRow}>
                      <Text style={styles.statLabel}>طلاب جاهزون للتوليد</Text>
                      <Text style={[styles.statValue, { color: '#1565c0' }]}>{preview.ready_to_generate}</Text>
                    </View>
                  </View>

                  {(preview.missing_program_code > 0 ||
                    preview.missing_enrollment_year > 0 ||
                    preview.missing_faculty_code > 0) && (
                    <View style={styles.statsCard}>
                      <Text style={styles.cardTitle}>طلاب بحاجة لإكمال البيانات</Text>
                      <View style={styles.statRow}>
                        <Text style={styles.statLabel}>بدون رمز برنامج</Text>
                        <Text style={[styles.statValue, { color: '#ef6c00' }]}>{preview.missing_program_code}</Text>
                      </View>
                      <View style={styles.statRow}>
                        <Text style={styles.statLabel}>بدون سنة التحاق</Text>
                        <Text style={[styles.statValue, { color: '#ef6c00' }]}>{preview.missing_enrollment_year}</Text>
                      </View>
                      <View style={styles.statRow}>
                        <Text style={styles.statLabel}>كلية بدون رمز رقمي</Text>
                        <Text style={[styles.statValue, { color: '#ef6c00' }]}>{preview.missing_faculty_code}</Text>
                      </View>
                    </View>
                  )}

                  <TouchableOpacity
                    style={[
                      styles.btn,
                      styles.executeBtn,
                      (executing || preview.ready_to_generate === 0) && { opacity: 0.5 },
                    ]}
                    onPress={handleExecute}
                    disabled={executing || preview.ready_to_generate === 0}
                    testID="execute-btn"
                  >
                    {executing ? <ActivityIndicator color="#fff" /> : (
                      <>
                        <Ionicons name="play" size={18} color="#fff" />
                        <Text style={styles.btnText}>توليد ({preview.ready_to_generate})</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {resultMsg ? (
                <View style={styles.successBox}>
                  <Ionicons name="checkmark-circle" size={20} color="#2e7d32" />
                  <Text style={styles.successText}>{resultMsg}</Text>
                </View>
              ) : null}

              {resultSamples.length > 0 && (
                <View style={styles.statsCard}>
                  <Text style={styles.cardTitle}>عينة من الأرقام المُولَّدة</Text>
                  {resultSamples.map((s: any, i: number) => (
                    <View key={i} style={styles.statRow}>
                      <Text style={styles.statLabel} numberOfLines={1}>
                        {s.name || s.student_id}
                      </Text>
                      <Text style={[styles.statValue, { color: '#2e7d32', letterSpacing: 1 }]}>
                        {s.ref}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  headerCard: {
    backgroundColor: '#1565c0',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 8 },
  headerSub: { color: '#bbdefb', fontSize: 12, marginTop: 6, textAlign: 'center', lineHeight: 18 },
  exampleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  exampleLabel: { color: '#bbdefb', fontSize: 11 },
  exampleCode: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 1.5 },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 10,
    gap: 8,
    marginBottom: 12,
  },
  infoText: { flex: 1, color: '#1565c0', fontSize: 12, lineHeight: 18, textAlign: 'right' },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 10,
    marginBottom: 12,
  },
  previewBtn: { backgroundColor: '#1565c0' },
  executeBtn: { backgroundColor: '#2e7d32' },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  statsCard: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#212121', marginBottom: 10, textAlign: 'right' },
  codeBadge: { color: '#1565c0', backgroundColor: '#e3f2fd', paddingHorizontal: 6, fontWeight: '800' },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  statLabel: { fontSize: 13, color: '#666', flex: 1 },
  statValue: { fontSize: 14, fontWeight: '700', color: '#212121' },
  warnBox: {
    flexDirection: 'row',
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 10,
    gap: 8,
    marginBottom: 12,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#ef9a9a',
  },
  warnText: { flex: 1, color: '#c62828', fontSize: 12, textAlign: 'right', lineHeight: 18 },
  successBox: {
    flexDirection: 'row',
    backgroundColor: '#e8f5e9',
    padding: 12,
    borderRadius: 10,
    gap: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#a5d6a7',
    marginBottom: 12,
  },
  successText: { color: '#2e7d32', fontSize: 13, fontWeight: '700', flex: 1, textAlign: 'right' },
});

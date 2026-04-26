import React, { useEffect, useState } from 'react';
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
import { Stack, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { API_URL } from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';

interface Department {
  id: string;
  name: string;
  code: string;
}

const showAlert = (title: string, msg: string) => {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${msg}`);
  else Alert.alert(title, msg);
};

export default function SendDepartmentResultsScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const canSend =
    user?.role === 'admin' ||
    user?.permissions?.includes('send_notifications') ||
    user?.permissions?.includes('manage_courses') ||
    user?.permissions?.includes('manage_grades');

  useEffect(() => {
    if (!user) return;
    if (!canSend) {
      showAlert('غير مصرح', 'ليس لديك صلاحية إرسال النتائج');
      router.back();
      return;
    }
    void loadDepartments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadDepartments = async () => {
    try {
      setLoading(true);
      const r = await api.get('/departments');
      setDepartments((r.data || []).map((d: any) => ({ id: d.id, name: d.name, code: d.code })));
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'تعذر تحميل الأقسام');
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const url = `${API_URL}/api/template/department-final-results`;
      if (Platform.OS === 'web') {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Download failed');
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = window.URL.createObjectURL(blob);
        a.download = 'department_final_results_template.xlsx';
        a.click();
      } else {
        showAlert('معلومة', 'حمّل النموذج عبر النسخة الويب من التطبيق');
      }
    } catch {
      showAlert('خطأ', 'تعذر تحميل النموذج');
    }
  };

  const uploadExcel = async () => {
    if (!selectedDept) {
      showAlert('تنبيه', 'يرجى اختيار القسم أولاً');
      return;
    }
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

      setBusy(true);
      setLastResult(null);
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
      const r = await api.post(
        `/departments/${selectedDept.id}/send-final-results/upload`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      setLastResult(r.data);
      const d = r.data;
      let msg = `القسم: ${d.department_name}\nتم إرسال ${d.sent} إشعار`;
      if (d.failed_count) {
        msg += `\nفشل: ${d.failed_count}`;
      }
      showAlert('تم', msg);
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'فشل رفع الملف');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'إرسال نتائج القسم' }} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1565c0" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'إرسال نتائج القسم', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
          {/* Header */}
          <View style={styles.headerCard}>
            <Ionicons name="ribbon" size={28} color="#fff" />
            <Text style={styles.headerTitle}>إرسال النتيجة النهائية للقسم</Text>
            <Text style={styles.headerSub}>
              اختر القسم ثم ارفع ملف Excel يحتوي على رقم القيد والنتيجة فقط
            </Text>
          </View>

          {/* Step 1: Department selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>1. اختر القسم</Text>
            {departments.length === 0 ? (
              <Text style={styles.emptyText}>لا توجد أقسام متاحة</Text>
            ) : (
              departments.map((d) => {
                const active = selectedDept?.id === d.id;
                return (
                  <TouchableOpacity
                    key={d.id}
                    style={[styles.deptCard, active && styles.deptCardActive]}
                    onPress={() => setSelectedDept(d)}
                    testID={`dept-card-${d.code}`}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.deptName, active && { color: '#fff' }]}>
                        {d.name}
                      </Text>
                      <Text style={[styles.deptCode, active && { color: '#e3f2fd' }]}>
                        {d.code}
                      </Text>
                    </View>
                    {active && <Ionicons name="checkmark-circle" size={22} color="#fff" />}
                  </TouchableOpacity>
                );
              })
            )}
          </View>

          {/* Step 2: Template + Upload */}
          {selectedDept && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>2. تحميل النموذج ورفع النتائج</Text>

              <View style={styles.infoBox}>
                <Ionicons name="information-circle" size={18} color="#1565c0" />
                <Text style={styles.infoText}>
                  الملف يجب أن يحتوي عمودين فقط:{'\n'}
                  <Text style={{ fontWeight: '700' }}>رقم القيد</Text> |{' '}
                  <Text style={{ fontWeight: '700' }}>النتيجة</Text>
                  {'\n'}القيم المسموحة للنتيجة: ناجح، دور ثان، راجع التسجيل
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnAlt]}
                onPress={downloadTemplate}
                testID="dept-download-template-btn"
              >
                <Ionicons name="download" size={18} color="#1565c0" />
                <Text style={[styles.actionBtnText, { color: '#1565c0' }]}>
                  تحميل نموذج Excel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnPrimary, busy && { opacity: 0.6 }]}
                onPress={uploadExcel}
                disabled={busy}
                testID="dept-upload-btn"
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload" size={18} color="#fff" />
                    <Text style={styles.actionBtnText}>رفع ملف النتائج وإرسال</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Result summary */}
          {lastResult && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>نتيجة العملية</Text>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLine}>
                  القسم: <Text style={{ fontWeight: '700' }}>{lastResult.department_name}</Text>
                </Text>
                <Text style={styles.summaryLine}>
                  تم الإرسال:{' '}
                  <Text style={{ color: '#2e7d32', fontWeight: '700' }}>{lastResult.sent}</Text>
                </Text>
                <Text style={styles.summaryLine}>
                  فشل:{' '}
                  <Text style={{ color: '#c62828', fontWeight: '700' }}>
                    {lastResult.failed_count}
                  </Text>
                </Text>
                {lastResult.failed?.length > 0 && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={[styles.summaryLine, { fontWeight: '700' }]}>
                      تفاصيل الفشل:
                    </Text>
                    {lastResult.failed.slice(0, 10).map((f: any, i: number) => (
                      <Text key={i} style={styles.failItem}>
                        • {f.student_number}: {f.reason}
                      </Text>
                    ))}
                    {lastResult.failed.length > 10 && (
                      <Text style={styles.failItem}>
                        ...و {lastResult.failed.length - 10} حالة أخرى
                      </Text>
                    )}
                  </View>
                )}
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerCard: {
    backgroundColor: '#7b1fa2',
    padding: 18,
    alignItems: 'center',
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 8 },
  headerSub: {
    color: '#e1bee7',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  section: { paddingHorizontal: 16, marginTop: 16 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1565c0',
    marginBottom: 10,
    textAlign: 'right',
  },
  emptyText: { color: '#999', textAlign: 'center', padding: 16 },
  deptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  deptCardActive: {
    backgroundColor: '#1565c0',
    borderColor: '#0d47a1',
  },
  deptName: { fontSize: 15, fontWeight: '700', color: '#212121', textAlign: 'right' },
  deptCode: { fontSize: 12, color: '#666', marginTop: 2, textAlign: 'right' },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 10,
    gap: 8,
    marginBottom: 12,
  },
  infoText: { flex: 1, color: '#1565c0', fontSize: 12, lineHeight: 18, textAlign: 'right' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
  actionBtnAlt: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#1565c0' },
  actionBtnPrimary: { backgroundColor: '#7b1fa2' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  summaryCard: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  summaryLine: { fontSize: 14, color: '#333', marginBottom: 6, textAlign: 'right' },
  failItem: { fontSize: 12, color: '#666', marginTop: 2, textAlign: 'right' },
});

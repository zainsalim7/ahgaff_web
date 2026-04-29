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

interface LevelStat {
  level: number;
  count: number;
  computed_year: string | null;
}

interface Preview {
  total_students: number;
  will_fill_enrollment_year: number;
  will_fill_program_code: number;
  missing_dept_default_program: number;
  by_level: LevelStat[];
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

export default function StudentAutofillScreen() {
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [resultMsg, setResultMsg] = useState<string>('');

  const fetchPreview = useCallback(async () => {
    try {
      setLoading(true);
      setResultMsg('');
      const res = await api.get('/admin/student-autofill/preview');
      setPreview(res.data);
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'فشل تحميل المعاينة');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleExecute = async () => {
    if (!preview ||
      (preview.will_fill_enrollment_year === 0 && preview.will_fill_program_code === 0)) {
      showAlert('لا يوجد ما يُحدَّث', 'كل الطلاب لديهم بياناتهم مكتملة.');
      return;
    }
    const ok = await askConfirm(
      'تأكيد التنفيذ',
      `سيتم ملء:\n• ${preview.will_fill_enrollment_year} سنة التحاق\n• ${preview.will_fill_program_code} رمز برنامج\n\nهل تريد المتابعة؟`
    );
    if (!ok) return;
    try {
      setExecuting(true);
      const res = await api.post('/admin/student-autofill/execute');
      setResultMsg(res.data?.message || 'تم التنفيذ');
      await fetchPreview();
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'فشل التنفيذ');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'ملء بيانات الطلاب', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={{ padding: 12 }}>
          <View style={styles.headerCard}>
            <Ionicons name="sparkles" size={32} color="#fff" />
            <Text style={styles.headerTitle}>ملء بيانات الطلاب تلقائياً</Text>
            <Text style={styles.headerSub}>
              يَملأ سنة الالتحاق من المستوى، ورمز البرنامج من القسم
            </Text>
          </View>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={18} color="#1565c0" />
            <View style={{ flex: 1 }}>
              <Text style={styles.infoText}>
                <Text style={{ fontWeight: '700' as const }}>سنة الالتحاق</Text>: تُحسَب من بداية الفصل المُفعَّل ناقص (المستوى - 1).
              </Text>
              <Text style={[styles.infoText, { marginTop: 4 }]}>
                <Text style={{ fontWeight: '700' as const }}>رمز البرنامج</Text>: يأخذه من قيمة default_program_code في القسم.
              </Text>
            </View>
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
              <View style={styles.statsCard}>
                <Text style={styles.cardTitle}>الإحصائيات</Text>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>إجمالي الطلاب</Text>
                  <Text style={styles.statValue}>{preview.total_students}</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>سيُملأ لهم سنة الالتحاق</Text>
                  <Text style={[styles.statValue, { color: '#2e7d32' }]}>{preview.will_fill_enrollment_year}</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>سيُملأ لهم رمز البرنامج</Text>
                  <Text style={[styles.statValue, { color: '#2e7d32' }]}>{preview.will_fill_program_code}</Text>
                </View>
                {preview.missing_dept_default_program > 0 && (
                  <View style={styles.statRow}>
                    <Text style={styles.statLabel}>قسمهم بدون رمز برنامج افتراضي</Text>
                    <Text style={[styles.statValue, { color: '#c62828' }]}>{preview.missing_dept_default_program}</Text>
                  </View>
                )}
              </View>

              {preview.by_level.length > 0 && (
                <View style={styles.statsCard}>
                  <Text style={styles.cardTitle}>التوزيع حسب المستوى</Text>
                  {preview.by_level.map((lvl) => (
                    <View key={lvl.level} style={styles.semRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.semName}>المستوى {lvl.level}</Text>
                        <Text style={styles.semDates}>
                          سنة الالتحاق المتوقعة: {lvl.computed_year ? `20${lvl.computed_year}` : 'غير معروف'}
                        </Text>
                      </View>
                      <View style={styles.semCount}>
                        <Text style={styles.semCountText}>{lvl.count}</Text>
                        <Text style={styles.semCountLabel}>طالب</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.btn,
                  styles.executeBtn,
                  (executing || (preview.will_fill_enrollment_year === 0 && preview.will_fill_program_code === 0)) && { opacity: 0.5 },
                ]}
                onPress={handleExecute}
                disabled={executing || (preview.will_fill_enrollment_year === 0 && preview.will_fill_program_code === 0)}
                testID="execute-btn"
              >
                {executing ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="play" size={18} color="#fff" />
                    <Text style={styles.btnText}>تنفيذ الملء</Text>
                  </>
                )}
              </TouchableOpacity>

              {resultMsg ? (
                <View style={styles.successBox}>
                  <Ionicons name="checkmark-circle" size={20} color="#2e7d32" />
                  <Text style={styles.successText}>{resultMsg}</Text>
                </View>
              ) : null}
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
    backgroundColor: '#ef6c00',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 8 },
  headerSub: { color: '#ffe0b2', fontSize: 12, marginTop: 6, textAlign: 'center', lineHeight: 18 },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 10,
    gap: 8,
    marginBottom: 12,
  },
  infoText: { color: '#1565c0', fontSize: 12, lineHeight: 18, textAlign: 'right' },
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
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  statLabel: { fontSize: 13, color: '#666', flex: 1 },
  statValue: { fontSize: 14, fontWeight: '700', color: '#212121' },
  semRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    gap: 10,
  },
  semName: { fontSize: 13, fontWeight: '700', color: '#1565c0', textAlign: 'right' },
  semDates: { fontSize: 11, color: '#777', marginTop: 2, textAlign: 'right' },
  semCount: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
  },
  semCountText: { color: '#2e7d32', fontSize: 16, fontWeight: '800' },
  semCountLabel: { color: '#558b2f', fontSize: 10 },
  successBox: {
    flexDirection: 'row',
    backgroundColor: '#e8f5e9',
    padding: 12,
    borderRadius: 10,
    gap: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#a5d6a7',
  },
  successText: { color: '#2e7d32', fontSize: 13, fontWeight: '700', flex: 1, textAlign: 'right' },
});

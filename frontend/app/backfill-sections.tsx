import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import api from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';

const showAlert = (title: string, msg: string) => {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${msg}`);
  else Alert.alert(title, msg);
};

const askConfirm = async (title: string, msg: string): Promise<boolean> => {
  if (Platform.OS === 'web') return window.confirm(`${title}\n\n${msg}`);
  return new Promise((resolve) => {
    Alert.alert(title, msg, [
      { text: 'إلغاء', style: 'cancel', onPress: () => resolve(false) },
      { text: 'متابعة', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
};

export default function BackfillSectionsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'admin') {
      showAlert('غير مصرح', 'لمدير النظام فقط');
      router.back();
      return;
    }
    void runPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const runPreview = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/backfill-sections/preview');
      setPreview(res.data);
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'فشل الفحص');
    } finally { setLoading(false); }
  };

  const run = async () => {
    if (!preview?.candidates_count) {
      showAlert('لا حاجة', 'لا توجد مقررات تحتاج تعبئة الشعبة');
      return;
    }
    const ok = await askConfirm('تأكيد', `سيتم تحديث ${preview.candidates_count} مقرر بحقل الشعبة المستخرج من الاسم. هل تريد المتابعة؟`);
    if (!ok) return;
    try {
      setRunning(true);
      const res = await api.post('/admin/backfill-sections');
      setLastResult(res.data);
      showAlert('تم', `تم تحديث ${res.data.updated} مقرر`);
      await runPreview();
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'فشل التشغيل');
    } finally { setRunning(false); }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'تعبئة شُعب المقررات', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={styles.header}>
            <Ionicons name="construct" size={28} color="#fff" />
            <Text style={styles.headerTitle}>تعبئة شُعب المقررات من الاسم</Text>
            <Text style={styles.headerSub}>
              أداة لمرة واحدة: تستخرج اسم الشعبة من قوسي نهاية اسم المقرر (مثال: "الفقه الإسلامي (أ)") وتحفظه في حقل الشعبة
            </Text>
          </View>

          <View style={styles.section}>
            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={18} color="#1565c0" />
              <Text style={styles.infoText}>
                هذه الأداة تعالج مشكلة قديمة: بعض المقررات اسمها يحتوي الشعبة بين قوسين لكن حقل الشعبة نفسه فارغ، فلا تظهر الشعبة في العبء التدريسي والتقارير. بعد التشغيل مرة واحدة لن تحتاج إعادتها.
              </Text>
            </View>

            <Text style={styles.sectionTitle}>الفحص الحالي</Text>
            {loading ? (
              <View style={styles.center}><ActivityIndicator size="large" color="#1565c0" /></View>
            ) : preview ? (
              <View style={styles.stats}>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{preview.total_courses}</Text>
                  <Text style={styles.statLabel}>إجمالي المقررات</Text>
                </View>
                <View style={[styles.statCard, preview.candidates_count > 0 && { borderColor: '#ef6c00', backgroundColor: '#fff3e0' }]}>
                  <Text style={[styles.statValue, preview.candidates_count > 0 && { color: '#ef6c00' }]}>
                    {preview.candidates_count}
                  </Text>
                  <Text style={styles.statLabel}>مقررات تحتاج تعبئة</Text>
                </View>
              </View>
            ) : null}

            <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={runPreview} disabled={loading || running}>
              <Ionicons name="refresh" size={18} color="#1565c0" />
              <Text style={[styles.btnText, { color: '#1565c0' }]}>إعادة الفحص</Text>
            </TouchableOpacity>

            {preview && preview.candidates_count > 0 && (
              <>
                <Text style={styles.sectionTitle}>أمثلة من المقررات المكتشفة ({Math.min(preview.candidates.length, preview.candidates_count)}):</Text>
                <View style={styles.list}>
                  {preview.candidates.map((c: any) => (
                    <View key={c.course_id} style={styles.row}>
                      <Text style={styles.rowName}>{c.current_name}</Text>
                      <Text style={styles.rowSection}>← الشعبة: <Text style={{ fontWeight: '700', color: '#1565c0' }}>{c.extracted_section}</Text></Text>
                    </View>
                  ))}
                  {preview.truncated && (
                    <Text style={{ fontSize: 11, color: '#888', textAlign: 'center', marginTop: 8 }}>
                      ...و {preview.candidates_count - 50} مقرر آخر
                    </Text>
                  )}
                </View>

                <TouchableOpacity style={[styles.btn, styles.btnPrimary, running && { opacity: 0.6 }]} onPress={run} disabled={running}>
                  {running ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <Ionicons name="checkmark-done" size={18} color="#fff" />
                      <Text style={styles.btnText}>تنفيذ التعبئة على {preview.candidates_count} مقرر</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}

            {preview && preview.candidates_count === 0 && (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={32} color="#2e7d32" />
                <Text style={styles.successText}>جميع المقررات بخير</Text>
                <Text style={styles.successSub}>لا توجد مقررات بحاجة لتعبئة الشعبة</Text>
              </View>
            )}

            {lastResult && (
              <View style={{ marginTop: 16, padding: 12, backgroundColor: '#e3f2fd', borderRadius: 8 }}>
                <Text style={{ color: '#1565c0', fontWeight: '700', textAlign: 'right' }}>
                  آخر تنفيذ: تم تحديث {lastResult.updated} مقرر ✓
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  center: { alignItems: 'center', padding: 24 },
  header: { backgroundColor: '#7b1fa2', padding: 18, alignItems: 'center', borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 8 },
  headerSub: { color: '#e1bee7', fontSize: 12, marginTop: 6, textAlign: 'center', paddingHorizontal: 16 },
  section: { paddingHorizontal: 16, marginTop: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#1565c0', marginBottom: 10, marginTop: 14, textAlign: 'right' },
  infoBox: { flexDirection: 'row', backgroundColor: '#e3f2fd', padding: 12, borderRadius: 10, gap: 8 },
  infoText: { flex: 1, color: '#1565c0', fontSize: 12, lineHeight: 18, textAlign: 'right' },
  stats: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: '#fff', padding: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#e0e0e0' },
  statValue: { fontSize: 26, fontWeight: '800', color: '#212121' },
  statLabel: { fontSize: 11, color: '#666', marginTop: 4, textAlign: 'center' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 10, marginTop: 10 },
  btnPrimary: { backgroundColor: '#7b1fa2' },
  btnSecondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#1565c0' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  list: { backgroundColor: '#fff', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#eee' },
  row: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  rowName: { fontSize: 13, color: '#333', textAlign: 'right' },
  rowSection: { fontSize: 12, color: '#666', marginTop: 2, textAlign: 'right' },
  successBox: { alignItems: 'center', padding: 24, backgroundColor: '#e8f5e9', borderRadius: 12, marginTop: 12 },
  successText: { color: '#2e7d32', fontSize: 16, fontWeight: '700', marginTop: 8 },
  successSub: { color: '#558b2f', fontSize: 12, marginTop: 4 },
});

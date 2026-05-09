import React, { useState, useEffect } from 'react';
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
import api from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';

interface PreviewData {
  ghost_completed_lectures: number;
  orphan_topic_links: number;
  orphan_manual_confirmations: number;
  total_to_fix: number;
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
      { text: 'متابعة', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
};

export default function CleanupGhostCompletionsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!user) return;
    if (!isAdmin) {
      showAlert('غير مصرح', 'هذه العملية لمدير النظام فقط');
      router.back();
      return;
    }
    void runPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const runPreview = async () => {
    try {
      setLoading(true);
      setLastResult(null);
      const r = await api.get('/admin/cleanup-ghost-completions/preview');
      setPreview(r.data);
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'تعذر فحص البيانات');
    } finally {
      setLoading(false);
    }
  };

  const runCleanup = async () => {
    const fixable = preview
      ? preview.ghost_completed_lectures + preview.orphan_topic_links
      : 0;
    if (!preview || fixable === 0) {
      showAlert('لا حاجة للتنظيف', 'لا توجد محاضرات بحاجة لإعادة ضبط');
      return;
    }
    const ok = await askConfirm(
      'تأكيد إعادة الضبط',
      `سيتم إصلاح ${preview.ghost_completed_lectures + preview.orphan_topic_links} عنصر:\n` +
        `• ${preview.ghost_completed_lectures} محاضرة "مكتملة" بدون عنوان درس → ستُعاد إلى مجدولة\n` +
        `• ${preview.orphan_topic_links} ربط درس يتيم بدون عنوان → سيُلغى ربطها\n\n` +
        (preview.orphan_manual_confirmations > 0
          ? `ملاحظة: لن يتم لمس ${preview.orphan_manual_confirmations} تأكيد يدوي (قد يكون مشروعاً).\n\n`
          : '') +
        `لن يتم حذف أي محاضرة أو موضوع — فقط إعادة الحالة لتعكس الواقع.`,
    );
    if (!ok) return;
    try {
      setCleaning(true);
      const r = await api.post('/admin/cleanup-ghost-completions');
      setLastResult(r.data);
      showAlert('تمت العملية', 'تم إصلاح الإنجازات الوهمية بنجاح');
      await runPreview();
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'فشل التنظيف');
    } finally {
      setCleaning(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{ title: 'تنظيف الإنجازات الوهمية', headerBackTitle: 'رجوع' }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={styles.headerCard}>
            <Ionicons name="construct" size={28} color="#fff" />
            <Text style={styles.headerTitle}>تنظيف الإنجازات الوهمية</Text>
            <Text style={styles.headerSub}>
              إصلاح نسب إنجاز الخطط الدراسية المتأثرة ببيانات قديمة
            </Text>
          </View>

          <View style={styles.section}>
            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={20} color="#1565c0" />
              <Text style={styles.infoText}>
                تستخدم هذه الأداة لإصلاح البيانات الموروثة من قبل تطبيق إصلاح
                "ghost completion". محاضرات بحالة "مكتملة" بدون عنوان درس فعلي،
                وروابط مواضيع يتيمة، وتأكيدات يدوية بلا أساس فعلي. لن تحتاجها
                مجدداً بعد التنفيذ الأول.
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>الحالة الحالية</Text>

            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" color="#1565c0" />
                <Text style={{ marginTop: 8, color: '#666' }}>جارٍ الفحص...</Text>
              </View>
            ) : preview ? (
              <View style={styles.statsGrid}>
                <View
                  style={[
                    styles.statCard,
                    preview.ghost_completed_lectures > 0 && styles.statCardDanger,
                  ]}
                  testID="ghost-lectures-card"
                >
                  <Text
                    style={[
                      styles.statValue,
                      preview.ghost_completed_lectures > 0 && { color: '#c62828' },
                    ]}
                  >
                    {preview.ghost_completed_lectures}
                  </Text>
                  <Text style={styles.statLabel}>محاضرات "مكتملة" بلا عنوان</Text>
                </View>
                <View
                  style={[
                    styles.statCard,
                    preview.orphan_topic_links > 0 && styles.statCardDanger,
                  ]}
                  testID="orphan-links-card"
                >
                  <Text
                    style={[
                      styles.statValue,
                      preview.orphan_topic_links > 0 && { color: '#c62828' },
                    ]}
                  >
                    {preview.orphan_topic_links}
                  </Text>
                  <Text style={styles.statLabel}>روابط مواضيع يتيمة</Text>
                </View>
                <View
                  style={[
                    styles.statCard,
                    preview.orphan_manual_confirmations > 0 && styles.statCardDanger,
                  ]}
                  testID="orphan-confirms-card"
                >
                  <Text
                    style={[
                      styles.statValue,
                      preview.orphan_manual_confirmations > 0 && { color: '#c62828' },
                    ]}
                  >
                    {preview.orphan_manual_confirmations}
                  </Text>
                  <Text style={styles.statLabel}>تأكيدات يدوية يتيمة</Text>
                </View>
              </View>
            ) : (
              <Text style={styles.emptyText}>لم يتم الفحص بعد</Text>
            )}

            <TouchableOpacity
              style={[styles.btn, styles.btnSecondary, loading && { opacity: 0.6 }]}
              onPress={runPreview}
              disabled={loading || cleaning}
              testID="refresh-preview-btn"
            >
              <Ionicons name="refresh" size={18} color="#1565c0" />
              <Text style={[styles.btnText, { color: '#1565c0' }]}>إعادة الفحص</Text>
            </TouchableOpacity>
          </View>

          {preview && (
            <View style={styles.section}>
              {preview.ghost_completed_lectures + preview.orphan_topic_links > 0 ? (
                <>
                  <View style={styles.warningBox}>
                    <Ionicons name="warning" size={20} color="#e65100" />
                    <Text style={styles.warningText}>
                      توجد {preview.ghost_completed_lectures + preview.orphan_topic_links} حالة تحتاج إصلاح. اضغط الزر أدناه
                      لإعادة ضبط البيانات.
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnDanger, cleaning && { opacity: 0.6 }]}
                    onPress={runCleanup}
                    disabled={cleaning || loading}
                    testID="run-cleanup-btn"
                  >
                    {cleaning ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="construct" size={18} color="#fff" />
                        <Text style={styles.btnText}>
                          إصلاح {preview.ghost_completed_lectures + preview.orphan_topic_links} عنصر
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <View style={styles.successBox}>
                  <Ionicons name="checkmark-circle" size={32} color="#2e7d32" />
                  <Text style={styles.successText}>قاعدة البيانات نظيفة</Text>
                  <Text style={styles.successSubText}>
                    لا توجد إنجازات وهمية. لا حاجة لتشغيل الأداة.
                  </Text>
                </View>
              )}
            </View>
          )}

          {lastResult && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>نتيجة آخر إصلاح</Text>
              <View style={styles.resultBox}>
                <Text style={styles.resultLine}>
                  محاضرات أُعيدت إلى "مجدولة":{' '}
                  <Text style={{ fontWeight: '700', color: '#2e7d32' }}>
                    {lastResult.lectures_reverted_to_scheduled}
                  </Text>
                </Text>
                <Text style={styles.resultLine}>
                  روابط مواضيع أُلغيت:{' '}
                  <Text style={{ fontWeight: '700', color: '#2e7d32' }}>
                    {lastResult.lecture_topic_links_cleared}
                  </Text>
                </Text>
                <Text style={styles.resultLine}>
                  تأكيدات يدوية أُلغيت:{' '}
                  <Text style={{ fontWeight: '700', color: '#2e7d32' }}>
                    {lastResult.manual_confirmations_unconfirmed}
                  </Text>
                </Text>
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
  center: { alignItems: 'center', padding: 24 },
  headerCard: {
    backgroundColor: '#6a1b9a',
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
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 10,
    gap: 8,
  },
  infoText: { flex: 1, color: '#1565c0', fontSize: 12, lineHeight: 18, textAlign: 'right' },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: '#fff3e0',
    padding: 12,
    borderRadius: 10,
    gap: 8,
    marginBottom: 12,
  },
  warningText: { flex: 1, color: '#e65100', fontSize: 13, lineHeight: 20, textAlign: 'right' },
  successBox: {
    backgroundColor: '#e8f5e9',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  successText: { color: '#2e7d32', fontSize: 16, fontWeight: '700', marginTop: 8 },
  successSubText: { color: '#558b2f', fontSize: 13, marginTop: 4, textAlign: 'center' },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  statCardDanger: { borderColor: '#ef5350', backgroundColor: '#ffebee' },
  statValue: { fontSize: 24, fontWeight: '800', color: '#212121' },
  statLabel: { fontSize: 11, color: '#666', marginTop: 4, textAlign: 'center' },
  emptyText: { color: '#999', textAlign: 'center', padding: 16 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  btnDanger: { backgroundColor: '#6a1b9a' },
  btnSecondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#1565c0' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  resultBox: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  resultLine: { fontSize: 13, color: '#333', marginBottom: 4, textAlign: 'right' },
});

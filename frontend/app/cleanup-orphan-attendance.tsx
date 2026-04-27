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
  total_attendance: number;
  orphans_count: number;
  deleted_lecture_orphans?: number;
  cancelled_lecture_orphans?: number;
  records_without_lecture_id: number;
  active_lectures: number;
  needs_cleanup: boolean;
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

export default function CleanupOrphanAttendanceScreen() {
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
      const r = await api.get('/admin/cleanup-orphan-attendance/preview');
      setPreview(r.data);
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'تعذر فحص البيانات');
    } finally {
      setLoading(false);
    }
  };

  const runCleanup = async () => {
    if (!preview || !preview.needs_cleanup) {
      showAlert('لا حاجة للتنظيف', 'لا توجد سجلات يتيمة في قاعدة البيانات');
      return;
    }
    const ok = await askConfirm(
      'تأكيد الحذف النهائي',
      `سيتم حذف ${preview.orphans_count} سجل حضور مرتبطاً بمحاضرات محذوفة.\n\nهذه العملية لا يمكن التراجع عنها.\n\nهل أنت متأكد؟`,
    );
    if (!ok) return;
    try {
      setCleaning(true);
      const r = await api.post('/admin/cleanup-orphan-attendance');
      setLastResult(r.data);
      showAlert(
        'تمت العملية',
        `تم حذف ${r.data.orphans_deleted} سجل حضور يتيم بنجاح`,
      );
      // Refresh preview to reflect zero orphans
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
        options={{ title: 'تنظيف سجلات الحضور اليتيمة', headerBackTitle: 'رجوع' }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Header */}
          <View style={styles.headerCard}>
            <Ionicons name="trash-bin" size={28} color="#fff" />
            <Text style={styles.headerTitle}>تنظيف سجلات الحضور اليتيمة</Text>
            <Text style={styles.headerSub}>
              حذف سجلات الحضور التي بقيت مرتبطة بمحاضرات تم حذفها
            </Text>
          </View>

          {/* Info */}
          <View style={styles.section}>
            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={20} color="#1565c0" />
              <Text style={styles.infoText}>
                هذه الأداة تُستخدم لإصلاح البيانات الموروثة قبل إصلاح bug حذف
                المحاضرات. بعد تنفيذها لن تحتاج لتشغيلها مجدداً إلا إذا حدث خطأ
                مماثل في المستقبل.
              </Text>
            </View>
          </View>

          {/* Preview / status */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>الحالة الحالية</Text>

            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" color="#1565c0" />
                <Text style={{ marginTop: 8, color: '#666' }}>جارٍ الفحص...</Text>
              </View>
            ) : preview ? (
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{preview.total_attendance}</Text>
                  <Text style={styles.statLabel}>إجمالي سجلات الحضور</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{preview.active_lectures}</Text>
                  <Text style={styles.statLabel}>محاضرات نشطة</Text>
                </View>
                <View
                  style={[
                    styles.statCard,
                    preview.orphans_count > 0 && styles.statCardDanger,
                  ]}
                  testID="orphan-count-card"
                >
                  <Text
                    style={[
                      styles.statValue,
                      preview.orphans_count > 0 && { color: '#c62828' },
                    ]}
                  >
                    {preview.orphans_count}
                  </Text>
                  <Text
                    style={[
                      styles.statLabel,
                      preview.orphans_count > 0 && { color: '#c62828' },
                    ]}
                  >
                    سجلات يتيمة (للحذف)
                  </Text>
                  {(preview.deleted_lecture_orphans !== undefined ||
                    preview.cancelled_lecture_orphans !== undefined) && (
                    <Text style={styles.statSubLabel}>
                      محذوفة: {preview.deleted_lecture_orphans ?? 0} | ملغاة:{' '}
                      {preview.cancelled_lecture_orphans ?? 0}
                    </Text>
                  )}
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>
                    {preview.records_without_lecture_id}
                  </Text>
                  <Text style={styles.statLabel}>سجلات قديمة (بدون lecture_id)</Text>
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
              <Text style={[styles.btnText, { color: '#1565c0' }]}>
                إعادة الفحص
              </Text>
            </TouchableOpacity>
          </View>

          {/* Action area */}
          {preview && (
            <View style={styles.section}>
              {preview.needs_cleanup ? (
                <>
                  <View style={styles.warningBox}>
                    <Ionicons name="warning" size={20} color="#e65100" />
                    <Text style={styles.warningText}>
                      توجد {preview.orphans_count} سجل حضور مرتبط بمحاضرات محذوفة.
                      اضغط الزر أدناه لحذفها.
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
                        <Ionicons name="trash" size={18} color="#fff" />
                        <Text style={styles.btnText}>
                          حذف {preview.orphans_count} سجل يتيم
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
                    لا توجد سجلات حضور يتيمة. لا حاجة لتشغيل الأداة.
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Last result */}
          {lastResult && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>نتيجة آخر تنظيف</Text>
              <View style={styles.resultBox}>
                <Text style={styles.resultLine}>
                  المحذوف:{' '}
                  <Text style={{ fontWeight: '700', color: '#2e7d32' }}>
                    {lastResult.orphans_deleted}
                  </Text>{' '}
                  سجل
                </Text>
                <Text style={styles.resultLine}>
                  قبل التنظيف: {lastResult.total_attendance_before} سجل
                </Text>
                <Text style={styles.resultLine}>
                  محاضرات نشطة: {lastResult.active_lectures}
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
    backgroundColor: '#c62828',
    padding: 18,
    alignItems: 'center',
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 8 },
  headerSub: {
    color: '#ffcdd2',
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
  statSubLabel: { fontSize: 10, color: '#888', marginTop: 4, textAlign: 'center' },
  emptyText: { color: '#999', textAlign: 'center', padding: 16 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  btnDanger: { backgroundColor: '#c62828' },
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

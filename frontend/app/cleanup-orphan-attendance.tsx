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
  TextInput,
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

interface OrphanDetail {
  attendance_id: string;
  lecture_id: string | null;
  course_id: string;
  student_id: string;
  date: string;
  status: string;
  method: string;
  created_at: string;
  recorded_by: string;
  orphan_type: string;
  course_name: string;
  course_code: string;
  student_name: string;
  student_academic_id: string;
  recorded_by_name: string;
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
  // 🆕 بحث تشخيصي عن سجلات طالب محدد (قراءة فقط) - لمعرفة سبب ظهور غياب لمحاضرة غير واضحة
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [studentsMatched, setStudentsMatched] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  // 🆕 عرض تفصيلي آمن (قراءة فقط) لكل سجل يتيم: الطالب/المقرر/التاريخ
  const [details, setDetails] = useState<OrphanDetail[] | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  // 🆕 فحص شامل تجريبي (Dry Run) لكل سجلات الحضور الوهمية في الجامعة
  const [ghostScan, setGhostScan] = useState<any | null>(null);
  const [scanning, setScanning] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fixResult, setFixResult] = useState<any | null>(null);

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

  const loadDetails = async () => {
    try {
      setLoadingDetails(true);
      const r = await api.get('/admin/cleanup-orphan-attendance/details');
      setDetails(r.data.orphans || []);
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'تعذر جلب التفاصيل');
    } finally {
      setLoadingDetails(false);
    }
  };

  const searchStudent = async () => {
    if (!searchQuery.trim()) return;
    try {
      setSearching(true);
      setSearchResults(null);
      setStudentsMatched(null);
      const r = await api.get('/admin/attendance-lookup', { params: { student_query: searchQuery.trim() } });
      setStudentsMatched(r.data.students_matched ?? 0);
      setSearchResults(r.data.results || []);
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'تعذر البحث');
    } finally {
      setSearching(false);
    }
  };

  const runGhostScan = async () => {
    try {
      setScanning(true);
      setGhostScan(null);
      setFixResult(null);
      const r = await api.get('/admin/attendance-diagnostics/ghost-date-scan');
      setGhostScan(r.data);
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'تعذر إجراء الفحص الشامل');
    } finally {
      setScanning(false);
    }
  };

  const runGhostFix = async () => {
    if (!ghostScan || ghostScan.mismatched_total <= 0) return;
    const ok = await askConfirm(
      'تأكيد التصحيح الفعلي',
      `سيتم تصحيح تاريخ ${ghostScan.mismatched_total} سجل حضور ليطابق تاريخ محاضرته الحقيقي.\n\nلن تتغيّر حالة أي طالب (حاضر/غائب) إطلاقاً — فقط حقل التاريخ.\n\nهذه العملية لا يمكن التراجع عنها. هل أنت متأكد؟`,
    );
    if (!ok) return;
    try {
      setFixing(true);
      const r = await api.post('/admin/attendance-diagnostics/ghost-date-fix', null, { params: { confirm: true } });
      setFixResult(r.data);
      showAlert('تمت العملية', `تم تصحيح تاريخ ${r.data.fixed} سجل حضور بنجاح`);
      await runGhostScan();
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'فشل التصحيح');
    } finally {
      setFixing(false);
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

            {preview && preview.orphans_count > 0 && (
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary, { marginTop: 10 }, loadingDetails && { opacity: 0.6 }]}
                onPress={loadDetails}
                disabled={loadingDetails}
                testID="load-orphan-details-btn"
              >
                {loadingDetails ? <ActivityIndicator color="#1565c0" /> : <Ionicons name="list" size={18} color="#1565c0" />}
                <Text style={[styles.btnText, { color: '#1565c0' }]}>عرض تفاصيل السجلات اليتيمة (قراءة فقط)</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 🆕 قائمة تفصيلية بالسجلات اليتيمة - عرض فقط، لا تعديل */}
          {details && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>تفاصيل السجلات اليتيمة ({details.length})</Text>
              {details.length === 0 ? (
                <Text style={styles.emptyText}>لا توجد تفاصيل لعرضها</Text>
              ) : (
                details.map((o) => (
                  <View key={o.attendance_id} style={styles.detailCard} testID={`orphan-detail-${o.attendance_id}`}>
                    <Text style={styles.detailLine}>الطالب: <Text style={styles.detailBold}>{o.student_name || o.student_id}</Text> {o.student_academic_id ? `(${o.student_academic_id})` : ''}</Text>
                    <Text style={styles.detailLine}>المقرر: <Text style={styles.detailBold}>{o.course_name || o.course_id}</Text> {o.course_code ? `(${o.course_code})` : ''}</Text>
                    <Text style={styles.detailLine}>التاريخ: <Text style={styles.detailBold}>{o.date}</Text> — الحالة: <Text style={styles.detailBold}>{o.status}</Text></Text>
                    <Text style={styles.detailLine}>نوع اليُتم: <Text style={[styles.detailBold, { color: '#c62828' }]}>{o.orphan_type}</Text></Text>
                    <Text style={styles.detailLine}>سُجِّل بواسطة: {o.recorded_by_name || o.recorded_by || '—'} — طريقة: {o.method || '—'}</Text>
                    <Text style={styles.detailLine}>تاريخ الإنشاء: {o.created_at || '—'}</Text>
                    <Text style={styles.detailLineMuted}>lecture_id: {o.lecture_id || '(بدون)'}</Text>
                  </View>
                ))
              )}
            </View>
          )}

          {/* 🆕 بحث تشخيصي عن طالب محدد - قراءة فقط، لحالات غياب غير مفهومة لم تُصنَّف كـ"يتيمة" */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>بحث عن سجلات حضور طالب محدد (تشخيص فقط)</Text>
            <Text style={styles.emptyText}>
              اكتب اسم الطالب أو رقم القيد — يعرض كل محاضرة مرتبطة بسجلات حضوره مع حالتها الحالية الحقيقية
              وأي طلب تعديل حضور اعتُمد عليها، دون حذف أو تعديل أي شيء.
            </Text>
            <View style={styles.searchRow}>
              <TextInput
                style={styles.searchInput}
                placeholder="اسم الطالب أو رقم القيد"
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={searchStudent}
                testID="attendance-lookup-input"
              />
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, { flex: 0, paddingHorizontal: 18 }, searching && { opacity: 0.6 }]}
                onPress={searchStudent}
                disabled={searching}
                testID="attendance-lookup-search-btn"
              >
                {searching ? <ActivityIndicator color="#fff" /> : <Ionicons name="search" size={18} color="#fff" />}
                <Text style={styles.btnText}>بحث</Text>
              </TouchableOpacity>
            </View>

            {searchResults && (
              searchResults.length === 0 ? (
                <Text style={styles.emptyText}>
                  {studentsMatched === 0
                    ? 'لم يتم العثور على أي طالب بهذا الاسم/الرقم — تحقق من الإملاء أو جرّب رقم القيد مباشرة'
                    : 'تم العثور على الطالب، لكن لا توجد له أي سجلات حضور إطلاقاً'}
                </Text>
              ) : (
                searchResults.map((r: any) => (
                  <View key={r.attendance_id} style={styles.detailCard} testID={`lookup-result-${r.attendance_id}`}>
                    <Text style={styles.detailLine}>الطالب: <Text style={styles.detailBold}>{r.student_name}</Text> ({r.student_number})</Text>
                    <Text style={styles.detailLine}>المقرر: <Text style={styles.detailBold}>{r.course_name}</Text> ({r.course_code})</Text>
                    <Text style={styles.detailLine}>تاريخ سجل الحضور: <Text style={styles.detailBold}>{r.attendance_date}</Text> — الحالة: <Text style={styles.detailBold}>{r.attendance_status}</Text> — طريقة: {r.method}</Text>
                    <Text style={[styles.detailLine, { color: r.lecture_exists ? '#2e7d32' : '#c62828' }]}>
                      المحاضرة المرجعية: {r.lecture_exists ? 'موجودة فعلاً' : 'غير موجودة (محذوفة)'}
                      {r.lecture_exists && ` — حالتها الآن: ${r.lecture_current_status} — تاريخها الحالي: ${r.lecture_current_date}`}
                    </Text>
                    {r.lecture_last_rescheduled_from && (
                      <Text style={styles.detailLine}>⚠️ أُعيدت جدولة هذه المحاضرة سابقاً من تاريخ: <Text style={styles.detailBold}>{r.lecture_last_rescheduled_from}</Text> بواسطة: {r.lecture_rescheduled_by_name || '—'}</Text>
                    )}
                    {r.lecture_cancellation_reason && (
                      <Text style={styles.detailLine}>سبب الإلغاء المسجَّل: {r.lecture_cancellation_reason}</Text>
                    )}
                    {r.change_requests.length > 0 && (
                      <View style={{ marginTop: 6, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 6 }}>
                        <Text style={styles.detailLineMuted}>طلبات تعديل حضور مرتبطة:</Text>
                        {r.change_requests.map((cr: any) => (
                          <Text key={cr.id} style={styles.detailLineMuted}>
                            • طلب بواسطة {cr.requested_by_name} ({cr.old_status || '—'} ← {cr.new_status}) — الحالة: {cr.status}
                            {cr.reviewed_by_name ? ` — اعتمدها: ${cr.reviewed_by_name} في ${cr.reviewed_at}` : ''}
                          </Text>
                        ))}
                      </View>
                    )}
                    {r.lecture_change_history && r.lecture_change_history.length > 0 ? (
                      <View style={{ marginTop: 6, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 6 }} testID={`lecture-change-history-${r.attendance_id}`}>
                        <Text style={styles.detailLineMuted}>سجل تغييرات هذه المحاضرة (من/إلى/بواسطة/متى):</Text>
                        {r.lecture_change_history.map((ch: any, idx: number) => (
                          <Text key={idx} style={styles.detailLineMuted}>
                            • {ch.action} بواسطة {ch.by_name || '—'} في {ch.at}
                            {Object.entries(ch.changes || {}).map(([field, fc]: any) => ` — ${field}: ${fc.from} ← ${fc.to}`).join('')}
                            {ch.reason ? ` — السبب: ${ch.reason}` : ''}
                          </Text>
                        ))}
                      </View>
                    ) : r.lecture_exists ? (
                      <Text style={[styles.detailLineMuted, { marginTop: 6 }]} testID={`lecture-change-history-empty-${r.attendance_id}`}>
                        لا يوجد سجل تغييرات مسجَّل لهذه المحاضرة (لم تُعدَّل عبر شاشة "تعديل محاضرة" العادية — إن كان تاريخها قد تغيّر فعلياً فهذا يعني أن التغيير حدث عبر مسار آخر غير مُسجَّل).
                      </Text>
                    ) : null}
                  </View>
                ))
              )
            )}
          </View>

          {/* 🆕 فحص شامل تجريبي (Dry Run) لكل سجلات الحضور الوهمية في الجامعة - قراءة فقط */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>فحص شامل للحضور الوهمي في كل الجامعة (تجريبي — Dry Run)</Text>
            <Text style={styles.emptyText}>
              يفحص كل سجلات الحضور ويقارن تاريخ كل سجل بتاريخ محاضرته الحقيقي، ويُبلّغ عن كل اختلاف دون
              حذف أو تعديل أي شيء — لمعرفة الحجم الكامل لعطل "الحضور الوهمي" قبل أي تصحيح فعلي.
            </Text>
            <TouchableOpacity
              style={[styles.btn, styles.btnSecondary, scanning && { opacity: 0.6 }]}
              onPress={runGhostScan}
              disabled={scanning}
              testID="run-ghost-date-scan-btn"
            >
              {scanning ? <ActivityIndicator color="#1565c0" /> : <Ionicons name="search-circle" size={18} color="#1565c0" />}
              <Text style={[styles.btnText, { color: '#1565c0' }]}>
                {scanning ? 'جارٍ الفحص الشامل... قد يستغرق دقيقة' : 'بدء الفحص الشامل (Dry Run)'}
              </Text>
            </TouchableOpacity>

            {ghostScan && (
              <View style={{ marginTop: 14 }} testID="ghost-date-scan-results">
                <View style={styles.statsGrid}>
                  <View style={styles.statCard}>
                    <Text style={styles.statValue}>{ghostScan.scanned_total}</Text>
                    <Text style={styles.statLabel}>إجمالي السجلات المفحوصة</Text>
                  </View>
                  <View style={[styles.statCard, ghostScan.mismatched_total > 0 && styles.statCardDanger]}>
                    <Text style={[styles.statValue, ghostScan.mismatched_total > 0 && { color: '#c62828' }]}>
                      {ghostScan.mismatched_total}
                    </Text>
                    <Text style={[styles.statLabel, ghostScan.mismatched_total > 0 && { color: '#c62828' }]}>
                      سجل حضور وهمي (تاريخ مختلف عن محاضرته)
                    </Text>
                  </View>
                </View>
                {ghostScan.mismatched_total > 0 && (
                  <Text style={[styles.emptyText, { marginTop: 6 }]}>
                    يعرض أدناه عينة من أول {ghostScan.sample_returned} سجلاً من أصل {ghostScan.mismatched_total}. هذا فحص تجريبي فقط — لم يُعدَّل أي سجل.
                  </Text>
                )}
                {ghostScan.breakdown && ghostScan.mismatched_total > 0 && (
                  <View style={styles.detailCard} testID="ghost-scan-breakdown">
                    <Text style={[styles.detailLine, styles.detailBold]}>تحليل التوزيع (لمعرفة السبب الأرجح):</Text>
                    <Text style={styles.detailLineMuted}>
                      حسب الطريقة (method): {Object.entries(ghostScan.breakdown.by_method).map(([k, v]: any) => `${k}: ${v}`).join(' — ')}
                    </Text>
                    <Text style={styles.detailLineMuted}>
                      حسب فرق الأيام: {Object.entries(ghostScan.breakdown.by_days_diff_bucket).map(([k, v]: any) => `${k}: ${v}`).join(' — ')}
                    </Text>
                    {ghostScan.breakdown.top_stored_dates?.length > 0 && (
                      <Text style={styles.detailLineMuted}>
                        أكثر "تواريخ مسجَّلة وهمياً" تكراراً: {ghostScan.breakdown.top_stored_dates.map((d: any) => `${d.date} (${d.count})`).join(' — ')}
                        {'  '}← إن تركّز العدد الأكبر في تاريخ واحد أو قلة تواريخ، فالسبب الأرجح عملية جماعية واحدة (مثل أداة إدارية نُفِّذت في ذلك اليوم)، وليس آلاف الحالات الفردية المتفرقة.
                      </Text>
                    )}
                    {ghostScan.breakdown.top_courses?.length > 0 && (
                      <Text style={styles.detailLineMuted}>
                        أكثر المقررات تأثراً: {ghostScan.breakdown.top_courses.map((c: any) => `${c.course_name || c.course_id} (${c.count})`).join(' — ')}
                      </Text>
                    )}
                  </View>
                )}

                {ghostScan.mismatched_total > 0 && (
                  <View style={[styles.warningBox, { marginTop: 10 }]}>
                    <Ionicons name="construct" size={20} color="#e65100" />
                    <Text style={styles.warningText}>
                      التصحيح يُعدِّل حقل التاريخ فقط لكل سجل — لن تتغيّر حالة أي طالب (حاضر/غائب) إطلاقاً.
                    </Text>
                  </View>
                )}
                {ghostScan.mismatched_total > 0 && (
                  <TouchableOpacity
                    style={[styles.btn, styles.btnDanger, { marginTop: 10 }, fixing && { opacity: 0.6 }]}
                    onPress={runGhostFix}
                    disabled={fixing}
                    testID="run-ghost-date-fix-btn"
                  >
                    {fixing ? <ActivityIndicator color="#fff" /> : <Ionicons name="build" size={18} color="#fff" />}
                    <Text style={styles.btnText}>
                      {fixing ? 'جارٍ التصحيح... قد يستغرق دقيقة' : `تنفيذ التصحيح الفعلي الآن (${ghostScan.mismatched_total} سجل)`}
                    </Text>
                  </TouchableOpacity>
                )}
                {fixResult && (
                  <View style={[styles.statCard, { marginTop: 10, backgroundColor: '#e8f5e9' }]} testID="ghost-date-fix-result">
                    <Text style={[styles.statValue, { color: '#2e7d32' }]}>{fixResult.fixed}</Text>
                    <Text style={styles.statLabel}>سجل تم تصحيح تاريخه بنجاح</Text>
                  </View>
                )}
                {ghostScan.sample.map((m: any) => (
                  <View key={m.attendance_id} style={styles.detailCard} testID={`ghost-scan-row-${m.attendance_id}`}>
                    <Text style={styles.detailLine}>الطالب: <Text style={styles.detailBold}>{m.student_name || m.student_id}</Text> — المقرر: <Text style={styles.detailBold}>{m.course_name || m.course_id}</Text></Text>
                    <Text style={styles.detailLine}>الحالة: <Text style={styles.detailBold}>{m.status}</Text> — طريقة: {m.method}</Text>
                    <Text style={[styles.detailLine, { color: '#c62828' }]}>التاريخ المسجَّل (الوهمي): <Text style={styles.detailBold}>{m.stored_date}</Text></Text>
                    <Text style={[styles.detailLine, { color: '#2e7d32' }]}>تاريخ المحاضرة الحقيقي: <Text style={styles.detailBold}>{m.lecture_actual_date}</Text> (فرق {m.days_diff} يوماً)</Text>
                  </View>
                ))}
              </View>
            )}
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
  btnPrimary: { backgroundColor: '#1565c0' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  searchRow: { flexDirection: 'row-reverse', gap: 10, marginTop: 12, marginBottom: 14 },
  searchInput: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, textAlign: 'right' },
  resultBox: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  resultLine: { fontSize: 13, color: '#333', marginBottom: 4, textAlign: 'right' },
  detailCard: { backgroundColor: '#fff', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 10 },
  detailLine: { fontSize: 12.5, color: '#444', marginBottom: 4, textAlign: 'right' },
  detailBold: { fontWeight: '800', color: '#1a1a1a' },
  detailLineMuted: { fontSize: 10.5, color: '#999', textAlign: 'right', marginTop: 2 },
});

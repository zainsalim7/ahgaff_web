import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import api, { coursesAPI } from '../src/services/api';
import { useAuthStore } from '../src/store/authStore';

interface Topic {
  id?: string;
  title: string;
  notes?: string;
  completed?: boolean;
  completed_date?: string;
}

interface Week {
  week_number: number;
  topics: Topic[];
  total_topics?: number;
  completed_topics?: number;
  completion_percent?: number;
}

interface StudyPlan {
  course_id: string;
  weeks: Week[];
  total_topics?: number;
  completed_topics?: number;
  completion_percent?: number;
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
      { text: 'متابعة', onPress: () => resolve(true) },
    ]);
  });
};

export default function ManageStudyPlanScreen() {
  const router = useRouter();
  const { courseId, courseName } = useLocalSearchParams<{ courseId: string; courseName?: string }>();
  const currentUser = useAuthStore((s) => s.user);
  const isTeacher = currentUser?.role === 'teacher';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState<StudyPlan>({ course_id: courseId || '', weeks: [] });
  const [course, setCourse] = useState<any>(null);

  // Import modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importReplace, setImportReplace] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  // Clone modal
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [cloneCourses, setCloneCourses] = useState<any[]>([]);
  const [cloneLoading, setCloneLoading] = useState(false);
  const [cloneSourceId, setCloneSourceId] = useState('');
  const [cloneReplace, setCloneReplace] = useState(false);
  const [cloneSearch, setCloneSearch] = useState('');
  const [cloning, setCloning] = useState(false);

  const fetchPlan = useCallback(async () => {
    if (!courseId) return;
    try {
      setLoading(true);
      const res = await api.get(`/courses/${courseId}/study-plan`);
      setPlan(res.data || { course_id: courseId, weeks: [] });
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'فشل تحميل الخطة الدراسية');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  const fetchCourse = useCallback(async () => {
    if (!courseId) return;
    try {
      const res = await coursesAPI.getAll();
      const c = (res.data || []).find((x: any) => x.id === courseId);
      if (c) setCourse(c);
    } catch {}
  }, [courseId]);

  useEffect(() => {
    void fetchPlan();
    void fetchCourse();
  }, [fetchPlan, fetchCourse]);

  // ---------- Manual editing helpers ----------
  const addWeek = () => {
    const nextNum = plan.weeks.length > 0 ? Math.max(...plan.weeks.map(w => w.week_number)) + 1 : 1;
    setPlan({ ...plan, weeks: [...plan.weeks, { week_number: nextNum, topics: [{ title: '', notes: '' }] }] });
  };

  const deleteWeek = async (idx: number) => {
    const ok = await askConfirm('حذف الأسبوع', `هل تريد حذف الأسبوع ${plan.weeks[idx].week_number} وكل مواضيعه؟`);
    if (!ok) return;
    const next = plan.weeks.slice();
    next.splice(idx, 1);
    setPlan({ ...plan, weeks: next });
  };

  const updateWeekNumber = (idx: number, value: string) => {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 1) return;
    const next = plan.weeks.slice();
    next[idx] = { ...next[idx], week_number: num };
    setPlan({ ...plan, weeks: next });
  };

  const addTopic = (weekIdx: number) => {
    const next = plan.weeks.slice();
    next[weekIdx] = {
      ...next[weekIdx],
      topics: [...next[weekIdx].topics, { title: '', notes: '' }],
    };
    setPlan({ ...plan, weeks: next });
  };

  const updateTopic = (weekIdx: number, topicIdx: number, field: 'title' | 'notes', value: string) => {
    const next = plan.weeks.slice();
    const topics = next[weekIdx].topics.slice();
    topics[topicIdx] = { ...topics[topicIdx], [field]: value };
    next[weekIdx] = { ...next[weekIdx], topics };
    setPlan({ ...plan, weeks: next });
  };

  const deleteTopic = (weekIdx: number, topicIdx: number) => {
    const next = plan.weeks.slice();
    const topics = next[weekIdx].topics.slice();
    topics.splice(topicIdx, 1);
    next[weekIdx] = { ...next[weekIdx], topics };
    setPlan({ ...plan, weeks: next });
  };

  const handleSave = async () => {
    // Filter out empty topics
    const cleaned = plan.weeks
      .map(w => ({
        ...w,
        topics: w.topics.filter(t => (t.title || '').trim().length > 0),
      }))
      .filter(w => w.topics.length > 0);

    if (cleaned.length === 0) {
      showAlert('تنبيه', 'لا يمكن حفظ خطة فارغة. يرجى إضافة موضوع واحد على الأقل.');
      return;
    }

    try {
      setSaving(true);
      await api.put(`/courses/${courseId}/study-plan`, { weeks: cleaned });
      showAlert('تم', 'تم حفظ الخطة الدراسية بنجاح');
      await fetchPlan();
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'فشل حفظ الخطة');
    } finally {
      setSaving(false);
    }
  };

  // ---------- Excel actions ----------
  const handleDownloadTemplate = async () => {
    try {
      const res = await api.get('/template/study-plan', { responseType: 'blob' });
      if (Platform.OS === 'web') {
        const url = window.URL.createObjectURL(new Blob([res.data]));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'study_plan_template.xlsx';
        link.click();
        window.URL.revokeObjectURL(url);
      } else {
        showAlert('قيد التطوير', 'تحميل القالب متاح حالياً عبر النسخة الإلكترونية فقط');
      }
    } catch (e: any) {
      const msg = e?.response?.status === 404
        ? 'يجب إعادة نشر التطبيق لتفعيل هذه الميزة'
        : 'فشل تحميل النموذج';
      showAlert('خطأ', msg);
    }
  };

  const handleImportExcel = () => {
    if (Platform.OS !== 'web') {
      showAlert('قيد التطوير', 'استيراد Excel متاح حالياً عبر النسخة الإلكترونية فقط');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setImporting(true);
      setImportResult(null);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post(
          `/courses/${courseId}/study-plan/upload?replace=${importReplace}`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        setImportResult(res.data);
        await fetchPlan();
      } catch (error: any) {
        setImportResult({
          error: true,
          message: error.response?.data?.detail || 'فشل في الاستيراد',
        });
      } finally {
        setImporting(false);
      }
    };
    input.click();
  };

  // ---------- Clone ----------
  const openCloneModal = async () => {
    setShowCloneModal(true);
    setCloneSourceId('');
    setCloneSearch('');
    if (cloneCourses.length === 0) {
      try {
        setCloneLoading(true);
        const res = await coursesAPI.getAll();
        setCloneCourses((res.data || []).filter((c: any) => c.id !== courseId));
      } catch (e: any) {
        showAlert('خطأ', 'فشل تحميل قائمة المقررات');
      } finally {
        setCloneLoading(false);
      }
    }
  };

  const handleClone = async () => {
    if (!cloneSourceId) {
      showAlert('تنبيه', 'يجب اختيار المقرر المصدر');
      return;
    }
    const ok = await askConfirm(
      'تأكيد النسخ',
      cloneReplace
        ? 'سيتم استبدال الخطة الحالية بالخطة من المقرر المختار. هل تريد المتابعة؟'
        : 'سيتم دمج الخطة من المقرر المختار مع الخطة الحالية. هل تريد المتابعة؟'
    );
    if (!ok) return;
    try {
      setCloning(true);
      const res = await api.post(`/courses/${courseId}/study-plan/clone-from`, {
        source_course_id: cloneSourceId,
        replace: cloneReplace,
      });
      showAlert('تم', res.data?.message || 'تم النسخ بنجاح');
      setShowCloneModal(false);
      await fetchPlan();
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'فشل النسخ');
    } finally {
      setCloning(false);
    }
  };

  const filteredCloneCourses = cloneSearch.length > 0
    ? cloneCourses.filter((c: any) =>
        (c.name || '').toLowerCase().includes(cloneSearch.toLowerCase()) ||
        (c.code || '').toLowerCase().includes(cloneSearch.toLowerCase())
      )
    : cloneCourses;

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1565c0" />
          <Text style={styles.loadingText}>جاري تحميل الخطة الدراسية...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const totalTopics = plan.weeks.reduce((acc, w) => acc + w.topics.length, 0);

  return (
    <>
      <Stack.Screen options={{ title: 'إدارة الخطة الدراسية', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
          {/* Header */}
          <View style={styles.header}>
            <Ionicons name="book" size={28} color="#fff" />
            <Text style={styles.headerTitle} testID="study-plan-course-name">
              {course?.name || courseName || 'الخطة الدراسية'}
            </Text>
            {course?.code && <Text style={styles.headerSub}>{course.code}</Text>}
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{plan.weeks.length}</Text>
                <Text style={styles.statLabel}>أسبوع</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{totalTopics}</Text>
                <Text style={styles.statLabel}>موضوع</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{plan.completion_percent ?? 0}%</Text>
                <Text style={styles.statLabel}>الإنجاز</Text>
              </View>
            </View>
          </View>

          {/* Toolbar */}
          <View style={styles.toolbar}>
            <TouchableOpacity
              style={[styles.toolBtn, { backgroundColor: '#2e7d32' }]}
              onPress={handleDownloadTemplate}
              testID="download-study-plan-template-btn"
            >
              <Ionicons name="download" size={16} color="#fff" />
              <Text style={styles.toolBtnText}>تحميل القالب</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toolBtn, { backgroundColor: '#1565c0' }]}
              onPress={() => { setShowImportModal(true); setImportResult(null); setImportReplace(false); }}
              testID="import-study-plan-btn"
            >
              <Ionicons name="cloud-upload" size={16} color="#fff" />
              <Text style={styles.toolBtnText}>استيراد Excel</Text>
            </TouchableOpacity>
            {!isTeacher && (
              <TouchableOpacity
                style={[styles.toolBtn, { backgroundColor: '#7b1fa2' }]}
                onPress={openCloneModal}
                testID="clone-study-plan-btn"
              >
                <Ionicons name="copy" size={16} color="#fff" />
                <Text style={styles.toolBtnText}>نسخ من مقرر</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.toolBtn, { backgroundColor: '#ef6c00' }]}
              onPress={addWeek}
              testID="add-week-btn"
            >
              <Ionicons name="add-circle" size={16} color="#fff" />
              <Text style={styles.toolBtnText}>إضافة أسبوع</Text>
            </TouchableOpacity>
          </View>

          {/* Weeks */}
          <View style={styles.section}>
            {plan.weeks.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="book-outline" size={48} color="#bdbdbd" />
                <Text style={styles.emptyText}>لا توجد خطة دراسية بعد</Text>
                <Text style={styles.emptySub}>
                  ابدأ بإضافة أسبوع، أو استورد من Excel، أو انسخ من مقرر آخر
                </Text>
              </View>
            ) : (
              plan.weeks.map((week, weekIdx) => (
                <View key={weekIdx} style={styles.weekCard} testID={`week-card-${week.week_number}`}>
                  <View style={styles.weekHeader}>
                    <View style={styles.weekHeaderLeft}>
                      <Text style={styles.weekLabel}>الأسبوع</Text>
                      <TextInput
                        style={styles.weekNumInput}
                        value={String(week.week_number)}
                        onChangeText={(v) => updateWeekNumber(weekIdx, v)}
                        keyboardType="number-pad"
                      />
                      {(week.completion_percent ?? 0) > 0 && (
                        <View style={styles.completedBadge}>
                          <Text style={styles.completedBadgeText}>
                            {week.completed_topics}/{week.total_topics} ({week.completion_percent}%)
                          </Text>
                        </View>
                      )}
                    </View>
                    <TouchableOpacity onPress={() => deleteWeek(weekIdx)} style={styles.iconBtn}>
                      <Ionicons name="trash-outline" size={18} color="#c62828" />
                    </TouchableOpacity>
                  </View>

                  {week.topics.map((topic, topicIdx) => (
                    <View key={topicIdx} style={[styles.topicRow, topic.completed && styles.topicRowCompleted]}>
                      <View style={styles.topicNumber}>
                        <Text style={styles.topicNumberText}>{topicIdx + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <TextInput
                          style={styles.topicTitleInput}
                          value={topic.title}
                          onChangeText={(v) => updateTopic(weekIdx, topicIdx, 'title', v)}
                          placeholder="عنوان الموضوع"
                          placeholderTextColor="#bbb"
                        />
                        <TextInput
                          style={styles.topicNotesInput}
                          value={topic.notes || ''}
                          onChangeText={(v) => updateTopic(weekIdx, topicIdx, 'notes', v)}
                          placeholder="ملاحظات (اختياري)"
                          placeholderTextColor="#bbb"
                        />
                        {topic.completed && (
                          <View style={styles.completedRow}>
                            <Ionicons name="checkmark-circle" size={14} color="#2e7d32" />
                            <Text style={styles.completedText}>
                              تم الإكمال {topic.completed_date ? `بتاريخ ${topic.completed_date}` : ''}
                            </Text>
                          </View>
                        )}
                      </View>
                      <TouchableOpacity onPress={() => deleteTopic(weekIdx, topicIdx)} style={styles.iconBtn}>
                        <Ionicons name="close-circle" size={20} color="#999" />
                      </TouchableOpacity>
                    </View>
                  ))}

                  <TouchableOpacity
                    style={styles.addTopicBtn}
                    onPress={() => addTopic(weekIdx)}
                    testID={`add-topic-week-${week.week_number}`}
                  >
                    <Ionicons name="add" size={16} color="#1565c0" />
                    <Text style={styles.addTopicText}>إضافة موضوع</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        {/* Save floating button */}
        {plan.weeks.length > 0 && (
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            testID="save-study-plan-btn"
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="save" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>حفظ الخطة</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Import Modal */}
        <Modal visible={showImportModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>استيراد الخطة من Excel</Text>
                <TouchableOpacity onPress={() => setShowImportModal(false)}>
                  <Ionicons name="close" size={22} color="#999" />
                </TouchableOpacity>
              </View>

              <View style={styles.infoBox}>
                <Ionicons name="information-circle" size={16} color="#1565c0" />
                <Text style={styles.infoText}>
                  الأعمدة المطلوبة: "رقم الأسبوع"، "عنوان الموضوع"، و"ملاحظات" (اختياري). حمّل القالب أولاً للحصول على التنسيق الصحيح.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setImportReplace(!importReplace)}
                testID="import-replace-toggle"
              >
                <Ionicons
                  name={importReplace ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={importReplace ? '#c62828' : '#999'}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.checkboxLabel}>استبدال الخطة الحالية بالكامل</Text>
                  <Text style={styles.checkboxSub}>
                    {importReplace
                      ? 'تحذير: سيتم حذف كل المواضيع الحالية واستبدالها بمحتوى الملف'
                      : 'سيتم دمج المواضيع الجديدة مع الخطة الحالية'}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalPrimaryBtn, importing && { opacity: 0.6 }]}
                onPress={handleImportExcel}
                disabled={importing}
                testID="import-study-plan-confirm-btn"
              >
                {importing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload" size={18} color="#fff" />
                    <Text style={styles.modalPrimaryBtnText}>اختيار ملف ورفعه</Text>
                  </>
                )}
              </TouchableOpacity>

              {importResult && (
                <View style={[styles.resultBox, importResult.error && styles.resultBoxError]}>
                  <Text style={[styles.resultText, importResult.error && { color: '#c62828' }]}>
                    {importResult.message}
                  </Text>
                  {!importResult.error && (
                    <Text style={styles.resultSub}>
                      {importResult.weeks_count} أسبوع | {importResult.total_topics} موضوع
                    </Text>
                  )}
                </View>
              )}
            </View>
          </View>
        </Modal>

        {/* Clone Modal */}
        <Modal visible={showCloneModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { maxHeight: '85%' }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>نسخ الخطة من مقرر آخر</Text>
                <TouchableOpacity onPress={() => setShowCloneModal(false)}>
                  <Ionicons name="close" size={22} color="#999" />
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>ابحث عن المقرر المصدر</Text>
              <TextInput
                style={styles.searchInput}
                value={cloneSearch}
                onChangeText={setCloneSearch}
                placeholder="بحث بالاسم أو الكود..."
                placeholderTextColor="#bbb"
                testID="clone-search-input"
              />

              <ScrollView style={styles.cloneList} nestedScrollEnabled>
                {cloneLoading ? (
                  <ActivityIndicator color="#1565c0" style={{ padding: 20 }} />
                ) : filteredCloneCourses.length === 0 ? (
                  <Text style={styles.emptySmall}>لا توجد مقررات</Text>
                ) : (
                  filteredCloneCourses.slice(0, 50).map((c: any) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[
                        styles.cloneRow,
                        cloneSourceId === c.id && styles.cloneRowSelected,
                      ]}
                      onPress={() => setCloneSourceId(c.id)}
                      testID={`clone-source-${c.id}`}
                    >
                      <Ionicons
                        name={cloneSourceId === c.id ? 'radio-button-on' : 'radio-button-off'}
                        size={20}
                        color={cloneSourceId === c.id ? '#7b1fa2' : '#999'}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cloneName}>{c.name}</Text>
                        <Text style={styles.cloneCode}>
                          {c.code}{c.section ? ` | شعبة ${c.section}` : ''}{c.level ? ` | مستوى ${c.level}` : ''}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>

              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setCloneReplace(!cloneReplace)}
                testID="clone-replace-toggle"
              >
                <Ionicons
                  name={cloneReplace ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={cloneReplace ? '#c62828' : '#999'}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.checkboxLabel}>استبدال الخطة الحالية</Text>
                  <Text style={styles.checkboxSub}>
                    {cloneReplace
                      ? 'تحذير: سيتم حذف الخطة الحالية واستبدالها'
                      : 'سيتم دمج المواضيع مع الخطة الحالية'}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalPrimaryBtn, { backgroundColor: '#7b1fa2' }, (cloning || !cloneSourceId) && { opacity: 0.6 }]}
                onPress={handleClone}
                disabled={cloning || !cloneSourceId}
                testID="clone-confirm-btn"
              >
                {cloning ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="copy" size={18} color="#fff" />
                    <Text style={styles.modalPrimaryBtnText}>تنفيذ النسخ</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: '#666', fontSize: 13 },

  header: {
    backgroundColor: '#1565c0',
    padding: 18,
    alignItems: 'center',
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 8, textAlign: 'center' },
  headerSub: { color: '#bbdefb', fontSize: 12, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 14 },
  statBox: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 70,
    alignItems: 'center',
  },
  statValue: { color: '#fff', fontSize: 18, fontWeight: '800' },
  statLabel: { color: '#e3f2fd', fontSize: 11, marginTop: 2 },

  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
  },
  toolBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },

  section: { paddingHorizontal: 12 },

  emptyBox: {
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 32,
    borderRadius: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  emptyText: { color: '#666', fontSize: 15, fontWeight: '700', marginTop: 12 },
  emptySub: { color: '#999', fontSize: 12, marginTop: 6, textAlign: 'center' },

  weekCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  weekHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  weekLabel: { fontSize: 14, fontWeight: '700', color: '#1565c0' },
  weekNumInput: {
    width: 48,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1565c0',
    fontSize: 14,
    fontWeight: '700',
    color: '#1565c0',
    textAlign: 'center',
  },
  completedBadge: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginRight: 'auto',
  },
  completedBadgeText: { color: '#2e7d32', fontSize: 11, fontWeight: '700' },

  topicRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    alignItems: 'flex-start',
  },
  topicRowCompleted: { backgroundColor: '#f1f8e9' },
  topicNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#e3f2fd',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  topicNumberText: { color: '#1565c0', fontSize: 11, fontWeight: '700' },
  topicTitleInput: {
    fontSize: 14,
    color: '#212121',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: '#fafafa',
    fontWeight: '600',
    textAlign: 'right',
  },
  topicNotesInput: {
    fontSize: 12,
    color: '#666',
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: '#fafafa',
    marginTop: 4,
    textAlign: 'right',
  },
  completedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  completedText: { color: '#2e7d32', fontSize: 11 },
  iconBtn: { padding: 4 },

  addTopicBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    marginTop: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1565c0',
    borderStyle: 'dashed',
  },
  addTopicText: { color: '#1565c0', fontSize: 12, fontWeight: '600' },

  saveBtn: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: '#2e7d32',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 6,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#212121' },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#e3f2fd',
    padding: 10,
    borderRadius: 8,
    gap: 6,
    marginBottom: 12,
  },
  infoText: { flex: 1, color: '#1565c0', fontSize: 12, lineHeight: 18, textAlign: 'right' },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: '#fafafa',
    borderRadius: 8,
    marginBottom: 12,
  },
  checkboxLabel: { fontSize: 13, fontWeight: '700', color: '#212121', textAlign: 'right' },
  checkboxSub: { fontSize: 11, color: '#666', marginTop: 3, textAlign: 'right' },

  modalPrimaryBtn: {
    backgroundColor: '#1565c0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  modalPrimaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  resultBox: { marginTop: 12, padding: 10, backgroundColor: '#e8f5e9', borderRadius: 8 },
  resultBoxError: { backgroundColor: '#ffebee' },
  resultText: { color: '#2e7d32', fontSize: 13, fontWeight: '700', textAlign: 'right' },
  resultSub: { color: '#558b2f', fontSize: 12, marginTop: 4, textAlign: 'right' },

  label: { fontSize: 12, fontWeight: '700', color: '#666', marginBottom: 6, textAlign: 'right' },
  searchInput: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    fontSize: 13,
    marginBottom: 8,
    textAlign: 'right',
  },
  cloneList: {
    maxHeight: 280,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 12,
  },
  cloneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  cloneRowSelected: { backgroundColor: '#f3e5f5' },
  cloneName: { fontSize: 13, fontWeight: '600', color: '#212121', textAlign: 'right' },
  cloneCode: { fontSize: 11, color: '#777', marginTop: 2, textAlign: 'right' },
  emptySmall: { textAlign: 'center', color: '#999', padding: 20, fontSize: 13 },
});

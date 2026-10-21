import React, { useState, useEffect, useCallback } from 'react';
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
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import api from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';
import { useAuthStore } from '../src/store/authStore';
import { downloadBlob } from '../src/utils/exportName';

interface Candidate {
  student_id: string; student_name: string; student_number: string;
  course_id: string; course_name: string; course_code: string;
  pct_unexcused: number; pct_total: number; limit_unexcused: number; limit_total: number;
  unexcused_hours: number; excused_hours: number; executed_hours: number;
}
interface Decision {
  id: string; student_id: string; student_name: string; student_number: string;
  scope: string; course_id?: string | null; course_name: string; course_code: string;
  decision: string; decision_label: string; reason: string;
  session_id?: string | null; session_title: string; meeting_number: string;
  pct_unexcused?: number; pct_total?: number; decided_by_name: string; created_at?: string;
}
interface BoardSession {
  id: string; meeting_number: string; meeting_date: string; title: string;
  decisions_count: number; created_by_name: string;
}
interface SimpleOption { id: string; name: string; }

const showAlert = (title: string, msg: string) => {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${msg}`);
  else Alert.alert(title, msg);
};
const askConfirm = async (title: string, msg: string): Promise<boolean> => {
  if (Platform.OS === 'web') return window.confirm(`${title}\n\n${msg}`);
  return new Promise((resolve) => {
    Alert.alert(title, msg, [
      { text: 'إلغاء', style: 'cancel', onPress: () => resolve(false) },
      { text: 'تأكيد', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
};

const DateField = ({ value, onChange, testID }: { value: string; onChange: (v: string) => void; testID: string }) => (
  Platform.OS === 'web' ? (
    <input type="date" value={value} onChange={(e: any) => onChange(e.target.value)} data-testid={testID}
      style={{ padding: 10, borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 14, width: '100%', direction: 'ltr' } as any} />
  ) : (
    <TextInput style={styles.input} value={value} onChangeText={onChange} placeholder="YYYY-MM-DD" placeholderTextColor="#aaa" testID={testID} />
  )
);

export default function FacultyBoardScreen() {
  const { user: ctxUser } = useAuth();
  const storeUser = useAuthStore((s) => s.user);
  const user: any = ctxUser || storeUser;
  const canManage = user?.role === 'admin' || user?.role === 'dean' || user?.role === 'department_head';

  const [view, setView] = useState<'candidates' | 'sessions'>('candidates');
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [sessions, setSessions] = useState<BoardSession[]>([]);
  const [standaloneDecisions, setStandaloneDecisions] = useState<Decision[]>([]);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [sessionDecisions, setSessionDecisions] = useState<Record<string, Decision[]>>({});

  const [faculties, setFaculties] = useState<SimpleOption[]>([]);
  const [departments, setDepartments] = useState<SimpleOption[]>([]);
  const [courses, setCourses] = useState<SimpleOption[]>([]);
  const [filterFaculty, setFilterFaculty] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterCourse, setFilterCourse] = useState('');

  const [decisionModal, setDecisionModal] = useState<{ mode: 'single' | 'bulk'; items: Candidate[] } | null>(null);
  const [decisionType, setDecisionType] = useState<'deprived' | 'exempted'>('deprived');
  const [decisionScope, setDecisionScope] = useState<'course' | 'general'>('course');
  const [decisionReason, setDecisionReason] = useState('');
  const [decisionSessionId, setDecisionSessionId] = useState('');
  const [saving, setSaving] = useState(false);

  const [sessionModal, setSessionModal] = useState(false);
  const [sessNumber, setSessNumber] = useState('');
  const [sessDate, setSessDate] = useState('');
  const [sessTitle, setSessTitle] = useState('');

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filterCourse) params.course_id = filterCourse;
      else if (filterDepartment) params.department_id = filterDepartment;
      else if (filterFaculty) params.faculty_id = filterFaculty;
      const r = await api.get('/faculty-board/candidates', { params });
      setCandidates(r.data.items || []);
      setSelected({});
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'تعذر جلب المرشّحين');
    } finally {
      setLoading(false);
    }
  }, [filterCourse, filterDepartment, filterFaculty]);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const [sr, dr] = await Promise.all([
        api.get('/faculty-board/sessions'),
        api.get('/faculty-board/decisions'),
      ]);
      setSessions(sr.data.items || []);
      setSessionDecisions({});
      setExpandedSession(null);
      setStandaloneDecisions((dr.data.items || []).filter((d: Decision) => !d.session_id));
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'تعذر جلب الجلسات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!canManage) {
      showAlert('غير مصرح', 'هذه الصفحة للإدارة فقط');
      return;
    }
    fetchCandidates();
    fetchSessions();
    api.get('/faculties').then((r) => setFaculties((r.data || []).map((f: any) => ({ id: f.id, name: f.name })))).catch(() => {});
    api.get('/departments').then((r) => setDepartments((r.data || []).map((d: any) => ({ id: d.id, name: d.name })))).catch(() => {});
    api.get('/semesters/current').then((sr) => {
      const semId = sr?.data?.id;
      return api.get('/courses', semId ? { params: { semester_id: semId } } : undefined);
    }).then((r) => {
      const list = Array.isArray(r.data) ? r.data : (r.data?.items || []);
      setCourses(list.map((c: any) => ({ id: c.id, name: `${c.name}${c.code ? ` (${c.code})` : ''}` })));
    }).catch(() => {});
  }, [user, canManage]);

  const toggleSelect = (sid: string) => setSelected((p) => ({ ...p, [sid]: !p[sid] }));
  const selectedCandidates = candidates.filter((c) => selected[`${c.student_id}_${c.course_id}`]);

  const openSingleDecision = (c: Candidate) => {
    setDecisionType('deprived');
    setDecisionScope('course');
    setDecisionReason('');
    setDecisionSessionId('');
    setDecisionModal({ mode: 'single', items: [c] });
  };

  const openBulkDecision = () => {
    if (selectedCandidates.length === 0) {
      showAlert('تنبيه', 'اختر طالباً واحداً على الأقل');
      return;
    }
    setDecisionType('deprived');
    setDecisionScope('course');
    setDecisionReason('');
    setDecisionSessionId('');
    setDecisionModal({ mode: 'bulk', items: selectedCandidates });
  };

  const submitDecision = async () => {
    if (!decisionModal) return;
    if (!decisionReason.trim()) {
      showAlert('تنبيه', 'أدخل سبب القرار');
      return;
    }
    setSaving(true);
    try {
      const payload = decisionModal.items.map((c) => ({
        student_id: c.student_id, scope: decisionScope, course_id: decisionScope === 'course' ? c.course_id : undefined,
        decision: decisionType, reason: decisionReason.trim(), session_id: decisionSessionId || undefined,
      }));
      if (decisionSessionId) {
        await api.post(`/faculty-board/sessions/${decisionSessionId}/decisions`, { decisions: payload });
      } else {
        for (const p of payload) await api.post('/faculty-board/decisions', p);
      }
      setDecisionModal(null);
      await fetchCandidates();
      await fetchSessions();
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'فشل حفظ القرار');
    } finally {
      setSaving(false);
    }
  };

  const createSession = async () => {
    if (!sessNumber.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(sessDate)) {
      showAlert('تنبيه', 'أدخل رقم الجلسة وتاريخها بصيغة صحيحة');
      return;
    }
    setSaving(true);
    try {
      await api.post('/faculty-board/sessions', { meeting_number: sessNumber.trim(), meeting_date: sessDate, title: sessTitle.trim() });
      setSessionModal(false);
      setSessNumber(''); setSessDate(''); setSessTitle('');
      await fetchSessions();
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'فشل إنشاء الجلسة');
    } finally {
      setSaving(false);
    }
  };

  const expandSession = async (sessionId: string) => {
    if (expandedSession === sessionId) { setExpandedSession(null); return; }
    setExpandedSession(sessionId);
    {
      try {
        const r = await api.get('/faculty-board/decisions', { params: { session_id: sessionId } });
        setSessionDecisions((p) => ({ ...p, [sessionId]: r.data.items || [] }));
      } catch { /* ignore */ }
    }
  };

  const downloadMinutes = async (sess: BoardSession) => {
    try {
      const r = await api.get(`/faculty-board/sessions/${sess.id}/minutes-pdf`, { responseType: 'blob' });
      downloadBlob(r.data, `محضر جلسة مجلس الكلية ${sess.meeting_number}.pdf`, 'application/pdf');
    } catch (e: any) {
      showAlert('خطأ', 'فشل تنزيل المحضر');
    }
  };

  const downloadLetter = async (d: Decision) => {
    try {
      const r = await api.get(`/faculty-board/decisions/${d.id}/letter-pdf`, { responseType: 'blob' });
      downloadBlob(r.data, `إشعار ${d.decision_label} - ${d.student_name}.pdf`, 'application/pdf');
    } catch {
      showAlert('خطأ', 'فشل تنزيل الإشعار');
    }
  };

  const deleteDecision = async (d: Decision) => {
    const ok = await askConfirm('إلغاء القرار', `إلغاء قرار (${d.decision_label}) للطالب ${d.student_name}؟`);
    if (!ok) return;
    try {
      await api.delete(`/faculty-board/decisions/${d.id}`);
      await fetchCandidates();
      await fetchSessions();
      if (d.session_id) setSessionDecisions((p) => ({ ...p, [d.session_id!]: (p[d.session_id!] || []).filter((x) => x.id !== d.id) }));
    } catch {
      showAlert('خطأ', 'فشل إلغاء القرار');
    }
  };

  const deleteSession = async (s: BoardSession) => {
    const ok = await askConfirm('حذف الجلسة', `حذف جلسة رقم ${s.meeting_number}؟`);
    if (!ok) return;
    try {
      await api.delete(`/faculty-board/sessions/${s.id}`);
      await fetchSessions();
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'فشل حذف الجلسة');
    }
  };

  const DecisionRow = ({ d }: { d: Decision }) => (
    <View style={styles.decisionRow} testID={`decision-row-${d.id}`}>
      <View style={[styles.decisionBadge, { backgroundColor: d.decision === 'deprived' ? '#b91c1c' : '#0f766e' }]}>
        <Text style={styles.decisionBadgeText}>{d.decision_label}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.decisionName}>{d.student_name} <Text style={styles.decisionNumber}>({d.student_number})</Text></Text>
        <Text style={styles.decisionScope}>{d.scope === 'course' ? `${d.course_name} (${d.course_code})` : 'عام — كل المقررات'}</Text>
        {d.reason ? <Text style={styles.decisionReason}>{d.reason}</Text> : null}
      </View>
      <TouchableOpacity onPress={() => downloadLetter(d)} style={styles.iconBtn} testID={`decision-letter-${d.id}`}>
        <Ionicons name="document-text-outline" size={18} color="#0f2440" />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => deleteDecision(d)} style={styles.iconBtn} testID={`decision-delete-${d.id}`}>
        <Ionicons name="trash-outline" size={18} color="#c62828" />
      </TouchableOpacity>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'مجلس الكلية', headerBackTitle: 'رجوع' }} />
      {!canManage ? (
        <SafeAreaView style={styles.container} edges={['bottom']} testID="faculty-board-screen">
          <View style={styles.empty}>
            <Ionicons name="lock-closed-outline" size={48} color="#bbb" />
            <Text style={styles.emptyText}>هذه الصفحة مخصّصة للإدارة فقط</Text>
          </View>
        </SafeAreaView>
      ) : (
      <SafeAreaView style={styles.container} edges={['bottom']} testID="faculty-board-screen">
        <View style={styles.headerCard}>
          <Ionicons name="shield-checkmark" size={28} color="#fff" />
          <Text style={styles.headerTitle}>مجلس الكلية — قرارات الحرمان</Text>
          <Text style={styles.headerSub}>مراجعة المرشّحين للحرمان واتخاذ قرار رسمي (حرمان/استثناء)</Text>
        </View>

        <View style={styles.tabsRow}>
          <TouchableOpacity style={[styles.tab, view === 'candidates' && styles.tabActive]} onPress={() => setView('candidates')} testID="tab-candidates">
            <Text style={[styles.tabText, view === 'candidates' && styles.tabTextActive]}>المرشّحون للحرمان</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, view === 'sessions' && styles.tabActive]} onPress={() => setView('sessions')} testID="tab-sessions">
            <Text style={[styles.tabText, view === 'sessions' && styles.tabTextActive]}>الجلسات والقرارات</Text>
          </TouchableOpacity>
        </View>

        {view === 'candidates' ? (
          <>
            <View style={styles.filterRow}>
              <View style={[styles.dropdownWrap, { flex: 1 }]}>
                <Picker selectedValue={filterCourse} onValueChange={(v) => { setFilterCourse(String(v)); setFilterFaculty(''); setFilterDepartment(''); }} testID="filter-course-picker">
                  <Picker.Item label="كل المقررات" value="" />
                  {courses.map((o) => (<Picker.Item key={o.id} label={o.name} value={o.id} />))}
                </Picker>
              </View>
              <TouchableOpacity style={styles.refreshBtn} onPress={fetchCandidates} testID="refresh-candidates-btn">
                <Ionicons name="refresh" size={18} color="#fff" />
              </TouchableOpacity>
            </View>

            {selectedCandidates.length > 0 && (
              <View style={styles.bulkBar}>
                <Text style={styles.bulkBarText}>تم تحديد {selectedCandidates.length} طالب</Text>
                <TouchableOpacity style={styles.bulkBtn} onPress={openBulkDecision} testID="bulk-decision-btn">
                  <Text style={styles.bulkBtnText}>اتخاذ قرار جماعي</Text>
                </TouchableOpacity>
              </View>
            )}

            <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
              {loading ? (
                <View style={styles.center}><ActivityIndicator size="large" color="#831843" /></View>
              ) : candidates.length === 0 ? (
                <View style={styles.empty}>
                  <Ionicons name="checkmark-done-circle-outline" size={48} color="#bbb" />
                  <Text style={styles.emptyText}>لا يوجد طلاب مرشّحون للحرمان حاليًا</Text>
                </View>
              ) : (
                candidates.map((c) => {
                  const key = `${c.student_id}_${c.course_id}`;
                  return (
                    <View key={key} style={styles.card} testID={`candidate-${key}`}>
                      <TouchableOpacity onPress={() => toggleSelect(key)} style={styles.checkbox} testID={`candidate-checkbox-${key}`}>
                        <Ionicons name={selected[key] ? 'checkbox' : 'square-outline'} size={22} color="#831843" />
                      </TouchableOpacity>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardName}>{c.student_name} <Text style={styles.decisionNumber}>({c.student_number})</Text></Text>
                        <Text style={styles.cardCourse}>{c.course_name} ({c.course_code})</Text>
                        <Text style={styles.cardStats}>غياب بلا عذر {c.pct_unexcused}% (الحد {c.limit_unexcused}%) · إجمالي {c.pct_total}% (الحد {c.limit_total}%)</Text>
                      </View>
                      <TouchableOpacity style={styles.decideBtn} onPress={() => openSingleDecision(c)} testID={`decide-btn-${key}`}>
                        <Text style={styles.decideBtnText}>اتخاذ قرار</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
            <View style={styles.actionsRow}>
              <TouchableOpacity style={[styles.actionBtn, styles.btnPrimary]} onPress={() => setSessionModal(true)} testID="add-session-btn">
                <Ionicons name="add-circle" size={20} color="#fff" />
                <Text style={styles.actionBtnText}>إنشاء جلسة جديدة</Text>
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.center}><ActivityIndicator size="large" color="#831843" /></View>
            ) : sessions.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="people-outline" size={48} color="#bbb" />
                <Text style={styles.emptyText}>لا توجد جلسات بعد</Text>
              </View>
            ) : (
              sessions.map((s) => (
                <View key={s.id} style={styles.sessionCard} testID={`session-${s.id}`}>
                  <TouchableOpacity style={styles.sessionHeader} onPress={() => expandSession(s.id)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sessionTitle}>جلسة رقم {s.meeting_number}{s.title ? ` — ${s.title}` : ''}</Text>
                      <Text style={styles.sessionMeta}>{s.meeting_date} · {s.decisions_count} قرار · بواسطة {s.created_by_name}</Text>
                    </View>
                    <TouchableOpacity onPress={() => downloadMinutes(s)} style={styles.iconBtn} testID={`session-minutes-pdf-${s.id}`}>
                      <Ionicons name="print-outline" size={20} color="#0f2440" />
                    </TouchableOpacity>
                    {s.decisions_count === 0 && (
                      <TouchableOpacity onPress={() => deleteSession(s)} style={styles.iconBtn} testID={`session-delete-${s.id}`}>
                        <Ionicons name="trash-outline" size={20} color="#c62828" />
                      </TouchableOpacity>
                    )}
                    <Ionicons name={expandedSession === s.id ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
                  </TouchableOpacity>
                  {expandedSession === s.id && (
                    <View style={styles.sessionBody}>
                      {(sessionDecisions[s.id] || []).map((d) => (<DecisionRow key={d.id} d={d} />))}
                      {(sessionDecisions[s.id] || []).length === 0 && <Text style={styles.emptyText}>لا قرارات في هذه الجلسة</Text>}
                    </View>
                  )}
                </View>
              ))
            )}

            {standaloneDecisions.length > 0 && (
              <View style={styles.sessionCard}>
                <Text style={styles.sessionTitle}>قرارات فردية (بدون جلسة)</Text>
                {standaloneDecisions.map((d) => (<DecisionRow key={d.id} d={d} />))}
              </View>
            )}
          </ScrollView>
        )}

        {/* نافذة اتخاذ القرار (فردي/جماعي) */}
        <Modal visible={!!decisionModal} animationType="fade" transparent onRequestClose={() => setDecisionModal(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modal} testID="decision-modal">
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{decisionModal?.mode === 'bulk' ? `قرار جماعي (${decisionModal.items.length} طالب)` : 'اتخاذ قرار'}</Text>
                <TouchableOpacity onPress={() => setDecisionModal(null)}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 480 }}>
                {decisionModal?.mode === 'single' && (
                  <Text style={styles.modalStudentInfo}>{decisionModal.items[0].student_name} — {decisionModal.items[0].course_name}</Text>
                )}
                <View style={styles.formGroup}>
                  <Text style={styles.label}>النطاق</Text>
                  <View style={styles.typesGrid}>
                    <TouchableOpacity style={[styles.typeChip, decisionScope === 'course' && styles.typeChipActive]} onPress={() => setDecisionScope('course')} testID="scope-course-chip">
                      <Text style={[styles.typeChipText, decisionScope === 'course' && { color: '#fff' }]}>لهذا المقرر فقط</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.typeChip, decisionScope === 'general' && styles.typeChipActive]} onPress={() => setDecisionScope('general')} testID="scope-general-chip">
                      <Text style={[styles.typeChipText, decisionScope === 'general' && { color: '#fff' }]}>عام (كل مقررات الطالب)</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>القرار</Text>
                  <View style={styles.typesGrid}>
                    <TouchableOpacity style={[styles.typeChip, decisionType === 'deprived' && { backgroundColor: '#b91c1c', borderColor: '#b91c1c' }]} onPress={() => setDecisionType('deprived')} testID="decision-deprived-chip">
                      <Text style={[styles.typeChipText, decisionType === 'deprived' && { color: '#fff' }]}>حرمان</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.typeChip, decisionType === 'exempted' && { backgroundColor: '#0f766e', borderColor: '#0f766e' }]} onPress={() => setDecisionType('exempted')} testID="decision-exempted-chip">
                      <Text style={[styles.typeChipText, decisionType === 'exempted' && { color: '#fff' }]}>استثناء</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>ربط بجلسة (اختياري)</Text>
                  <View style={styles.dropdownWrap}>
                    <Picker selectedValue={decisionSessionId} onValueChange={(v) => setDecisionSessionId(String(v))} testID="decision-session-picker">
                      <Picker.Item label="— بدون جلسة —" value="" />
                      {sessions.map((s) => (<Picker.Item key={s.id} label={`جلسة ${s.meeting_number} — ${s.meeting_date}`} value={s.id} />))}
                    </Picker>
                  </View>
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>سبب القرار *</Text>
                  <TextInput style={[styles.input, { height: 70, textAlignVertical: 'top' }]} value={decisionReason} onChangeText={setDecisionReason}
                    placeholder="مثال: تجاوز نسبة الغياب المسموح بها دون عذر مقبول" placeholderTextColor="#aaa" multiline testID="decision-reason-input" />
                </View>
              </ScrollView>
              <View style={styles.modalActions}>
                <TouchableOpacity style={[styles.actionBtn, styles.btnSecondary]} onPress={() => setDecisionModal(null)}>
                  <Text style={[styles.actionBtnText, { color: '#666' }]}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, styles.btnPrimary, saving && { opacity: 0.6 }]} onPress={submitDecision} disabled={saving} testID="save-decision-btn">
                  {saving ? <ActivityIndicator color="#fff" /> : (<><Ionicons name="save" size={18} color="#fff" /><Text style={styles.actionBtnText}>حفظ القرار</Text></>)}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* نافذة إنشاء جلسة */}
        <Modal visible={sessionModal} animationType="fade" transparent onRequestClose={() => setSessionModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modal} testID="session-modal">
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>إنشاء جلسة مجلس كلية</Text>
                <TouchableOpacity onPress={() => setSessionModal(false)}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>رقم الجلسة/المحضر *</Text>
                <TextInput style={styles.input} value={sessNumber} onChangeText={setSessNumber} placeholder="مثال: 3-2026" placeholderTextColor="#aaa" testID="session-number-input" />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>تاريخ الجلسة *</Text>
                <DateField value={sessDate} onChange={setSessDate} testID="session-date-input" />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>عنوان/موضوع الجلسة (اختياري)</Text>
                <TextInput style={styles.input} value={sessTitle} onChangeText={setSessTitle} placeholder="مثال: حرمان الفصل الأول 2026" placeholderTextColor="#aaa" testID="session-title-input" />
              </View>
              <View style={styles.modalActions}>
                <TouchableOpacity style={[styles.actionBtn, styles.btnSecondary]} onPress={() => setSessionModal(false)}>
                  <Text style={[styles.actionBtnText, { color: '#666' }]}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, styles.btnPrimary, saving && { opacity: 0.6 }]} onPress={createSession} disabled={saving} testID="save-session-btn">
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionBtnText}>إنشاء</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  center: { alignItems: 'center', padding: 32 },
  headerCard: { backgroundColor: '#831843', padding: 16, alignItems: 'center', borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 6 },
  headerSub: { color: '#fce7f3', fontSize: 12, marginTop: 4, textAlign: 'center', paddingHorizontal: 16 },
  tabsRow: { flexDirection: 'row', margin: 12, backgroundColor: '#fff', borderRadius: 10, padding: 4, borderWidth: 1, borderColor: '#eee' },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: '#831843' },
  tabText: { fontSize: 13, fontWeight: '700', color: '#666' },
  tabTextActive: { color: '#fff' },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, marginBottom: 8, alignItems: 'center' },
  refreshBtn: { backgroundColor: '#831843', padding: 10, borderRadius: 8 },
  bulkBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fce7f3', marginHorizontal: 12, marginBottom: 8, padding: 10, borderRadius: 8 },
  bulkBarText: { color: '#831843', fontWeight: '700', fontSize: 13 },
  bulkBtn: { backgroundColor: '#831843', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  bulkBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  empty: { alignItems: 'center', padding: 40 },
  emptyText: { color: '#666', fontSize: 14, fontWeight: '600', marginTop: 10, textAlign: 'center' },
  card: { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 12, marginVertical: 4, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#eee', alignItems: 'center', gap: 8 },
  checkbox: { padding: 4 },
  cardName: { fontSize: 13, fontWeight: '700', color: '#212121', textAlign: 'right' },
  cardCourse: { fontSize: 12, color: '#555', marginTop: 2, textAlign: 'right' },
  cardStats: { fontSize: 11, color: '#b91c1c', marginTop: 2, textAlign: 'right' },
  decideBtn: { backgroundColor: '#831843', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  decideBtnText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  actionsRow: { flexDirection: 'row', gap: 8, padding: 12 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, flex: 1, minWidth: 110 },
  btnPrimary: { backgroundColor: '#831843' },
  btnSecondary: { backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  sessionCard: { backgroundColor: '#fff', marginHorizontal: 12, marginVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: '#eee', padding: 12 },
  sessionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sessionTitle: { fontSize: 14, fontWeight: '700', color: '#212121', textAlign: 'right' },
  sessionMeta: { fontSize: 11, color: '#888', marginTop: 2, textAlign: 'right' },
  sessionBody: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 8, gap: 6 },
  decisionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  decisionBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  decisionBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  decisionName: { fontSize: 12, fontWeight: '700', color: '#212121', textAlign: 'right' },
  decisionNumber: { fontSize: 11, color: '#888', fontWeight: '400' },
  decisionScope: { fontSize: 11, color: '#555', textAlign: 'right' },
  decisionReason: { fontSize: 10, color: '#888', textAlign: 'right' },
  iconBtn: { padding: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modal: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', width: '94%', maxWidth: 460, alignSelf: 'center', padding: 0 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalTitle: { fontSize: 15, fontWeight: '700', color: '#831843' },
  modalStudentInfo: { fontSize: 13, color: '#555', textAlign: 'right', padding: 14, paddingBottom: 0 },
  formGroup: { padding: 14, paddingBottom: 0 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6, textAlign: 'right' },
  input: { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: '#fafafa', textAlign: 'right' },
  typesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#e0e0e0', backgroundColor: '#fafafa' },
  typeChipActive: { backgroundColor: '#831843', borderColor: '#831843' },
  typeChipText: { fontSize: 12, color: '#555', fontWeight: '600' },
  dropdownWrap: { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, overflow: 'hidden', backgroundColor: '#fafafa' },
  modalActions: { flexDirection: 'row', gap: 8, padding: 14, borderTopWidth: 1, borderTopColor: '#eee', marginTop: 14 },
});

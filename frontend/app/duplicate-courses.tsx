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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import api, { teachersAPI } from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';
import { useAuthStore } from '../src/store/authStore';

interface DupCourse {
  id: string;
  department_id: string;
  department_name: string;
  level: number | null;
  semester_id?: string | null;
  teacher_id?: string | null;
  slots: number;
}

interface DupGroup {
  name: string;
  courses: DupCourse[];
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
      { text: 'دمج', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
};

export default function DuplicateCoursesScreen() {
  const { user: ctxUser } = useAuth();
  const storeUser = useAuthStore((s) => s.user);
  const user: any = ctxUser || storeUser;
  const canManage = user?.role === 'admin' || user?.role === 'dean' || user?.role === 'department_head';

  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<DupGroup[]>([]);
  const [teacherNames, setTeacherNames] = useState<Record<string, string>>({});
  const [keepSel, setKeepSel] = useState<Record<number, string>>({});
  const [merging, setMerging] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [r, t] = await Promise.all([
        api.get('/courses-tools/duplicate-candidates'),
        teachersAPI.getAll().catch(() => ({ data: [] })),
      ]);
      const list: DupGroup[] = r.data.duplicates || [];
      setGroups(list);
      const tMap: Record<string, string> = {};
      (t.data || []).forEach((tc: any) => { tMap[tc.id] = tc.full_name || tc.name || ''; });
      setTeacherNames(tMap);
      const sel: Record<number, string> = {};
      list.forEach((g, i) => {
        const withMostSlots = [...g.courses].sort((a, b) => (b.slots || 0) - (a.slots || 0))[0];
        sel[i] = withMostSlots?.id || g.courses[0]?.id;
      });
      setKeepSel(sel);
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'تعذر جلب المقررات المكررة');
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
    void fetchData();
  }, [user, canManage, fetchData]);

  const handleMergeGroup = async (gi: number) => {
    const g = groups[gi];
    const keepId = keepSel[gi];
    if (!keepId) return;
    const others = g.courses.filter((c) => c.id !== keepId);
    const ok = await askConfirm(
      'تأكيد الدمج النهائي',
      `سيُنقل كل شيء (خانات الجدول، المحاضرات، التسجيلات، الحضور، الأعباء) من ${others.length} مقرر مكرر إلى المقرر المختار، وتُعطَّل المقررات الأخرى. هذا الإجراء لا يمكن التراجع عنه تلقائياً.`
    );
    if (!ok) return;
    setMerging(gi);
    try {
      for (const o of others) {
        await api.post('/courses-tools/merge-duplicates', { keep_course_id: keepId, remove_course_id: o.id });
      }
      showAlert('تم', `تم دمج «${g.name}» بنجاح — يمكنك الآن توليد المحاضرات بلا تعارض وهمي`);
      await fetchData();
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'فشل الدمج');
    } finally {
      setMerging(null);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'دمج المقررات المكررة', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container} edges={['bottom']} testID="duplicate-courses-screen">
        <View style={styles.headerCard}>
          <Ionicons name="git-merge" size={28} color="#fff" />
          <Text style={styles.headerTitle}>دمج المقررات المكررة</Text>
          <Text style={styles.headerSub}>
            هذه الأداة تكتشف المقررات المسجَّلة أكثر من مرة بنفس الاسم — وهو السبب الحقيقي وراء رفض توليد المحاضرات
            بحجة "تعارض في الجدول الشامل" رغم أن الخانة تبدو فارغة لعينك، لأنها في الحقيقة مشغولة بسجل مكرر لنفس المقرر بمعرّف مختلف.
          </Text>
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={18} color="#1565c0" />
          <Text style={styles.infoText}>
            اختر لكل مجموعة "المقرر المحتفَظ به" (الافتراضي: الأكثر خانات مسجّلة)، ثم اضغط دمج — تنتقل كل البيانات إليه وتُعطَّل بقية النُّسخ المكررة نهائياً.
          </Text>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {loading ? (
            <View style={styles.center}><ActivityIndicator size="large" color="#d84315" /></View>
          ) : groups.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="checkmark-circle-outline" size={48} color="#2e7d32" />
              <Text style={styles.emptyText}>لا توجد مقررات مكررة حالياً 🎉</Text>
            </View>
          ) : (
            groups.map((g, gi) => (
              <View key={`${g.name}-${gi}`} style={styles.groupCard} testID={`dup-group-${gi}`}>
                <View style={styles.groupHeader}>
                  <Text style={styles.groupTitle}>{g.name}</Text>
                  <View style={styles.countBadge}><Text style={styles.countBadgeText}>{g.courses.length} نُسخ</Text></View>
                </View>
                {g.courses.map((c) => {
                  const isKeep = keepSel[gi] === c.id;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      onPress={() => setKeepSel((p) => ({ ...p, [gi]: c.id }))}
                      style={[styles.courseRow, isKeep && styles.courseRowActive]}
                      testID={`dup-course-${c.id}`}
                    >
                      <View style={[styles.radio, isKeep && styles.radioActive]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.courseMeta}>{c.department_name || 'قسم غير محدد'} — م{c.level ?? '?'}</Text>
                        <Text style={styles.courseMeta}>
                          {c.teacher_id ? `أستاذ: ${teacherNames[c.teacher_id] || c.teacher_id}` : 'بلا أستاذ مُسنَد'} · خانات الجدول: {c.slots}
                        </Text>
                      </View>
                      {isKeep && <Text style={styles.keepLabel}>سيُحتفَظ به</Text>}
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  style={[styles.mergeBtn, merging === gi && { opacity: 0.6 }]}
                  onPress={() => handleMergeGroup(gi)}
                  disabled={merging !== null}
                  testID={`merge-dup-group-${gi}-btn`}
                >
                  {merging === gi ? <ActivityIndicator color="#fff" size="small" /> : (
                    <>
                      <Ionicons name="git-merge-outline" size={16} color="#fff" />
                      <Text style={styles.mergeBtnText}>دمج هذه المجموعة نهائياً</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  center: { alignItems: 'center', padding: 32 },
  headerCard: { backgroundColor: '#d84315', padding: 16, alignItems: 'center', borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 6 },
  headerSub: { color: '#ffe0d6', fontSize: 12, marginTop: 4, textAlign: 'center', paddingHorizontal: 16, lineHeight: 18 },
  infoBox: { flexDirection: 'row', backgroundColor: '#e3f2fd', marginHorizontal: 12, marginTop: 10, padding: 10, borderRadius: 8, gap: 6, alignItems: 'flex-start' },
  infoText: { flex: 1, color: '#1565c0', fontSize: 11, lineHeight: 17, textAlign: 'right' },
  empty: { alignItems: 'center', padding: 40 },
  emptyText: { color: '#2e7d32', fontSize: 15, fontWeight: '700', marginTop: 10 },
  groupCard: { backgroundColor: '#fff', marginHorizontal: 12, marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#eee' },
  groupHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  groupTitle: { fontSize: 14, fontWeight: '800', color: '#1a2540', textAlign: 'right', flex: 1 },
  countBadge: { backgroundColor: '#fff3e0', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  countBadgeText: { fontSize: 11, fontWeight: '700', color: '#d84315' },
  courseRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#e3e9f2', backgroundColor: '#fafbfd', borderRadius: 10, padding: 10, marginBottom: 6 },
  courseRowActive: { borderColor: '#2e7d32', backgroundColor: '#f1f8f2', borderWidth: 2 },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#c3ccda', backgroundColor: '#fff' },
  radioActive: { borderColor: '#2e7d32', backgroundColor: '#2e7d32' },
  courseMeta: { fontSize: 11.5, color: '#37455c', textAlign: 'right' },
  keepLabel: { fontSize: 10, color: '#2e7d32', fontWeight: '800' },
  mergeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#d84315', borderRadius: 10, padding: 11, marginTop: 4 },
  mergeBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});

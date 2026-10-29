import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { advancedAccessAPI } from '../../services/api';
import { COLORS } from './shared';

const CATEGORY_META: { [k: string]: { label: string; color: string } } = {
  both_allow: { label: 'النظامان يسمحان', color: COLORS.success },
  both_deny: { label: 'النظامان يرفضان', color: '#616161' },
  old_allow_new_deny: { label: 'القديم يسمح — الجديد يرفض', color: COLORS.danger },
  new_allow_old_deny: { label: 'الجديد يسمح — القديم يرفض', color: COLORS.warning },
};

export const AdvCompare: React.FC<{ canRun: boolean }> = ({ canRun }) => {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [assignmentId, setAssignmentId] = useState('');
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!canRun) return;
    advancedAccessAPI.getAllAssignments('active').then(res => setAssignments(res.data)).catch(() => setAssignments([]));
  }, [canRun]);

  const run = async () => {
    if (!assignmentId) return;
    setRunning(true);
    setSummary(null);
    try {
      const res = await advancedAccessAPI.getCompareSummary(assignmentId);
      setSummary(res.data);
    } catch (e: any) {
      setSummary({ error: e?.response?.data?.detail || 'تعذّر تشغيل المقارنة' });
    } finally { setRunning(false); }
  };

  if (!canRun) return <Text style={styles.desc} testID="adv-compare-no-access">تحتاج صلاحية "تشغيل المحاكي" لاستخدام المقارنة</Text>;

  return (
    <View testID="adv-compare">
      <Text style={styles.title}>مقارنة النظام القديم بالجديد</Text>
      <Text style={styles.desc}>قراءة فقط — لا تُعدِّل أي قرار في النظام القديم مهما كانت نتيجة المقارنة</Text>

      <Text style={styles.label}>اختر تكليفًا للمقارنة</Text>
      <ScrollView horizontal style={{ flexDirection: 'row-reverse' }}>
        {assignments.map(a => (
          <TouchableOpacity key={a.id} style={[styles.chip, assignmentId === a.id && styles.chipActive]} onPress={() => { setAssignmentId(a.id); setSummary(null); }} testID={`adv-compare-assignment-${a.id}`}>
            <Text style={[styles.chipText, assignmentId === a.id && styles.chipTextActive]}>{a.user_name} — {a.context_label_ar}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.runBtn} onPress={run} disabled={running || !assignmentId} testID="adv-compare-run-btn">
        {running ? <ActivityIndicator color="#fff" /> : <><Ionicons name="git-compare" size={16} color="#fff" /><Text style={styles.runBtnText}>تشغيل المقارنة</Text></>}
      </TouchableOpacity>

      {summary && !summary.error && (
        <View testID="adv-compare-result">
          <Text style={styles.summaryLine}>الصلاحيات الفعّالة لهذا التكليف: {summary.effective_permissions_total} — قابلة للمقارنة: {summary.comparable_count} — غير قابلة للمقارنة (لا مكافئ قديم): {summary.not_comparable_count}</Text>
          <View style={styles.grid}>
            {Object.entries(CATEGORY_META).map(([k, meta]) => (
              <View key={k} style={[styles.catCard, { borderColor: meta.color }]}>
                <Text style={[styles.catValue, { color: meta.color }]}>{summary.counts?.[k] ?? 0}</Text>
                <Text style={styles.catLabel}>{meta.label}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity onPress={() => setShowDetails(s => !s)} testID="adv-compare-toggle-details">
            <Text style={styles.detailsToggle}>{showDetails ? 'إخفاء التفاصيل' : 'عرض تفاصيل كل صلاحية'}</Text>
          </TouchableOpacity>
          {showDetails && summary.details?.map((d: any, i: number) => (
            <View key={i} style={styles.detailRow} testID={`adv-compare-detail-${i}`}>
              <Text style={styles.detailPerm}>{d.permission_key}</Text>
              <Text style={[styles.detailCat, { color: (CATEGORY_META[d.category] || {}).color || COLORS.textMuted }]}>{(CATEGORY_META[d.category] || {}).label || 'لا مكافئ قديم'}</Text>
            </View>
          ))}
        </View>
      )}
      {summary?.error && <Text style={styles.errorText}>{summary.error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, textAlign: 'right' },
  desc: { fontSize: 12, color: COLORS.textMuted, textAlign: 'right', marginTop: 4, marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.text, textAlign: 'right', marginBottom: 6 },
  chip: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, marginLeft: 6 },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12, color: COLORS.text },
  chipTextActive: { color: '#fff' },
  runBtn: { flexDirection: 'row-reverse', backgroundColor: COLORS.primary, borderRadius: 8, padding: 14, alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, marginBottom: 10 },
  runBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  summaryLine: { fontSize: 12, color: COLORS.textMuted, textAlign: 'right', marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' },
  catCard: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 2, padding: 12, width: 150, alignItems: 'center' },
  catValue: { fontSize: 22, fontWeight: 'bold' },
  catLabel: { fontSize: 11, color: COLORS.text, textAlign: 'center', marginTop: 4 },
  detailsToggle: { color: COLORS.primary, textAlign: 'right', marginTop: 14, fontSize: 13, fontWeight: '600' },
  detailRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 6, padding: 8, marginTop: 6, borderWidth: 1, borderColor: COLORS.border },
  detailPerm: { fontSize: 11, color: COLORS.text },
  detailCat: { fontSize: 11, fontWeight: '600' },
  errorText: { color: COLORS.danger, textAlign: 'right', marginTop: 10 },
});

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Platform, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { advancedAccessAPI } from '../../services/api';
import { COLORS, PILOT_SEVERITY_LABELS, PILOT_CATEGORY_LABELS, PILOT_TEST_TYPE_LABELS, PILOT_USER_LABELS } from './shared';

const FILTER_USERS = ['Salim', 'Saeed', 'teacher180156', 'president'];
const FILTER_SEVERITIES = ['critical', 'high', 'medium', 'info'];
const FILTER_STATUSES = ['pass', 'fail', 'diff', 'baseline', 'info'];
const STATUS_LABELS: { [k: string]: string } = { pass: 'ناجحة', fail: 'فاشلة', diff: 'اختلاف', baseline: 'خط أساس', info: 'معلوماتية' };

export const AdvPilotResults: React.FC<{ isAdmin: boolean; canView: boolean }> = ({ isAdmin, canView }) => {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!canView) { setLoading(false); return; }
    setLoading(true);
    try {
      const [s, r] = await Promise.all([
        advancedAccessAPI.getPilotSummary(),
        advancedAccessAPI.getPilotResults(),
      ]);
      setSummary(s.data);
      setResults(r.data);
    } catch (e) { setError('تعذّر تحميل نتائج التجربة'); } finally { setLoading(false); }
  }, [canView]);

  useEffect(() => { load(); }, [load]);

  const runPilot = async () => {
    setRunning(true); setError('');
    try {
      await advancedAccessAPI.runPilot();
      await load();
    } catch (e: any) { setError(e?.response?.data?.detail || 'تعذّر تشغيل التجربة (للأدمن فقط)'); } finally { setRunning(false); }
  };

  const stopPilot = async () => {
    setResetting(true); setError('');
    try {
      await advancedAccessAPI.resetPilot();
      await load();
    } catch (e: any) { setError(e?.response?.data?.detail || 'تعذّر إيقاف التجربة'); } finally { setResetting(false); }
  };

  const confirmStopPilot = () => {
    Alert.alert(
      'تأكيد إيقاف التجربة',
      'سيتم حذف كل الأدوار والتكليفات والنتائج التجريبية فورًا (بادئتها PILOT_). النظام القديم لن يتأثر. هل أنت متأكد؟',
      [{ text: 'إلغاء', style: 'cancel' }, { text: 'إيقاف وحذف', style: 'destructive', onPress: stopPilot }],
    );
  };

  const exportExcel = async () => {
    try {
      const res = await advancedAccessAPI.exportPilotExcel();
      if (Platform.OS === 'web') {
        const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'pilot_results.xlsx'; a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) { setError('تعذّر تصدير التقرير'); }
  };

  if (!canView) {
    return <View testID="adv-pilot-no-access"><Text style={styles.desc}>تحتاج صلاحية "عرض نتائج التجربة التشغيلية" للاطّلاع على هذا القسم</Text></View>;
  }
  if (loading) return <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />;

  const filtered = results.filter(r =>
    (!filterUser || r.username === filterUser) &&
    (!filterSeverity || r.severity === filterSeverity) &&
    (!filterStatus || r.status === filterStatus) &&
    (!search || (r.permission_key || '').includes(search) || (r.test_type || '').includes(search))
  );

  return (
    <View testID="adv-pilot-results">
      <Text style={styles.title}>نتائج التجربة التشغيلية المحدودة (المرحلة 5)</Text>
      <Text style={styles.desc}>SHADOW MODE — لا اعتماد ولا ترقية؛ تجربة محدودة على 4 مستخدمين حقيقيين معتمدين فقط</Text>

      {!!error && <Text style={styles.errorText}>{error}</Text>}

      {isAdmin && (
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.runBtn} onPress={runPilot} disabled={running} testID="adv-pilot-run-btn">
            {running ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="play" size={16} color="#fff" />}
            <Text style={styles.runBtnText}>تشغيل التجربة</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.stopBtn} onPress={confirmStopPilot} disabled={resetting} testID="adv-pilot-stop-btn">
            {resetting ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="stop" size={16} color="#fff" />}
            <Text style={styles.runBtnText}>إيقاف التجربة وحذف البيانات التجريبية</Text>
          </TouchableOpacity>
        </View>
      )}
      {results.length > 0 && (
        <TouchableOpacity style={styles.exportBtn} onPress={exportExcel} testID="adv-pilot-export-btn">
          <Ionicons name="download" size={16} color={COLORS.primary} />
          <Text style={styles.exportBtnText}>تصدير Excel</Text>
        </TouchableOpacity>
      )}

      {!summary?.has_run && <Text style={styles.empty}>لم تُشغَّل التجربة بعد{isAdmin ? ' — اضغط "تشغيل التجربة"' : ''}</Text>}

      {summary?.has_run && (
        <>
          <Text style={styles.sectionLabel}>آخر تشغيل: {new Date(summary.finished_at).toLocaleString('ar-EG')} — بواسطة {summary.triggered_by_username}</Text>
          <View style={styles.grid}>
            <StatCard label="إجمالي الحالات" value={summary.total_cases} icon="list" color={COLORS.primary} />
            <StatCard label="ناجحة" value={summary.pass_count} icon="checkmark-circle" color={COLORS.success} />
            <StatCard label="نسبة نجاح الاختبارات الوظيفية والأمنية" value={`${summary.success_rate}%`} icon="stats-chart" color={COLORS.primary} />
            <StatCard label="فاشلة" value={summary.fail_count} icon="close-circle" color={summary.fail_count > 0 ? COLORS.danger : COLORS.success} />
            <StatCard label="مشكلات أمنية" value={summary.security_issues_count} icon="shield" color={summary.security_issues_count > 0 ? COLORS.danger : COLORS.success} />
            <StatCard label="حالات الاختلاف مع القديم" value={summary.divergence_count} icon="git-compare" color={COLORS.warning} />
          </View>

          <Text style={styles.sectionLabel}>نتائج كل مستخدم على حدة</Text>
          <View style={styles.grid}>
            {Object.entries(summary.by_user || {}).map(([u, s]: [string, any]) => (
              <View key={u} style={styles.userCard} testID={`adv-pilot-user-card-${u}`}>
                <Text style={styles.userCardTitle}>{PILOT_USER_LABELS[u] || u}</Text>
                <Text style={styles.userCardLine}>إجمالي: {s.total} — ناجحة: {s.pass} — فاشلة: {s.fail} — اختلافات: {s.diff}{s.baseline ? ` — خط أساس: ${s.baseline}` : ''}{s.info ? ` — معلوماتية: ${s.info}` : ''}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionLabel}>تصفية النتائج ({filtered.length} من {results.length})</Text>
          <Text style={styles.filterLabel}>المستخدم</Text>
          <ScrollView horizontal contentContainerStyle={{ flexDirection: 'row-reverse' }} style={styles.filterRow}>
            <Chip label="الكل" active={!filterUser} onPress={() => setFilterUser('')} testID="adv-pilot-filter-user-all" />
            {FILTER_USERS.map(u => <Chip key={u} label={u} active={filterUser === u} onPress={() => setFilterUser(u)} testID={`adv-pilot-filter-user-${u}`} />)}
          </ScrollView>
          <Text style={styles.filterLabel}>الخطورة</Text>
          <ScrollView horizontal contentContainerStyle={{ flexDirection: 'row-reverse' }} style={styles.filterRow}>
            <Chip label="الكل" active={!filterSeverity} onPress={() => setFilterSeverity('')} testID="adv-pilot-filter-severity-all" />
            {FILTER_SEVERITIES.map(s => <Chip key={s} label={PILOT_SEVERITY_LABELS[s]?.label || s} active={filterSeverity === s} onPress={() => setFilterSeverity(s)} testID={`adv-pilot-filter-severity-${s}`} />)}
          </ScrollView>
          <Text style={styles.filterLabel}>الحالة</Text>
          <ScrollView horizontal contentContainerStyle={{ flexDirection: 'row-reverse' }} style={styles.filterRow}>
            <Chip label="الكل" active={!filterStatus} onPress={() => setFilterStatus('')} testID="adv-pilot-filter-status-all" />
            {FILTER_STATUSES.map(s => <Chip key={s} label={STATUS_LABELS[s]} active={filterStatus === s} onPress={() => setFilterStatus(s)} testID={`adv-pilot-filter-status-${s}`} />)}
          </ScrollView>
          <TextInput style={styles.searchInput} placeholder="ابحث بمفتاح الصلاحية أو نوع الاختبار" value={search} onChangeText={setSearch} textAlign="right" testID="adv-pilot-search-input" />

          {filtered.slice(0, 150).map((r, i) => (
            <View key={r.id || i} style={styles.resultRow} testID={`adv-pilot-result-row-${i}`}>
              <View style={styles.resultHeaderRow}>
                <Text style={[styles.severityBadge, { backgroundColor: PILOT_SEVERITY_LABELS[r.severity]?.color || COLORS.textMuted }]}>
                  {PILOT_SEVERITY_LABELS[r.severity]?.label || r.severity}
                </Text>
                <Text style={styles.resultUser}>{r.username}</Text>
              </View>
              <Text style={styles.resultType}>{PILOT_TEST_TYPE_LABELS[r.test_type] || r.test_type}</Text>
              <Text style={styles.resultPerm}>{r.permission_key}</Text>
              {r.category && <Text style={styles.resultCategory}>{PILOT_CATEGORY_LABELS[r.category] || r.category}</Text>}
              {typeof r.expected === 'boolean' && (
                <Text style={styles.resultLine}>المتوقَّع: {r.expected ? 'سماح' : 'رفض'} — الفعلي: {r.actual ? 'سماح' : 'رفض'} {r.status === 'pass' ? '✓' : r.status === 'fail' ? '✗' : ''}</Text>
              )}
              {(r.old_decision !== null && r.old_decision !== undefined) && (
                <Text style={styles.resultLine}>النظام القديم: {r.old_decision ? 'سماح' : 'رفض'} — النظام الجديد: {r.new_decision === null ? 'غير محسوب' : r.new_decision ? 'سماح' : 'رفض'}</Text>
              )}
              <Text style={styles.resultReason}>{r.reason}</Text>
            </View>
          ))}
          {filtered.length === 0 && <Text style={styles.empty}>لا توجد نتائج مطابقة للتصفية الحالية</Text>}
        </>
      )}
    </View>
  );
};

const StatCard: React.FC<{ label: string; value: any; icon: string; color: string }> = ({ label, value, icon, color }) => (
  <View style={styles.statCard}>
    <Ionicons name={icon as any} size={22} color={color} />
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const Chip: React.FC<{ label: string; active: boolean; onPress: () => void; testID?: string }> = ({ label, active, onPress, testID }) => (
  <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress} testID={testID}>
    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, textAlign: 'right' },
  desc: { fontSize: 12, color: COLORS.textMuted, textAlign: 'right', marginTop: 4, marginBottom: 12 },
  errorText: { color: COLORS.danger, textAlign: 'right', marginBottom: 8, fontSize: 12 },
  actionsRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  runBtn: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: COLORS.success, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  stopBtn: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: COLORS.danger, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  runBtnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  exportBtn: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  exportBtnText: { color: COLORS.primary, fontWeight: '600', fontSize: 12 },
  empty: { textAlign: 'center', color: COLORS.textMuted, marginTop: 20 },
  sectionLabel: { fontSize: 13, fontWeight: 'bold', color: COLORS.text, textAlign: 'right', marginTop: 16, marginBottom: 8 },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  statCard: { backgroundColor: '#fff', borderRadius: 10, padding: 12, alignItems: 'center', minWidth: 100, flexGrow: 1, borderWidth: 1, borderColor: COLORS.border },
  statValue: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, marginTop: 4 },
  statLabel: { fontSize: 10, color: COLORS.textMuted, textAlign: 'center', marginTop: 2 },
  userCard: { backgroundColor: '#fff', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: COLORS.border, minWidth: '100%' },
  userCardTitle: { fontSize: 13, fontWeight: 'bold', color: COLORS.primary, textAlign: 'right' },
  userCardLine: { fontSize: 11, color: COLORS.textMuted, textAlign: 'right', marginTop: 4 },
  filterLabel: { fontSize: 11, color: COLORS.textMuted, textAlign: 'right', marginTop: 6 },
  filterRow: { marginBottom: 4 },
  chip: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, marginLeft: 6 },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 11, color: COLORS.text },
  chipTextActive: { color: '#fff' },
  searchInput: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 8, fontSize: 12, marginTop: 8, marginBottom: 10 },
  resultRow: { backgroundColor: '#fff', borderRadius: 8, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border },
  resultHeaderRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  severityBadge: { color: '#fff', fontSize: 10, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
  resultUser: { fontSize: 11, color: COLORS.textMuted },
  resultType: { fontSize: 12, fontWeight: '600', color: COLORS.text, textAlign: 'right', marginTop: 4 },
  resultPerm: { fontSize: 11, color: COLORS.primary, textAlign: 'right', marginTop: 2 },
  resultCategory: { fontSize: 10, color: COLORS.shadow, textAlign: 'right', marginTop: 2 },
  resultLine: { fontSize: 11, color: COLORS.text, textAlign: 'right', marginTop: 2 },
  resultReason: { fontSize: 10, color: COLORS.textMuted, textAlign: 'right', marginTop: 3 },
});

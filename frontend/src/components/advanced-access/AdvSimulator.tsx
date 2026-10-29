import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { advancedAccessAPI } from '../../services/api';
import { COLORS, SCOPE_TYPE_LABELS } from './shared';

export const AdvSimulator: React.FC<{ canRun: boolean }> = ({ canRun }) => {
  const [users, setUsers] = useState<any[]>([]);
  const [userId, setUserId] = useState('');
  const [assignments, setAssignments] = useState<any[]>([]);
  const [assignmentId, setAssignmentId] = useState('');
  const [permissions, setPermissions] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [permKey, setPermKey] = useState('');
  const [targetScopeType, setTargetScopeType] = useState('');
  const [targetRefId, setTargetRefId] = useState('');
  const [scopeOptions, setScopeOptions] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (!canRun) return;
    Promise.all([advancedAccessAPI.getLightUsers(), advancedAccessAPI.getPermissions()]).then(([u, p]) => { setUsers(u.data); setPermissions(p.data); }).catch(() => {});
  }, [canRun]);

  useEffect(() => {
    if (!userId) { setAssignments([]); return; }
    advancedAccessAPI.getUserAssignments(userId).then(res => setAssignments(res.data.filter((a: any) => a.status === 'active'))).catch(() => setAssignments([]));
  }, [userId]);

  useEffect(() => {
    if (!targetScopeType) { setScopeOptions([]); return; }
    advancedAccessAPI.getScopeOptions(targetScopeType).then(res => setScopeOptions(res.data)).catch(() => setScopeOptions([]));
  }, [targetScopeType]);

  const run = async () => {
    if (!userId || !assignmentId || !permKey) { setResult({ allowed: false, reason: 'أكمل: المستخدم، السياق، والصلاحية' }); return; }
    setRunning(true);
    try {
      const res = await advancedAccessAPI.runCheck({ user_id: userId, assignment_id: assignmentId, permission_key: permKey, target_scope_type: targetScopeType || null, target_ref_id: targetRefId || null });
      setResult(res.data);
    } catch (e: any) {
      setResult({ allowed: false, reason: e?.response?.data?.detail || 'خطأ في التنفيذ' });
    } finally { setRunning(false); }
  };

  if (!canRun) return <Text style={styles.desc} testID="adv-simulator-no-access">تحتاج صلاحية "تشغيل المحاكي" لاستخدام هذا القسم</Text>;

  const filteredPerms = permissions.filter(p => !search || p.label_ar.includes(search) || p.key.includes(search) || (p.linked_api_path || '').includes(search));

  return (
    <View testID="adv-simulator">
      <Text style={styles.title}>محاكي الصلاحيات</Text>
      <Text style={styles.desc}>للقراءة والاختبار فقط — لا ينفّذ أي تغيير على بيانات الإنتاج</Text>

      <Text style={styles.label}>المستخدم</Text>
      <ScrollView horizontal style={styles.row} contentContainerStyle={{ flexDirection: 'row-reverse' }}>
        {users.map(u => (
          <TouchableOpacity key={u.id} style={[styles.chip, userId === u.id && styles.chipActive]} onPress={() => { setUserId(u.id); setAssignmentId(''); setResult(null); }} testID={`adv-sim-user-${u.id}`}>
            <Text style={[styles.chipText, userId === u.id && styles.chipTextActive]}>{u.full_name || u.username}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.label}>السياق (التكليف)</Text>
      <ScrollView horizontal style={styles.row} contentContainerStyle={{ flexDirection: 'row-reverse' }}>
        {assignments.map(a => (
          <TouchableOpacity key={a.id} style={[styles.chip, assignmentId === a.id && styles.chipActive]} onPress={() => setAssignmentId(a.id)} testID={`adv-sim-assignment-${a.id}`}>
            <Text style={[styles.chipText, assignmentId === a.id && styles.chipTextActive]}>{a.context_label_ar}</Text>
          </TouchableOpacity>
        ))}
        {userId && assignments.length === 0 && <Text style={styles.emptyInline}>لا توجد تكليفات نشطة لهذا المستخدم</Text>}
      </ScrollView>

      <Text style={styles.label}>الصلاحية المستهدفة</Text>
      <TextInput style={styles.input} placeholder="ابحث بالاسم أو المفتاح أو المسار..." value={search} onChangeText={setSearch} textAlign="right" testID="adv-sim-perm-search" />
      <ScrollView style={{ maxHeight: 160 }}>
        {filteredPerms.slice(0, 40).map(p => (
          <TouchableOpacity key={p.key} style={[styles.pickRow, permKey === p.key && styles.pickRowActive]} onPress={() => setPermKey(p.key)} testID={`adv-sim-perm-${p.key}`}>
            <Text style={styles.pickRowText}>{p.label_ar}</Text>
            <Text style={styles.pickRowMeta}>{p.linked_api_method} {p.linked_api_path} — {p.key}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.label}>النطاق المستهدف (اختياري)</Text>
      <ScrollView horizontal style={styles.row} contentContainerStyle={{ flexDirection: 'row-reverse' }}>
        {['', 'faculty', 'department', 'unit', 'course'].map(st => (
          <TouchableOpacity key={st || 'none'} style={[styles.chip, targetScopeType === st && styles.chipActive]} onPress={() => { setTargetScopeType(st); setTargetRefId(''); }} testID={`adv-sim-scopetype-${st || 'none'}`}>
            <Text style={[styles.chipText, targetScopeType === st && styles.chipTextActive]}>{st ? SCOPE_TYPE_LABELS[st] : 'بلا نطاق محدد'}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {scopeOptions.length > 0 && (
        <ScrollView style={{ maxHeight: 100 }}>
          {scopeOptions.map(o => (
            <TouchableOpacity key={o.id} style={[styles.pickRow, targetRefId === o.id && styles.pickRowActive]} onPress={() => setTargetRefId(o.id)} testID={`adv-sim-scoperef-${o.id}`}>
              <Text style={styles.pickRowText}>{o.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <TouchableOpacity style={styles.runBtn} onPress={run} disabled={running} testID="adv-sim-run-btn">
        {running ? <ActivityIndicator color="#fff" /> : <><Ionicons name="play" size={16} color="#fff" /><Text style={styles.runBtnText}>تشغيل المحاكي</Text></>}
      </TouchableOpacity>

      {result && (
        <View style={[styles.resultBox, { backgroundColor: result.allowed ? COLORS.successBg : COLORS.dangerBg }]} testID="adv-sim-result">
          <Ionicons name={result.allowed ? 'checkmark-circle' : 'close-circle'} size={28} color={result.allowed ? COLORS.success : COLORS.danger} />
          <Text style={[styles.resultDecision, { color: result.allowed ? COLORS.success : COLORS.danger }]}>{result.allowed ? 'مسموح' : 'مرفوض'}</Text>
          <Text style={styles.resultReason}>{result.reason}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, textAlign: 'right' },
  desc: { fontSize: 12, color: COLORS.textMuted, textAlign: 'right', marginTop: 4, marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.text, textAlign: 'right', marginBottom: 6, marginTop: 10 },
  row: { flexDirection: 'row-reverse' },
  chip: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, marginLeft: 6 },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12, color: COLORS.text },
  chipTextActive: { color: '#fff' },
  emptyInline: { fontSize: 11, color: COLORS.textMuted, paddingVertical: 8 },
  input: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, padding: 8, marginBottom: 6 },
  pickRow: { backgroundColor: '#fff', borderRadius: 8, padding: 8, marginBottom: 4, borderWidth: 1, borderColor: COLORS.border },
  pickRowActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  pickRowText: { fontSize: 12, color: COLORS.text, textAlign: 'right' },
  pickRowMeta: { fontSize: 10, color: COLORS.textMuted, textAlign: 'right', marginTop: 2 },
  runBtn: { flexDirection: 'row-reverse', backgroundColor: COLORS.primary, borderRadius: 8, padding: 14, alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 },
  runBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  resultBox: { borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 16, gap: 4 },
  resultDecision: { fontSize: 18, fontWeight: 'bold' },
  resultReason: { fontSize: 12, color: COLORS.text, textAlign: 'center' },
});

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Modal, TextInput, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { advancedAccessAPI } from '../../services/api';
import { COLORS, ROLLBACK_STOP_LABELS } from './shared';

const SCOPE_TYPES = ['user', 'department', 'faculty', 'unit'];
const SCOPE_TYPE_LABELS_LOCAL: { [k: string]: string } = { user: 'مستخدم', department: 'قسم', faculty: 'كلية', unit: 'وحدة إدارية' };
const ACTION_LABELS: { [k: string]: string } = {
  master_flag_updated: 'تحديث المفتاح المركزي',
  scope_activation_attempt_rejected: 'محاولة تفعيل نطاق — مرفوضة (مقفل برمجيًا)',
};

export const AdvRollbackControl: React.FC<{ isAdmin: boolean; canManage: boolean; canViewAudit: boolean }> = ({ isAdmin, canManage, canViewAudit }) => {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<any>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [error, setError] = useState('');

  const [masterModal, setMasterModal] = useState(false);
  const [masterReason, setMasterReason] = useState('');
  const [masterTarget, setMasterTarget] = useState(false);
  const [saving, setSaving] = useState(false);

  const [scopeModal, setScopeModal] = useState(false);
  const [scopeType, setScopeType] = useState('user');
  const [scopeRef, setScopeRef] = useState('');
  const [scopeReason, setScopeReason] = useState('');
  const [scopeError, setScopeError] = useState('');

  const [simUserId, setSimUserId] = useState('');
  const [simResult, setSimResult] = useState<any>(null);
  const [simLoading, setSimLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s] = await Promise.all([advancedAccessAPI.getRollbackStatus()]);
      setStatus(s.data);
      if (canViewAudit) {
        const a = await advancedAccessAPI.getRollbackAudit(100);
        setAudit(a.data);
      }
    } catch (e) { setError('تعذّر تحميل حالة منظومة التحكم والتراجع'); } finally { setLoading(false); }
  }, [canViewAudit]);

  useEffect(() => { load(); }, [load]);

  const openMasterModal = (target: boolean) => { setMasterTarget(target); setMasterReason(''); setMasterModal(true); };

  const saveMaster = async () => {
    if (!masterReason.trim()) return;
    setSaving(true);
    try {
      await advancedAccessAPI.updateMasterFlag({ enabled: masterTarget, reason: masterReason.trim() });
      setMasterModal(false);
      await load();
    } catch (e: any) { setError(e?.response?.data?.detail || 'تعذّر تحديث المفتاح المركزي'); } finally { setSaving(false); }
  };

  const openScopeModal = () => { setScopeRef(''); setScopeReason(''); setScopeError(''); setScopeModal(true); };

  const submitScopeAttempt = async () => {
    if (!scopeRef.trim() || !scopeReason.trim()) { setScopeError('الرجاء إدخال المعرّف والسبب'); return; }
    try {
      await advancedAccessAPI.attemptScopeActivation({ scope_type: scopeType, ref_id: scopeRef.trim(), reason: scopeReason.trim() });
    } catch (e: any) {
      setScopeError(e?.response?.data?.detail || 'تم رفض الطلب (مقفل برمجيًا)');
    } finally {
      await load();
    }
  };

  const runSimulate = async () => {
    setSimLoading(true); setSimResult(null);
    try {
      const r = await advancedAccessAPI.simulateRollbackDecision({ user_id: simUserId.trim() || undefined });
      setSimResult(r.data);
    } catch (e) { setError('تعذّر تشغيل المحاكاة'); } finally { setSimLoading(false); }
  };

  if (loading) return <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />;

  return (
    <View testID="adv-rollback-control">
      <Text style={styles.title}>التحكم والتراجع الآمن (Phase 6B)</Text>
      <Text style={styles.desc}>منظومة مستقلة عن محرك الصلاحيات الجديد وعن النظام القديم — التفعيل الفعلي مقفل برمجيًا في هذه المرحلة.</Text>
      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <View style={[styles.card, status?.emergency_kill_switch_engaged ? styles.cardDanger : styles.cardOk]} testID="adv-rollback-kill-switch">
        <Ionicons name={status?.emergency_kill_switch_engaged ? 'warning' : 'shield-checkmark'} size={20} color={status?.emergency_kill_switch_engaged ? COLORS.danger : COLORS.success} />
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.cardTitle}>مفتاح الإيقاف الطارئ (Emergency Kill Switch)</Text>
          <Text style={styles.cardMeta}>{status?.emergency_kill_switch_engaged ? 'مُفعَّل — القرار القديم مفروض فورًا' : 'غير مُفعَّل — يُضبط فقط عبر متغير بيئة الخادم، لا يمكن تفعيله من هذه الواجهة'}</Text>
        </View>
      </View>

      <View style={[styles.card, styles.cardLocked]} testID="adv-rollback-activation-lock">
        <Ionicons name="lock-closed" size={20} color={COLORS.shadow} />
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.cardTitle}>القفل البرمجي للتفعيل الفعلي</Text>
          <Text style={styles.cardMeta}>{status?.activation_locked ? 'مقفل — لا يمكن تفعيل أي مستخدم أو وحدة تنظيمية في هذه المرحلة مهما كانت قيمة المفتاح المركزي أدناه' : 'غير مقفل'}</Text>
        </View>
      </View>

      <View style={styles.card} testID="adv-rollback-master-flag">
        <Ionicons name={status?.master_enabled ? 'toggle' : 'toggle-outline'} size={20} color={status?.master_enabled ? COLORS.warning : COLORS.textMuted} />
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.cardTitle}>المفتاح المركزي (Master Flag)</Text>
          <Text style={styles.cardMeta}>{status?.master_enabled ? 'ON — لكنه لا يُفعِّل أي وصول فعلي بسبب القفل البرمجي' : 'OFF (الافتراضي)'}</Text>
          {!!status?.last_reason && <Text style={styles.cardMetaSmall}>آخر سبب: {status.last_reason} — بواسطة {status.updated_by_username || '-'}</Text>}
        </View>
        {canManage && (
          <TouchableOpacity style={styles.smallBtn} onPress={() => openMasterModal(!status?.master_enabled)} testID="adv-rollback-master-toggle-btn">
            <Text style={styles.smallBtnText}>{status?.master_enabled ? 'إيقاف' : 'تفعيل'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.card} testID="adv-rollback-scoped-activations">
        <Ionicons name="git-network-outline" size={20} color={COLORS.textMuted} />
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.cardTitle}>النطاقات المُفعَّلة فعليًا</Text>
          <Text style={styles.cardMeta}>{(status?.scoped_activations || []).length === 0 ? 'لا يوجد — فارغة دائمًا في هذه المرحلة (مقفلة برمجيًا)' : `${status.scoped_activations.length} نطاق`}</Text>
        </View>
        {canManage && (
          <TouchableOpacity style={styles.smallBtnOutline} onPress={openScopeModal} testID="adv-rollback-scope-attempt-btn">
            <Text style={styles.smallBtnOutlineText}>محاولة تفعيل نطاق</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.noteBox}>
        <Text style={styles.noteText}>مصدر القرار الفعلي حاليًا: <Text style={{ fontWeight: 'bold' }}>النظام القديم دائمًا</Text> ({status?.effective_decision_source})</Text>
      </View>

      <Text style={styles.sectionTitle}>محاكاة قرار مصدر الصلاحية</Text>
      <View style={styles.simRow}>
        <TextInput style={styles.input} placeholder="معرّف مستخدم (اختياري)" value={simUserId} onChangeText={setSimUserId} testID="adv-rollback-simulate-user-input" />
        <TouchableOpacity style={styles.smallBtn} onPress={runSimulate} disabled={simLoading} testID="adv-rollback-simulate-btn">
          {simLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.smallBtnText}>تشغيل</Text>}
        </TouchableOpacity>
      </View>
      {!!simResult && (
        <View style={styles.simResultBox} testID="adv-rollback-simulate-result">
          <Text style={styles.simResultDecision}>القرار: {simResult.decision === 'legacy' ? 'النظام القديم' : simResult.decision}</Text>
          <Text style={styles.simResultReason}>السبب: {ROLLBACK_STOP_LABELS[simResult.stopped_at] || simResult.stopped_at}</Text>
          <Text style={styles.cardMetaSmall}>مسار التقييم: {(simResult.trace || []).join(' ← ')}</Text>
        </View>
      )}

      {canViewAudit && (
        <>
          <Text style={styles.sectionTitle}>سجل تدقيق منظومة التحكم والتراجع ({audit.length})</Text>
          {audit.map((l, i) => (
            <View key={l.id || i} style={styles.auditRow} testID={`adv-rollback-audit-row-${i}`}>
              <Text style={styles.auditAction}>{ACTION_LABELS[l.action] || l.action}</Text>
              <Text style={styles.cardMetaSmall}>{l.actor_username || l.actor_user_id} — {new Date(l.timestamp).toLocaleString('ar-EG')}</Text>
              {!!l.reason && <Text style={styles.cardMetaSmall}>السبب: {l.reason}</Text>}
            </View>
          ))}
          {audit.length === 0 && <Text style={styles.empty}>لا توجد عمليات مسجَّلة بعد</Text>}
        </>
      )}

      <Modal visible={masterModal} transparent animationType="fade" onRequestClose={() => setMasterModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox} testID="adv-rollback-master-modal">
            <Text style={styles.modalTitle}>{masterTarget ? 'تفعيل المفتاح المركزي' : 'إيقاف المفتاح المركزي'}</Text>
            <Text style={styles.cardMeta}>هذا التغيير لا يفعّل أي وصول فعلي — التفعيل يبقى مقفلاً برمجيًا.</Text>
            <TextInput style={styles.input} placeholder="سبب التغيير (إلزامي)" value={masterReason} onChangeText={setMasterReason} multiline testID="adv-rollback-master-reason-input" />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.smallBtnOutline} onPress={() => setMasterModal(false)} testID="adv-rollback-master-cancel-btn"><Text style={styles.smallBtnOutlineText}>إلغاء</Text></TouchableOpacity>
              <TouchableOpacity style={styles.smallBtn} onPress={saveMaster} disabled={saving || !masterReason.trim()} testID="adv-rollback-master-save-btn">
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.smallBtnText}>حفظ</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={scopeModal} transparent animationType="fade" onRequestClose={() => setScopeModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox} testID="adv-rollback-scope-modal">
            <Text style={styles.modalTitle}>محاولة تفعيل نطاق</Text>
            <Text style={styles.cardMeta}>سيُرفَض هذا الطلب دائمًا في هذه المرحلة (مقفل برمجيًا) — المحاولة تُسجَّل في سجل التدقيق.</Text>
            <View style={styles.chipsRow}>
              {SCOPE_TYPES.map(t => (
                <TouchableOpacity key={t} style={[styles.chip, scopeType === t && styles.chipActive]} onPress={() => setScopeType(t)} testID={`adv-rollback-scope-type-${t}`}>
                  <Text style={[styles.chipText, scopeType === t && styles.chipTextActive]}>{SCOPE_TYPE_LABELS_LOCAL[t]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.input} placeholder="المعرّف (ref_id)" value={scopeRef} onChangeText={setScopeRef} testID="adv-rollback-scope-ref-input" />
            <TextInput style={styles.input} placeholder="السبب (إلزامي)" value={scopeReason} onChangeText={setScopeReason} multiline testID="adv-rollback-scope-reason-input" />
            {!!scopeError && <Text style={styles.errorText}>{scopeError}</Text>}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.smallBtnOutline} onPress={() => setScopeModal(false)} testID="adv-rollback-scope-cancel-btn"><Text style={styles.smallBtnOutlineText}>إغلاق</Text></TouchableOpacity>
              <TouchableOpacity style={styles.smallBtn} onPress={submitScopeAttempt} testID="adv-rollback-scope-submit-btn"><Text style={styles.smallBtnText}>إرسال المحاولة</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, textAlign: 'right' },
  desc: { fontSize: 12, color: COLORS.textMuted, textAlign: 'right', marginTop: 4, marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: COLORS.text, textAlign: 'right', marginTop: 18, marginBottom: 8 },
  card: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  cardOk: { borderColor: COLORS.success },
  cardDanger: { borderColor: COLORS.danger, backgroundColor: COLORS.dangerBg },
  cardLocked: { borderColor: COLORS.shadow, backgroundColor: COLORS.shadowBg },
  cardTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text, textAlign: 'right' },
  cardMeta: { fontSize: 11, color: COLORS.textMuted, textAlign: 'right', marginTop: 3 },
  cardMetaSmall: { fontSize: 10, color: COLORS.textMuted, textAlign: 'right', marginTop: 2 },
  noteBox: { backgroundColor: COLORS.primaryLight, borderRadius: 8, padding: 10, marginTop: 4, marginBottom: 4 },
  noteText: { fontSize: 12, color: COLORS.primary, textAlign: 'right' },
  errorText: { color: COLORS.danger, textAlign: 'right', marginBottom: 8, fontSize: 12 },
  smallBtn: { backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  smallBtnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  smallBtnOutline: { borderWidth: 1, borderColor: COLORS.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  smallBtnOutlineText: { color: COLORS.primary, fontWeight: '600', fontSize: 12 },
  simRow: { flexDirection: 'row-reverse', gap: 8, alignItems: 'center' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 10, flex: 1, textAlign: 'right', fontSize: 13, marginBottom: 8 },
  simResultBox: { backgroundColor: '#fff', borderRadius: 8, padding: 10, marginTop: 8, borderWidth: 1, borderColor: COLORS.border },
  simResultDecision: { fontSize: 13, fontWeight: 'bold', color: COLORS.text, textAlign: 'right' },
  simResultReason: { fontSize: 12, color: COLORS.textMuted, textAlign: 'right', marginTop: 2 },
  auditRow: { backgroundColor: '#fff', borderRadius: 8, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border },
  auditAction: { fontSize: 12, fontWeight: '600', color: COLORS.text, textAlign: 'right' },
  empty: { textAlign: 'center', color: COLORS.textMuted, marginTop: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: '#fff', borderRadius: 12, padding: 16, width: '90%', maxWidth: 420 },
  modalTitle: { fontSize: 15, fontWeight: 'bold', color: COLORS.text, textAlign: 'right', marginBottom: 8 },
  modalActions: { flexDirection: 'row-reverse', gap: 10, marginTop: 10 },
  chipsRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginVertical: 8 },
  chip: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 11, color: COLORS.text },
  chipTextActive: { color: '#fff' },
});

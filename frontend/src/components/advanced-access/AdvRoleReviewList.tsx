import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { advancedAccessAPI } from '../../services/api';
import { COLORS, REVIEW_STATUS_LABELS, REVIEW_STATUS_COLORS, USAGE_STATUS_LABELS, DECISION_LABELS, DECISION_COLORS } from './shared';

export const AdvRoleReviewList: React.FC<{ canManage: boolean; roleCategories: any; scopeOptions: any; permissionLabels: any }> = ({ canManage, roleCategories, scopeOptions, permissionLabels }) => {
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [noteText, setNoteText] = useState('');
  const [approveReason, setApproveReason] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await advancedAccessAPI.getRoleReviews();
      setRoles(r.data);
    } catch (e) { setError('تعذّر تحميل قائمة الأدوار'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDetail = (role: any) => { setSelected(role); setNoteText(''); setApproveReason(''); };

  const refreshSelected = async (key: string) => {
    const r = await advancedAccessAPI.getRoleReviews();
    setRoles(r.data);
    setSelected(r.data.find((x: any) => x.key === key));
  };

  const saveField = async (field: string, value: any) => {
    if (!selected) return;
    try {
      await advancedAccessAPI.updateRoleReview(selected.key, { [field]: value });
      await refreshSelected(selected.key);
    } catch (e: any) { setError(e?.response?.data?.detail || 'تعذّر الحفظ'); }
  };

  const addNote = async () => {
    if (!selected || !noteText.trim()) return;
    try { await advancedAccessAPI.addRoleReviewNote(selected.key, noteText.trim()); setNoteText(''); await refreshSelected(selected.key); }
    catch (e: any) { setError(e?.response?.data?.detail || 'تعذّر إضافة الملاحظة'); }
  };

  const approve = async () => {
    if (!selected || !approveReason.trim()) return;
    try { await advancedAccessAPI.approveRoleReview(selected.key, approveReason.trim()); setApproveReason(''); await refreshSelected(selected.key); }
    catch (e: any) { setError(e?.response?.data?.detail || 'تعذّر الاعتماد'); }
  };

  const decidePermission = async (permKey: string, decision: string) => {
    if (!selected) return;
    try { await advancedAccessAPI.decideRolePermission(selected.key, permKey, decision); await refreshSelected(selected.key); }
    catch (e: any) { setError(e?.response?.data?.detail || 'تعذّر تسجيل القرار'); }
  };

  const filtered = statusFilter ? roles.filter(r => r.status === statusFilter) : roles;

  if (loading) return <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />;

  return (
    <View testID="adv-role-review-list">
      {!!error && <Text style={styles.errorText}>{error}</Text>}
      <View style={styles.filterRow}>
        {['', 'not_reviewed', 'in_review', 'needs_changes', 'ready_for_approval'].map(s => (
          <TouchableOpacity key={s || 'all'} style={[styles.chip, statusFilter === s && styles.chipActive]} onPress={() => setStatusFilter(s)} testID={`adv-role-filter-${s || 'all'}`}>
            <Text style={[styles.chipText, statusFilter === s && styles.chipTextActive]}>{s ? REVIEW_STATUS_LABELS[s] : `الكل (${roles.length})`}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.map(role => (
        <TouchableOpacity key={role.key} style={styles.roleCard} onPress={() => openDetail(role)} testID={`adv-role-card-${role.key}`}>
          <View style={{ flex: 1 }}>
            <Text style={styles.roleName}>{role.legacy_role_name}</Text>
            <Text style={styles.roleMeta}>مستخدمون: {role.linked_users_count} | صلاحيات: {role.permission_keys_count} | حساسة: {role.sensitive_linked_count} | الإنجاز: {role.completion_percentage}%</Text>
            <Text style={role.usage_status === 'unused_pending_review' ? styles.warnText : styles.listItemSmall}>{USAGE_STATUS_LABELS[role.usage_status]}</Text>
            {role.excess_flags_count > 0 && <Text style={styles.warnText}>⚠ صلاحيات زائدة محتملة: {role.excess_flags_count}</Text>}
            {role.missing_coverage_count > 0 && <Text style={styles.warnText}>⚠ فجوة مطابقة: {role.missing_coverage_count} صلاحية قديمة بلا مكافئ</Text>}
            {role.needs_second_approval && <Text style={styles.warnText}>⏳ بانتظار موافقة ثانية مستقلة</Text>}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: REVIEW_STATUS_COLORS[role.status] }]}>
            <Text style={styles.statusBadgeText}>{REVIEW_STATUS_LABELS[role.status]}</Text>
          </View>
          {role.approved && <Ionicons name="checkmark-circle" size={18} color={COLORS.success} style={{ marginRight: 6 }} />}
        </TouchableOpacity>
      ))}

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalBox} testID="adv-role-detail-modal">
            {selected && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{selected.legacy_role_name}</Text>
                  <TouchableOpacity onPress={() => setSelected(null)} testID="adv-role-detail-close-btn"><Ionicons name="close" size={22} color={COLORS.text} /></TouchableOpacity>
                </View>
                <Text style={styles.sectionLabel}>المستخدمون المرتبطون ({selected.linked_users_count}) — {USAGE_STATUS_LABELS[selected.usage_status]}</Text>
                {selected.linked_users.map((u: any) => <Text key={u.id} style={styles.listItem}>• {u.full_name} ({u.username})</Text>)}
                {selected.linked_users_count === 0 && <Text style={styles.listItemSmall}>{selected.usage_note}</Text>}
                {selected.role_definition_created_at && <Text style={styles.listItemSmall}>تاريخ إنشاء تعريف الدور: {new Date(selected.role_definition_created_at).toLocaleDateString('ar-EG')}</Text>}

                <Text style={styles.sectionLabel}>مقارنة الصلاحيات (قديم ↔ جديد) — نسبة إنجاز المراجعة: {selected.completion_percentage}%</Text>
                <Text style={styles.listItemSmall}>الصلاحيات القديمة ({selected.legacy_permission_keys_count}): {(selected.legacy_permission_keys || []).slice(0, 20).join('، ')}{(selected.legacy_permission_keys || []).length > 20 ? ' ...' : ''}</Text>
                <Text style={[styles.listItemSmall, { marginTop: 6 }]}>الصلاحيات الجديدة المقترحة ({selected.permission_keys_count}) — اعتمد أو ارفض كل صلاحية:</Text>
                <ScrollView style={styles.permScroll} nestedScrollEnabled testID="adv-role-permission-comparison-list">
                  {Object.keys(selected.permission_decisions || {}).map((pk: string) => {
                    const dec = selected.permission_decisions[pk];
                    return (
                      <View key={pk} style={styles.permDecisionRow}>
                        <Text style={styles.permDecisionLabel} numberOfLines={1}>{permissionLabels[pk] || pk}</Text>
                        <View style={[styles.decisionBadge, { backgroundColor: DECISION_COLORS[dec.decision] }]}><Text style={styles.decisionBadgeText}>{DECISION_LABELS[dec.decision]}</Text></View>
                        {canManage && (
                          <View style={styles.decisionBtns}>
                            <TouchableOpacity onPress={() => decidePermission(pk, 'approved')} testID={`adv-role-perm-approve-${pk}`}><Ionicons name="checkmark-circle" size={18} color={COLORS.success} /></TouchableOpacity>
                            <TouchableOpacity onPress={() => decidePermission(pk, 'rejected')} testID={`adv-role-perm-reject-${pk}`}><Ionicons name="close-circle" size={18} color={COLORS.danger} /></TouchableOpacity>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>

                <Text style={styles.sectionLabel}>الصلاحيات الحساسة المرتبطة ({selected.sensitive_linked_count})</Text>
                {selected.sensitive_linked.slice(0, 15).map((k: string) => <Text key={k} style={styles.listItemSmall}>• {permissionLabels[k] || k}</Text>)}
                {selected.sensitive_linked.length > 15 && <Text style={styles.listItemSmall}>... و{selected.sensitive_linked.length - 15} أخرى</Text>}

                <Text style={styles.sectionLabel}>صلاحيات زائدة محتملة ({selected.excess_flags_count})</Text>
                {selected.excess_flags.map((f: any) => (
                  <View key={f.key} style={styles.excessBox}>
                    <Text style={styles.warnText}>• {f.label_ar || f.key} ({f.operation_type})</Text>
                    <Text style={styles.listItemSmall}>السبب: {f.reason}</Text>
                    <Text style={styles.listItemSmall}>النطاق الحالي المقترح: {scopeOptions[f.role_current_scope] || 'غير محدَّد'} | الخطورة: {f.risk}</Text>
                    <Text style={styles.listItemSmall}>التوصية: {f.recommendation}</Text>
                  </View>
                ))}
                {selected.excess_flags_count === 0 && <Text style={styles.listItemSmall}>لا يوجد</Text>}

                <Text style={styles.sectionLabel}>فجوات مطابقة (صلاحيات قديمة بلا مكافئ جديد مكتشَف) ({selected.missing_coverage_count})</Text>
                {selected.missing_coverage.map((k: string) => <Text key={k} style={styles.warnText}>• {k}</Text>)}
                {selected.missing_coverage_count === 0 && <Text style={styles.listItemSmall}>لا يوجد</Text>}

                <Text style={styles.sectionLabel}>التصنيف (مقترح: {roleCategories[selected.suggested_category] || '-'})</Text>
                <View style={styles.filterRow}>
                  {Object.keys(roleCategories).map(c => (
                    <TouchableOpacity key={c} disabled={!canManage} style={[styles.chip, selected.confirmed_category === c && styles.chipActive]} onPress={() => saveField('confirmed_category', c)} testID={`adv-role-category-${c}`}>
                      <Text style={[styles.chipText, selected.confirmed_category === c && styles.chipTextActive]}>{roleCategories[c]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.sectionLabel}>النطاق (مقترح: {scopeOptions[selected.suggested_scope] || '-'})</Text>
                <View style={styles.filterRow}>
                  {Object.keys(scopeOptions).map(sc => (
                    <TouchableOpacity key={sc} disabled={!canManage} style={[styles.chip, selected.confirmed_scope === sc && styles.chipActive]} onPress={() => saveField('confirmed_scope', sc)} testID={`adv-role-scope-${sc}`}>
                      <Text style={[styles.chipText, selected.confirmed_scope === sc && styles.chipTextActive]}>{scopeOptions[sc]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.sectionLabel}>حالة المراجعة</Text>
                <View style={styles.filterRow}>
                  {Object.keys(REVIEW_STATUS_LABELS).map(s => (
                    <TouchableOpacity key={s} disabled={!canManage} style={[styles.chip, selected.status === s && styles.chipActive]} onPress={() => saveField('status', s)} testID={`adv-role-status-${s}`}>
                      <Text style={[styles.chipText, selected.status === s && styles.chipTextActive]}>{REVIEW_STATUS_LABELS[s]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.sectionLabel}>الملاحظات ({selected.notes.length})</Text>
                {selected.notes.map((n: any, i: number) => <Text key={i} style={styles.listItemSmall}>• {n.text} — {n.by_username}</Text>)}
                {canManage && (
                  <View style={styles.row}>
                    <TextInput style={styles.input} placeholder="أضف ملاحظة" value={noteText} onChangeText={setNoteText} testID="adv-role-note-input" />
                    <TouchableOpacity style={styles.smallBtn} onPress={addNote} testID="adv-role-note-add-btn"><Text style={styles.smallBtnText}>إضافة</Text></TouchableOpacity>
                  </View>
                )}

                <Text style={styles.sectionLabel}>الاعتماد ({selected.approvals.length}/{selected.sensitive_linked_count > 0 ? 2 : 1} — {selected.approved ? 'مُعتمَد' : 'غير معتمَد'})</Text>
                {selected.approvals.map((a: any, i: number) => <Text key={i} style={styles.listItemSmall}>• {a.by_username}: {a.reason}</Text>)}
                {canManage && selected.status === 'ready_for_approval' && !selected.approved && (
                  <View style={styles.row}>
                    <TextInput style={styles.input} placeholder="سبب الاعتماد (إلزامي)" value={approveReason} onChangeText={setApproveReason} testID="adv-role-approve-reason-input" />
                    <TouchableOpacity style={styles.smallBtn} onPress={approve} testID="adv-role-approve-btn"><Text style={styles.smallBtnText}>اعتماد</Text></TouchableOpacity>
                  </View>
                )}
                {selected.status !== 'ready_for_approval' && <Text style={styles.listItemSmall}>يجب ضبط الحالة على «جاهز للاعتماد» أولاً لتمكين الاعتماد</Text>}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  errorText: { color: COLORS.danger, textAlign: 'right', marginBottom: 8, fontSize: 12 },
  filterRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  chip: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 4 },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 11, color: COLORS.text },
  chipTextActive: { color: '#fff' },
  roleCard: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  roleName: { fontSize: 14, fontWeight: 'bold', color: COLORS.text, textAlign: 'right' },
  roleMeta: { fontSize: 11, color: COLORS.textMuted, textAlign: 'right', marginTop: 2 },
  warnText: { fontSize: 11, color: COLORS.warning, textAlign: 'right', marginTop: 2 },
  statusBadge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, marginRight: 8 },
  statusBadgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: '#fff', borderRadius: 12, padding: 16, width: '92%', maxWidth: 520, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, textAlign: 'right' },
  sectionLabel: { fontSize: 13, fontWeight: 'bold', color: COLORS.primary, textAlign: 'right', marginTop: 12, marginBottom: 4 },
  listItem: { fontSize: 12, color: COLORS.text, textAlign: 'right' },
  listItemSmall: { fontSize: 11, color: COLORS.textMuted, textAlign: 'right' },
  row: { flexDirection: 'row-reverse', gap: 8, alignItems: 'center', marginTop: 6 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 8, flex: 1, textAlign: 'right', fontSize: 12 },
  smallBtn: { backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  smallBtnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  permScroll: { maxHeight: 220, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, marginTop: 6 },
  permDecisionRow: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 8 },
  permDecisionLabel: { flex: 1, fontSize: 11, color: COLORS.text, textAlign: 'right' },
  decisionBadge: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  decisionBadgeText: { color: '#fff', fontSize: 9, fontWeight: '600' },
  decisionBtns: { flexDirection: 'row-reverse', gap: 6 },
  excessBox: { backgroundColor: '#fff8ed', borderRadius: 8, padding: 8, marginBottom: 6, borderWidth: 1, borderColor: COLORS.warning },
});

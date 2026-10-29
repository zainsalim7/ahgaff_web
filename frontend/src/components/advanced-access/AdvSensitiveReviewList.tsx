import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Modal, TextInput, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { advancedAccessAPI } from '../../services/api';
import { COLORS, SENSITIVITY_LABELS, REVIEW_STATUS_LABELS, REVIEW_STATUS_COLORS } from './shared';

export const AdvSensitiveReviewList: React.FC<{ canManage: boolean; permCategories: any; scopeOptions: any; roles: any[] }> = ({ canManage, permCategories, scopeOptions, roles }) => {
  const [loading, setLoading] = useState(true);
  const [perms, setPerms] = useState<any[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [noteText, setNoteText] = useState('');
  const [approveReason, setApproveReason] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await advancedAccessAPI.getSensitivePermissionReviews(); setPerms(r.data); }
    catch (e) { setError('تعذّر تحميل الصلاحيات الحساسة'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const refreshSelected = async (key: string) => {
    const r = await advancedAccessAPI.getSensitivePermissionReviews();
    setPerms(r.data);
    setSelected(r.data.find((x: any) => x.permission_key === key));
  };

  const saveField = async (field: string, value: any) => {
    if (!selected) return;
    try { await advancedAccessAPI.updateSensitivePermissionReview(selected.permission_key, { [field]: value }); await refreshSelected(selected.permission_key); }
    catch (e: any) { setError(e?.response?.data?.detail || 'تعذّر الحفظ'); }
  };

  const toggleAllowedRole = async (roleKey: string) => {
    if (!selected) return;
    const current: string[] = selected.allowed_role_keys || [];
    const next = current.includes(roleKey) ? current.filter(k => k !== roleKey) : [...current, roleKey];
    await saveField('allowed_role_keys', next);
  };

  const addNote = async () => {
    if (!selected || !noteText.trim()) return;
    try { await advancedAccessAPI.addSensitivePermissionNote(selected.permission_key, noteText.trim()); setNoteText(''); await refreshSelected(selected.permission_key); }
    catch (e: any) { setError(e?.response?.data?.detail || 'تعذّر إضافة الملاحظة'); }
  };

  const approve = async () => {
    if (!selected || !approveReason.trim()) return;
    try { await advancedAccessAPI.approveSensitivePermissionReview(selected.permission_key, approveReason.trim()); setApproveReason(''); await refreshSelected(selected.permission_key); }
    catch (e: any) { setError(e?.response?.data?.detail || 'تعذّر الاعتماد'); }
  };

  const filtered = categoryFilter ? perms.filter(p => p.category === categoryFilter) : perms;
  const catCounts: { [k: string]: number } = {};
  perms.forEach(p => { catCounts[p.category] = (catCounts[p.category] || 0) + 1; });

  if (loading) return <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />;

  return (
    <View testID="adv-sensitive-review-list">
      {!!error && <Text style={styles.errorText}>{error}</Text>}
      <View style={styles.filterRow}>
        <TouchableOpacity style={[styles.chip, categoryFilter === '' && styles.chipActive]} onPress={() => setCategoryFilter('')} testID="adv-sensitive-filter-all">
          <Text style={[styles.chipText, categoryFilter === '' && styles.chipTextActive]}>الكل ({perms.length})</Text>
        </TouchableOpacity>
        {Object.keys(permCategories).map(c => (
          <TouchableOpacity key={c} style={[styles.chip, categoryFilter === c && styles.chipActive]} onPress={() => setCategoryFilter(c)} testID={`adv-sensitive-filter-${c}`}>
            <Text style={[styles.chipText, categoryFilter === c && styles.chipTextActive]}>{permCategories[c]} ({catCounts[c] || 0})</Text>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.map(p => (
        <TouchableOpacity key={p.permission_key} style={styles.permCard} onPress={() => { setSelected(p); setNoteText(''); setApproveReason(''); }} testID={`adv-sensitive-card-${p.permission_key}`}>
          <View style={{ flex: 1 }}>
            <Text style={styles.permLabel}>{p.label_ar}</Text>
            <Text style={styles.permMeta}>{p.permission_key} | المسموح لها: {(p.allowed_role_keys || []).length} دور</Text>
          </View>
          <View style={[styles.sensBadge, { backgroundColor: SENSITIVITY_LABELS[p.sensitivity]?.color }]}>
            <Text style={styles.sensBadgeText}>{SENSITIVITY_LABELS[p.sensitivity]?.label}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: REVIEW_STATUS_COLORS[p.status] }]}>
            <Text style={styles.statusBadgeText}>{REVIEW_STATUS_LABELS[p.status]}</Text>
          </View>
        </TouchableOpacity>
      ))}
      {filtered.length === 0 && <Text style={styles.listItemSmall}>لا توجد صلاحيات ضمن هذا التصنيف (غير مطبَّقة على هذا النظام حاليًا)</Text>}

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalBox} testID="adv-sensitive-detail-modal">
            {selected && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{selected.label_ar}</Text>
                  <TouchableOpacity onPress={() => setSelected(null)} testID="adv-sensitive-detail-close-btn"><Ionicons name="close" size={22} color={COLORS.text} /></TouchableOpacity>
                </View>
                <Text style={styles.listItemSmall}>{selected.permission_key}</Text>
                <Text style={styles.listItemSmall}>التصنيف: {permCategories[selected.category]} | الحساسية: {SENSITIVITY_LABELS[selected.sensitivity]?.label}</Text>

                <Text style={styles.sectionLabel}>الأدوار المسموح لها بهذه الصلاحية ({(selected.allowed_role_keys || []).length})</Text>
                {roles.map(r => (
                  <TouchableOpacity key={r.key} disabled={!canManage} style={styles.roleToggleRow} onPress={() => toggleAllowedRole(r.key)} testID={`adv-sensitive-role-toggle-${r.key}`}>
                    <Ionicons name={(selected.allowed_role_keys || []).includes(r.key) ? 'checkbox' : 'square-outline'} size={18} color={COLORS.primary} />
                    <Text style={styles.listItem}>{r.legacy_role_name}</Text>
                  </TouchableOpacity>
                ))}

                <Text style={styles.sectionLabel}>النطاق الموصى به</Text>
                <View style={styles.filterRow}>
                  {Object.keys(scopeOptions).map(sc => (
                    <TouchableOpacity key={sc} disabled={!canManage} style={[styles.chip, selected.recommended_scope === sc && styles.chipActive]} onPress={() => saveField('recommended_scope', sc)} testID={`adv-sensitive-scope-${sc}`}>
                      <Text style={[styles.chipText, selected.recommended_scope === sc && styles.chipTextActive]}>{scopeOptions[sc]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.switchRow}>
                  <Text style={styles.listItem}>تتطلب موافقة مزدوجة (شخصان مختلفان)</Text>
                  <Switch value={!!selected.requires_dual_approval} disabled={!canManage} onValueChange={(v) => saveField('requires_dual_approval', v)} testID="adv-sensitive-dual-approval-switch" />
                </View>
                <View style={styles.switchRow}>
                  <Text style={styles.listItem}>تسجيل في سجل التدقيق إلزامي</Text>
                  <Switch value={!!selected.requires_audit_log} disabled={!canManage} onValueChange={(v) => saveField('requires_audit_log', v)} testID="adv-sensitive-audit-log-switch" />
                </View>

                <Text style={styles.sectionLabel}>حالة المراجعة</Text>
                <View style={styles.filterRow}>
                  {Object.keys(REVIEW_STATUS_LABELS).map(s => (
                    <TouchableOpacity key={s} disabled={!canManage} style={[styles.chip, selected.status === s && styles.chipActive]} onPress={() => saveField('status', s)} testID={`adv-sensitive-status-${s}`}>
                      <Text style={[styles.chipText, selected.status === s && styles.chipTextActive]}>{REVIEW_STATUS_LABELS[s]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.sectionLabel}>الملاحظات ({(selected.notes || []).length})</Text>
                {(selected.notes || []).map((n: any, i: number) => <Text key={i} style={styles.listItemSmall}>• {n.text} — {n.by_username}</Text>)}
                {canManage && (
                  <View style={styles.row}>
                    <TextInput style={styles.input} placeholder="أضف ملاحظة" value={noteText} onChangeText={setNoteText} testID="adv-sensitive-note-input" />
                    <TouchableOpacity style={styles.smallBtn} onPress={addNote} testID="adv-sensitive-note-add-btn"><Text style={styles.smallBtnText}>إضافة</Text></TouchableOpacity>
                  </View>
                )}

                <Text style={styles.sectionLabel}>الاعتماد ({(selected.approvals || []).length}/{selected.requires_dual_approval ? 2 : 1} — {selected.approved ? 'مُعتمَد' : 'غير معتمَد'})</Text>
                {(selected.approvals || []).map((a: any, i: number) => <Text key={i} style={styles.listItemSmall}>• {a.by_username}: {a.reason}</Text>)}
                {canManage && selected.status === 'ready_for_approval' && !selected.approved && (
                  <View style={styles.row}>
                    <TextInput style={styles.input} placeholder="سبب الاعتماد (إلزامي)" value={approveReason} onChangeText={setApproveReason} testID="adv-sensitive-approve-reason-input" />
                    <TouchableOpacity style={styles.smallBtn} onPress={approve} testID="adv-sensitive-approve-btn"><Text style={styles.smallBtnText}>اعتماد</Text></TouchableOpacity>
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
  permCard: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  permLabel: { fontSize: 13, fontWeight: 'bold', color: COLORS.text, textAlign: 'right' },
  permMeta: { fontSize: 10, color: COLORS.textMuted, textAlign: 'right', marginTop: 2 },
  sensBadge: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 3, marginRight: 6 },
  sensBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  statusBadge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, marginRight: 6 },
  statusBadgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: '#fff', borderRadius: 12, padding: 16, width: '92%', maxWidth: 520, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { fontSize: 15, fontWeight: 'bold', color: COLORS.text, textAlign: 'right' },
  sectionLabel: { fontSize: 13, fontWeight: 'bold', color: COLORS.primary, textAlign: 'right', marginTop: 12, marginBottom: 4 },
  listItem: { fontSize: 12, color: COLORS.text, textAlign: 'right' },
  listItemSmall: { fontSize: 11, color: COLORS.textMuted, textAlign: 'right' },
  roleToggleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 4 },
  switchRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  row: { flexDirection: 'row-reverse', gap: 8, alignItems: 'center', marginTop: 6 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 8, flex: 1, textAlign: 'right', fontSize: 12 },
  smallBtn: { backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  smallBtnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
});

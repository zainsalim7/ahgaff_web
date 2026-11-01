import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ActivityIndicator, ScrollView, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { advancedAccessAPI } from '../../services/api';
import { COLORS, SCOPE_TYPE_LABELS } from './shared';

const SCOPE_TYPES = ['university', 'faculty', 'multi_faculty', 'department', 'multi_department', 'unit', 'multi_unit', 'course'];

export const AdvAssignmentsManager: React.FC<{ canManage: boolean }> = ({ canManage }) => {
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [detail, setDetail] = useState<any>(null);

  const [userId, setUserId] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [selectedUserLabel, setSelectedUserLabel] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickUsername, setQuickUsername] = useState('');
  const [quickFullName, setQuickFullName] = useState('');
  const [quickCreating, setQuickCreating] = useState(false);
  const [quickResultMsg, setQuickResultMsg] = useState('');
  const [assignmentType, setAssignmentType] = useState('academic');
  const [roleId, setRoleId] = useState('');
  const [label, setLabel] = useState('');
  const [scopeType, setScopeType] = useState('university');
  const [scopeOptions, setScopeOptions] = useState<any[]>([]);
  const [scopeRefIds, setScopeRefIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    advancedAccessAPI.getAllAssignments().then(res => setAssignments(res.data)).catch(() => setAssignments([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = async () => {
    setError(''); setUserId(''); setUserSearch(''); setSelectedUserLabel(''); setShowUserDropdown(false);
    setShowQuickCreate(false); setQuickUsername(''); setQuickFullName(''); setQuickResultMsg('');
    setAssignmentType('academic'); setRoleId(''); setLabel(''); setScopeType('university'); setScopeRefIds([]);
    try {
      const [u, r] = await Promise.all([advancedAccessAPI.getLightUsers(), advancedAccessAPI.getRoles()]);
      setUsers(u.data); setRoles(r.data);
    } catch (e) { /* ignore */ }
    setModalVisible(true);
  };

  const pickUser = (u: any) => {
    setUserId(u.id); setSelectedUserLabel(u.full_name || u.username); setUserSearch(''); setShowUserDropdown(false);
  };

  const clearUserSelection = () => { setUserId(''); setSelectedUserLabel(''); };

  const runQuickFindOrCreate = async () => {
    if (!quickUsername.trim() || !quickFullName.trim()) { setQuickResultMsg('أدخل اسم المستخدم والاسم الكامل'); return; }
    setQuickCreating(true); setQuickResultMsg('');
    try {
      const res = await advancedAccessAPI.quickFindOrCreateUser({ username: quickUsername.trim(), full_name: quickFullName.trim() });
      const u = res.data;
      pickUser(u);
      setQuickResultMsg(
        u.existed
          ? `هذا المستخدم موجود بالفعل (${u.full_name}) — تم اختياره تلقائيًا لإسناد الدور له`
          : `تم إنشاء مستخدم جديد (${u.full_name}) — كلمة المرور الأولية: ${u.initial_password} (سيُطلب منه تغييرها عند أول دخول)`
      );
      setShowQuickCreate(false); setQuickUsername(''); setQuickFullName('');
    } catch (e: any) {
      setQuickResultMsg(e?.response?.data?.detail || 'تعذّر تنفيذ العملية');
    } finally { setQuickCreating(false); }
  };

  useEffect(() => {
    if (scopeType === 'university') { setScopeOptions([]); return; }
    advancedAccessAPI.getScopeOptions(scopeType).then(res => setScopeOptions(res.data)).catch(() => setScopeOptions([]));
  }, [scopeType]);

  const toggleScopeRef = (id: string) => {
    setScopeRefIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const save = async () => {
    if (!userId || !roleId || !label.trim()) { setError('جميع الحقول مطلوبة (المستخدم، الدور، تسمية السياق)'); return; }
    setSaving(true);
    try {
      await advancedAccessAPI.createAssignment({
        user_id: userId, assignment_type: assignmentType, advanced_role_id: roleId, context_label_ar: label,
        scope: { scope_type: scopeType, scope_ref_ids: scopeRefIds }, direct_permissions: [],
      });
      setModalVisible(false);
      load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'تعذّر إنشاء التكليف');
    } finally { setSaving(false); }
  };

  const endAssignment = async (a: any) => {
    try { await advancedAccessAPI.endAssignment(a.id); load(); } catch (e: any) { setActionError(e?.response?.data?.detail || 'تعذّر إنهاء التكليف'); }
  };

  const viewContext = async (a: any) => {
    try { const res = await advancedAccessAPI.getAssignmentContext(a.id); setDetail(res.data); } catch (e: any) { setActionError(e?.response?.data?.detail || 'تعذّر عرض السياق'); }
  };

  if (loading) return <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />;

  return (
    <View testID="adv-assignments-manager">
      <View style={styles.headerRow}>
        <Text style={styles.title}>التكليفات المتعددة ({assignments.length})</Text>
        {canManage && (
          <TouchableOpacity style={styles.addBtn} onPress={openCreate} testID="adv-assignment-create-btn">
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.addBtnText}>تكليف جديد</Text>
          </TouchableOpacity>
        )}
      </View>
      {!!actionError && <Text style={styles.errorText}>{actionError}</Text>}

      {assignments.map(a => (
        <View key={a.id} style={styles.card} testID={`adv-assignment-card-${a.id}`}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{a.context_label_ar}</Text>
            <Text style={styles.cardMeta}>{a.user_name} — {a.role_name_ar} — {a.assignment_type === 'academic' ? 'أكاديمي' : 'إداري'}</Text>
            <Text style={styles.cardMeta}>النطاق: {SCOPE_TYPE_LABELS[a.scope?.scope_type] || a.scope?.scope_type}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: a.status === 'active' ? COLORS.success : '#999' }]}>
            <Text style={styles.statusBadgeText}>{a.status === 'active' ? 'نشط' : 'منتهٍ'}</Text>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity onPress={() => viewContext(a)} testID={`adv-assignment-view-${a.id}`}><Ionicons name="eye-outline" size={20} color={COLORS.primary} /></TouchableOpacity>
            {canManage && a.status === 'active' && (
              <TouchableOpacity onPress={() => endAssignment(a)} testID={`adv-assignment-end-${a.id}`}><Ionicons name="stop-circle-outline" size={20} color={COLORS.danger} /></TouchableOpacity>
            )}
          </View>
        </View>
      ))}

      <Modal visible={!!detail} transparent animationType="fade" onRequestClose={() => setDetail(null)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setDetail(null)}>
          <View style={styles.detailBox} testID="adv-assignment-detail-modal">
            <Text style={styles.modalTitle}>{detail?.context_label_ar}</Text>
            <Text style={styles.detailLine}>الدور: {detail?.role_name_ar}</Text>
            <Text style={styles.detailLine}>النطاق: {SCOPE_TYPE_LABELS[detail?.scope?.scope_type] || detail?.scope?.scope_type}</Text>
            <Text style={styles.detailLine}>عدد الصلاحيات الفعّالة: {detail?.effective_permissions?.length}</Text>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={modalVisible} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>تكليف جديد</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)} testID="adv-assignment-modal-close"><Ionicons name="close" size={24} color={COLORS.text} /></TouchableOpacity>
          </View>
          <ScrollView style={{ padding: 14 }}>
            <Text style={styles.label}>المستخدم</Text>
            {!!selectedUserLabel && (
              <View style={styles.selectedUserPill} testID="adv-assignment-selected-user">
                <TouchableOpacity onPress={clearUserSelection} testID="adv-assignment-user-clear"><Ionicons name="close-circle" size={18} color={COLORS.textMuted} /></TouchableOpacity>
                <Text style={styles.selectedUserText}>{selectedUserLabel}</Text>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
              </View>
            )}
            {!selectedUserLabel && (
              <>
                <TextInput
                  style={styles.input} placeholder="ابحث باسم المستخدم..." value={userSearch}
                  onChangeText={(t) => { setUserSearch(t); setShowUserDropdown(true); }}
                  onFocus={() => setShowUserDropdown(true)} textAlign="right" testID="adv-assignment-user-search"
                />
                {showUserDropdown && !!userSearch && (
                  <View style={styles.dropdown} testID="adv-assignment-user-dropdown">
                    {users.filter(u => (u.full_name || '').toLowerCase().includes(userSearch.toLowerCase()) || (u.username || '').toLowerCase().includes(userSearch.toLowerCase())).slice(0, 8).map(u => (
                      <TouchableOpacity key={u.id} style={styles.dropdownRow} onPress={() => pickUser(u)} testID={`adv-assignment-user-${u.id}`}>
                        <Text style={styles.dropdownRowText}>{u.full_name || u.username}</Text>
                        <Text style={styles.dropdownRowSub}>{u.username}</Text>
                      </TouchableOpacity>
                    ))}
                    {users.filter(u => (u.full_name || '').toLowerCase().includes(userSearch.toLowerCase()) || (u.username || '').toLowerCase().includes(userSearch.toLowerCase())).length === 0 && (
                      <Text style={styles.dropdownEmpty}>لا توجد نتائج مطابقة — يمكنك إنشاء مستخدم جديد بالأسفل</Text>
                    )}
                  </View>
                )}
                <TouchableOpacity onPress={() => setShowQuickCreate(v => !v)} style={styles.quickCreateToggle} testID="adv-assignment-quickcreate-toggle">
                  <Ionicons name={showQuickCreate ? 'chevron-up' : 'person-add-outline'} size={14} color={COLORS.primary} />
                  <Text style={styles.quickCreateToggleText}>{showQuickCreate ? 'إخفاء' : 'أو إنشاء مستخدم جديد غير موجود بالنظام'}</Text>
                </TouchableOpacity>
                {showQuickCreate && (
                  <View style={styles.quickCreateBox}>
                    <TextInput style={styles.input} placeholder="اسم المستخدم (رقم وظيفي/معرّف فريد)" value={quickUsername} onChangeText={setQuickUsername} textAlign="right" testID="adv-assignment-quick-username" />
                    <TextInput style={[styles.input, { marginTop: 8 }]} placeholder="الاسم الكامل" value={quickFullName} onChangeText={setQuickFullName} textAlign="right" testID="adv-assignment-quick-fullname" />
                    <TouchableOpacity style={styles.quickCreateBtn} onPress={runQuickFindOrCreate} disabled={quickCreating} testID="adv-assignment-quick-submit">
                      {quickCreating ? <ActivityIndicator color="#fff" /> : <Text style={styles.quickCreateBtnText}>بحث / إنشاء</Text>}
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
            {!!quickResultMsg && <Text style={styles.quickResultMsg} testID="adv-assignment-quick-result">{quickResultMsg}</Text>}

            <Text style={styles.label}>نوع التكليف</Text>
            <View style={styles.pickerRow}>
              {[['academic', 'أكاديمي'], ['administrative', 'إداري']].map(([v, l]) => (
                <TouchableOpacity key={v} style={[styles.pickChip, assignmentType === v && styles.pickChipActive]} onPress={() => setAssignmentType(v)} testID={`adv-assignment-type-${v}`}>
                  <Text style={[styles.pickChipText, assignmentType === v && styles.pickChipTextActive]}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>الدور المتقدم</Text>
            <ScrollView horizontal style={styles.pickerRow} contentContainerStyle={{ flexDirection: 'row-reverse' }}>
              {roles.map(r => (
                <TouchableOpacity key={r.id} style={[styles.pickChip, roleId === r.id && styles.pickChipActive]} onPress={() => setRoleId(r.id)} testID={`adv-assignment-role-${r.id}`}>
                  <Text style={[styles.pickChipText, roleId === r.id && styles.pickChipTextActive]}>{r.name_ar}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.label}>تسمية السياق (مثال: عميد كلية التعليم عن بعد)</Text>
            <TextInput style={styles.input} value={label} onChangeText={setLabel} textAlign="right" testID="adv-assignment-label-input" />

            <Text style={styles.label}>نوع النطاق</Text>
            <ScrollView horizontal style={styles.pickerRow} contentContainerStyle={{ flexDirection: 'row-reverse' }}>
              {SCOPE_TYPES.map(st => (
                <TouchableOpacity key={st} style={[styles.pickChip, scopeType === st && styles.pickChipActive]} onPress={() => { setScopeType(st); setScopeRefIds([]); }} testID={`adv-assignment-scopetype-${st}`}>
                  <Text style={[styles.pickChipText, scopeType === st && styles.pickChipTextActive]}>{SCOPE_TYPE_LABELS[st]}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {scopeOptions.length > 0 && (
              <>
                <Text style={styles.label}>اختر عناصر النطاق</Text>
                <ScrollView style={{ maxHeight: 160 }}>
                  {scopeOptions.map(o => (
                    <TouchableOpacity key={o.id} style={styles.checkRow} onPress={() => toggleScopeRef(o.id)} testID={`adv-assignment-scoperef-${o.id}`}>
                      <Ionicons name={scopeRefIds.includes(o.id) ? 'checkbox' : 'square-outline'} size={18} color={COLORS.primary} />
                      <Text style={styles.checkLabel}>{o.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {!!error && <Text style={styles.errorText}>{error}</Text>}
            <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving} testID="adv-assignment-save-btn">
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>إنشاء التكليف</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
  addBtn: { flexDirection: 'row-reverse', backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, gap: 6, alignItems: 'center' },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  card: { flexDirection: 'row-reverse', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', gap: 10 },
  cardTitle: { fontSize: 14, fontWeight: 'bold', color: COLORS.text, textAlign: 'right' },
  cardMeta: { fontSize: 11, color: COLORS.textMuted, textAlign: 'right', marginTop: 2 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  statusBadgeText: { color: '#fff', fontSize: 10 },
  actions: { flexDirection: 'row', gap: 10 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  detailBox: { backgroundColor: '#fff', borderRadius: 12, padding: 16, width: '85%', maxWidth: 400 },
  detailLine: { fontSize: 13, color: COLORS.text, textAlign: 'right', marginTop: 6 },
  modalContainer: { flex: 1, backgroundColor: COLORS.bg },
  modalHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.text, textAlign: 'right', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, padding: 10 },
  pickerRow: { flexDirection: 'row-reverse' },
  pickChip: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, marginLeft: 6 },
  pickChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pickChipText: { fontSize: 12, color: COLORS.text },
  pickChipTextActive: { color: '#fff' },
  checkRow: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 8, gap: 8 },
  checkLabel: { fontSize: 13, color: COLORS.text, textAlign: 'right' },
  errorText: { color: COLORS.danger, textAlign: 'right', marginTop: 8 },
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: 8, padding: 14, alignItems: 'center', marginVertical: 20 },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  selectedUserPill: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.success, borderRadius: 10, padding: 10, gap: 8 },
  selectedUserText: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.text, textAlign: 'right' },
  dropdown: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, marginTop: 4, maxHeight: 220, overflow: 'hidden' },
  dropdownRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  dropdownRowText: { fontSize: 13, color: COLORS.text, textAlign: 'right' },
  dropdownRowSub: { fontSize: 11, color: COLORS.textMuted },
  dropdownEmpty: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', padding: 12 },
  quickCreateToggle: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 10, alignSelf: 'flex-end' },
  quickCreateToggleText: { fontSize: 12.5, color: COLORS.primary, fontWeight: '600' },
  quickCreateBox: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, marginTop: 10 },
  quickCreateBtn: { backgroundColor: COLORS.shadow, borderRadius: 8, padding: 10, alignItems: 'center', marginTop: 10 },
  quickCreateBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  quickResultMsg: { fontSize: 12, color: COLORS.success, textAlign: 'right', marginTop: 8, lineHeight: 18 },
});

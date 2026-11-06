import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { advancedAccessAPI } from '../../services/api';
import { COLORS, STATUS_LABELS } from './shared';
import { AdvPermissionPicker } from './AdvPermissionPicker';

export const AdvRolesManager: React.FC<{ canManage: boolean }> = ({ canManage }) => {
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    advancedAccessAPI.getRoles().then(res => setRoles(res.data)).catch(() => setRoles([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setName(''); setDescription(''); setSelectedPerms([]); setError(''); setModalVisible(true); };
  const openEdit = (role: any) => { setEditing(role); setName(role.name_ar); setDescription(role.description || ''); setSelectedPerms(role.permission_keys || []); setError(''); setModalVisible(true); };

  const save = async () => {
    if (!name.trim()) { setError('اسم الدور مطلوب'); return; }
    setSaving(true);
    try {
      if (editing) {
        await advancedAccessAPI.updateRole(editing.id, { name_ar: name, description, permission_keys: selectedPerms });
      } else {
        await advancedAccessAPI.createRole({ name_ar: name, description, permission_keys: selectedPerms });
      }
      setModalVisible(false);
      load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'تعذّر الحفظ');
    } finally { setSaving(false); }
  };

  const promote = async (role: any, status: string) => {
    try { await advancedAccessAPI.updateRole(role.id, { status }); load(); } catch (e: any) { setError(e?.response?.data?.detail || 'تعذّر تحديث حالة الدور'); }
  };

  const duplicate = () => {
    setEditing(null);
    setName(`${name} (نسخة)`);
    setModalVisible(true);
  };

  if (loading) return <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />;

  return (
    <View testID="adv-roles-manager">
      <View style={styles.headerRow}>
        <Text style={styles.title}>الأدوار المتقدمة ({roles.length})</Text>
        {canManage && (
          <TouchableOpacity style={styles.addBtn} onPress={openCreate} testID="adv-role-create-btn">
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.addBtnText}>دور جديد</Text>
          </TouchableOpacity>
        )}
      </View>
      {!!error && !modalVisible && <Text style={styles.errorText}>{error}</Text>}

      {roles.map(r => (
        <View key={r.id} style={styles.roleCard} testID={`adv-role-card-${r.id}`}>
          <View style={{ flex: 1 }}>
            <Text style={styles.roleName}>{r.name_ar}</Text>
            <Text style={styles.roleDesc} numberOfLines={2}>{r.description}</Text>
            <Text style={styles.rolePermCount}>{(r.permission_keys || []).length} صلاحية</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: (STATUS_LABELS[r.status] || {}).color || '#999' }]}>
            <Text style={styles.statusBadgeText}>{(STATUS_LABELS[r.status] || {}).label || r.status}</Text>
          </View>
          {canManage && (
            <View style={styles.roleActions}>
              <TouchableOpacity onPress={() => openEdit(r)} testID={`adv-role-edit-${r.id}`}><Ionicons name="create-outline" size={20} color={COLORS.primary} /></TouchableOpacity>
              {r.status === 'draft' && <TouchableOpacity onPress={() => promote(r, 'shadow')} testID={`adv-role-promote-shadow-${r.id}`}><Ionicons name="flask-outline" size={20} color={COLORS.shadow} /></TouchableOpacity>}
              {r.status === 'shadow' && <TouchableOpacity onPress={() => promote(r, 'ready_for_review')} testID={`adv-role-promote-review-${r.id}`}><Ionicons name="checkmark-circle-outline" size={20} color={COLORS.warning} /></TouchableOpacity>}
            </View>
          )}
        </View>
      ))}

      <Modal visible={modalVisible} animationType="fade" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editing ? 'تعديل دور' : 'دور جديد'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} testID="adv-role-modal-close"><Ionicons name="close" size={22} color={COLORS.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 8 }}>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>اسم الدور</Text>
                <TextInput style={styles.input} value={name} onChangeText={setName} textAlign="right" testID="adv-role-name-input" />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>الوصف</Text>
                <TextInput style={styles.textArea} value={description} onChangeText={setDescription} textAlign="right" multiline testID="adv-role-desc-input" />
              </View>
              <Text style={[styles.label, { marginTop: 4 }]}>الصلاحيات</Text>
              <AdvPermissionPicker selected={selectedPerms} onChange={setSelectedPerms} />
              {!!error && <Text style={styles.errorText}>{error}</Text>}
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)} testID="adv-role-modal-cancel">
                <Text style={styles.cancelBtnText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={save} disabled={saving} testID="adv-role-save-btn">
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>حفظ</Text>}
              </TouchableOpacity>
            </View>
          </View>
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
  roleCard: { flexDirection: 'row-reverse', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', gap: 10 },
  roleName: { fontSize: 14, fontWeight: 'bold', color: COLORS.text, textAlign: 'right' },
  roleDesc: { fontSize: 11, color: COLORS.textMuted, textAlign: 'right', marginTop: 2 },
  rolePermCount: { fontSize: 11, color: COLORS.primary, textAlign: 'right', marginTop: 2 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  statusBadgeText: { color: '#fff', fontSize: 10 },
  roleActions: { flexDirection: 'row', gap: 10 },
  // 🆕 نافذة مُمركزة احترافية بعرض محدود (بدل امتداد كامل الشاشة) + خلفية معتمة
  modalBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(15, 23, 42, 0.6)', padding: 24 },
  modalCard: { width: '100%', maxWidth: 800, maxHeight: '90%', backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0px 8px 24px rgba(0,0,0,0.15)' } as any,
  modalHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: COLORS.text },
  modalBody: { padding: 24 },
  modalFooter: { flexDirection: 'row-reverse', justifyContent: 'flex-start', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.bg, gap: 12 },
  fieldGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.text, textAlign: 'right', marginBottom: 8 },
  input: { height: 46, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, fontSize: 14, color: COLORS.text, textAlign: 'right' },
  textArea: { minHeight: 90, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: COLORS.text, textAlign: 'right', textAlignVertical: 'top' },
  errorText: { color: COLORS.danger, textAlign: 'right', marginTop: 8 },
  cancelBtn: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { color: COLORS.textMuted, fontWeight: '600', fontSize: 14 },
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});

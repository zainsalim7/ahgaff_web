import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ActivityIndicator, ScrollView, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { advancedAccessAPI } from '../../services/api';
import { COLORS } from './shared';

export const AdvDirectPermissions: React.FC<{ canManage: boolean }> = ({ canManage }) => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [assignmentId, setAssignmentId] = useState('');
  const [permKey, setPermKey] = useState('');
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await advancedAccessAPI.getAllAssignments();
      setAssignments(res.data);
      const flat: any[] = [];
      res.data.forEach((a: any) => (a.direct_permissions || []).forEach((dp: any) => flat.push({ ...dp, assignment_id: a.id, context_label_ar: a.context_label_ar, user_name: a.user_name })));
      setRows(flat);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openGrant = async () => {
    setError(''); setAssignmentId(''); setPermKey(''); setReason(''); setSearch('');
    const p = await advancedAccessAPI.getPermissions();
    setPermissions(p.data);
    setModalVisible(true);
  };

  const save = async () => {
    if (!assignmentId || !permKey) { setError('اختر التكليف والصلاحية'); return; }
    setSaving(true);
    try {
      await advancedAccessAPI.grantDirectPermission(assignmentId, { permission_key: permKey, reason });
      setModalVisible(false);
      load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'تعذّر المنح');
    } finally { setSaving(false); }
  };

  const revoke = async (row: any) => {
    await advancedAccessAPI.revokeDirectPermission(row.assignment_id, row.permission_key);
    load();
  };

  const filteredPerms = permissions.filter(p => !search || p.label_ar.includes(search));

  if (loading) return <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />;

  return (
    <View testID="adv-direct-permissions">
      <View style={styles.headerRow}>
        <Text style={styles.title}>الصلاحيات المباشرة (استثناءات) ({rows.length})</Text>
        {canManage && (
          <TouchableOpacity style={styles.addBtn} onPress={openGrant} testID="adv-direct-grant-btn">
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.addBtnText}>منح صلاحية مباشرة</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.desc}>تُمنح لتكليف معيّن دون تعديل دوره الأساسي — تظهر هنا كمصدر "منح مباشر" مستقل</Text>
      {rows.map((r, i) => (
        <View key={i} style={styles.card} testID={`adv-direct-row-${i}`}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{r.permission_key}</Text>
            <Text style={styles.cardMeta}>{r.user_name} — {r.context_label_ar}{r.reason ? ` — السبب: ${r.reason}` : ''}</Text>
          </View>
          {canManage && <TouchableOpacity onPress={() => revoke(r)} testID={`adv-direct-revoke-${i}`}><Ionicons name="close-circle-outline" size={22} color={COLORS.danger} /></TouchableOpacity>}
        </View>
      ))}
      {rows.length === 0 && <Text style={styles.empty}>لا توجد صلاحيات مباشرة ممنوحة حاليًا</Text>}

      <Modal visible={modalVisible} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>منح صلاحية مباشرة</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)} testID="adv-direct-modal-close"><Ionicons name="close" size={24} color={COLORS.text} /></TouchableOpacity>
          </View>
          <ScrollView style={{ padding: 14 }}>
            <Text style={styles.label}>التكليف المستهدف</Text>
            <ScrollView style={{ maxHeight: 140 }}>
              {assignments.filter(a => a.status === 'active').map(a => (
                <TouchableOpacity key={a.id} style={[styles.pickRow, assignmentId === a.id && styles.pickRowActive]} onPress={() => setAssignmentId(a.id)} testID={`adv-direct-assignment-${a.id}`}>
                  <Text style={styles.pickRowText}>{a.user_name} — {a.context_label_ar}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.label}>الصلاحية</Text>
            <TextInput style={styles.input} placeholder="ابحث..." value={search} onChangeText={setSearch} textAlign="right" testID="adv-direct-perm-search" />
            <ScrollView style={{ maxHeight: 160 }}>
              {filteredPerms.slice(0, 50).map(p => (
                <TouchableOpacity key={p.key} style={[styles.pickRow, permKey === p.key && styles.pickRowActive]} onPress={() => setPermKey(p.key)} testID={`adv-direct-perm-${p.key}`}>
                  <Text style={styles.pickRowText}>{p.label_ar}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.label}>السبب (اختياري)</Text>
            <TextInput style={styles.input} value={reason} onChangeText={setReason} textAlign="right" testID="adv-direct-reason-input" />
            {!!error && <Text style={styles.errorText}>{error}</Text>}
            <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving} testID="adv-direct-save-btn">
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>منح</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
  desc: { fontSize: 12, color: COLORS.textMuted, textAlign: 'right', marginBottom: 12 },
  addBtn: { flexDirection: 'row-reverse', backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, gap: 6, alignItems: 'center' },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  card: { flexDirection: 'row-reverse', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', gap: 10 },
  cardTitle: { fontSize: 13, fontWeight: 'bold', color: COLORS.text, textAlign: 'right' },
  cardMeta: { fontSize: 11, color: COLORS.textMuted, textAlign: 'right', marginTop: 2 },
  empty: { textAlign: 'center', color: COLORS.textMuted, marginTop: 20 },
  modalContainer: { flex: 1, backgroundColor: COLORS.bg },
  modalHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.text, textAlign: 'right', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, padding: 10 },
  pickRow: { backgroundColor: '#fff', borderRadius: 8, padding: 10, marginBottom: 4, borderWidth: 1, borderColor: COLORS.border },
  pickRowActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  pickRowText: { fontSize: 12, color: COLORS.text, textAlign: 'right' },
  errorText: { color: COLORS.danger, textAlign: 'right', marginTop: 8 },
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: 8, padding: 14, alignItems: 'center', marginVertical: 20 },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { advancedAccessAPI } from '../../services/api';
import { COLORS, SUB_PERMISSION_LABELS } from './shared';

export const AdvTestersManager: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const [loading, setLoading] = useState(true);
  const [testers, setTesters] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [userMap, setUserMap] = useState<{ [k: string]: string }>({});
  const [modalVisible, setModalVisible] = useState(false);
  const [userId, setUserId] = useState('');
  const [subs, setSubs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    if (!isAdmin) { setTesters([]); setLoading(false); return; }
    Promise.all([advancedAccessAPI.getTesters(), advancedAccessAPI.getLightUsers()])
      .then(([t, u]) => {
        setTesters(t.data);
        const map: { [k: string]: string } = {};
        (u.data || []).forEach((x: any) => { map[x.id] = x.full_name || x.username; });
        setUserMap(map);
      })
      .catch(() => setTesters([]))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  const openGrant = async () => {
    setError(''); setUserId(''); setSubs(['view']);
    try { const u = await advancedAccessAPI.getLightUsers(); setUsers(u.data); } catch (e) { /* admin-only, might fail for non-admin here, handled by backend 403 */ }
    setModalVisible(true);
  };

  const toggleSub = (s: string) => setSubs(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const save = async () => {
    if (!userId) { setError('اختر المستخدم'); return; }
    setSaving(true);
    try {
      await advancedAccessAPI.grantTester({ user_id: userId, sub_permissions: subs });
      setModalVisible(false);
      load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'تعذّر المنح (للأدمن فقط)');
    } finally { setSaving(false); }
  };

  const revoke = async (t: any) => {
    try { await advancedAccessAPI.revokeTester(t.user_id); load(); } catch (e) { /* ignore */ }
  };

  if (loading) return <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />;

  return (
    <View testID="adv-testers-manager">
      <View style={styles.headerRow}>
        <Text style={styles.title}>المختبرون المصرَّح لهم ({testers.filter(t => t.is_active).length})</Text>
        {isAdmin && (
          <TouchableOpacity style={styles.addBtn} onPress={openGrant} testID="adv-tester-grant-btn">
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.addBtnText}>منح وصول تجريبي</Text>
          </TouchableOpacity>
        )}
      </View>
      {!isAdmin && <Text style={styles.adminOnlyNote}>إدارة المختبرين متاحة للأدمن فقط</Text>}

      {testers.map(t => (
        <View key={t.id} style={styles.card} testID={`adv-tester-card-${t.id}`}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{userMap[t.user_id] || t.user_id}</Text>
            <Text style={styles.cardMeta}>{(t.sub_permissions || []).map((s: string) => SUB_PERMISSION_LABELS[s] || s).join('، ')}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: t.is_active ? COLORS.success : '#999' }]}>
            <Text style={styles.statusBadgeText}>{t.is_active ? 'نشط' : 'ملغى'}</Text>
          </View>
          {isAdmin && t.is_active && (
            <TouchableOpacity onPress={() => revoke(t)} testID={`adv-tester-revoke-${t.id}`}><Ionicons name="close-circle-outline" size={22} color={COLORS.danger} /></TouchableOpacity>
          )}
        </View>
      ))}
      {testers.length === 0 && <Text style={styles.empty}>لا يوجد مختبرون حاليًا</Text>}

      <Modal visible={modalVisible} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>منح وصول تجريبي</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)} testID="adv-tester-modal-close"><Ionicons name="close" size={24} color={COLORS.text} /></TouchableOpacity>
          </View>
          <ScrollView style={{ padding: 14 }}>
            <Text style={styles.label}>المستخدم</Text>
            <ScrollView style={{ maxHeight: 160 }}>
              {users.map(u => (
                <TouchableOpacity key={u.id} style={[styles.userRow, userId === u.id && styles.userRowActive]} onPress={() => setUserId(u.id)} testID={`adv-tester-user-${u.id}`}>
                  <Text style={styles.userRowText}>{u.full_name || u.username} ({u.role})</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.label}>الصلاحيات الفرعية الممنوحة</Text>
            {Object.entries(SUB_PERMISSION_LABELS).map(([k, v]) => (
              <TouchableOpacity key={k} style={styles.checkRow} onPress={() => toggleSub(k)} testID={`adv-tester-sub-${k}`}>
                <Ionicons name={subs.includes(k) ? 'checkbox' : 'square-outline'} size={18} color={COLORS.primary} />
                <Text style={styles.checkLabel}>{v}</Text>
              </TouchableOpacity>
            ))}
            {!!error && <Text style={styles.errorText}>{error}</Text>}
            <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving} testID="adv-tester-save-btn">
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>منح الوصول</Text>}
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
  adminOnlyNote: { fontSize: 12, color: COLORS.textMuted, textAlign: 'right', marginBottom: 10 },
  addBtn: { flexDirection: 'row-reverse', backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, gap: 6, alignItems: 'center' },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  card: { flexDirection: 'row-reverse', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', gap: 10 },
  cardTitle: { fontSize: 13, fontWeight: 'bold', color: COLORS.text, textAlign: 'right' },
  cardMeta: { fontSize: 11, color: COLORS.textMuted, textAlign: 'right', marginTop: 2 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  statusBadgeText: { color: '#fff', fontSize: 10 },
  empty: { textAlign: 'center', color: COLORS.textMuted, marginTop: 20 },
  modalContainer: { flex: 1, backgroundColor: COLORS.bg },
  modalHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.text, textAlign: 'right', marginBottom: 6, marginTop: 12 },
  userRow: { backgroundColor: '#fff', borderRadius: 8, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border },
  userRowActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  userRowText: { fontSize: 13, color: COLORS.text, textAlign: 'right' },
  checkRow: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 8, gap: 8 },
  checkLabel: { fontSize: 13, color: COLORS.text, textAlign: 'right' },
  errorText: { color: COLORS.danger, textAlign: 'right', marginTop: 8 },
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: 8, padding: 14, alignItems: 'center', marginVertical: 20 },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});

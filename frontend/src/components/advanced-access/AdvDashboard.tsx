import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { advancedAccessAPI } from '../../services/api';
import { COLORS } from './shared';

export const AdvDashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ groups: 0, permissions: 0, roles: 0, assignments: 0, activeAssignments: 0, testers: 0, auditLogs: 0 });
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [groups, perms, roles, assignments, testers, audit] = await Promise.all([
        advancedAccessAPI.getPermissionGroups(), advancedAccessAPI.getPermissions(),
        advancedAccessAPI.getRoles(), advancedAccessAPI.getAllAssignments(),
        advancedAccessAPI.getTesters(), advancedAccessAPI.getAuditLogs(1),
      ]);
      setStats({
        groups: groups.data.length, permissions: perms.data.length, roles: roles.data.length,
        assignments: assignments.data.length,
        activeAssignments: assignments.data.filter((a: any) => a.status === 'active').length,
        testers: testers.data.filter((t: any) => t.is_active).length,
        auditLogs: audit.data.length ? '≥1' as any : 0,
      });
    } catch (e) { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const runSeed = async () => {
    setSeeding(true);
    setSeedMsg('');
    try {
      const res = await advancedAccessAPI.seedRegistry();
      setSeedMsg(`تم تحديث السجل: ${res.data.permissions_active_total} صلاحية نشطة ضمن ${res.data.groups_total} مجموعة`);
      load();
    } catch (e: any) {
      setSeedMsg('تعذّر تحديث السجل — للأدمن فقط');
    } finally { setSeeding(false); }
  };

  if (loading) return <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />;

  const cards = [
    { label: 'مجموعات الصلاحيات', value: stats.groups, icon: 'folder-open', color: COLORS.primary },
    { label: 'الصلاحيات التفصيلية', value: stats.permissions, icon: 'list', color: COLORS.success },
    { label: 'الأدوار المتقدمة', value: stats.roles, icon: 'key', color: COLORS.shadow },
    { label: 'التكليفات (نشطة)', value: `${stats.activeAssignments}/${stats.assignments}`, icon: 'people', color: COLORS.warning },
    { label: 'المختبرون المصرَّح لهم', value: stats.testers, icon: 'flask', color: COLORS.danger },
  ];

  return (
    <View data-testid="adv-dashboard">
      <Text style={styles.sectionTitle}>لوحة معلومات مركز الصلاحيات المتقدم</Text>
      <Text style={styles.sectionDesc}>الأعداد محدَّثة مباشرة من قاعدة البيانات (SHADOW MODE — لا تؤثر على النظام الحالي)</Text>
      <View style={styles.grid}>
        {cards.map((c, i) => (
          <View key={i} style={styles.card} data-testid={`adv-dashboard-card-${c.label}`}>
            <Ionicons name={c.icon as any} size={26} color={c.color} />
            <Text style={styles.cardValue}>{c.value}</Text>
            <Text style={styles.cardLabel}>{c.label}</Text>
          </View>
        ))}
      </View>
      <TouchableOpacity style={styles.seedBtn} onPress={runSeed} disabled={seeding} data-testid="adv-seed-registry-btn">
        {seeding ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="refresh" size={16} color="#fff" />}
        <Text style={styles.seedBtnText}>إعادة فحص الكود وتحديث سجل الصلاحيات (للأدمن)</Text>
      </TouchableOpacity>
      {!!seedMsg && <Text style={styles.seedMsg}>{seedMsg}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: COLORS.text, textAlign: 'right' },
  sectionDesc: { fontSize: 12, color: COLORS.textMuted, textAlign: 'right', marginTop: 4, marginBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' },
  card: { backgroundColor: COLORS.card, borderRadius: 12, padding: 14, width: 150, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, gap: 4 },
  cardValue: { fontSize: 22, fontWeight: 'bold', color: COLORS.text },
  cardLabel: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center' },
  seedBtn: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: COLORS.primary, borderRadius: 8, padding: 12, marginTop: 20, gap: 8, alignSelf: 'flex-end' },
  seedBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  seedMsg: { textAlign: 'right', color: COLORS.success, marginTop: 8, fontSize: 12 },
});

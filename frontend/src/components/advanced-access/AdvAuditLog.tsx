import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { advancedAccessAPI } from '../../services/api';
import { COLORS } from './shared';

const ACTION_LABELS: { [k: string]: string } = {
  permission_registry_seeded: 'تحديث سجل الصلاحيات', legacy_roles_imported: 'استيراد الأدوار القديمة',
  advanced_role_created: 'إنشاء دور جديد', advanced_role_updated: 'تعديل دور',
  assignment_created: 'إنشاء تكليف', assignment_ended: 'إنهاء تكليف', context_switched: 'تبديل سياق عمل',
  tester_access_granted: 'منح وصول تجريبي', tester_access_revoked: 'سحب وصول تجريبي',
  direct_permission_granted: 'منح صلاحية مباشرة', direct_permission_revoked: 'سحب صلاحية مباشرة',
};

export const AdvAuditLog: React.FC<{ canView: boolean }> = ({ canView }) => {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<any[]>([]);

  const load = useCallback(() => {
    if (!canView) { setLoading(false); return; }
    advancedAccessAPI.getAuditLogs(100).then(res => setLogs(res.data)).finally(() => setLoading(false));
  }, [canView]);

  useEffect(() => { load(); }, [load]);

  if (!canView) return <View data-testid="adv-audit-no-access"><Text style={styles.desc}>تحتاج صلاحية "عرض سجل التدقيق" للاطّلاع على هذا القسم</Text></View>;
  if (loading) return <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />;

  return (
    <View data-testid="adv-audit-log">
      <Text style={styles.title}>سجل التدقيق ({logs.length})</Text>
      <Text style={styles.desc}>سجل مستقل لكل عملية حساسة داخل مركز الصلاحيات المتقدم</Text>
      {logs.map((l, i) => (
        <View key={l.id || i} style={styles.row} data-testid={`adv-audit-row-${i}`}>
          <Text style={styles.action}>{ACTION_LABELS[l.action] || l.action}</Text>
          <Text style={styles.meta}>بواسطة: {l.actor_username || l.actor_user_id} — {new Date(l.timestamp).toLocaleString('ar-EG')}</Text>
        </View>
      ))}
      {logs.length === 0 && <Text style={styles.empty}>لا توجد عمليات مسجّلة بعد</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, textAlign: 'right' },
  desc: { fontSize: 12, color: COLORS.textMuted, textAlign: 'right', marginTop: 4, marginBottom: 12 },
  row: { backgroundColor: '#fff', borderRadius: 8, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border },
  action: { fontSize: 13, fontWeight: '600', color: COLORS.text, textAlign: 'right' },
  meta: { fontSize: 11, color: COLORS.textMuted, textAlign: 'right', marginTop: 3 },
  empty: { textAlign: 'center', color: COLORS.textMuted, marginTop: 20 },
});

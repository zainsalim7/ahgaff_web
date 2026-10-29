import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { advancedAccessAPI } from '../../services/api';
import { COLORS } from './shared';
import { AdvRoleReviewList } from './AdvRoleReviewList';
import { AdvSensitiveReviewList } from './AdvSensitiveReviewList';

export const AdvRolePermissionReview: React.FC<{ canManage: boolean }> = ({ canManage }) => {
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [roles, setRoles] = useState<any[]>([]);
  const [subTab, setSubTab] = useState<'roles' | 'sensitive'>('roles');

  const load = useCallback(async () => {
    setLoading(true);
    const [m, s, r] = await Promise.all([
      advancedAccessAPI.getReviewMeta(),
      advancedAccessAPI.getReviewSummary(),
      advancedAccessAPI.getRoleReviews(),
    ]);
    setMeta(m.data); setSummary(s.data); setRoles(r.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading || !meta) return <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />;

  return (
    <View testID="adv-role-permission-review">
      <Text style={styles.title}>مراجعة الأدوار والصلاحيات (Phase 7-B)</Text>
      <Text style={styles.desc}>مراجعة تحليلية بحتة — لا تمنح أو تسحب أي صلاحية، ولا تعتمد أي دور تلقائيًا. النظام يبقى SHADOW MODE والقفل البرمجي (Phase 6B) لم يتغيّر.</Text>

      {summary && (
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}><Text style={styles.summaryNum}>{summary.roles_total}</Text><Text style={styles.summaryLabel}>أدوار</Text></View>
          <View style={styles.summaryCard}><Text style={styles.summaryNum}>{summary.roles_approved}</Text><Text style={styles.summaryLabel}>أدوار مُعتمَدة</Text></View>
          <View style={styles.summaryCard}><Text style={styles.summaryNum}>{summary.sensitive_total}</Text><Text style={styles.summaryLabel}>صلاحية حساسة</Text></View>
          <View style={styles.summaryCard}><Text style={styles.summaryNum}>{summary.sensitive_approved}</Text><Text style={styles.summaryLabel}>صلاحيات مُعتمَدة</Text></View>
          <View style={styles.summaryCard}><Text style={styles.summaryNum}>{summary.roles_with_excess_flags}</Text><Text style={styles.summaryLabel}>أدوار بها صلاحيات زائدة</Text></View>
          <View style={styles.summaryCard}><Text style={styles.summaryNum}>{summary.roles_with_missing_coverage}</Text><Text style={styles.summaryLabel}>أدوار بها فجوة مطابقة</Text></View>
        </View>
      )}

      <View style={styles.subTabRow}>
        <TouchableOpacity style={[styles.subTab, subTab === 'roles' && styles.subTabActive]} onPress={() => setSubTab('roles')} testID="adv-review-subtab-roles">
          <Text style={[styles.subTabText, subTab === 'roles' && styles.subTabTextActive]}>الأدوار ({summary?.roles_total})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.subTab, subTab === 'sensitive' && styles.subTabActive]} onPress={() => setSubTab('sensitive')} testID="adv-review-subtab-sensitive">
          <Text style={[styles.subTabText, subTab === 'sensitive' && styles.subTabTextActive]}>الصلاحيات الحساسة ({summary?.sensitive_total})</Text>
        </TouchableOpacity>
      </View>

      {subTab === 'roles'
        ? <AdvRoleReviewList canManage={canManage} roleCategories={meta.role_categories} scopeOptions={meta.scope_options} />
        : <AdvSensitiveReviewList canManage={canManage} permCategories={meta.permission_categories} scopeOptions={meta.scope_options} roles={roles} />}
    </View>
  );
};

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, textAlign: 'right' },
  desc: { fontSize: 12, color: COLORS.textMuted, textAlign: 'right', marginTop: 4, marginBottom: 12 },
  summaryRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  summaryCard: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', minWidth: 90 },
  summaryNum: { fontSize: 18, fontWeight: 'bold', color: COLORS.primary },
  summaryLabel: { fontSize: 10, color: COLORS.textMuted, marginTop: 2, textAlign: 'center' },
  subTabRow: { flexDirection: 'row-reverse', gap: 8, marginBottom: 12 },
  subTab: { flex: 1, borderWidth: 1, borderColor: COLORS.primary, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  subTabActive: { backgroundColor: COLORS.primary },
  subTabText: { color: COLORS.primary, fontWeight: '600', fontSize: 13 },
  subTabTextActive: { color: '#fff' },
});

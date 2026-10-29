import { goBack } from '../src/utils/navigation';
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Modal, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAdvancedAccessContextStore } from '../src/store/advancedAccessContextStore';
import { COLORS, SCOPE_TYPE_LABELS } from '../src/components/advanced-access/shared';
import { AdvDashboard } from '../src/components/advanced-access/AdvDashboard';
import { AdvPermissionsBrowser } from '../src/components/advanced-access/AdvPermissionsBrowser';
import { AdvRolesManager } from '../src/components/advanced-access/AdvRolesManager';
import { AdvAssignmentsManager } from '../src/components/advanced-access/AdvAssignmentsManager';
import { AdvScopesBrowser } from '../src/components/advanced-access/AdvScopesBrowser';
import { AdvTestersManager } from '../src/components/advanced-access/AdvTestersManager';
import { AdvDirectPermissions } from '../src/components/advanced-access/AdvDirectPermissions';
import { AdvContextPage } from '../src/components/advanced-access/AdvContextPage';
import { AdvAuditLog } from '../src/components/advanced-access/AdvAuditLog';
import { AdvSimulator } from '../src/components/advanced-access/AdvSimulator';
import { AdvCompare } from '../src/components/advanced-access/AdvCompare';
import { AdvPilotResults } from '../src/components/advanced-access/AdvPilotResults';
import { AdvRollbackControl } from '../src/components/advanced-access/AdvRollbackControl';
import { AdvRolePermissionReview } from '../src/components/advanced-access/AdvRolePermissionReview';

const TABS = [
  { key: 'dashboard', label: 'لوحة المعلومات', icon: 'speedometer' },
  { key: 'permissions', label: 'الصلاحيات التفصيلية', icon: 'list' },
  { key: 'roles', label: 'الأدوار', icon: 'key' },
  { key: 'assignments', label: 'التكليفات', icon: 'people' },
  { key: 'scopes', label: 'النطاقات', icon: 'git-network' },
  { key: 'direct', label: 'الصلاحيات المباشرة', icon: 'flash' },
  { key: 'testers', label: 'المختبرون', icon: 'flask' },
  { key: 'context', label: 'سياق العمل', icon: 'swap-horizontal' },
  { key: 'audit', label: 'سجل التدقيق', icon: 'document-text' },
  { key: 'simulator', label: 'محاكي الصلاحيات', icon: 'play-circle' },
  { key: 'compare', label: 'مقارنة النظامين', icon: 'git-compare' },
  { key: 'pilot', label: 'نتائج التجربة التشغيلية', icon: 'analytics' },
  { key: 'rollback', label: 'التحكم والتراجع', icon: 'shield-checkmark' },
  { key: 'review', label: 'مراجعة الأدوار والصلاحيات', icon: 'clipboard' },
];

export default function AdvancedAccessControlScreen() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showContextModal, setShowContextModal] = useState(false);
  const {
    hasAccess, isAdmin, subPermissions, checked, checkAccess,
    contexts, activeContext, switchContext,
  } = useAdvancedAccessContextStore();

  useEffect(() => { checkAccess(); }, [checkAccess]);

  const selectContext = async (ctx: any) => {
    await switchContext(ctx);
    setShowContextModal(false);
  };

  if (!checked) {
    return <SafeAreaView style={styles.container}><ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 60 }} /></SafeAreaView>;
  }

  if (!hasAccess) {
    return (
      <SafeAreaView style={styles.container} testID="adv-access-denied">
        <View style={styles.deniedBox}>
          <Ionicons name="lock-closed" size={48} color={COLORS.danger} />
          <Text style={styles.deniedText}>لا تملك صلاحية الوصول إلى مركز الصلاحيات المتقدم (تجريبي)</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => goBack()} testID="adv-denied-back-btn">
            <Text style={styles.backBtnText}>رجوع</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const subs = isAdmin ? ['view', 'context_switch', 'manage_roles', 'manage_assignments', 'manage_permissions', 'run_tests', 'view_audit', 'view_pilot', 'manage_rollback', 'manage_role_review'] : subPermissions;

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard': return <AdvDashboard isAdmin={isAdmin} />;
      case 'permissions': return <AdvPermissionsBrowser />;
      case 'roles': return <AdvRolesManager canManage={subs.includes('manage_roles')} />;
      case 'assignments': return <AdvAssignmentsManager canManage={subs.includes('manage_assignments')} />;
      case 'scopes': return <AdvScopesBrowser />;
      case 'direct': return <AdvDirectPermissions canManage={subs.includes('manage_permissions')} />;
      case 'testers': return <AdvTestersManager isAdmin={isAdmin} />;
      case 'context': return <AdvContextPage contexts={contexts} onRefresh={checkAccess} />;
      case 'audit': return <AdvAuditLog canView={subs.includes('view_audit')} />;
      case 'simulator': return <AdvSimulator canRun={subs.includes('run_tests')} />;
      case 'compare': return <AdvCompare canRun={subs.includes('run_tests')} />;
      case 'pilot': return <AdvPilotResults isAdmin={isAdmin} canView={isAdmin || subs.includes('view_pilot')} />;
      case 'rollback': return <AdvRollbackControl isAdmin={isAdmin} canManage={isAdmin || subs.includes('manage_rollback')} canViewAudit={isAdmin || subs.includes('view_audit')} />;
      case 'review': return <AdvRolePermissionReview canManage={isAdmin || subs.includes('manage_role_review')} />;
      default: return null;
    }
  };

  const visibleTabs = TABS.filter(t => t.key !== 'pilot' || isAdmin || subs.includes('view_pilot'));

  return (
    <SafeAreaView style={styles.container} testID="advanced-access-control-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack()} testID="adv-back-btn">
          <Ionicons name="arrow-forward" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginHorizontal: 10 }}>
          <Text style={styles.headerTitle}>مركز الصلاحيات المتقدم</Text>
          <View style={styles.shadowBadge}><Text style={styles.shadowBadgeText}>SHADOW MODE — تجريبي، لا يؤثر على النظام الحالي</Text></View>
        </View>
        <TouchableOpacity style={styles.ctxBtn} onPress={() => setShowContextModal(true)} testID="adv-context-switcher-btn">
          <Ionicons name="swap-horizontal" size={16} color="#fff" />
          <Text style={styles.ctxBtnText} numberOfLines={1}>{activeContext?.context_label_ar || 'سياق العمل'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={{ paddingHorizontal: 8 }}>
        {visibleTabs.map(t => (
          <TouchableOpacity key={t.key} style={[styles.tab, activeTab === t.key && styles.tabActive]} onPress={() => setActiveTab(t.key)} testID={`adv-tab-${t.key}`}>
            <Ionicons name={t.icon as any} size={16} color={activeTab === t.key ? '#fff' : COLORS.primary} />
            <Text style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.content} contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
        {renderTab()}
      </ScrollView>

      <Modal visible={showContextModal} transparent animationType="fade" onRequestClose={() => setShowContextModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowContextModal(false)}>
          <View style={styles.contextModalBox} testID="adv-context-switcher-modal">
            <Text style={styles.contextModalTitle}>سياق العمل الحالي</Text>
            {contexts.length === 0 && <Text style={styles.emptyText}>لا توجد تكليفات نشطة لحسابك ضمن النظام الجديد</Text>}
            {contexts.map((c: any) => (
              <TouchableOpacity key={c.id} style={styles.contextOption} onPress={() => selectContext(c)} testID={`adv-context-option-${c.id}`}>
                <Ionicons name={c.assignment_type === 'academic' ? 'school' : 'business'} size={18} color={COLORS.primary} />
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.contextOptionLabel}>{c.context_label_ar}</Text>
                  <Text style={styles.contextOptionMeta}>{SCOPE_TYPE_LABELS[c.scope?.scope_type] || c.scope?.scope_type}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: COLORS.primary, padding: 14, paddingTop: Platform.OS === 'ios' ? 8 : Platform.OS === 'web' ? 56 : 14 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: 'bold', textAlign: 'right' },
  shadowBadge: { backgroundColor: COLORS.shadow, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginTop: 4, alignSelf: 'flex-end' },
  shadowBadgeText: { color: '#fff', fontSize: 10 },
  ctxBtn: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, maxWidth: 140, gap: 4 },
  ctxBtnText: { color: '#fff', fontSize: 11, marginRight: 4 },
  tabBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.border, maxHeight: 48 },
  tab: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 6, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { backgroundColor: COLORS.primary, borderRadius: 8, marginVertical: 4 },
  tabText: { color: COLORS.primary, fontSize: 12, marginRight: 4, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  content: { flex: 1 },
  deniedBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  deniedText: { fontSize: 16, color: COLORS.danger, textAlign: 'center', fontWeight: '600' },
  backBtn: { backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10, marginTop: 8 },
  backBtnText: { color: '#fff', fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  contextModalBox: { backgroundColor: '#fff', borderRadius: 12, padding: 16, width: '85%', maxWidth: 420, maxHeight: '70%' },
  contextModalTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, marginBottom: 12, textAlign: 'right' },
  emptyText: { color: COLORS.textMuted, textAlign: 'center', padding: 12 },
  contextOption: { flexDirection: 'row-reverse', alignItems: 'center', padding: 10, borderRadius: 8, backgroundColor: COLORS.bg, marginBottom: 8 },
  contextOptionLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text, textAlign: 'right' },
  contextOptionMeta: { fontSize: 11, color: COLORS.textMuted, textAlign: 'right' },
});

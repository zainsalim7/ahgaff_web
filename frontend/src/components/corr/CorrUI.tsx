import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { goBack } from '../../utils/navigation';
import { corrAPI } from '../../services/corrAPI';
import { Portal } from '../hr/EmployeeFormModal';

export const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d7dde6', fontSize: 13, direction: 'rtl', backgroundColor: '#f7f9fc', boxSizing: 'border-box' };
export const lbl: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: '#334155', marginBottom: 4, textAlign: 'right', display: 'block' };
export const btn = (bg: string, extra: React.CSSProperties = {}): React.CSSProperties => ({ padding: '8px 14px', borderRadius: 8, border: 'none', backgroundColor: bg, color: '#fff', fontWeight: 800, fontSize: 12.5, cursor: 'pointer', ...extra });
export const card: React.CSSProperties = { backgroundColor: '#fff', borderRadius: 12, padding: 14, border: '1px solid #e6eaf0', marginBottom: 12, direction: 'rtl' };
export const th: React.CSSProperties = { padding: '9px 8px', fontSize: 12, fontWeight: 800, color: '#0f2440', backgroundColor: '#eef3f9', textAlign: 'right', whiteSpace: 'nowrap' };
export const td: React.CSSProperties = { padding: '8px', fontSize: 12.5, color: '#1e293b', borderTop: '1px solid #eef0f3', textAlign: 'right', verticalAlign: 'top' };

export const NAV = [
  { path: '/corr-dashboard', label: 'لوحة المراسلات', icon: 'speedometer' },
  { path: '/corr-list', label: 'سجل المراسلات', icon: 'documents' },
  { path: '/corr-list?mine=1', label: 'مسوداتي', icon: 'create' },
  { path: '/corr-organizations', label: 'الهيكل التنظيمي', icon: 'git-network', perm: 'organizations.manage' },
  { path: '/corr-document-types', label: 'أنواع الوثائق', icon: 'pricetags', perm: 'templates.manage' },
  { path: '/corr-numbering', label: 'مخططات الترقيم', icon: 'barcode', perm: 'numbering.manage' },
  { path: '/corr-roles', label: 'الأدوار والعضويات', icon: 'key', perm: 'memberships.manage' },
];

export type Me = { user_id: string; is_super: boolean; grants: { organization_id: string; scope_type: string; permissions: string[] }[]; can_create_in: string[] | 'ALL' };
export const useCorrMe = () => {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => { corrAPI.me().then((r) => setMe(r.data)).catch(() => setMe({ user_id: '', is_super: false, grants: [], can_create_in: [] })); }, []);
  const hasAnywhere = (perm: string) => !!me && (me.is_super || me.grants.some((g) => g.permissions.includes(perm)));
  return { me, hasAnywhere };
};

export const CorrPage: React.FC<{ title: string; subtitle?: string; children: React.ReactNode; loading?: boolean; actions?: React.ReactNode; testID?: string }> = ({ title, subtitle, children, loading, actions, testID }) => {
  const router = useRouter();
  const { me, hasAnywhere } = useCorrMe();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f1f5f9' }} testID={testID}>
      <View style={{ backgroundColor: '#0f2440', paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }}>
        <div onClick={() => goBack()} style={{ cursor: 'pointer', color: '#fff' }} data-testid="corr-back-btn"><Ionicons name="arrow-forward" size={22} color="#fff" /></div>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'right' }}>{title}</Text>
          {!!subtitle && <Text style={{ color: '#b8c7dc', fontSize: 12, textAlign: 'right' }}>{subtitle}</Text>}
        </View>
        {actions}
      </View>
      <div style={{ display: 'flex', flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, padding: '8px 16px', backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', direction: 'rtl' }} data-testid="corr-nav">
        {NAV.filter((n) => !n.perm || !me || hasAnywhere(n.perm)).map((n) => (
          <button key={n.path} onClick={() => router.push(n.path as any)} data-testid={`corr-nav-${n.path.replace('/', '').replace('?', '-').replace('=', '-')}`}
            style={{ padding: '6px 12px', borderRadius: 999, border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#0f2440' }}>
            {n.label}
          </button>
        ))}
      </div>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60, maxWidth: 1400, width: '100%', alignSelf: 'center' }}>
        {loading ? <ActivityIndicator size="large" color="#0f2440" style={{ marginTop: 40 }} /> : children}
      </ScrollView>
    </SafeAreaView>
  );
};

export const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; width?: number; testID?: string }> = ({ title, onClose, children, width = 560, testID }) => (
  <Portal>
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,36,64,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} data-testid={testID || 'corr-modal'} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 20, width, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', direction: 'rtl' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <strong style={{ fontSize: 15, color: '#0f2440' }}>{title}</strong>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer' }} data-testid="corr-modal-close">✕</button>
        </div>
        {children}
      </div>
    </div>
  </Portal>
);

export const Field: React.FC<{ label: string; children: React.ReactNode; style?: React.CSSProperties }> = ({ label, children, style }) => (
  <div style={{ marginBottom: 10, ...style }}><label style={lbl}>{label}</label>{children}</div>
);

export const Badge: React.FC<{ text: string; color: string; testID?: string }> = ({ text, color, testID }) => (
  <span data-testid={testID} style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 999, backgroundColor: color + '1a', color, fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap' }}>{text}</span>
);

export const Empty: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ ...card, textAlign: 'center', color: '#64748b', padding: 30 }}>{text}</div>
);

export const Denied: React.FC = () => <Empty text="ليس لديك صلاحية ضمن نطاقك التنظيمي للوصول إلى هذه الصفحة" />;

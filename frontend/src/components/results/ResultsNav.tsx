import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useNavigation } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';

type Href = { pathname: string; params?: Record<string, string> };
const clean = (p?: Record<string, any>) => Object.fromEntries(Object.entries(p || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''));

// يرجع للنسخة المفتوحة سابقاً من الصفحة (بحالتها وفلاترها) إن وُجدت في السجل، وإلا يفتحها
export const useResultsGo = () => {
  const nav = useNavigation<any>();
  return (to: Href, { back = false }: { back?: boolean } = {}) => {
    const st = nav?.getState?.();
    const routes: any[] = st?.routes || [];
    const idx = st?.index ?? routes.length - 1;
    const name = to.pathname.replace(/^\//, '');
    let found = -1;
    for (let i = idx - 1; i >= 0; i--) if (routes[i]?.name === name && (!back || !routes[i]?.params?.view)) { found = i; break; }
    if (found >= 0) {
      const n = idx - found;
      if (n === 1) router.back(); else router.dismiss(n);
      return;
    }
    const href = { pathname: to.pathname, params: clean(to.params) } as any;
    back ? router.replace(href) : router.push(href);
  };
};

const LINKS = [
  { path: '/student-results', label: 'النتائج', icon: 'ribbon-outline', perms: ['view_results', 'manage_results'] },
  { path: '/results-center', label: 'مركز النتائج', icon: 'school-outline', perms: ['rc_view', 'rc_enter_coursework', 'rc_enter_exams', 'rc_board_decisions', 'rc_approve', 'rc_manage_settings'] },
  { path: '/grades', label: 'الدرجات وكشوف الطلاب', icon: 'document-text-outline', perms: ['manage_grades'], hideOn: ['/results-center'] },
  { path: '/report-absence-summary', label: 'المحصلة النهائية للغياب', icon: 'grid-outline', perms: ['report_warnings', 'view_reports'], showOn: ['/results-center'] },
] as { path: string; label: string; icon: string; perms: string[]; hideOn?: string[]; showOn?: string[] }[];

export type Crumb = { label: string; onPress?: () => void };

export const ResultsNav = ({ current, crumbs = [] }: { current: '/student-results' | '/results-center' | '/grades'; crumbs?: Crumb[] }) => {
  const { hasPermission } = useAuth();
  const go = useResultsGo();
  const links = LINKS.filter((l) => !l.hideOn?.includes(current) && (!l.showOn || l.showOn.includes(current))
    && (l.path === current || l.perms.some((p) => hasPermission(p))));
  return (
    <View style={s.wrap} testID="results-nav">
      <View style={s.crumbs}>
        <TouchableOpacity onPress={() => router.replace('/')} testID="results-nav-home"><Text style={s.link}>الرئيسية</Text></TouchableOpacity>
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            <Ionicons name="chevron-back" size={12} color="#8a95a8" />
            {c.onPress ? <TouchableOpacity onPress={c.onPress} testID={`results-crumb-${i}`}><Text style={s.link}>{c.label}</Text></TouchableOpacity>
              : <Text style={s.cur} testID={`results-crumb-${i}`}>{c.label}</Text>}
          </React.Fragment>
        ))}
      </View>
      {links.length > 1 && (
        <View style={s.tabs}>
          {links.map((l) => {
            const on = l.path === current;
            return (
              <TouchableOpacity key={l.path} style={[s.tab, on && s.tabOn]} disabled={on && !crumbs.some((c) => c.onPress)}
                onPress={() => (on ? crumbs.find((c) => c.onPress)?.onPress?.() : go({ pathname: l.path }))} testID={`results-nav-${l.path.slice(1)}`}>
                <Ionicons name={l.icon as any} size={14} color={on ? '#fff' : '#1a2540'} />
                <Text style={[s.tabTxt, on && { color: '#fff' }]}>{l.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  wrap: { gap: 8, alignItems: 'flex-end' },
  crumbs: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  link: { fontSize: 13, color: '#2962ff', fontWeight: '600' },
  cur: { fontSize: 13, color: '#8a95a8', fontWeight: '500' },
  tabs: { flexDirection: 'row-reverse', gap: 4, backgroundColor: '#eef1f6', borderRadius: 10, padding: 3, flexWrap: 'wrap' },
  tab: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  tabOn: { backgroundColor: '#1a2540' },
  tabTxt: { fontSize: 12.5, fontWeight: '700', color: '#1a2540' },
});

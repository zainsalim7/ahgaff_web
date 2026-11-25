import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface Cell { status: string | null; gpa: string | null; grade: string | null; hidden?: boolean }
export interface SRow { id: string; reg_no: string; full_name: string; department_name: string; level: number; released_count: number; cur_s1: Cell | null; cur_s2: Cell | null }

const ResCell = ({ c, testID }: { c: Cell | null; testID: string }) => {
  if (!c) return <Text style={t.na} testID={testID}>لم تصدر</Text>;
  const fail = /راسب|إعادة|اعادة|دور|فصل/.test(c.status || '');
  return (
    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6, flexWrap: 'wrap' }} testID={testID}>
      {c.status ? <Text style={[t.badge, fail ? t.badgeBad : t.badgeOk]}>{c.status}</Text> : null}
      <Text style={t.val}>{[c.gpa, c.grade].filter(Boolean).join(' · ') || '—'}</Text>
      {c.hidden && <Ionicons name="eye-off" size={13} color="#ef6c00" />}
    </View>
  );
};

const COLS: [string, number][] = [['#', 0.45], ['الطالب', 2.4], ['رقم القيد', 1], ['القسم', 1.5], ['المستوى', 0.7], ['الفصل الأول (المستوى الحالي)', 1.9], ['الفصل الثاني (المستوى الحالي)', 1.9], ['الصادرة', 0.8]];

export const ResultsTable = ({ items, total, page, pages, loading, offset, onOpen, onPage }: {
  items: SRow[]; total: number; page: number; pages: number; loading: boolean; offset: number; onOpen: (id: string) => void; onPage: (p: number) => void;
}) => (
  <View style={t.card} testID="results-table">
    <View style={t.cardHead}>
      <Text style={t.cardTitle}>قائمة الطلاب</Text>
      <Text style={t.count} testID="results-total">إجمالي <Text style={{ color: '#2962ff', fontWeight: '700' }}>{total}</Text> طالب</Text>
    </View>
    <View style={t.headRow}>
      {COLS.map(([l, f]) => <Text key={l} style={[t.th, { flex: f }]} numberOfLines={1}>{l}</Text>)}
    </View>
    {loading ? <ActivityIndicator style={{ margin: 30 }} /> : items.length === 0 ? (
      <View style={{ padding: 40, alignItems: 'center' }} testID="results-empty">
        <Ionicons name="search-outline" size={34} color="#c3cad6" />
        <Text style={{ color: '#8a95a8', marginTop: 8 }}>لا يوجد طلاب بهذه الفلاتر</Text>
      </View>
    ) : items.map((s, i) => (
      <TouchableOpacity key={s.id} style={[t.row, i % 2 === 1 && { backgroundColor: '#fcfcfd' }]} onPress={() => onOpen(s.id)} testID={`results-student-${s.id}`}>
        <Text style={[t.td, t.muted, { flex: COLS[0][1] }]}>{offset + i + 1}</Text>
        <View style={{ flex: COLS[1][1], flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
          <View style={t.avatar}><Text style={t.avatarTxt}>{(s.full_name || '؟').trim().charAt(0)}</Text></View>
          <Text style={[t.td, { fontWeight: '600', flex: 1 }]} numberOfLines={1}>{s.full_name}</Text>
        </View>
        <Text style={[t.td, t.mono, { flex: COLS[2][1] }]}>{s.reg_no}</Text>
        <Text style={[t.td, t.muted, { flex: COLS[3][1] }]} numberOfLines={1}>{s.department_name}</Text>
        <Text style={[t.td, { flex: COLS[4][1] }]}>{s.level ?? '—'}</Text>
        <View style={{ flex: COLS[5][1] }}><ResCell c={s.cur_s1} testID={`row-s1-${s.id}`} /></View>
        <View style={{ flex: COLS[6][1] }}><ResCell c={s.cur_s2} testID={`row-s2-${s.id}`} /></View>
        <View style={{ flex: COLS[7][1], alignItems: 'flex-end' }}>
          <Text style={[t.pill, s.released_count ? t.pillOn : null]}>{s.released_count}</Text>
        </View>
      </TouchableOpacity>
    ))}
    {pages > 1 && (
      <View style={t.footer}>
        <TouchableOpacity disabled={page <= 1} onPress={() => onPage(page - 1)} style={t.pgBtn} testID="results-prev-page">
          <Ionicons name="chevron-forward" size={16} color={page <= 1 ? '#c3cad6' : '#2962ff'} />
        </TouchableOpacity>
        <Text style={t.count} testID="results-page">صفحة {page} من {pages}</Text>
        <TouchableOpacity disabled={page >= pages} onPress={() => onPage(page + 1)} style={t.pgBtn} testID="results-next-page">
          <Ionicons name="chevron-back" size={16} color={page >= pages ? '#c3cad6' : '#2962ff'} />
        </TouchableOpacity>
      </View>
    )}
  </View>
);

const t = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#eef1f6', overflow: 'hidden' },
  cardHead: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#eef1f6' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1a2540' },
  count: { fontSize: 12, color: '#5b6678' },
  headRow: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: '#fafbfd', borderBottomWidth: 1, borderBottomColor: '#eef1f6', minHeight: 38, paddingHorizontal: 12, gap: 8 },
  th: { fontSize: 11.5, fontWeight: '600', color: '#5b6678', textAlign: 'right' },
  row: { flexDirection: 'row-reverse', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f3f5f9', minHeight: 40, paddingHorizontal: 12, paddingVertical: 4, gap: 8 },
  td: { fontSize: 12.5, color: '#1a2540', textAlign: 'right' },
  muted: { color: '#8a95a8' },
  mono: { fontVariant: ['tabular-nums'], color: '#334155' },
  avatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#eef4ff', alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#2962ff', fontWeight: '700', fontSize: 12 },
  na: { color: '#c3cad6', fontSize: 12, textAlign: 'right' },
  badge: { fontSize: 11, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 1, borderRadius: 6, overflow: 'hidden' },
  badgeOk: { color: '#15803d', backgroundColor: '#dcfce7' },
  badgeBad: { color: '#b91c1c', backgroundColor: '#fee2e2' },
  val: { fontSize: 12, color: '#334155' },
  pill: { minWidth: 26, textAlign: 'center', fontSize: 12, fontWeight: '700', color: '#8a95a8', backgroundColor: '#f1f5f9', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  pillOn: { color: '#2962ff', backgroundColor: '#eef4ff' },
  footer: { flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center', gap: 14, padding: 12 },
  pgBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: '#e3e7ee', alignItems: 'center', justifyContent: 'center' },
});

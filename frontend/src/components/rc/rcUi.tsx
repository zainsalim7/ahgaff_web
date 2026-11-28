import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type Field = 'coursework' | 'first_exam' | 'second_exam' | 'exceptional_exam';
export type Mark = number | string | null;
export interface Dec { id: string; capped: boolean; deduct_pct?: number; reason: string; session_label: string; decided_by_name: string }
export interface RcRow {
  student_db_id: string; name: string; reg_no: string; section: string;
  coursework: Mark; first_exam: Mark; second_exam: Mark; exceptional_exam: Mark;
  att: { pct_unexcused: number; pct_excused: number; pct_total: number; status: string; status_ar: string; exceeded_unexcused: boolean; exceeded_excused: boolean; exceeded_total: boolean };
  decisions: { second_uncapped?: Dec; exceptional?: Dec };
  cw_need: number; cw_ok: boolean; att_ok: boolean; att_outcome?: 'first' | 'takmili' | 'repeat' | 'dismiss'; att_eligibility: string; eligible: boolean; eligibility: string; reasons: string[]; need_first: number | null;
  total1: number | null; pass1: boolean | null; in_second: boolean; pass2: boolean | null; final2: number | null;
  in_exc: boolean; pass3: boolean | null; final3: number | null; final: number | null; stage: string; stage_label: string; result: string; letter: string | null;
}
export interface Settings { coursework_max: number; coursework_pass_pct: number; pass_mark: number; second_cap: number; exceptional_cap: number; final_max: number; grade_scale: { min: number; label: string }[] }
export interface Sheet {
  course: { id: string; name: string; code: string; level: number; department_id: string; semester_id: string; faculty_id: string };
  settings: Settings; rows: RcRow[]; counts: Record<string, number>;
  sheet: { coursework_locked: boolean; locked_by_name: string; locked_at: string | null };
}

export const TABS = [
  { id: 'eligibility', label: 'كشف الأهلية (الحضور)', icon: 'shield-checkmark-outline' },
  { id: 'coursework', label: 'السعي والدورين', icon: 'create-outline' },
  { id: 'first', label: 'الدور الأول', icon: 'document-text-outline' },
  { id: 'second', label: 'الدور الثاني', icon: 'repeat-outline' },
  { id: 'exceptional', label: 'الاستثنائي (التصفية)', icon: 'flag-outline' },
  { id: 'final', label: 'الكشف النهائي', icon: 'ribbon-outline' },
] as const;
export type TabId = typeof TABS[number]['id'];
export const TAB_FIELD: Partial<Record<TabId, Field>> = { coursework: 'coursework', first: 'first_exam', second: 'second_exam', exceptional: 'exceptional_exam' };
export const FIELD_AR: Record<Field, string> = { coursework: 'السعي', first_exam: 'الدور الأول', second_exam: 'الدور الثاني', exceptional_exam: 'الاستثنائي' };

export const fmt = (v: Mark | undefined) => (v === null || v === undefined || v === '' ? '—' : String(v));

export const resultColor = (r: string) => (r === 'ناجح' ? '#2e7d32' : r === 'راسب' ? '#c62828' : r === 'مؤهل' ? '#2e7d32' : r === 'غير مؤهل' ? '#c62828' : '#ef6c00');

export const Badge = ({ text, color, testID }: { text: string; color: string; testID?: string }) => (
  <Text style={[rc.badge, { color, backgroundColor: `${color}18` }]} testID={testID}>{text}</Text>
);

export const confirmBox = async (msg: string) => Platform.OS === 'web' ? window.confirm(msg)
  : new Promise<boolean>((r) => Alert.alert('تأكيد', msg, [{ text: 'إلغاء', onPress: () => r(false) }, { text: 'نعم', onPress: () => r(true) }]));

export const Btn = ({ icon, label, color, onPress, testID, disabled, outline }: { icon: any; label: string; color: string; onPress: () => void; testID: string; disabled?: boolean; outline?: boolean }) => (
  <TouchableOpacity style={[rc.btn, outline ? { backgroundColor: '#fff', borderWidth: 1, borderColor: color } : { backgroundColor: color }, disabled && { opacity: 0.45 }]}
    onPress={onPress} disabled={disabled} testID={testID}>
    <Ionicons name={icon} size={15} color={outline ? color : '#fff'} />
    <Text style={[rc.btnTxt, outline && { color }]}>{label}</Text>
  </TouchableOpacity>
);

export const Msg = ({ m, testID }: { m: { ok: boolean; text: string } | null; testID: string }) => m ? (
  <View style={[rc.msg, { backgroundColor: m.ok ? '#e8f5e9' : '#ffebee' }]} testID={testID}>
    <Text style={{ color: m.ok ? '#2e7d32' : '#c62828', textAlign: 'right' }}>{m.text}</Text>
  </View>
) : null;

export const rc = StyleSheet.create({
  badge: { fontSize: 11.5, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden', alignSelf: 'flex-start' },
  btn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  btnTxt: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
  msg: { borderRadius: 10, padding: 10, marginBottom: 10 },
  th: { fontSize: 12, fontWeight: '800', color: '#5b6678', textAlign: 'right' },
  td: { fontSize: 13, color: '#1a2540', textAlign: 'right' },
  tr: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderColor: '#f0f2f7', gap: 8 },
  input: { width: 72, height: 34, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, textAlign: 'center', fontSize: 14, backgroundColor: '#fff', outlineStyle: 'none' as any },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#eef1f6', marginBottom: 14 },
});

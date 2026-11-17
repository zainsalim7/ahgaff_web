import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import api from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';

const notify = (t: string, m: string) => (Platform.OS === 'web' ? window.alert(`${t}\n\n${m}`) : Alert.alert(t, m));
const confirmAsk = (m: string) => (Platform.OS === 'web' ? Promise.resolve(window.confirm(m)) : new Promise<boolean>(res =>
  Alert.alert('تأكيد', m, [{ text: 'إلغاء', onPress: () => res(false) }, { text: 'متابعة', onPress: () => res(true) }])));

type Stat = { nationality: string; count: number; in_list: boolean };

export default function BulkNationalityScreen() {
  const [faculties, setFaculties] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [items, setItems] = useState<string[]>([]);
  const [facId, setFacId] = useState('');
  const [deptId, setDeptId] = useState('');
  const [stats, setStats] = useState<{ total: number; stats: Stat[] } | null>(null);
  const [target, setTarget] = useState('');
  const [fromNat, setFromNat] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newNat, setNewNat] = useState('');
  const { hasPermission } = useAuth();
  const canEditList = hasPermission('manage_settings');

  useEffect(() => {
    api.get('/faculties').then(r => setFaculties(r.data || [])).catch(() => {});
    api.get('/departments').then(r => setDepartments(r.data || [])).catch(() => {});
    api.get('/admin/students/nationalities').then(r => setItems(r.data.items || [])).catch(() => {});
  }, []);

  const loadStats = useCallback(async () => {
    if (!facId && !deptId) { setStats(null); return; }
    try {
      const r = await api.get('/admin/students/nationality-stats', { params: { faculty_id: facId || undefined, department_id: deptId || undefined } });
      setStats(r.data);
    } catch (e: any) { notify('خطأ', e?.response?.data?.detail || 'تعذر جلب الإحصائية'); }
  }, [facId, deptId]);

  useEffect(() => { setFromNat(null); void loadStats(); }, [loadStats]);

  const scopeName = deptId ? departments.find(d => d.id === deptId)?.name : faculties.find(f => f.id === facId)?.name;
  const affected = fromNat === null ? stats?.total || 0 : stats?.stats.find(s => s.nationality === fromNat)?.count || 0;

  const apply = async () => {
    if (!target) return notify('تنبيه', 'اختر الجنسية الجديدة من القائمة');
    const fromLbl = fromNat === null ? 'كل الطلاب' : `من جنسيتهم «${fromNat || 'فارغة'}»`;
    if (!(await confirmAsk(`تعيين الجنسية «${target}» لـ ${affected} طالب (${fromLbl}) في «${scopeName}»؟`))) return;
    setBusy(true);
    try {
      const body: any = { nationality: target, faculty_id: facId || undefined, department_id: deptId || undefined };
      if (fromNat !== null) body.from_nationality = fromNat;
      const r = await api.post('/admin/students/bulk-set-nationality', body);
      notify('تم', r.data.message);
      setFromNat(null);
      await loadStats();
    } catch (e: any) { notify('خطأ', e?.response?.data?.detail || 'فشل التعيين'); }
    finally { setBusy(false); }
  };

  const saveList = async (next: string[]) => {
    try { const r = await api.put('/admin/students/nationalities', { items: next }); setItems(r.data.items); }
    catch (e: any) { notify('خطأ', e?.response?.data?.detail || 'فشل الحفظ'); }
  };

  const deptsOfFac = departments.filter(d => !facId || d.faculty_id === facId);

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <Stack.Screen options={{ title: 'تعديل الجنسيات جماعياً' }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <View style={s.card}>
          <Text style={s.h}>١. اختر النطاق</Text>
          <Text style={s.lbl}>الكلية</Text>
          <View style={s.pick}><Picker selectedValue={facId} onValueChange={(v) => { setFacId(String(v)); setDeptId(''); }} testID="nat-faculty-picker">
            <Picker.Item label="— اختر الكلية —" value="" />
            {faculties.map(f => <Picker.Item key={f.id} label={f.name} value={f.id} />)}
          </Picker></View>
          <Text style={s.lbl}>القسم (اختياري — اتركه لتطبيق على كل الكلية)</Text>
          <View style={s.pick}><Picker selectedValue={deptId} onValueChange={(v) => setDeptId(String(v))} testID="nat-department-picker">
            <Picker.Item label="— كل الأقسام —" value="" />
            {deptsOfFac.map(d => <Picker.Item key={d.id} label={d.name} value={d.id} />)}
          </Picker></View>
        </View>

        {stats && (
          <View style={s.card} testID="nat-stats-card">
            <Text style={s.h}>٢. الجنسيات الحالية في «{scopeName}» — {stats.total} طالب</Text>
            <Text style={s.hint}>اضغط على جنسية لتعديل أصحابها فقط (مفيد لتوحيد الكتابات المختلفة)، أو «الكل» لتعديل جميع الطلاب.</Text>
            <View style={s.chips}>
              <TouchableOpacity style={[s.chip, fromNat === null && s.chipOn]} onPress={() => setFromNat(null)} testID="nat-from-all">
                <Text style={[s.chipTx, fromNat === null && s.chipTxOn]}>الكل ({stats.total})</Text>
              </TouchableOpacity>
              {stats.stats.map(st => (
                <TouchableOpacity key={st.nationality || '_empty'} style={[s.chip, !st.in_list && s.chipWarn, fromNat === st.nationality && s.chipOn]}
                  onPress={() => setFromNat(st.nationality)} testID={`nat-from-${st.nationality || 'empty'}`}>
                  {!st.in_list && <Ionicons name="warning" size={12} color={fromNat === st.nationality ? '#fff' : '#c62828'} />}
                  <Text style={[s.chipTx, fromNat === st.nationality && s.chipTxOn]}>{st.nationality || 'بدون جنسية'} ({st.count})</Text>
                </TouchableOpacity>
              ))}
            </View>
            {stats.stats.some(x => !x.in_list) && <Text style={s.hint}>⚠ الجنسيات المميّزة بالأحمر غير موجودة في القائمة المعتمدة ويُنصح بتوحيدها.</Text>}
          </View>
        )}

        {stats && (
          <View style={s.card}>
            <Text style={s.h}>٣. الجنسية الجديدة</Text>
            <View style={s.pick}><Picker selectedValue={target} onValueChange={(v) => setTarget(String(v))} testID="nat-target-picker">
              <Picker.Item label="— اختر من القائمة —" value="" />
              {items.map(n => <Picker.Item key={n} label={n} value={n} />)}
            </Picker></View>
            <TouchableOpacity style={[s.btn, (!target || busy || !affected) && { opacity: 0.5 }]} disabled={!target || busy || !affected} onPress={apply} testID="nat-apply-btn">
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTx}>تطبيق على {affected} طالب</Text>}
            </TouchableOpacity>
          </View>
        )}

        <View style={s.card} testID="nat-list-card">
          <Text style={s.h}>القائمة المعتمدة للجنسيات ({items.length})</Text>
          {canEditList && <View style={s.addRow}>
            <TextInput value={newNat} onChangeText={setNewNat} placeholder="أضف جنسية جديدة (بصيغة المذكر مثل: يمني)" style={s.input} testID="nat-new-input" />
            <TouchableOpacity style={s.addBtn} testID="nat-add-btn" onPress={() => {
              const n = newNat.trim(); if (!n) return;
              if (items.includes(n)) return notify('تنبيه', 'موجودة مسبقاً');
              void saveList([...items, n]); setNewNat('');
            }}><Ionicons name="add" size={20} color="#fff" /></TouchableOpacity>
          </View>}
          <View style={s.chips}>
            {items.map(n => (
              <View key={n} style={s.chip}>
                <Text style={s.chipTx}>{n}</Text>
                {canEditList && <TouchableOpacity onPress={async () => { if (await confirmAsk(`حذف «${n}» من القائمة؟ (لا يغيّر بيانات الطلاب)`)) void saveList(items.filter(x => x !== n)); }} testID={`nat-remove-${n}`}>
                  <Ionicons name="close-circle" size={18} color="#c62828" />
                </TouchableOpacity>}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6f9' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 8, borderWidth: 1, borderColor: '#e6eaf0' },
  h: { fontSize: 15, fontWeight: '800', color: '#1a2540', textAlign: 'right' },
  lbl: { fontSize: 12, fontWeight: '700', color: '#555', textAlign: 'right' },
  hint: { fontSize: 12, color: '#888', textAlign: 'right' },
  pick: { borderWidth: 1, borderColor: '#dde3ec', borderRadius: 8, overflow: 'hidden' },
  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: '#eef2f7', borderWidth: 1, borderColor: '#e0e6ee' },
  chipWarn: { backgroundColor: '#ffebee', borderColor: '#ef9a9a' },
  chipOn: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  chipTx: { fontSize: 12, color: '#333', fontWeight: '600' },
  chipTxOn: { color: '#fff' },
  btn: { backgroundColor: '#2e7d32', padding: 13, borderRadius: 10, alignItems: 'center', marginTop: 4 },
  btnTx: { color: '#fff', fontWeight: '800', fontSize: 14 },
  addRow: { flexDirection: 'row-reverse', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: '#dde3ec', borderRadius: 8, padding: 10, textAlign: 'right', fontSize: 13 },
  addBtn: { backgroundColor: '#1565c0', borderRadius: 8, width: 44, alignItems: 'center', justifyContent: 'center' },
});

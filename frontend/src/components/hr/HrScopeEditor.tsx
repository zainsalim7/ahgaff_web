import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';

const OPTIONS = [
  { k: 'ALL', l: 'كل الجامعة', d: 'يرى ويدير جميع الموظفين (الإدارة العليا وشؤون الموظفين المركزية)' },
  { k: 'MY_UNIT', l: 'وحدتي وما تبعها', d: 'تلقائياً من الوحدة التي يرأسها هذا المستخدم في الهيكل التنظيمي (رئيس الوحدة) أو وحدته' },
  { k: 'UNITS', l: 'وحدات محددة', d: 'اختر وحدات من الهيكل — تشمل الوحدات التابعة لها تلقائياً' },
];

export const HrScopeEditor = ({ userId }: { userId: string }) => {
  const [scope, setScope] = useState('ALL');
  const [ids, setIds] = useState<string[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [effective, setEffective] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    api.get(`/hr/users/${userId}/scope`).then((r) => { setScope(r.data.hr_scope); setIds(r.data.hr_scope_unit_ids); setEffective(r.data.effective); }).catch(() => {});
    api.get('/hr/org-units').then((r) => setUnits(r.data.units || [])).catch(() => {});
  }, [userId]);

  const save = async () => {
    setBusy(true);
    try { const r = await api.put(`/hr/users/${userId}/scope`, { hr_scope: scope, hr_scope_unit_ids: ids }); setEffective(r.data.effective); setSaved(true); setTimeout(() => setSaved(false), 2500); }
    catch (e: any) { alert(e?.response?.data?.detail || 'فشل الحفظ'); } finally { setBusy(false); }
  };
  const shown = units.filter((u) => !q || u.name.includes(q));

  return (
    <View style={st.box} testID="hr-scope-editor">
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Ionicons name="git-branch" size={18} color="#0f2440" />
        <Text style={st.title}>نطاق شؤون الموظفين</Text>
        {effective && <Text style={st.eff} testID="hr-scope-effective">الحالي: {effective.label}</Text>}
      </View>
      {OPTIONS.map((o) => (
        <TouchableOpacity key={o.k} onPress={() => setScope(o.k)} style={[st.opt, scope === o.k && st.optOn]} testID={`hr-scope-opt-${o.k}`}>
          <Ionicons name={scope === o.k ? 'radio-button-on' : 'radio-button-off'} size={18} color={scope === o.k ? '#1565c0' : '#94a3b8'} />
          <View style={{ flex: 1 }}>
            <Text style={st.optL}>{o.l}</Text>
            <Text style={st.optD}>{o.d}</Text>
          </View>
        </TouchableOpacity>
      ))}
      {scope === 'UNITS' && (
        <View style={st.units}>
          <input value={q} onChange={(e: any) => setQ(e.target.value)} placeholder="بحث في الوحدات…" style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 12.5, direction: 'rtl', boxSizing: 'border-box', marginBottom: 6, fontFamily: 'inherit' }} data-testid="hr-scope-unit-search" />
          <View style={{ maxHeight: 220, overflow: 'scroll' as any }}>
            {shown.map((u) => {
              const on = ids.includes(u.id);
              return (
                <TouchableOpacity key={u.id} onPress={() => setIds((p) => (on ? p.filter((x) => x !== u.id) : [...p, u.id]))} style={st.unitRow} testID={`hr-scope-unit-${u.id}`}>
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={18} color={on ? '#1565c0' : '#94a3b8'} />
                  <Text style={st.unitName}>{u.name}</Text>
                  <Text style={st.unitType}>{u.type_label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={st.hint}>{ids.length} وحدة مختارة (+ التابعة لها)</Text>
        </View>
      )}
      <TouchableOpacity onPress={save} disabled={busy} style={st.save} testID="hr-scope-save">
        {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.saveT}>{saved ? '✓ تم الحفظ' : 'حفظ النطاق'}</Text>}
      </TouchableOpacity>
    </View>
  );
};

const st = StyleSheet.create({
  box: { backgroundColor: '#f7f9fc', borderRadius: 12, padding: 14, marginTop: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  title: { fontSize: 15, fontWeight: '800', color: '#0f2440', textAlign: 'right' },
  eff: { marginRight: 'auto' as any, fontSize: 11.5, color: '#1565c0', fontWeight: '700' },
  opt: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 10, marginTop: 6, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  optOn: { borderColor: '#1565c0', backgroundColor: '#eef4ff' },
  optL: { fontSize: 13.5, fontWeight: '800', color: '#0f2440', textAlign: 'right' },
  optD: { fontSize: 11.5, color: '#64748b', textAlign: 'right', marginTop: 2 },
  units: { marginTop: 8, backgroundColor: '#fff', borderRadius: 10, padding: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  unitRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  unitName: { flex: 1, fontSize: 13, color: '#0f2440', textAlign: 'right' },
  unitType: { fontSize: 10.5, color: '#94a3b8' },
  hint: { fontSize: 11.5, color: '#64748b', textAlign: 'right', marginTop: 6 },
  save: { marginTop: 10, backgroundColor: '#0f2440', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  saveT: { color: '#fff', fontWeight: '800', fontSize: 13 },
});

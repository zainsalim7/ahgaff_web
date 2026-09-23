import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBack } from '../src/utils/navigation';
import { hrAPI } from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';
import { ReportHero, ReportKpis, ReportEmpty, reportPage } from '../src/components/reports/ReportShell';
import { Portal, inp, lbl, btn } from '../src/components/hr/EmployeeFormModal';

const TYPE_COLOR: Record<string, string> = { presidency: '#0f2440', faculty: '#1565c0', department: '#7c3aed', administration: '#0f766e', office: '#b45309' };
const EMPTY = { name: '', type: 'administration', parent_id: '', code: '', description: '' };

export default function HrOrgUnits() {
  const router = useRouter();
  const { hasPermission, user } = useAuth();
  const canManage = user?.role === 'admin' || hasPermission('hr_manage_org');
  const [units, setUnits] = useState<any[]>([]);
  const [types, setTypes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ open: boolean; unit: any | null; f: any }>({ open: false, unit: null, f: EMPTY });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await hrAPI.orgUnits(); setUnits(r.data.units || []); setTypes(r.data.types || {}); } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const alertMsg = (e: any) => window.alert(typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : 'حدث خطأ');
  const sync = async () => { try { const r = await hrAPI.syncOrg(); window.alert(r.data.message); load(); } catch (e) { alertMsg(e); } };
  const openForm = (unit: any | null, parentId = '') => setForm({ open: true, unit, f: unit ? { name: unit.name, type: unit.type, parent_id: unit.parent_id || '', code: unit.code || '', description: unit.description || '' } : { ...EMPTY, parent_id: parentId } });
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const payload = { ...form.f, parent_id: form.f.parent_id || null };
      if (form.unit) await hrAPI.updateUnit(form.unit.id, payload); else await hrAPI.createUnit(payload);
      setForm({ open: false, unit: null, f: EMPTY }); load();
    } catch (e: any) { setErr(typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : 'فشل الحفظ'); }
    finally { setBusy(false); }
  };
  const remove = async (u: any) => { if (!window.confirm(`حذف الوحدة «${u.name}»؟`)) return; try { await hrAPI.deleteUnit(u.id); load(); } catch (e) { alertMsg(e); } };

  const children = (pid: string | null) => units.filter((u) => (u.parent_id || null) === pid);
  const roots = units.filter((u) => !u.parent_id || !units.some((x) => x.id === u.parent_id));

  const Node = ({ u, depth }: { u: any; depth: number }) => {
    const kids = children(u.id);
    const color = TYPE_COLOR[u.type] || '#64748b';
    const academic = !!(u.faculty_id || u.department_id || u.type === 'presidency');
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', marginRight: depth * 26, borderRight: `3px solid ${color}`, backgroundColor: depth % 2 ? '#fff' : '#f7f9fc', borderRadius: 8, marginBottom: 6 }} data-testid={`org-unit-${u.id}`}>
          <span style={{ backgroundColor: color + '18', color, fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 8, whiteSpace: 'nowrap' }}>{u.type_label}</span>
          <span style={{ flex: 1, fontWeight: 700, color: '#0f2440', fontSize: 13.5, cursor: 'pointer' }} onClick={() => router.push(`/hr-employees?unit=${u.id}`)}>{u.name}{u.code ? <span style={{ color: '#94a3b8', fontWeight: 500, fontSize: 11 }}> · {u.code}</span> : null}</span>
          <span style={{ fontSize: 11.5, color: '#64748b', whiteSpace: 'nowrap' }}>👥 {u.employees_count}</span>
          {canManage && (
            <span style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => openForm(null, u.id)} title="إضافة وحدة فرعية" style={btn('#e3f2fd', '#1565c0', { padding: '3px 8px', fontSize: 11 })} data-testid={`org-add-child-${u.id}`}>+ فرعية</button>
              {!academic && <button onClick={() => openForm(u)} style={btn('#f1f5f9', '#0f2440', { padding: '3px 8px', fontSize: 11 })} data-testid={`org-edit-${u.id}`}>تعديل</button>}
              {!academic && <button onClick={() => remove(u)} style={btn('#ffebee', '#c62828', { padding: '3px 8px', fontSize: 11 })} data-testid={`org-delete-${u.id}`}>حذف</button>}
            </span>
          )}
        </div>
        {kids.map((k) => <Node key={k.id} u={k} depth={depth + 1} />)}
      </div>
    );
  };

  const byType = (t: string) => units.filter((u) => u.type === t).length;
  return (
    <SafeAreaView style={reportPage.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={reportPage.content}>
        <ReportHero kicker="شؤون الموظفين" title="الهيكل التنظيمي" subtitle="رئاسة الجامعة ← الكليات والإدارات ← الأقسام والمكاتب. الوحدات الأكاديمية تُزامَن تلقائياً من الكليات والأقسام" onBack={() => goBack()} canExport={false} testID="hr-org-hero" />
        {canManage && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, direction: 'rtl' }}>
            <button onClick={sync} style={btn('#1565c0')} data-testid="org-sync-btn">🔄 مزامنة الكليات والأقسام</button>
            <button onClick={() => openForm(null, units.find((u) => u.type === 'presidency')?.id || '')} style={btn('#0f766e')} data-testid="org-add-btn">+ إضافة إدارة / وحدة</button>
          </div>
        )}
        <ReportKpis items={[
          { label: 'كليات', value: byType('faculty'), color: '#1565c0', icon: 'school' },
          { label: 'أقسام أكاديمية', value: byType('department'), color: '#7c3aed', icon: 'library' },
          { label: 'إدارات', value: byType('administration'), color: '#0f766e', icon: 'business' },
          { label: 'مكاتب / وحدات', value: byType('office'), color: '#b45309', icon: 'folder' },
        ]} />
        <View style={reportPage.card}>
          {loading ? <Text style={{ textAlign: 'center', color: '#94a3b8' }}>جاري التحميل...</Text>
            : units.length === 0 ? <ReportEmpty text="لا يوجد هيكل بعد — اضغط «مزامنة الكليات والأقسام» لتوليده تلقائياً" icon="git-network-outline" />
            : <div style={{ direction: 'rtl' }} data-testid="org-tree">{roots.map((r) => <Node key={r.id} u={r} depth={0} />)}</div>}
        </View>
      </ScrollView>

      {form.open && (<Portal>
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl' }} onClick={() => !busy && setForm({ open: false, unit: null, f: EMPTY })}>
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 22, width: 460, maxWidth: '95%' }} data-testid="org-unit-form">
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0f2440', marginBottom: 12 }}>{form.unit ? 'تعديل الوحدة' : 'إضافة وحدة تنظيمية'}</div>
            <div style={lbl}>اسم الوحدة *</div>
            <input value={form.f.name} onChange={(e) => setForm((p) => ({ ...p, f: { ...p.f, name: e.target.value } }))} style={{ ...inp, marginBottom: 10 }} data-testid="org-form-name" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><div style={lbl}>النوع</div><select value={form.f.type} onChange={(e) => setForm((p) => ({ ...p, f: { ...p.f, type: e.target.value } }))} style={inp} data-testid="org-form-type">{Object.entries(types).filter(([k]) => !['presidency', 'faculty', 'department'].includes(k)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div><div style={lbl}>الرمز</div><input value={form.f.code} onChange={(e) => setForm((p) => ({ ...p, f: { ...p.f, code: e.target.value } }))} style={inp} data-testid="org-form-code" /></div>
            </div>
            <div style={{ ...lbl, marginTop: 10 }}>تتبع لـ (الوحدة الأم)</div>
            <select value={form.f.parent_id} onChange={(e) => setForm((p) => ({ ...p, f: { ...p.f, parent_id: e.target.value } }))} style={{ ...inp, marginBottom: 10 }} data-testid="org-form-parent"><option value="">— جذر (بلا أم) —</option>{units.filter((u) => u.id !== form.unit?.id).map((u) => <option key={u.id} value={u.id}>{u.type_label} · {u.name}</option>)}</select>
            <div style={lbl}>وصف</div>
            <textarea value={form.f.description} onChange={(e) => setForm((p) => ({ ...p, f: { ...p.f, description: e.target.value } }))} rows={2} style={{ ...inp, resize: 'vertical' }} data-testid="org-form-desc" />
            {err && <div style={{ backgroundColor: '#ffebee', color: '#c62828', padding: '8px 10px', borderRadius: 8, fontSize: 12.5, marginTop: 10 }} data-testid="org-form-error">{err}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={save} disabled={busy || !form.f.name.trim()} style={btn('#1565c0', '#fff', { flex: 1 })} data-testid="org-form-save">{busy ? '...' : 'حفظ'}</button>
              <button onClick={() => setForm({ open: false, unit: null, f: EMPTY })} style={btn('#fff', '#555', { border: '1px solid #ddd' })} data-testid="org-form-cancel">إلغاء</button>
            </div>
          </div>
        </div>
      </Portal>)}
    </SafeAreaView>
  );
}

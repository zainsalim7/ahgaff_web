import React, { useEffect, useState, useCallback } from 'react';
import { View } from 'react-native';
import api from '../../services/api';
import { HrSelect } from '../hr/HrSelect';
import { Badge, td, table, btn, alertErr } from '../hr/ui';
import { reportPage } from '../reports/ReportShell';
import { filenameFromResponse } from '../../utils/exportName';

const STATUS_COLOR: Record<string, string> = { adopt: '#16a34a', reserved: '#dc2626', prefix_mismatch: '#d97706', not_ref_format: '#64748b', same: '#1565c0', no_student_id: '#b91c1c' };

/** 🔁 مطابقة الرقم المرجعي المُولَّد برقم القيد المُدخل — معاينة / تقرير Excel / اعتماد */
export const ReferenceReconcile: React.FC = () => {
  const [faculties, setFaculties] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [f, setF] = useState({ faculty_id: '', department_id: '', level: '1', include_prefix_mismatch: false });
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [onlyStatus, setOnlyStatus] = useState('');
  useEffect(() => { (async () => { try { const [fa, de] = await Promise.all([api.get('/faculties'), api.get('/departments')]); setFaculties(fa.data || []); setDepartments(de.data || []); } catch { /* ignore */ } })(); }, []);
  const params = () => ({ faculty_id: f.faculty_id || undefined, department_id: f.department_id || undefined, level: f.level === '' ? undefined : Number(f.level), include_prefix_mismatch: f.include_prefix_mismatch });
  const preview = useCallback(async () => {
    if (!f.faculty_id && !f.department_id && f.level === '') { window.alert('اختر الكلية أو القسم أو المستوى على الأقل'); return; }
    setBusy(true); setOnlyStatus('');
    try { setD((await api.get('/admin/student-references/reconcile/preview', { params: params() })).data); } catch (e) { alertErr(e); } finally { setBusy(false); }
  }, [f]);
  const exportXlsx = async () => {
    setBusy(true);
    try { const res = await api.get('/admin/student-references/reconcile/export', { params: params(), responseType: 'blob' }); const url = URL.createObjectURL(res.data); const a = document.createElement('a'); a.href = url; a.download = filenameFromResponse(res, 'تقرير مطابقة الأرقام المرجعية.xlsx'); a.click(); URL.revokeObjectURL(url); } catch (e) { alertErr(e); } finally { setBusy(false); }
  };
  const execute = async () => {
    if (!d?.summary?.will_apply) { window.alert('لا يوجد ما يُعتمد — نفّذ المعاينة أولاً'); return; }
    if (!window.confirm(`سيُعتمد رقم القيد المُدخل كرقم مرجعي لـ ${d.summary.will_apply} طالب (يُحفظ الرقم القديم في السجل).\n${d.summary.reserved ? `${d.summary.reserved} طالب رقمهم محجوز لآخرين لن يتغيروا.\n` : ''}هل تريد المتابعة؟`)) return;
    setBusy(true);
    try { const res = await api.post('/admin/student-references/reconcile/execute', params()); window.alert(res.data.message); setD(res.data); } catch (e) { alertErr(e); } finally { setBusy(false); }
  };
  const s = d?.summary;
  const rows: any[] = (d?.rows || []).filter((r: any) => !onlyStatus || r.status === onlyStatus);
  const depts = departments.filter((x) => !f.faculty_id || x.faculty_id === f.faculty_id);
  const kpis: [string, string][] = [['adopt', 'سيُعتمد المُدخل'], ['reserved', 'محجوز لآخر'], ['prefix_mismatch', 'صيغة مختلفة'], ['not_ref_format', 'رقم عادي'], ['same', 'متطابق أصلاً']];
  return (
    <View style={[reportPage.card, { marginBottom: 12 }]} testID="ref-reconcile">
      <div style={{ direction: 'rtl' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#0f2440' }}>🔁 اعتماد الرقم المُدخل بدل المُولَّد</div>
        <div style={{ fontSize: 12, color: '#64748b', margin: '4px 0 10px', lineHeight: 1.8 }}>يقارن رقم القيد الذي أدخلتموه بالرقم المرجعي الذي ولّده النظام. إن كان المُدخل بصيغة مرجعية صحيحة (مثل AUB2501007) وغير محجوز لطالب آخر → يُعتمد كرقم مرجعي. المحجوز يبقى على الرقم المُولَّد ويُذكر في التقرير مع صاحب الحجز.</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <HrSelect value={f.faculty_id} onChange={(v) => setF({ ...f, faculty_id: v, department_id: '' })} options={faculties.map((x) => ({ value: x.id, label: x.name }))} placeholder="الكلية" style={{ minWidth: 220 }} testID="ref-rec-faculty" />
          <HrSelect value={f.department_id} onChange={(v) => setF({ ...f, department_id: v })} options={depts.map((x) => ({ value: x.id, label: x.name }))} placeholder="القسم (اختياري)" style={{ minWidth: 200 }} testID="ref-rec-dept" />
          <HrSelect value={f.level} onChange={(v) => setF({ ...f, level: v })} options={[1, 2, 3, 4, 5, 6].map((l) => ({ value: String(l), label: `المستوى ${l}` }))} placeholder="كل المستويات" searchable={false} style={{ width: 150 }} testID="ref-rec-level" />
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#92400e', cursor: 'pointer' }}><input type="checkbox" checked={f.include_prefix_mismatch} onChange={(e) => setF({ ...f, include_prefix_mismatch: e.target.checked })} data-testid="ref-rec-include-mismatch" /> اعتماد الأرقام المرجعية الصيغة حتى لو اختلفت السنة/الكلية عن المتوقع</label>
          <button onClick={preview} disabled={busy} style={btn('#1565c0')} data-testid="ref-rec-preview">🔍 معاينة المقارنة</button>
          <button onClick={exportXlsx} disabled={busy} style={btn('#1b5e20')} data-testid="ref-rec-export">📥 تقرير Excel</button>
          {s ? <button onClick={execute} disabled={busy || !s.will_apply} style={btn(s.will_apply ? '#16a34a' : '#cbd5e1', '#fff', { fontWeight: 800 })} data-testid="ref-rec-execute">✅ اعتماد المُدخل ({s.will_apply})</button> : null}
        </div>
        {s && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }} data-testid="ref-rec-summary">
            <button onClick={() => setOnlyStatus('')} style={btn(!onlyStatus ? '#0f2440' : '#f1f5f9', !onlyStatus ? '#fff' : '#475569', { fontSize: 12 })}>الكل: {s.total}</button>
            {kpis.map(([k, l]) => <button key={k} onClick={() => setOnlyStatus(onlyStatus === k ? '' : k)} style={btn(onlyStatus === k ? STATUS_COLOR[k] : '#f1f5f9', onlyStatus === k ? '#fff' : STATUS_COLOR[k], { fontSize: 12, fontWeight: 800 })} data-testid={`ref-rec-kpi-${k}`}>{l}: {s[k] || 0}</button>)}
            {d.applied !== undefined && <Badge color="#16a34a" testID="ref-rec-applied">تم الاعتماد: {d.applied}</Badge>}
          </div>
        )}
        {d && rows.length === 0 && <div style={{ color: '#94a3b8', fontSize: 12.5, textAlign: 'center', padding: 12 }} data-testid="ref-rec-empty">لا توجد سجلات</div>}
        {rows.length > 0 && (
          <div style={{ overflowX: 'auto', marginTop: 10, maxHeight: 520, overflowY: 'auto' }}>
            <table style={table} data-testid="ref-rec-table">
              <thead><tr style={{ backgroundColor: '#f8fafc', position: 'sticky', top: 0 }}>{['#', 'رقم القيد (المُدخل)', 'الاسم', 'القسم', 'م', 'المرجعي الحالي (المُولَّد)', 'بعد الاعتماد', 'الحالة', 'التفاصيل'].map((h) => <th key={h} style={{ ...td, fontSize: 11.5, color: '#64748b', fontWeight: 800 }}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #eef2f7', backgroundColor: r.applied ? '#f0fdf4' : undefined }} data-testid={`ref-rec-row-${r.id}`}>
                    <td style={{ ...td, color: '#94a3b8', fontSize: 11 }}>{i + 1}</td>
                    <td style={td}><code style={{ fontSize: 12, fontWeight: 800, direction: 'ltr', display: 'inline-block' }}>{r.student_id}</code></td>
                    <td style={{ ...td, fontWeight: 700, color: '#0f2440' }}>{r.full_name}</td>
                    <td style={{ ...td, fontSize: 12 }}>{r.department_name}</td>
                    <td style={{ ...td, fontSize: 12 }}>{r.level ?? ''}</td>
                    <td style={td}><code style={{ fontSize: 12, direction: 'ltr', display: 'inline-block', color: '#64748b' }}>{r.current_ref || '—'}</code></td>
                    <td style={td}><code style={{ fontSize: 12, direction: 'ltr', display: 'inline-block', color: r.will_apply ? '#16a34a' : '#64748b', fontWeight: r.will_apply ? 800 : 400 }}>{r.will_apply ? r.new_ref : (r.current_ref || '—')}</code></td>
                    <td style={td}><Badge color={STATUS_COLOR[r.status]}>{r.status_label}</Badge></td>
                    <td style={{ ...td, fontSize: 11.5, color: r.status === 'reserved' ? '#b91c1c' : '#475569', maxWidth: 320 }}>{r.detail}</td>
                  </tr>))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </View>
  );
};

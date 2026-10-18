import React, { useEffect, useState, useCallback } from 'react';
import { ScrollView, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { goBack } from '../src/utils/navigation';
import api, { hrAPI } from '../src/services/api';
import { ReportHero, reportPage } from '../src/components/reports/ReportShell';
import { HrSelect } from '../src/components/hr/HrSelect';
import { Tabs, Badge, td, table, btn, alertErr } from '../src/components/hr/ui';
import { filenameFromResponse, downloadBlob } from '../src/utils/exportName';

const STATUS_COLOR: Record<string, string> = { default: '#16a34a', changed: '#d97706', no_account: '#64748b', disabled: '#dc2626' };
const STATUS_SHORT: Record<string, string> = { default: 'افتراضية سارية', changed: 'غُيّرت', no_account: 'لا حساب', disabled: 'موقوف' };
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** 🔑 بيانات الدخول الافتراضية — أدمن فقط */
export default function DefaultCredentials() {
  const [kind, setKind] = useState('students');
  const [faculties, setFaculties] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [f, setF] = useState({ faculty_id: '', department_id: '', level: '', org_unit_id: '', include_ended: false });
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [onlyStatus, setOnlyStatus] = useState('');
  useEffect(() => {
    (async () => {
      try {
        const [fa, de, ou] = await Promise.all([api.get('/faculties'), api.get('/departments'), hrAPI.orgUnits().catch(() => ({ data: { units: [] } }))]);
        setFaculties(fa.data || []); setDepartments(de.data || []); setUnits(ou.data?.units || ou.data || []);
      } catch { /* ignore */ }
    })();
  }, []);
  useEffect(() => { setD(null); setOnlyStatus(''); }, [kind]);
  const params = () => ({
    kind,
    faculty_id: kind !== 'employees' && f.faculty_id ? f.faculty_id : undefined,
    department_id: kind !== 'employees' && f.department_id ? f.department_id : undefined,
    level: kind === 'students' && f.level !== '' ? Number(f.level) : undefined,
    org_unit_id: kind === 'employees' && f.org_unit_id ? f.org_unit_id : undefined,
    include_ended: kind === 'employees' ? f.include_ended : undefined,
  });
  const preview = useCallback(async () => {
    setBusy(true); setOnlyStatus('');
    try { setD((await api.get('/admin/default-credentials/preview', { params: params() })).data); } catch (e) { alertErr(e); } finally { setBusy(false); }
  }, [kind, f]);
  const exportXlsx = async () => {
    setBusy(true);
    try {
      const res = await api.get('/admin/default-credentials/export', { params: { ...params(), status: onlyStatus || undefined }, responseType: 'blob' });
      downloadBlob(res.data, filenameFromResponse(res, 'بيانات الدخول الافتراضية.xlsx'), XLSX);
    } catch (e) { alertErr(e); } finally { setBusy(false); }
  };
  const s = d?.summary;
  const rows: any[] = (d?.rows || []).filter((r: any) => !onlyStatus || r.status === onlyStatus);
  const depts = departments.filter((x) => !f.faculty_id || x.faculty_id === f.faculty_id);
  const kpis: [string, string][] = [['default', 'كلمة المرور الافتراضية سارية'], ['changed', 'غيّروا كلمة المرور'], ['no_account', 'بلا حساب مفعّل'], ['disabled', 'حساب موقوف']];
  const numLabel = kind === 'students' ? 'رقم القيد' : 'الرقم الوظيفي';
  return (
    <SafeAreaView style={reportPage.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={reportPage.content}>
        <ReportHero kicker="إدارة النظام" title="بيانات الدخول الافتراضية" subtitle="اسم المستخدم وكلمة المرور الأولية للطلاب والمعلمين والموظفين حسب الكلية/القسم/المستوى أو الوحدة الإدارية — تصدير Excel" onBack={() => goBack()} canExport={false} testID="defcreds-hero" />
        <View style={[reportPage.card, { marginBottom: 12 }]} testID="defcreds-filters">
          <div style={{ direction: 'rtl' }}>
            <Tabs tabs={[{ key: 'students', label: '🎓 الطلاب' }, { key: 'teachers', label: '👨‍🏫 المعلمون' }, { key: 'employees', label: '🧑‍💼 الموظفون' }]} value={kind} onChange={setKind} testID="defcreds-tabs" />
            <div style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 10px', margin: '10px 0', lineHeight: 1.8 }} data-testid="defcreds-note">
              ⚠️ كلمات المرور مشفّرة في النظام ولا يمكن استرجاع ما غيّره المستخدم بنفسه. تُعرض كلمة المرور الافتراضية ({kind === 'students' ? 'رقم القيد' : 'الرقم الوظيفي'}) فقط لمن لم يغيّرها بعد، ولمن لا حساب له تُعرض القيم المتوقعة عند التفعيل. الملف سرّي.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {kind !== 'employees' && <>
                <HrSelect value={f.faculty_id} onChange={(v) => setF({ ...f, faculty_id: v, department_id: '' })} options={faculties.map((x) => ({ value: x.id, label: x.name }))} placeholder="كل الكليات" style={{ minWidth: 220 }} testID="defcreds-faculty" />
                <HrSelect value={f.department_id} onChange={(v) => setF({ ...f, department_id: v })} options={depts.map((x) => ({ value: x.id, label: x.name }))} placeholder="كل الأقسام" style={{ minWidth: 200 }} testID="defcreds-dept" />
              </>}
              {kind === 'students' && <HrSelect value={f.level} onChange={(v) => setF({ ...f, level: v })} options={[1, 2, 3, 4, 5, 6].map((l) => ({ value: String(l), label: `المستوى ${l}` }))} placeholder="كل المستويات" searchable={false} style={{ width: 150 }} testID="defcreds-level" />}
              {kind === 'employees' && <>
                <HrSelect value={f.org_unit_id} onChange={(v) => setF({ ...f, org_unit_id: v })} options={units.map((x: any) => ({ value: x.id, label: x.name }))} placeholder="كل الوحدات الإدارية" style={{ minWidth: 240 }} testID="defcreds-unit" />
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, cursor: 'pointer' }}><input type="checkbox" checked={f.include_ended} onChange={(e) => setF({ ...f, include_ended: e.target.checked })} data-testid="defcreds-include-ended" /> تضمين المنتهية خدمتهم</label>
              </>}
              <button onClick={preview} disabled={busy} style={btn('#1565c0')} data-testid="defcreds-preview">🔍 معاينة</button>
              <button onClick={exportXlsx} disabled={busy} style={btn('#1b5e20')} data-testid="defcreds-export">📥 تصدير Excel{onlyStatus ? ` (${STATUS_SHORT[onlyStatus]})` : ''}</button>
            </div>
            {s && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }} data-testid="defcreds-summary">
                <div onClick={() => setOnlyStatus('')} style={{ cursor: 'pointer', padding: '8px 14px', borderRadius: 10, background: !onlyStatus ? '#0f2440' : '#f1f5f9', color: !onlyStatus ? '#fff' : '#0f2440', fontWeight: 800 }} data-testid="defcreds-kpi-total">الإجمالي: {s.total}</div>
                {kpis.map(([k, label]) => (
                  <div key={k} onClick={() => setOnlyStatus(onlyStatus === k ? '' : k)} style={{ cursor: 'pointer', padding: '8px 14px', borderRadius: 10, border: `2px solid ${STATUS_COLOR[k]}`, background: onlyStatus === k ? STATUS_COLOR[k] : '#fff', color: onlyStatus === k ? '#fff' : STATUS_COLOR[k], fontWeight: 700, fontSize: 13 }} data-testid={`defcreds-kpi-${k}`}>{label}: {s[k]}</div>
                ))}
              </div>
            )}
          </div>
        </View>
        {d && (
          <View style={reportPage.card} testID="defcreds-table-card">
            <div style={{ direction: 'rtl', overflowX: 'auto' }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>{rows.length} سجل{rows.length > 400 ? ' — تُعرض أول 400 (الملف يحوي الكل)' : ''}</div>
              <table style={table} data-testid="defcreds-table">
                <thead><tr style={{ background: '#f8fafc' }}>
                  {['#', numLabel, 'الاسم', kind === 'employees' ? 'الوحدة الإدارية' : 'الكلية', kind === 'employees' ? 'المسمى' : 'القسم', ...(kind === 'students' ? ['المستوى/الشعبة'] : []), 'اسم المستخدم', 'كلمة المرور الافتراضية', 'الحالة'].map((h) => <th key={h} style={{ ...td, fontWeight: 800, color: '#0f2440', borderBottom: '2px solid #e2e8f0' }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {rows.slice(0, 400).map((r, i) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }} data-testid={`defcreds-row-${r.id}`}>
                      <td style={td}>{i + 1}</td>
                      <td style={{ ...td, direction: 'ltr', textAlign: 'right' }}>{r.number}{r.reference_number ? <div style={{ fontSize: 10, color: '#94a3b8' }}>{r.reference_number}</div> : null}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{r.name}{r.record_active === false ? <span style={{ fontSize: 10, color: '#dc2626', marginRight: 6 }}>(غير نشط)</span> : null}</td>
                      <td style={td}>{kind === 'employees' ? r.org_unit : r.faculty}</td>
                      <td style={td}>{kind === 'employees' ? r.job_title : r.department}</td>
                      {kind === 'students' && <td style={td}>{r.level ?? '—'}{r.section ? ` / ${r.section}` : ''}</td>}
                      <td style={{ ...td, direction: 'ltr', textAlign: 'right', fontFamily: 'monospace' }}>{r.username}</td>
                      <td style={{ ...td, direction: 'ltr', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: r.password ? '#1b5e20' : '#94a3b8' }}>{r.password || '—'}</td>
                      <td style={td}><Badge color={STATUS_COLOR[r.status]}>{STATUS_SHORT[r.status]}</Badge></td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: '#94a3b8', padding: 24 }}>لا توجد سجلات ضمن هذا الفلتر</td></tr>}
                </tbody>
              </table>
            </div>
          </View>
        )}
        {!d && <Text style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>اختر الفلاتر ثم اضغط «معاينة» أو «تصدير Excel» مباشرة</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import api from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';
import { CorrPage, Badge, Empty, Modal, btn, card, inp, td, th } from '../src/components/corr/CorrUI';
import { Bar, C_COLOR, errOf, flowOf, money, sColor, vp } from '../src/components/vp/vpUi';
import { ContractForm } from '../src/components/vp/ContractForm';
import { ContractDetail } from '../src/components/vp/ContractDetail';
import { SessionForm } from '../src/components/vp/SessionForm';
import { SessionDetail } from '../src/components/vp/SessionDetail';
import { VpSettings } from '../src/components/vp/VpSettings';

const Kpi = ({ l, v, c, on, active, testID }: any) => (
  <div onClick={on} style={{ ...card, flex: 1, minWidth: 130, marginBottom: 0, cursor: on ? 'pointer' : 'default', textAlign: 'center', borderWidth: 2, borderColor: active ? c : '#e6eaf0' }} data-testid={testID}>
    <div style={{ fontSize: 12, color: '#64748b' }}>{l}</div><div style={{ fontSize: 22, fontWeight: 900, color: c }}>{v}</div>
  </div>
);

const ContractsTab = ({ settings, canManage, openSession }: any) => {
  const [f, setF] = useState({ status: '', q: '' }); const [data, setData] = useState<any>({ items: [], kpis: {} });
  const [edit, setEdit] = useState<any>(null); const [open, setOpen] = useState(''); const [err, setErr] = useState('');
  const load = useCallback(() => api.get(vp('/contracts'), { params: f }).then((r) => { setData(r.data); setErr(''); }).catch((e) => setErr(errOf(e))), [f]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const k = data.kpis;
  return (
    <div data-testid="vp-contracts-tab">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Kpi l="عقود سارية" v={k.active || 0} c="#16a34a" testID="vp-kpi-active" /><Kpi l="متأخرة عن المهلة" v={k.late || 0} c="#b91c1c" testID="vp-kpi-late" />
        <Kpi l="تسجيلات متوقفة" v={k.stalled || 0} c="#d97706" testID="vp-kpi-stalled" /><Kpi l="المستحق" v={money(k.accrued)} c="#0f2440" testID="vp-kpi-accrued" /><Kpi l="المصروف" v={money(k.paid)} c="#2563eb" testID="vp-kpi-paid" />
      </div>
      <div style={card}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <input style={{ ...inp, width: 260 }} placeholder="بحث بالمعلم / المقرر / رقم العقد" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} data-testid="vp-c-search" />
          <select style={{ ...inp, width: 170 }} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} data-testid="vp-c-status"><option value="">كل الحالات</option><option value="draft">مسودة</option><option value="issued">معتمد / ساري</option><option value="completed">منتهٍ</option><option value="terminated">ملغى</option></select>
          <span style={{ flex: 1 }} />
          {canManage && <button onClick={() => setEdit({})} style={btn('#16a34a')} data-testid="vp-c-new">+ عقد جديد</button>}
        </div>
        {!!err && <div style={{ color: '#b91c1c' }} data-testid="vp-c-error">{err}</div>}
        {data.items.length === 0 ? <Empty text="لا توجد عقود" /> : (
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['رقم العقد', 'المعلم', 'المقرر / القسم', 'المهلة', 'الإنجاز', 'المستحق / المصروف', 'الحالة'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{data.items.map((c: any) => { const p = c.progress; const late = c.status === 'issued' && p.days_left < 0; return (
              <tr key={c.id} onClick={() => setOpen(c.id)} style={{ cursor: 'pointer' }} data-testid={`vp-c-row-${c.id}`}>
                <td style={{ ...td, fontWeight: 800 }}>{c.ref_no}</td><td style={td}>{c.teacher_name}</td>
                <td style={td}>{c.course_name}<div style={{ fontSize: 10.5, color: '#64748b' }}>{c.department_name}</div></td>
                <td style={td}>{c.end_date}<div style={{ fontSize: 10.5, color: late ? '#b91c1c' : '#64748b', fontWeight: late ? 800 : 400 }}>{p.days_left == null ? '' : late ? `متأخر ${-p.days_left} يوم` : `متبقٍ ${p.days_left} يوم`}</div></td>
                <td style={{ ...td, minWidth: 150 }}><Bar pct={p.percent} color={late ? '#b91c1c' : '#16a34a'} /><div style={{ marginTop: 3 }}><Bar pct={p.production_percent} color="#7c3aed" /></div><div style={{ fontSize: 10.5, color: '#64748b', marginTop: 3 }}>{p.lectures_completed}/{p.lectures_required} محاضرة · إنتاج {p.production_percent}% · {p.items_accepted} بند مقبول{p.stalled ? ` · ⛔ ${p.stalled}` : ''}</div></td>
                <td style={td}>{money(p.accrued)}<div style={{ fontSize: 10.5, color: '#16a34a' }}>صُرف {money(p.paid)}</div></td>
                <td style={td}><Badge text={c.status_ar} color={C_COLOR[c.status]} /></td>
              </tr>); })}</tbody>
          </table></div>)}
      </div>
      {edit && <Modal title={edit.id ? `تعديل العقد ${edit.ref_no}` : 'عقد إنتاج مرئي جديد'} onClose={() => setEdit(null)} width={900} testID="vp-c-form-modal" closeOnOverlay={false}>
        <ContractForm initial={edit.id ? edit : undefined} settings={settings} onDone={() => { setEdit(null); load(); }} /></Modal>}
      {open && !edit && <Modal title="تفاصيل العقد ومتابعة التنفيذ" onClose={() => setOpen('')} width={980} testID="vp-c-detail-modal">
        <ContractDetail id={open} settings={settings} onEdit={(c) => setEdit(c)} onChanged={load} onOpenSession={openSession} /></Modal>}
    </div>
  );
};

const StudioTab = ({ settings, canStudio, openSession, reloadKey }: any) => {
  const [f, setF] = useState({ status: '', studio_id: '', date_from: '', date_to: '', q: '' }); const [data, setData] = useState<any>({ items: [], counts: {} });
  const [form, setForm] = useState(false); const [err, setErr] = useState('');
  const load = useCallback(() => api.get(vp('/sessions'), { params: f }).then((r) => { setData(r.data); setErr(''); }).catch((e) => setErr(errOf(e))), [f]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load, reloadKey]);
  const sName = (id: string) => (settings?.studios || []).find((s: any) => s.id === id)?.name || '—';
  const c = data.counts;
  return (
    <div data-testid="vp-studio-tab">
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {[...flowOf(settings), ['stalled', 'متوقف']].map(([k, l]) => <Kpi key={k} l={l} v={c[k] || 0} c={sColor(settings, k)} active={f.status === k} on={() => setF({ ...f, status: f.status === k ? '' : k })} testID={`vp-s-kpi-${k}`} />)}
      </div>
      <div style={card}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <input style={{ ...inp, width: 230 }} placeholder="بحث بالمعلم / المقرر / المحاضرة" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} data-testid="vp-s-search" />
          <select style={{ ...inp, width: 150 }} value={f.studio_id} onChange={(e) => setF({ ...f, studio_id: e.target.value })} data-testid="vp-s-studio"><option value="">كل الأستوديوهات</option>{(settings?.studios || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <input type="date" style={{ ...inp, width: 150 }} value={f.date_from} onChange={(e) => setF({ ...f, date_from: e.target.value })} data-testid="vp-s-from" />
          <input type="date" style={{ ...inp, width: 150 }} value={f.date_to} onChange={(e) => setF({ ...f, date_to: e.target.value })} data-testid="vp-s-to" />
          <span style={{ flex: 1 }} />
          {canStudio && <button onClick={() => setForm(true)} style={btn('#16a34a')} data-testid="vp-s-new">+ حجز تسجيل</button>}
        </div>
        {!!err && <div style={{ color: '#b91c1c' }} data-testid="vp-s-error">{err}</div>}
        {data.items.length === 0 ? <Empty text="لا توجد حجوزات بهذه الفلاتر" /> : (
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['الموعد', 'الأستوديو', 'المعلم', 'المقرر', 'المحاضرة / الجزء', 'الملحقات', 'المرحلة'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{data.items.map((s: any) => (
              <tr key={s.id} onClick={() => openSession(s.id)} style={{ cursor: 'pointer' }} data-testid={`vp-s-row-${s.id}`}>
                <td style={{ ...td, fontWeight: 800 }}>{s.date}<div style={{ fontSize: 10.5, color: '#64748b' }} dir="ltr">{s.start} – {s.end}</div></td><td style={td}>{sName(s.studio_id)}</td>
                <td style={td}>{s.teacher_name}</td><td style={td}>{s.course_name}</td><td style={td}>م{s.lecture_no}: {s.lecture_title}<div style={{ fontSize: 10.5, color: '#64748b' }}>الجزء {s.part_no}/{s.parts_count}</div></td>
                <td style={td}>{s.materials_delivered ? '📎 مستلمة' : '—'}</td>
                <td style={{ ...td, minWidth: 140 }}><Badge text={s.status_ar} color={sColor(settings, s.status)} /><div style={{ marginTop: 4 }}><Bar pct={s.pct} color={sColor(settings, s.status)} /></div>{s.stalled && <div style={{ fontSize: 10.5, color: '#b91c1c', fontWeight: 800 }}>⛔ {s.stalled.reason}</div>}</td>
              </tr>))}</tbody>
          </table></div>)}
      </div>
      {form && <Modal title="نموذج تسجيل محاضرة في الأستوديو" onClose={() => setForm(false)} width={860} testID="vp-s-form-modal" closeOnOverlay={false}>
        <SessionForm settings={settings} onDone={() => { setForm(false); load(); }} /></Modal>}
    </div>
  );
};

export default function VideoProductionPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('vp_manage_contracts'); const canStudio = hasPermission('vp_studio');
  const allowed = canManage || canStudio || hasPermission('vp_view') || hasPermission('vp_payments');
  const [tab, setTab] = useState<'contracts' | 'studio' | 'settings'>('contracts');
  const [settings, setSettings] = useState<any>(null); const [sess, setSess] = useState(''); const [rk, setRk] = useState(0);
  useEffect(() => { if (allowed) api.get(vp('/settings')).then((r) => setSettings(r.data)).catch(() => {}); }, [allowed]);
  const tabs = [['contracts', 'العقود والمتابعة'], ['studio', 'الأستوديو ومسيرة التسجيل'], ...(canManage || canStudio ? [['settings', 'الإعدادات']] : [])] as [typeof tab, string][];
  return (
    <CorrPage title="🎬 الإنتاج المرئي" subtitle="عقود المعلمين للتسجيل المرئي — البنود والمستحقات، حجز الأستوديوهات، ومسيرة كل محاضرة من التصوير حتى النشر" testID="vp-page" hideNav loading={allowed && !settings}>
      {!allowed ? <Empty text="ليس لديك صلاحية للوصول إلى الإنتاج المرئي" /> : (<>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, direction: 'rtl' }}>
          {tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} style={btn(tab === k ? '#0f2440' : '#e2e8f0', { color: tab === k ? '#fff' : '#0f2440' })} data-testid={`vp-tab-${k}`}>{l}</button>)}
        </div>
        {tab === 'contracts' && <ContractsTab settings={settings} canManage={canManage} openSession={setSess} />}
        {tab === 'studio' && <StudioTab settings={settings} canStudio={canStudio} openSession={setSess} reloadKey={rk} />}
        {tab === 'settings' && settings && <VpSettings settings={settings} onSaved={setSettings} />}
        {sess && <Modal title="مسيرة تسجيل الجزء" onClose={() => setSess('')} width={900} testID="vp-s-detail-modal"><SessionDetail id={sess} settings={settings} onChanged={() => setRk((x) => x + 1)} /></Modal>}
      </>)}
    </CorrPage>
  );
}

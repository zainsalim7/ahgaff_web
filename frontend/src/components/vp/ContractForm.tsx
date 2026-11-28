import React, { useEffect, useState } from 'react';
import api, { departmentsAPI, teachersAPI } from '../../services/api';
import { btn, inp, lbl } from '../corr/CorrUI';
import { errOf, money, today, vp } from './vpUi';

const F = ({ l, children, w = 220 }: { l: string; children: React.ReactNode; w?: number }) => <div style={{ flex: 1, minWidth: w }}><span style={lbl}>{l}</span>{children}</div>;

export const ContractForm = ({ initial, settings, onDone }: { initial?: any; settings: any; onDone: () => void }) => {
  const [teachers, setTeachers] = useState<any[]>([]); const [depts, setDepts] = useState<any[]>([]); const [tq, setTq] = useState('');
  const [f, setF] = useState<any>(() => initial ? { ...initial } : { teacher_id: '', teacher_name: '', qualification: '', specialization: '', academic_degree: '', phone: '', department_id: '', department_name: '', course_name: '', weekly_hours: 3, semester_weeks: settings?.semester_weeks || 16, contract_date: today(), start_date: today(), duration_days: settings?.default_duration_days || 60, first_party_name: settings?.first_party_name || '', first_party_title: settings?.first_party_title || '', items: (settings?.default_items || []).map((i: any) => ({ ...i })), notes: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { teachersAPI.getAll().then((r) => setTeachers(r.data || [])).catch(() => {}); departmentsAPI.getAll().then((r) => setDepts(r.data || [])).catch(() => {}); }, []);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const pickTeacher = (id: string) => { const t = teachers.find((x) => x.id === id); setF((p: any) => ({ ...p, teacher_id: id, teacher_name: t?.full_name || '', phone: p.phone || t?.phone || '', specialization: p.specialization || t?.specialization || '', academic_degree: p.academic_degree || t?.academic_title || '' })); };
  const setItem = (i: number, k: string, v: any) => set('items', f.items.map((it: any, j: number) => (j === i ? { ...it, [k]: v } : it)));
  const total = (f.items || []).reduce((a: number, i: any) => a + (+i.amount || 0), 0);
  const shownT = teachers.filter((t) => !tq || (t.full_name || '').includes(tq));
  const save = async () => {
    setBusy(true); setErr('');
    try { const body = { ...f, items: f.items.map((i: any) => ({ key: i.key, name: i.name, amount: +i.amount || 0, kind: i.kind })), semester_weeks: +f.semester_weeks || null, weekly_hours: +f.weekly_hours, duration_days: +f.duration_days };
      if (initial?.id) await api.put(vp(`/contracts/${initial.id}`), body); else await api.post(vp('/contracts'), body); onDone();
    } catch (e) { setErr(errOf(e)); } finally { setBusy(false); }
  };
  return (
    <div data-testid="vp-contract-form" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <F l="بحث عن المعلم"><input style={inp} value={tq} onChange={(e) => setTq(e.target.value)} placeholder="اكتب جزءاً من الاسم" data-testid="vp-cf-teacher-search" /></F>
        <F l="المعلم (الطرف الثاني) *"><select style={inp} value={f.teacher_id} onChange={(e) => pickTeacher(e.target.value)} data-testid="vp-cf-teacher"><option value="">— اختر —</option>{shownT.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></F>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <F l="المؤهل العلمي" w={150}><input style={inp} value={f.qualification} onChange={(e) => set('qualification', e.target.value)} data-testid="vp-cf-qualification" /></F>
        <F l="التخصص" w={150}><input style={inp} value={f.specialization} onChange={(e) => set('specialization', e.target.value)} data-testid="vp-cf-specialization" /></F>
        <F l="الدرجة العلمية" w={150}><input style={inp} value={f.academic_degree} onChange={(e) => set('academic_degree', e.target.value)} data-testid="vp-cf-degree" /></F>
        <F l="رقم التواصل" w={150}><input style={inp} value={f.phone} onChange={(e) => set('phone', e.target.value)} data-testid="vp-cf-phone" /></F>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <F l="القسم"><select style={inp} value={f.department_id} onChange={(e) => { const d = depts.find((x) => x.id === e.target.value); setF((p: any) => ({ ...p, department_id: e.target.value, department_name: d?.name || '', faculty_id: d?.faculty_id || p.faculty_id })); }} data-testid="vp-cf-department"><option value="">— اختر —</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></F>
        <F l="المقرر (المادة) *"><input style={inp} value={f.course_name} onChange={(e) => set('course_name', e.target.value)} data-testid="vp-cf-course" /></F>
        <F l="ساعات أسبوعية" w={100}><input type="number" style={inp} value={f.weekly_hours} onChange={(e) => set('weekly_hours', e.target.value)} data-testid="vp-cf-hours" /></F>
        <F l="أسابيع الفصل" w={100}><input type="number" style={inp} value={f.semester_weeks} onChange={(e) => set('semester_weeks', e.target.value)} data-testid="vp-cf-weeks" /></F>
        <F l="المطلوب تسجيله (ثلثا الساعات)" w={170}><div style={{ ...inp, background: '#f1f5f9', fontWeight: 800 }} data-testid="vp-cf-required-hours">{Math.round((+f.weekly_hours || 0) * (+f.semester_weeks || 0) * 2 / 3 * 100) / 100} ساعة من {(+f.weekly_hours || 0) * (+f.semester_weeks || 0)}</div></F>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <F l="تاريخ العقد" w={140}><input type="date" style={inp} value={f.contract_date} onChange={(e) => set('contract_date', e.target.value)} data-testid="vp-cf-contract-date" /></F>
        <F l="بداية التنفيذ *" w={140}><input type="date" style={inp} value={f.start_date} onChange={(e) => set('start_date', e.target.value)} data-testid="vp-cf-start" /></F>
        <F l="المهلة (يوم)" w={100}><input type="number" style={inp} value={f.duration_days} onChange={(e) => set('duration_days', e.target.value)} data-testid="vp-cf-duration" /></F>
        <F l="ممثل الطرف الأول" w={160}><input style={inp} value={f.first_party_name} onChange={(e) => set('first_party_name', e.target.value)} data-testid="vp-cf-fp-name" /></F>
        <F l="بصفته" w={140}><input style={inp} value={f.first_party_title} onChange={(e) => set('first_party_title', e.target.value)} data-testid="vp-cf-fp-title" /></F>
      </div>
      <div style={{ border: '1px solid #e6eaf0', borderRadius: 10, padding: 10 }} data-testid="vp-cf-items">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><strong style={{ fontSize: 13 }}>بنود العقد ومبالغها</strong><span style={{ fontWeight: 800, color: '#0f2440' }} data-testid="vp-cf-total">الإجمالي: {money(total)}</span></div>
        {f.items.map((it: any, i: number) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
            <input style={{ ...inp, flex: 3 }} value={it.name} onChange={(e) => setItem(i, 'name', e.target.value)} data-testid={`vp-cf-item-name-${i}`} />
            <input type="number" style={{ ...inp, flex: 1 }} value={it.amount} onChange={(e) => setItem(i, 'amount', e.target.value)} data-testid={`vp-cf-item-amount-${i}`} />
            <span style={{ fontSize: 11, color: '#64748b', minWidth: 90 }}>عند قبول البند</span>
            {f.items.length > 1 && <button onClick={() => set('items', f.items.filter((_: any, j: number) => j !== i))} style={btn('#fee2e2', { color: '#b91c1c', padding: '5px 9px' })} data-testid={`vp-cf-item-del-${i}`}>✕</button>}
          </div>
        ))}
        <button onClick={() => set('items', [...f.items, { name: '', amount: 0, kind: 'fixed' }])} style={btn('#f1f5f9', { color: '#0f2440' })} data-testid="vp-cf-item-add">+ بند</button>
      </div>
      {!!err && <div style={{ color: '#b91c1c', fontWeight: 700 }} data-testid="vp-cf-error">{err}</div>}
      <button disabled={busy} onClick={save} style={btn('#0f2440')} data-testid="vp-cf-save">{busy ? 'جارٍ الحفظ…' : initial?.status === 'issued' ? 'حفظ الملحق (يُعاد للمدرس للموافقة ثم التعميد)' : initial?.id ? 'حفظ التعديل' : 'حفظ كمسودة'}</button>
    </div>
  );
};

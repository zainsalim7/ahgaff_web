import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { btn, inp, lbl } from '../corr/CorrUI';
import { errOf, today, vp } from './vpUi';

const F = ({ l, children, w = 160 }: { l: string; children: React.ReactNode; w?: number }) => <div style={{ flex: 1, minWidth: w }}><span style={lbl}>{l}</span>{children}</div>;

export const SessionForm = ({ settings, contractId, onDone }: { settings: any; contractId?: string; onDone: () => void }) => {
  const [contracts, setContracts] = useState<any[]>([]);
  const [f, setF] = useState<any>({ contract_id: contractId || '', lecture_no: 1, lecture_title: '', topic: '', parts_count: 1, part_no: 1, est_minutes: settings?.max_part_minutes || 30, summary: '', attachment_note: '', teacher_notes: '', studio_id: '', date: today(), start: '09:00' });
  const [free, setFree] = useState<any[] | null>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  useEffect(() => { api.get(vp('/contracts'), { params: { status: 'issued' } }).then((r) => setContracts(r.data.items || [])).catch(() => {}); }, []);
  useEffect(() => { if (!f.date || !f.start) return; api.get(vp('/availability'), { params: { date: f.date, start: f.start, minutes: +f.est_minutes || 30 } }).then((r) => setFree(r.data.studios)).catch(() => setFree(null)); }, [f.date, f.start, f.est_minutes]);
  const save = async () => {
    setBusy(true); setErr('');
    try { await api.post(vp('/sessions'), { ...f, lecture_no: +f.lecture_no, parts_count: +f.parts_count, part_no: +f.part_no, est_minutes: +f.est_minutes }); onDone(); } catch (e) { setErr(errOf(e)); } finally { setBusy(false); }
  };
  const studios = (settings?.studios || []).filter((s: any) => s.is_active !== false);
  return (
    <div data-testid="vp-session-form" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <F l="العقد (المعلم — المقرر) *"><select style={inp} value={f.contract_id} onChange={(e) => set('contract_id', e.target.value)} data-testid="vp-sf-contract"><option value="">— اختر —</option>{contracts.map((c) => <option key={c.id} value={c.id}>{c.teacher_name} — {c.course_name} ({c.ref_no})</option>)}</select></F>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <F l="رقم المحاضرة" w={90}><input type="number" style={inp} value={f.lecture_no} onChange={(e) => set('lecture_no', e.target.value)} data-testid="vp-sf-lecture-no" /></F>
        <F l="عنوان المحاضرة *" w={220}><input style={inp} value={f.lecture_title} onChange={(e) => set('lecture_title', e.target.value)} data-testid="vp-sf-title" /></F>
        <F l="الموضوع (حسب التوصيف)" w={200}><input style={inp} value={f.topic} onChange={(e) => set('topic', e.target.value)} data-testid="vp-sf-topic" /></F>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <F l="عدد الأجزاء" w={90}><input type="number" style={inp} value={f.parts_count} onChange={(e) => set('parts_count', e.target.value)} data-testid="vp-sf-parts" /></F>
        <F l="الجزء" w={90}><input type="number" style={inp} value={f.part_no} onChange={(e) => set('part_no', e.target.value)} data-testid="vp-sf-part" /></F>
        <F l={`المدة التقديرية (≤ ${settings?.max_part_minutes || 30} د)`} w={130}><input type="number" style={inp} value={f.est_minutes} onChange={(e) => set('est_minutes', e.target.value)} data-testid="vp-sf-minutes" /></F>
        <F l="التاريخ" w={140}><input type="date" style={inp} value={f.date} onChange={(e) => set('date', e.target.value)} data-testid="vp-sf-date" /></F>
        <F l="الوقت" w={110}><input type="time" style={inp} value={f.start} onChange={(e) => set('start', e.target.value)} data-testid="vp-sf-start" /></F>
      </div>
      <F l="الأستوديو">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} data-testid="vp-sf-studios">
          {studios.length === 0 && <span style={{ color: '#b45309', fontSize: 12 }}>أضف الأستوديوهات من تبويب الإعدادات</span>}
          {studios.map((s: any) => { const ok = !free || free.some((x) => x.id === s.id); return (
            <button key={s.id} disabled={!ok} onClick={() => set('studio_id', s.id)} data-testid={`vp-sf-studio-${s.id}`}
              style={btn(f.studio_id === s.id ? '#0f2440' : ok ? '#ecfdf5' : '#f1f5f9', { color: f.studio_id === s.id ? '#fff' : ok ? '#166534' : '#94a3b8', border: '1px solid #d1fae5', cursor: ok ? 'pointer' : 'not-allowed' })}>
              {s.name}{ok ? ' · متاح' : ' · محجوز'}</button>); })}
        </div>
      </F>
      <F l="ملخص مختصر لما سيتم شرحه"><textarea style={{ ...inp, minHeight: 60 }} value={f.summary} onChange={(e) => set('summary', e.target.value)} data-testid="vp-sf-summary" /></F>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <F l="المرفق" w={200}><input style={inp} value={f.attachment_note} onChange={(e) => set('attachment_note', e.target.value)} placeholder="الشرائح / المصادر" data-testid="vp-sf-attachment" /></F>
        <F l="ملاحظات الأستاذ" w={200}><input style={inp} value={f.teacher_notes} onChange={(e) => set('teacher_notes', e.target.value)} data-testid="vp-sf-teacher-notes" /></F>
      </div>
      {!!err && <div style={{ color: '#b91c1c', fontWeight: 700 }} data-testid="vp-sf-error">{err}</div>}
      <button disabled={busy} onClick={save} style={btn('#0f2440')} data-testid="vp-sf-save">{busy ? 'جارٍ الحفظ…' : 'إنشاء الحجز'}</button>
    </div>
  );
};

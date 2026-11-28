import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { Badge, btn, card, inp, lbl } from '../corr/CorrUI';
import { Bar, errOf, flowOf, pdf, sColor, stepsOf, vp } from './vpUi';

export const SessionDetail = ({ id, settings, onChanged }: { id: string; settings: any; onChanged: () => void }) => {
  const { hasPermission } = useAuth(); const can = hasPermission('vp_studio');
  const [s, setS] = useState<any>(null); const [err, setErr] = useState('');
  const [x, setX] = useState({ note: '', studio_id: '', date: '', start: '', link: '', actual_minutes: '', photographer_notes: '', materials_note: '' });
  const load = () => api.get(vp(`/sessions/${id}`)).then((r) => { setS(r.data); setX((p) => ({ ...p, studio_id: r.data.studio_id || '', date: r.data.date, start: r.data.start, photographer_notes: r.data.photographer_notes || '', materials_note: r.data.materials_note || '' })); }).catch((e) => setErr(errOf(e)));
  useEffect(() => { load(); }, [id]); // eslint-disable-line
  const run = async (fn: () => Promise<any>) => { setErr(''); try { await fn(); await load(); onChanged(); setX((p) => ({ ...p, note: '', link: '' })); } catch (e) { setErr(errOf(e)); } };
  const act = (action: string, extra: any = {}) => run(() => api.post(vp(`/sessions/${id}/action`), { action, note: x.note, ...extra }));
  if (!s) return <div style={{ color: '#94a3b8' }}>{err || 'جاري التحميل…'}</div>;
  const studioName = (settings?.studios || []).find((z: any) => z.id === s.studio_id)?.name || 'لم يُحدد';
  const flow = flowOf(settings); const steps = stepsOf(settings);
  const idx = flow.findIndex((p) => p[0] === s.status); const nextKey = idx >= 1 && idx < flow.length - 1 ? flow[idx + 1][0] : '';
  const next = steps.find((z) => z.key === nextKey); const inSteps = steps.some((z) => z.key === s.status); const isLast = s.status === flow[flow.length - 1][0];
  return (
    <div data-testid="vp-session-detail">
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }} data-testid="vp-sd-pipeline">
        {flow.map(([k, l], i) => <div key={k} style={{ flex: 1, minWidth: 90, textAlign: 'center', padding: '6px 4px', borderRadius: 8, fontSize: 11.5, fontWeight: 800, color: i <= idx ? '#fff' : '#64748b', background: i <= idx ? sColor(settings, k) : '#f1f5f9' }} data-testid={`vp-sd-step-${k}`}>{l}</div>)}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }} data-testid="vp-sd-pct"><strong style={{ fontSize: 12.5 }}>مؤشر الإنجاز</strong><div style={{ flex: 1 }}><Bar pct={s.pct} color={sColor(settings, s.status)} /></div><strong>{Math.round(s.pct)}%</strong></div>
      {['rejected', 'cancelled'].includes(s.status) && <Badge text={s.status_ar} color={sColor(settings, s.status)} />}
      {s.stalled && <div style={{ ...card, background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b', fontWeight: 700 }} data-testid="vp-sd-stalled">⛔ متوقف منذ {s.stalled.at?.slice(0, 10)}: {s.stalled.reason}</div>}
      {!!err && <div style={{ color: '#b91c1c', fontWeight: 700, marginBottom: 8 }} data-testid="vp-sd-error">{err}</div>}
      <div style={{ ...card, fontSize: 12.5, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 6 }}>
        <div>المعلم: <strong>{s.teacher_name}</strong></div><div>المقرر: <strong>{s.course_name}</strong></div>
        <div>المحاضرة {s.lecture_no}: <strong>{s.lecture_title}</strong></div><div>الجزء <strong>{s.part_no} / {s.parts_count}</strong> · {s.est_minutes} د{s.actual_minutes ? ` (فعلي ${s.actual_minutes} د)` : ''}</div>
        <div>الموعد: <strong>{studioName} · {s.date} <span dir="ltr">{s.start} – {s.end}</span></strong></div><div>الموضوع: {s.topic || '—'}</div>
        <div style={{ gridColumn: '1/-1' }}>الملخص: {s.summary || '—'}</div><div>المرفق: {s.attachment_note || '—'}</div><div>ملاحظات الأستاذ: {s.teacher_notes || '—'}</div>
        {Object.entries(s.links || {}).map(([k, url]: any) => <div key={k}>{steps.find((z) => z.key === k)?.name || k}: <a href={url} target="_blank" rel="noreferrer" data-testid={`vp-sd-link-${k}`}>فتح الرابط</a></div>)}
      </div>
      <button onClick={() => pdf(`/sessions/${id}/pdf`, `${s.ref_no}.pdf`)} style={btn('#475569', { marginBottom: 10 })} data-testid="vp-sd-pdf">طباعة نموذج التسجيل PDF</button>
      {can && !['rejected', 'cancelled'].includes(s.status) && (
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div><span style={lbl}>ملاحظة / سبب (تصل للمعلم)</span><input style={inp} value={x.note} onChange={(e) => setX({ ...x, note: e.target.value })} data-testid="vp-sd-note" /></div>
          {['requested', 'confirmed'].includes(s.status) && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <select style={{ ...inp, width: 160 }} value={x.studio_id} onChange={(e) => setX({ ...x, studio_id: e.target.value })} data-testid="vp-sd-studio"><option value="">— الأستوديو —</option>{(settings?.studios || []).map((z: any) => <option key={z.id} value={z.id}>{z.name}</option>)}</select>
              <input type="date" style={{ ...inp, width: 150 }} value={x.date} onChange={(e) => setX({ ...x, date: e.target.value })} data-testid="vp-sd-date" />
              <input type="time" style={{ ...inp, width: 110 }} value={x.start} onChange={(e) => setX({ ...x, start: e.target.value })} data-testid="vp-sd-start" />
              <button onClick={() => act(s.status === 'requested' ? 'confirm' : 'reschedule', { studio_id: x.studio_id, date: x.date, start: x.start })} style={btn('#0891b2')} data-testid="vp-sd-confirm">{s.status === 'requested' ? 'تأكيد الحجز' : 'نقل الموعد'}</button>
              {s.status === 'requested' && <button onClick={() => act('reject')} style={btn('#b91c1c')} data-testid="vp-sd-reject">اعتذار (اكتب السبب/البديل)</button>}
              <button onClick={() => act('cancel')} style={btn('#94a3b8')} data-testid="vp-sd-cancel">إلغاء</button>
            </div>)}
          {next && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {next.is_filming && <input type="number" style={{ ...inp, width: 150 }} placeholder="المدة الفعلية (د)" value={x.actual_minutes} onChange={(e) => setX({ ...x, actual_minutes: e.target.value })} data-testid="vp-sd-actual" />}
              {next.requires_link && <input style={{ ...inp, flex: 1 }} placeholder={next.link_label || 'الرابط'} value={x.link} onChange={(e) => setX({ ...x, link: e.target.value })} data-testid="vp-sd-link" />}
              <button onClick={() => act('advance', { link: x.link, actual_minutes: x.actual_minutes ? +x.actual_minutes : null })} style={btn(sColor(settings, next.key))} data-testid="vp-sd-next">← {next.name}</button>
            </div>)}
          {inSteps && <button onClick={() => act('back')} style={btn('#f1f5f9', { color: '#0f2440', alignSelf: 'flex-start' })} data-testid="vp-sd-back">إرجاع مرحلة</button>}
          {idx >= 1 && !isLast && (s.stalled ? <button onClick={() => act('unstall')} style={btn('#16a34a', { alignSelf: 'flex-start' })} data-testid="vp-sd-unstall">استئناف</button>
            : <button onClick={() => act('stall')} style={btn('#fee2e2', { color: '#b91c1c', alignSelf: 'flex-start' })} data-testid="vp-sd-stall">تسجيل توقف (اكتب السبب)</button>)}
          <div style={{ borderTop: '1px solid #eef0f3', paddingTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 800, fontSize: 12.5 }}><input type="checkbox" checked={!!s.materials_delivered} onChange={(e) => run(() => api.put(vp(`/sessions/${id}`), { materials_delivered: e.target.checked, materials_note: x.materials_note }))} data-testid="vp-sd-materials" />استُلمت الملحقات (النص والمصادر التعليمية)</label>
            <input style={{ ...inp, flex: 1, minWidth: 180 }} placeholder="تفاصيل الملحقات" value={x.materials_note} onChange={(e) => setX({ ...x, materials_note: e.target.value })} data-testid="vp-sd-materials-note" />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <textarea style={{ ...inp, minHeight: 50 }} placeholder="ملاحظات المصور" value={x.photographer_notes} onChange={(e) => setX({ ...x, photographer_notes: e.target.value })} data-testid="vp-sd-photographer" />
            <button onClick={() => run(() => api.put(vp(`/sessions/${id}`), { photographer_notes: x.photographer_notes, materials_note: x.materials_note }))} style={btn('#0f2440')} data-testid="vp-sd-save-notes">حفظ</button>
          </div>
        </div>)}
      <details style={card}><summary style={{ cursor: 'pointer', fontWeight: 800 }}>سجل المسيرة</summary>
        {(s.history || []).slice().reverse().map((h: any, i: number) => <div key={i} style={{ fontSize: 12, padding: '4px 0', borderTop: '1px solid #f1f5f9' }}>{h.at?.slice(0, 16).replace('T', ' ')} — <strong>{h.action}</strong> — {h.by}{h.note ? ` — ${h.note}` : ''}</div>)}
      </details>
    </div>
  );
};

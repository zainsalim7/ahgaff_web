import React, { useEffect, useState } from 'react';
import { hrAPI } from '../../services/api';
import { Modal, inp, btn, errMsg, Badge, fmtDT } from './ui';

export const APPR_STATUS_COLOR: Record<string, string> = { draft: '#94a3b8', submitted: '#f97316', approved: '#16a34a', acknowledged: '#0f766e' };
export const gradeColor = (s?: number | null) => (s == null ? '#94a3b8' : s >= 90 ? '#16a34a' : s >= 80 ? '#0f766e' : s >= 70 ? '#0284c7' : s >= 60 ? '#f97316' : '#dc2626');

const MetricsPanel = ({ m }: { m: any }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 8 }} data-testid="appraisal-metrics">
    {[['نسبة الحضور', m.attendance_rate != null ? `${m.attendance_rate}%` : '—', `${m.present} حاضر / ${m.work_days} يوم عمل`], ['التأخير', `${m.late} مرة`, `${m.late_minutes} دقيقة`], ['الغياب', `${m.absent}`, `بعذر ${m.excused}`], ['أيام الإجازة', `${m.leave_days}`, 'معتمدة'],
      ['المهام', `${m.tasks_done}/${m.tasks_total}`, m.tasks_done_rate != null ? `إنجاز ${m.tasks_done_rate}%` : 'لا مهام'], ['في وقتها', m.tasks_on_time_rate != null ? `${m.tasks_on_time_rate}%` : '—', `${m.tasks_on_time} مهمة`], ['متأخرة حالياً', `${m.tasks_overdue}`, 'مهمة'], ['أيام مسجّلة', `${m.recorded_days}`, 'في كشف الحضور']].map(([l, v, s]) => (
      <div key={l} style={{ backgroundColor: '#f7f9fc', borderRadius: 8, padding: '6px 8px', textAlign: 'right' }}><div style={{ fontSize: 10, color: '#94a3b8' }}>{l}</div><div style={{ fontWeight: 800, color: '#0f2440', fontSize: 14 }}>{v}</div><div style={{ fontSize: 10, color: '#64748b' }}>{s}</div></div>
    ))}
  </div>
);

export const AppraisalModal: React.FC<{ id: string; meta: any; onClose: () => void; onChanged: () => void }> = ({ id, meta, onClose, onChanged }) => {
  const [a, setA] = useState<any>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [txt, setTxt] = useState({ evaluator_comment: '', strengths: '', improvements: '', goals: '' });
  const [hrNote, setHrNote] = useState('');
  const [empNote, setEmpNote] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => hrAPI.appraisal(id).then((r) => { const d = r.data; setA(d); setScores(d.scores || {}); setComments(d.comments || {}); setTxt({ evaluator_comment: d.evaluator_comment || '', strengths: d.strengths || '', improvements: d.improvements || '', goals: d.goals || '' }); }).catch((e) => { window.alert(errMsg(e)); onClose(); });
  useEffect(() => { load(); }, [id]);
  if (!a) return null;
  const criteria: any[] = a.criteria || meta?.criteria || [];
  const filled = criteria.every((c) => scores[c.key]);
  const liveTotal = filled ? Math.round((criteria.reduce((s, c) => s + scores[c.key], 0) / (5 * criteria.length)) * 1000) / 10 : null;
  const run = async (fn: () => Promise<any>, reload = true) => { setBusy(true); try { const r = await fn(); window.alert(r.data.message); onChanged(); if (reload) load(); else onClose(); } catch (e) { window.alert(errMsg(e)); } finally { setBusy(false); } };
  const save = () => run(() => hrAPI.saveAppraisal(id, { scores, comments, ...txt }));
  const submit = async () => { if (!filled) { window.alert('أكمل المعايير الستة'); return; } await hrAPI.saveAppraisal(id, { scores, comments, ...txt }).catch(() => {}); if (window.confirm('إرسال التقييم لاعتماد شؤون الموظفين؟ لن يمكن تعديله بعدها إلا بإعادته.')) run(() => hrAPI.submitAppraisal(id)); };
  const readOnly = !a.can_edit;

  return (
    <Modal title={`التقييم السنوي ${a.year} — ${a.employee_name}`} onClose={onClose} width={760} busy={busy} testID="appraisal-modal">
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <Badge color={APPR_STATUS_COLOR[a.status]} testID="appraisal-status">{a.status_label}</Badge>
        <span style={{ fontSize: 12, color: '#64748b' }}>{a.job_title}{a.org_unit_name ? ` · ${a.org_unit_name}` : ''} · المقيّم: {a.evaluator_name}</span>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, fontWeight: 800, color: '#5b6678', textAlign: 'right' }}>مؤشرات النظام لسنة {a.year} (تلقائية)</div>
      {a.metrics && <MetricsPanel m={a.metrics} />}
      <div style={{ marginTop: 14, fontSize: 12, fontWeight: 800, color: '#5b6678', textAlign: 'right' }}>المعايير (1 ضعيف → 5 ممتاز)</div>
      {criteria.map((c) => (
        <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f1f5f9', direction: 'rtl' }} data-testid={`criterion-${c.key}`}>
          <div style={{ flex: 1 }}><div style={{ fontWeight: 700, color: '#0f2440', fontSize: 13 }}>{c.label}</div><div style={{ fontSize: 10.5, color: '#94a3b8' }}>{c.hint}</div>{!readOnly && <input value={comments[c.key] || ''} onChange={(e) => setComments({ ...comments, [c.key]: e.target.value })} placeholder="ملاحظة (اختياري)" style={{ ...inp, marginTop: 4, padding: '4px 8px', fontSize: 11.5 }} />}{readOnly && comments[c.key] && <div style={{ fontSize: 11.5, color: '#475569', marginTop: 2 }}>{comments[c.key]}</div>}</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4, 5].map((n) => <button key={n} disabled={readOnly} onClick={() => setScores({ ...scores, [c.key]: n })} title={meta?.scale?.[n]} style={btn(scores[c.key] === n ? gradeColor(n * 20) : '#f1f5f9', scores[c.key] === n ? '#fff' : '#0f2440', { width: 36, height: 36, padding: 0, borderRadius: 18, opacity: readOnly && scores[c.key] !== n ? 0.35 : 1 })} data-testid={`score-${c.key}-${n}`}>{n}</button>)}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, backgroundColor: '#0f2440', color: '#fff', borderRadius: 10, padding: '10px 14px', direction: 'rtl' }}>
        <span style={{ fontWeight: 700 }}>النتيجة الإجمالية</span>
        <span style={{ fontSize: 22, fontWeight: 900 }} data-testid="appraisal-total">{liveTotal ?? a.total_score ?? '—'}<span style={{ fontSize: 12, fontWeight: 600 }}> / 100</span>{(liveTotal ?? a.total_score) != null && <span style={{ marginRight: 10, fontSize: 14, color: '#fde68a' }}>{a.status !== 'draft' ? a.grade : (liveTotal! >= 90 ? 'ممتاز' : liveTotal! >= 80 ? 'جيد جداً' : liveTotal! >= 70 ? 'جيد' : liveTotal! >= 60 ? 'مقبول' : 'ضعيف')}</span>}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
        {[['strengths', 'نقاط القوة'], ['improvements', 'جوانب التحسين'], ['goals', 'أهداف السنة القادمة'], ['evaluator_comment', 'تعليق المقيّم']].map(([k, l]) => (
          <div key={k}><div style={{ fontSize: 11.5, fontWeight: 700, color: '#333', marginBottom: 4, textAlign: 'right' }}>{l}</div>{readOnly ? <div style={{ ...inp, minHeight: 36, backgroundColor: '#fafafa' }}>{(txt as any)[k] || '—'}</div> : <textarea value={(txt as any)[k]} onChange={(e) => setTxt({ ...txt, [k]: e.target.value })} rows={2} style={{ ...inp, resize: 'vertical' }} data-testid={`appraisal-${k}`} />}</div>
        ))}
      </div>
      {a.hr_comment && <div style={{ marginTop: 10, fontSize: 12.5, backgroundColor: '#e3f2fd', color: '#1565c0', padding: '8px 10px', borderRadius: 8, textAlign: 'right' }}>تعليق شؤون الموظفين: {a.hr_comment}</div>}
      {a.employee_comment && <div style={{ marginTop: 8, fontSize: 12.5, backgroundColor: '#f0fdf4', color: '#166534', padding: '8px 10px', borderRadius: 8, textAlign: 'right' }}>تعليق الموظف: {a.employee_comment}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', direction: 'rtl' }}>
        {a.can_edit && <button onClick={save} disabled={busy} style={btn('#1565c0')} data-testid="appraisal-save">حفظ المسودة</button>}
        {a.can_submit && <button onClick={submit} disabled={busy || !filled} style={btn(filled ? '#16a34a' : '#cbd5e1')} data-testid="appraisal-submit">إرسال للاعتماد</button>}
      </div>
      {a.can_approve && (
        <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 10, direction: 'rtl' }}>
          <input value={hrNote} onChange={(e) => setHrNote(e.target.value)} placeholder="تعليق شؤون الموظفين (اختياري — إلزامي عند الإعادة)" style={inp} data-testid="appraisal-hr-note" />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => run(() => hrAPI.approveAppraisal(id, hrNote))} disabled={busy} style={btn('#16a34a')} data-testid="appraisal-approve">✅ اعتماد وإشعار الموظف</button>
            <button onClick={() => { if (!hrNote.trim()) { window.alert('اكتب سبب الإعادة'); return; } run(() => hrAPI.returnAppraisal(id, hrNote)); }} disabled={busy} style={btn('#fff3e0', '#e65100')} data-testid="appraisal-return">↩ إعادة للمدير</button>
          </div>
        </div>
      )}
      {a.can_acknowledge && (
        <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 10, direction: 'rtl' }}>
          <textarea value={empNote} onChange={(e) => setEmpNote(e.target.value)} placeholder="تعليقك على التقييم (اختياري)" rows={2} style={{ ...inp, resize: 'vertical' }} data-testid="appraisal-emp-note" />
          <button onClick={() => run(() => hrAPI.acknowledgeAppraisal(id, empNote), false)} disabled={busy} style={btn('#0f766e', '#fff', { marginTop: 8 })} data-testid="appraisal-acknowledge">تأكيد الاطّلاع</button>
        </div>
      )}
      {a.history?.length > 0 && <div style={{ marginTop: 14 }}><div style={{ fontSize: 12, fontWeight: 800, color: '#5b6678', marginBottom: 4 }}>مسار التقييم</div>{a.history.map((h: any, i: number) => <div key={i} style={{ fontSize: 11.5, color: '#475569', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}><b>{({ created: 'إنشاء', submitted: 'إرسال للاعتماد', approved: 'اعتماد', returned: 'إعادة', acknowledged: 'اطّلاع الموظف' } as any)[h.action] || h.action}</b> · {h.by_name} · {fmtDT(h.at)}{h.note ? <div style={{ color: '#94a3b8' }}>{h.note}</div> : null}</div>)}</div>}
    </Modal>
  );
};

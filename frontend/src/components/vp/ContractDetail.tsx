import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { Badge, btn, card, inp, td, th } from '../corr/CorrUI';
import { Bar, C_COLOR, ITEM_COLOR, S_COLOR, errOf, money, pdf, vp } from './vpUi';

const Kv = ({ k, v }: { k: string; v: any }) => <div style={{ fontSize: 12.5 }}><span style={{ color: '#64748b' }}>{k}: </span><strong>{v || '—'}</strong></div>;

export const ContractDetail = ({ id, onEdit, onChanged, onOpenSession }: { id: string; onEdit: (c: any) => void; onChanged: () => void; onOpenSession: (sid: string) => void }) => {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('vp_manage_contracts'); const canPay = hasPermission('vp_payments');
  const [c, setC] = useState<any>(null); const [err, setErr] = useState(''); const [pay, setPay] = useState({ amount: '', stage: '', note: '' });
  const load = () => api.get(vp(`/contracts/${id}`)).then((r) => setC(r.data)).catch((e) => setErr(errOf(e)));
  useEffect(() => { load(); }, [id]); // eslint-disable-line
  const run = async (fn: () => Promise<any>) => { setErr(''); try { await fn(); await load(); onChanged(); } catch (e) { setErr(errOf(e)); } };
  if (!c) return <div style={{ color: '#94a3b8' }}>{err || 'جاري التحميل…'}</div>;
  const p = c.progress;
  const act = (action: string, ask?: string) => run(() => { const note = ask ? window.prompt(ask) : ''; if (ask && note === null) return Promise.resolve(); return api.post(vp(`/contracts/${id}/status`), { action, note: note || '' }); });
  return (
    <div data-testid="vp-contract-detail">
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        <Badge text={c.status_ar} color={C_COLOR[c.status]} testID="vp-cd-status" />
        {c.teacher_accepted_at ? <Badge text="وافق المعلم على البنود" color="#16a34a" /> : c.status === 'issued' && <Badge text="بانتظار موافقة المعلم من التطبيق" color="#d97706" />}
        <span style={{ flex: 1 }} />
        <button onClick={() => pdf(`/contracts/${id}/pdf`, `${c.ref_no}.pdf`)} style={btn('#475569')} data-testid="vp-cd-pdf">طباعة العقد PDF</button>
        {canManage && ['draft', 'issued'].includes(c.status) && <button onClick={() => onEdit(c)} style={btn('#f1f5f9', { color: '#0f2440' })} data-testid="vp-cd-edit">{c.status === 'draft' ? 'تعديل' : 'ملحق تعديل'}</button>}
        {canManage && c.status === 'draft' && <button onClick={() => act('issue')} style={btn('#16a34a')} data-testid="vp-cd-issue">اعتماد وإصدار</button>}
        {canManage && c.status === 'issued' && <button onClick={() => act('complete')} style={btn('#2563eb')} data-testid="vp-cd-complete">إنهاء (مكتمل)</button>}
        {canManage && ['draft', 'issued'].includes(c.status) && <button onClick={() => act('terminate', 'سبب إلغاء العقد')} style={btn('#b91c1c')} data-testid="vp-cd-terminate">إلغاء</button>}
        {canManage && ['completed', 'terminated'].includes(c.status) && <button onClick={() => act('reopen')} style={btn('#64748b')} data-testid="vp-cd-reopen">إعادة فتح</button>}
      </div>
      {!!err && <div style={{ color: '#b91c1c', fontWeight: 700, marginBottom: 8 }} data-testid="vp-cd-error">{err}</div>}
      <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 6 }}>
        <Kv k="المعلم" v={c.teacher_name} /><Kv k="المقرر" v={c.course_name} /><Kv k="القسم" v={c.department_name} /><Kv k="رقم التواصل" v={c.phone} />
        <Kv k="المدة" v={`${c.start_date} ← ${c.end_date} (${c.duration_days} يوم)`} />
        <Kv k="المتبقي" v={p.days_left == null ? '—' : p.days_left < 0 ? `متأخر ${-p.days_left} يوم` : `${p.days_left} يوم`} />
        <Kv k="الإجمالي" v={money(p.total)} />
      </div>
      <div style={card} data-testid="vp-cd-progress">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><strong>المحاضرات المرئية: {p.lectures_completed} / {p.lectures_required} مكتملة · {p.lectures_published} منشورة</strong><strong>{p.percent}%</strong></div>
        <Bar pct={p.percent} />
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {p.lectures.length === 0 && <div style={{ color: '#94a3b8', fontSize: 12.5 }}>لم يُحجز أي تسجيل بعد</div>}
          {p.lectures.map((L: any) => (
            <div key={L.lecture_no} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5 }} data-testid={`vp-cd-lecture-${L.lecture_no}`}>
              <strong style={{ minWidth: 200 }}>{L.completed ? '✅' : '⏳'} م{L.lecture_no}: {L.title}</strong>
              {Array.from({ length: L.parts_count }, (_, i) => i + 1).map((n) => { const pt = L.parts.find((x: any) => x.part_no === n); return pt ? (
                <span key={n} onClick={() => onOpenSession(pt.id)} style={{ cursor: 'pointer', padding: '3px 8px', borderRadius: 99, color: '#fff', fontSize: 11, background: S_COLOR[pt.status] }} data-testid={`vp-cd-part-${L.lecture_no}-${n}`}>
                  ج{n}: {pt.status_ar}{pt.materials_delivered ? ' · 📎' : ''}{pt.stalled ? ' · ⛔' : ''}</span>) : <span key={n} style={{ padding: '3px 8px', borderRadius: 99, fontSize: 11, background: '#f1f5f9', color: '#64748b' }}>ج{n}: لم يُحجز</span>; })}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>تُحسب المحاضرة مكتملة للمعلم عند تصوير كل أجزائها واستلام ملحقاتها (📎 النص والمصادر).</div>
      </div>
      <div style={card} data-testid="vp-cd-items">
        <strong>البنود والمستحقات</strong>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
          <thead><tr>{['البند', 'المبلغ', 'الحالة', 'المستحق', ''].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{c.items.map((it: any) => (
            <tr key={it.key} data-testid={`vp-cd-item-${it.key}`}>
              <td style={td}>{it.name}</td><td style={td}>{money(it.amount)}</td>
              <td style={td}>{it.kind === 'recording' ? <Badge text={`${p.lectures_completed}/${p.lectures_required} محاضرة`} color="#7c3aed" /> : <Badge text={it.status_ar} color={ITEM_COLOR[it.status]} />}</td>
              <td style={{ ...td, fontWeight: 800 }}>{money(it.accrued)}</td>
              <td style={td}>{canManage && it.kind !== 'recording' && c.status === 'issued' && (
                <select style={{ ...inp, width: 'auto' }} value={it.status} onChange={(e) => run(() => api.put(vp(`/contracts/${id}/items/${it.key}`), { status: e.target.value }))} data-testid={`vp-cd-item-status-${it.key}`}>
                  <option value="pending">لم يُسلَّم</option><option value="delivered">مُسلَّم</option><option value="accepted">مقبول</option></select>)}</td>
            </tr>))}</tbody>
        </table>
        <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap', fontWeight: 800 }} data-testid="vp-cd-dues">
          <span>المستحق: {money(p.accrued)}</span><span style={{ color: '#16a34a' }}>المصروف: {money(p.paid)}</span><span style={{ color: '#b45309' }}>المتبقي للصرف: {money(p.balance)}</span>
        </div>
      </div>
      <div style={card} data-testid="vp-cd-payments">
        <strong>الدفعات (الصرف على مراحل)</strong>
        {(c.payments || []).map((x: any) => (
          <div key={x.id} style={{ display: 'flex', gap: 10, fontSize: 12.5, padding: '6px 0', borderTop: '1px solid #eef0f3', alignItems: 'center' }}>
            <strong>{money(x.amount)}</strong><span>{x.date}</span><span>{x.stage}</span><span style={{ color: '#64748b' }}>{x.note}</span><span style={{ flex: 1 }} /><span style={{ color: '#94a3b8' }}>{x.by}</span>
            {canPay && <button onClick={() => window.confirm('حذف الدفعة؟') && run(() => api.delete(vp(`/contracts/${id}/payments/${x.id}`)))} style={btn('#fee2e2', { color: '#b91c1c', padding: '3px 8px' })} data-testid={`vp-cd-pay-del-${x.id}`}>حذف</button>}
          </div>))}
        {canPay && c.status !== 'draft' && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <input type="number" style={{ ...inp, width: 130 }} placeholder="المبلغ" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} data-testid="vp-cd-pay-amount" />
            <input style={{ ...inp, width: 160 }} placeholder="المرحلة (مثلاً: الدفعة 1)" value={pay.stage} onChange={(e) => setPay({ ...pay, stage: e.target.value })} data-testid="vp-cd-pay-stage" />
            <input style={{ ...inp, flex: 1, minWidth: 160 }} placeholder="ملاحظة / رقم السند" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} data-testid="vp-cd-pay-note" />
            <button onClick={() => run(async () => { await api.post(vp(`/contracts/${id}/payments`), { ...pay, amount: +pay.amount }); setPay({ amount: '', stage: '', note: '' }); })} style={btn('#16a34a')} data-testid="vp-cd-pay-add">تسجيل صرف</button>
          </div>)}
      </div>
      <details style={card}><summary style={{ cursor: 'pointer', fontWeight: 800 }}>سجل العقد</summary>
        {(c.history || []).slice().reverse().map((h: any, i: number) => <div key={i} style={{ fontSize: 12, padding: '4px 0', borderTop: '1px solid #f1f5f9' }}>{h.at?.slice(0, 16).replace('T', ' ')} — <strong>{h.action}</strong> — {h.by}{h.note ? ` — ${h.note}` : ''}</div>)}
      </details>
    </div>
  );
};

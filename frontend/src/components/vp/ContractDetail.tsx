import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { Badge, btn, card, inp, td, th } from '../corr/CorrUI';
import { Bar, C_COLOR, ITEM_COLOR, P_COLOR, errOf, money, pdf, sColor, vp } from './vpUi';

const Kv = ({ k, v }: { k: string; v: any }) => <div style={{ fontSize: 12.5 }}><span style={{ color: '#64748b' }}>{k}: </span><strong>{v || '—'}</strong></div>;
const FLOW_HINT: Record<string, string> = { draft: 'أرسل العقد للمدرس ليوافق عليه من تطبيقه', sent: 'العقد ظاهر في تطبيق المدرس بانتظار موافقته', returned: 'أعاده المدرس بملاحظة — عدّله ثم أرسله مجدداً', teacher_accepted: 'وافق المدرس — أكّد التعميد ليصبح العقد ساري وملزم' };

export const ContractDetail = ({ id, settings, onEdit, onChanged, onOpenSession }: { id: string; settings: any; onEdit: (c: any) => void; onChanged: () => void; onOpenSession: (sid: string) => void }) => {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('vp_manage_contracts'); const canPay = hasPermission('vp_payments');
  const [c, setC] = useState<any>(null); const [err, setErr] = useState(''); const [pay, setPay] = useState({ amount: '', stage: '', note: '' });
  const load = () => api.get(vp(`/contracts/${id}`)).then((r) => setC(r.data)).catch((e) => setErr(errOf(e)));
  useEffect(() => { load(); }, [id]); // eslint-disable-line
  const run = async (fn: () => Promise<any>) => { setErr(''); try { await fn(); await load(); onChanged(); } catch (e) { setErr(errOf(e)); } };
  if (!c) return <div style={{ color: '#94a3b8' }}>{err || 'جاري التحميل…'}</div>;
  const p = c.progress; const fin = Array.isArray(c.items);
  const act = (action: string, ask?: string) => run(() => { const note = ask ? window.prompt(ask) : ''; if (ask && note === null) return Promise.resolve(); return api.post(vp(`/contracts/${id}/status`), { action, note: note || '' }); });
  const setItem = (key: string, status: string, amount: number) => run(() => {
    let accepted_amount: number | null = null;
    if (status === 'partial') { const v = window.prompt(`المبلغ المقبول جزئياً (من ${money(amount)})`); if (v === null) return Promise.resolve(); accepted_amount = +v; }
    return api.put(vp(`/contracts/${id}/items/${key}`), { status, accepted_amount });
  });
  const B = (show: boolean, label: string, color: string, onClick: () => void, tid: string) => show && <button onClick={onClick} style={btn(color)} data-testid={tid}>{label}</button>;
  return (
    <div data-testid="vp-contract-detail">
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
        <Badge text={c.status_ar} color={C_COLOR[c.status]} testID="vp-cd-status" />
        {c.teacher_accepted_at && <Badge text={`وافق المدرس ${c.teacher_accepted_at.slice(0, 10)}`} color="#16a34a" />}
        <span style={{ flex: 1 }} />
        {fin && <button onClick={() => pdf(`/contracts/${id}/pdf`, `${c.ref_no}.pdf`)} style={btn('#475569')} data-testid="vp-cd-pdf">طباعة العقد PDF</button>}
        {fin && <button onClick={() => pdf(`/contracts/${id}/statement`, `كشف-حساب-${c.ref_no}.pdf`)} style={btn('#0f766e')} data-testid="vp-cd-statement">كشف الحساب PDF</button>}
        {canManage && ['draft', 'returned', 'issued'].includes(c.status) && <button onClick={() => onEdit(c)} style={btn('#f1f5f9', { color: '#0f2440' })} data-testid="vp-cd-edit">{c.status === 'issued' ? 'ملحق تعديل' : 'تعديل'}</button>}
        {canManage && <>
          {B(['draft', 'returned'].includes(c.status), 'إرسال للمدرس للموافقة', '#d97706', () => act('send'), 'vp-cd-send')}
          {B(['sent', 'teacher_accepted'].includes(c.status), 'استرجاع للتعديل', '#64748b', () => act('recall'), 'vp-cd-recall')}
          {B(c.status === 'teacher_accepted', 'تأكيد التعميد (ملزم)', '#16a34a', () => act('issue'), 'vp-cd-issue')}
          {B(c.status === 'issued', 'إنهاء (مكتمل)', '#2563eb', () => act('complete'), 'vp-cd-complete')}
          {B(!['completed', 'terminated'].includes(c.status), 'إلغاء', '#b91c1c', () => act('terminate', 'سبب إلغاء العقد'), 'vp-cd-terminate')}
          {B(c.status === 'completed', 'إعادة فتح', '#64748b', () => act('reopen'), 'vp-cd-reopen')}
          {B(c.status === 'terminated', 'استعادة كمسودة', '#64748b', () => act('restore'), 'vp-cd-restore')}
        </>}
      </div>
      {FLOW_HINT[c.status] && <div style={{ ...card, background: '#fffbeb', borderColor: '#fde68a', fontSize: 12.5, fontWeight: 700 }} data-testid="vp-cd-hint">{FLOW_HINT[c.status]}{c.status === 'returned' && c.teacher_note ? ` — ملاحظة المدرس: «${c.teacher_note}»` : ''}</div>}
      {!!err && <div style={{ color: '#b91c1c', fontWeight: 700, marginBottom: 8 }} data-testid="vp-cd-error">{err}</div>}
      <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 6 }}>
        <Kv k="المدرس" v={c.teacher_name} /><Kv k="المقرر" v={c.course_name} /><Kv k="القسم" v={c.department_name} /><Kv k="رقم التواصل" v={c.phone} />
        <Kv k="ساعات المادة" v={`${c.weekly_hours} × ${c.semester_weeks} أسبوع = ${c.course_hours} ساعة`} /><Kv k="المطلوب تسجيله (الثلثان)" v={`${c.required_hours} ساعة`} />
        <Kv k="المدة" v={`${c.start_date} ← ${c.end_date}`} />
        <Kv k="المتبقي" v={p.days_left == null ? '—' : p.days_left < 0 ? `متأخر ${-p.days_left} يوم` : `${p.days_left} يوم`} />
        {fin && <Kv k="إجمالي العقد" v={money(p.total)} />}
        {canManage && <label style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center', fontWeight: 800 }}>
          <input type="checkbox" checked={!!c.app_visible} onChange={(e) => run(() => api.put(vp(`/teachers/${c.teacher_id}/flags`), { app_visible: e.target.checked }))} data-testid="vp-cd-app-visible" />إظهار التبويب في تطبيق هذا المدرس</label>}
      </div>
      <div style={card} data-testid="vp-cd-progress">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><strong>الساعات المسجلة: {p.recorded_hours} / {p.required_hours} ساعة · {p.lectures_count} محاضرة ({p.lectures_completed} مكتملة · {p.lectures_published} منشورة)</strong><strong>{p.percent}%</strong></div>
        <Bar pct={p.percent} testID="vp-cd-bar-complete" />
        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '10px 0 6px', fontSize: 12.5 }}><strong>مؤشر الإنجاز في مراحل الإنتاج</strong><strong data-testid="vp-cd-production-pct">{p.production_percent}%</strong></div>
        <Bar pct={p.production_percent} color="#7c3aed" testID="vp-cd-bar-production" />
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {p.lectures.length === 0 && <div style={{ color: '#94a3b8', fontSize: 12.5 }}>لم يُحجز أي تسجيل بعد</div>}
          {p.lectures.map((L: any) => (
            <div key={L.lecture_no} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5 }} data-testid={`vp-cd-lecture-${L.lecture_no}`}>
              <strong style={{ minWidth: 200 }}>{L.completed ? '✅' : '⏳'} م{L.lecture_no}: {L.title}</strong><span style={{ width: 90 }}><Bar pct={L.pct} color="#7c3aed" /></span><span style={{ fontSize: 11, color: '#64748b', minWidth: 34 }}>{Math.round(L.pct)}%</span>
              {Array.from({ length: L.parts_count }, (_, i) => i + 1).map((n) => { const pt = L.parts.find((x: any) => x.part_no === n); return pt ? (
                <span key={n} onClick={() => onOpenSession(pt.id)} style={{ cursor: 'pointer', padding: '3px 8px', borderRadius: 99, color: '#fff', fontSize: 11, background: sColor(settings, pt.status) }} data-testid={`vp-cd-part-${L.lecture_no}-${n}`}>
                  ج{n}: {pt.status_ar} {Math.round(pt.pct)}%{pt.materials_delivered ? ' · 📎' : ''}{pt.stalled ? ' · ⛔' : ''}</span>) : <span key={n} style={{ padding: '3px 8px', borderRadius: 99, fontSize: 11, background: '#f1f5f9', color: '#64748b' }}>ج{n}: لم يُحجز</span>; })}
            </div>
          ))}
        </div>
      </div>
      {fin && <div style={card} data-testid="vp-cd-items">
        <strong>البنود والمستحقات (مبالغ مقطوعة تُستحق عند قبول الإدارة للبند)</strong>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
          <thead><tr>{['البند', 'المبلغ', 'الحالة', 'المستحق', ''].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{c.items.map((it: any) => (
            <tr key={it.key} data-testid={`vp-cd-item-${it.key}`}>
              <td style={td}>{it.name}</td><td style={td}>{money(it.amount)}</td>
              <td style={td}><Badge text={it.status_ar} color={ITEM_COLOR[it.status]} /></td>
              <td style={{ ...td, fontWeight: 800 }}>{money(it.accrued)}</td>
              <td style={td}>{canManage && c.status === 'issued' && (
                <select style={{ ...inp, width: 'auto' }} value={it.status} onChange={(e) => setItem(it.key, e.target.value, it.amount)} data-testid={`vp-cd-item-status-${it.key}`}>
                  <option value="pending">لم يُسلَّم</option><option value="delivered">مُسلَّم</option><option value="partial">مقبول جزئياً…</option><option value="accepted">مقبول</option></select>)}</td>
            </tr>))}</tbody>
        </table>
        <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap', fontWeight: 800 }} data-testid="vp-cd-dues">
          <span>المستحق: {money(p.accrued)}</span><span style={{ color: '#16a34a' }}>المستلم (سندات): {money(p.paid)}</span>{p.pending > 0 && <span style={{ color: '#d97706' }}>بانتظار تأكيد المدرس: {money(p.pending)}</span>}<span style={{ color: '#b45309' }}>المتبقي للصرف: {money(p.balance)}</span>
        </div>
      </div>}
      {fin && <div style={card} data-testid="vp-cd-payments">
        <strong>الدفعات — يصل المدرس إشعار بالمبلغ ويؤكد استلامه من تطبيقه فيصبح سند استلام</strong>
        {(c.payments || []).map((x: any) => (
          <div key={x.id} style={{ display: 'flex', gap: 10, fontSize: 12.5, padding: '6px 0', borderTop: '1px solid #eef0f3', alignItems: 'center', flexWrap: 'wrap' }} data-testid={`vp-cd-pay-${x.id}`}>
            <strong>{money(x.amount)}</strong><span>{x.date}</span><span>{x.stage}</span><Badge text={x.status_ar} color={P_COLOR[x.status]} />
            {x.receipt_no && <strong style={{ color: '#16a34a' }}>سند {x.receipt_no}</strong>}{x.teacher_note && <span style={{ color: '#b91c1c' }}>ملاحظة المدرس: {x.teacher_note}</span>}
            <span style={{ flex: 1 }} /><span style={{ color: '#94a3b8' }}>{x.by}</span>
            {canPay && x.status !== 'received' && <button onClick={() => window.confirm('حذف الدفعة؟') && run(() => api.delete(vp(`/contracts/${id}/payments/${x.id}`)))} style={btn('#fee2e2', { color: '#b91c1c', padding: '3px 8px' })} data-testid={`vp-cd-pay-del-${x.id}`}>حذف</button>}
          </div>))}
        {canPay && ['issued', 'completed', 'terminated'].includes(c.status) && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <input type="number" style={{ ...inp, width: 130 }} placeholder="المبلغ" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} data-testid="vp-cd-pay-amount" />
            <input style={{ ...inp, width: 160 }} placeholder="المرحلة (مثلاً: الدفعة 1)" value={pay.stage} onChange={(e) => setPay({ ...pay, stage: e.target.value })} data-testid="vp-cd-pay-stage" />
            <input style={{ ...inp, flex: 1, minWidth: 160 }} placeholder="ملاحظة" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} data-testid="vp-cd-pay-note" />
            <button onClick={() => run(async () => { await api.post(vp(`/contracts/${id}/payments`), { ...pay, amount: +pay.amount }); setPay({ amount: '', stage: '', note: '' }); })} style={btn('#16a34a')} data-testid="vp-cd-pay-add">صرف وإشعار المدرس</button>
          </div>)}
      </div>}
      <details style={card}><summary style={{ cursor: 'pointer', fontWeight: 800 }}>سجل العقد</summary>
        {(c.history || []).slice().reverse().map((h: any, i: number) => <div key={i} style={{ fontSize: 12, padding: '4px 0', borderTop: '1px solid #f1f5f9' }}>{h.at?.slice(0, 16).replace('T', ' ')} — <strong>{h.action}</strong> — {h.by}{h.note ? ` — ${h.note}` : ''}</div>)}
      </details>
    </div>
  );
};

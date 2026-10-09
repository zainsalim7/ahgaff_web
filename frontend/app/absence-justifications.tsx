import React, { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../src/services/api';
import { CorrPage, card, btn, inp, lbl, th, td, Badge, Modal, Empty } from '../src/components/corr/CorrUI';

const STATUS_COLOR: Record<string, string> = { pending: '#d97706', approved: '#16a34a', rejected: '#b91c1c', needs_info: '#6d28d9' };
const STATUS_LABEL: Record<string, string> = { pending: 'قيد المراجعة', approved: 'مقبول', rejected: 'مرفوض', needs_info: 'مطلوب استكمال' };
const errOf = (e: any, d: string) => e?.response?.data?.detail || d;
const fmt = (iso?: string) => (iso ? iso.slice(0, 16).replace('T', ' ') : '—');
const kb = (n?: number) => (n ? `${Math.max(1, Math.round(n / 1024))} KB` : '');

export default function AbsenceJustificationsPage() {
  const [items, setItems] = useState<any[]>([]); const [status, setStatus] = useState('pending'); const [dept, setDept] = useState('');
  const [sel, setSel] = useState<any>(null); const [decision, setDecision] = useState<'approved' | 'rejected' | 'needs_info' | ''>(''); const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [loading, setLoading] = useState(true); const [token, setToken] = useState('');
  const base = (process.env.EXPO_PUBLIC_BACKEND_URL || process.env.REACT_APP_BACKEND_URL || '') + '/api';

  const load = () => { setLoading(true); api.get('/absence-justifications', { params: { status: status || undefined } }).then((r) => setItems(r.data.items || [])).catch((e) => setErr(errOf(e, 'غير مصرح بالوصول إلى طلبات التبرير'))).finally(() => setLoading(false)); };
  useEffect(load, [status]); // eslint-disable-line
  useEffect(() => { AsyncStorage.getItem('token').then((t) => setToken(t || '')); }, []);

  const depts = useMemo(() => Array.from(new Map(items.filter((i) => i.department_id).map((i) => [i.department_id, i.department_name || i.department_id])).entries()), [items]);
  const shown = dept ? items.filter((i) => i.department_id === dept) : items;
  const counts = useMemo(() => ({ pending: items.filter((i) => i.status === 'pending').length }), [items]);

  const open = async (it: any) => { setErr(''); setDecision(''); setNote(''); try { const r = await api.get(`/absence-justifications/${it.id}`); setSel(r.data); } catch (e) { setErr(errOf(e, 'تعذر فتح الطلب')); } };
  const decide = async () => {
    if (!decision) return;
    if (decision !== 'approved' && !note.trim()) { setErr(decision === 'rejected' ? 'سبب الرفض إلزامي' : 'ملاحظة الاستكمال إلزامية'); return; }
    setBusy(true); setErr('');
    try { const r = await api.post(`/absence-justifications/${sel.id}/decide`, { decision, note: note.trim() }); window.alert(r.data.message); setSel(null); load(); }
    catch (e) { setErr(errOf(e, 'فشل تسجيل القرار')); } finally { setBusy(false); }
  };
  const attUrl = (a: any) => `${base}/absence-justifications/${sel.id}/attachments/${a.id}?token=${encodeURIComponent(token)}`;
  const canDecide = sel && ['pending', 'needs_info'].includes(sel.status);

  return (
    <CorrPage title="🩺 طلبات تبرير غياب الأساتذة" subtitle="مراجعة طلبات الأساتذة عن المحاضرات الغائبة: قبول (تتحول المحاضرة إلى «غائب بعذر») / رفض بسبب / طلب استكمال." testID="aj-page" hideNav
      actions={<div style={{ display: 'flex', gap: 6 }}>{([['pending', 'قيد المراجعة'], ['needs_info', 'مطلوب استكمال'], ['approved', 'المقبولة'], ['rejected', 'المرفوضة'], ['', 'الكل']] as const).map(([k, l]) => <button key={k} onClick={() => setStatus(k)} style={btn(status === k ? '#0f2440' : '#f1f5f9', { color: status === k ? '#fff' : '#0f2440' })} data-testid={`aj-filter-${k || 'all'}`}>{l}{k === 'pending' && status === 'pending' && counts.pending ? ` (${counts.pending})` : ''}</button>)}</div>}>
      {!!err && !sel && <div style={{ ...card, color: '#b91c1c', fontWeight: 700 }} data-testid="aj-error">{err}</div>}
      <div style={card} data-testid="aj-list">
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
          <select style={{ ...inp, width: 'auto', minWidth: 220 }} value={dept} onChange={(e) => setDept(e.target.value)} data-testid="aj-dept-filter"><option value="">كل الأقسام</option>{depts.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
          <span style={{ fontSize: 12, color: '#64748b' }} data-testid="aj-count">{shown.length} طلب</span>
          <button onClick={load} style={btn('#f1f5f9', { color: '#0f2440', padding: '6px 10px', fontSize: 12 })} data-testid="aj-refresh">↻ تحديث</button>
        </div>
        {loading ? <div style={{ color: '#94a3b8', fontSize: 13 }}>جاري التحميل…</div> : shown.length === 0 ? <Empty text="لا توجد طلبات في هذا التصنيف" /> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['الرقم', 'الأستاذ', 'القسم', 'نوع العذر', 'المحاضرات', 'المرفقات', 'تاريخ التقديم', 'الحالة', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
            <tbody>{shown.map((it) => (
              <tr key={it.id} data-testid={`aj-row-${it.id}`} style={it.resubmit_count ? { background: '#fffbeb' } : undefined}>
                <td style={{ ...td, fontWeight: 800 }}>{it.ref_no}{it.resubmit_count ? <div style={{ fontSize: 10, color: '#b45309' }}>إعادة تقديم</div> : null}</td>
                <td style={td}>{it.teacher_name}</td><td style={td}>{it.department_name || '—'}</td><td style={td}>{it.excuse_type_label}</td>
                <td style={td}>{(it.lectures || []).length} — {(it.lectures || []).slice(0, 2).map((l: any) => `${l.course_name} ${l.date}`).join('، ')}{(it.lectures || []).length > 2 ? '…' : ''}</td>
                <td style={td}>{(it.attachments || []).length}</td><td style={td}>{fmt(it.created_at)}</td>
                <td style={td}><Badge text={STATUS_LABEL[it.status] || it.status_label} color={STATUS_COLOR[it.status] || '#64748b'} /></td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}><button onClick={() => open(it)} style={btn('#0f2440', { padding: '5px 10px', fontSize: 12 })} data-testid={`aj-open-${it.id}`}>{['pending', 'needs_info'].includes(it.status) ? 'مراجعة' : 'التفاصيل'}</button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      {sel && (
        <Modal title={`طلب ${sel.ref_no} — ${sel.teacher_name}`} onClose={() => setSel(null)} width={820} testID="aj-detail">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13, direction: 'rtl' }}>
            <div><label style={lbl}>الحالة</label><Badge text={STATUS_LABEL[sel.status] || sel.status_label} color={STATUS_COLOR[sel.status] || '#64748b'} testID="aj-detail-status" /></div>
            <div><label style={lbl}>القسم</label>{sel.department_name || '—'}</div>
            <div><label style={lbl}>نوع العذر</label>{sel.excuse_type_label}</div>
            <div><label style={lbl}>تاريخ التقديم</label>{fmt(sel.created_at)}{sel.resubmit_count ? ' · إعادة تقديم بعد رفض' : ''}</div>
          </div>
          <label style={{ ...lbl, marginTop: 10 }}>وصف العذر</label>
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: 10, fontSize: 13, whiteSpace: 'pre-wrap', direction: 'rtl' }} data-testid="aj-detail-description">{sel.description || '—'}</div>
          <label style={{ ...lbl, marginTop: 10 }}>المحاضرات ({(sel.lectures || []).length})</label>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['المقرر', 'التاريخ', 'الوقت', 'القاعة'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{(sel.lectures || []).map((l: any) => <tr key={l.id} data-testid={`aj-lecture-${l.id}`}><td style={td}>{l.course_name}</td><td style={td}>{l.date}</td><td style={td}>{l.start_time} – {l.end_time}</td><td style={td}>{l.room || '—'}</td></tr>)}</tbody></table>
          <label style={{ ...lbl, marginTop: 10 }}>المرفقات ({(sel.attachments || []).length})</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', direction: 'rtl' }}>
            {(sel.attachments || []).map((a: any) => (
              <a key={a.id} href={attUrl(a)} target="_blank" rel="noreferrer" style={{ display: 'flex', flexDirection: 'column', gap: 4, border: '1px solid #e2e8f0', borderRadius: 10, padding: 8, textDecoration: 'none', color: '#0f2440', width: 150 }} data-testid={`aj-att-${a.id}`}>
                {String(a.mime || '').startsWith('image/') ? <img src={attUrl(a)} alt={a.name} style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 6 }} /> : <div style={{ height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fef2f2', borderRadius: 6, fontWeight: 800, color: '#b91c1c' }}>PDF</div>}
                <span style={{ fontSize: 11.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.name}>{a.name}</span><span style={{ fontSize: 10.5, color: '#64748b' }}>{kb(a.size)} · فتح ↗</span>
              </a>
            ))}
          </div>
          {sel.decision_note || sel.decided_by_name ? <div style={{ marginTop: 10, background: '#f1f5f9', borderRadius: 8, padding: 10, fontSize: 12.5, direction: 'rtl' }} data-testid="aj-detail-decision"><b>القرار السابق:</b> {sel.decided_by_name || '—'} · {fmt(sel.decided_at)}{sel.decision_note ? ` — ${sel.decision_note}` : ''}</div> : null}
          {canDecide && (
            <div style={{ marginTop: 14, borderTop: '2px solid #e2e8f0', paddingTop: 12, direction: 'rtl' }} data-testid="aj-decide">
              <label style={lbl}>القرار</label>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {([['approved', '✅ قبول', '#16a34a'], ['rejected', '✖ رفض', '#b91c1c'], ['needs_info', '📎 طلب استكمال', '#6d28d9']] as const).map(([k, l, c]) => <button key={k} onClick={() => setDecision(k)} style={btn(decision === k ? c : '#f1f5f9', { color: decision === k ? '#fff' : c, border: `1.5px solid ${c}` })} data-testid={`aj-decision-${k}`}>{l}</button>)}
              </div>
              {decision && decision !== 'approved' && <textarea style={{ ...inp, minHeight: 70, fontFamily: 'inherit' }} value={note} onChange={(e) => setNote(e.target.value)} placeholder={decision === 'rejected' ? 'سبب الرفض (إلزامي) — يصل إلى الأستاذ' : 'ما المطلوب استكماله؟ (إلزامي) — يصل إلى الأستاذ'} data-testid="aj-note" />}
              {decision === 'approved' && <div style={{ fontSize: 12, color: '#166534', background: '#f0fdf4', borderRadius: 8, padding: 8 }}>عند القبول تتحول المحاضرات المذكورة إلى «غائب بعذر» ولا تُحتسب غياباً على الأستاذ.</div>}
              {!!err && <div style={{ color: '#b91c1c', fontWeight: 700, fontSize: 12.5, marginTop: 6 }} data-testid="aj-decide-error">{err}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={decide} disabled={!decision || busy} style={btn(decision ? '#0f2440' : '#cbd5e1')} data-testid="aj-submit-decision">{busy ? '⏳' : 'تسجيل القرار'}</button>
                <button onClick={() => setSel(null)} style={btn('#f1f5f9', { color: '#0f2440' })} data-testid="aj-cancel">إغلاق</button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </CorrPage>
  );
}

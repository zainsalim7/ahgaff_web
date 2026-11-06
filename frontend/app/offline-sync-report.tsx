import React, { useEffect, useMemo, useState } from 'react';
import api from '../src/services/api';
import { CorrPage, card, btn, inp, th, td, Badge, Empty, Modal } from '../src/components/corr/CorrUI';

const STATUS: Record<string, { label: string; color: string }> = {
  success: { label: 'نجحت', color: '#16a34a' },
  failed: { label: 'فشلت', color: '#b91c1c' },
  overridden: { label: 'قُبلت يدوياً', color: '#2563eb' },
};
const errOf = (e: any, d: string) => e?.response?.data?.detail || d;
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const fmtDelay = (m: number) => (m <= 0 ? 'في الوقت' : m >= 60 ? `${Math.floor(m / 60)} س ${m % 60 ? (m % 60) + ' د' : ''}`.trim() : `${m} د`);

export default function OfflineSyncReportPage() {
  const [from, setFrom] = useState(daysAgo(30)); const [to, setTo] = useState(today());
  const [data, setData] = useState<any>({ items: [], summary: { success: 0, failed: 0, avg_delay_minutes: 0, max_delay_minutes: 0 } });
  const [loading, setLoading] = useState(true); const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'success' | 'failed'>('');
  const [overrideItem, setOverrideItem] = useState<any>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [overrideErr, setOverrideErr] = useState('');

  const submitOverride = () => {
    if (!overrideItem || !overrideReason.trim()) return;
    setOverrideSaving(true); setOverrideErr('');
    api.post(`/reports/offline-sync/${overrideItem.id}/override`, { reason: overrideReason.trim() })
      .then(() => { setOverrideItem(null); setOverrideReason(''); load(); })
      .catch((e) => setOverrideErr(errOf(e, 'تعذّر القبول اليدوي')))
      .finally(() => setOverrideSaving(false));
  };

  const load = () => {
    setLoading(true); setErr('');
    api.get('/reports/offline-sync', { params: { start_date: from, end_date: to } })
      .then((r) => setData(r.data))
      .catch((e) => setErr(errOf(e, 'غير مصرح بالوصول إلى هذا التقرير')))
      .finally(() => setLoading(false));
  };
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [from, to]); // eslint-disable-line

  const norm = (x: string) => (x || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase();
  const shown = useMemo(() => data.items.filter((it: any) =>
    (!statusFilter || it.status === statusFilter) &&
    (!q || norm(`${it.teacher_name} ${it.course_name}`).includes(norm(q)))
  ), [data, q, statusFilter]);
  const hasLocal = !!q || !!statusFilter;

  const topLate = useMemo(() => {
    const m = new Map<string, { name: string; count: number; maxDelay: number }>();
    data.items.forEach((it: any) => {
      if (it.delay_minutes <= 0) return;
      const e = m.get(it.teacher_id || it.teacher_name) || { name: it.teacher_name || 'غير معيّن', count: 0, maxDelay: 0 };
      e.count++; e.maxDelay = Math.max(e.maxDelay, it.delay_minutes);
      m.set(it.teacher_id || it.teacher_name, e);
    });
    return Array.from(m.values()).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [data]);

  const s = data.summary || {};

  return (
    <CorrPage title="⏱️ تقرير مزامنة الحضور الأوفلاين" subtitle="من يُزامن متأخراً عن نهاية المحاضرة، مدة التأخر، ونجاح أو فشل كل محاولة مزامنة" testID="offline-sync-report-page" hideNav>
      {!!err && <div style={{ ...card, color: '#b91c1c', fontWeight: 700 }} data-testid="osr-error">{err}</div>}
      <div style={card}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr auto', gap: 8, alignItems: 'center' }} data-testid="osr-filters">
          <label style={{ fontSize: 12, color: '#475569' }}>من <input type="date" style={{ ...inp, width: 'auto', padding: '6px 8px' }} value={from} onChange={(e) => setFrom(e.target.value)} data-testid="osr-from" /></label>
          <label style={{ fontSize: 12, color: '#475569' }}>إلى <input type="date" style={{ ...inp, width: 'auto', padding: '6px 8px' }} value={to} onChange={(e) => setTo(e.target.value)} data-testid="osr-to" /></label>
          <div />
          <button onClick={load} style={btn('#f1f5f9', { color: '#0f2440', padding: '6px 10px', fontSize: 12 })} data-testid="osr-refresh">↻</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 بحث باسم الأستاذ أو المقرر…" style={{ ...inp, flex: 1, minWidth: 220 }} data-testid="osr-search" />
          {hasLocal && <button onClick={() => { setQ(''); setStatusFilter(''); }} style={btn('#f1f5f9', { color: '#0f2440', padding: '6px 10px', fontSize: 12 })} data-testid="osr-clear-local">✕ مسح الفلاتر</button>}
          <span style={{ fontSize: 12, color: '#64748b' }} data-testid="osr-count">{hasLocal ? `${shown.length} من ${data.items.length}` : `${data.items.length} محاولة مزامنة`}</span>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }} data-testid="osr-summary">
          {([['success', s.success], ['failed', s.failed]] as const).map(([k, v]) => { const active = statusFilter === k; return (
            <div key={k} role="button" onClick={() => setStatusFilter(active ? '' : k)} title={active ? 'إلغاء الفلترة' : `عرض ${STATUS[k].label} فقط`}
              style={{ flex: 1, minWidth: 140, borderRadius: 12, padding: 12, cursor: 'pointer', userSelect: 'none', background: active ? STATUS[k].color : STATUS[k].color + '12', border: `1.5px solid ${active ? STATUS[k].color : STATUS[k].color + '44'}`, boxShadow: active ? `0 4px 14px ${STATUS[k].color}55` : 'none', transition: 'background-color .15s, box-shadow .15s' }} data-testid={`osr-summary-${k}`}>
              <div style={{ fontSize: 26, fontWeight: 900, color: active ? '#fff' : STATUS[k].color }}>{v ?? 0}</div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: active ? '#fff' : '#334155' }}>{STATUS[k].label}{active ? ' ✓' : ''}</div>
            </div>); })}
          <div style={{ flex: 1, minWidth: 140, borderRadius: 12, padding: 12, background: '#f1f5f914' }} data-testid="osr-summary-avg-delay">
            <div style={{ fontSize: 26, fontWeight: 900, color: '#334155' }}>{fmtDelay(s.avg_delay_minutes || 0)}</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>متوسط التأخر</div>
          </div>
          <div style={{ flex: 1, minWidth: 140, borderRadius: 12, padding: 12, background: '#f1f5f914' }} data-testid="osr-summary-max-delay">
            <div style={{ fontSize: 26, fontWeight: 900, color: '#334155' }}>{fmtDelay(s.max_delay_minutes || 0)}</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>أقصى تأخر</div>
          </div>
        </div>
        {topLate.length > 0 && <div style={{ marginTop: 10, fontSize: 12.5, color: '#475569' }} data-testid="osr-top-late"><b>الأكثر تأخراً:</b> {topLate.map((t, i) => <React.Fragment key={t.name}>{i > 0 ? ' — ' : ' '}<a onClick={() => setQ(q === t.name ? '' : t.name)} style={{ cursor: 'pointer', color: q === t.name ? '#b91c1c' : '#1d4ed8', fontWeight: q === t.name ? 800 : 500 }} data-testid={`osr-teacher-link-${i}`}>{t.name}</a> ({t.count} مرة، أقصى تأخر {fmtDelay(t.maxDelay)})</React.Fragment>)}</div>}
      </div>
      <div style={card} data-testid="osr-list">
        {loading ? <div style={{ color: '#94a3b8', fontSize: 13 }}>جاري التحميل…</div> : shown.length === 0 ? <Empty text={hasLocal ? 'لا نتائج مطابقة للفلاتر' : 'لا توجد محاولات مزامنة أوفلاين في هذه الفترة'} /> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['تاريخ المحاضرة', 'المقرر', 'الأستاذ', 'الحالة', 'التأخر عن نهاية المحاضرة', 'وقت المزامنة', 'عدد السجلات', 'السبب الحقيقي (إن فشلت)', ''].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{shown.map((it: any) => { const st = STATUS[it.status] || STATUS.failed; return (
              <tr key={it.id} data-testid={`osr-row-${it.id}`} style={it.status === 'failed' ? { background: '#fff5f5' } : undefined}>
                <td style={td}>{it.lecture_date}</td><td style={td}>{it.course_name}</td><td style={td}>{it.teacher_name || '—'}</td>
                <td style={td}><Badge text={st.label} color={st.color} /></td>
                <td style={{ ...td, fontWeight: 800, color: it.delay_minutes > 60 ? '#b91c1c' : it.delay_minutes > 0 ? '#92400e' : '#16a34a' }}>{fmtDelay(it.delay_minutes)}</td>
                <td style={td}>{String(it.synced_at || '').slice(0, 16).replace('T', ' ')}</td>
                <td style={td}>{it.records_count}</td>
                <td style={{ ...td, fontSize: 11.5, color: '#b91c1c', maxWidth: 320 }}>{it.diagnosis || it.reason || '—'}
                  {it.status === 'overridden' && <div style={{ color: '#2563eb', marginTop: 4 }}>قُبل يدوياً بواسطة {it.overridden_by_name || '—'} — السبب: {it.override_reason}</div>}
                </td>
                <td style={td}>{it.can_override && <button onClick={() => { setOverrideItem(it); setOverrideReason(''); setOverrideErr(''); }} style={btn('#2563eb', { padding: '5px 10px', fontSize: 11.5 })} data-testid={`osr-override-btn-${it.id}`}>قبول يدوياً</button>}</td>
              </tr>); })}</tbody>
          </table>
        )}
      </div>
      {!!overrideItem && (
        <Modal title="قبول محاولة مزامنة فاشلة يدوياً" onClose={() => setOverrideItem(null)} testID="osr-override-modal">
          <div style={{ fontSize: 13, color: '#334155', marginBottom: 10 }}>
            <b>{overrideItem.teacher_name}</b> — {overrideItem.course_name} — محاضرة {overrideItem.lecture_date}
          </div>
          <div style={{ fontSize: 12.5, color: '#b91c1c', background: '#fff5f5', borderRadius: 8, padding: 10, marginBottom: 12 }} data-testid="osr-override-diagnosis">
            <b>السبب الحقيقي للرفض:</b> {overrideItem.diagnosis || overrideItem.reason}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>بعد التحقق يدوياً من صحة هذا الحضور (مثلاً عبر توقيع ورقي أو تأكيد الأستاذ)، يمكنك قبوله وتسجيله فعلياً. اذكر سبب القبول للتدقيق:</div>
          <textarea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="سبب القبول اليدوي (إلزامي)…" style={{ ...inp, minHeight: 70, resize: 'vertical' }} data-testid="osr-override-reason-input" />
          {!!overrideErr && <div style={{ color: '#b91c1c', fontSize: 12, marginTop: 8 }} data-testid="osr-override-error">{overrideErr}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-start' }}>
            <button onClick={submitOverride} disabled={overrideSaving || !overrideReason.trim()} style={btn('#2563eb', { opacity: overrideSaving || !overrideReason.trim() ? 0.6 : 1 })} data-testid="osr-override-submit">{overrideSaving ? 'جارٍ القبول…' : 'تأكيد القبول وتسجيل الحضور'}</button>
            <button onClick={() => setOverrideItem(null)} style={btn('#f1f5f9', { color: '#0f2440' })} data-testid="osr-override-cancel">إلغاء</button>
          </div>
        </Modal>
      )}
    </CorrPage>
  );
}

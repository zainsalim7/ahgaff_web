import React, { useEffect, useState, useCallback } from 'react';
import api from '../../services/api';
import { Badge, td, table, btn, alertErr, fmtDT } from '../hr/ui';
import { filenameFromResponse } from '../../utils/exportName';

export type PrintFilters = { excludePrinted: boolean; onlyWithPhoto: boolean; excludeIds: string[] };
/** تخصيص المكوّنات لنوع البطاقة (طلاب افتراضياً / موظفون) */
export type PrintKind = { basePath: string; entity: string; entityPlural: string; sub: (r: any) => string; meta: (r: any) => string; metaHeader: string; histCols: (b: any) => string[]; histHeaders: string[]; fileLabel: string };
export const STUDENT_KIND: PrintKind = { basePath: '/cards', entity: 'الطالب', entityPlural: 'الطلاب', sub: (r) => r.student_id, meta: (r) => `${r.level ?? ''}${r.section ? `/${r.section}` : ''}`, metaHeader: 'م/ش', histCols: (b) => [b.department_name, b.level ?? 'الكل'], histHeaders: ['القسم', 'المستوى'], fileLabel: 'بطاقات الطلاب' };
export const EMPLOYEE_KIND: PrintKind = { basePath: '/hr/cards', entity: 'الموظف', entityPlural: 'الموظفين', sub: (r) => [r.number, r.job_title].filter(Boolean).join(' · '), meta: (r) => r.unit_name || '—', metaHeader: 'الوحدة', histCols: (b) => [b.unit_name, b.category_label ?? 'الكل'], histHeaders: ['الوحدة', 'الفئة'], fileLabel: 'بطاقات الموظفين' };

/** 🖨️ تتبّع دفعات الطباعة: فلاتر (لا تكرار / صورة معتمدة) + معاينة القائمة قبل التوليد */
export const PrintBatchPreview: React.FC<{ body: any; filters: PrintFilters; onChange: (f: PrintFilters) => void; refreshKey: number; onSummary: (s: any) => void; kind?: PrintKind; ready?: boolean }> = ({ body, filters, onChange, refreshKey, onSummary, kind = STUDENT_KIND, ready }) => {
  const [d, setD] = useState<any>(null);
  const [open, setOpen] = useState(true);
  const [only, setOnly] = useState<'all' | 'included' | 'excluded'>('all');
  const load = useCallback(async () => {
    if (ready === false || (ready === undefined && !body.department_id && !body.student_ids?.length)) { setD(null); onSummary(null); return; }
    try { const r = await api.post(`${kind.basePath}/batch-preview`, { ...body, exclude_printed: filters.excludePrinted, only_with_photo: filters.onlyWithPhoto, exclude_ids: filters.excludeIds }); setD(r.data); onSummary(r.data.summary); } catch (e) { setD(null); onSummary(null); }
  }, [JSON.stringify(body), filters.excludePrinted, filters.onlyWithPhoto, filters.excludeIds.join(','), refreshKey, kind.basePath, ready]);
  useEffect(() => { load(); }, [load]);
  const toggle = (id: string) => onChange({ ...filters, excludeIds: filters.excludeIds.includes(id) ? filters.excludeIds.filter((x) => x !== id) : [...filters.excludeIds, id] });
  const s = d?.summary;
  const rows: any[] = (d?.rows || []).filter((r: any) => only === 'all' || (only === 'included' ? r.included : !r.included));
  return (
    <div style={{ direction: 'rtl', marginTop: 10, border: '1px solid #b2dfdb', borderRadius: 10, padding: 10, backgroundColor: '#f1fbfa' }} data-testid="print-batch-preview">
      <div style={{ fontSize: 13, fontWeight: 800, color: '#00695c', marginBottom: 6 }}>🧾 الدفعة الحالية — بدون تكرار</div>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, cursor: 'pointer', marginBottom: 4 }}><input type="checkbox" checked={filters.excludePrinted} onChange={(e) => onChange({ ...filters, excludePrinted: e.target.checked })} data-testid="print-exclude-printed" /> استبعاد من طُبعت بطاقته في دفعة سابقة</label>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, cursor: 'pointer' }}><input type="checkbox" checked={filters.onlyWithPhoto} onChange={(e) => onChange({ ...filters, onlyWithPhoto: e.target.checked })} data-testid="print-only-photo" /> فقط من لديه صورة معتمدة (من لا صورة له يُؤجَّل)</label>
      {s && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }} data-testid="print-batch-summary">
          <Badge color="#00796b" testID="print-batch-included">سيُطبع: {s.included} → {s.pages} ورقة</Badge>
          {s.excluded_printed ? <Badge color="#7c3aed">طُبعوا سابقاً: {s.excluded_printed}</Badge> : null}
          {s.excluded_no_photo ? <Badge color="#d97706">بانتظار الصورة: {s.excluded_no_photo}</Badge> : null}
          {s.excluded_manual ? <Badge color="#64748b">مستبعد يدوياً: {s.excluded_manual}</Badge> : null}
          <span style={{ flex: 1 }} />
          <button onClick={() => setOpen(!open)} style={btn('#e0f2f1', '#00695c', { padding: '4px 10px', fontSize: 11.5 })} data-testid="print-batch-toggle-list">{open ? 'إخفاء القائمة' : `عرض القائمة (${s.total})`}</button>
        </div>
      )}
      {s && open && (
        <>
          <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
            {([['all', 'الكل'], ['included', 'سيُطبع'], ['excluded', 'مستبعد']] as const).map(([k, l]) => <button key={k} onClick={() => setOnly(k)} style={btn(only === k ? '#00695c' : '#fff', only === k ? '#fff' : '#00695c', { padding: '3px 10px', fontSize: 11.5, border: '1px solid #b2dfdb' })}>{l}</button>)}
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto', marginTop: 6, backgroundColor: '#fff', borderRadius: 8 }}>
            <table style={table} data-testid="print-batch-table">
              <thead><tr style={{ backgroundColor: '#f8fafc', position: 'sticky', top: 0 }}>{['', kind.entity, kind.metaHeader, 'الصورة', 'الحالة'].map((h, i) => <th key={i} style={{ ...td, fontSize: 11, color: '#64748b', padding: '6px 6px' }}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: r.included ? 1 : 0.65 }} data-testid={`print-batch-row-${r.id}`}>
                    <td style={{ ...td, padding: '4px 6px' }}><input type="checkbox" checked={!filters.excludeIds.includes(r.id)} disabled={!!r.reason && r.reason !== 'مستبعد يدوياً'} onChange={() => toggle(r.id)} title={`إلغاء التحديد لاستبعاد هذا ${kind.entity} من الدفعة`} data-testid={`print-batch-check-${r.id}`} /></td>
                    <td style={{ ...td, padding: '4px 6px', fontSize: 12 }}><b>{r.full_name}</b><div style={{ fontSize: 10.5, color: '#94a3b8' }}>{kind.sub(r)}</div></td>
                    <td style={{ ...td, padding: '4px 6px', fontSize: 11.5 }}>{kind.meta(r)}</td>
                    <td style={{ ...td, padding: '4px 6px' }}>{r.has_photo ? <Badge color="#16a34a">معتمدة</Badge> : <Badge color="#d97706">لا توجد</Badge>}</td>
                    <td style={{ ...td, padding: '4px 6px', fontSize: 11.5 }}>{r.included ? <Badge color="#00796b">🆕 سيُطبع</Badge> : <span style={{ color: r.reason.startsWith('طُبعت') ? '#7c3aed' : '#92400e' }}>{r.reason}</span>}</td>
                  </tr>))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

/** 📚 الدفعات السابقة: إعادة تنزيل + تقرير Excel */
export const PrintBatchesHistory: React.FC<{ refreshKey: number; reportParams: any; kind?: PrintKind; reportEnabled?: boolean; onReset?: (b: any) => Promise<void> }> = ({ refreshKey, reportParams, kind = STUDENT_KIND, reportEnabled, onReset }) => {
  const [items, setItems] = useState<any[]>([]);
  const [busy, setBusy] = useState<number | string | null>(null);
  useEffect(() => { api.get(`${kind.basePath}/batches`).then((r) => setItems(r.data.items || [])).catch(() => setItems([])); }, [refreshKey, kind.basePath]);
  const dl = async (res: any, fallback: string) => { const url = URL.createObjectURL(new Blob([res.data])); const a = document.createElement('a'); a.href = url; a.download = filenameFromResponse(res, fallback); a.click(); URL.revokeObjectURL(url); };
  const redownload = async (b: any) => { setBusy(b.batch_no); try { await dl(await api.post(`${kind.basePath}/batch-pdf`, { reprint_batch_no: b.batch_no, orientation: b.orientation || 'auto', base_url: window.location.origin }, { responseType: 'blob', timeout: 300000 }), `${kind.fileLabel} - دفعة ${b.batch_no}.pdf`); } catch (e) { alertErr(e); } finally { setBusy(null); } };
  const backs = async (b: any) => { setBusy(`b${b.batch_no}`); try { await dl(await api.post(`${kind.basePath}/batch-back-pdf`, { batch_no: b.batch_no, orientation: b.orientation || 'auto' }, { responseType: 'blob', timeout: 300000 }), `خلفيات دفعة ${b.batch_no}.pdf`); } catch (e) { alertErr(e); } finally { setBusy(null); } };
  const report = async () => { setBusy('report'); try { await dl(await api.get(`${kind.basePath}/print-report`, { params: reportParams, responseType: 'blob' }), 'تقرير طباعة البطاقات.xlsx'); } catch (e) { alertErr(e); } finally { setBusy(null); } };
  return (
    <div style={{ direction: 'rtl', marginTop: 14, border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, backgroundColor: '#fff' }} data-testid="print-batches-history">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#0f2440', flex: 1 }}>📚 الدفعات السابقة ({items.length})</div>
        <button onClick={report} disabled={busy === 'report' || (reportEnabled === undefined ? (!reportParams.department_id && !reportParams.faculty_id) : !reportEnabled)} style={btn('#1b5e20', '#fff', { padding: '5px 10px', fontSize: 11.5 })} data-testid="print-report-btn">📥 تقرير حالة الطباعة (Excel)</button>
      </div>
      {items.length === 0 ? <div style={{ fontSize: 12, color: '#94a3b8' }}>لا توجد دفعات بعد — أول تنزيل PDF يُسجَّل كدفعة #1</div> : (
        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
          <table style={table}>
            <thead><tr style={{ backgroundColor: '#f8fafc' }}>{['#', 'التاريخ', ...kind.histHeaders, 'العدد', 'بواسطة', ''].map((h, i) => <th key={i} style={{ ...td, fontSize: 11, color: '#64748b', padding: '6px' }}>{h}</th>)}</tr></thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.batch_no} style={{ borderBottom: '1px solid #f1f5f9' }} data-testid={`print-batch-hist-${b.batch_no}`}>
                  <td style={{ ...td, padding: '5px 6px', fontWeight: 800 }}>#{b.batch_no}</td>
                  <td style={{ ...td, padding: '5px 6px', fontSize: 11.5 }}>{fmtDT(b.created_at)}</td>
                  {kind.histCols(b).map((v, i) => <td key={i} style={{ ...td, padding: '5px 6px', fontSize: 12 }}>{v}</td>)}
                  <td style={{ ...td, padding: '5px 6px', fontSize: 12 }}>{b.count} ({b.pages} ورقة)</td>
                  <td style={{ ...td, padding: '5px 6px', fontSize: 11.5 }}>{b.by_name}</td>
                  <td style={{ ...td, padding: '5px 6px' }}><button onClick={() => redownload(b)} disabled={busy === b.batch_no} style={btn('#e3f2fd', '#1565c0', { padding: '4px 10px', fontSize: 11.5 })} data-testid={`print-batch-redl-${b.batch_no}`}>{busy === b.batch_no ? '...' : '⬇️ إعادة تنزيل'}</button> <button onClick={() => backs(b)} disabled={busy === `b${b.batch_no}`} style={btn('#fff3e0', '#e65100', { padding: '4px 10px', fontSize: 11.5 })} data-testid={`print-batch-back-${b.batch_no}`}>{busy === `b${b.batch_no}` ? '...' : '🔄 خلفيات'}</button>{onReset && !b.reset_at && <> <button onClick={async () => { if (!window.confirm(`إلغاء وسم «مطبوع» عن موظفي الدفعة #${b.batch_no}؟ سيعودون للظهور في الدفعات القادمة.`)) return; setBusy(`r${b.batch_no}`); try { await onReset(b); setItems((await api.get(`${kind.basePath}/batches`)).data.items || []); } catch (e) { alertErr(e); } finally { setBusy(null); } }} disabled={busy === `r${b.batch_no}`} style={btn('#f1f5f9', '#475569', { padding: '4px 10px', fontSize: 11.5 })} data-testid={`print-batch-reset-${b.batch_no}`}>{busy === `r${b.batch_no}` ? '...' : '↩️ إلغاء الوسم'}</button></>}{b.reset_at && <Badge color="#94a3b8">أُلغي الوسم</Badge>}</td>
                </tr>))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

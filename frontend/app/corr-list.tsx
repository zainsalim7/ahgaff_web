import React, { useEffect, useState, useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { corrAPI, errMsg, STATUS_AR, STATUS_COLOR, PRIORITY_AR, CLASS_AR } from '../src/services/corrAPI';
import { CorrPage, card, btn, inp, th, td, Badge, Empty, useCorrMe } from '../src/components/corr/CorrUI';
import CorrCreateModal from '../src/components/corr/CorrCreateModal';

export default function CorrList() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mine?: string; status?: string }>();
  const { me } = useCorrMe();
  const mine = params.mine === '1';
  const [orgs, setOrgs] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [filters, setFilters] = useState<any>({ organization_id: '', include_children: false, status: params.status || '', document_type_id: '', year: '', official_number: '', priority: '', security_classification: '', date_from: '', date_to: '', q: '' });
  const [data, setData] = useState<any>({ items: [], total: 0, page: 1, page_size: 20 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [create, setCreate] = useState(false);

  useEffect(() => { corrAPI.organizations().then((r) => setOrgs(r.data)).catch(() => {}); corrAPI.documentTypes().then((r) => setTypes(r.data)).catch(() => {}); }, []);
  useEffect(() => { setFilters((p: any) => ({ ...p, status: params.status || '' })); setPage(1); }, [params.status, params.mine]);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const p: any = { page, page_size: 20, mine };
      Object.entries(filters).forEach(([k, v]) => { if (v !== '' && v !== false) p[k] = v; });
      if (mine && !filters.status) p.status = 'DRAFT,CHANGES_REQUESTED,REJECTED,SUBMITTED,UNDER_REVIEW';
      const r = await corrAPI.list(p);
      setData(r.data);
    } catch (e) { setErr(errMsg(e)); } finally { setLoading(false); }
  }, [filters, page, mine]);
  useEffect(() => { load(); }, [load]);

  const set = (k: string, v: any) => { setFilters((p: any) => ({ ...p, [k]: v })); setPage(1); };
  const pages = Math.max(1, Math.ceil(data.total / data.page_size));
  const canCreate = me && (me.is_super || me.can_create_in === 'ALL' || (me.can_create_in as string[]).length > 0);

  return (
    <CorrPage title={mine ? 'مسوداتي' : 'سجل المراسلات'} subtitle={`${data.total} مراسلة ضمن نطاقك`} testID="corr-list"
      actions={canCreate ? <button onClick={() => setCreate(true)} style={btn('#16a34a')} data-testid="corr-new-btn">+ مراسلة جديدة</button> : null}>
      <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }} data-testid="corr-filters">
        <input style={inp} placeholder="بحث بالموضوع/الرقم" value={filters.q} onChange={(e) => set('q', e.target.value)} data-testid="corr-filter-q" />
        <select style={inp} value={filters.organization_id} onChange={(e) => set('organization_id', e.target.value)} data-testid="corr-filter-org"><option value="">كل المنظمات</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name_ar}</option>)}</select>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={filters.include_children} onChange={(e) => set('include_children', e.target.checked)} /> شمول المنظمات الفرعية</label>
        <select style={inp} value={filters.status} onChange={(e) => set('status', e.target.value)} data-testid="corr-filter-status"><option value="">كل الحالات</option>{Object.entries(STATUS_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select style={inp} value={filters.document_type_id} onChange={(e) => set('document_type_id', e.target.value)}><option value="">كل الأنواع</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name_ar}</option>)}</select>
        <input style={inp} placeholder="سنة الترقيم" value={filters.year} onChange={(e) => set('year', e.target.value.replace(/\D/g, ''))} />
        <input style={inp} placeholder="الرقم الرسمي" value={filters.official_number} onChange={(e) => set('official_number', e.target.value)} data-testid="corr-filter-number" />
        <select style={inp} value={filters.priority} onChange={(e) => set('priority', e.target.value)}><option value="">كل الأولويات</option>{Object.entries(PRIORITY_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select style={inp} value={filters.security_classification} onChange={(e) => set('security_classification', e.target.value)}><option value="">كل التصنيفات</option>{Object.entries(CLASS_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input style={inp} type="date" value={filters.date_from} onChange={(e) => set('date_from', e.target.value)} />
        <input style={inp} type="date" value={filters.date_to} onChange={(e) => set('date_to', e.target.value)} />
      </div>
      {!!err && <div style={{ ...card, color: '#b91c1c' }}>{err}</div>}
      {!loading && data.items.length === 0 && <Empty text="لا توجد مراسلات مطابقة ضمن نطاقك" />}
      {data.items.length > 0 && (
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="corr-table">
            <thead><tr><th style={th}>الرقم الرسمي</th><th style={th}>الموضوع</th><th style={th}>النوع</th><th style={th}>المنظمة</th><th style={th}>الحالة</th><th style={th}>الأولوية</th><th style={th}>التصنيف</th><th style={th}>المنشئ</th><th style={th}>التاريخ</th></tr></thead>
            <tbody>
              {data.items.map((c: any) => (
                <tr key={c.id} onClick={() => router.push(`/corr-details?id=${c.id}` as any)} style={{ cursor: 'pointer' }} data-testid={`corr-row-${c.id}`}>
                  <td style={{ ...td, fontFamily: 'monospace', fontWeight: 800, color: c.official_number ? '#0f766e' : '#94a3b8' }}>{c.official_number || `مسودة · ${c.uuid.slice(0, 8)}`}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{c.subject}</td>
                  <td style={td}>{c.document_type_name}</td>
                  <td style={td}>{c.organization_name}</td>
                  <td style={td}><Badge text={STATUS_AR[c.status] || c.status} color={STATUS_COLOR[c.status] || '#64748b'} /></td>
                  <td style={td}>{PRIORITY_AR[c.priority] || c.priority}</td>
                  <td style={td}>{CLASS_AR[c.security_classification] || c.security_classification}</td>
                  <td style={td}>{c.created_by_name}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{String(c.created_at).slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', direction: 'rtl' }} data-testid="corr-pagination">
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} style={btn('#0f2440', { opacity: page <= 1 ? 0.4 : 1 })} data-testid="corr-page-prev">السابق</button>
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>صفحة {page} من {pages}</span>
        <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} style={btn('#0f2440', { opacity: page >= pages ? 0.4 : 1 })} data-testid="corr-page-next">التالي</button>
      </div>
      {create && <CorrCreateModal onClose={() => setCreate(false)} onCreated={(id) => { setCreate(false); router.push(`/corr-details?id=${id}` as any); }} />}
    </CorrPage>
  );
}

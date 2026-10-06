import React, { useEffect, useState, useCallback } from 'react';
import { corrAPI, errMsg, TPL_STATUS_AR } from '../src/services/corrAPI';
import { CorrPage, card, btn, inp, th, td, Badge, Denied, Empty, useCorrMe } from '../src/components/corr/CorrUI';
import { TemplateBuilder } from '../src/components/corr/TemplateBuilder';

export default function CorrTemplates() {
  const { me, hasAnywhere } = useCorrMe();
  const [data, setData] = useState<any>({ items: [], total: 0 });
  const [orgs, setOrgs] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [filters, setFilters] = useState({ organization_id: '', document_type_id: '', status: '' });
  const [builder, setBuilder] = useState<{ item: any | null } | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { corrAPI.organizations().then((r) => setOrgs(r.data)).catch(() => {}); corrAPI.documentTypes().then((r) => setTypes(r.data)).catch(() => {}); }, []);
  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try { const p: any = { page_size: 200 }; Object.entries(filters).forEach(([k, v]) => { if (v) p[k] = v; }); setData((await corrAPI.templates(p)).data); }
    catch (e) { setErr(errMsg(e)); } finally { setLoading(false); }
  }, [filters]);
  useEffect(() => { load(); }, [load]);

  const clone = async (t: any) => {
    const target = t.is_global && !hasAnywhere('template.manage_global') ? window.prompt('معرّف الجهة المستهدفة للنسخة (اتركه فارغاً لنسخة عامة إن كنت مخوّلاً):', orgs[0]?.id || '') : undefined;
    try { const r = await corrAPI.cloneTemplate(t.id, target || undefined); load(); setBuilder({ item: r.data }); } catch (e) { setErr(errMsg(e, 'فشل الاستنساخ')); }
  };
  const deactivate = async (t: any) => { if (!window.confirm(`إيقاف القالب «${t.name_ar}»؟ لن يظهر للكتّاب لكن المراسلات القائمة لا تتأثر.`)) return; try { await corrAPI.deactivateTemplate(t.id); load(); } catch (e) { setErr(errMsg(e)); } };
  const typeName = (id: string) => types.find((x) => x.id === id)?.name_ar || '—';

  if (me && !hasAnywhere('template.read') && !hasAnywhere('template.use')) return <CorrPage title="القوالب"><Denied /></CorrPage>;
  const canCreate = hasAnywhere('template.create') || hasAnywhere('template.manage_global');
  const canSeed = hasAnywhere('template.manage_global');
  const seedDefaults = async () => { try { const r = await corrAPI.seedDefaultTemplates(); window.alert(r.data.message); load(); } catch (e) { setErr(errMsg(e, 'فشل استعادة القوالب الجاهزة')); } };
  return (
    <CorrPage title="قوالب الخطابات الذكية" subtitle="إصدارات غير قابلة للتغيير بعد النشر · أقسام بأنماط تحرير · عناصر نائبة مُصرَّح بها فقط" loading={loading && !builder} testID="corr-templates-page"
      actions={!builder ? <div style={{ display: 'flex', gap: 8 }}>
        {canSeed && <button onClick={seedDefaults} style={btn('#f1f5f9', { color: '#0f2440' })} title="يضيف القوالب الجاهزة الناقصة (قرار تكليف جماعي، كشف طلاب، تشكيل لجنة…) دون المساس بالموجود" data-testid="tpl-seed-defaults">✨ القوالب الجاهزة</button>}
        {canCreate && <button onClick={() => setBuilder({ item: null })} style={btn('#16a34a')} data-testid="tpl-add">+ قالب</button>}
      </div> : null}>
      {!!err && <div style={{ ...card, color: '#b91c1c' }} data-testid="tpl-page-error">{err}</div>}
      {builder ? (
        <div style={card}><TemplateBuilder item={builder.item} onClose={() => setBuilder(null)} onSaved={load} orgs={orgs} types={types} /></div>
      ) : (<>
        <div style={{ ...card, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select style={{ ...inp, width: 260 }} value={filters.organization_id} onChange={(e) => setFilters({ ...filters, organization_id: e.target.value })} data-testid="tpl-filter-org"><option value="">كل الجهات (+ العامة)</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name_ar}</option>)}</select>
          <select style={{ ...inp, width: 220 }} value={filters.document_type_id} onChange={(e) => setFilters({ ...filters, document_type_id: e.target.value })} data-testid="tpl-filter-type"><option value="">كل أنواع الوثائق</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name_ar}</option>)}</select>
          <select style={{ ...inp, width: 160 }} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} data-testid="tpl-filter-status"><option value="">كل الحالات</option>{Object.entries(TPL_STATUS_AR).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          <span style={{ fontSize: 12, color: '#64748b', alignSelf: 'center' }} data-testid="tpl-count">{data.total} قالب</span>
        </div>
        {data.items.length === 0 ? <Empty text="لا توجد قوالب" /> : (
          <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="tpl-table">
              <thead><tr><th style={th}>الكود</th><th style={th}>الاسم</th><th style={th}>نوع الوثيقة</th><th style={th}>النطاق</th><th style={th}>الإصدار</th><th style={th}>التجميد</th><th style={th}>الحالة</th><th style={th}></th></tr></thead>
              <tbody>{data.items.map((t: any) => (
                <tr key={t.id} data-testid={`tpl-row-${t.code}`} style={{ opacity: t.status === 'INACTIVE' ? 0.55 : 1 }}>
                  <td style={td}><code>{t.code}</code></td><td style={{ ...td, fontWeight: 700 }}>{t.name_ar}<div style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>{t.description}</div></td>
                  <td style={td}>{typeName(t.document_type_id)}</td>
                  <td style={td}>{t.is_global ? <Badge text="عام" color="#7c3aed" /> : orgs.find((o) => o.id === t.organization_id)?.name_ar || '—'}</td>
                  <td style={td}>v{t.current_version}</td><td style={td}><Badge text={{ ISSUED: 'الإصدار', SIGNED: 'التوقيع', APPROVED: 'الاعتماد' }[t.freeze_stage as string] || t.freeze_stage} color="#0f766e" /></td>
                  <td style={td}><Badge text={TPL_STATUS_AR[t.status]?.label || t.status} color={TPL_STATUS_AR[t.status]?.color || '#64748b'} testID={`tpl-status-${t.code}`} /></td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button onClick={() => setBuilder({ item: t })} style={btn('#1565c0', { padding: '4px 10px', marginLeft: 4 })} data-testid={`tpl-open-${t.code}`}>فتح</button>
                    {hasAnywhere('template.clone') && <button onClick={() => clone(t)} style={btn('#7c3aed', { padding: '4px 10px', marginLeft: 4 })} data-testid={`tpl-clone-${t.code}`}>استنساخ</button>}
                    {t.status !== 'INACTIVE' && hasAnywhere('template.deactivate') && !(t.is_global && !hasAnywhere('template.manage_global')) && <button onClick={() => deactivate(t)} style={btn('#dc2626', { padding: '4px 10px' })} data-testid={`tpl-deactivate-${t.code}`}>إيقاف</button>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </>)}
    </CorrPage>
  );
}

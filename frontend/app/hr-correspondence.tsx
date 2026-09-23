import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { goBack } from '../src/utils/navigation';
import { hrAPI } from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';
import { ReportHero, ReportKpis, ReportEmpty, reportPage } from '../src/components/reports/ReportShell';
import { Badge, Th, td, table, inp, btn, opt, alertErr, fmtDT, Drawer, CORR_COLOR, CORR_STATUS_COLOR } from '../src/components/hr/ui';
import { CorrFormModal } from '../src/components/hr/CorrFormModal';

const YEAR = new Date().getFullYear();

export default function HrCorrespondence() {
  const { hasPermission, user } = useAuth();
  const canManage = user?.role === 'admin' || hasPermission('hr_manage_correspondence');
  const [meta, setMeta] = useState<any>(null);
  const [units, setUnits] = useState<any[]>([]);
  const [q, setQ] = useState({ search: '', direction: '', status: '', priority: '', year: String(YEAR), page: 1 });
  const [data, setData] = useState<any>({ items: [], total: 0, stats: {} });
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ open: boolean; item: any | null }>({ open: false, item: null });
  const [detail, setDetail] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData((await hrAPI.corrList({ ...Object.fromEntries(Object.entries(q).filter(([, v]) => v)), per_page: 40 })).data); } catch { setData({ items: [], total: 0, stats: {} }); }
    finally { setLoading(false); }
  }, [q]);
  useEffect(() => { hrAPI.corrMeta().then((r) => setMeta(r.data)).catch(() => {}); hrAPI.orgUnits().then((r) => setUnits(r.data.units || [])).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const setQ1 = (k: string) => (e: any) => setQ((p) => ({ ...p, [k]: e.target.value, page: 1 }));
  const openDetail = async (id: string) => { try { setDetail((await hrAPI.corr(id)).data); } catch (e) { alertErr(e); } };
  const done = (msg: string) => { window.alert(msg); load(); if (detail) openDetail(detail.id); };
  const changeStatus = async (c: any, status: string) => { const note = window.prompt(`تغيير الحالة إلى «${meta.statuses[status]}» — ملاحظة (اختياري):`, '') ; if (note === null) return; try { const r = await hrAPI.setCorrStatus(c.id, status, note); done(r.data.message); } catch (e) { alertErr(e); } };
  const remove = async (c: any) => { if (!window.confirm(`حذف المسودة ${c.ref_no}؟`)) return; try { const r = await hrAPI.deleteCorr(c.id); window.alert(r.data.message); setDetail(null); load(); } catch (e) { alertErr(e); } };

  const st = data.stats || {};
  return (
    <SafeAreaView style={reportPage.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={reportPage.content}>
        <ReportHero kicker="شؤون الموظفين" title="المراسلات والتعاميم" subtitle="سجل الوارد والصادر والمذكرات الداخلية والتعاميم بأرقام مرجعية تلقائية ومتابعة الحالة" onBack={() => goBack()} canExport={false} testID="hr-corr-hero" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', direction: 'rtl', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 300 }}>
            <ReportKpis items={[
              { label: `واردة ${YEAR}`, value: st.incoming || 0, color: CORR_COLOR.incoming, icon: 'mail' },
              { label: `صادرة ${YEAR}`, value: st.outgoing || 0, color: CORR_COLOR.outgoing, icon: 'send' },
              { label: `داخلية وتعاميم ${YEAR}`, value: st.internal || 0, color: CORR_COLOR.internal, icon: 'megaphone' },
              { label: 'قيد المعالجة', value: st.open || 0, color: '#f97316', icon: 'time' },
              { label: 'متأخرة عن الاستحقاق', value: st.overdue || 0, color: '#dc2626', icon: 'alert-circle' },
            ]} />
          </div>
        </div>
        {canManage && <div style={{ direction: 'rtl', marginBottom: 12 }}><button onClick={() => setForm({ open: true, item: null })} style={btn('#1565c0')} data-testid="corr-new-btn">+ مراسلة جديدة</button></div>}
        <View style={reportPage.card}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 0.8fr', gap: 8, direction: 'rtl' }}>
            <input placeholder="بحث بالموضوع / الرقم المرجعي / الجهة" value={q.search} onChange={setQ1('search')} style={inp} data-testid="corr-search" />
            <select value={q.direction} onChange={setQ1('direction')} style={inp} data-testid="corr-filter-direction"><option value="">كل الأنواع</option>{opt(meta?.directions)}</select>
            <select value={q.status} onChange={setQ1('status')} style={inp} data-testid="corr-filter-status"><option value="">كل الحالات</option>{opt(meta?.statuses)}</select>
            <select value={q.priority} onChange={setQ1('priority')} style={inp} data-testid="corr-filter-priority"><option value="">كل الأولويات</option>{opt(meta?.priorities)}</select>
            <select value={q.year} onChange={setQ1('year')} style={inp} data-testid="corr-filter-year"><option value="">كل السنوات</option>{[YEAR, YEAR - 1, YEAR - 2].map((y) => <option key={y} value={y}>{y}</option>)}</select>
          </div>
        </View>
        {loading ? <Text style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>جاري التحميل...</Text>
          : data.items.length === 0 ? <ReportEmpty text="لا توجد مراسلات مطابقة" icon="mail-outline" />
          : (
            <View style={[reportPage.card, { padding: 0, overflow: 'hidden' }]}>
              <table style={table} data-testid="corr-table">
                <Th cols={['الرقم المرجعي', 'النوع', 'الموضوع', 'الجهة / المستهدفون', 'التاريخ', 'الأولوية', 'الحالة', '']} />
                <tbody>
                  {data.items.map((c: any) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #eef2f7', cursor: 'pointer', backgroundColor: c.overdue ? '#fff5f5' : undefined }} onClick={() => openDetail(c.id)} data-testid={`corr-row-${c.id}`}>
                      <td style={{ ...td, fontWeight: 800, color: '#0f2440', direction: 'ltr', textAlign: 'right', fontFamily: 'monospace' }}>{c.ref_no}</td>
                      <td style={td}><Badge color={CORR_COLOR[c.direction]}>{c.direction_label}</Badge></td>
                      <td style={{ ...td, fontWeight: 700, color: '#0f2440', maxWidth: 320 }}>{c.subject}{c.tags?.length ? <div style={{ fontSize: 10.5, color: '#94a3b8' }}>{c.tags.map((t: string) => `#${t}`).join(' ')}</div> : null}</td>
                      <td style={{ ...td, fontSize: 12 }}>{c.to_all_employees ? 'جميع الموظفين' : c.to_unit_name || c.to_party || c.from_party || (c.to_employee_names?.length ? c.to_employee_names.slice(0, 2).join('، ') + (c.to_employee_names.length > 2 ? ` +${c.to_employee_names.length - 2}` : '') : '—')}</td>
                      <td style={{ ...td, direction: 'ltr', textAlign: 'right' }}>{c.date}{c.due_date ? <div style={{ fontSize: 10.5, color: c.overdue ? '#dc2626' : '#94a3b8' }}>استحقاق {c.due_date}</div> : null}</td>
                      <td style={td}>{c.priority !== 'normal' ? <Badge color={c.priority === 'urgent' ? '#dc2626' : '#7c3aed'}>{c.priority_label}</Badge> : <span style={{ color: '#94a3b8' }}>عادية</span>}</td>
                      <td style={td}><Badge color={CORR_STATUS_COLOR[c.status]}>{c.status_label}</Badge></td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }} onClick={(ev) => ev.stopPropagation()}>{canManage && <button onClick={() => setForm({ open: true, item: c })} style={btn('#e3f2fd', '#1565c0', { padding: '5px 10px', fontSize: 11.5 })} data-testid={`corr-edit-${c.id}`}>تعديل</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 10, direction: 'rtl', fontSize: 12, color: '#64748b' }}>
                <span data-testid="corr-total">الإجمالي: {data.total}</span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <button disabled={q.page <= 1} onClick={() => setQ((p) => ({ ...p, page: p.page - 1 }))} style={btn('#f1f5f9', '#0f2440', { padding: '5px 12px', fontSize: 12 })}>السابق</button>
                  <span style={{ padding: '5px 8px' }}>صفحة {q.page} من {Math.max(1, Math.ceil(data.total / 40))}</span>
                  <button disabled={q.page >= Math.ceil(data.total / 40)} onClick={() => setQ((p) => ({ ...p, page: p.page + 1 }))} style={btn('#f1f5f9', '#0f2440', { padding: '5px 12px', fontSize: 12 })}>التالي</button>
                </span>
              </div>
            </View>
          )}
      </ScrollView>

      {form.open && <CorrFormModal meta={meta} units={units} item={form.item} onClose={() => setForm({ open: false, item: null })} onSaved={done} />}
      {detail && (
        <Drawer onClose={() => setDetail(null)} testID="corr-detail" width={520}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div><div style={{ fontSize: 12, color: '#64748b', direction: 'ltr', textAlign: 'right', fontFamily: 'monospace' }}>{detail.ref_no}</div><div style={{ fontSize: 17, fontWeight: 800, color: '#0f2440' }}>{detail.subject}</div></div>
            <button onClick={() => setDetail(null)} style={btn('#f1f5f9', '#0f2440', { padding: '4px 10px' })} data-testid="corr-detail-close">✕</button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><Badge color={CORR_COLOR[detail.direction]}>{detail.direction_label}</Badge><Badge color={CORR_STATUS_COLOR[detail.status]}>{detail.status_label}</Badge>{detail.priority !== 'normal' && <Badge color={detail.priority === 'urgent' ? '#dc2626' : '#7c3aed'}>{detail.priority_label}</Badge>}{detail.overdue && <Badge color="#dc2626">متأخرة</Badge>}</div>
          {detail.body && <div style={{ marginTop: 12, backgroundColor: '#f7f9fc', borderRadius: 10, padding: 12, fontSize: 13, lineHeight: 1.9, whiteSpace: 'pre-wrap', color: '#334155' }} data-testid="corr-detail-body">{detail.body}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12, fontSize: 12.5 }}>
            {[['التاريخ', detail.date], ['الاستحقاق', detail.due_date], ['من', detail.from_party], ['إلى', detail.to_party], ['الوحدة المستهدفة', detail.to_unit_name], ['المستهدفون', detail.to_all_employees ? 'جميع الموظفين' : detail.to_employee_names?.join('، ')], ['موظف معنيّ', detail.related_employee_name], ['مرجع خارجي', detail.external_ref], ['سجّلها', detail.created_by_name], ['وقت التسجيل', fmtDT(detail.created_at)], ['إشعارات أُرسلت لـ', detail.recipients_count !== undefined ? `${detail.recipients_count} موظف` : ''], ['إقرارات الاستلام', detail.ack_count]].filter(([, v]) => v !== '' && v !== undefined && v !== null).map(([l, v]) => (
              <div key={l as string} style={{ backgroundColor: '#f7f9fc', borderRadius: 8, padding: '7px 10px' }}><div style={{ fontSize: 10.5, color: '#94a3b8' }}>{l}</div><div style={{ fontWeight: 700, color: '#0f2440' }}>{String(v)}</div></div>
            ))}
          </div>
          {detail.attachment_url && <a href={detail.attachment_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 10, fontSize: 12.5, color: '#1565c0', fontWeight: 700 }} data-testid="corr-attachment-link">📎 فتح المرفق</a>}
          {canManage && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#5b6678', marginBottom: 6 }}>تغيير الحالة</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {Object.entries(meta?.statuses || {}).filter(([k]) => k !== detail.status).map(([k, v]: any) => <button key={k} onClick={() => changeStatus(detail, k)} style={btn(CORR_STATUS_COLOR[k] + '18', CORR_STATUS_COLOR[k], { padding: '6px 12px', fontSize: 12 })} data-testid={`corr-status-${k}`}>{v}</button>)}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                <button onClick={() => { setForm({ open: true, item: detail }); }} style={btn('#1565c0')} data-testid="corr-detail-edit">تعديل</button>
                {detail.status === 'draft' && <button onClick={() => remove(detail)} style={btn('#ffebee', '#c62828')} data-testid="corr-detail-delete">حذف المسودة</button>}
              </div>
            </div>
          )}
          {detail.acknowledgements?.length > 0 && <div style={{ marginTop: 14 }}><div style={{ fontSize: 12, fontWeight: 800, color: '#5b6678', marginBottom: 4 }}>أقرّ بالاستلام ({detail.acknowledgements.length})</div>{detail.acknowledgements.map((a: any, i: number) => <div key={i} style={{ fontSize: 11.5, color: '#475569', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>{a.name} · {fmtDT(a.at)}</div>)}</div>}
          {detail.history?.length > 0 && <div style={{ marginTop: 14 }}><div style={{ fontSize: 12, fontWeight: 800, color: '#5b6678', marginBottom: 4 }}>سجل الحركة</div>{detail.history.map((h: any, i: number) => <div key={i} style={{ fontSize: 11.5, color: '#475569', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}><b>{({ created: 'تسجيل', updated: 'تعديل', status: 'تغيير الحالة' } as any)[h.action] || h.action}</b>{h.status ? ` → ${meta?.statuses?.[h.status] || h.status}` : ''} · {h.by_name} · {fmtDT(h.at)}{h.note ? <div style={{ color: '#94a3b8' }}>{h.note}</div> : null}</div>)}</div>}
        </Drawer>
      )}
    </SafeAreaView>
  );
}

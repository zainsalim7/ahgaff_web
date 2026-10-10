import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { goBack } from '../src/utils/navigation';
import api, { hrAPI } from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';
import { ReportHero, reportPage } from '../src/components/reports/ReportShell';
import { btn, alertErr, Tabs, Badge, inp } from '../src/components/hr/ui';
import { HrSelect, optsFromMap } from '../src/components/hr/HrSelect';
import { PrintBatchPreview, PrintBatchesHistory, PrintFilters, EMPLOYEE_KIND } from '../src/components/cards/PrintBatches';
import { BackPrintControls } from '../src/components/cards/CardBack';
import { HrCardDesign } from '../src/components/hr/HrCardDesign';
import { filenameFromResponse } from '../src/utils/exportName';

const DEFAULTS: Record<string, number> = { card_w: 85.6, card_h: 54, card1_x: 62, card1_y: 40, card2_x: 62, card2_y: 180 };
const SCALE = 2.2;
const A4W = 210 * SCALE, A4H = 297 * SCALE;

/** 🖨️ طباعة بطاقات الموظفين دفعة واحدة — بنفس أسلوب بطاقات الطلاب */
export default function HrCardPrint() {
  const { hasPermission, user } = useAuth();
  const canManage = user?.role === 'admin' || hasPermission('hr_manage_employees');
  const params = useLocalSearchParams<{ ids?: string }>();
  const selIds = useMemo(() => (params.ids ? String(params.ids).split(',').filter(Boolean) : []), [params.ids]);
  const idsMode = selIds.length > 0;

  const [tab, setTab] = useState<'print' | 'design'>('print');
  const [units, setUnits] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [emps, setEmps] = useState<any[]>([]);
  const [template, setTemplate] = useState('green');
  const [f, setF] = useState({ org_unit_id: '', category: '', status: '', q: '' });
  const [st, setSt] = useState<Record<string, string>>(Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, String(v)])));
  const [orientation, setOrientation] = useState('auto');
  const [pf, setPf] = useState<PrintFilters>({ excludePrinted: true, onlyWithPhoto: true, excludeIds: [] });
  const [summary, setSummary] = useState<any>(null);
  const [batchKey, setBatchKey] = useState(0);
  const [lastBatchNo, setLastBatchNo] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    hrAPI.orgUnits().then((r) => setUnits(r.data.units || [])).catch(() => {});
    hrAPI.meta().then((r) => setMeta(r.data)).catch(() => {});
    api.get('/hr/cards/print-settings').then((r) => { const d = r.data || {}; setSt((p) => ({ ...p, ...Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, String(d[k] ?? DEFAULTS[k])])) })); if (d.orientation) setOrientation(d.orientation); }).catch(() => {});
    api.get('/hr/card-settings').then((r) => setTemplate(r.data?.template || 'green')).catch(() => {});
    api.post('/hr/cards/batch-preview', {}).then((r) => setEmps(r.data.rows || [])).catch(() => {});
  }, []);

  const unitOpts = useMemo(() => {
    const byParent: Record<string, any[]> = {};
    units.forEach((u) => { (byParent[u.parent_id || 'root'] ||= []).push(u); });
    const out: { value: string; label: string; sub?: string }[] = [];
    const walk = (pid: string, depth: number) => (byParent[pid] || []).forEach((u) => { out.push({ value: u.id, label: `${'— '.repeat(depth)}${u.name}`, sub: `${u.type_label || ''}${u.employees_count ? ` · ${u.employees_count} موظف` : ''}` }); walk(u.id, depth + 1); });
    walk('root', 0);
    units.filter((u) => u.parent_id && !units.some((x) => x.id === u.parent_id)).forEach((u) => { out.push({ value: u.id, label: u.name, sub: u.type_label }); walk(u.id, 1); });
    return out;
  }, [units]);

  const body = idsMode ? { employee_ids: selIds } : f;
  const n = (k: string) => parseFloat(st[k]) || 0;
  const templatePortrait = template !== 'horizontal';
  const portrait = orientation === 'auto' ? templatePortrait : orientation === 'portrait';
  const pw = portrait ? n('card_h') : n('card_w');
  const ph = portrait ? n('card_w') : n('card_h');

  const download = useCallback(async () => {
    setDownloading(true); setMsg('');
    try {
      const settings: any = {}; Object.keys(DEFAULTS).forEach((k) => { settings[k] = parseFloat(st[k]) || DEFAULTS[k]; });
      const res = await api.post('/hr/cards/batch-pdf', { ...body, base_url: window.location.origin, orientation, settings, exclude_printed: pf.excludePrinted, only_with_photo: pf.onlyWithPhoto, exclude_ids: pf.excludeIds }, { responseType: 'blob', timeout: 300000 });
      const url = URL.createObjectURL(new Blob([res.data])); const a = document.createElement('a'); a.href = url; a.download = filenameFromResponse(res, 'بطاقات الموظفين.pdf'); a.click(); URL.revokeObjectURL(url);
      const bn = res.headers?.['x-batch-no']; const bc = res.headers?.['x-batch-count'];
      setMsg(bn ? `✅ تم إنشاء الملف — سُجّلت الدفعة #${bn} (${bc} بطاقة) ووُسم الموظفون كمطبوعين، ولن يتكرروا في الدفعات القادمة` : '✅ تم إنشاء الملف');
      setPf((p) => ({ ...p, excludeIds: [] }));
      if (bn) setLastBatchNo(Number(bn));
      setBatchKey((k) => k + 1);
    } catch (e: any) {
      let detail = e?.response?.data?.detail;
      if (e?.response?.data instanceof Blob) { try { detail = JSON.parse(await e.response.data.text()).detail; } catch { /* ignore */ } }
      setMsg(detail || 'فشل إنشاء الملف');
    } finally { setDownloading(false); }
  }, [body, st, orientation, pf]);

  const numField = (label: string, k: string) => (
    <div key={k} style={{ flex: 1, minWidth: 100 }}>
      <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 3 }}>{label}</div>
      <input value={st[k]} onChange={(e) => setSt((p) => ({ ...p, [k]: e.target.value.replace(/[^0-9.]/g, '') }))} inputMode="decimal" style={{ ...inp, direction: 'ltr', textAlign: 'center' }} data-testid={`hr-print-${k}-input`} />
    </div>
  );
  const sectionTitle = (t: string) => <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0f2440', margin: '12px 0 6px' }}>{t}</div>;
  const canDownload = canManage && !downloading && !!summary && summary.included > 0;

  return (
    <SafeAreaView style={reportPage.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={reportPage.content}>
        <ReportHero kicker="شؤون الموظفين" title="طباعة بطاقات الموظفين" subtitle="بطاقتان في كل ورقة A4 بمواضع بالملم تُحفظ تلقائياً — مع تتبّع الدفعات (لا تكرار)، فقط من لديه صورة معتمدة، الخلفيات، وسجل الدفعات." onBack={() => goBack()} canExport={false} testID="hr-card-print-hero" />
        <Tabs tabs={[{ key: 'print', label: '🖨️ الطباعة' }, { key: 'design', label: '🎨 تصميم البطاقة والخلفية' }]} value={tab} onChange={(k) => setTab(k as any)} testID="hr-print-tab" />

        {tab === 'design' && <View style={reportPage.card}><HrCardDesign emps={emps} canManage={canManage} onSaved={setTemplate} /></View>}

        {tab === 'print' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 14, direction: 'rtl' }}>
            <View style={reportPage.card}>
              {idsMode ? (
                <div style={{ backgroundColor: '#e3f2fd', color: '#1565c0', borderRadius: 10, padding: '8px 12px', fontSize: 12.5, fontWeight: 700 }} data-testid="hr-print-ids-mode">☑️ موظفون محددون من سجل الموظفين ({selIds.length}) — ستُطبع بطاقاتهم فقط</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: 8 }} data-testid="hr-print-filters">
                  <div style={{ gridColumn: 'span 3' }}><HrSelect value={f.org_unit_id} onChange={(v) => setF({ ...f, org_unit_id: v })} options={unitOpts} placeholder="كل الوحدات التنظيمية (مع الوحدات التابعة)" searchable allowClear testID="hr-print-unit" /></div>
                  <input placeholder="بحث بالاسم / الرقم الوظيفي / المسمى" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} style={inp} data-testid="hr-print-search" />
                  <HrSelect value={f.category} onChange={(v) => setF({ ...f, category: v })} options={optsFromMap(meta?.categories)} placeholder="كل الفئات" allowClear testID="hr-print-category" />
                  <HrSelect value={f.status} onChange={(v) => setF({ ...f, status: v })} options={optsFromMap(meta?.statuses)} placeholder="على رأس العمل (غير المنتهين)" allowClear testID="hr-print-status" />
                </div>
              )}

              <PrintBatchPreview body={body} filters={pf} onChange={setPf} refreshKey={batchKey} onSummary={setSummary} kind={EMPLOYEE_KIND} ready />

              {sectionTitle('اتجاه البطاقة في الورقة')}
              <div style={{ display: 'flex', gap: 6 }}>
                {[{ key: 'auto', label: 'تلقائي (حسب القالب)' }, { key: 'portrait', label: 'عمودي ↕' }, { key: 'landscape', label: 'أفقي ↔' }].map((o) => (
                  <button key={o.key} onClick={() => setOrientation(o.key)} style={btn(orientation === o.key ? '#0f2440' : '#f1f5f9', orientation === o.key ? '#fff' : '#0f2440', { padding: '6px 12px', fontSize: 12 })} data-testid={`hr-orientation-${o.key}-btn`}>{o.label}</button>
                ))}
              </div>
              {orientation !== 'auto' && portrait !== templatePortrait && <div style={{ fontSize: 10.5, color: '#e65100', marginTop: 4 }}>ستُدار البطاقة 90° تلقائياً لتناسب هذا الاتجاه — دون تغيير تصميمها</div>}

              {sectionTitle('مقاس البطاقة (ملم)')}
              <div style={{ display: 'flex', gap: 8 }}>{numField('العرض', 'card_w')}{numField('الارتفاع', 'card_h')}</div>
              {sectionTitle('موضع البطاقة الأولى (العلوية)')}
              <div style={{ display: 'flex', gap: 8 }}>{numField('من اليسار (X)', 'card1_x')}{numField('من الأعلى (Y)', 'card1_y')}</div>
              {sectionTitle('موضع البطاقة الثانية (السفلية)')}
              <div style={{ display: 'flex', gap: 8 }}>{numField('من اليسار (X)', 'card2_x')}{numField('من الأعلى (Y)', 'card2_y')}</div>

              {msg ? <div style={{ fontSize: 12.5, color: msg.startsWith('✅') ? '#2e7d32' : '#c62828', margin: '10px 0 4px', lineHeight: 1.7 }} data-testid="hr-print-msg">{msg}</div> : null}
              <button onClick={download} disabled={!canDownload} style={btn('#00796b', '#fff', { width: '100%', marginTop: 10, padding: '12px', fontSize: 14, opacity: canDownload ? 1 : 0.55 })} data-testid="hr-batch-print-download-btn">
                {downloading ? 'جارٍ إنشاء الملف...' : summary ? `🖨️ تنزيل PDF للطباعة (${summary.included} بطاقة → ${summary.pages} ورقة)` : '🖨️ تنزيل PDF للطباعة'}
              </button>
              {!canManage && <div style={{ fontSize: 11.5, color: '#b45309', marginTop: 6 }}>الطباعة متاحة لمن يملك صلاحية إدارة الموظفين</div>}

              <BackPrintControls st={st} departmentId="" orientation={orientation} lastBatchNo={lastBatchNo} count={summary?.included || 0} basePath="/hr/cards" ready />
              <PrintBatchesHistory refreshKey={batchKey} reportParams={idsMode ? {} : { org_unit_id: f.org_unit_id || undefined, category: f.category || undefined, status: f.status || undefined }} kind={EMPLOYEE_KIND} reportEnabled onReset={canManage ? async (b) => { const r = await api.post(`/hr/cards/batches/${b.batch_no}/reset`); window.alert(r.data.message); setBatchKey((k) => k + 1); } : undefined} />
            </View>

            <View style={reportPage.card}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f2440', marginBottom: 4 }}>معاينة الورقة A4</div>
              <div style={{ fontSize: 10.5, color: '#5b6678', marginBottom: 8 }}>قالب البطاقة: {templatePortrait ? 'عمودي' : 'أفقي'} — الإخراج: {portrait ? 'بالطول ↕' : 'بالعرض ↔'} <Badge color="#1565c0">{template}</Badge></div>
              <div style={{ position: 'relative', width: A4W, height: A4H, maxWidth: '100%', backgroundColor: '#fff', border: '1px solid #cfd8dc', boxShadow: '0 4px 14px rgba(0,0,0,0.12)', margin: '0 auto' }} data-testid="hr-a4-preview">
                {[1, 2].map((i) => (
                  <div key={i} style={{ position: 'absolute', left: n(`card${i}_x`) * SCALE, top: n(`card${i}_y`) * SCALE, width: pw * SCALE, height: ph * SCALE, backgroundColor: i === 1 ? '#e0f2f1' : '#e3f2fd', border: `1.5px dashed ${i === 1 ? '#00796b' : '#1565c0'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }} data-testid={`hr-preview-card-${i}`}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: i === 1 ? '#00796b' : '#1565c0' }}>بطاقة {i}</div>
                    <div style={{ fontSize: 9, color: '#8a95a8' }}>{n(`card${i}_x`)}, {n(`card${i}_y`)} مم</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10.5, color: '#8a95a8', textAlign: 'center', marginTop: 6 }}>جرّب طباعة ورقة واحدة أولاً ثم عدّل الإزاحات حسب طابعتك</div>
              <Text style={{ fontSize: 11, color: '#64748b', textAlign: 'right', marginTop: 10, lineHeight: 18 }}>💡 لتغيير قالب البطاقة أو خطها أو تعليمات الخلفية انتقل إلى تبويب «تصميم البطاقة والخلفية».</Text>
            </View>
          </div>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

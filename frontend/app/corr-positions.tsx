import React, { useEffect, useState } from 'react';
import { corrAPI, errMsg } from '../src/services/corrAPI';
import { CorrPage, card, btn, inp, th, td, Badge, Modal, Field, Denied, useCorrMe } from '../src/components/corr/CorrUI';

const HONORIFICS = ['', 'الأستاذ الدكتور', 'الدكتور', 'الدكتورة', 'الأستاذ', 'الأستاذة', 'المهندس', 'الشيخ', 'معالي', 'سعادة', 'فضيلة', 'الأخ', 'الأخت'];
const SUFFIXES = ['المحترم', 'المحترمة', 'حفظه الله', 'حفظها الله', 'الموقر', 'وفقه الله', ''];
const empty = () => ({ title_ar: '', holder_name: '', honorific: '', kind: 'INTERNAL', organization_id: '', external_organization: '', recipient_suffix: 'المحترم', is_default_signer: false, is_active: true, sort_order: 50, notes: '' });

export default function CorrPositions() {
  const { me, hasAnywhere } = useCorrMe();
  const [items, setItems] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [form, setForm] = useState<any | null>(null);
  const [q, setQ] = useState('');
  const canManage = !!me && (me.is_super || hasAnywhere('organizations.manage'));

  const load = async () => {
    setLoading(true);
    try { const [p, o] = await Promise.all([corrAPI.positions(undefined, true), corrAPI.organizations()]); setItems(p.data.items); setOrgs(o.data); }
    catch (e) { setErr(errMsg(e, 'فشل التحميل')); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const save = async () => {
    setErr('');
    try {
      const payload = { ...form, organization_id: form.kind === 'INTERNAL' ? form.organization_id || null : null, external_organization: form.kind === 'EXTERNAL' ? form.external_organization : '' };
      if (form.id) await corrAPI.updatePosition(form.id, payload); else await corrAPI.createPosition(payload);
      setForm(null); load();
    } catch (e) { setErr(errMsg(e, 'فشل الحفظ')); }
  };
  const disable = async (p: any) => { if (!window.confirm(`إيقاف «${p.title_ar}»؟ لن يظهر في الاختيارات، ويبقى في الخطابات السابقة.`)) return; try { await corrAPI.deletePosition(p.id); load(); } catch (e) { setErr(errMsg(e, 'فشل الإيقاف')); } };
  const shown = items.filter((p) => !q || `${p.title_ar} ${p.holder_name} ${p.organization_name || ''} ${p.external_organization || ''}`.includes(q));
  const group = (kind: string) => shown.filter((p) => p.kind === kind);

  if (me && !hasAnywhere('correspondence.create') && !canManage) return <CorrPage title="المناصب والأسماء"><Denied /></CorrPage>;
  const Table = ({ rows, title }: { rows: any[]; title: string }) => (
    <div style={card} data-testid={`positions-${title}`}>
      <div style={{ fontWeight: 800, fontSize: 15, color: '#0f2440', marginBottom: 10 }}>{title} ({rows.length})</div>
      {rows.length === 0 ? <div style={{ color: '#94a3b8', fontSize: 13, padding: 10 }}>لا توجد مناصب — أضف مثل «رئيس الجامعة» أو «عميد كلية البنات»</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['المنصب', 'شاغل المنصب (كما سيُكتب)', 'الجهة', 'التكريم', 'الحالة', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((p) => (
            <tr key={p.id} data-testid={`position-row-${p.id}`} style={{ opacity: p.is_active === false ? 0.5 : 1 }}>
              <td style={{ ...td, fontWeight: 800 }}>{p.title_ar}{p.is_default_signer && <Badge text="الموقِّع الافتراضي" color="#16a34a" />}</td>
              <td style={td}>{p.display?.name}</td>
              <td style={td}>{p.organization_name || p.external_organization || '—'}</td>
              <td style={td}>{p.recipient_suffix || '—'}</td>
              <td style={td}>{p.is_active === false ? <Badge text="موقوف" color="#64748b" /> : <Badge text="نشط" color="#16a34a" />}</td>
              <td style={{ ...td, whiteSpace: 'nowrap' }}>{canManage && <><button onClick={() => setForm({ ...empty(), ...p })} style={btn('#f1f5f9', { color: '#0f2440', padding: '5px 10px', fontSize: 12 })} data-testid={`position-edit-${p.id}`}>تعديل</button> {p.is_active !== false && <button onClick={() => disable(p)} style={btn('#fee2e2', { color: '#b91c1c', padding: '5px 10px', fontSize: 12 })} data-testid={`position-disable-${p.id}`}>إيقاف</button>}</>}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
  return (
    <CorrPage title="المناصب والأسماء" subtitle="احفظ المناصب الإدارية (داخلية وخارجية) مع أسماء شاغليها وألقابهم — تُستخدم كمرسَل إليه أو كموقِّع فيُكتب الاسم كاملاً تلقائياً" loading={loading} testID="corr-positions-page"
      actions={canManage ? <button onClick={() => setForm(empty())} style={btn('#16a34a')} data-testid="position-add">+ منصب</button> : null}>
      {!!err && <div style={{ ...card, color: '#b91c1c' }} data-testid="positions-error">{err}</div>}
      <div style={card}><input style={inp} placeholder="بحث بالمنصب أو الاسم أو الجهة…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="positions-search" /></div>
      <Table rows={group('INTERNAL')} title="مناصب الجامعة" />
      <Table rows={group('EXTERNAL')} title="جهات خارجية" />
      {form && (
        <Modal title={form.id ? 'تعديل منصب' : 'منصب جديد'} onClose={() => setForm(null)} testID="position-modal">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="النوع"><select style={inp} value={form.kind} onChange={(e) => set('kind', e.target.value)} data-testid="position-kind"><option value="INTERNAL">داخلي (الجامعة)</option><option value="EXTERNAL">جهة خارجية</option></select></Field>
            <Field label="المنصب / الصفة *"><input style={inp} value={form.title_ar} onChange={(e) => set('title_ar', e.target.value)} placeholder="رئيس الجامعة / عميد كلية البنات / وزير التعليم العالي" data-testid="position-title" /></Field>
            <Field label="اللقب"><select style={inp} value={form.honorific} onChange={(e) => set('honorific', e.target.value)} data-testid="position-honorific">{HONORIFICS.map((h) => <option key={h} value={h}>{h || '— بدون —'}</option>)}</select></Field>
            <Field label="اسم شاغل المنصب كاملاً *"><input style={inp} value={form.holder_name} onChange={(e) => set('holder_name', e.target.value)} placeholder="محمد أحمد سالم باعباد" data-testid="position-holder" /></Field>
            {form.kind === 'INTERNAL'
              ? <Field label="الجهة في الهيكل"><select style={inp} value={form.organization_id || ''} onChange={(e) => set('organization_id', e.target.value)} data-testid="position-org"><option value="">— بدون —</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name_ar}</option>)}</select></Field>
              : <Field label="اسم الجهة الخارجية"><input style={inp} value={form.external_organization} onChange={(e) => set('external_organization', e.target.value)} placeholder="وزارة التعليم العالي والبحث العلمي" data-testid="position-ext-org" /></Field>}
            <Field label="عبارة التكريم عند المراسلة"><select style={inp} value={form.recipient_suffix} onChange={(e) => set('recipient_suffix', e.target.value)} data-testid="position-suffix">{SUFFIXES.map((s) => <option key={s} value={s}>{s || '— بدون —'}</option>)}</select></Field>
            <Field label="الترتيب"><input style={inp} type="number" value={form.sort_order} onChange={(e) => set('sort_order', Number(e.target.value))} /></Field>
            <Field label="ملاحظات"><input style={inp} value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} /></Field>
          </div>
          {form.kind === 'INTERNAL' && <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginTop: 8, cursor: 'pointer' }}><input type="checkbox" checked={!!form.is_default_signer} onChange={(e) => set('is_default_signer', e.target.checked)} data-testid="position-default-signer" /> الموقِّع الافتراضي للخطابات (يظهر اسمه ومنصبه في كتلة التوقيع تلقائياً)</label>}
          <div style={{ marginTop: 12, padding: 10, backgroundColor: '#f7f9fc', borderRadius: 10, fontSize: 13 }}>
            <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 4 }}>كما سيظهر في الخطاب:</div>
            <div style={{ fontWeight: 800 }}>{form.honorific ? `${form.honorific}/ ` : ''}{form.holder_name || '…'} <span style={{ fontWeight: 500, color: '#64748b' }}>{form.recipient_suffix}</span></div>
            <div>{form.title_ar || '…'}{form.kind === 'EXTERNAL' && form.external_organization ? ` — ${form.external_organization}` : ''}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-start', marginTop: 14 }}>
            <button onClick={save} style={btn('#16a34a')} data-testid="position-save">حفظ</button>
            <button onClick={() => setForm(null)} style={btn('#f1f5f9', { color: '#0f2440' })}>إلغاء</button>
          </div>
        </Modal>
      )}
    </CorrPage>
  );
}

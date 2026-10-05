import React, { useEffect, useState, useCallback } from 'react';
import { corrAPI, errMsg } from '../src/services/corrAPI';
import { CorrPage, card, btn, inp, th, td, Badge, Modal, Field, Denied, useCorrMe } from '../src/components/corr/CorrUI';

const EMPTY = { code: '', name_ar: '', name_en: '', description: '', organization_id: '', is_active: true };

export default function CorrDocumentTypes() {
  const { me, hasAnywhere } = useCorrMe();
  const [rows, setRows] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [form, setForm] = useState<{ item: any | null; f: any } | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await corrAPI.documentTypes({ include_inactive: true })).data); } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); corrAPI.organizations().then((r) => setOrgs(r.data)).catch(() => {}); }, [load]);
  const orgName = (id: string | null) => (id ? orgs.find((o) => o.id === id)?.name_ar || id : 'عام (كل الجامعة)');
  const save = async () => {
    setErr('');
    try {
      const payload = { ...form!.f, organization_id: form!.f.organization_id || null };
      if (form!.item) await corrAPI.updateDocumentType(form!.item.id, payload); else await corrAPI.createDocumentType(payload);
      setForm(null); load();
    } catch (e) { setErr(errMsg(e, 'فشل الحفظ')); }
  };
  if (me && !hasAnywhere('templates.manage')) return <CorrPage title="أنواع الوثائق"><Denied /></CorrPage>;
  return (
    <CorrPage title="أنواع الوثائق" subtitle="أنواع عامة للجامعة أو خاصة بمنظمة محددة" loading={loading} testID="corr-document-types"
      actions={<button onClick={() => setForm({ item: null, f: EMPTY })} style={btn('#16a34a')} data-testid="corr-dt-add">+ نوع</button>}>
      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="corr-dt-table">
          <thead><tr><th style={th}>الكود</th><th style={th}>الاسم</th><th style={th}>الاسم الإنجليزي</th><th style={th}>النطاق</th><th style={th}>الحالة</th><th style={th}></th></tr></thead>
          <tbody>{rows.map((d) => (
            <tr key={d.id} data-testid={`corr-dt-row-${d.code}`}>
              <td style={td}><code>{d.code}</code></td><td style={{ ...td, fontWeight: 700 }}>{d.name_ar}</td><td style={td}>{d.name_en}</td>
              <td style={td}>{d.is_global ? <Badge text="عام" color="#0f766e" /> : orgName(d.organization_id)}</td>
              <td style={td}><Badge text={d.is_active ? 'نشط' : 'موقوف'} color={d.is_active ? '#16a34a' : '#64748b'} /></td>
              <td style={td}><button onClick={() => setForm({ item: d, f: { code: d.code, name_ar: d.name_ar, name_en: d.name_en || '', description: d.description || '', organization_id: d.organization_id || '', is_active: d.is_active } })} style={btn('#1565c0', { padding: '4px 10px' })} data-testid={`corr-dt-edit-${d.code}`}>تعديل</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {form && (
        <Modal title={form.item ? 'تعديل نوع وثيقة' : 'نوع وثيقة جديد'} onClose={() => setForm(null)} testID="corr-dt-modal">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="الكود *"><input style={{ ...inp, direction: 'ltr' }} value={form.f.code} disabled={!!form.item} onChange={(e) => setForm({ ...form, f: { ...form.f, code: e.target.value.toUpperCase() } })} data-testid="corr-dt-code" /></Field>
            <Field label="المنظمة (فارغ = عام)"><select style={inp} value={form.f.organization_id} disabled={!!form.item} onChange={(e) => setForm({ ...form, f: { ...form.f, organization_id: e.target.value } })} data-testid="corr-dt-org"><option value="">عام (كل الجامعة)</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name_ar}</option>)}</select></Field>
          </div>
          <Field label="الاسم العربي *"><input style={inp} value={form.f.name_ar} onChange={(e) => setForm({ ...form, f: { ...form.f, name_ar: e.target.value } })} data-testid="corr-dt-name" /></Field>
          <Field label="الاسم الإنجليزي"><input style={{ ...inp, direction: 'ltr' }} value={form.f.name_en} onChange={(e) => setForm({ ...form, f: { ...form.f, name_en: e.target.value } })} /></Field>
          <Field label="الوصف"><textarea style={{ ...inp, minHeight: 50 }} value={form.f.description} onChange={(e) => setForm({ ...form, f: { ...form.f, description: e.target.value } })} /></Field>
          <label style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}><input type="checkbox" checked={form.f.is_active} onChange={(e) => setForm({ ...form, f: { ...form.f, is_active: e.target.checked } })} /> نشط</label>
          {!!err && <div style={{ color: '#b91c1c', fontSize: 12.5, marginBottom: 8 }} data-testid="corr-dt-error">{err}</div>}
          <div style={{ display: 'flex', gap: 8 }}><button onClick={save} disabled={!form.f.code || !form.f.name_ar} style={btn('#16a34a')} data-testid="corr-dt-save">حفظ</button><button onClick={() => setForm(null)} style={btn('#94a3b8')}>إلغاء</button></div>
        </Modal>
      )}
    </CorrPage>
  );
}

import React, { useEffect, useState, useCallback } from 'react';
import { corrAPI, errMsg } from '../src/services/corrAPI';
import { CorrPage, card, btn, inp, th, td, Badge, Modal, Field, Denied, useCorrMe } from '../src/components/corr/CorrUI';

const EMPTY = { organization_id: '', document_type_id: '', name: '', prefix: '', separator: '-', year_format: 'YYYY', padding_length: 6, reset_frequency: 'YEARLY', pattern: '{prefix}{sep}{year}{sep}{seq}', trigger_status: 'ISSUED', is_active: true };
const preview = (f: any) => {
  try {
    const y = f.year_format === 'YY' ? String(new Date().getFullYear()).slice(-2) : String(new Date().getFullYear());
    return String(f.pattern).replace(/\{prefix\}/g, f.prefix).replace(/\{sep\}/g, f.separator).replace(/\{year\}/g, y).replace(/\{seq\}/g, '1'.padStart(Number(f.padding_length) || 6, '0'));
  } catch { return ''; }
};

export default function CorrNumbering() {
  const { me, hasAnywhere } = useCorrMe();
  const [rows, setRows] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [form, setForm] = useState<{ item: any | null; f: any } | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await corrAPI.schemes()).data); } catch (e) { setErr(errMsg(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); corrAPI.organizations().then((r) => setOrgs(r.data)).catch(() => {}); corrAPI.documentTypes({ include_inactive: true }).then((r) => setTypes(r.data)).catch(() => {}); }, [load]);
  const name = (list: any[], id: string | null, k: string) => (id ? list.find((o) => o.id === id)?.[k] || id : '—');
  const save = async () => {
    setErr('');
    try {
      const payload = { ...form!.f, document_type_id: form!.f.document_type_id || null, padding_length: Number(form!.f.padding_length) };
      if (form!.item) await corrAPI.updateScheme(form!.item.id, payload); else await corrAPI.createScheme(payload);
      setForm(null); load();
    } catch (e) { setErr(errMsg(e, 'فشل الحفظ')); }
  };
  if (me && !hasAnywhere('numbering.manage')) return <CorrPage title="مخططات الترقيم"><Denied /></CorrPage>;
  return (
    <CorrPage title="مخططات الترقيم الرسمي" subtitle="الترقيم ذري وغير قابل لإعادة الاستخدام — يُولَّد عند المرحلة المهيأة (الافتراضي: الإصدار)" loading={loading} testID="corr-numbering"
      actions={<button onClick={() => setForm({ item: null, f: EMPTY })} style={btn('#16a34a')} data-testid="corr-scheme-add">+ مخطط</button>}>
      {!!err && <div style={{ ...card, color: '#b91c1c' }}>{err}</div>}
      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="corr-scheme-table">
          <thead><tr><th style={th}>الاسم</th><th style={th}>المنظمة</th><th style={th}>نوع الوثيقة</th><th style={th}>النمط</th><th style={th}>معاينة</th><th style={th}>مرحلة الترقيم</th><th style={th}>التسلسل الحالي</th><th style={th}>الحالة</th><th style={th}></th></tr></thead>
          <tbody>{rows.map((s) => (
            <tr key={s.id} data-testid={`corr-scheme-row-${s.id}`}>
              <td style={{ ...td, fontWeight: 700 }}>{s.name}</td><td style={td}>{name(orgs, s.organization_id, 'name_ar')}</td><td style={td}>{s.document_type_id ? name(types, s.document_type_id, 'name_ar') : <Badge text="كل الأنواع" color="#475569" />}</td>
              <td style={{ ...td, direction: 'ltr', textAlign: 'left' }}><code>{s.pattern}</code></td><td style={{ ...td, direction: 'ltr', textAlign: 'left', fontFamily: 'monospace', fontWeight: 800, color: '#0f766e' }}>{s.preview}</td>
              <td style={td}>{s.trigger_status}</td><td style={td}>{s.sequences.map((q: any) => <div key={q.year}><code>{q.year || 'مستمر'}: {q.current_sequence}</code></div>)}</td>
              <td style={td}><Badge text={s.is_active ? 'نشط' : 'موقوف'} color={s.is_active ? '#16a34a' : '#64748b'} /></td>
              <td style={td}><button onClick={() => setForm({ item: s, f: { ...EMPTY, ...s, document_type_id: s.document_type_id || '' } })} style={btn('#1565c0', { padding: '4px 10px' })} data-testid={`corr-scheme-edit-${s.id}`}>تعديل</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {form && (
        <Modal title={form.item ? 'تعديل مخطط ترقيم' : 'مخطط ترقيم جديد'} onClose={() => setForm(null)} testID="corr-scheme-modal">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="المنظمة *"><select style={inp} value={form.f.organization_id} disabled={!!form.item} onChange={(e) => setForm({ ...form, f: { ...form.f, organization_id: e.target.value } })} data-testid="corr-scheme-org"><option value="">— اختر —</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name_ar} ({o.code})</option>)}</select></Field>
            <Field label="نوع الوثيقة (فارغ = كل الأنواع)"><select style={inp} value={form.f.document_type_id} onChange={(e) => setForm({ ...form, f: { ...form.f, document_type_id: e.target.value } })}><option value="">كل الأنواع</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name_ar}</option>)}</select></Field>
            <Field label="الاسم *"><input style={inp} value={form.f.name} onChange={(e) => setForm({ ...form, f: { ...form.f, name: e.target.value } })} data-testid="corr-scheme-name" /></Field>
            <Field label="البادئة (prefix) *"><input style={{ ...inp, direction: 'ltr' }} value={form.f.prefix} onChange={(e) => setForm({ ...form, f: { ...form.f, prefix: e.target.value } })} data-testid="corr-scheme-prefix" /></Field>
            <Field label="الفاصل"><input style={{ ...inp, direction: 'ltr' }} value={form.f.separator} onChange={(e) => setForm({ ...form, f: { ...form.f, separator: e.target.value } })} /></Field>
            <Field label="صيغة السنة"><select style={inp} value={form.f.year_format} onChange={(e) => setForm({ ...form, f: { ...form.f, year_format: e.target.value } })}><option value="YYYY">2026</option><option value="YY">26</option></select></Field>
            <Field label="طول التسلسل (أصفار)"><input style={inp} type="number" min={1} max={12} value={form.f.padding_length} onChange={(e) => setForm({ ...form, f: { ...form.f, padding_length: e.target.value } })} /></Field>
            <Field label="إعادة الترقيم"><select style={inp} value={form.f.reset_frequency} onChange={(e) => setForm({ ...form, f: { ...form.f, reset_frequency: e.target.value } })}><option value="YEARLY">سنوياً</option><option value="NEVER">مستمر</option></select></Field>
            <Field label="النمط — المتغيرات: {prefix} {sep} {year} {seq}"><input style={{ ...inp, direction: 'ltr' }} value={form.f.pattern} onChange={(e) => setForm({ ...form, f: { ...form.f, pattern: e.target.value } })} data-testid="corr-scheme-pattern" /></Field>
            <Field label="مرحلة توليد الرقم"><select style={inp} value={form.f.trigger_status} onChange={(e) => setForm({ ...form, f: { ...form.f, trigger_status: e.target.value } })}><option value="ISSUED">عند الإصدار (موصى به)</option><option value="SIGNED">عند التوقيع</option><option value="APPROVED">عند الاعتماد</option></select></Field>
          </div>
          <div style={{ fontSize: 13, margin: '4px 0 10px' }}>معاينة: <code style={{ color: '#0f766e', fontWeight: 800 }} data-testid="corr-scheme-preview">{preview(form.f)}</code></div>
          <label style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}><input type="checkbox" checked={form.f.is_active} onChange={(e) => setForm({ ...form, f: { ...form.f, is_active: e.target.checked } })} /> نشط</label>
          {!!err && <div style={{ color: '#b91c1c', fontSize: 12.5, marginBottom: 8 }} data-testid="corr-scheme-error">{err}</div>}
          <div style={{ display: 'flex', gap: 8 }}><button onClick={save} disabled={!form.f.organization_id || !form.f.name || !form.f.prefix} style={btn('#16a34a')} data-testid="corr-scheme-save">حفظ</button><button onClick={() => setForm(null)} style={btn('#94a3b8')}>إلغاء</button></div>
        </Modal>
      )}
    </CorrPage>
  );
}

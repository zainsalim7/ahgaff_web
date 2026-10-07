import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { card, btn, inp, Field, Modal, Badge } from '../corr/CorrUI';
import { LetterLayoutEditor } from './LetterLayoutEditor';
import { SignatoryPicker, EMPTY_SIGNATORY } from '../statements/SignatoryPicker';

export type Visibility = { type: 'private' | 'unit' | 'roles' | 'all'; roles: string[] };
export const VIS_LABEL: Record<string, string> = { private: '🔒 خاصة بي', unit: '🏛️ كليتي / وحدتي', roles: '👥 أدوار محددة', all: '🌐 الجميع' };
const errOf = (e: any, d: string) => e?.response?.data?.detail || d;

export const VisibilityPicker: React.FC<{ value: Visibility; onChange: (v: Visibility) => void; testID: string }> = ({ value, onChange, testID }) => {
  const [roles, setRoles] = useState<{ key: string; name: string }[]>([]);
  useEffect(() => { api.get('/letterheads/meta/roles').then((r) => setRoles(r.data)).catch(() => {}); }, []);
  return (
    <div data-testid={testID} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, background: '#f8fafc' }}>
      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>من يرى هذه ويستخدمها؟</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {(Object.keys(VIS_LABEL) as Visibility['type'][]).map((t) => (
          <label key={t} style={{ fontSize: 12.5, display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
            <input type="radio" checked={value.type === t} onChange={() => onChange({ ...value, type: t })} data-testid={`${testID}-${t}`} /> {VIS_LABEL[t]}
          </label>
        ))}
      </div>
      {value.type === 'roles' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {roles.map((r) => (
            <label key={r.key} style={{ fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 8, padding: '2px 8px', background: value.roles.includes(r.key) ? '#dbeafe' : '#fff', cursor: 'pointer' }}>
              <input type="checkbox" checked={value.roles.includes(r.key)} onChange={(e) => onChange({ ...value, roles: e.target.checked ? [...value.roles, r.key] : value.roles.filter((x) => x !== r.key) })} /> {r.name}
            </label>
          ))}
        </div>
      )}
      {value.type === 'unit' && <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 6 }}>تُشارك مع كل من ينتمي لكلياتك أو وحدتك الإدارية (تُحدَّد من ملفك عند الحفظ).</div>}
    </div>
  );
};

const EMPTY_LH = { name: '', description: '', org_name: 'جامعة الأحقاف', office_name: '', office_name_en: '', logo_base64: '', signature_base64: '', default_signatory_name: '', default_signatory_title: '', default_signatory_position_id: '', phones: '', fax: '', address: '', po_box: '', website: '', closing: 'وتفضلوا بقبول فائق الاحترام والتقدير،', layout: null as any, header_image_base64: '', footer_image_base64: '', visibility: { type: 'private', roles: [] } as Visibility };

const LetterheadForm: React.FC<{ initial: any; layoutDefaults: any; onSaved: () => void; onClose: () => void }> = ({ initial, layoutDefaults, onSaved, onClose }) => {
  const [f, setF] = useState<any>({ ...EMPTY_LH, ...initial, visibility: initial?.visibility || EMPTY_LH.visibility });
  const [preview, setPreview] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const file64 = (k: string) => (e: any) => { const file = e.target.files?.[0]; if (!file) return; const rd = new FileReader(); rd.onload = () => setF((s: any) => ({ ...s, [k]: rd.result })); rd.readAsDataURL(file); };
  useEffect(() => {
    const t = setTimeout(() => {
      const { visibility, id, can_edit, owner_id, owner_name, is_default, ...override } = f;
      const sample = { subject: 'نموذج لمعاينة الكليشة', body: '<p style="text-align: right">تهديكم {جهة_المرسل_إليه} أطيب التحيات، وبالإشارة إلى الموضوع أعلاه نفيدكم بأن هذا نص تجريبي لمعاينة الكليشة والتخطيط.</p>', recipient: { title: 'عميد الكلية', name: 'د. فلان الفلاني', suffix: 'المحترم' }, people: [], signatory_name: f.default_signatory_name, signatory_title: f.default_signatory_title, signatory_position_id: f.default_signatory_position_id, letterhead_id: initial?.id || '', letterhead_override: override };
      api.post('/letters/preview-pdf?fmt=png', sample, { responseType: 'blob' }).then((r) => { const url = URL.createObjectURL(new Blob([r.data], { type: 'image/png' })); setPreview((o) => { if (o) URL.revokeObjectURL(o); return url; }); }).catch(() => {});
    }, 700);
    return () => clearTimeout(t);
  }, [f]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    if (!f.name.trim()) { setErr('اسم الكليشة مطلوب'); return; }
    setBusy(true); setErr('');
    try {
      const { id, can_edit, owner_id, owner_name, is_default, is_active, created_at, updated_at, unit_faculty_ids, unit_org_unit_ids, system_key, ...payload } = f;
      if (initial?.id) await api.put(`/letterheads/${initial.id}`, payload); else await api.post('/letterheads', payload);
      onSaved();
    } catch (e) { setErr(errOf(e, 'فشل الحفظ')); } finally { setBusy(false); }
  };
  const imgField = (k: string, label: string, h: number) => (
    <Field label={label}><input type="file" accept="image/*" onChange={file64(k)} data-testid={`lh-${k}`} />{f[k] && <div><img src={f[k]} alt="" style={{ maxHeight: h, maxWidth: '100%', objectFit: 'contain', marginTop: 6, border: '1px solid #e2e8f0' }} /> <button onClick={() => setF({ ...f, [k]: '' })} style={{ ...btn('#fee2e2', { color: '#b91c1c', padding: '3px 8px', fontSize: 11 }), marginTop: 4 }}>إزالة</button></div>}</Field>
  );
  return (
    <Modal title={initial?.id ? `تعديل الكليشة: ${initial.name}` : 'كليشة جديدة'} onClose={onClose} width={1100} testID="letterhead-modal">
      {err && <div style={{ color: '#b91c1c', fontSize: 12.5, marginBottom: 8 }} data-testid="lh-error">{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="اسم الكليشة *"><input style={inp} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="مثال: كليشة كلية الشريعة — داخلي" data-testid="lh-name" /></Field>
            <Field label="وصف مختصر"><input style={inp} value={f.description || ''} onChange={(e) => setF({ ...f, description: e.target.value })} data-testid="lh-description" /></Field>
            {([['org_name', 'اسم الجامعة'], ['office_name', 'الجهة المصدِرة'], ['office_name_en', 'الجهة بالإنجليزية'], ['phones', 'تلفون'], ['fax', 'فاكس'], ['address', 'العنوان'], ['po_box', 'ص.ب'], ['website', 'الموقع'], ['closing', 'عبارة الختام']] as const).map(([k, l]) => (
              <Field key={k} label={l}><input style={inp} value={f[k] || ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} data-testid={`lh-${k}`} /></Field>
            ))}
          </div>
          <Field label="الموقِّع الافتراضي لهذه الكليشة">
            <SignatoryPicker value={{ position_id: f.default_signatory_position_id || '', name: f.default_signatory_name || '', title: f.default_signatory_title || '' }} onChange={(v) => setF({ ...f, default_signatory_position_id: v.position_id, default_signatory_name: v.name, default_signatory_title: v.title })} defaultLabel="بدون موقِّع افتراضي" testID="lh-signatory" />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {imgField('logo_base64', 'الشعار', 50)}
            {imgField('signature_base64', 'صورة التوقيع', 50)}
            {imgField('header_image_base64', '🖼️ ترويسة جاهزة كصورة (تحل محل الشعار والنصوص)', 90)}
            {imgField('footer_image_base64', '🖼️ تذييل جاهز كصورة', 60)}
          </div>
          <VisibilityPicker value={f.visibility} onChange={(v) => setF({ ...f, visibility: v })} testID="lh-visibility" />
          <details style={{ marginTop: 12 }} data-testid="lh-layout-details">
            <summary style={{ cursor: 'pointer', fontWeight: 800, color: '#0f2440', fontSize: 13 }}>📐 تخطيط الصفحة الخاص بهذه الكليشة</summary>
            <div style={{ overflowX: 'auto', marginTop: 8 }}><LetterLayoutEditor value={f.layout || {}} defaults={layoutDefaults} onChange={(l) => setF({ ...f, layout: l })} testID="lh-layout" /></div>
          </details>
        </div>
        <div style={{ position: 'sticky', top: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>معاينة حيّة</div>
          {preview ? <img src={preview} alt="معاينة" style={{ width: '100%', boxShadow: '0 4px 14px rgba(0,0,0,.15)', borderRadius: 4 }} data-testid="lh-preview" /> : <div style={{ color: '#94a3b8', fontSize: 12 }}>جاري التوليد…</div>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={save} disabled={busy} style={btn('#16a34a', { flex: 1 })} data-testid="lh-save">{busy ? 'جاري الحفظ…' : 'حفظ الكليشة'}</button>
        <button onClick={onClose} style={btn('#f1f5f9', { color: '#0f2440' })}>إلغاء</button>
      </div>
    </Modal>
  );
};

export const LetterheadManager: React.FC<{ layoutDefaults: any; isAdmin: boolean; onChanged?: () => void }> = ({ layoutDefaults, isAdmin, onChanged }) => {
  const [items, setItems] = useState<any[]>([]); const [edit, setEdit] = useState<any | null>(null); const [err, setErr] = useState('');
  const load = () => api.get('/letterheads').then((r) => setItems(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  const refresh = () => { load(); onChanged?.(); };
  const openEdit = async (id: string) => { try { const r = await api.get(`/letterheads/${id}`); setEdit(r.data); } catch (e) { setErr(errOf(e, 'تعذر الفتح')); } };
  return (
    <div style={card} data-testid="letterhead-manager">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div><b>📄 مكتبة الكليشات ({items.length})</b><div style={{ fontSize: 11.5, color: '#64748b' }}>كل جهة تنشئ كليشاتها بتصميمها الخاص، وتحدد من يراها.</div></div>
        <button onClick={() => setEdit({})} style={btn('#0f2440', { padding: '6px 12px', fontSize: 12 })} data-testid="letterhead-add">+ كليشة جديدة</button>
      </div>
      {err && <div style={{ color: '#b91c1c', fontSize: 12 }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
        {items.map((it) => (
          <div key={it.id} style={{ border: `1px solid ${it.is_default ? '#fbbf24' : '#e2e8f0'}`, borderRadius: 10, padding: 10, background: it.is_default ? '#fffbeb' : '#fff' }} data-testid={`letterhead-card-${it.id}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}><b style={{ fontSize: 13.5 }}>{it.is_default && '⭐ '}{it.name}</b><Badge text={VIS_LABEL[it.visibility?.type] || ''} color="#2563eb" /></div>
            <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 4 }}>{it.office_name || it.org_name}{it.description ? ` — ${it.description}` : ''}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>المالك: {it.owner_name || 'النظام'}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {it.can_edit && <button onClick={() => openEdit(it.id)} style={btn('#f1f5f9', { color: '#0f2440', padding: '4px 10px', fontSize: 12 })} data-testid={`letterhead-edit-${it.id}`}>تعديل</button>}
              {it.can_edit && !it.is_default && <button onClick={async () => { if (window.confirm('حذف الكليشة؟')) { try { await api.delete(`/letterheads/${it.id}`); refresh(); } catch (e) { setErr(errOf(e, 'فشل الحذف')); } } }} style={btn('#fee2e2', { color: '#b91c1c', padding: '4px 10px', fontSize: 12 })} data-testid={`letterhead-delete-${it.id}`}>حذف</button>}
              {isAdmin && !it.is_default && <button onClick={async () => { await api.post(`/letterheads/${it.id}/set-default`); refresh(); }} style={btn('#fef3c7', { color: '#b45309', padding: '4px 10px', fontSize: 12 })} data-testid={`letterhead-default-${it.id}`}>⭐ افتراضية للجميع</button>}
            </div>
          </div>
        ))}
      </div>
      {edit && <LetterheadForm initial={edit} layoutDefaults={layoutDefaults} onSaved={() => { setEdit(null); refresh(); }} onClose={() => setEdit(null)} />}
    </div>
  );
};

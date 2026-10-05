import React, { useEffect, useMemo, useState } from 'react';
import { corrAPI, errMsgFull, errList, SECTION_TYPE_AR, EDITABILITY_AR, INPUT_TYPE_AR } from '../../services/corrAPI';
import { Field, inp, btn, Badge, useCorrMe } from './CorrUI';
import { TipTapEditor } from './TipTapEditor';
import { A4Preview } from './A4Preview';

export type Section = { id: string; type: string; order: number; title: string; content: string; editable: string; required: boolean; visibility_condition?: any; style_config?: any; config?: any };
export type InputField = { key: string; label_ar: string; label_en?: string; type: string; required: boolean; max_length?: number | null; options: string[]; default_value?: string };

const DEFAULT_SECTIONS: Section[] = [
  { id: 's1', type: 'REFERENCE', order: 1, title: 'الرقم والتاريخ', content: '<p>الرقم: {{correspondence.official_number}}<br/>التاريخ: {{correspondence.date}} الموافق {{correspondence.date_hijri}}</p>', editable: 'SYSTEM', required: false },
  { id: 's2', type: 'RECIPIENT', order: 2, title: 'المستلم', content: '<p>إلى: {{recipient.title}} {{recipient.name}}<br/>{{recipient.organization}}</p>', editable: 'STRUCTURED', required: false },
  { id: 's3', type: 'SALUTATION', order: 3, title: 'التحية', content: '<p>السلام عليكم ورحمة الله وبركاته،</p>', editable: 'DEFAULT_EDITABLE', required: false },
  { id: 's4', type: 'SUBJECT', order: 4, title: 'الموضوع', content: '<p><strong>الموضوع: {{correspondence.subject}}</strong></p>', editable: 'SYSTEM', required: true },
  { id: 's5', type: 'BODY', order: 5, title: 'المتن', content: '<p></p>', editable: 'DEFAULT_EDITABLE', required: true },
  { id: 's6', type: 'CLOSING', order: 6, title: 'الخاتمة', content: '<p>وتفضلوا بقبول فائق الاحترام والتقدير،</p>', editable: 'DEFAULT_EDITABLE', required: false },
  { id: 's7', type: 'SIGNATURE_BLOCK', order: 7, title: 'التوقيع', content: '<p>{{organization.name_ar}}</p>', editable: 'SYSTEM', required: false },
];
export const newTemplateForm = () => ({ organization_id: '', document_type_id: '', letterhead_id: '', code: '', name_ar: '', name_en: '', description: '', template_category: 'GENERAL', freeze_stage: 'ISSUED', required_entities: [] as string[], sections: JSON.parse(JSON.stringify(DEFAULT_SECTIONS)) as Section[], input_fields: [] as InputField[], change_note: '' });

const small: React.CSSProperties = { ...inp, padding: '5px 8px', fontSize: 12 };
const ib = (bg: string): React.CSSProperties => ({ ...btn(bg, { padding: '3px 8px', fontSize: 11 }) });

const SectionCard: React.FC<{ s: Section; idx: number; total: number; phs: any[]; onChange: (s: Section) => void; onMove: (d: -1 | 1) => void; onDelete: () => void; onFocus: () => void; active: boolean }> = ({ s, idx, total, phs, onChange, onMove, onDelete, onFocus, active }) => (
  <div data-testid={`tpl-section-${s.id}`} onClick={onFocus} style={{ border: `1.5px solid ${active ? '#0ea5e9' : '#e2e8f0'}`, borderRadius: 10, padding: 10, marginBottom: 8, backgroundColor: '#fff' }}>
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
      <Badge text={`${idx + 1}`} color="#0f2440" />
      <select style={{ ...small, width: 150 }} value={s.type} onChange={(e) => onChange({ ...s, type: e.target.value })} data-testid={`tpl-sec-type-${s.id}`}>{Object.entries(SECTION_TYPE_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <input style={{ ...small, flex: 1, minWidth: 120 }} placeholder="عنوان القسم" value={s.title} onChange={(e) => onChange({ ...s, title: e.target.value })} data-testid={`tpl-sec-title-${s.id}`} />
      <select style={{ ...small, width: 170 }} value={s.editable} onChange={(e) => onChange({ ...s, editable: e.target.value })} title={EDITABILITY_AR[s.editable]?.hint} data-testid={`tpl-sec-edit-${s.id}`}>{Object.entries(EDITABILITY_AR).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
      <label style={{ fontSize: 11.5, display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={s.required} onChange={(e) => onChange({ ...s, required: e.target.checked })} data-testid={`tpl-sec-req-${s.id}`} /> إلزامي</label>
      <span style={{ marginRight: 'auto', display: 'flex', gap: 4 }}>
        <button disabled={idx === 0} onClick={(e) => { e.stopPropagation(); onMove(-1); }} style={ib('#64748b')} title="أعلى">↑</button>
        <button disabled={idx === total - 1} onClick={(e) => { e.stopPropagation(); onMove(1); }} style={ib('#64748b')} title="أسفل">↓</button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} style={ib('#dc2626')} data-testid={`tpl-sec-del-${s.id}`}>حذف</button>
      </span>
    </div>
    <TipTapEditor value={s.content} onChange={(html) => onChange({ ...s, content: html })} placeholders={phs} minHeight={70} testID={`tpl-sec-editor-${s.id}`} />
    <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 4 }}>{EDITABILITY_AR[s.editable]?.hint}</div>
  </div>
);

type Props = { item: any | null; onClose: () => void; onSaved: () => void; orgs: any[]; types: any[] };

export const TemplateBuilder: React.FC<Props> = ({ item, onClose, onSaved, orgs, types }) => {
  const { me, hasAnywhere } = useCorrMe();
  const [f, setF] = useState<any>(newTemplateForm());
  const [phs, setPhs] = useState<any[]>([]);
  const [lhs, setLhs] = useState<any[]>([]);
  const [tpl, setTpl] = useState<any | null>(item);
  const [err, setErr] = useState('');
  const [errs, setErrs] = useState<string[]>([]);
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [tab, setTab] = useState<'sections' | 'inputs' | 'settings'>('sections');
  const isGlobalAdmin = hasAnywhere('template.manage_global');
  const published = !!tpl?.current?.is_published;

  useEffect(() => { corrAPI.placeholders().then((r) => setPhs(r.data.items)).catch(() => {}); }, []);
  useEffect(() => { corrAPI.letterheads(f.organization_id ? { organization_id: f.organization_id } : {}).then((r) => setLhs(r.data)).catch(() => setLhs([])); }, [f.organization_id]);
  useEffect(() => {
    if (!item) return;
    corrAPI.template(item.id).then((r) => {
      const t = r.data; setTpl(t);
      const v = t.current || {};
      setF({ organization_id: t.organization_id || '', document_type_id: t.document_type_id, letterhead_id: v.letterhead_id || t.letterhead_id || '', code: t.code, name_ar: t.name_ar, name_en: t.name_en || '', description: t.description || '', template_category: t.template_category || 'GENERAL', freeze_stage: t.freeze_stage || 'ISSUED', required_entities: v.required_entities || [], sections: (v.sections || []).map((s: any) => ({ ...s, title: s.title || '', content: s.content || '' })), input_fields: (v.input_fields || []).map((x: any) => ({ ...x, options: x.options || [] })), change_note: '' });
    }).catch((e) => setErr(errMsgFull(e)));
  }, [item]);

  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const phForEditor = useMemo(() => [...phs.map((p) => ({ key: p.key, label_ar: `${p.namespace_ar} › ${p.label_ar}` })), ...f.input_fields.filter((x: InputField) => x.key).map((x: InputField) => ({ key: `input.${x.key}`, label_ar: `مدخلات › ${x.label_ar || x.key}` }))], [phs, f.input_fields]);
  const labelOf = useMemo(() => { const m: Record<string, string> = {}; phForEditor.forEach((p) => (m[p.key] = p.label_ar.split(' › ').pop() || p.key)); return m; }, [phForEditor]);
  const previewSections = useMemo(() => [...f.sections].sort((a: Section, b: Section) => a.order - b.order).map((s: Section) => ({ id: s.id, type: s.type, title: s.title, html: (s.content || '').replace(/\{\{\s*([a-z_]+\.[a-z_0-9]+)\s*\}\}/g, (_m, k) => `<span style="background:#fef9c3;border-radius:3px;padding:0 3px">[${labelOf[k] || k}]</span>`) })), [f.sections, labelOf]);
  const letterhead = lhs.find((l) => l.id === f.letterhead_id) || lhs.find((l) => l.is_default) || lhs[0] || null;

  const updateSection = (s: Section) => set('sections', f.sections.map((x: Section) => (x.id === s.id ? s : x)));
  const moveSection = (id: string, d: -1 | 1) => { const arr = [...f.sections].sort((a, b) => a.order - b.order); const i = arr.findIndex((x) => x.id === id); const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; set('sections', arr.map((x, k) => ({ ...x, order: k + 1 }))); };
  const addSection = () => { const n = Math.max(0, ...f.sections.map((s: Section) => parseInt(s.id.replace(/\D/g, ''), 10) || 0)) + 1; set('sections', [...f.sections, { id: `s${n}`, type: 'CUSTOM', order: f.sections.length + 1, title: '', content: '<p></p>', editable: 'EDITABLE', required: false }]); };
  const addInput = () => set('input_fields', [...f.input_fields, { key: '', label_ar: '', label_en: '', type: 'TEXT', required: false, max_length: null, options: [], default_value: '' }]);
  const updInput = (i: number, patch: Partial<InputField>) => set('input_fields', f.input_fields.map((x: InputField, k: number) => (k === i ? { ...x, ...patch } : x)));

  const versionPayload = () => ({ sections: f.sections, input_fields: f.input_fields.map((x: InputField) => ({ ...x, key: x.key.trim(), max_length: x.max_length || null })), required_entities: f.required_entities, letterhead_id: f.letterhead_id || null, change_note: f.change_note });
  const run = async (fn: () => Promise<any>, okMsg: string, close = false) => {
    setBusy(true); setErr(''); setErrs([]); setOk('');
    try { const r = await fn(); if (r?.data?.id) setTpl(r.data); setOk(okMsg); onSaved(); if (close) onClose(); return r; }
    catch (e: any) { setErr(errMsgFull(e, 'فشل العملية')); setErrs(errList(e)); } finally { setBusy(false); }
  };
  const save = () => run(async () => {
    if (!tpl) { const r = await corrAPI.createTemplate({ ...f, organization_id: f.organization_id || null, ...versionPayload() }); return r; }
    return published ? corrAPI.newTemplateVersion(tpl.id, versionPayload()) : corrAPI.updateTemplateDraft(tpl.id, versionPayload());
  }, tpl ? (published ? 'أُنشئ إصدار جديد (مسودة)' : 'حُفظت المسودة') : 'أُنشئ القالب كمسودة');
  const validate = () => run(async () => { const r = await corrAPI.validateTemplate(tpl.id); if (!r.data.valid) { setErrs(r.data.errors); throw { response: { data: { detail: { message: 'فشل التحقق', errors: r.data.errors } } } }; } return r; }, 'القالب صالح ✓');
  const publish = () => run(() => corrAPI.publishTemplate(tpl.id), 'نُشر الإصدار — أصبح متاحاً للاستخدام');

  return (
    <div data-testid="tpl-builder" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,520px)', gap: 16, alignItems: 'start' }}>
      <div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          <b style={{ color: '#0f2440', fontSize: 15 }}>{tpl ? `${tpl.name_ar} — v${tpl.current_version}` : 'قالب جديد'}</b>
          {tpl && <Badge text={published ? 'الإصدار الحالي منشور' : 'الإصدار الحالي مسودة'} color={published ? '#16a34a' : '#64748b'} testID="tpl-version-badge" />}
          {tpl?.is_global && <Badge text="عام" color="#7c3aed" />}
          <span style={{ marginRight: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={save} disabled={busy || !f.name_ar || !f.code || !f.document_type_id} style={btn('#1565c0')} data-testid="tpl-save">{tpl ? (published ? 'حفظ كإصدار جديد' : 'حفظ المسودة') : 'إنشاء المسودة'}</button>
            {tpl && !published && <button onClick={validate} disabled={busy} style={btn('#f59e0b')} data-testid="tpl-validate">تحقق</button>}
            {tpl && !published && hasAnywhere('template.publish') && <button onClick={publish} disabled={busy} style={btn('#16a34a')} data-testid="tpl-publish">نشر v{tpl.current_version}</button>}
            <button onClick={onClose} style={btn('#94a3b8')} data-testid="tpl-close">إغلاق</button>
          </span>
        </div>
        {published && <div style={{ fontSize: 12, color: '#92400e', backgroundColor: '#fffbeb', padding: 8, borderRadius: 8, marginBottom: 8 }}>الإصدار المنشور غير قابل للتغيير — أي حفظ ينشئ إصداراً جديداً كمسودة يجب نشره ليُستخدم. المراسلات القائمة تبقى على إصدارها.</div>}
        {!!ok && <div style={{ fontSize: 12.5, color: '#166534', backgroundColor: '#f0fdf4', padding: 8, borderRadius: 8, marginBottom: 8 }} data-testid="tpl-ok">{ok}</div>}
        {!!err && <div style={{ fontSize: 12.5, color: '#b91c1c', backgroundColor: '#fef2f2', padding: 8, borderRadius: 8, marginBottom: 8 }} data-testid="tpl-error">{err}{errs.length > 0 && <ul style={{ margin: '4px 16px 0 0', padding: 0 }}>{errs.map((x, i) => <li key={i}>{x}</li>)}</ul>}</div>}

        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {(['sections', 'inputs', 'settings'] as const).map((t) => <button key={t} onClick={() => setTab(t)} data-testid={`tpl-tab-${t}`} style={btn(tab === t ? '#0f2440' : '#cbd5e1', { color: tab === t ? '#fff' : '#0f2440' })}>{{ sections: `الأقسام (${f.sections.length})`, inputs: `المدخلات اليدوية (${f.input_fields.length})`, settings: 'الإعدادات' }[t]}</button>)}
        </div>

        {tab === 'settings' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="النطاق"><select style={inp} value={f.organization_id} disabled={!!tpl} onChange={(e) => set('organization_id', e.target.value)} data-testid="tpl-org">{isGlobalAdmin && <option value="">قالب عام (كل الجامعة)</option>}{orgs.filter((o) => !me || me.is_super || isGlobalAdmin || hasAnywhere('template.create')).map((o) => <option key={o.id} value={o.id}>{o.name_ar} ({o.code})</option>)}</select></Field>
            <Field label="نوع الوثيقة *"><select style={inp} value={f.document_type_id} onChange={(e) => set('document_type_id', e.target.value)} data-testid="tpl-doctype"><option value="">— اختر —</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name_ar} ({t.code})</option>)}</select></Field>
            <Field label="الكود *"><input style={{ ...inp, direction: 'ltr' }} value={f.code} disabled={!!tpl} onChange={(e) => set('code', e.target.value.toUpperCase().replace(/\s+/g, '_'))} data-testid="tpl-code" /></Field>
            <Field label="الاسم العربي *"><input style={inp} value={f.name_ar} onChange={(e) => set('name_ar', e.target.value)} data-testid="tpl-name" /></Field>
            <Field label="الاسم الإنجليزي"><input style={{ ...inp, direction: 'ltr' }} value={f.name_en} onChange={(e) => set('name_en', e.target.value)} /></Field>
            <Field label="الفئة"><select style={inp} value={f.template_category} onChange={(e) => set('template_category', e.target.value)}>{['GENERAL', 'STUDENT', 'EMPLOYEE', 'FACULTY', 'DECISION', 'MEMO'].map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
            <Field label="الترويسة المرجعية"><select style={inp} value={f.letterhead_id} onChange={(e) => set('letterhead_id', e.target.value)} data-testid="tpl-letterhead"><option value="">افتراضية الجهة (موروثة)</option>{lhs.map((l) => <option key={l.id} value={l.id}>{l.name_ar} — {l.organization_name}</option>)}</select></Field>
            <Field label="مرحلة تجميد البيانات"><select style={inp} value={f.freeze_stage} disabled={!!tpl} onChange={(e) => set('freeze_stage', e.target.value)} data-testid="tpl-freeze"><option value="ISSUED">عند الإصدار (افتراضي)</option><option value="SIGNED">عند التوقيع</option><option value="APPROVED">عند الاعتماد</option></select></Field>
            <Field label="الوصف" style={{ gridColumn: '1 / -1' }}><input style={inp} value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
            <Field label="الكيانات المطلوبة (يجب ربطها بالمراسلة قبل التقديم)" style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', gap: 10 }}>{[['STUDENT', 'طالب'], ['EMPLOYEE', 'موظف'], ['FACULTY', 'عضو هيئة تدريس']].map(([k, v]) => <label key={k} style={{ fontSize: 12.5, display: 'flex', gap: 5 }}><input type="checkbox" checked={f.required_entities.includes(k)} onChange={() => set('required_entities', f.required_entities.includes(k) ? f.required_entities.filter((x: string) => x !== k) : [...f.required_entities, k])} data-testid={`tpl-req-${k}`} /> {v}</label>)}</div>
            </Field>
            {tpl && <Field label="ملاحظة الإصدار" style={{ gridColumn: '1 / -1' }}><input style={inp} value={f.change_note} onChange={(e) => set('change_note', e.target.value)} placeholder="ما الذي تغيّر؟" data-testid="tpl-change-note" /></Field>}
            {tpl?.versions?.length > 0 && <div style={{ gridColumn: '1 / -1', fontSize: 12 }}><b>الإصدارات:</b> {tpl.versions.map((v: any) => <span key={v.version_number} style={{ marginRight: 8 }}><Badge text={`v${v.version_number}${v.is_published ? ' ✓' : ''}`} color={v.is_published ? '#16a34a' : '#64748b'} /> <span style={{ color: '#64748b' }}>{v.change_note}</span></span>)}</div>}
          </div>
        )}
        {tab === 'sections' && (
          <div>
            {!tpl && <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>أكمل «الإعدادات» (النطاق، نوع الوثيقة، الكود، الاسم) ثم أنشئ المسودة.</div>}
            {[...f.sections].sort((a: Section, b: Section) => a.order - b.order).map((s: Section, i: number) => (
              <SectionCard key={s.id} s={s} idx={i} total={f.sections.length} phs={phForEditor} onChange={updateSection} onMove={(d) => moveSection(s.id, d)} onDelete={() => set('sections', f.sections.filter((x: Section) => x.id !== s.id))} onFocus={() => setActive(s.id)} active={active === s.id} />
            ))}
            <button onClick={addSection} style={btn('#0ea5e9')} data-testid="tpl-add-section">+ قسم</button>
          </div>
        )}
        {tab === 'inputs' && (
          <div>
            <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>المدخلات اليدوية تُدرج في النص بصيغة <code>{'{{input.key}}'}</code> ويملؤها كاتب الخطاب.</div>
            {f.input_fields.map((x: InputField, i: number) => (
              <div key={i} data-testid={`tpl-input-${i}`} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 110px 90px 80px auto', gap: 6, alignItems: 'end', padding: 8, border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 6 }}>
                <Field label="المفتاح (لاتيني)" style={{ marginBottom: 0 }}><input style={{ ...small, direction: 'ltr' }} value={x.key} onChange={(e) => updInput(i, { key: e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase() })} data-testid={`tpl-input-key-${i}`} /></Field>
                <Field label="التسمية" style={{ marginBottom: 0 }}><input style={small} value={x.label_ar} onChange={(e) => updInput(i, { label_ar: e.target.value })} data-testid={`tpl-input-label-${i}`} /></Field>
                <Field label="النوع" style={{ marginBottom: 0 }}><select style={small} value={x.type} onChange={(e) => updInput(i, { type: e.target.value })}>{Object.entries(INPUT_TYPE_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <Field label="أقصى طول" style={{ marginBottom: 0 }}><input type="number" style={small} value={x.max_length || ''} onChange={(e) => updInput(i, { max_length: e.target.value ? Number(e.target.value) : null })} /></Field>
                <label style={{ fontSize: 11.5, display: 'flex', gap: 4, paddingBottom: 6 }}><input type="checkbox" checked={x.required} onChange={(e) => updInput(i, { required: e.target.checked })} /> إلزامي</label>
                <button onClick={() => set('input_fields', f.input_fields.filter((_: any, k: number) => k !== i))} style={ib('#dc2626')}>حذف</button>
                {x.type === 'SELECT' && <Field label="الخيارات (مفصولة بفاصلة)" style={{ gridColumn: '1 / -1', marginBottom: 0 }}><input style={small} value={x.options.join(', ')} onChange={(e) => updInput(i, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })} /></Field>}
              </div>
            ))}
            <button onClick={addInput} style={btn('#0ea5e9')} data-testid="tpl-add-input">+ مدخل</button>
          </div>
        )}
      </div>
      <div style={{ position: 'sticky', top: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#0f2440', marginBottom: 6 }}>معاينة هيكل القالب (العناصر النائبة تظهر كتسميات)</div>
        <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 160px)', padding: 8, backgroundColor: '#e2e8f0', borderRadius: 10 }}>
          <A4Preview letterhead={letterhead} sections={previewSections} orgName={orgs.find((o) => o.id === f.organization_id)?.name_ar || 'اسم الجهة'} scale={0.62} highlight={active} onSectionClick={setActive} watermark="نموذج" />
        </div>
      </div>
    </div>
  );
};

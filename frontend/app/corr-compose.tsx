import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { corrAPI, errMsgFull, errList, openPdf, STATUS_AR, STATUS_COLOR, EDITABILITY_AR, SECTION_TYPE_AR, ENTITY_KIND } from '../src/services/corrAPI';
import { CorrPage, card, btn, inp, lbl, Badge, Modal, Field, Empty, useCorrMe } from '../src/components/corr/CorrUI';
import { TipTapEditor } from '../src/components/corr/TipTapEditor';
import { A4Preview } from '../src/components/corr/A4Preview';
import { EntityPicker } from '../src/components/corr/EntityPicker';

const EDITABLE = ['EDITABLE', 'DEFAULT_EDITABLE', 'STRUCTURED'];

export default function CorrCompose() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { hasAnywhere } = useCorrMe();
  const { width } = useWindowDimensions();
  const narrow = width < 1100;
  const [bundle, setBundle] = useState<any | null>(null);
  const [prev, setPrev] = useState<any | null>(null);
  const [mode, setMode] = useState<'preview' | 'edit'>('preview');
  const [templates, setTemplates] = useState<any[]>([]);
  const [lhs, setLhs] = useState<any[]>([]);
  const [phs, setPhs] = useState<any[]>([]);
  const [sugg, setSugg] = useState<any | null>(null);
  const [showAllKinds, setShowAllKinds] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [inputs, setInputs] = useState<Record<string, any>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [errs, setErrs] = useState<string[]>([]);
  const [ok, setOk] = useState('');
  const [picker, setPicker] = useState<string | null>(null);
  const [pickTpl, setPickTpl] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const timer = useRef<any>(null);
  const cvRef = useRef<number>(0);

  const load = useCallback(async () => {
    if (!id) return;
    setErr('');
    try {
      const b = (await corrAPI.content(id)).data;
      setBundle(b);
      cvRef.current = b.content?.content_version || 0;
      setValues({ ...(b.content?.section_values || {}) });
      setInputs({ ...(b.content?.input_values || {}) });
      setDirty(false);
      if (b.content) setPrev((await corrAPI.preview(id, mode)).data); else setPrev(null);
    } catch (e) { setErr(errMsgFull(e, 'تعذر تحميل المراسلة')); }
  }, [id, mode]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { corrAPI.placeholders().then((r) => setPhs(r.data.items.map((p: any) => ({ key: p.key, label_ar: `${p.namespace_ar} › ${p.label_ar}` })))).catch(() => {}); }, []);
  useEffect(() => { if (id && bundle && !bundle.content) corrAPI.suggestions(id).then((r) => setSugg(r.data)).catch(() => setSugg(null)); }, [id, !!bundle, bundle?.content?.template_id]);
  useEffect(() => {
    if (!bundle?.correspondence?.organization_id) return;
    corrAPI.templates({ for_use: true, organization_id: bundle.correspondence.organization_id, page_size: 200 }).then((r) => setTemplates(r.data.items)).catch(() => {});
    corrAPI.letterheads({ organization_id: bundle.correspondence.organization_id }).then((r) => setLhs(r.data.filter((l: any) => l.is_active))).catch(() => {});
  }, [bundle?.correspondence?.organization_id]);

  const c = bundle?.correspondence;
  const content = bundle?.content;
  const version = bundle?.template_version;
  const canEdit = !!c && ['DRAFT', 'CHANGES_REQUESTED'].includes(c.status) && c.can_edit !== false && !bundle?.frozen;
  const inputDefs: any[] = version?.input_fields || [];
  const linkedNs = new Set((bundle?.entities || []).map((e: any) => ({ STUDENT: 'student', EMPLOYEE: 'employee', TEACHER: 'faculty', FACULTY: 'faculty' } as any)[e.entity_type]).filter(Boolean));
  const suggKeys = new Set(phs.filter((p) => linkedNs.has(p.key.split('.')[0]) || p.key.startsWith('correspondence.')).map((p) => p.key));
  const sections: any[] = [...(version?.sections || [])].sort((a, b) => a.order - b.order);

  const save = useCallback(async (sv: Record<string, string>, iv: Record<string, any>, silent = false) => {
    if (!content || !canEdit) return;
    setSaving(true); setErr(''); setErrs([]);
    try {
      const r = await corrAPI.patchContent(id!, { section_values: sv, input_values: iv, content_version: cvRef.current });
      cvRef.current = r.data.content_version;
      setBundle((b: any) => ({ ...b, content: r.data }));
      setDirty(false);
      setPrev((await corrAPI.preview(id!, mode)).data);
      setOk(silent ? 'حُفظ تلقائياً' : 'تم الحفظ');
    } catch (e: any) {
      setErr(errMsgFull(e, 'فشل الحفظ')); setErrs(errList(e));
      if (e?.response?.status === 409) setTimeout(load, 800);
    } finally { setSaving(false); }
  }, [content, canEdit, id, mode, load]);

  const schedule = (sv: Record<string, string>, iv: Record<string, any>) => {
    setDirty(true); setOk('');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(sv, iv, true), 1400);
  };
  const setSection = (sid: string, html: string) => { const sv = { ...values, [sid]: html }; setValues(sv); schedule(sv, inputs); };
  const setInput = (k: string, v: any) => { const iv = { ...inputs, [k]: v }; setInputs(iv); schedule(values, iv); };
  const applyTemplate = async (tid: string) => { setErr(''); try { await corrAPI.applyTemplate(id!, tid); setPickTpl(false); await load(); } catch (e) { setErr(errMsgFull(e, 'تعذر تطبيق القالب')); } };
  const setLetterhead = async (lid: string) => { if (!content) return; try { const r = await corrAPI.patchContent(id!, { letterhead_id: lid, content_version: cvRef.current }); cvRef.current = r.data.content_version; setBundle((b: any) => ({ ...b, content: r.data })); await load(); } catch (e) { setErr(errMsgFull(e)); } };
  const linkEntity = async (type: string, item: any) => { setErr(''); try { await corrAPI.addEntity(id!, { entity_type: type, entity_id: item.id, relationship_type: 'SUBJECT' }); setPicker(null); await load(); } catch (e) { setErr(errMsgFull(e, 'تعذر الربط')); } };
  const unlinkEntity = async (eid: string) => { try { await corrAPI.removeEntity(id!, eid); await load(); } catch (e) { setErr(errMsgFull(e)); } };
  const submit = async () => {
    if (timer.current) clearTimeout(timer.current);
    if (dirty) await save(values, inputs, true);
    setErr(''); setErrs([]);
    try { await corrAPI.transition(id!, 'submit'); router.replace({ pathname: '/corr-details', params: { id } } as any); }
    catch (e: any) { setErr(errMsgFull(e, 'لا يمكن التقديم')); setErrs(errList(e)); }
  };

  if (!bundle) return <CorrPage title="محرر الخطاب" loading={!err}>{!!err && <Empty text={err} />}</CorrPage>;
  const color = STATUS_COLOR[c.status] || '#64748b';
  const entitiesOf = (t: string) => (bundle.entities || []).filter((e: any) => (e.entity_type === 'TEACHER' ? 'FACULTY' : e.entity_type) === t);
  const problems = prev ? [...(prev.missing_entities || []).map((x: string) => `الكيان المطلوب غير محدد: ${ENTITY_KIND[x]?.label || x}`), ...(prev.missing_inputs || []).map((x: string) => `مدخل إلزامي فارغ: ${inputDefs.find((d) => d.key === x)?.label_ar || x}`), ...(prev.missing_required_sections || []).map((x: string) => `قسم إلزامي فارغ: ${sections.find((s) => s.id === x)?.title || x}`), ...(prev.unresolved || []).filter((x: string) => x !== 'correspondence.official_number').map((x: string) => `عنصر غير محلول: ${x}`)] : [];

  const header = (
    <div style={{ ...card, borderRight: `6px solid ${color}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Badge text={STATUS_AR[c.status] || c.status} color={color} testID="compose-status" />
        {bundle.frozen && <Badge text={`مُجمَّدة (${bundle.snapshot?.stage})`} color="#0f766e" testID="compose-frozen" />}
        {content && <span style={{ fontSize: 12.5 }}>القالب: <b>{templates.find((t) => t.id === content.template_id)?.name_ar || content.template_id}</b> <code style={{ fontSize: 11 }}>v{content.template_version_number}</code></span>}
        {saving ? <span style={{ fontSize: 11.5, color: '#f59e0b' }} data-testid="compose-saving">جارٍ الحفظ…</span> : dirty ? <span style={{ fontSize: 11.5, color: '#64748b' }} data-testid="compose-dirty">تغييرات غير محفوظة</span> : ok ? <span style={{ fontSize: 11.5, color: '#16a34a' }} data-testid="compose-saved">✓ {ok}</span> : null}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={() => setMode(mode === 'preview' ? 'edit' : 'preview')} style={btn('#475569')} data-testid="compose-mode">{mode === 'preview' ? 'عرض التسميات' : 'عرض القيم'}</button>
        {canEdit && content && <button onClick={() => { if (timer.current) clearTimeout(timer.current); save(values, inputs); }} disabled={saving || !dirty} style={btn('#1565c0')} data-testid="compose-save">حفظ</button>}
        {canEdit && content && (c.allowed_actions || []).includes('submit') && <button onClick={submit} disabled={saving} style={btn('#0ea5e9')} data-testid="compose-submit">تقديم للمراجعة</button>}
        <button onClick={() => openPdf(id!, setErr)} style={btn('#b45309')} data-testid="compose-pdf">{['ISSUED', 'ARCHIVED'].includes(c.status) ? 'PDF الرسمي' : 'PDF مسودة'}</button>
        <button onClick={() => router.push({ pathname: '/corr-details', params: { id } } as any)} style={btn('#94a3b8')} data-testid="compose-back-details">التفاصيل</button>
      </div>
    </div>
  );

  const editorPane = (
    <div>
      {!!err && <div style={{ ...card, color: '#b91c1c', backgroundColor: '#fef2f2' }} data-testid="compose-error">{err}{errs.length > 0 && <ul style={{ margin: '4px 16px 0 0', padding: 0, fontSize: 12.5 }}>{errs.map((x, i) => <li key={i}>{x}</li>)}</ul>}</div>}
      {!content ? (
        <div style={card} data-testid="compose-no-template">
          <b style={{ color: '#0f2440' }}>اختر قالباً لبدء الكتابة</b>
          <div style={{ fontSize: 12, color: '#64748b', margin: '4px 0 10px' }}>القوالب المنشورة المتاحة لجهتك (العامة + الموروثة). الكتابة من الصفر تستخدم قالب «مراسلة عامة».</div>
          {!hasAnywhere('template.use') ? <div style={{ color: '#b91c1c', fontSize: 12.5 }}>ليس لديك صلاحية استخدام القوالب</div> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 }}>
              {sugg && sugg.templates.filter((t: any) => t.score > 0).length > 0 && <div style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 800, color: '#7c3aed' }} data-testid="compose-suggested-title">✦ مقترحة لك</div>}
              {sugg && sugg.templates.filter((t: any) => t.score > 0).slice(0, 4).map((t: any) => (
                <div key={`s-${t.id}`} onClick={() => canEdit && applyTemplate(t.id)} data-testid={`compose-sugg-${t.code}`} style={{ border: '1.5px solid #c4b5fd', backgroundColor: '#faf5ff', borderRadius: 10, padding: 10, cursor: canEdit ? 'pointer' : 'default' }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>{t.name_ar}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>{t.reasons.map((r: string) => <span key={r} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, backgroundColor: '#ede9fe', color: '#5b21b6' }}>{r}</span>)}</div>
                </div>
              ))}
              {sugg && sugg.templates.filter((t: any) => t.score > 0).length > 0 && <div style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 800, color: '#475569', marginTop: 4 }}>كل القوالب</div>}
              {templates.filter((t) => !c.document_type_id || t.document_type_id === c.document_type_id || t.code === 'GENERAL_CORRESPONDENCE').map((t) => (
                <div key={t.id} onClick={() => canEdit && applyTemplate(t.id)} data-testid={`compose-tpl-${t.code}`} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, cursor: canEdit ? 'pointer' : 'default', backgroundColor: '#fff' }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>{t.name_ar}</div><div style={{ fontSize: 11, color: '#64748b' }}>{t.description}</div>
                  <div style={{ marginTop: 4 }}>{t.is_global ? <Badge text="عام" color="#7c3aed" /> : <Badge text="قالب الجهة" color="#0f766e" />} <code style={{ fontSize: 10 }}>v{t.current_version}</code></div>
                </div>
              ))}
              {templates.length > 0 && templates.filter((t) => t.document_type_id === c.document_type_id).length === 0 && <div style={{ fontSize: 11.5, color: '#64748b', gridColumn: '1 / -1' }}>لا قوالب مطابقة لنوع الوثيقة الحالي — يمكنك اختيار أي قالب وسيُحدَّث نوع الوثيقة تلقائياً:</div>}
              {templates.filter((t) => t.document_type_id !== c.document_type_id && t.code !== 'GENERAL_CORRESPONDENCE').map((t) => (
                <div key={t.id} onClick={() => canEdit && applyTemplate(t.id)} data-testid={`compose-tpl-${t.code}`} style={{ border: '1px dashed #cbd5e1', borderRadius: 10, padding: 10, cursor: canEdit ? 'pointer' : 'default', opacity: 0.85 }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>{t.name_ar}</div><div style={{ fontSize: 11, color: '#64748b' }}>{t.description}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (<>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <b style={{ color: '#0f2440' }}>الإعداد</b>
            {canEdit && <button onClick={() => setPickTpl(true)} style={btn('#7c3aed', { padding: '4px 10px' })} data-testid="compose-change-tpl">تغيير القالب</button>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginTop: 8 }}>
            <Field label="الترويسة"><select style={inp} value={content.letterhead_id || ''} disabled={!canEdit} onChange={(e) => setLetterhead(e.target.value)} data-testid="compose-letterhead">{lhs.map((l) => <option key={l.id} value={l.id}>{l.name_ar} — {l.organization_name}</option>)}{content.letterhead_id && !lhs.some((l) => l.id === content.letterhead_id) && <option value={content.letterhead_id}>{bundle.letterhead?.name_ar}</option>}</select></Field>
            {['STUDENT', 'EMPLOYEE', 'FACULTY'].filter((t) => (version?.required_entities || []).includes(t) || entitiesOf(t).length > 0 || showAllKinds).map((t: string) => {
              const list = entitiesOf(t); const k = ENTITY_KIND[t]; const req = (version?.required_entities || []).includes(t);
              return (
                <div key={t} data-testid={`compose-entity-group-${t}`}><label style={lbl}>{k?.label || t}{req ? ' *' : ''} {list.length > 1 && <span style={{ color: '#7c3aed' }}>({list.length})</span>}</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {list.map((e: any, i: number) => (
                      <span key={e.id} data-testid={i === 0 ? `compose-entity-${t}` : `compose-entity-${t}-${i}`} style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 12, padding: '3px 8px', borderRadius: 999, backgroundColor: '#f3e8ff', color: '#4c1d95', fontWeight: 700 }}>
                        {e.label || e.entity_id}{e.code ? <code style={{ fontSize: 10, color: '#6b21a8' }}>{e.code}</code> : null}
                        {canEdit && <button onClick={() => unlinkEntity(e.id)} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', padding: 0 }} title="إزالة">✕</button>}
                      </span>
                    ))}
                    {canEdit && <button disabled={!hasAnywhere(k?.perm || '')} onClick={() => setPicker(t)} style={btn('#7c3aed', { padding: '4px 10px' })} data-testid={list.length ? `compose-add-${t}` : `compose-pick-${t}`}>{hasAnywhere(k?.perm || '') ? (list.length ? `+ إضافة ${k?.label}` : `اختيار ${k?.label}`) : 'لا صلاحية للاختيار'}</button>}
                  </div>
                </div>
              );
            })}
            {canEdit && !showAllKinds && <div><label style={lbl}>&nbsp;</label><button onClick={() => setShowAllKinds(true)} style={btn('#64748b', { padding: '4px 10px' })} data-testid="compose-add-people">+ إضافة أشخاص آخرين (طلاب/موظفون/هيئة تدريس)</button><div style={{ fontSize: 10.5, color: '#64748b', marginTop: 4 }}>للقوائم المتعددة استخدم العناصر: {'{{students.table}}'} · {'{{employees.list}}'} · {'{{faculty_members.count}}'}</div></div>}
          </div>
          {inputDefs.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0f2440', marginBottom: 6 }}>المدخلات اليدوية</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                {inputDefs.map((d) => (
                  <Field key={d.key} label={`${d.label_ar}${d.required ? ' *' : ''}`}>
                    {d.type === 'TEXTAREA' ? <textarea style={{ ...inp, minHeight: 60 }} disabled={!canEdit} value={inputs[d.key] ?? d.default_value ?? ''} maxLength={d.max_length || undefined} onChange={(e) => setInput(d.key, e.target.value)} data-testid={`compose-input-${d.key}`} />
                      : d.type === 'SELECT' ? <select style={inp} disabled={!canEdit} value={inputs[d.key] ?? ''} onChange={(e) => setInput(d.key, e.target.value)} data-testid={`compose-input-${d.key}`}><option value="">— اختر —</option>{(d.options || []).map((o: string) => <option key={o} value={o}>{o}</option>)}</select>
                        : <input type={d.type === 'DATE' ? 'date' : d.type === 'NUMBER' ? 'number' : 'text'} style={inp} disabled={!canEdit} value={inputs[d.key] ?? d.default_value ?? ''} maxLength={d.max_length || undefined} onChange={(e) => setInput(d.key, e.target.value)} data-testid={`compose-input-${d.key}`} />}
                  </Field>
                ))}
              </div>
            </div>
          )}
        </div>
        <div style={card}>
          <b style={{ color: '#0f2440' }}>أقسام الخطاب</b>
          <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 8 }}>الأقسام المقفلة والنظامية تُملأ تلقائياً ولا يمكن تغييرها · يُحفظ تلقائياً بعد التوقف عن الكتابة</div>
          {sections.map((s) => {
            const ed = EDITABLE.includes(s.editable) && canEdit;
            const rendered = prev?.sections?.find((x: any) => x.id === s.id)?.html;
            return (
              <div key={s.id} data-testid={`compose-section-${s.id}`} style={{ marginBottom: 10, border: `1.5px solid ${active === s.id ? '#0ea5e9' : '#eef0f3'}`, borderRadius: 10, padding: 8 }} onClick={() => setActive(s.id)}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                  <b style={{ fontSize: 12.5 }}>{s.title || SECTION_TYPE_AR[s.type] || s.type}</b>
                  <Badge text={EDITABILITY_AR[s.editable]?.label || s.editable} color={EDITABILITY_AR[s.editable]?.color || '#64748b'} />
                  {s.required && <Badge text="إلزامي" color="#dc2626" />}
                  {rendered === undefined && prev && <Badge text="مخفي بشرط" color="#94a3b8" />}
                </div>
                {ed ? <TipTapEditor value={values[s.id] ?? s.content ?? ''} onChange={(h) => setSection(s.id, h)} placeholders={[...inputDefs.map((d) => ({ key: `input.${d.key}`, label_ar: `★ مدخلات › ${d.label_ar}` })), ...phs.filter((p) => suggKeys.has(p.key)).map((p) => ({ ...p, label_ar: `★ ${p.label_ar}` })), ...phs.filter((p) => !suggKeys.has(p.key))]} minHeight={s.type === 'BODY' ? 180 : 60} testID={`compose-editor-${s.id}`} />
                  : <div style={{ fontSize: 13, color: '#334155', backgroundColor: '#f8fafc', padding: '6px 10px', borderRadius: 8, lineHeight: 1.7 }} className="a4-sec" dangerouslySetInnerHTML={{ __html: rendered ?? values[s.id] ?? s.content ?? '' }} />}
              </div>
            );
          })}
        </div>
      </>)}
    </div>
  );

  const previewPane = content && (
    <div style={{ position: narrow ? 'static' : 'sticky', top: 8 }}>
      <div style={{ ...card, padding: 10, marginBottom: 8 }} data-testid="compose-checklist">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b style={{ fontSize: 12.5, color: '#0f2440' }}>جاهزية التقديم</b>
          <Badge text={prev?.source === 'SNAPSHOT' ? 'من اللقطة المجمّدة' : 'بيانات حيّة'} color={prev?.source === 'SNAPSHOT' ? '#0f766e' : '#0ea5e9'} testID="compose-source" />
        </div>
        {problems.length === 0 ? <div style={{ fontSize: 12, color: '#166534', marginTop: 4 }} data-testid="compose-ready">✓ كل المتطلبات مكتملة</div>
          : <ul style={{ margin: '4px 16px 0 0', padding: 0, fontSize: 12, color: '#b91c1c' }} data-testid="compose-problems">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
      </div>
      <div style={{ overflow: 'auto', maxHeight: narrow ? undefined : 'calc(100vh - 230px)', padding: 8, backgroundColor: '#e2e8f0', borderRadius: 10 }}>
        <A4Preview letterhead={prev?.letterhead || bundle.letterhead} sections={prev?.sections || []} orgName={c.organization_name} scale={narrow ? Math.min(1, (width - 60) / 794) : 0.72} highlight={active} onSectionClick={setActive} frozen={bundle.frozen} watermark={c.status === 'DRAFT' ? 'مسودة' : undefined} />
      </div>
    </div>
  );

  return (
    <CorrPage title={`محرر الخطاب — ${c.subject}`} subtitle={`${c.organization_name} · ${c.document_type_name}`} testID="corr-compose">
      {header}
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0,1fr) minmax(0,600px)', gap: 16, alignItems: 'start' }}>
        {editorPane}
        {previewPane}
      </div>
      {picker && <EntityPicker kind={ENTITY_KIND[picker].kind as any} title={`اختيار ${ENTITY_KIND[picker].label}`} onClose={() => setPicker(null)} onPick={(item) => linkEntity(picker, item)} />}
      {pickTpl && (
        <Modal title="تغيير القالب (تُعاد تهيئة المحتوى)" onClose={() => setPickTpl(false)} testID="compose-tpl-modal" width={700}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            {templates.map((t) => <button key={t.id} onClick={() => applyTemplate(t.id)} style={{ ...btn(t.id === content?.template_id ? '#0f2440' : '#f1f5f9', { color: t.id === content?.template_id ? '#fff' : '#0f2440', textAlign: 'right' }) }} data-testid={`compose-tpl-${t.code}`}>{t.name_ar} <code style={{ fontSize: 10 }}>v{t.current_version}</code></button>)}
          </div>
        </Modal>
      )}
    </CorrPage>
  );
}

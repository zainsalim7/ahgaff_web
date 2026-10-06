import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { corrAPI, errMsg, openPdf, ENTITY_KIND } from '../src/services/corrAPI';
import { CorrPage, card, btn, inp, Badge, Denied, useCorrMe } from '../src/components/corr/CorrUI';
import { PersonRecipientFields } from '../src/components/corr/PersonRecipientFields';
import { EntityPicker } from '../src/components/corr/EntityPicker';
import { A4Preview } from '../src/components/corr/A4Preview';

const ISSUE_CHAIN = ['submit', 'review', 'approve', 'sign', 'issue'];
const Step = ({ n, title, done, active }: { n: number; title: string; done: boolean; active: boolean }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <span style={{ width: 26, height: 26, borderRadius: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12.5, backgroundColor: done ? '#16a34a' : active ? '#0f2440' : '#e2e8f0', color: done || active ? '#fff' : '#64748b' }}>{done ? '✓' : n}</span>
    <span style={{ fontWeight: 800, fontSize: 13.5, color: active || done ? '#0f2440' : '#94a3b8' }}>{title}</span>
  </div>
);

export default function CorrQuick() {
  const router = useRouter();
  const { me, hasAnywhere } = useCorrMe();
  const [templates, setTemplates] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [tpl, setTpl] = useState<any | null>(null);
  const [orgId, setOrgId] = useState('');
  const [subject, setSubject] = useState('');
  const [rec, setRec] = useState<any>({ recipient_type: 'INTERNAL_ORGANIZATION', organization_id: '', external_organization: '', external_name: '', recipient_title: '', recipient_role: 'TO', person_type: 'EMPLOYEE', person_id: '', person_label: '' });
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [people, setPeople] = useState<Record<string, { id: string; label: string; code: string }[]>>({});
  const [picker, setPicker] = useState<string | null>(null);
  const [corr, setCorr] = useState<any | null>(null);
  const [prev, setPrev] = useState<any | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [tq, setTq] = useState('');

  useEffect(() => {
    corrAPI.templates({ status: 'PUBLISHED', page_size: 200 }).then((r) => setTemplates((r.data.items || []).filter((t: any) => t.is_active !== false))).catch(() => {});
    corrAPI.organizations().then((r) => setOrgs(r.data)).catch(() => {});
  }, []);
  const allowedOrgs = useMemo(() => orgs.filter((o) => !me || me.is_super || me.can_create_in === 'ALL' || (me.can_create_in as string[]).includes(o.id)), [orgs, me]);
  useEffect(() => { if (!orgId && allowedOrgs.length) setOrgId(allowedOrgs[0].id); }, [allowedOrgs, orgId]);

  const version = tpl?.current || null;
  const inputDefs: any[] = version?.input_fields || tpl?.input_fields || [];
  const required: string[] = version?.required_entities || tpl?.required_entities || [];
  const pickTemplate = async (t: any) => {
    setErr(''); setCorr(null); setPrev(null); setInputs({}); setPeople({});
    try { const full = (await corrAPI.template(t.id)).data; setTpl(full); setSubject(full.name_ar); } catch (e) { setErr(errMsg(e, 'تعذر تحميل القالب')); }
  };
  const recipientOk = rec.recipient_type === 'INTERNAL_PERSON' ? !!rec.person_id : rec.recipient_type === 'INTERNAL_ORGANIZATION' ? !!rec.organization_id : !!(rec.external_organization || rec.external_name);
  const namesOk = required.every((k) => (people[k] || []).length > 0);
  const inputsOk = inputDefs.filter((d) => d.is_required).every((d) => String(inputs[d.key] || '').trim());

  const buildPreview = async () => {
    setErr(''); setBusy('preview');
    try {
      let id = corr?.id;
      if (!id) {
        const recipients: any[] = [];
        if (rec.recipient_type === 'INTERNAL_PERSON') recipients.push({ recipient_type: rec.recipient_type, person_type: rec.person_type, person_id: rec.person_id, recipient_title: rec.recipient_title, recipient_role: 'TO', is_primary: true });
        else if (rec.recipient_type === 'INTERNAL_ORGANIZATION') recipients.push({ recipient_type: rec.recipient_type, organization_id: rec.organization_id, recipient_title: rec.recipient_title, recipient_role: 'TO', is_primary: true });
        else recipients.push({ recipient_type: rec.recipient_type, external_organization: rec.external_organization, external_name: rec.external_name, recipient_title: rec.recipient_title, recipient_role: 'TO', is_primary: true });
        const entities = Object.entries(people).flatMap(([k, arr]) => arr.map((p) => ({ entity_type: k, entity_id: p.id, relationship_type: 'SUBJECT' })));
        const r = await corrAPI.create({ organization_id: orgId, document_type_id: tpl.document_type_id, subject, summary: `خطاب سريع من قالب «${tpl.name_ar}»`, recipients, entities });
        id = r.data.id;
        await corrAPI.applyTemplate(id, tpl.id);
      }
      const content = (await corrAPI.content(id)).data;
      const cv = content.content?.content_version ?? content.content_version ?? 1;
      await corrAPI.patchContent(id, { input_values: inputs, content_version: cv });
      const c = (await corrAPI.get(id)).data;
      setCorr(c);
      setPrev((await corrAPI.preview(id)).data);
    } catch (e) { setErr(errMsg(e, 'تعذر إنشاء المعاينة')); } finally { setBusy(''); }
  };
  const issueAndPrint = async () => {
    if (!corr) return;
    if (!window.confirm('سيُصدر الخطاب برقم رسمي ويُطبع PDF النهائي بالختم و QR. متابعة؟')) return;
    setErr(''); setBusy('issue');
    try {
      let c = corr;
      for (const a of ISSUE_CHAIN) { if (c.status === 'ISSUED') break; await corrAPI.transition(c.id, a); c = (await corrAPI.get(c.id)).data; }
      setCorr(c);
      await openPdf(c.id, setErr);
    } catch (e) { setErr(errMsg(e, 'تعذر الإصدار — قد تحتاج صلاحية الاعتماد/التوقيع، احفظها كمسودة واطلب من المخوّل إصدارها')); } finally { setBusy(''); }
  };
  const resetAll = () => { setTpl(null); setCorr(null); setPrev(null); setInputs({}); setPeople({}); setErr(''); };
  const problems: string[] = prev ? [...(prev.missing_entities || []).map((x: string) => `أسماء مطلوبة: ${ENTITY_KIND[x]?.label || x}`), ...(prev.missing_inputs || []).map((x: string) => `حقل إلزامي: ${inputDefs.find((d) => d.key === x)?.label_ar || x}`)] : [];
  const canIssue = hasAnywhere('correspondence.issue') || me?.is_super;
  const filteredTpls = templates.filter((t) => !tq || (t.name_ar || '').includes(tq) || (t.description || '').includes(tq));

  if (me && !hasAnywhere('template.use') && !hasAnywhere('correspondence.create')) return <CorrPage title="خطاب سريع"><Denied /></CorrPage>;
  return (
    <CorrPage title="خطاب سريع" subtitle="اختر النموذج → حدّد المرسَل إليه والأسماء → معاينة → PDF. بلا خطوات إضافية." testID="corr-quick-page"
      actions={<div style={{ display: 'flex', gap: 8 }}>{tpl && <button onClick={resetAll} style={btn('#f1f5f9', { color: '#0f2440' })} data-testid="quick-reset">↺ نموذج آخر</button>}<button onClick={() => router.push('/corr-list' as any)} style={btn('#f1f5f9', { color: '#0f2440' })} data-testid="quick-goto-list">سجل المراسلات</button></div>}>
      <div style={{ ...card, display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
        <Step n={1} title="النموذج" done={!!tpl} active={!tpl} />
        <Step n={2} title="لمن؟ والأسماء" done={!!prev} active={!!tpl && !prev} />
        <Step n={3} title="معاينة وطباعة" done={corr?.status === 'ISSUED'} active={!!prev} />
      </div>
      {!!err && <div style={{ ...card, color: '#b91c1c', backgroundColor: '#fff5f5' }} data-testid="quick-error">{err}</div>}

      {!tpl && (
        <div style={card} data-testid="quick-templates">
          <input style={{ ...inp, marginBottom: 12 }} placeholder="ابحث في النماذج الجاهزة…" value={tq} onChange={(e) => setTq(e.target.value)} data-testid="quick-template-search" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {filteredTpls.map((t) => (
              <div key={t.id} onClick={() => pickTemplate(t)} data-testid={`quick-tpl-${t.id}`} style={{ border: '1px solid #e6eaf0', borderRadius: 14, padding: 14, cursor: 'pointer', backgroundColor: '#fff', transition: 'box-shadow .15s, transform .15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 8px 24px rgba(15,36,64,0.12)'; e.currentTarget.style.transform = 'translateY(-2px)'; }} onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}>
                <div style={{ fontWeight: 800, fontSize: 14.5, color: '#0f2440' }}>{t.name_ar}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, minHeight: 32 }}>{t.description || t.document_type_name || ''}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {(t.required_entities || []).map((k: string) => <Badge key={k} text={`يحتاج أسماء: ${ENTITY_KIND[k]?.label || k}`} color="#7c3aed" />)}
                  {t.is_global && <Badge text="نموذج عام" color="#64748b" />}
                </div>
              </div>
            ))}
            {filteredTpls.length === 0 && <div style={{ color: '#94a3b8', padding: 20 }}>لا توجد نماذج منشورة — أضفها من «قوالب الخطابات» أو اضغط «✨ القوالب الجاهزة» هناك.</div>}
          </div>
        </div>
      )}

      {tpl && (
        <div style={{ display: 'grid', gridTemplateColumns: prev ? 'minmax(300px, 1fr) minmax(420px, 1.3fr)' : '1fr', gap: 14, alignItems: 'start' }}>
          <div>
            <div style={card} data-testid="quick-form">
              <div style={{ fontWeight: 800, fontSize: 15, color: '#0f2440', marginBottom: 10 }}>📄 {tpl.name_ar}</div>
              {allowedOrgs.length > 1 && <label style={lbl}>الجهة المرسِلة<select style={inp} value={orgId} onChange={(e) => setOrgId(e.target.value)} data-testid="quick-org">{allowedOrgs.map((o) => <option key={o.id} value={o.id}>{o.name_ar}</option>)}</select></label>}
              <label style={lbl}>الموضوع<input style={inp} value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="quick-subject" /></label>
              <div style={{ ...lbl, marginTop: 6 }}>المرسَل إليه</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                {[['INTERNAL_ORGANIZATION', 'جهة داخلية'], ['INTERNAL_PERSON', 'موظف / مدرّس'], ['EXTERNAL_ORGANIZATION', 'جهة خارجية']].map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setRec((p: any) => ({ ...p, recipient_type: k }))} data-testid={`quick-rec-${k}`} style={{ ...btn(rec.recipient_type === k ? '#0f2440' : '#f1f5f9', { color: rec.recipient_type === k ? '#fff' : '#0f2440' }) }}>{l}</button>
                ))}
              </div>
              {rec.recipient_type === 'INTERNAL_ORGANIZATION' && <select style={inp} value={rec.organization_id} onChange={(e) => setRec((p: any) => ({ ...p, organization_id: e.target.value }))} data-testid="quick-rec-org"><option value="">— اختر الجهة —</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name_ar}</option>)}</select>}
              {rec.recipient_type === 'INTERNAL_PERSON' && <PersonRecipientFields rec={rec} onChange={(patch: any) => setRec((p: any) => ({ ...p, ...patch }))} testPrefix="quick" />}
              {rec.recipient_type === 'EXTERNAL_ORGANIZATION' && <div style={{ display: 'grid', gap: 8 }}><input style={inp} placeholder="اسم الجهة الخارجية" value={rec.external_organization} onChange={(e) => setRec((p: any) => ({ ...p, external_organization: e.target.value }))} data-testid="quick-rec-ext-org" /><input style={inp} placeholder="اسم الشخص (اختياري)" value={rec.external_name} onChange={(e) => setRec((p: any) => ({ ...p, external_name: e.target.value }))} data-testid="quick-rec-ext-name" /></div>}
              <input style={{ ...inp, marginTop: 8 }} placeholder="صفة المرسَل إليه (مثال: المحترم / حفظه الله) — اختياري" value={rec.recipient_title} onChange={(e) => setRec((p: any) => ({ ...p, recipient_title: e.target.value }))} data-testid="quick-rec-title" />

              {required.length > 0 && <div style={{ ...lbl, marginTop: 14 }}>الأسماء التي يخصّها الخطاب</div>}
              {required.map((k) => (
                <div key={k} style={{ border: '1px dashed #c4b5fd', borderRadius: 10, padding: 10, marginBottom: 8, backgroundColor: '#faf5ff' }} data-testid={`quick-people-${k}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontWeight: 800, fontSize: 12.5, color: '#5b21b6' }}>{ENTITY_KIND[k]?.label || k} ({(people[k] || []).length})</span>
                    <button type="button" onClick={() => setPicker(k)} style={btn('#7c3aed', { padding: '5px 10px', fontSize: 12 })} data-testid={`quick-add-${k}`}>+ إضافة اسم</button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(people[k] || []).map((p) => <span key={p.id} style={{ backgroundColor: '#fff', border: '1px solid #ddd6fe', borderRadius: 999, padding: '3px 10px', fontSize: 12.5, fontWeight: 700, color: '#0f2440' }}>{p.label}{p.code ? <span style={{ color: '#94a3b8', fontWeight: 500 }}> · {p.code}</span> : null} <span style={{ cursor: 'pointer', color: '#94a3b8' }} onClick={() => setPeople((pp) => ({ ...pp, [k]: pp[k].filter((x) => x.id !== p.id) }))}>✕</span></span>)}
                    {(people[k] || []).length === 0 && <span style={{ fontSize: 12, color: '#94a3b8' }}>لم تُضف أسماء بعد</span>}
                  </div>
                </div>
              ))}

              {inputDefs.length > 0 && <div style={{ ...lbl, marginTop: 14 }}>بيانات الخطاب</div>}
              {inputDefs.map((d) => (
                <label key={d.key} style={lbl}>{d.label_ar || d.key}{d.is_required ? ' *' : ''}
                  {d.field_type === 'TEXTAREA' ? <textarea style={{ ...inp, minHeight: 70 }} value={inputs[d.key] || ''} onChange={(e) => setInputs((p) => ({ ...p, [d.key]: e.target.value }))} data-testid={`quick-input-${d.key}`} />
                    : <input style={inp} type={d.field_type === 'DATE' ? 'date' : d.field_type === 'NUMBER' ? 'number' : 'text'} value={inputs[d.key] || ''} onChange={(e) => setInputs((p) => ({ ...p, [d.key]: e.target.value }))} data-testid={`quick-input-${d.key}`} />}
                </label>
              ))}

              <button onClick={buildPreview} disabled={!!busy || !recipientOk || !subject.trim() || !orgId} style={{ ...btn('#1565c0', { width: '100%', marginTop: 12, padding: '12px', fontSize: 14, opacity: !recipientOk || !subject.trim() ? 0.55 : 1 }) }} data-testid="quick-preview-btn">
                {busy === 'preview' ? 'جاري التجهيز…' : prev ? '🔄 تحديث المعاينة' : '👁 معاينة الخطاب'}
              </button>
              {!recipientOk && <div style={{ fontSize: 11.5, color: '#b45309', marginTop: 6 }}>حدّد المرسَل إليه أولاً</div>}
              {recipientOk && (!namesOk || !inputsOk) && <div style={{ fontSize: 11.5, color: '#b45309', marginTop: 6 }}>{!namesOk ? 'أضف الأسماء المطلوبة · ' : ''}{!inputsOk ? 'أكمل الحقول الإلزامية (*)' : ''} — يمكنك المعاينة الآن وسيظهر الناقص</div>}
            </div>
          </div>

          {prev && (
            <div>
              <div style={{ ...card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }} data-testid="quick-actions">
                <Badge text={corr?.status === 'ISSUED' ? `صادر · ${corr.official_number || ''}` : 'مسودة — بلا رقم'} color={corr?.status === 'ISSUED' ? '#16a34a' : '#f97316'} testID="quick-status" />
                <span style={{ flex: 1 }} />
                <button onClick={() => openPdf(corr.id, setErr)} style={btn('#0f2440')} data-testid="quick-pdf-draft">🖨 PDF {corr?.status === 'ISSUED' ? 'الرسمي' : 'للمراجعة'}</button>
                {corr?.status !== 'ISSUED' && canIssue && <button onClick={issueAndPrint} disabled={!!busy || problems.length > 0} style={btn('#16a34a', { opacity: problems.length ? 0.5 : 1 })} data-testid="quick-issue-btn">{busy === 'issue' ? 'جاري الإصدار…' : '✅ إصدار وطباعة PDF الرسمي'}</button>}
                <button onClick={() => router.push({ pathname: '/corr-compose', params: { id: corr.id } } as any)} style={btn('#f1f5f9', { color: '#0f2440' })} data-testid="quick-open-compose">تحرير متقدم</button>
              </div>
              {problems.length > 0 && <div style={{ ...card, backgroundColor: '#fffbeb', color: '#92400e', fontSize: 12.5 }} data-testid="quick-problems">⚠ قبل الإصدار: {problems.join(' · ')}</div>}
              <div style={{ ...card, padding: 10, overflow: 'auto', backgroundColor: '#e8edf5' }} data-testid="quick-a4">
                <A4Preview letterhead={prev.letterhead} sections={prev.sections || []} orgName={corr?.organization_name} scale={0.78} watermark={corr?.status === 'ISSUED' ? undefined : 'مسودة'} />
              </div>
            </div>
          )}
        </div>
      )}
      {picker && <EntityPicker kind={ENTITY_KIND[picker]?.kind as any} title={`إضافة ${ENTITY_KIND[picker]?.label}`} onClose={() => setPicker(null)} onPick={(item) => { setPeople((pp) => ({ ...pp, [picker]: (pp[picker] || []).some((x) => x.id === item.id) ? pp[picker] : [...(pp[picker] || []), item] })); }} />}
    </CorrPage>
  );
}
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 800, color: '#334155', marginBottom: 8, textAlign: 'right' };

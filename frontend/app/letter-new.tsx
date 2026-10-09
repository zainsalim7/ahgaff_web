import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import api from '../src/services/api';
import { CorrPage, card, btn, inp, lbl, Badge } from '../src/components/corr/CorrUI';
import { downloadBlob, filenameFromResponse } from '../src/utils/exportName';
import { PeoplePicker, Person } from '../src/components/letters/PeoplePicker';

const errOf = (e: any, d: string) => { const x = e?.response?.data?.detail; return typeof x === 'string' ? x : Array.isArray(x) ? x.map((i: any) => i.msg || JSON.stringify(i)).join(' · ') : e?.response?.status ? `${d} (خطأ ${e.response.status})` : e?.message ? `${d} — ${e.message}` : d; };
const blobErr = async (e: any, d: string) => { const b = e?.response?.data; if (b instanceof Blob) { try { const j = JSON.parse(await b.text()); return errOf({ response: { data: j, status: e.response.status } }, d); } catch { /* ignore */ } } return errOf(e, d); };
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const CONCERNS: Record<string, string> = { none: 'عام', student: 'طالب', employee: 'موظف', teacher: 'مدرّس', many: 'عدة أسماء' };
const PEOPLE_VARS = ['اسم_الطالب', 'رقم_القيد', 'الكلية', 'القسم', 'المستوى', 'الجنسية', 'اسم_الموظف', 'الوظيفة', 'وحدة_الموظف', 'اسم_المدرس', 'جدول_الأسماء', 'قائمة_الأسماء', 'عدد_الأسماء'];
const strip = (h: string) => (h || '').replace(/<[^>]+>/g, ' ');
const varsIn = (texts: string[]) => Array.from(new Set(texts.flatMap((t) => Array.from(strip(t).matchAll(/\{([^{}|/]+)\}/g)).map((m) => m[1].trim()))));

type Step = 'template' | 'fill' | 'draft' | 'done';

export default function LetterNewPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<any[]>([]); const [recips, setRecips] = useState<any[]>([]); const [settings, setSettings] = useState<any>(null);
  const [q, setQ] = useState(''); const [tpl, setTpl] = useState<any>(null); const [step, setStep] = useState<Step>('template');
  const [subject, setSubject] = useState(''); const [recId, setRecId] = useState(''); const [manual, setManual] = useState(false);
  const [rec, setRec] = useState({ name: '', title: '', organization: '', suffix: 'المحترم' });
  const [peopleKind, setPeopleKind] = useState('student'); const [people, setPeople] = useState<Person[]>([]);
  const [extra, setExtra] = useState<Record<string, string>>({}); const [addText, setAddText] = useState(''); const [perPerson, setPerPerson] = useState(false);
  const [img, setImg] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [result, setResult] = useState<any>(null); const [draft, setDraft] = useState<any>(null);

  useEffect(() => {
    api.get('/letter-templates').then((r) => setTemplates(r.data)).catch((e) => setErr(errOf(e, 'غير مصرح')));
    api.get('/letters/recipients').then((r) => setRecips(r.data)).catch(() => {});
    api.get('/letters/settings').then((r) => setSettings(r.data)).catch(() => {});
  }, []);

  const known = useMemo(() => new Set<string>([...(settings?.variables || []), 'جدول_الأسماء']), [settings]);
  const tplVars = useMemo(() => tpl ? varsIn([tpl.body, tpl.subject || '', ...Object.values((tpl.sections || {}) as Record<string, string>)]) : [], [tpl]);
  const customVars = tplVars.filter((v) => !known.has(v) && !/^(الطالب|هو|له|طلبه|ـه|يدرس|يحمل|مستمر|مقيد|منتظم|المذكور|حصل|اجتاز|تخرج|خريج)$/.test(v));
  const needsPeople = !!tpl && ((tpl.concerns && tpl.concerns !== 'none') || tplVars.some((v) => PEOPLE_VARS.includes(v)));
  const recipient = manual ? (rec.name || rec.title ? rec : null) : (recips.find((r) => r.id === recId) || null);
  const body = useMemo(() => (tpl?.body || '') + (addText.trim() ? addText.trim().split(/\n+/).map((l) => `<p style="text-align: right">${l}</p>`).join('') : ''), [tpl, addText]);
  const payload = () => ({ template_id: tpl?.id || null, template_name: tpl?.name || 'خطاب', subject, body, recipient: recipient || {}, people: people.map((p) => ({ kind: p.kind, id: p.id })), signatory_name: tpl?.signatory_name || '', signatory_title: tpl?.signatory_title || '', signatory_position_id: tpl?.signatory_position_id || '', letterhead_id: tpl?.letterhead_id || '', series_id: tpl?.series_id || '', extra_vars: extra, base_url: typeof window !== 'undefined' ? window.location.origin : '', per_person: perPerson && people.length > 1, draft_id: draft?.id || undefined });

  const pick = (t: any) => {
    setTpl(t); setSubject(t.subject || t.name); setExtra({}); setAddText(''); setPeople([]); setPerPerson(false); setResult(null); setErr(''); setDraft(null); setImg('');
    if (t.concerns && t.concerns !== 'none' && t.concerns !== 'many') setPeopleKind(t.concerns);
    setStep('fill');
  };
  const missing = () => {
    const m: string[] = [];
    if (!recipient) m.push('المرسَل إليه');
    if (needsPeople && people.length === 0) m.push('الأسماء');
    customVars.forEach((v) => { if (!(extra[v] || '').trim()) m.push(v); });
    if (!subject.trim()) m.push('الموضوع');
    return m;
  };
  const dl = async (url: string, fallback: string, mime: string) => { const r = await api.get(url, { responseType: 'blob' }); downloadBlob(r.data, filenameFromResponse(r, fallback), mime); };
  const loadImg = async (id: string) => { const r = await api.get(`/letters/${id}/pdf?fmt=png`, { responseType: 'blob' }); setImg((o) => { if (o) URL.revokeObjectURL(o); return URL.createObjectURL(new Blob([r.data], { type: 'image/png' })); }); };
  const toDraft = async () => {
    const m = missing(); if (m.length) { setErr(`أكمل المطلوب: ${m.join('، ')}`); return; }
    setErr(''); setBusy(true); setImg('');
    try {
      if (perPerson && people.length > 1) {
        setStep('draft');
        const r = await api.post('/letters/preview-pdf?fmt=png', payload(), { responseType: 'blob' });
        setImg((o) => { if (o) URL.revokeObjectURL(o); return URL.createObjectURL(new Blob([r.data], { type: 'image/png' })); });
      } else {
        const r = await api.post('/letters/draft', payload()); setDraft(r.data); setStep('draft');
        await loadImg(r.data.id);
      }
    } catch (e) { setErr(await blobErr(e, 'تعذر إنشاء المسودة')); setStep('fill'); } finally { setBusy(false); }
  };
  const issue = async () => {
    setBusy(true); setErr('');
    try {
      if (perPerson && people.length > 1) {
        const r = await api.post('/letters/issue-batch', payload());
        await dl(`/letters/batch/${r.data.batch_id}/pdf`, `خطابات ${subject} - ${r.data.count} خطاب.pdf`, 'application/pdf'); setResult({ batch: true, ...r.data });
      } else {
        const r = await api.post(`/letters/${draft.id}/finalize`, null, { params: { base_url: window.location.origin } });
        const full = await api.get(`/letters/${r.data.id}`); setResult({ ...r.data, subject: full.data?.subject });
        await dl(`/letters/${r.data.id}/pdf`, `${subject} - ${r.data.number}.pdf`, 'application/pdf');
        setDraft(null);
      }
      setStep('done');
    } catch (e) { setErr(await blobErr(e, 'فشل الإصدار')); } finally { setBusy(false); }
  };
  const discardDraft = async () => { if (draft) { try { await api.delete(`/letters/${draft.id}`); } catch { /* ignore */ } } setDraft(null); setImg(''); setStep('fill'); };
  const reset = () => { setTpl(null); setStep('template'); setResult(null); setImg(''); setErr(''); setDraft(null); };
  const shown = templates.filter((t) => !q.trim() || `${t.name} ${t.subject || ''}`.includes(q.trim()));
  const stepIdx = ['template', 'fill', 'draft', 'done'].indexOf(step);

  return (
    <CorrPage title="⚡ رسالة جديدة" subtitle="اختر القالب → أدخل المطلوب فقط → مسودة → إصدار برقم. من دون الدخول إلى القوالب والكليشات." testID="letter-new-page" hideNav
      actions={<button onClick={() => router.push('/letters' as any)} style={btn('#f1f5f9', { color: '#0f2440' })} data-testid="letter-new-full-btn">✉️ الخطابات الرسمية (الكامل)</button>}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, direction: 'rtl' }} data-testid="letter-new-steps">
        {['١ القالب', '٢ المطلوب', '٣ المسودة', '٤ الإصدار'].map((s, i) => <span key={s} style={{ padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 800, background: i === stepIdx ? '#0f2440' : i < stepIdx ? '#dcfce7' : '#f1f5f9', color: i === stepIdx ? '#fff' : i < stepIdx ? '#166534' : '#64748b' }}>{s}</span>)}
      </div>
      {!!err && <div style={{ ...card, color: '#b91c1c', fontWeight: 700 }} data-testid="letter-new-error">{err}</div>}

      {step === 'template' && (
        <div style={card} data-testid="letter-new-templates">
          <input style={{ ...inp, marginBottom: 10 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث في قوالب الرسائل…" data-testid="letter-new-search" />
          {shown.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13 }}>لا توجد قوالب محفوظة — أنشئ قالباً من «الخطابات الرسمية → القوالب».</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {shown.map((t) => (
              <div key={t.id} onClick={() => pick(t)} style={{ border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 12, cursor: 'pointer', background: '#fff', textAlign: 'right' }} data-testid={`letter-new-tpl-${t.id}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}><b style={{ fontSize: 14, color: '#0f2440' }}>{t.name}</b><Badge text={CONCERNS[t.concerns] || 'عام'} color={t.concerns && t.concerns !== 'none' ? '#6d28d9' : '#64748b'} /></div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{t.subject || '—'}</div>
                <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 6, maxHeight: 36, overflow: 'hidden' }}>{strip(t.body).slice(0, 110)}…</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 'fill' && tpl && (
        <div style={card} data-testid="letter-new-fill">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
            <div><b style={{ fontSize: 15, color: '#0f2440' }}>{tpl.name}</b> <Badge text={CONCERNS[tpl.concerns] || 'عام'} color="#6d28d9" /></div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => router.push(`/letters?tab=templates&tpl=${tpl.id}` as any)} style={btn('#f1f5f9', { color: '#0f2440', padding: '5px 10px', fontSize: 12 })} data-testid="letter-new-open-tpl">📋 فتح القالب</button>
              <button onClick={reset} style={btn('#f1f5f9', { color: '#0f2440', padding: '5px 10px', fontSize: 12 })} data-testid="letter-new-change-tpl">↩ تغيير القالب</button>
            </div>
          </div>
          <label style={lbl}>الموضوع *</label>
          <input style={inp} value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="letter-new-subject" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <label style={{ ...lbl, marginBottom: 0 }}>المرسَل إليه *</label>
            <button onClick={() => setManual((v) => !v)} style={btn('#f1f5f9', { color: '#0f2440', padding: '3px 10px', fontSize: 11.5 })} data-testid="letter-new-rec-mode">{manual ? 'من القائمة' : 'إدخال يدوي'}</button>
          </div>
          {manual ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input style={inp} placeholder="الصفة (عميد كلية…)" value={rec.title} onChange={(e) => setRec({ ...rec, title: e.target.value })} data-testid="letter-new-rec-title" />
              <input style={inp} placeholder="الاسم مع اللقب" value={rec.name} onChange={(e) => setRec({ ...rec, name: e.target.value })} data-testid="letter-new-rec-name" />
              <input style={inp} placeholder="الجهة" value={rec.organization} onChange={(e) => setRec({ ...rec, organization: e.target.value })} data-testid="letter-new-rec-org" />
              <input style={inp} placeholder="التكريم (المحترم)" value={rec.suffix} onChange={(e) => setRec({ ...rec, suffix: e.target.value })} data-testid="letter-new-rec-suffix" />
            </div>
          ) : (
            <select style={inp} value={recId} onChange={(e) => setRecId(e.target.value)} data-testid="letter-new-recipient">
              <option value="">— اختر المرسَل إليه —</option>
              <optgroup label="داخل الجامعة">{recips.filter((r) => r.kind === 'INTERNAL').map((r) => <option key={r.id} value={r.id}>{r.title} — {r.name}</option>)}</optgroup>
              <optgroup label="جهات خارجية">{recips.filter((r) => r.kind === 'EXTERNAL').map((r) => <option key={r.id} value={r.id}>{r.title} — {r.name}{r.organization ? ` (${r.organization})` : ''}</option>)}</optgroup>
            </select>
          )}
          {needsPeople && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                <label style={{ ...lbl, marginBottom: 0 }}>الأسماء التي يخصّها القالب *</label>
                <select style={{ ...inp, width: 'auto', padding: '4px 8px', fontSize: 12 }} value={peopleKind} onChange={(e) => setPeopleKind(e.target.value)} data-testid="letter-new-people-kind"><option value="student">طلاب</option><option value="employee">موظفون</option><option value="teacher">هيئة تدريس</option></select>
              </div>
              <PeoplePicker kind={peopleKind} people={people} onChange={setPeople} />
              {people.length > 1 && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, marginTop: 6, cursor: 'pointer' }}><input type="checkbox" checked={perPerson} onChange={(e) => setPerPerson(e.target.checked)} data-testid="letter-new-per-person" /> خطاب مستقل لكل اسم (رقم لكل شخص) بدل جدول واحد</label>}
            </>
          )}
          {customVars.length > 0 && (
            <div style={{ marginTop: 12, border: '1px dashed #fcd34d', background: '#fffbeb', borderRadius: 10, padding: 10 }} data-testid="letter-new-vars">
              <label style={lbl}>متغيرات يطلبها القالب *</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                {customVars.map((v) => <div key={v}><div style={{ fontSize: 11.5, color: '#92400e', fontWeight: 700, marginBottom: 3 }}>{`{${v}}`}</div><input style={inp} value={extra[v] || ''} onChange={(e) => setExtra({ ...extra, [v]: e.target.value })} placeholder={v.replace(/_/g, ' ')} data-testid={`letter-new-var-${v}`} /></div>)}
              </div>
            </div>
          )}
          <label style={{ ...lbl, marginTop: 12 }}>إضافة إلى المتن (اختياري — يُلحق بآخر المتن ولا يُحفظ في القالب)</label>
          <textarea style={{ ...inp, minHeight: 70, fontFamily: 'inherit' }} value={addText} onChange={(e) => setAddText(e.target.value)} placeholder="سطر أو فقرة إضافية لهذه الرسالة فقط…" data-testid="letter-new-add-text" />
          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-start' }}>
            <button onClick={toDraft} disabled={busy} style={btn('#0f2440')} data-testid="letter-new-draft-btn">{busy ? '⏳ جاري الإنشاء…' : draft ? '💾 تحديث المسودة ومعاينتها' : '💾 إنشاء مسودة ومعاينتها'}</button>
          </div>
        </div>
      )}

      {step === 'draft' && tpl && (
        <div style={card} data-testid="letter-new-draft">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
            <div>
              <b style={{ fontSize: 14, color: '#0f2440' }}>{draft ? <>مسودة <span style={{ color: '#b45309' }} data-testid="letter-new-draft-number">{draft.number}</span> — محفوظة في سجل الخطابات</> : 'معاينة الرسالة الأولى من الدفعة'} {busy && '⏳'}</b>
              <div style={{ fontSize: 11.5, color: '#64748b' }}>راجعها ثم اعتمدها لتأخذ رقمها الرسمي، أو عدّل المدخلات.</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={() => setStep('fill')} style={btn('#f1f5f9', { color: '#0f2440' })} data-testid="letter-new-back-btn">✏️ تعديل المدخلات</button>
              {draft && <button onClick={() => dl(`/letters/${draft.id}/pdf`, `مسودة ${subject}.pdf`, 'application/pdf')} style={btn('#f1f5f9', { color: '#0f2440' })} data-testid="letter-new-draft-pdf">⬇ PDF المسودة</button>}
              {draft && <button onClick={() => dl(`/letters/${draft.id}/docx`, `مسودة ${subject}.docx`, DOCX)} style={btn('#eff6ff', { color: '#1d4ed8' })} data-testid="letter-new-draft-docx">📝 Word</button>}
              {draft && <button onClick={discardDraft} style={btn('#fef2f2', { color: '#b91c1c' })} data-testid="letter-new-draft-delete">🗑 حذف المسودة</button>}
              <button onClick={issue} disabled={busy} style={btn('#16a34a')} data-testid="letter-new-issue-btn">{perPerson && people.length > 1 ? `✅ إصدار ${people.length} رسائل بأرقامها` : '✅ اعتماد وإصدار برقم'}</button>
            </div>
          </div>
          {img ? <img src={img} alt="معاينة" style={{ width: '100%', maxWidth: 820, display: 'block', margin: '0 auto', boxShadow: '0 6px 20px rgba(0,0,0,.18)', borderRadius: 4 }} data-testid="letter-new-preview-img" /> : <div style={{ color: '#94a3b8', textAlign: 'center', padding: 30 }}>{busy ? 'جاري توليد المعاينة…' : 'تعذر عرض الصورة — يمكنك تنزيل PDF المسودة'}</div>}
        </div>
      )}

      {step === 'done' && result && (
        <div style={{ ...card, border: '2px solid #16a34a', background: '#f0fdf4' }} data-testid="letter-new-done">
          <div style={{ fontSize: 18, fontWeight: 900, color: '#166534' }}>✅ {result.batch ? `صدرت ${result.count} رسائل وتم تنزيل ملف PDF مجمّع` : `صدرت الرسالة برقم ${result.number}`}</div>
          {!result.batch && <div style={{ fontSize: 13, color: '#334155', marginTop: 6 }}>{result.template_name || tpl?.name} — {result.subject || subject}{result.verify_url ? ` · رابط التحقق: ${result.verify_url}` : ''}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {!result.batch && <button onClick={() => dl(`/letters/${result.id}/pdf`, `${subject} - ${result.number}.pdf`, 'application/pdf')} style={btn('#0f2440')} data-testid="letter-new-download-btn">⬇ PDF</button>}
            {!result.batch && <button onClick={() => dl(`/letters/${result.id}/docx`, `${subject} - ${result.number}.docx`, DOCX)} style={btn('#1d4ed8')} data-testid="letter-new-docx-btn">📝 Word</button>}
            <button onClick={() => { setStep('fill'); setResult(null); setImg(''); setDraft(null); }} style={btn('#6d28d9')} data-testid="letter-new-again-same">✉️ رسالة أخرى بنفس القالب</button>
            <button onClick={reset} style={btn('#f1f5f9', { color: '#0f2440' })} data-testid="letter-new-again">⚡ رسالة جديدة</button>
            <button onClick={() => router.push('/letters?tab=log' as any)} style={btn('#f1f5f9', { color: '#0f2440' })} data-testid="letter-new-log">🗂 سجل الخطابات</button>
          </div>
        </div>
      )}
    </CorrPage>
  );
}

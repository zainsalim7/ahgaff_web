import React, { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import api from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';
import { CorrPage, card, btn, inp, th, td, Badge, Field, Modal } from '../src/components/corr/CorrUI';
import { downloadBlob } from '../src/utils/exportName';

const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 800, color: '#334155', marginBottom: 6, textAlign: 'right' };
const errOf = (e: any, d: string) => e?.response?.data?.detail || d;
import { StatementBodyEditor } from '../src/components/statements/StatementBodyEditor';
import { SignatoryPicker, EMPTY_SIGNATORY, Signatory } from '../src/components/statements/SignatoryPicker';
import { LetterheadManager } from '../src/components/letters/LetterheadManager';
import { SeriesManager } from '../src/components/letters/SeriesManager';
import { LetterLayoutEditor, TableColumnsPicker } from '../src/components/letters/LetterLayoutEditor';

type Person = { kind: string; id: string; label: string; sub?: string };

const KIND_AR: Record<string, string> = { student: 'طالب', employee: 'موظف', teacher: 'مدرّس' };
const KIND_COLOR: Record<string, string> = { student: '#2563eb', employee: '#16a34a', teacher: '#9333ea' };

const PeoplePicker = ({ kind, people, onChange }: { kind: string; people: Person[]; onChange: (p: Person[]) => void }) => {
  const [q, setQ] = useState(''); const [hits, setHits] = useState<Person[]>([]);
  useEffect(() => { if (q.trim().length < 2) { setHits([]); return; } const t = setTimeout(() => api.get('/letters/people', { params: { kind, q } }).then((r) => setHits(r.data)).catch(() => setHits([])), 300); return () => clearTimeout(t); }, [q, kind]);
  const mixed = new Set(people.map((p) => p.kind)).size > 1;
  return (
    <div style={{ border: '1px dashed #c4b5fd', borderRadius: 10, padding: 10, backgroundColor: '#faf5ff' }} data-testid="letter-people">
      <div style={{ position: 'relative' }}>
        <input style={inp} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`ابحث بالاسم أو الرقم لإضافة ${KIND_AR[kind] || ''}… (يمكن الجمع بين طلاب وموظفين ومدرّسين في نفس الجدول)`} data-testid="letter-people-search" />
        {hits.length > 0 && <div style={{ position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 20, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)', maxHeight: 240, overflowY: 'auto' }}>
          {hits.map((h) => <div key={h.id} onClick={() => { if (!people.some((p) => p.id === h.id)) onChange([...people, h]); setQ(''); setHits([]); }} style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }} data-testid={`letter-person-hit-${h.id}`}><b>{h.label}</b> <span style={{ color: '#64748b', fontSize: 12 }}>{h.sub}</span></div>)}
        </div>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {people.map((p, i) => <span key={p.id} data-testid={`letter-person-chip-${p.id}`} style={{ background: '#fff', border: `1px solid ${KIND_COLOR[p.kind] || '#ddd6fe'}`, borderRadius: 999, padding: '3px 10px', fontSize: 12.5, fontWeight: 700 }}>{i + 1}. {p.label} <span style={{ color: KIND_COLOR[p.kind] || '#64748b', fontSize: 11 }}>({KIND_AR[p.kind] || p.kind})</span> <span style={{ cursor: 'pointer', color: '#94a3b8' }} onClick={() => onChange(people.filter((x) => x.id !== p.id))}>✕</span></span>)}
        {people.length === 0 && <span style={{ fontSize: 12, color: '#94a3b8' }}>لم تُضف أسماء — ستُملأ المتغيرات ({'{اسم_الطالب}'}، {'{جدول_الأسماء}'}…) من الأسماء المضافة</span>}
        {mixed && <span data-testid="letter-people-mixed" style={{ fontSize: 11.5, color: '#7c3aed', fontWeight: 700, width: '100%' }}>⊞ جدول مختلط: أعمدة موحّدة (الاسم، الصفة، الرقم، الجهة/الكلية، القسم/الوظيفة)</span>}
      </div>
    </div>
  );
};

export default function LettersPage() {
  const params = useLocalSearchParams<{ student_id?: string; employee_id?: string; teacher_id?: string; name?: string }>();
  const [tab, setTab] = useState<'issue' | 'templates' | 'log' | 'settings'>('issue');
  const [templates, setTemplates] = useState<any[]>([]);
  const [recips, setRecips] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const { user } = useAuth();
  const canEdit = !!settings?.can_edit_settings;
  const [err, setErr] = useState('');
  // issue state
  const [tplId, setTplId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState('');
  const [previewImg, setPreviewImg] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewLetterhead, setPreviewLetterhead] = useState(true);
  const [recMode, setRecMode] = useState<'list' | 'manual'>('list');
  const [recId, setRecId] = useState('');
  const [rec, setRec] = useState({ name: '', title: '', organization: '', suffix: 'المحترم' });
  const [peopleKind, setPeopleKind] = useState('student');
  const [people, setPeople] = useState<Person[]>([]);
  const [sig, setSig] = useState<Signatory>(EMPTY_SIGNATORY);
  const [validDays, setValidDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<any>(null);
  const [layoutDefaults, setLayoutDefaults] = useState<any>({});
  const [letterheads, setLetterheads] = useState<any[]>([]); const [seriesList, setSeriesList] = useState<any[]>([]);
  const [lhId, setLhId] = useState(''); const [seriesId, setSeriesId] = useState('');
  const [sections, setSections] = useState<Record<string, string>>({}); const [secLabels, setSecLabels] = useState<Record<string, string>>({});
  const [layout, setLayout] = useState<any>({});
  const [tableHeaders, setTableHeaders] = useState<string[]>([]); const [tableDefaults, setTableDefaults] = useState<string[]>([]);
  const [showLayout, setShowLayout] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [draft, setDraft] = useState<{ id: string; number: string } | null>(null);
  const [perPerson, setPerPerson] = useState(false); const [personAsRec, setPersonAsRec] = useState(false);
  const [batch, setBatch] = useState<any>(null);
  // templates/log state
  const [tform, setTform] = useState<any | null>(null);
  const [log, setLog] = useState<any[]>([]); const [logQ, setLogQ] = useState(''); const [logStatus, setLogStatus] = useState('');

  const loadAll = () => {
    api.get('/letter-templates').then((r) => setTemplates(r.data)).catch(() => {});
    api.get('/letters/recipients').then((r) => setRecips(r.data)).catch(() => {});
    api.get('/letters/settings').then((r) => setSettings(r.data)).catch((e) => setErr(errOf(e, 'غير مصرح')));
    api.get('/letters/layout-defaults').then((r) => setLayoutDefaults(r.data)).catch(() => {});
    loadLhSeries();
  };
  useEffect(() => {
    if (!lhId) return;
    api.get('/letters/section-defaults', { params: { letterhead_id: lhId, template_id: tplId || undefined } }).then((r) => { setSections(r.data.sections || {}); setSecLabels(r.data.labels || {}); }).catch(() => {});
  }, [lhId, tplId]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadLhSeries = () => {
    api.get('/letterheads').then((r) => { setLetterheads(r.data); setLhId((cur) => cur && r.data.some((x: any) => x.id === cur) ? cur : (r.data.find((x: any) => x.is_default) || r.data[0])?.id || ''); }).catch(() => {});
    api.get('/letter-series').then((r) => { setSeriesList(r.data); setSeriesId((cur) => cur && r.data.some((x: any) => x.id === cur) ? cur : (r.data.find((x: any) => x.is_default) || r.data[0])?.id || ''); }).catch(() => {});
  };
  const loadLog = () => api.get('/letters', { params: { q: logQ || undefined, status: logStatus || undefined } }).then((r) => setLog(r.data)).catch(() => {});
  useEffect(loadAll, []);
  useEffect(() => { if (tab === 'log') loadLog(); }, [tab, logQ, logStatus]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const pre = params.student_id ? { kind: 'student', id: params.student_id } : params.employee_id ? { kind: 'employee', id: params.employee_id } : params.teacher_id ? { kind: 'teacher', id: params.teacher_id } : null;
    if (pre) { setPeopleKind(pre.kind); setPeople([{ ...pre, label: (params.name as string) || 'المحدد' }]); }
  }, [params.student_id, params.employee_id, params.teacher_id]); // eslint-disable-line

  const tpl = templates.find((t) => t.id === tplId);
  const pickTpl = (id: string) => {
    setTplId(id); const t = templates.find((x) => x.id === id); if (!t) return;
    setSubject(t.subject || t.name); setBody(t.body); setSig({ position_id: t.signatory_position_id || '', name: t.signatory_position_id ? '' : (t.signatory_name || ''), title: t.signatory_position_id ? '' : (t.signatory_title || '') });
    if (t.concerns && t.concerns !== 'none' && t.concerns !== 'many') setPeopleKind(t.concerns);
    if (t.letterhead_id && letterheads.some((x) => x.id === t.letterhead_id)) setLhId(t.letterhead_id);
    if (t.series_id && seriesList.some((x) => x.id === t.series_id)) setSeriesId(t.series_id);
    setLast(null);
  };
  const recipient = useMemo(() => recMode === 'list' ? (recips.find((r) => r.id === recId) || null) : (rec.name || rec.title ? rec : null), [recMode, recId, recips, rec]);
  const issuePayload = () => ({ template_id: tplId || null, template_name: tpl?.name || 'خطاب', subject, body, recipient: recipient || {}, people: people.map((p) => ({ kind: p.kind, id: p.id })), signatory_name: sig.name, signatory_title: sig.title, signatory_position_id: sig.position_id || '', letterhead_id: lhId, series_id: seriesId, sections, valid_days: validDays ? parseInt(validDays, 10) : null, base_url: typeof window !== 'undefined' ? window.location.origin : '', layout: Object.keys(layout || {}).length ? layout : null, draft_id: draft?.id || null, per_person: perPerson && people.length > 1, person_as_recipient: perPerson && people.length > 1 && personAsRec });
  useEffect(() => {
    if (!body.trim()) { setPreview(''); setPreviewImg((o) => { if (o) URL.revokeObjectURL(o); return ''; }); return; }
    const t = setTimeout(() => {
      api.post('/letters/preview-body', { body, subject, recipient: recipient || {}, people: people.map((p) => ({ kind: p.kind, id: p.id })) }).then((r) => { setPreview(r.data.body); setTableHeaders(r.data.table?.headers || []); setTableDefaults(r.data.table?.default_headers || []); }).catch(() => {});
      setPreviewBusy(true);
      api.post(`/letters/preview-pdf?fmt=png&letterhead=${previewLetterhead}`, issuePayload(), { responseType: 'blob' })
        .then((r) => { const url = URL.createObjectURL(new Blob([r.data], { type: 'image/png' })); setPreviewImg((o) => { if (o) URL.revokeObjectURL(o); return url; }); })
        .catch(() => {}).finally(() => setPreviewBusy(false));
    }, 700);
    return () => clearTimeout(t);
  }, [body, subject, recipient, people, sig, layout, previewLetterhead, perPerson, personAsRec, lhId, seriesId, sections]); // eslint-disable-line react-hooks/exhaustive-deps

  const afterIssue = async (r: any) => {
    setLast(r.data); setDraft(null);
    const pdf = await api.get(`/letters/${r.data.id}/pdf`, { responseType: 'blob' });
    downloadBlob(pdf.data, `خطاب ${r.data.number}.pdf`, 'application/pdf');
  };
  const dlPdf = async (id: string, label: string, letterhead = true) => {
    const r = await api.get(`/letters/${id}/pdf`, { params: { letterhead }, responseType: 'blob' });
    downloadBlob(r.data, `${label}${letterhead ? '' : ' - بلا كليشة'}.pdf`, 'application/pdf');
  };
  const saveAsTemplate = async (src?: any) => {
    const name = window.prompt('اسم القالب الجديد:', src?.subject || subject || '');
    if (!name) return;
    const kinds = new Set((src?.people || people).map((p: any) => p.kind));
    const concerns = (src?.people || people).length > 1 ? 'many' : kinds.size === 1 ? [...kinds][0] : 'none';
    try {
      await api.post('/letter-templates', { name, subject: src?.subject ?? subject, body: src?.inputs?.body || src?.body || body, signatory_name: src ? (src.signatory_position_id ? '' : src.signatory_name) : sig.name, signatory_title: src ? (src.signatory_position_id ? '' : src.signatory_title) : sig.title, signatory_position_id: src ? (src.signatory_position_id || '') : sig.position_id, letterhead_id: src ? (src.letterhead_id || '') : lhId, series_id: src ? (src.series_id || '') : seriesId, sections: src ? (src.inputs?.sections || src.sections || {}) : sections, concerns, is_active: true });
      loadAll(); window.alert(`✅ حُفظ القالب «${name}» — سيظهر في قائمة القوالب`);
    } catch (e) { setErr(errOf(e, 'فشل حفظ القالب')); }
  };
  const isBatch = perPerson && people.length > 1;
  const dlBatchPdf = async (b: any, letterhead = true) => {
    const r = await api.get(`/letters/batch/${b.batch_id}/pdf`, { params: { letterhead }, responseType: 'blob' });
    downloadBlob(r.data, `خطابات ${subject || ''} - ${b.count} خطاب${letterhead ? '' : ' - بلا كليشة'}.pdf`, 'application/pdf');
  };
  const issue = async () => {
    if (!recipient && !(isBatch && personAsRec)) { window.alert('حدّد المرسَل إليه'); return; }
    if (!subject.trim() || !body.trim()) { window.alert('الموضوع والمتن مطلوبان'); return; }
    if (isBatch && !window.confirm(`سيصدر ${people.length} خطاباً مستقلاً (رقم تسلسلي لكل شخص). متابعة؟`)) return;
    setBusy(true); setErr('');
    try {
      if (isBatch) { const r = await api.post('/letters/issue-batch', issuePayload()); setBatch(r.data); setLast(null); setDraft(null); await dlBatchPdf(r.data); }
      else if (draft) { await api.post('/letters/draft', issuePayload()); await afterIssue(await api.post(`/letters/${draft.id}/finalize`, null, { params: { base_url: window.location.origin } })); }
      else await afterIssue(await api.post('/letters/issue', issuePayload()));
    } catch (e) { setErr(errOf(e, 'فشل إصدار الخطاب')); } finally { setBusy(false); }
  };
  const saveDraft = async () => {
    if (!body.trim()) { window.alert('اكتب المتن أولاً'); return; }
    setBusy(true); setErr('');
    try { const r = await api.post('/letters/draft', issuePayload()); setDraft({ id: r.data.id, number: r.data.number }); setLast(null); }
    catch (e) { setErr(errOf(e, 'فشل حفظ المسودة')); } finally { setBusy(false); }
  };
  const resetForm = () => { setDraft(null); setLast(null); setTplId(''); setSubject(''); setBody(''); setPeople([]); setRecId(''); setRec({ name: '', title: '', organization: '', suffix: 'المحترم' }); setLayout({}); setValidDays(''); setSig(EMPTY_SIGNATORY); setBatch(null); setPerPerson(false); setPersonAsRec(false); };
  const loadDraft = async (id: string) => {
    try {
      const { data: d } = await api.get(`/letters/${id}`);
      const inp0 = d.inputs || {};
      setDraft({ id: d.id, number: d.number_display }); setLast(null);
      setTplId(d.template_id || ''); setSubject(d.subject || ''); setBody(inp0.body || d.body || '');
      const r0 = inp0.recipient || d.recipient || {};
      if (r0.id) { setRecMode('list'); setRecId(r0.id); } else { setRecMode('manual'); setRec({ name: r0.name || '', title: r0.title || '', organization: r0.organization || '', suffix: r0.suffix || 'المحترم' }); }
      setPeople((d.people || []).map((p: any) => ({ kind: p.kind, id: p.id, label: p.name })));
      if (d.letterhead_id) setLhId(d.letterhead_id); if (d.series_id) setSeriesId(d.series_id);
      if (d.inputs?.sections && Object.keys(d.inputs.sections).length) setTimeout(() => setSections(d.inputs.sections), 400);
      setSig({ position_id: d.signatory_position_id || '', name: d.signatory_position_id ? '' : (d.signatory_name || ''), title: d.signatory_position_id ? '' : (d.signatory_title || '') }); setValidDays(d.valid_days ? String(d.valid_days) : ''); setLayout(d.layout || {});
      setTab('issue');
    } catch (e) { setErr(errOf(e, 'تعذر فتح المسودة')); }
  };
  const finalizeFromLog = async (l: any) => {
    if (!window.confirm(`اعتماد المسودة ${l.number_display} وإصدارها برقم رسمي؟`)) return;
    try { const r = await api.post(`/letters/${l.id}/finalize`, null, { params: { base_url: window.location.origin } }); const pdf = await api.get(`/letters/${r.data.id}/pdf`, { responseType: 'blob' }); downloadBlob(pdf.data, `خطاب ${r.data.number}.pdf`, 'application/pdf'); loadLog(); }
    catch (e) { setErr(errOf(e, 'فشل الاعتماد')); }
  };
  const saveTpl = async () => { try { if (tform.id) await api.put(`/letter-templates/${tform.id}`, tform); else await api.post('/letter-templates', tform); setTform(null); loadAll(); } catch (e) { setErr(errOf(e, 'فشل الحفظ')); } };
  const vars = settings?.variables || [];

  return (
    <CorrPage title="الخطابات الرسمية" subtitle="مثل الإفادات تماماً: اختر القالب → حدّد المرسَل إليه والأسماء → إصدار وتنزيل PDF برقم تسلسلي ورمز QR" testID="letters-page" hideNav
      actions={<div style={{ display: 'flex', gap: 6 }}>{([['issue', '✉️ إصدار خطاب'], ['templates', '📋 القوالب'], ['log', '🗂 سجل الخطابات'], ['settings', '📄 الكليشات والترقيم']] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} style={btn(tab === k ? '#0f2440' : '#f1f5f9', { color: tab === k ? '#fff' : '#0f2440' })} data-testid={`letters-tab-${k}`}>{l}</button>)}</div>}>
      {!!err && <div style={{ ...card, color: '#b91c1c' }} data-testid="letters-error">{err}</div>}

      {tab === 'issue' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(320px, 1fr)', gap: 14, alignItems: 'start' }}>
          <div style={card} data-testid="letter-form">
            <label style={lbl}>القالب</label>
            <select style={inp} value={tplId} onChange={(e) => pickTpl(e.target.value)} data-testid="letter-template">
              <option value="">— اختر قالب الخطاب —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {templates.length === 0 && <div style={{ fontSize: 12, color: '#b45309', marginTop: 4 }}>لا توجد قوالب بعد — أنشئها من تبويب «القوالب».</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12, padding: 10, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }} data-testid="letter-lh-series">
              <div><label style={lbl}>📄 الكليشة</label><select style={inp} value={lhId} onChange={(e) => setLhId(e.target.value)} data-testid="letter-letterhead-select">{letterheads.map((x) => <option key={x.id} value={x.id}>{x.is_default ? '⭐ ' : ''}{x.name}</option>)}</select></div>
              <div><label style={lbl}>🔢 سلسلة الترقيم</label><select style={inp} value={seriesId} onChange={(e) => setSeriesId(e.target.value)} data-testid="letter-series-select">{seriesList.map((x) => <option key={x.id} value={x.id}>{x.is_default ? '⭐ ' : ''}{x.name} — القادم {x.next_number}</option>)}</select></div>
              <div style={{ gridColumn: '1 / -1', fontSize: 11, color: '#64748b' }}>الكليشة والترقيم مستقلان: نفس الكليشة قد تُستخدم بترقيم داخلي أو خارجي. أنشئ المزيد من تبويب «الكليشات والترقيم».</div>
            </div>
            <label style={{ ...lbl, marginTop: 12 }}>المرسَل إليه</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <button onClick={() => setRecMode('list')} style={btn(recMode === 'list' ? '#0f2440' : '#f1f5f9', { color: recMode === 'list' ? '#fff' : '#0f2440', padding: '6px 12px', fontSize: 12 })} data-testid="letter-rec-list-mode">من المناصب المحفوظة</button>
              <button onClick={() => setRecMode('manual')} style={btn(recMode === 'manual' ? '#0f2440' : '#f1f5f9', { color: recMode === 'manual' ? '#fff' : '#0f2440', padding: '6px 12px', fontSize: 12 })} data-testid="letter-rec-manual-mode">كتابة يدوية</button>
            </div>
            {recMode === 'list' ? (
              <select style={inp} value={recId} onChange={(e) => setRecId(e.target.value)} data-testid="letter-recipient">
                <option value="">— اختر المرسَل إليه —</option>
                <optgroup label="داخل الجامعة">{recips.filter((r) => r.kind === 'INTERNAL').map((r) => <option key={r.id} value={r.id}>{r.title} — {r.name}</option>)}</optgroup>
                <optgroup label="جهات خارجية">{recips.filter((r) => r.kind === 'EXTERNAL').map((r) => <option key={r.id} value={r.id}>{r.title} — {r.name}{r.organization ? ` (${r.organization})` : ''}</option>)}</optgroup>
              </select>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input style={inp} placeholder="الصفة (عميد كلية…)" value={rec.title} onChange={(e) => setRec({ ...rec, title: e.target.value })} data-testid="letter-rec-title" />
                <input style={inp} placeholder="الاسم مع اللقب (د./ فلان)" value={rec.name} onChange={(e) => setRec({ ...rec, name: e.target.value })} data-testid="letter-rec-name" />
                <input style={inp} placeholder="الجهة" value={rec.organization} onChange={(e) => setRec({ ...rec, organization: e.target.value })} data-testid="letter-rec-org" />
                <input style={inp} placeholder="التكريم (المحترم)" value={rec.suffix} onChange={(e) => setRec({ ...rec, suffix: e.target.value })} data-testid="letter-rec-suffix" />
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
              <label style={{ ...lbl, marginBottom: 0 }}>الأسماء التي يخصّها الخطاب (اختياري)</label>
              <select style={{ ...inp, width: 'auto', padding: '4px 8px', fontSize: 12 }} value={peopleKind} onChange={(e) => setPeopleKind(e.target.value)} data-testid="letter-people-kind" title="نوع البحث — تبديل النوع لا يمسح الأسماء المضافة"><option value="student">طلاب</option><option value="employee">موظفون</option><option value="teacher">هيئة تدريس</option></select>
            </div>
            <PeoplePicker kind={peopleKind} people={people} onChange={setPeople} />
            {people.length > 1 && (
              <div style={{ border: `1px solid ${perPerson ? '#fdba74' : '#e2e8f0'}`, background: perPerson ? '#fff7ed' : '#f8fafc', borderRadius: 10, padding: 10, marginTop: 8, fontSize: 12.5 }} data-testid="letter-mode-panel">
                <div style={{ fontWeight: 800, marginBottom: 6 }}>👥 طريقة الإصدار لـ {people.length} أشخاص:</div>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', marginBottom: 4 }}><input type="radio" checked={!perPerson} onChange={() => setPerPerson(false)} data-testid="letter-mode-single" /> خطاب واحد يضمّ الجميع (جدول/قائمة أسماء)</label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}><input type="radio" checked={perPerson} onChange={() => setPerPerson(true)} data-testid="letter-mode-per-person" /> <b>خطاب مستقل لكل شخص</b> — {people.length} خطابات برقم تسلسلي وQR لكل منها، في عملية واحدة وملف PDF مجمّع</label>
                {perPerson && (
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', marginTop: 8, marginRight: 22, color: '#9a3412' }}><input type="checkbox" checked={personAsRec} onChange={(e) => setPersonAsRec(e.target.checked)} data-testid="letter-person-as-recipient" /> الشخص نفسه هو المرسَل إليه (يُوجَّه كل خطاب إلى صاحبه، ويُتجاهل حقل المرسَل إليه أعلاه)</label>
                )}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 8, marginTop: 12 }}>
              <div><label style={lbl}>الموقِّع (المرسِل)</label><SignatoryPicker value={sig} onChange={setSig} defaultLabel={`الافتراضي من الكليشة${settings?.default_signatory_title ? ` — ${settings.default_signatory_title}` : ''}`} hint="من دليل المناصب والأسماء (يُقرأ الاسم والصفة تلقائياً) أو إدخال يدوي." testID="letter-signatory" /></div>
              <div><label style={lbl}>صلاحية (يوم)</label><input style={inp} value={validDays} onChange={(e) => setValidDays(e.target.value)} placeholder="∞" data-testid="letter-valid-days" /></div>
            </div>
            <div style={{ marginTop: 16, borderTop: '2px solid #e2e8f0', paddingTop: 12 }} data-testid="letter-sections">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <b style={{ color: '#0f2440', fontSize: 15 }}>أقسام الخطاب</b>
                <div style={{ display: 'flex', gap: 6 }}>
                  {letterheads.find((x) => x.id === lhId)?.can_edit && <button onClick={async () => { try { await api.patch(`/letterheads/${lhId}/sections`, { sections }); window.alert('حُفظ تنسيق الأقسام كافتراضي لهذه الكليشة'); } catch (e: any) { window.alert(e?.response?.data?.detail || 'فشل الحفظ'); } }} style={btn('#f5f3ff', { color: '#6d28d9', padding: '4px 10px', fontSize: 11.5 })} data-testid="letter-sections-save-lh" title="يصبح هذا التنسيق افتراضياً لكل خطابات هذه الكليشة">💾 حفظ كافتراضي للكليشة</button>}
                  <button onClick={() => api.get('/letters/section-defaults', { params: { letterhead_id: lhId, template_id: tplId || undefined } }).then((r) => setSections(r.data.sections || {}))} style={btn('#f1f5f9', { color: '#0f2440', padding: '4px 10px', fontSize: 11.5 })} data-testid="letter-sections-reset">↺ استعادة</button>
                </div>
              </div>
              <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 8 }}>الأقسام النظامية تُملأ تلقائياً · حرّر أي قسم آخر كما في وورد (خط/حجم/لون/محاذاة) والمتغيرات تُدرج بنقرة</div>
              <SecCard title="الرقم والتاريخ" badge="نظامي" color="#64748b"><div style={{ fontSize: 12.5, color: '#475569', background: '#f8fafc', padding: '6px 10px', borderRadius: 8 }}>الرقم: [يُنشأ من سلسلة الترقيم عند الإصدار] · التاريخ: تلقائي (ميلادي/هجري)</div></SecCard>
              <SecCard title={secLabels.recipient || 'المستلم'} badge="قابل للتحرير" color="#6d28d9"><StatementBodyEditor value={sections.recipient || ''} onChange={(h) => setSections((x) => ({ ...x, recipient: h }))} variables={['{اسم_المرسل_إليه}', '{تكريم}', '{صفة_المرسل_إليه}', '{جهة_المرسل_إليه}']} defaultAlign="right" minHeight={70} testID="letter-sec-recipient" /></SecCard>
              <SecCard title={secLabels.greeting || 'التحية'} badge="قابل للتحرير" color="#6d28d9"><StatementBodyEditor value={sections.greeting || ''} onChange={(h) => setSections((x) => ({ ...x, greeting: h }))} variables={[]} defaultAlign="right" minHeight={44} testID="letter-sec-greeting" /></SecCard>
              <SecCard title="الموضوع" badge="إلزامي" color="#dc2626">
                <input style={{ ...inp, marginBottom: 6 }} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="عنوان الموضوع (يظهر في السجل وفي المتغير {الموضوع})" data-testid="letter-subject" />
                <StatementBodyEditor value={sections.subject || ''} onChange={(h) => setSections((x) => ({ ...x, subject: h }))} variables={['{الموضوع}']} defaultAlign="center" minHeight={44} testID="letter-sec-subject" />
              </SecCard>
              <SecCard title="المتن" badge="إلزامي" color="#dc2626"><StatementBodyEditor value={body} onChange={setBody} variables={vars.map((v: string) => `{${v}}`)} defaultAlign="right" minHeight={150} placeholder="اختر قالباً أو اكتب متن الخطاب هنا…" testID="letter-body" /></SecCard>
              {people.length > 0 && <SecCard title="جدول الأسماء" badge="نظامي" color="#64748b"><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, color: '#475569' }}><span>{people.length} اسم — يُدرج مكان {'{جدول_الأسماء}'} أو بعد المتن تلقائياً</span><button onClick={() => setShowTable((v) => !v)} style={btn(showTable ? '#6d28d9' : '#f5f3ff', { color: showTable ? '#fff' : '#6d28d9', padding: '4px 10px', fontSize: 11.5 })} data-testid="letter-table-toggle">⊞ أعمدة وألوان الجدول</button></div></SecCard>}
              <SecCard title={secLabels.closing || 'الخاتمة'} badge="قابل للتحرير" color="#6d28d9"><StatementBodyEditor value={sections.closing || ''} onChange={(h) => setSections((x) => ({ ...x, closing: h }))} variables={[]} defaultAlign="right" minHeight={44} testID="letter-sec-closing" /></SecCard>
              <SecCard title={secLabels.signature || 'التوقيع'} badge="قابل للتحرير" color="#6d28d9"><StatementBodyEditor value={sections.signature || ''} onChange={(h) => setSections((x) => ({ ...x, signature: h }))} variables={['{صفة_الموقع}', '{اسم_الموقع}']} defaultAlign="center" minHeight={60} testID="letter-sec-signature" /></SecCard>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
              {people.length === 0 && <button onClick={() => setShowTable((v) => !v)} style={btn('#f5f3ff', { color: '#6d28d9', padding: '4px 10px', fontSize: 11.5 })} data-testid="letter-table-toggle">⊞ إعدادات الجدول</button>}
              <button onClick={() => setShowLayout((v) => !v)} style={btn(showLayout ? '#0f2440' : '#f1f5f9', { color: showLayout ? '#fff' : '#0f2440', padding: '4px 10px', fontSize: 11.5 })} data-testid="letter-layout-toggle">⚙️ ضبط دقيق (متقدم) {Object.keys(layout || {}).length ? `(${Object.keys(layout).length})` : ''}</button>
            </div>
            {showTable && (
              <div style={{ border: '1px solid #ddd6fe', borderRadius: 10, padding: 10, marginTop: 8, background: '#faf5ff' }} data-testid="letter-table-panel">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
                  <label style={{ fontSize: 12 }}><span style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>حجم خط الجدول <b>{layout.table_font ?? layoutDefaults.table_font ?? 10.5}</b></span><input type="range" min={7} max={14} step={0.5} value={layout.table_font ?? layoutDefaults.table_font ?? 10.5} onChange={(e) => setLayout({ ...layout, table_font: Number(e.target.value) })} style={{ width: '100%' }} data-testid="letter-table-font" /></label>
                  <label style={{ fontSize: 12 }}><span style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>ارتفاع الصف (مم) <b>{layout.table_row_h ?? layoutDefaults.table_row_h ?? 8}</b></span><input type="range" min={5} max={12} step={0.5} value={layout.table_row_h ?? layoutDefaults.table_row_h ?? 8} onChange={(e) => setLayout({ ...layout, table_row_h: Number(e.target.value) })} style={{ width: '100%' }} data-testid="letter-table-row-h" /></label>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 10, padding: 8, background: '#fff', borderRadius: 8, border: '1px dashed #ddd6fe' }} data-testid="letter-table-colors">
                  <span style={{ fontSize: 12, fontWeight: 700 }}>🎨 ألوان الجدول:</span>
                  {([['table_text_color', 'نص الجدول', '#000000'], ['table_header_bg', 'خلفية الرأس', '#edf2fa'], ['table_header_color', 'نص الرأس', '#000000'], ['table_border_color', 'الإطار', '#000000']] as const).map(([k, l, d]) => (
                    <label key={k} style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 4 }}>{l}<input type="color" value={layout[k] || d} onChange={(e) => setLayout({ ...layout, [k]: e.target.value })} style={{ width: 28, height: 22, padding: 0, border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer' }} data-testid={`letter-${k.replace(/_/g, '-')}`} />{layout[k] && <button onClick={() => { const { [k]: _x, ...rest } = layout; setLayout(rest); }} title="إعادة" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 11 }}>✕</button>}</label>
                  ))}
                  <span style={{ fontSize: 11, color: '#64748b', flexBasis: '100%' }}>💡 بدون تحديد لون هنا، يرث الجدول لون/حجم/عرض الخط من تنسيق المتغير {'{جدول_الأسماء}'} في المحرر.</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>الأعمدة الظاهرة وترتيبها (◀ ▶ للترتيب، ✕ للإخفاء):</div>
                <TableColumnsPicker available={tableHeaders} defaults={tableDefaults} value={layout.table_columns} onChange={(cols) => setLayout({ ...layout, table_columns: cols })} testID="letter-table-cols" />
              </div>
            )}
            {showLayout && (
              <Modal title="📐 تخطيط الصفحة — لهذا الخطاب فقط (الافتراضي العام من تبويب «الكليشة»)" onClose={() => setShowLayout(false)} width={1180} testID="letter-layout-panel">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 14, alignItems: 'start' }}>
                  <LetterLayoutEditor value={layout} defaults={{ ...layoutDefaults, ...(settings?.layout || {}) }} onChange={setLayout} hasTable={people.length > 0} testID="letter-layout" />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>المعاينة الحقيقية {previewBusy ? '⏳' : ''}</div>
                    {previewImg ? <img src={previewImg} alt="معاينة" style={{ width: '100%', boxShadow: '0 4px 14px rgba(0,0,0,.15)', borderRadius: 4 }} /> : <div style={{ color: '#94a3b8', fontSize: 12 }}>اكتب المتن لتظهر المعاينة</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}><button onClick={() => setShowLayout(false)} style={btn('#0f2440')} data-testid="letter-layout-done">تم</button></div>
              </Modal>
            )}
            {draft && <div style={{ marginTop: 12, padding: 10, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, fontSize: 12.5 }} data-testid="letter-draft-info">📝 مسودة محفوظة برقم <b>{draft.number}</b> — التعديلات تُحفظ على نفس النسخة، وعند الاعتماد تأخذ الرقم الرسمي. <button onClick={resetForm} style={{ border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 12 }}>خطاب جديد</button></div>}
            {batch && <div style={{ marginTop: 12, padding: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, fontSize: 12.5 }} data-testid="letter-batch-issued">✅ صدر <b>{batch.count}</b> خطاباً مستقلاً وتم تنزيل PDF المجمّع{batch.skipped?.length ? ` (تُخطّي ${batch.skipped.length} غير موجود)` : ''}
              <div style={{ maxHeight: 140, overflowY: 'auto', marginTop: 6, fontSize: 11.5, color: '#334155' }}>{batch.letters.map((l: any) => <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '2px 0', borderBottom: '1px dashed #d1fae5' }}><span>{l.name}</span><b>{l.number}</b></div>)}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <button onClick={() => dlBatchPdf(batch, true)} style={btn('#0f2440', { padding: '5px 10px', fontSize: 12 })} data-testid="letter-batch-pdf">PDF المجمّع بالكليشة</button>
                <button onClick={() => dlBatchPdf(batch, false)} style={btn('#f1f5f9', { color: '#0f2440', padding: '5px 10px', fontSize: 12 })} data-testid="letter-batch-pdf-plain">🖨️ المجمّع بلا كليشة</button>
                <button onClick={() => setTab('log')} style={btn('#f1f5f9', { color: '#0f2440', padding: '5px 10px', fontSize: 12 })}>السجل</button>
              </div>
            </div>}
            {last && <div style={{ marginTop: 12, padding: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, fontSize: 12.5 }} data-testid="letter-issued">✅ صدر الخطاب رقم <b>{last.number}</b> وتم تنزيل PDF<br /><span style={{ color: '#64748b', fontSize: 11 }}>{last.verify_url}</span>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <button onClick={() => dlPdf(last.id, `خطاب ${last.number}`, true)} style={btn('#0f2440', { padding: '5px 10px', fontSize: 12 })} data-testid="letter-last-pdf">PDF بالكليشة</button>
                <button onClick={() => dlPdf(last.id, `خطاب ${last.number}`, false)} style={btn('#f1f5f9', { color: '#0f2440', padding: '5px 10px', fontSize: 12 })} data-testid="letter-last-pdf-plain">🖨️ PDF بلا كليشة (ورق مطبوع)</button>
                {canEdit && <button onClick={() => saveAsTemplate()} style={btn('#f5f3ff', { color: '#6d28d9', padding: '5px 10px', fontSize: 12 })} data-testid="letter-save-template">⭐ حفظ كقالب</button>}
              </div>
            </div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={saveDraft} disabled={busy || isBatch} title={isBatch ? 'المسودات غير متاحة في وضع «خطاب لكل شخص»' : ''} style={btn(isBatch ? '#e2e8f0' : '#f59e0b', { flex: 1, padding: 12, fontSize: 14, color: isBatch ? '#94a3b8' : '#fff' })} data-testid="letter-draft-btn">{busy ? '…' : draft ? '💾 تحديث المسودة' : '💾 حفظ كمسودة'}</button>
              {draft && <button onClick={() => dlPdf(draft.id, `مسودة ${draft.number}`)} style={btn('#0f2440', { padding: 12, fontSize: 13 })} data-testid="letter-draft-pdf-btn">PDF المسودة</button>}
              {draft && <button onClick={() => dlPdf(draft.id, `مسودة ${draft.number}`, false)} style={btn('#f1f5f9', { color: '#0f2440', padding: 12, fontSize: 13 })} data-testid="letter-draft-pdf-plain-btn" title="للطباعة على ورق مطبوع مسبقاً">🖨️ بلا كليشة</button>}
              {canEdit && <button onClick={() => saveAsTemplate()} disabled={!body.trim()} style={btn('#f5f3ff', { color: '#6d28d9', padding: 12, fontSize: 13 })} data-testid="letter-save-template-btn" title="يحفظ المتن (بمتغيراته) والموضوع والموقّع كقالب جديد">⭐ كقالب</button>}
              <button onClick={issue} disabled={busy} style={btn('#16a34a', { flex: 1.4, padding: 12, fontSize: 14 })} data-testid="letter-issue-btn">{busy ? 'جاري الإصدار…' : isBatch ? `👥 إصدار ${people.length} خطابات وتنزيل PDF مجمّع` : draft ? '✅ اعتماد وإصدار PDF' : 'إصدار وتنزيل PDF'}</button>
            </div>
          </div>
          <div style={{ ...card, minHeight: 400, position: 'sticky', top: 10, alignSelf: 'flex-start', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto' }} data-testid="letter-preview">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 800, color: '#0f2440' }}>👁️ معاينة حيّة للخطاب — لا تستهلك رقماً تسلسلياً {previewBusy ? '⏳' : ''}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ fontSize: 11.5, color: '#475569', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }} title="معاينة كما ستُطبع على ورق مطبوع مسبقاً"><input type="checkbox" checked={!previewLetterhead} onChange={(e) => setPreviewLetterhead(!e.target.checked)} data-testid="letter-preview-plain" /> بلا كليشة</label>
                {people.length > 0 && body.includes('{جدول_الأسماء}') && <span style={{ fontSize: 12, color: '#7c3aed' }}>⊞ جدول بالأسماء ({people.length})</span>}
              </div>
            </div>
            {isBatch && <div style={{ fontSize: 12, color: '#9a3412', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 8, padding: '6px 10px', marginBottom: 8 }} data-testid="letter-batch-banner">👥 سيصدر <b>{people.length}</b> خطاباً مستقلاً — المعاينة لخطاب الأول: <b>{people[0]?.label}</b></div>}
            {!recipient && !(isBatch && personAsRec) && body.trim() && <div style={{ fontSize: 12, color: '#b45309', marginBottom: 8 }}>⚠️ المرسَل إليه لم يُحدد بعد — ستظهر بياناته في المعاينة عند اختياره</div>}
            {previewImg ? (
              <img src={previewImg} alt="معاينة الخطاب" data-testid="letter-preview-img" style={{ width: '100%', boxShadow: '0 4px 18px rgba(0,0,0,.18)', borderRadius: 4, background: '#fff' }} />
            ) : (
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 2, fontSize: 14.5, fontFamily: 'Amiri, serif', color: '#94a3b8', textAlign: 'center', padding: 40 }}>{body.trim() ? 'جاري توليد المعاينة…' : 'اختر قالباً أو اكتب المتن لتظهر المعاينة هنا'}</div>
            )}
            {!!preview && !previewImg && <div style={{ whiteSpace: 'pre-wrap', lineHeight: 2, fontSize: 14.5, fontFamily: 'Amiri, serif' }}>{preview.replace(/<[^>]+>/g, ' ')}</div>}
          </div>
        </div>
      )}

      {tab === 'templates' && (
        <div style={card} data-testid="letter-templates">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}><b>قوالب الخطابات ({templates.length})</b>{canEdit && <button onClick={() => setTform({ name: '', subject: '', body: '', signatory_name: settings?.default_signatory_name || '', signatory_title: settings?.default_signatory_title || '', concerns: 'none', is_active: true })} style={btn('#16a34a')} data-testid="letter-template-add">+ قالب</button>}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['القالب', 'الموضوع', 'يخص', 'الموقِّع', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
            <tbody>{templates.map((t) => <tr key={t.id}><td style={{ ...td, fontWeight: 800 }}>{t.name}</td><td style={td}>{t.subject}</td><td style={td}>{{ none: 'عام', student: 'طالب', employee: 'موظف', teacher: 'مدرّس', many: 'عدة أسماء' }[t.concerns as string] || 'عام'}</td><td style={td}>{t.signatory_title || (t.signatory_position_id ? '🖋️ من دليل المناصب' : '—')}</td><td style={{ ...td, whiteSpace: 'nowrap' }}>{canEdit ? (<><button onClick={() => setTform(t)} style={btn('#f1f5f9', { color: '#0f2440', padding: '5px 10px', fontSize: 12 })} data-testid={`letter-template-edit-${t.id}`}>تعديل</button> <button onClick={async () => { if (window.confirm('حذف القالب؟')) { await api.delete(`/letter-templates/${t.id}`); loadAll(); } }} style={btn('#fee2e2', { color: '#b91c1c', padding: '5px 10px', fontSize: 12 })}>حذف</button></>) : <button onClick={() => { pickTpl(t.id); setTab('issue'); }} style={btn('#f1f5f9', { color: '#0f2440', padding: '5px 10px', fontSize: 12 })} data-testid={`letter-template-use-${t.id}`}>استخدام</button>}</td></tr>)}</tbody></table>
          {tform && <Modal title={tform.id ? 'تعديل قالب' : 'قالب جديد'} onClose={() => setTform(null)} width={720} testID="letter-template-modal">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="اسم القالب *"><input style={inp} value={tform.name} onChange={(e) => setTform({ ...tform, name: e.target.value })} data-testid="lt-name" /></Field>
              <Field label="الموضوع الافتراضي"><input style={inp} value={tform.subject} onChange={(e) => setTform({ ...tform, subject: e.target.value })} data-testid="lt-subject" /></Field>
              <Field label="يخص"><select style={inp} value={tform.concerns} onChange={(e) => setTform({ ...tform, concerns: e.target.value })}><option value="none">عام</option><option value="student">طالب</option><option value="employee">موظف</option><option value="teacher">مدرّس</option><option value="many">عدة أسماء (جدول)</option></select></Field>
              <div />
              <Field label="📄 الكليشة المفضّلة"><select style={inp} value={tform.letterhead_id || ''} onChange={(e) => setTform({ ...tform, letterhead_id: e.target.value })} data-testid="lt-letterhead"><option value="">— حسب اختيار المُصدِر —</option>{letterheads.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
              <Field label="🔢 سلسلة الترقيم المفضّلة"><select style={inp} value={tform.series_id || ''} onChange={(e) => setTform({ ...tform, series_id: e.target.value })} data-testid="lt-series"><option value="">— حسب اختيار المُصدِر —</option>{seriesList.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
            </div>
            <Field label="الموقِّع (المرسِل)"><SignatoryPicker value={{ position_id: tform.signatory_position_id || '', name: tform.signatory_name || '', title: tform.signatory_title || '' }} onChange={(v) => setTform((f: any) => ({ ...f, signatory_position_id: v.position_id, signatory_name: v.name, signatory_title: v.title }))} defaultLabel="الافتراضي من الكليشة (يُحدَّد عند الإصدار)" hint="اختر منصباً من الدليل أو أدخل الاسم والصفة يدوياً." testID="lt-signatory" /></Field>
            <Field label="المتن * — منسّق، والمتغيرات تُدرج بنقرة عند المؤشر"><StatementBodyEditor value={tform.body || ''} onChange={(h) => setTform((f: any) => ({ ...f, body: h }))} variables={vars.map((v: string) => `{${v}}`)} defaultAlign="right" minHeight={180} testID="lt-body" /></Field>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button onClick={saveTpl} style={btn('#16a34a')} data-testid="lt-save">حفظ</button><button onClick={() => setTform(null)} style={btn('#f1f5f9', { color: '#0f2440' })}>إلغاء</button></div>
          </Modal>}
        </div>
      )}

      {tab === 'log' && (
        <div style={card} data-testid="letters-log">
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input style={{ ...inp, flex: 1 }} placeholder="بحث بالرقم / الموضوع / المرسَل إليه / الاسم…" value={logQ} onChange={(e) => setLogQ(e.target.value)} data-testid="letters-log-search" />
            <select style={{ ...inp, width: 'auto' }} value={logStatus} onChange={(e) => setLogStatus(e.target.value)} data-testid="letters-log-status"><option value="">الكل</option><option value="draft">المسودات</option><option value="issued">الصادرة</option></select>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['الرقم', 'التاريخ', 'الموضوع', 'إلى', 'الأسماء', 'الحالة', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
            <tbody>{log.map((l) => <tr key={l.id} data-testid={`letter-row-${l.id}`} style={l.status === 'draft' ? { background: '#fffbeb' } : undefined}><td style={{ ...td, fontWeight: 800 }}>{l.number_display}{l.series_name ? <div style={{ fontSize: 10, color: '#64748b', fontWeight: 400 }} title={`الكليشة: ${l.letterhead_name || ''}`}>{l.series_name}{l.letterhead_name ? ` · ${l.letterhead_name}` : ''}</div> : null}{l.batch_id ? <div style={{ fontSize: 10, color: '#c2410c', fontWeight: 700 }} title="ضمن إصدار جماعي — خطاب لكل شخص">👥 {l.batch_index}/{l.batch_total}</div> : null}{l.draft_number ? <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>من {l.draft_number}</div> : null}</td><td style={td}>{(l.issued_at || '').slice(0, 10)}</td><td style={td}>{l.subject || <span style={{ color: '#94a3b8' }}>بلا موضوع</span>}</td><td style={td}>{l.recipient?.title || l.recipient?.name || '—'}</td><td style={td}>{(l.people || []).map((p: any) => p.name).join('، ') || '—'}</td><td style={td}>{l.status === 'draft' ? <Badge text="مسودة" color="#d97706" /> : l.is_revoked ? <Badge text="ملغى" color="#b91c1c" /> : <Badge text="ساري" color="#16a34a" />}</td>
              <td style={{ ...td, whiteSpace: 'nowrap' }}>
                {l.status === 'draft' ? (<>
                  <button onClick={() => loadDraft(l.id)} style={btn('#0f2440', { padding: '5px 10px', fontSize: 12 })} data-testid={`letter-draft-edit-${l.id}`}>تعديل</button>{' '}
                  <button onClick={() => dlPdf(l.id, `مسودة ${l.number_display}`)} style={btn('#f1f5f9', { color: '#0f2440', padding: '5px 10px', fontSize: 12 })} data-testid={`letter-draft-pdf-${l.id}`}>PDF</button>{' '}
                  <button onClick={() => dlPdf(l.id, `مسودة ${l.number_display}`, false)} style={btn('#f1f5f9', { color: '#0f2440', padding: '5px 10px', fontSize: 12 })} title="بلا كليشة">🖨️</button>{' '}
                  <button onClick={() => finalizeFromLog(l)} style={btn('#16a34a', { padding: '5px 10px', fontSize: 12 })} data-testid={`letter-draft-finalize-${l.id}`}>اعتماد وإصدار</button>{' '}
                  <button onClick={async () => { if (window.confirm('حذف المسودة نهائياً؟')) { await api.delete(`/letters/${l.id}`); if (draft?.id === l.id) resetForm(); loadLog(); } }} style={btn('#fee2e2', { color: '#b91c1c', padding: '5px 10px', fontSize: 12 })} data-testid={`letter-draft-delete-${l.id}`}>حذف</button>
                </>) : (<>
                  <button onClick={() => dlPdf(l.id, `خطاب ${l.number_display}`)} style={btn('#0f2440', { padding: '5px 10px', fontSize: 12 })} data-testid={`letter-pdf-${l.id}`}>PDF</button>{' '}
                  <button onClick={() => dlPdf(l.id, `خطاب ${l.number_display}`, false)} style={btn('#f1f5f9', { color: '#0f2440', padding: '5px 10px', fontSize: 12 })} title="PDF بلا كليشة — للطباعة على ورق مطبوع مسبقاً" data-testid={`letter-pdf-plain-${l.id}`}>🖨️ بلا كليشة</button>{' '}
                  {canEdit && <><button onClick={async () => { const { data } = await api.get(`/letters/${l.id}`); saveAsTemplate(data); }} style={btn('#f5f3ff', { color: '#6d28d9', padding: '5px 10px', fontSize: 12 })} title="حفظ هذا الخطاب كقالب" data-testid={`letter-template-from-${l.id}`}>⭐ قالب</button>{' '}</>}
                  <button onClick={async () => { await api.post(`/letters/${l.id}/${l.is_revoked ? 'restore' : 'revoke'}`); loadLog(); }} style={btn('#f1f5f9', { color: l.is_revoked ? '#16a34a' : '#b91c1c', padding: '5px 10px', fontSize: 12 })}>{l.is_revoked ? 'استرجاع' : 'إلغاء'}</button>
                </>)}
              </td></tr>)}</tbody></table>
          {log.length === 0 && <div style={{ color: '#94a3b8', padding: 16, textAlign: 'center' }}>لا توجد خطابات</div>}
        </div>
      )}

      {tab === 'settings' && (
        <div data-testid="letters-settings">
          <LetterheadManager layoutDefaults={layoutDefaults} isAdmin={user?.role === 'admin'} onChanged={loadLhSeries} />
          <SeriesManager isAdmin={user?.role === 'admin'} onChanged={loadLhSeries} />
        </div>
      )}
    </CorrPage>
  );
}

const SecCard: React.FC<{ title: string; badge: string; color: string; children: React.ReactNode }> = ({ title, badge, color, children }) => (
  <div style={{ border: '1.5px solid #eef0f3', borderRadius: 10, padding: 8, marginBottom: 10, background: '#fff' }} data-testid={`letter-sec-card-${title}`}>
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}><b style={{ fontSize: 12.5 }}>{title}</b><Badge text={badge} color={color} /></div>
    {children}
  </div>
);

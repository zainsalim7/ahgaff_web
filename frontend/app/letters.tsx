import React, { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import api from '../src/services/api';
import { CorrPage, card, btn, inp, th, td, Badge, Field, Modal } from '../src/components/corr/CorrUI';
import { downloadBlob } from '../src/utils/exportName';

const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 800, color: '#334155', marginBottom: 6, textAlign: 'right' };
const errOf = (e: any, d: string) => e?.response?.data?.detail || d;
import { StatementBodyEditor } from '../src/components/statements/StatementBodyEditor';
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
  const [err, setErr] = useState('');
  // issue state
  const [tplId, setTplId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState('');
  const [previewImg, setPreviewImg] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const [recMode, setRecMode] = useState<'list' | 'manual'>('list');
  const [recId, setRecId] = useState('');
  const [rec, setRec] = useState({ name: '', title: '', organization: '', suffix: 'المحترم' });
  const [peopleKind, setPeopleKind] = useState('student');
  const [people, setPeople] = useState<Person[]>([]);
  const [signName, setSignName] = useState(''); const [signTitle, setSignTitle] = useState('');
  const [validDays, setValidDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<any>(null);
  const [layoutDefaults, setLayoutDefaults] = useState<any>({});
  const [layout, setLayout] = useState<any>({});
  const [tableHeaders, setTableHeaders] = useState<string[]>([]);
  const [showLayout, setShowLayout] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [draft, setDraft] = useState<{ id: string; number: string } | null>(null);
  const [settingsPreview, setSettingsPreview] = useState('');
  // templates/log state
  const [tform, setTform] = useState<any | null>(null);
  const [log, setLog] = useState<any[]>([]); const [logQ, setLogQ] = useState(''); const [logStatus, setLogStatus] = useState('');

  const loadAll = () => {
    api.get('/letter-templates').then((r) => setTemplates(r.data)).catch(() => {});
    api.get('/letters/recipients').then((r) => setRecips(r.data)).catch(() => {});
    api.get('/letters/settings').then((r) => setSettings(r.data)).catch((e) => setErr(errOf(e, 'غير مصرح')));
    api.get('/letters/layout-defaults').then((r) => setLayoutDefaults(r.data)).catch(() => {});
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
    setSubject(t.subject || t.name); setBody(t.body); setSignName(t.signatory_name || settings?.default_signatory_name || ''); setSignTitle(t.signatory_title || settings?.default_signatory_title || '');
    if (t.concerns && t.concerns !== 'none' && t.concerns !== 'many') setPeopleKind(t.concerns);
    setLast(null);
  };
  const recipient = useMemo(() => recMode === 'list' ? (recips.find((r) => r.id === recId) || null) : (rec.name || rec.title ? rec : null), [recMode, recId, recips, rec]);
  const issuePayload = () => ({ template_id: tplId || null, template_name: tpl?.name || 'خطاب', subject, body, recipient: recipient || {}, people: people.map((p) => ({ kind: p.kind, id: p.id })), signatory_name: signName, signatory_title: signTitle, valid_days: validDays ? parseInt(validDays, 10) : null, base_url: typeof window !== 'undefined' ? window.location.origin : '', layout: Object.keys(layout || {}).length ? layout : null, draft_id: draft?.id || null });
  useEffect(() => {
    if (!body.trim()) { setPreview(''); setPreviewImg((o) => { if (o) URL.revokeObjectURL(o); return ''; }); return; }
    const t = setTimeout(() => {
      api.post('/letters/preview-body', { body, subject, recipient: recipient || {}, people: people.map((p) => ({ kind: p.kind, id: p.id })) }).then((r) => { setPreview(r.data.body); setTableHeaders(r.data.table?.headers || []); }).catch(() => {});
      setPreviewBusy(true);
      api.post('/letters/preview-pdf?fmt=png', issuePayload(), { responseType: 'blob' })
        .then((r) => { const url = URL.createObjectURL(new Blob([r.data], { type: 'image/png' })); setPreviewImg((o) => { if (o) URL.revokeObjectURL(o); return url; }); })
        .catch(() => {}).finally(() => setPreviewBusy(false));
    }, 700);
    return () => clearTimeout(t);
  }, [body, subject, recipient, people, signName, signTitle, layout]); // eslint-disable-line react-hooks/exhaustive-deps

  // معاينة تخطيط الكليشة الافتراضي (نموذج تجريبي) في تبويب الإعدادات
  useEffect(() => {
    if (tab !== 'settings' || !settings) return;
    const t = setTimeout(() => {
      const sample = { subject: 'نموذج لمعاينة التخطيط', body: '<p style="text-align: right">تهديكم {جهة_المرسل_إليه} أطيب التحيات، وبالإشارة إلى الموضوع أعلاه نفيدكم بأن هذا نص تجريبي لمعاينة تخطيط الصفحة والمسافات بين الكتل.</p><p>{جدول_الأسماء}</p><p style="text-align: right">آملين التكرم بالاطلاع.</p>', recipient: { title: 'عميد الكلية', name: 'د. فلان الفلاني', suffix: 'المحترم' }, people: [], signatory_name: settings.default_signatory_name, signatory_title: settings.default_signatory_title, layout: settings.layout || null };
      api.post('/letters/preview-pdf?fmt=png', sample, { responseType: 'blob' }).then((r) => { const url = URL.createObjectURL(new Blob([r.data], { type: 'image/png' })); setSettingsPreview((o) => { if (o) URL.revokeObjectURL(o); return url; }); }).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [tab, settings?.layout]); // eslint-disable-line react-hooks/exhaustive-deps

  const afterIssue = async (r: any) => {
    setLast(r.data); setDraft(null);
    const pdf = await api.get(`/letters/${r.data.id}/pdf`, { responseType: 'blob' });
    downloadBlob(pdf.data, `خطاب ${r.data.number}.pdf`, 'application/pdf');
  };
  const issue = async () => {
    if (!recipient) { window.alert('حدّد المرسَل إليه'); return; }
    if (!subject.trim() || !body.trim()) { window.alert('الموضوع والمتن مطلوبان'); return; }
    setBusy(true); setErr('');
    try {
      if (draft) { await api.post('/letters/draft', issuePayload()); await afterIssue(await api.post(`/letters/${draft.id}/finalize`, null, { params: { base_url: window.location.origin } })); }
      else await afterIssue(await api.post('/letters/issue', issuePayload()));
    } catch (e) { setErr(errOf(e, 'فشل إصدار الخطاب')); } finally { setBusy(false); }
  };
  const saveDraft = async () => {
    if (!body.trim()) { window.alert('اكتب المتن أولاً'); return; }
    setBusy(true); setErr('');
    try { const r = await api.post('/letters/draft', issuePayload()); setDraft({ id: r.data.id, number: r.data.number }); setLast(null); }
    catch (e) { setErr(errOf(e, 'فشل حفظ المسودة')); } finally { setBusy(false); }
  };
  const resetForm = () => { setDraft(null); setLast(null); setTplId(''); setSubject(''); setBody(''); setPeople([]); setRecId(''); setRec({ name: '', title: '', organization: '', suffix: 'المحترم' }); setLayout({}); setValidDays(''); };
  const loadDraft = async (id: string) => {
    try {
      const { data: d } = await api.get(`/letters/${id}`);
      const inp0 = d.inputs || {};
      setDraft({ id: d.id, number: d.number_display }); setLast(null);
      setTplId(d.template_id || ''); setSubject(d.subject || ''); setBody(inp0.body || d.body || '');
      const r0 = inp0.recipient || d.recipient || {};
      if (r0.id) { setRecMode('list'); setRecId(r0.id); } else { setRecMode('manual'); setRec({ name: r0.name || '', title: r0.title || '', organization: r0.organization || '', suffix: r0.suffix || 'المحترم' }); }
      setPeople((d.people || []).map((p: any) => ({ kind: p.kind, id: p.id, label: p.name })));
      setSignName(d.signatory_name || ''); setSignTitle(d.signatory_title || ''); setValidDays(d.valid_days ? String(d.valid_days) : ''); setLayout(d.layout || {});
      setTab('issue');
    } catch (e) { setErr(errOf(e, 'تعذر فتح المسودة')); }
  };
  const finalizeFromLog = async (l: any) => {
    if (!window.confirm(`اعتماد المسودة ${l.number_display} وإصدارها برقم رسمي؟`)) return;
    try { const r = await api.post(`/letters/${l.id}/finalize`, null, { params: { base_url: window.location.origin } }); const pdf = await api.get(`/letters/${r.data.id}/pdf`, { responseType: 'blob' }); downloadBlob(pdf.data, `خطاب ${r.data.number}.pdf`, 'application/pdf'); loadLog(); }
    catch (e) { setErr(errOf(e, 'فشل الاعتماد')); }
  };
  const saveTpl = async () => { try { if (tform.id) await api.put(`/letter-templates/${tform.id}`, tform); else await api.post('/letter-templates', tform); setTform(null); loadAll(); } catch (e) { setErr(errOf(e, 'فشل الحفظ')); } };
  const saveSettings = async () => { try { await api.put('/letters/settings', settings); window.alert('تم حفظ إعدادات الكليشة'); } catch (e) { setErr(errOf(e, 'فشل الحفظ')); } };
  const file64 = (k: string) => (e: any) => { const f = e.target.files?.[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => setSettings((s: any) => ({ ...s, [k]: rd.result })); rd.readAsDataURL(f); };
  const vars = settings?.variables || [];

  return (
    <CorrPage title="الخطابات الرسمية" subtitle="مثل الإفادات تماماً: اختر القالب → حدّد المرسَل إليه والأسماء → إصدار وتنزيل PDF برقم تسلسلي ورمز QR" testID="letters-page" hideNav
      actions={<div style={{ display: 'flex', gap: 6 }}>{([['issue', '✉️ إصدار خطاب'], ['templates', '📋 القوالب'], ['log', '🗂 سجل الخطابات'], ['settings', '⚙️ الكليشة']] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} style={btn(tab === k ? '#0f2440' : '#f1f5f9', { color: tab === k ? '#fff' : '#0f2440' })} data-testid={`letters-tab-${k}`}>{l}</button>)}</div>}>
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
            <label style={{ ...lbl, marginTop: 12 }}>الموضوع</label>
            <input style={inp} value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="letter-subject" />
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
            <label style={{ ...lbl, marginTop: 12 }}>متن الخطاب — منسّق (خط/حجم/لون/محاذاة) والمتغيرات تُدرج بنقرة عند المؤشر</label>
            <StatementBodyEditor value={body} onChange={setBody} variables={vars.map((v: string) => `{${v}}`)} defaultAlign="right" minHeight={150} placeholder="اختر قالباً أو اكتب متن الخطاب هنا…" testID="letter-body" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px', gap: 8, marginTop: 12 }}>
              <div><label style={lbl}>صفة الموقِّع</label><input style={inp} value={signTitle} onChange={(e) => setSignTitle(e.target.value)} data-testid="letter-sign-title" /></div>
              <div><label style={lbl}>اسم الموقِّع</label><input style={inp} value={signName} onChange={(e) => setSignName(e.target.value)} data-testid="letter-sign-name" /></div>
              <div><label style={lbl}>صلاحية (يوم)</label><input style={inp} value={validDays} onChange={(e) => setValidDays(e.target.value)} placeholder="∞" data-testid="letter-valid-days" /></div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              <button onClick={() => setShowTable((v) => !v)} style={btn(showTable ? '#6d28d9' : '#f5f3ff', { color: showTable ? '#fff' : '#6d28d9', padding: '6px 12px', fontSize: 12 })} data-testid="letter-table-toggle">⊞ إعدادات الجدول</button>
              <button onClick={() => setShowLayout((v) => !v)} style={btn(showLayout ? '#0f2440' : '#f1f5f9', { color: showLayout ? '#fff' : '#0f2440', padding: '6px 12px', fontSize: 12 })} data-testid="letter-layout-toggle">📐 تخطيط الصفحة {Object.keys(layout || {}).length ? `(${Object.keys(layout).length} تعديل)` : ''}</button>
            </div>
            {showTable && (
              <div style={{ border: '1px solid #ddd6fe', borderRadius: 10, padding: 10, marginTop: 8, background: '#faf5ff' }} data-testid="letter-table-panel">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
                  <label style={{ fontSize: 12 }}><span style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>حجم خط الجدول <b>{layout.table_font ?? layoutDefaults.table_font ?? 10.5}</b></span><input type="range" min={7} max={14} step={0.5} value={layout.table_font ?? layoutDefaults.table_font ?? 10.5} onChange={(e) => setLayout({ ...layout, table_font: Number(e.target.value) })} style={{ width: '100%' }} data-testid="letter-table-font" /></label>
                  <label style={{ fontSize: 12 }}><span style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>ارتفاع الصف (مم) <b>{layout.table_row_h ?? layoutDefaults.table_row_h ?? 8}</b></span><input type="range" min={5} max={12} step={0.5} value={layout.table_row_h ?? layoutDefaults.table_row_h ?? 8} onChange={(e) => setLayout({ ...layout, table_row_h: Number(e.target.value) })} style={{ width: '100%' }} data-testid="letter-table-row-h" /></label>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>الأعمدة الظاهرة وترتيبها (◀ ▶ للترتيب، ✕ للإخفاء):</div>
                <TableColumnsPicker available={tableHeaders} value={layout.table_columns} onChange={(cols) => setLayout({ ...layout, table_columns: cols })} testID="letter-table-cols" />
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
            {last && <div style={{ marginTop: 12, padding: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, fontSize: 12.5 }} data-testid="letter-issued">✅ صدر الخطاب رقم <b>{last.number}</b> وتم تنزيل PDF<br /><span style={{ color: '#64748b', fontSize: 11 }}>{last.verify_url}</span></div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={saveDraft} disabled={busy} style={btn('#f59e0b', { flex: 1, padding: 12, fontSize: 14 })} data-testid="letter-draft-btn">{busy ? '…' : draft ? '💾 تحديث المسودة' : '💾 حفظ كمسودة'}</button>
              {draft && <button onClick={async () => { const r = await api.get(`/letters/${draft.id}/pdf`, { responseType: 'blob' }); downloadBlob(r.data, `مسودة ${draft.number}.pdf`, 'application/pdf'); }} style={btn('#0f2440', { padding: 12, fontSize: 13 })} data-testid="letter-draft-pdf-btn">PDF المسودة</button>}
              <button onClick={issue} disabled={busy} style={btn('#16a34a', { flex: 1.4, padding: 12, fontSize: 14 })} data-testid="letter-issue-btn">{busy ? 'جاري الإصدار…' : draft ? '✅ اعتماد وإصدار PDF' : 'إصدار وتنزيل PDF'}</button>
            </div>
          </div>
          <div style={{ ...card, minHeight: 400, position: 'sticky', top: 10, alignSelf: 'flex-start', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto' }} data-testid="letter-preview">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 800, color: '#0f2440' }}>👁️ معاينة حيّة للخطاب — لا تستهلك رقماً تسلسلياً {previewBusy ? '⏳' : ''}</div>
              {people.length > 0 && body.includes('{جدول_الأسماء}') && <span style={{ fontSize: 12, color: '#7c3aed' }}>⊞ جدول بالأسماء ({people.length})</span>}
            </div>
            {!recipient && body.trim() && <div style={{ fontSize: 12, color: '#b45309', marginBottom: 8 }}>⚠️ المرسَل إليه لم يُحدد بعد — ستظهر بياناته في المعاينة عند اختياره</div>}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}><b>قوالب الخطابات ({templates.length})</b><button onClick={() => setTform({ name: '', subject: '', body: '', signatory_name: settings?.default_signatory_name || '', signatory_title: settings?.default_signatory_title || '', concerns: 'none', is_active: true })} style={btn('#16a34a')} data-testid="letter-template-add">+ قالب</button></div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['القالب', 'الموضوع', 'يخص', 'الموقِّع', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
            <tbody>{templates.map((t) => <tr key={t.id}><td style={{ ...td, fontWeight: 800 }}>{t.name}</td><td style={td}>{t.subject}</td><td style={td}>{{ none: 'عام', student: 'طالب', employee: 'موظف', teacher: 'مدرّس', many: 'عدة أسماء' }[t.concerns as string] || 'عام'}</td><td style={td}>{t.signatory_title}</td><td style={{ ...td, whiteSpace: 'nowrap' }}><button onClick={() => setTform(t)} style={btn('#f1f5f9', { color: '#0f2440', padding: '5px 10px', fontSize: 12 })} data-testid={`letter-template-edit-${t.id}`}>تعديل</button> <button onClick={async () => { if (window.confirm('حذف القالب؟')) { await api.delete(`/letter-templates/${t.id}`); loadAll(); } }} style={btn('#fee2e2', { color: '#b91c1c', padding: '5px 10px', fontSize: 12 })}>حذف</button></td></tr>)}</tbody></table>
          {tform && <Modal title={tform.id ? 'تعديل قالب' : 'قالب جديد'} onClose={() => setTform(null)} width={720} testID="letter-template-modal">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="اسم القالب *"><input style={inp} value={tform.name} onChange={(e) => setTform({ ...tform, name: e.target.value })} data-testid="lt-name" /></Field>
              <Field label="الموضوع الافتراضي"><input style={inp} value={tform.subject} onChange={(e) => setTform({ ...tform, subject: e.target.value })} data-testid="lt-subject" /></Field>
              <Field label="يخص"><select style={inp} value={tform.concerns} onChange={(e) => setTform({ ...tform, concerns: e.target.value })}><option value="none">عام</option><option value="student">طالب</option><option value="employee">موظف</option><option value="teacher">مدرّس</option><option value="many">عدة أسماء (جدول)</option></select></Field>
              <div />
              <Field label="صفة الموقِّع (المرسِل)"><input style={inp} value={tform.signatory_title} onChange={(e) => setTform({ ...tform, signatory_title: e.target.value })} placeholder="رئيس الجامعة" data-testid="lt-sign-title" /></Field>
              <Field label="اسم الموقِّع"><input style={inp} value={tform.signatory_name} onChange={(e) => setTform({ ...tform, signatory_name: e.target.value })} placeholder="أ.د/ …" data-testid="lt-sign-name" /></Field>
            </div>
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
            <tbody>{log.map((l) => <tr key={l.id} data-testid={`letter-row-${l.id}`} style={l.status === 'draft' ? { background: '#fffbeb' } : undefined}><td style={{ ...td, fontWeight: 800 }}>{l.number_display}{l.draft_number ? <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>من {l.draft_number}</div> : null}</td><td style={td}>{(l.issued_at || '').slice(0, 10)}</td><td style={td}>{l.subject || <span style={{ color: '#94a3b8' }}>بلا موضوع</span>}</td><td style={td}>{l.recipient?.title || l.recipient?.name || '—'}</td><td style={td}>{(l.people || []).map((p: any) => p.name).join('، ') || '—'}</td><td style={td}>{l.status === 'draft' ? <Badge text="مسودة" color="#d97706" /> : l.is_revoked ? <Badge text="ملغى" color="#b91c1c" /> : <Badge text="ساري" color="#16a34a" />}</td>
              <td style={{ ...td, whiteSpace: 'nowrap' }}>
                {l.status === 'draft' ? (<>
                  <button onClick={() => loadDraft(l.id)} style={btn('#0f2440', { padding: '5px 10px', fontSize: 12 })} data-testid={`letter-draft-edit-${l.id}`}>تعديل</button>{' '}
                  <button onClick={async () => { const r = await api.get(`/letters/${l.id}/pdf`, { responseType: 'blob' }); downloadBlob(r.data, `مسودة ${l.number_display}.pdf`, 'application/pdf'); }} style={btn('#f1f5f9', { color: '#0f2440', padding: '5px 10px', fontSize: 12 })} data-testid={`letter-draft-pdf-${l.id}`}>PDF</button>{' '}
                  <button onClick={() => finalizeFromLog(l)} style={btn('#16a34a', { padding: '5px 10px', fontSize: 12 })} data-testid={`letter-draft-finalize-${l.id}`}>اعتماد وإصدار</button>{' '}
                  <button onClick={async () => { if (window.confirm('حذف المسودة نهائياً؟')) { await api.delete(`/letters/${l.id}`); if (draft?.id === l.id) resetForm(); loadLog(); } }} style={btn('#fee2e2', { color: '#b91c1c', padding: '5px 10px', fontSize: 12 })} data-testid={`letter-draft-delete-${l.id}`}>حذف</button>
                </>) : (<>
                  <button onClick={async () => { const r = await api.get(`/letters/${l.id}/pdf`, { responseType: 'blob' }); downloadBlob(r.data, `خطاب ${l.number_display}.pdf`, 'application/pdf'); }} style={btn('#0f2440', { padding: '5px 10px', fontSize: 12 })}>PDF</button>{' '}
                  <button onClick={async () => { await api.post(`/letters/${l.id}/${l.is_revoked ? 'restore' : 'revoke'}`); loadLog(); }} style={btn('#f1f5f9', { color: l.is_revoked ? '#16a34a' : '#b91c1c', padding: '5px 10px', fontSize: 12 })}>{l.is_revoked ? 'استرجاع' : 'إلغاء'}</button>
                </>)}
              </td></tr>)}</tbody></table>
          {log.length === 0 && <div style={{ color: '#94a3b8', padding: 16, textAlign: 'center' }}>لا توجد خطابات</div>}
        </div>
      )}

      {tab === 'settings' && settings && (
        <div style={card} data-testid="letters-settings">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {([['org_name', 'اسم الجامعة'], ['office_name', 'الجهة المصدِرة (رئاسة الجامعة / الشؤون الأكاديمية…)'], ['office_name_en', 'الجهة بالإنجليزية'], ['reference_format', 'صيغة الرقم ({seq} {year} {yy})'], ['default_signatory_title', 'صفة الموقِّع الافتراضي'], ['default_signatory_name', 'اسم الموقِّع الافتراضي'], ['phones', 'تلفون'], ['fax', 'فاكس'], ['address', 'العنوان'], ['po_box', 'ص.ب'], ['website', 'الموقع'], ['closing', 'عبارة الختام']] as const).map(([k, l]) => <Field key={k} label={l}><input style={inp} value={settings[k] || ''} onChange={(e) => setSettings({ ...settings, [k]: e.target.value })} data-testid={`ls-${k}`} /></Field>)}
            <Field label="الشعار (صورة)"><input type="file" accept="image/*" onChange={file64('logo_base64')} />{settings.logo_base64 && <img src={settings.logo_base64} alt="" style={{ height: 50, marginTop: 6 }} />}</Field>
            <Field label="صورة التوقيع"><input type="file" accept="image/*" onChange={file64('signature_base64')} />{settings.signature_base64 && <img src={settings.signature_base64} alt="" style={{ height: 50, marginTop: 6 }} />}</Field>
          </div>
          <button onClick={saveSettings} style={btn('#16a34a', { marginTop: 12 })} data-testid="ls-save">حفظ الإعدادات</button>
          <div style={{ marginTop: 18, borderTop: '1px solid #e2e8f0', paddingTop: 14 }} data-testid="ls-layout-section">
            <div style={{ fontWeight: 800, color: '#0f2440', marginBottom: 8 }}>📐 تخطيط الصفحة الافتراضي لكل الخطابات (المسافات بالمليمتر، أحجام الخطوط، الجدول)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 14, alignItems: 'start' }}>
              <div style={{ overflowX: 'auto' }}><LetterLayoutEditor value={settings.layout || {}} defaults={layoutDefaults} onChange={(l) => setSettings({ ...settings, layout: l })} testID="ls-layout" /></div>
              <div style={{ position: 'sticky', top: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>معاينة بنموذج تجريبي (تتحدث تلقائياً)</div>
                {settingsPreview ? <img src={settingsPreview} alt="معاينة" style={{ width: '100%', boxShadow: '0 4px 14px rgba(0,0,0,.15)', borderRadius: 4 }} data-testid="ls-layout-preview" /> : <div style={{ color: '#94a3b8', fontSize: 12 }}>جاري التوليد…</div>}
              </div>
            </div>
            <button onClick={saveSettings} style={btn('#16a34a', { marginTop: 12 })} data-testid="ls-save-layout">حفظ التخطيط الافتراضي</button>
          </div>
        </div>
      )}
    </CorrPage>
  );
}

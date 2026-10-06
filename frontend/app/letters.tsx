import React, { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import api from '../src/services/api';
import { CorrPage, card, btn, inp, th, td, Badge, Field, Modal } from '../src/components/corr/CorrUI';
import { downloadBlob } from '../src/utils/exportName';

const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 800, color: '#334155', marginBottom: 6, textAlign: 'right' };
const errOf = (e: any, d: string) => e?.response?.data?.detail || d;
import { StatementBodyEditor } from '../src/components/statements/StatementBodyEditor';

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
  // templates/log state
  const [tform, setTform] = useState<any | null>(null);
  const [log, setLog] = useState<any[]>([]); const [logQ, setLogQ] = useState('');

  const loadAll = () => {
    api.get('/letter-templates').then((r) => setTemplates(r.data)).catch(() => {});
    api.get('/letters/recipients').then((r) => setRecips(r.data)).catch(() => {});
    api.get('/letters/settings').then((r) => setSettings(r.data)).catch((e) => setErr(errOf(e, 'غير مصرح')));
  };
  useEffect(loadAll, []);
  useEffect(() => { if (tab === 'log') api.get('/letters', { params: { q: logQ || undefined } }).then((r) => setLog(r.data)).catch(() => {}); }, [tab, logQ]);
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
  const issuePayload = () => ({ template_id: tplId || null, template_name: tpl?.name || 'خطاب', subject, body, recipient: recipient || {}, people: people.map((p) => ({ kind: p.kind, id: p.id })), signatory_name: signName, signatory_title: signTitle, valid_days: validDays ? parseInt(validDays, 10) : null, base_url: typeof window !== 'undefined' ? window.location.origin : '' });
  useEffect(() => {
    if (!body.trim()) { setPreview(''); setPreviewImg((o) => { if (o) URL.revokeObjectURL(o); return ''; }); return; }
    const t = setTimeout(() => {
      api.post('/letters/preview-body', { body, subject, recipient: recipient || {}, people: people.map((p) => ({ kind: p.kind, id: p.id })) }).then((r) => setPreview(r.data.body)).catch(() => {});
      setPreviewBusy(true);
      api.post('/letters/preview-pdf?fmt=png', issuePayload(), { responseType: 'blob' })
        .then((r) => { const url = URL.createObjectURL(new Blob([r.data], { type: 'image/png' })); setPreviewImg((o) => { if (o) URL.revokeObjectURL(o); return url; }); })
        .catch(() => {}).finally(() => setPreviewBusy(false));
    }, 700);
    return () => clearTimeout(t);
  }, [body, subject, recipient, people, signName, signTitle]); // eslint-disable-line react-hooks/exhaustive-deps

  const issue = async () => {
    if (!recipient) { window.alert('حدّد المرسَل إليه'); return; }
    if (!subject.trim() || !body.trim()) { window.alert('الموضوع والمتن مطلوبان'); return; }
    setBusy(true); setErr('');
    try {
      const r = await api.post('/letters/issue', issuePayload());
      setLast(r.data);
      const pdf = await api.get(`/letters/${r.data.id}/pdf`, { responseType: 'blob' });
      downloadBlob(pdf.data, `خطاب ${r.data.number}.pdf`, 'application/pdf');
    } catch (e) { setErr(errOf(e, 'فشل إصدار الخطاب')); } finally { setBusy(false); }
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
            {last && <div style={{ marginTop: 12, padding: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, fontSize: 12.5 }} data-testid="letter-issued">✅ صدر الخطاب رقم <b>{last.number}</b> وتم تنزيل PDF<br /><span style={{ color: '#64748b', fontSize: 11 }}>{last.verify_url}</span></div>}
            <button onClick={issue} disabled={busy} style={btn('#16a34a', { width: '100%', marginTop: 14, padding: 12, fontSize: 14 })} data-testid="letter-issue-btn">{busy ? 'جاري الإصدار…' : 'إصدار وتنزيل PDF'}</button>
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
          <input style={{ ...inp, marginBottom: 10 }} placeholder="بحث بالرقم / الموضوع / المرسَل إليه / الاسم…" value={logQ} onChange={(e) => setLogQ(e.target.value)} data-testid="letters-log-search" />
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['الرقم', 'التاريخ', 'الموضوع', 'إلى', 'الأسماء', 'الحالة', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
            <tbody>{log.map((l) => <tr key={l.id} data-testid={`letter-row-${l.id}`}><td style={{ ...td, fontWeight: 800 }}>{l.number_display}</td><td style={td}>{(l.issued_at || '').slice(0, 10)}</td><td style={td}>{l.subject}</td><td style={td}>{l.recipient?.title || l.recipient?.name}</td><td style={td}>{(l.people || []).map((p: any) => p.name).join('، ') || '—'}</td><td style={td}>{l.is_revoked ? <Badge text="ملغى" color="#b91c1c" /> : <Badge text="ساري" color="#16a34a" />}</td>
              <td style={{ ...td, whiteSpace: 'nowrap' }}><button onClick={async () => { const r = await api.get(`/letters/${l.id}/pdf`, { responseType: 'blob' }); downloadBlob(r.data, `خطاب ${l.number_display}.pdf`, 'application/pdf'); }} style={btn('#0f2440', { padding: '5px 10px', fontSize: 12 })}>PDF</button> <button onClick={async () => { await api.post(`/letters/${l.id}/${l.is_revoked ? 'restore' : 'revoke'}`); setLogQ((q) => q + ''); api.get('/letters', { params: { q: logQ || undefined } }).then((r) => setLog(r.data)); }} style={btn('#f1f5f9', { color: l.is_revoked ? '#16a34a' : '#b91c1c', padding: '5px 10px', fontSize: 12 })}>{l.is_revoked ? 'استرجاع' : 'إلغاء'}</button></td></tr>)}</tbody></table>
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
        </div>
      )}
    </CorrPage>
  );
}

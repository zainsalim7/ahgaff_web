import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { inp } from '../corr/CorrUI';

export type Person = { kind: string; id: string; label: string; sub?: string; fields?: Record<string, string> };

export const KIND_AR: Record<string, string> = { student: 'طالب', employee: 'موظف', teacher: 'مدرّس', custom: 'يدوي' };
export const KIND_COLOR: Record<string, string> = { student: '#2563eb', employee: '#16a34a', teacher: '#9333ea', custom: '#ea580c' };

export const PeoplePicker = ({ kind, people, onChange, customColumns = [] }: { kind: string; people: Person[]; onChange: (p: Person[]) => void; customColumns?: string[] }) => {
  const [q, setQ] = useState(''); const [hits, setHits] = useState<Person[]>([]);
  const [manual, setManual] = useState(false);
  const [mName, setMName] = useState(''); const [mRole, setMRole] = useState(''); const [mOrg, setMOrg] = useState(''); const [mCode, setMCode] = useState('');
  const [mExtra, setMExtra] = useState<Record<string, string>>({});
  useEffect(() => { if (q.trim().length < 2) { setHits([]); return; } const t = setTimeout(() => api.get('/letters/people', { params: { kind, q } }).then((r) => setHits(r.data)).catch(() => setHits([])), 300); return () => clearTimeout(t); }, [q, kind]);
  const mixed = new Set(people.map((p) => p.kind)).size > 1;
  const addManual = () => {
    const name = mName.trim();
    if (!name) return;
    const extra = Object.fromEntries(customColumns.filter((c) => (mExtra[c] || '').trim()).map((c) => [c, mExtra[c].trim()]));
    onChange([...people, { kind: 'custom', id: `custom-${Date.now()}`, label: mRole.trim() ? `${name} (${mRole.trim()})` : name, sub: mRole.trim(), fields: { الاسم: name, الصفة: mRole.trim(), الجهة: mOrg.trim(), الرقم: mCode.trim(), ...extra } }]);
    setMName(''); setMRole(''); setMOrg(''); setMCode(''); setMExtra({}); setManual(false);
  };
  return (
    <div style={{ border: '1px dashed #c4b5fd', borderRadius: 10, padding: 10, backgroundColor: '#faf5ff' }} data-testid="letter-people">
      <div style={{ position: 'relative' }}>
        <input style={inp} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`ابحث بالاسم أو الرقم لإضافة ${KIND_AR[kind] || ''}… (يمكن الجمع بين طلاب وموظفين ومدرّسين في نفس الجدول)`} data-testid="letter-people-search" />
        {hits.length > 0 && <div style={{ position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 20, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)', maxHeight: 240, overflowY: 'auto' }}>
          {hits.map((h) => <div key={h.id} onClick={() => { if (!people.some((p) => p.id === h.id)) onChange([...people, h]); setQ(''); setHits([]); }} style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }} data-testid={`letter-person-hit-${h.id}`}><b>{h.label}</b> <span style={{ color: '#64748b', fontSize: 12 }}>{h.sub}</span></div>)}
        </div>}
      </div>
      <div style={{ marginTop: 6 }}>
        {!manual ? (
          <button type="button" onClick={() => setManual(true)} style={{ fontSize: 11.5, color: '#ea580c', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }} data-testid="letter-person-manual-toggle">➕ شخص يدوي (بيانات مؤقتة غير مرتبطة بسجلات النظام)</button>
        ) : (
          <div style={{ border: '1px solid #fdba74', borderRadius: 8, padding: 8, background: '#fff7ed', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }} data-testid="letter-person-manual-form">
            <input style={{ ...inp, width: 150 }} placeholder="الاسم *" value={mName} onChange={(e) => setMName(e.target.value)} data-testid="letter-person-manual-name" />
            <input style={{ ...inp, width: 130 }} placeholder="الصفة (مثل: رئيس اللجنة)" value={mRole} onChange={(e) => setMRole(e.target.value)} data-testid="letter-person-manual-role" />
            <input style={{ ...inp, width: 130 }} placeholder="الجهة (اختياري)" value={mOrg} onChange={(e) => setMOrg(e.target.value)} data-testid="letter-person-manual-org" />
            <input style={{ ...inp, width: 90 }} placeholder="رقم (اختياري)" value={mCode} onChange={(e) => setMCode(e.target.value)} data-testid="letter-person-manual-code" />
            {customColumns.map((c) => (
              <input key={c} style={{ ...inp, width: 130, borderColor: '#fcd34d' }} placeholder={`${c} (عمود مخصص)`} value={mExtra[c] || ''} onChange={(e) => setMExtra({ ...mExtra, [c]: e.target.value })} data-testid={`letter-person-manual-extra-${c}`} />
            ))}
            <button type="button" onClick={addManual} disabled={!mName.trim()} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#ea580c', color: '#fff', fontWeight: 700, fontSize: 12, cursor: mName.trim() ? 'pointer' : 'not-allowed', opacity: mName.trim() ? 1 : 0.5 }} data-testid="letter-person-manual-add">إضافة</button>
            <button type="button" onClick={() => setManual(false)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12, cursor: 'pointer' }} data-testid="letter-person-manual-cancel">إلغاء</button>
            {customColumns.length > 0 && <span style={{ flexBasis: '100%', fontSize: 10.5, color: '#b45309' }}>✎ الأعمدة المخصصة الفارغة أعلاه تُملأ لهذا الشخص تحديداً وتظهر في خليته بالجدول فقط.</span>}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {people.map((p, i) => <span key={p.id} data-testid={`letter-person-chip-${p.id}`} style={{ background: '#fff', border: `1px solid ${KIND_COLOR[p.kind] || '#ddd6fe'}`, borderRadius: 999, padding: '3px 10px', fontSize: 12.5, fontWeight: 700 }}>{i + 1}. {p.label} <span style={{ color: KIND_COLOR[p.kind] || '#64748b', fontSize: 11 }}>({KIND_AR[p.kind] || p.kind})</span> <span style={{ cursor: 'pointer', color: '#94a3b8' }} onClick={() => onChange(people.filter((x) => x.id !== p.id))}>✕</span></span>)}
        {people.length === 0 && <span style={{ fontSize: 12, color: '#94a3b8' }}>لم تُضف أسماء — ستُملأ المتغيرات ({'{اسم_الطالب}'}، {'{جدول_الأسماء}'}…) من الأسماء المضافة</span>}
        {mixed && <span data-testid="letter-people-mixed" style={{ fontSize: 11.5, color: '#7c3aed', fontWeight: 700, width: '100%' }}>⊞ جدول مختلط: أعمدة موحّدة (الاسم، الصفة، الرقم، الجهة/الكلية، القسم/الوظيفة)</span>}
      </div>
    </div>
  );
};


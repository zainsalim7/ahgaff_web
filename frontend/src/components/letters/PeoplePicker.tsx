import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { inp } from '../corr/CorrUI';

export type Person = { kind: string; id: string; label: string; sub?: string };

export const KIND_AR: Record<string, string> = { student: 'طالب', employee: 'موظف', teacher: 'مدرّس' };
export const KIND_COLOR: Record<string, string> = { student: '#2563eb', employee: '#16a34a', teacher: '#9333ea' };

export const PeoplePicker = ({ kind, people, onChange }: { kind: string; people: Person[]; onChange: (p: Person[]) => void }) => {
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


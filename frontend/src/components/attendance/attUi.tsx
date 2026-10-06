import React from 'react';
import { Ionicons } from '@expo/vector-icons';

export const C = { navy: '#0f2440', blue: '#1565c0', green: '#16a34a', red: '#dc2626', orange: '#f97316', purple: '#7c3aed', ink: '#0f172a', muted: '#64748b', line: '#e2e8f0', soft: '#f7f9fc' };
export const AR_DAYS = ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const shiftDay = (s: string, n: number) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return ymd(d); };
export const dayNameAr = (s: string) => { const d = new Date(`${s}T12:00:00`); return isNaN(d.getTime()) ? '' : AR_DAYS[(d.getDay() + 6) % 7]; };

export const card: React.CSSProperties = { backgroundColor: '#fff', borderRadius: 16, border: `1px solid ${C.line}`, padding: 16, marginBottom: 12, direction: 'rtl', boxShadow: '0 1px 2px rgba(15,36,64,0.04)' };
export const fieldLbl: React.CSSProperties = { fontSize: 11.5, fontWeight: 800, color: C.muted, marginBottom: 5, textAlign: 'right', display: 'block' };
export const dateInp: React.CSSProperties = { border: `1px solid ${C.line}`, borderRadius: 10, padding: '7px 10px', fontSize: 13, color: C.ink, fontFamily: 'inherit', direction: 'ltr', background: '#fff', height: 38, boxSizing: 'border-box' };
export const textInp: React.CSSProperties = { ...dateInp, direction: 'rtl', width: '100%' };

export const Seg = ({ value, onChange, items, testID }: { value: string; onChange: (v: string) => void; items: { k: string; l: string; icon: any }[]; testID: string }) => (
  <div style={{ display: 'inline-flex', backgroundColor: '#e8edf5', borderRadius: 14, padding: 4, gap: 4, direction: 'rtl' }} data-testid={testID}>
    {items.map((it) => {
      const on = value === it.k;
      return (
        <button key={it.k} type="button" onClick={() => onChange(it.k)} data-testid={`${testID}-${it.k}`}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 11, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13.5, fontFamily: 'inherit', transition: 'background-color .15s, color .15s, box-shadow .15s',
            backgroundColor: on ? C.navy : 'transparent', color: on ? '#fff' : C.navy, boxShadow: on ? '0 2px 6px rgba(15,36,64,0.25)' : 'none' }}>
          <Ionicons name={it.icon} size={15} color={on ? '#fff' : C.navy} />{it.l}
        </button>
      );
    })}
  </div>
);

export const Chip = ({ on, color, onClick, children, testID }: { on: boolean; color: string; onClick: () => void; children: React.ReactNode; testID?: string }) => (
  <button type="button" onClick={onClick} data-testid={testID}
    style={{ padding: '6px 14px', borderRadius: 999, border: `1.5px solid ${on ? color : C.line}`, backgroundColor: on ? color : '#fff', color: on ? '#fff' : color, fontWeight: 800, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', transition: 'background-color .15s, color .15s' }}>
    {children}
  </button>
);

export const DateNav = ({ date, onChange, testID = 'date' }: { date: string; onChange: (d: string) => void; testID?: string }) => {
  const today = ymd(new Date()); const yesterday = shiftDay(today, -1);
  const quick = (k: string, l: string, on: boolean) => <Chip key={k} on={on} color={C.blue} onClick={() => onChange(k)} testID={`${testID}-${l === 'اليوم' ? 'today' : 'yesterday'}`}>{l}</Chip>;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }} data-testid={`${testID}-nav`}>
      {quick(today, 'اليوم', date === today)}{quick(yesterday, 'أمس', date === yesterday)}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, border: `1.5px solid ${date !== today && date !== yesterday ? C.blue : C.line}`, borderRadius: 999, padding: '2px 4px', backgroundColor: '#fff' }}>
        <button type="button" onClick={() => onChange(shiftDay(date, 1))} title="اليوم التالي" data-testid={`${testID}-next`} style={navBtn}><Ionicons name="chevron-forward" size={15} color={C.blue} /></button>
        <input type="date" value={date} onChange={(e) => e.target.value && onChange(e.target.value)} data-testid={`${testID}-input`} style={{ border: 'none', background: 'transparent', fontSize: 13, fontWeight: 800, color: C.ink, outline: 'none', fontFamily: 'inherit', direction: 'ltr', padding: '4px 2px' }} />
        <button type="button" onClick={() => onChange(shiftDay(date, -1))} title="اليوم السابق" data-testid={`${testID}-prev`} style={navBtn}><Ionicons name="chevron-back" size={15} color={C.blue} /></button>
      </div>
      <span style={{ fontSize: 12.5, color: C.muted, fontWeight: 700 }} data-testid={`${testID}-day`}>{dayNameAr(date)}</span>
    </div>
  );
};
const navBtn: React.CSSProperties = { border: 'none', background: 'transparent', cursor: 'pointer', padding: 6, display: 'flex', borderRadius: 999 };

export const Empty = ({ icon, title, hint }: { icon: any; title: string; hint?: string }) => (
  <div style={{ textAlign: 'center', padding: '40px 16px', color: C.muted }} data-testid="att-empty">
    <Ionicons name={icon} size={46} color="#cfd6e1" />
    <div style={{ fontSize: 15, fontWeight: 800, color: C.navy, marginTop: 10 }}>{title}</div>
    {hint && <div style={{ fontSize: 12.5, marginTop: 4 }}>{hint}</div>}
  </div>
);

export const th: React.CSSProperties = { padding: '10px 12px', fontSize: 12, color: C.muted, fontWeight: 800, textAlign: 'right', borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap', backgroundColor: C.soft };
export const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: C.ink, textAlign: 'right', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' };

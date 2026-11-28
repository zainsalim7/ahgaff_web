import React from 'react';
import { ScrollBox } from '../ScrollBox';

type Cell = { excused: number; unexcused: number; excess_u: number; excess_t: number; outcome: string; outcome_ar: string; board?: boolean } | null;
export type SummaryData = {
  limits: { unexcused: number; total: number; dismiss: number };
  courses: { id: string; name: string; executed_hours: number; hours_label?: string; h_u: number; h_t: number }[];
  rows: { student_db_id: string; name: string; reg_no: string; section: string; cells: Cell[]; outcomes: string[]; all_first: boolean }[];
  counts: { first: number; takmili: number; repeat: number; dismiss: number };
  cell_counts: { first: number; takmili: number; repeat: number; dismiss: number };
  students: number;
};

const FILLS = ['#FCE4D6', '#DDEBF7', '#E4DFEC', '#E2EFDA', '#FBE2E6', '#DDEBF7', '#FFF2CC', '#EDEDED'];
const OUT: Record<string, string> = { takmili: '#fde7c8', repeat: '#f8c9c9', dismiss: '#e6a3a3' };
const n = (x: number) => (x ? String(+x.toFixed(3)) : '-');
const z = (x: number) => (x ? String(+x.toFixed(3)) : '0');
const th: React.CSSProperties = { border: '1px solid #475569', padding: '3px 4px', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', position: 'sticky', textAlign: 'center' };
const td: React.CSSProperties = { border: '1px solid #cbd5e1', padding: '3px 5px', fontSize: 12, textAlign: 'center', whiteSpace: 'nowrap' };

/** الكشف على الشاشة بنفس ترتيب النموذج الرسمي — رؤوس ثابتة وعمود الاسم ثابت */
export const AbsenceSummaryTable = ({ d }: { d: SummaryData }) => {
  const u = `${d.limits.unexcused}%`, t = `${d.limits.total}%`;
  const H = 26;
  const top = (r: number) => ({ top: r * H, zIndex: 3 });
  return (
    <ScrollBox testID="as-scrollbox">
      <table dir="rtl" style={{ borderCollapse: 'separate', borderSpacing: 0, background: '#fff' }} data-testid="as-table">
        <thead>
          <tr style={{ height: H }}>
            <th rowSpan={4} style={{ ...th, ...top(0), right: 0, zIndex: 5, background: '#f1f5f9', width: 34, minWidth: 34, boxSizing: 'border-box' }}>م</th>
            <th rowSpan={4} style={{ ...th, ...top(0), right: 34, zIndex: 5, background: '#f1f5f9', width: 220, minWidth: 220, maxWidth: 220, boxSizing: 'border-box' }}>الاسم</th>
            <th rowSpan={4} style={{ ...th, ...top(0), right: 254, zIndex: 5, background: '#f1f5f9', minWidth: 90 }}>رقم القيد</th>
            {d.courses.map((c, i) => <th key={c.id} colSpan={5} style={{ ...th, ...top(0), background: FILLS[i % FILLS.length], fontSize: 13 }}>{c.name}</th>)}
          </tr>
          <tr style={{ height: H }}>
            {d.courses.map((c, i) => (
              <React.Fragment key={c.id}>
                <th colSpan={4} style={{ ...th, ...top(1), background: FILLS[i % FILLS.length] }}>الساعات الفعلية</th>
                <th style={{ ...th, ...top(1), background: FILLS[i % FILLS.length], fontSize: 13 }}>{c.hours_label || Math.round(c.executed_hours)}</th>
              </React.Fragment>
            ))}
          </tr>
          <tr style={{ height: H }}>
            {d.courses.map((c, i) => (
              <React.Fragment key={c.id}>
                <th colSpan={2} style={{ ...th, ...top(2), background: FILLS[i % FILLS.length] }}>ساعات الغياب</th>
                <th style={{ ...th, ...top(2), background: FILLS[i % FILLS.length] }} title={`نسبة ${u}`}>{+c.h_u.toFixed(2)}</th>
                <th colSpan={2} style={{ ...th, ...top(2), background: FILLS[i % FILLS.length] }} title={`نسبة ${t}`}>{Math.floor(c.h_t + 0.5)}</th>
              </React.Fragment>
            ))}
          </tr>
          <tr style={{ height: H }}>
            {d.courses.map((c, i) => ['بعذر', 'بدون عذر', u, t, 'النتيجة'].map((x, j) => (
              <th key={`${c.id}-${j}`} style={{ ...th, ...top(3), background: FILLS[i % FILLS.length], borderLeft: j === 4 ? '2px solid #1e293b' : th.border as string }}>{x}</th>
            )))}
          </tr>
        </thead>
        <tbody>
          {d.rows.map((r, i) => (
            <tr key={r.student_db_id} data-testid={`as-row-${i}`}>
              <td style={{ ...td, position: 'sticky', right: 0, background: '#fff', zIndex: 2, width: 34, minWidth: 34, boxSizing: 'border-box' }}>{i + 1}</td>
              <td style={{ ...td, position: 'sticky', right: 34, background: '#fff', zIndex: 2, textAlign: 'right', fontWeight: 600, width: 220, minWidth: 220, maxWidth: 220, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</td>
              <td style={{ ...td, position: 'sticky', right: 254, background: '#fff', zIndex: 2, minWidth: 90 }} data-testid={`as-reg-${i}`}>{r.reg_no || '—'}</td>
              {r.cells.map((c, j) => c ? (
                <React.Fragment key={j}>
                  <td style={td}>{n(c.excused)}</td>
                  <td style={td}>{n(c.unexcused)}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{z(c.excess_u)}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{z(c.excess_t)}</td>
                  <td style={{ ...td, fontWeight: 700, background: OUT[c.outcome] || undefined, borderLeft: '2px solid #1e293b' }} title={c.board ? 'بقرار مجلس الكلية' : undefined}
                    data-testid={`as-out-${i}-${j}`}>{c.outcome_ar}{c.board ? ' *' : ''}</td>
                </React.Fragment>
              ) : <td key={j} colSpan={5} style={{ ...td, color: '#94a3b8', borderLeft: '2px solid #1e293b' }}>غير مسجّل</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollBox>
  );
};

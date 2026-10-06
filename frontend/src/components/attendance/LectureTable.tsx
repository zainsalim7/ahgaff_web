import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { C, th, td, Empty } from './attUi';

export type Lecture = { id: string; course_id: string; course_name?: string; course_code?: string; teacher_name?: string; date: string; start_time?: string; end_time?: string; room?: string; group_name?: string; department_name?: string; faculty_name?: string; level?: number; section?: string; status?: string; attendance_taken?: boolean };

const STATUS_LBL: Record<string, { l: string; c: string; bg: string }> = {
  completed: { l: 'مكتملة', c: C.green, bg: '#e8f5e9' }, cancelled: { l: 'ملغاة', c: C.muted, bg: '#f1f5f9' }, absent: { l: 'لم تُحضَّر', c: C.red, bg: '#ffebee' }, in_progress: { l: 'جارية', c: C.orange, bg: '#fff3e0' }, scheduled: { l: 'مجدولة', c: C.blue, bg: '#e3f2fd' },
};

export const LectureTable = ({ lectures, onOpen }: { lectures: Lecture[]; onOpen: (l: Lecture) => void }) => {
  if (lectures.length === 0) return <Empty icon="calendar-outline" title="لا توجد محاضرات مطابقة" hint="غيّر التاريخ أو القسم أو امسح البحث" />;
  return (
    <div style={{ overflowX: 'auto', borderRadius: 12, border: `1px solid ${C.line}` }} data-testid="lecture-table">
      <table style={{ width: '100%', borderCollapse: 'collapse', direction: 'rtl' }}>
        <thead><tr>{['الوقت', 'المقرر', 'المدرّس', 'القسم / الكلية', 'المستوى · الشعبة', 'القاعة', 'الحالة', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {lectures.map((l, i) => {
            const taken = !!l.attendance_taken;
            const s = STATUS_LBL[l.status || 'scheduled'] || STATUS_LBL.scheduled;
            return (
              <tr key={l.id} data-testid={`lecture-${l.id}`} style={{ backgroundColor: i % 2 ? '#fff' : '#fcfdff', cursor: 'pointer' }} onClick={() => onOpen(l)}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#eef4ff')} onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = i % 2 ? '#fff' : '#fcfdff')}>
                <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 800, direction: 'ltr', textAlign: 'right' }}>{l.start_time}{l.end_time ? ` – ${l.end_time}` : ''}</td>
                <td style={{ ...td, fontWeight: 800, color: C.navy }}>{l.course_name || l.course_code}{l.group_name ? <span style={{ fontSize: 11, color: C.purple, marginRight: 6 }}>({l.group_name})</span> : null}</td>
                <td style={td}>{l.teacher_name || '—'}</td>
                <td style={td}><div>{l.department_name || '—'}</div>{l.faculty_name ? <div style={{ fontSize: 11, color: C.muted }}>{l.faculty_name}</div> : null}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{l.level ? `م${l.level}` : '—'}{l.section ? ` · ${l.section}` : ''}</td>
                <td style={td}>{l.room || '—'}</td>
                <td style={td}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 800, color: taken ? C.green : s.c, backgroundColor: taken ? '#e8f5e9' : s.bg }}>
                    <Ionicons name={taken ? 'checkmark-circle' : 'time-outline'} size={13} color={taken ? C.green : s.c} />{taken ? 'تم التحضير' : s.l}
                  </span>
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(l); }} data-testid={`lecture-open-${l.id}`}
                    style={{ border: 'none', borderRadius: 9, padding: '7px 14px', fontWeight: 800, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', backgroundColor: taken ? '#eef4ff' : C.blue, color: taken ? C.blue : '#fff' }}>
                    {taken ? 'تعديل الحضور' : 'تسجيل الحضور'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

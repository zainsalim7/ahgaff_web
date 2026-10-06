import React, { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import api, { attendanceAPI } from '../../services/api';
import { formatGregorianDate } from '../../utils/dateUtils';
import { StatusEditPill, ATT_STATUS_META } from './StatusEditPill';
import { ReportKpis } from '../reports/ReportShell';
import { C, card, fieldLbl, dateInp, textInp, Chip, Empty, th, td, dayNameAr } from './attUi';

type Rec = { id: string; course_id: string; lecture_id?: string | null; course_name: string; status: string; date: string; start_time?: string; end_time?: string };
type Hit = { id: string; title: string; subtitle: string };
const STATUS_CHIPS = [{ k: '', l: 'الكل', c: C.navy }, { k: 'absent', l: 'غائب', c: C.red }, { k: 'present', l: 'حاضر', c: C.green }, { k: 'late', l: 'متأخر', c: C.orange }, { k: 'excused', l: 'بعذر', c: C.blue }];

export const StudentAttendanceSearch = ({ canEdit }: { canEdit: boolean }) => {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [student, setStudent] = useState<Hit | null>(null);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('absent');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    const s = q.trim();
    if (s.length < 2 || (student && s === student.title)) { setHits([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try { const r = await api.get('/search', { params: { q: s, types: 'students', limit_per_type: 10 } }); setHits(r.data?.results?.students || []); }
      catch { setHits([]); } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q, student]);

  const pick = async (h: Hit) => {
    setStudent(h); setQ(h.title); setHits([]); setLoading(true);
    try { const r = await attendanceAPI.getStudentAttendance(h.id); setRecs(r.data || []); } catch { setRecs([]); } finally { setLoading(false); }
  };
  const reset = () => { setStudent(null); setQ(''); setRecs([]); setHits([]); };

  const inRange = useMemo(() => recs.filter((r) => { const d = (r.date || '').slice(0, 10); return (!from || d >= from) && (!to || d <= to); }), [recs, from, to]);
  const filtered = useMemo(() => inRange.filter((r) => !status || r.status === status), [inRange, status]);
  const counts = useMemo(() => inRange.reduce((a: Record<string, number>, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {}), [inRange]);
  const byCourse = useMemo(() => {
    const m: Record<string, { name: string; items: Rec[] }> = {};
    filtered.forEach((r) => { (m[r.course_id] ||= { name: r.course_name, items: [] }).items.push(r); });
    return Object.entries(m);
  }, [filtered]);
  const onChanged = (id: string, s: string) => setRecs((p) => p.map((r) => (r.id === id ? { ...r, status: s } : r)));

  return (
    <div data-testid="student-att-search">
      <div style={card}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1.6fr) auto auto auto', gap: 14, alignItems: 'end' }}>
          <div style={{ position: 'relative' }}>
            <label style={fieldLbl}>الطالب (الاسم أو رقم القيد)</label>
            <div style={{ position: 'relative' }}>
              <input value={q} onChange={(e) => { setQ(e.target.value); if (student) setStudent(null); }} placeholder="اكتب اسم الطالب أو رقم القيد…" style={{ ...textInp, paddingLeft: 34 }} data-testid="student-att-search-input" />
              <span style={{ position: 'absolute', left: 10, top: 10, cursor: q ? 'pointer' : 'default' }} onClick={q ? reset : undefined} data-testid="student-att-search-clear">
                <Ionicons name={searching ? 'hourglass-outline' : q ? 'close-circle' : 'search'} size={17} color="#8a95a8" />
              </span>
            </div>
            {hits.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 50, backgroundColor: '#fff', borderRadius: 12, border: `1px solid ${C.line}`, boxShadow: '0 10px 30px rgba(15,36,64,0.15)', marginTop: 4, overflow: 'hidden', maxHeight: 320, overflowY: 'auto' }} data-testid="student-att-hits">
                {hits.map((h) => (
                  <div key={h.id} onClick={() => pick(h)} data-testid={`student-att-hit-${h.id}`} style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = C.soft)} onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#fff')}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: C.navy }}>{h.title}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{h.subtitle}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div><label style={fieldLbl}>من تاريخ</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={dateInp} data-testid="student-att-from" /></div>
          <div><label style={fieldLbl}>إلى تاريخ</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={dateInp} data-testid="student-att-to" /></div>
          <div>
            <label style={fieldLbl}>الحالة</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {STATUS_CHIPS.map((c) => <Chip key={c.k} on={status === c.k} color={c.c} onClick={() => setStatus(c.k)} testID={`student-att-status-${c.k || 'all'}`}>{c.l}{c.k && student ? ` ${counts[c.k] || 0}` : ''}</Chip>)}
            </div>
          </div>
        </div>
      </div>

      {!student ? (
        <div style={card}><Empty icon="person-circle-outline" title="ابحث عن طالب لعرض سجل حضوره" hint="اختر الطالب ثم حدّد الحالة والفترة — ستظهر مقرراته التي سُجّل فيها حضور أو غياب مع إمكانية التعديل الفوري" /></div>
      ) : (
        <>
          <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }} data-testid="student-att-header">
            <div style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: C.navy, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18 }}>{student.title.trim().charAt(0)}</div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.navy }}>{student.title}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{student.subtitle}</div>
            </div>
            <button type="button" onClick={() => router.push(`/student-details?studentId=${student.id}` as any)} data-testid="student-att-profile" style={{ border: `1px solid ${C.line}`, background: '#fff', borderRadius: 10, padding: '8px 14px', fontWeight: 800, fontSize: 12.5, cursor: 'pointer', color: C.navy, fontFamily: 'inherit' }}>ملف الطالب ←</button>
          </div>
          <ReportKpis testID="student-att-kpis" items={[
            { label: 'سجلات الفترة', value: inRange.length, color: C.navy, icon: 'list' },
            { label: 'غائب', value: counts.absent || 0, color: C.red, icon: 'close-circle', active: status === 'absent', onPress: () => setStatus(status === 'absent' ? '' : 'absent'), testID: 'kpi-absent' },
            { label: 'حاضر', value: counts.present || 0, color: C.green, icon: 'checkmark-circle', active: status === 'present', onPress: () => setStatus(status === 'present' ? '' : 'present'), testID: 'kpi-present' },
            { label: 'متأخر', value: counts.late || 0, color: C.orange, icon: 'time', active: status === 'late', onPress: () => setStatus(status === 'late' ? '' : 'late'), testID: 'kpi-late' },
            { label: 'بعذر', value: counts.excused || 0, color: C.blue, icon: 'document-text', active: status === 'excused', onPress: () => setStatus(status === 'excused' ? '' : 'excused'), testID: 'kpi-excused' },
          ]} />
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.navy }}>المقررات ({byCourse.length}) · {filtered.length} سجل</div>
              {canEdit && <div style={{ fontSize: 12, color: C.blue, fontWeight: 700 }} data-testid="student-att-summary">اضغط على الحالة لتعديلها مباشرة</div>}
            </div>
            {loading ? <div style={{ textAlign: 'center', padding: 30, color: C.muted }}>جاري التحميل…</div>
              : byCourse.length === 0 ? <Empty icon="checkmark-done-circle-outline" title="لا توجد سجلات مطابقة" hint="غيّر الحالة أو وسّع الفترة الزمنية" />
              : byCourse.map(([cid, g]) => (
                <div key={cid} style={{ marginBottom: 14 }} data-testid={`student-att-course-${cid}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Ionicons name="book" size={15} color={C.blue} />
                    <span style={{ fontSize: 14, fontWeight: 800, color: C.navy }}>{g.name}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: C.blue, backgroundColor: '#e3f2fd', padding: '2px 9px', borderRadius: 999 }}>{g.items.length}</span>
                  </div>
                  <div style={{ borderRadius: 12, border: `1px solid ${C.line}`, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr>{['اليوم', 'التاريخ', 'الوقت', 'الحالة', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
                      <tbody>
                        {g.items.map((r, i) => (
                          <tr key={r.id} style={{ backgroundColor: i % 2 ? '#fff' : '#fcfdff' }}>
                            <td style={{ ...td, color: C.muted }}>{dayNameAr(r.date.slice(0, 10))}</td>
                            <td style={{ ...td, fontWeight: 700 }}>{formatGregorianDate(new Date(r.date))}</td>
                            <td style={{ ...td, direction: 'ltr', textAlign: 'right' }}>{r.start_time ? `${r.start_time} – ${r.end_time}` : '—'}</td>
                            <td style={td}><div style={{ display: 'inline-flex' }}><StatusEditPill recordId={r.id} status={r.status} editable={canEdit} title={`${r.course_name} · ${formatGregorianDate(new Date(r.date))}`} onChanged={(s) => onChanged(r.id, s)} /></div></td>
                            <td style={{ ...td, whiteSpace: 'nowrap' }}>
                              {!!r.lecture_id && (
                                <button type="button" onClick={() => router.push({ pathname: '/take-attendance', params: { lectureId: r.lecture_id, courseId: r.course_id, courseName: r.course_name } } as any)} data-testid={`student-att-open-${r.id}`}
                                  style={{ border: 'none', background: '#eef4ff', color: C.blue, borderRadius: 9, padding: '6px 12px', fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>كشف المحاضرة</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
};

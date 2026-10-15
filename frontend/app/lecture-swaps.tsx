import React, { useEffect, useState } from 'react';
import { Platform, Alert } from 'react-native';
import api from '../src/services/api';
import { CorrPage, card, btn, inp, lbl, Badge, Modal, Empty } from '../src/components/corr/CorrUI';

const notify = (t: string, m: string) => (Platform.OS === 'web' ? window.alert(`${t}\n${m}`) : Alert.alert(t, m));
const STATUS: Record<string, [string, string]> = {
  approved: ['مطبّق', '#16a34a'], executed: ['نُفّذ', '#0f766e'], cancelled: ['ملغى', '#64748b'],
};
const lecTxt = (l: any) => l ? `${l.course_name || ''}${l.group_name ? ` (${l.group_name})` : ''} — ${l.date} ${l.start_time || ''}` : '';

export default function LectureSwapsScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [type, setType] = useState<'swap' | 'cover'>('swap');
  const [teacherA, setTeacherA] = useState('');
  const [lecsA, setLecsA] = useState<any>(null);
  const [lectureA, setLectureA] = useState('');
  const [cands, setCands] = useState<any>(null);
  const [cp, setCp] = useState('');
  const [lectureB, setLectureB] = useState('');
  const [reason, setReason] = useState('');
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [qA, setQA] = useState('');
  const [qB, setQB] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const norm = (s: string) => (s || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim().toLowerCase();
  const match = (name: string, q: string) => !q || norm(name).includes(norm(q));

  const load = async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([api.get('/lecture-swaps', { params: filter ? { status: filter } : {} }), api.get('/lecture-swaps/teachers')]);
      setItems(r1.data.items); setTeachers(r2.data.teachers);
    } catch (e: any) { notify('خطأ', e?.response?.data?.detail || 'تعذر التحميل'); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [filter]);
  useEffect(() => {
    setLectureA(''); setLecsA(null);
    if (!teacherA) return;
    const params: any = { teacher_id: teacherA };
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    api.get('/lecture-swaps/teacher-lectures', { params }).then((r) => setLecsA(r.data)).catch((e) => setErr(e?.response?.data?.detail || 'تعذر جلب المحاضرات'));
  }, [teacherA, dateFrom, dateTo]);
  useEffect(() => {
    setCp(''); setLectureB('');
    if (!lectureA) { setCands(null); return; }
    api.get('/lecture-swaps/candidates', { params: { lecture_id: lectureA, type } }).then((r) => setCands(r.data)).catch((e) => setErr(e?.response?.data?.detail || 'تعذر جلب الأساتذة'));
  }, [lectureA, type]);

  const resetForm = () => { setShowNew(false); setTeacherA(''); setLectureA(''); setReason(''); setErr(''); setQA(''); setQB(''); setDateFrom(''); setDateTo(''); };
  const act = async (path: string, body: any, okMsg: string) => {
    setBusy(true); setErr('');
    try { await api.post(path, body); notify('تم ✅', okMsg); resetForm(); await load(); }
    catch (e: any) { const m = e?.response?.data?.detail || 'خطأ'; if (showNew) setErr(m); else notify('تعذر', m); } finally { setBusy(false); }
  };
  const selTeacher = cands?.teachers?.find((t: any) => t.teacher_id === cp);
  const canSubmit = !!lectureA && !!cp && (type === 'cover' || !!lectureB) && !busy;
  const teachersA = teachers.filter((t: any) => match(t.full_name, qA));
  const teachersB = (cands?.teachers || []).filter((t: any) => match(t.full_name, qB));
  const searchStyle = { ...inp, marginBottom: 6, background: '#f8fafc' } as any;
  const [qList, setQList] = useState('');
  const shown = items.filter((s) => match(`${s.teacher_a_name} ${s.teacher_b_name} ${s.lecture_a?.course_name || ''} ${s.lecture_b?.course_name || ''}`, qList));

  return (
    <CorrPage title="🔁 تبادل / إنابة المحاضرات" subtitle="عملية إدارية: تختار محاضرة أستاذ وتسندها لزميل متاح (مقابل محاضرة له في الأسبوع نفسه، أو إنابة بلا مقابل). تُطبَّق فوراً ويُشعَر الأستاذان والطلاب." loading={loading} testID="lecture-swaps-page" hideNav
      actions={<button onClick={() => { setShowNew(true); setErr(''); }} style={btn('#00838f')} data-testid="swap-new-btn">＋ تبادل / إنابة جديدة</button>}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', direction: 'rtl', alignItems: 'center' }}>
        {[['', 'الكل'], ['approved', 'المطبّقة (قادمة)'], ['executed', 'المنفّذة'], ['cancelled', 'الملغاة']].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)} style={btn(filter === v ? '#1a2540' : '#94a3b8')} data-testid={`swap-filter-${v || 'all'}`}>{l}</button>
        ))}
        <input value={qList} onChange={(e: any) => setQList(e.target.value)} placeholder="🔍 بحث باسم الأستاذ الأصلي أو البديل أو المقرر…" style={{ ...inp, flex: 1, minWidth: 220 }} data-testid="swap-list-search" />
      </div>
      {shown.length === 0 && <Empty text={qList ? 'لا نتائج مطابقة للبحث' : 'لا توجد عمليات'} />}
      {shown.map((s) => (
        <div key={s.id} style={card} data-testid={`swap-item-${s.id}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Badge text={STATUS[s.status]?.[0] || s.status} color={STATUS[s.status]?.[1] || '#64748b'} testID={`swap-status-${s.id}`} />
            <b style={{ fontSize: 13 }}>{s.type === 'swap' ? '🔁 تبادل' : '🤝 إنابة'} — {s.teacher_a_name} ↔ {s.teacher_b_name}{s.cross_department ? ' · بين قسمين' : ''}</b>
          </div>
          <div style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.9 }}>
            <div>📘 محاضرة {s.teacher_a_name}: <b>{lecTxt(s.lecture_a)}</b> ← ينفّذها <b>{s.teacher_b_name}</b></div>
            {s.lecture_b && <div>📗 محاضرة {s.teacher_b_name}: <b>{lecTxt(s.lecture_b)}</b> ← ينفّذها <b>{s.teacher_a_name}</b></div>}
            {s.reason ? <div style={{ color: '#475569' }}>السبب: {s.reason}</div> : null}
            <div style={{ color: '#94a3b8', fontSize: 11 }}>{(s.history || []).map((a: any) => `${a.step === 'apply' ? 'طبّقها' : 'ألغاها'}: ${a.name || ''}${a.note ? ` — ${a.note}` : ''}`).join(' · ')}</div>
          </div>
          {s.can_cancel && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button disabled={busy} onClick={() => { if (Platform.OS !== 'web' || window.confirm('إلغاء العملية؟ ستعود المحاضرات لأصحابها.')) act(`/lecture-swaps/${s.id}/cancel`, { note: '' }, 'تم الإلغاء وإرجاع المحاضرات'); }} style={btn('#64748b')} data-testid={`swap-cancel-${s.id}`}>↩ إلغاء وإرجاع</button>
            </div>
          )}
        </div>
      ))}

      {showNew && (
        <Modal title="تبادل / إنابة محاضرة" onClose={resetForm} width={720} testID="swap-new-modal" closeOnOverlay={false}>
          {err ? <div style={{ background: '#d32f2f', color: '#fff', padding: '10px 12px', borderRadius: 8, marginBottom: 10, fontSize: 13, fontWeight: 700 }} data-testid="swap-error">{err}</div> : null}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <button onClick={() => setType('swap')} style={btn(type === 'swap' ? '#00838f' : '#94a3b8')} data-testid="swap-type-swap">🔁 تبادل (محاضرة مقابل محاضرة)</button>
            <button onClick={() => setType('cover')} style={btn(type === 'cover' ? '#00838f' : '#94a3b8')} data-testid="swap-type-cover">🤝 إنابة (بدون مقابل)</button>
          </div>
          <label style={lbl}>الأستاذ الأصلي</label>
          <input value={qA} onChange={(e: any) => setQA(e.target.value)} placeholder="🔍 ابحث باسم الأستاذ…" style={searchStyle} data-testid="swap-search-a" />
          <select value={teacherA} onChange={(e: any) => setTeacherA(e.target.value)} style={inp} data-testid="swap-teacher-a" size={qA ? Math.min(6, Math.max(2, teachersA.length + 1)) : undefined}>
            <option value="">-- اختر الأستاذ ({teachersA.length}) --</option>
            {teachersA.map((t: any) => <option key={t.teacher_id} value={t.teacher_id}>{t.full_name}</option>)}
          </select>
          {teacherA && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }} data-testid="swap-date-range">
              <label style={{ ...lbl, margin: 0 }}>📅 حصر المحاضرات بين</label>
              <input type="date" value={dateFrom} onChange={(e: any) => setDateFrom(e.target.value)} style={{ ...inp, width: 'auto' }} data-testid="swap-date-from" />
              <span style={{ fontSize: 12 }}>و</span>
              <input type="date" value={dateTo} onChange={(e: any) => setDateTo(e.target.value)} style={{ ...inp, width: 'auto' }} data-testid="swap-date-to" />
              {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(''); setDateTo(''); }} style={btn('#94a3b8')} data-testid="swap-date-clear">مسح</button>}
              <span style={{ fontSize: 11, color: '#64748b' }}>{!dateFrom && !dateTo ? '(افتراضياً: 30 يوماً القادمة)' : ''}</span>
            </div>
          )}
          {lecsA && (
            <>
              <label style={{ ...lbl, marginTop: 10 }}>محاضرته التي سيتم {type === 'swap' ? 'تبادلها' : 'الإنابة عنها'} ({lecsA.lectures.length})</label>
              {lecsA.lectures.length === 0 ? <div style={{ fontSize: 12, color: '#b91c1c' }}>لا توجد محاضرات مجدولة لهذا الأستاذ في هذه الفترة</div> : (
                <select value={lectureA} onChange={(e: any) => setLectureA(e.target.value)} style={inp} data-testid="swap-lecture-a">
                  <option value="">-- اختر المحاضرة --</option>
                  {lecsA.lectures.map((l: any) => <option key={l.id} value={l.id} disabled={!l.eligible}>{lecTxt(l)}{!l.eligible ? ` — ${l.reason}` : ''}</option>)}
                </select>
              )}
            </>
          )}
          {cands && (
            <>
              <label style={{ ...lbl, marginTop: 10 }}>الأستاذ البديل (الأسبوع {cands.week[0]} → {cands.week[1]}) — المتاحون وقت المحاضرة أولاً</label>
              <input value={qB} onChange={(e: any) => setQB(e.target.value)} placeholder="🔍 ابحث باسم الأستاذ البديل…" style={searchStyle} data-testid="swap-search-b" />
              <select value={cp} onChange={(e: any) => { setCp(e.target.value); setLectureB(''); }} style={inp} data-testid="swap-counterpart" size={qB ? Math.min(6, Math.max(2, teachersB.length + 1)) : undefined}>
                <option value="">-- اختر الأستاذ البديل ({teachersB.length}) --</option>
                {teachersB.map((t: any) => <option key={t.teacher_id} value={t.teacher_id} disabled={!t.available}>{t.available ? '✓ ' : '✗ '}{t.full_name}{!t.available ? ` — ${t.busy_reason}` : ''}</option>)}
              </select>
              {type === 'swap' && selTeacher && (
                <>
                  <label style={{ ...lbl, marginTop: 10 }}>محاضرة البديل التي سينفّذها الأستاذ الأصلي بالمقابل</label>
                  {selTeacher.swappable.length === 0 ? <div style={{ fontSize: 12, color: '#b91c1c' }}>لا توجد محاضرات قابلة للتبادل لهذا الأستاذ في الأسبوع نفسه</div> : (
                    <select value={lectureB} onChange={(e: any) => setLectureB(e.target.value)} style={inp} data-testid="swap-lecture-b">
                      <option value="">-- اختر --</option>
                      {selTeacher.swappable.map((l: any) => <option key={l.id} value={l.id} disabled={!l.ok}>{l.ok ? '✓ ' : '✗ '}{lecTxt(l)}{!l.ok ? ` — ${l.conflict}` : ''}</option>)}
                    </select>
                  )}
                </>
              )}
            </>
          )}
          <label style={{ ...lbl, marginTop: 10 }}>السبب</label>
          <textarea value={reason} onChange={(e: any) => setReason(e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} placeholder="مثال: ارتباط رسمي / ظرف طارئ / تكليف إداري" data-testid="swap-reason" />
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 8, lineHeight: 1.8 }}>⚠️ تُطبَّق فوراً على المحاضرتين دون موافقات · لمرة واحدة ولا يُعاد تبادل المحاضرة نفسها · يُشعَر الأستاذان والطلاب تلقائياً · الحضور يسجّله المنفّذ الفعلي وتُنسب الساعات إليه مع حفظ الأستاذ الأصلي · الإلغاء ممكن قبل موعد المحاضرة.</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={resetForm} style={btn('#94a3b8', { flex: 1 })}>إلغاء</button>
            <button disabled={!canSubmit} onClick={() => act('/lecture-swaps', { type, lecture_a_id: lectureA, counterpart_teacher_id: cp, lecture_b_id: type === 'swap' ? lectureB : undefined, reason }, 'تم تطبيق العملية وإشعار الأستاذين')} style={btn(canSubmit ? '#00838f' : '#9fb3b6', { flex: 2 })} data-testid="swap-submit">تطبيق الآن</button>
          </div>
        </Modal>
      )}
    </CorrPage>
  );
}

import React, { useEffect, useState } from 'react';
import api from '../services/api';

interface Props {
  open: boolean;
  onClose: () => void;
  initialDate: string;
  onApplied: () => void;
  isAdmin?: boolean;
}

const QUICK_STARTS = ['08:30', '09:00', '09:30', '10:00', '10:30'];
const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, direction: 'rtl', backgroundColor: '#f7f9fc', boxSizing: 'border-box' };
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#333', marginBottom: 5, textAlign: 'right' };

export const DayShiftModal: React.FC<Props> = ({ open, onClose, initialDate, onApplied, isAdmin = false }) => {
  const [dateFrom, setDateFrom] = useState(initialDate);
  const [dateTo, setDateTo] = useState('');
  const [rangeMode, setRangeMode] = useState(false);
  const [facultyId, setFacultyId] = useState('');
  const [faculties, setFaculties] = useState<any[]>([]);
  const [newStart, setNewStart] = useState('10:00');
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(true);
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [exceptions, setExceptions] = useState<Record<string, string>>({});
  const [exceptionsOpen, setExceptionsOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDateFrom(initialDate); setDateTo(''); setPreview(null); setErr(''); setReason(''); setExceptions({}); setExceptionsOpen(false);
    api.get('/faculties').then((r) => {
      const list = r.data || [];
      setFaculties(list);
      // 🔒 مستخدم غير أدمن (عميد/رئيس قسم): يُقفل دائماً على كليته الوحيدة — لا خيار «كل الجامعة»
      if (!isAdmin && list.length >= 1) setFacultyId(list[0].id);
    }).catch(() => setFaculties([]));
  }, [open, initialDate, isAdmin]);

  if (!open) return null;

  const body = () => ({
    date_from: dateFrom,
    date_to: rangeMode && dateTo ? dateTo : null,
    faculty_id: facultyId || null,
    new_start_time: newStart,
    reason,
    notify,
    exceptions: Object.keys(exceptions).length ? exceptions : undefined,
  });

  const runPreview = async () => {
    setBusy(true); setErr(''); setPreview(null);
    try {
      const r = await api.post('/day-shift/preview', body());
      setPreview(r.data);
    } catch (e: any) {
      setErr(typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : 'خطأ في المعاينة');
    } finally { setBusy(false); }
  };

  const setExceptionAction = async (id: string, action: string) => {
    const prev = exceptions;
    const next = { ...exceptions };
    if (!action) delete next[id]; else next[id] = action;
    setExceptions(next);
    setBusy(true); setErr('');
    try {
      const r = await api.post('/day-shift/preview', { ...body(), exceptions: next });
      setPreview(r.data);
    } catch (e: any) {
      setExceptions(prev);
      setErr(typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : 'خطأ في المعاينة');
    } finally { setBusy(false); }
  };

  const runApply = async () => {
    if (!preview) return;
    const daysWithMoves = (preview.days || []).filter((d: any) => d.lectures > 0 || d.cancelled > 0);
    if (!window.confirm(`⚠️ تأكيد الإزاحة:\n\n• ${preview.total_lectures} محاضرة صباحية تُزاح وتتقلص إلى 60 دقيقة في ${daysWithMoves.length} يوم\n• ${preview.total_kept || 0} محاضرة في الفترة الرابعة تبقى بوقتها\n• ${preview.total_cancelled || 0} محاضرة بعد الرابعة تُلغى\n${preview.exceptions_applied ? `• ${preview.exceptions_applied} محاضرة بتخصيص يدوي (استثناء) مُطبَّق — راجعها في القائمة أعلاه\n` : ''}• النطاق: ${preview.faculty_name}\n• البداية الجديدة: ${newStart}\n${notify ? '• سيُرسل إشعار لكل الأساتذة والطلاب المتأثرين' : '• بدون إشعارات'}\n\nيمكن التراجع لاحقاً من شارة اليوم. متابعة؟`)) return;
    setBusy(true); setErr('');
    try {
      const r = await api.post('/day-shift/apply', body());
      window.alert(`✅ ${r.data.message}${r.data.notified ? `\n🔔 أُرسل ${r.data.notified} إشعاراً` : ''}`);
      onApplied(); onClose();
    } catch (e: any) {
      setErr(typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : 'فشل التنفيذ');
    } finally { setBusy(false); }
  };

  const reset = () => { setPreview(null); setExceptions({}); setExceptionsOpen(false); };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl' }} onClick={() => !busy && onClose()}>
      <div onClick={(ev) => ev.stopPropagation()} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 22, width: 560, maxWidth: '94%', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }} data-testid="day-shift-modal">
        <div style={{ fontSize: 16, fontWeight: 800, color: '#0f2440', marginBottom: 4, textAlign: 'right' }}>⏰ إزاحة اليوم الدراسي</div>
        <div style={{ fontSize: 11.5, color: '#5b6678', marginBottom: 14, textAlign: 'right', lineHeight: 1.7 }}>
          تُزاح <b>الفترات الصباحية (قبل الرابعة) فقط</b> إلى وقت البداية الجديد وتتقلص كل محاضرة إلى <b>60 دقيقة</b> باستراحة <b>10 دقائق</b>. <b>الفترة الرابعة تبقى</b> بوقتها، و<b>ما بعدها يُلغى</b>. النصاب يُحسب بالمدة الأصلية. تُستثنى المحاضرات المنعقدة أو الملغاة أو التي بدأ تحضيرها، وتُحمى المُزاحة من «مزامنة الأوقات».
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {[[false, 'يوم واحد'], [true, 'مدى تواريخ']].map(([v, l]: any) => (
            <button key={String(v)} onClick={() => { setRangeMode(v); reset(); }} style={{ flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, border: rangeMode === v ? '2px solid #1565c0' : '1px solid #ddd', backgroundColor: rangeMode === v ? '#e3f2fd' : '#fff', color: rangeMode === v ? '#1565c0' : '#555' }} data-testid={`day-shift-mode-${v ? 'range' : 'single'}`}>{l}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={lbl}>{rangeMode ? 'من تاريخ' : 'التاريخ'}</div>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); reset(); }} style={inp} data-testid="day-shift-date-from" />
          </div>
          {rangeMode && (
            <div style={{ flex: 1 }}>
              <div style={lbl}>إلى تاريخ</div>
              <input type="date" value={dateTo} min={dateFrom} onChange={(e) => { setDateTo(e.target.value); reset(); }} style={inp} data-testid="day-shift-date-to" />
            </div>
          )}
        </div>

        <div style={lbl}>الكلية</div>
        <select value={facultyId} onChange={(e) => { setFacultyId(e.target.value); reset(); }} disabled={!isAdmin} style={{ ...inp, marginBottom: 12, opacity: isAdmin ? 1 : 0.75 }} data-testid="day-shift-faculty-select">
          {isAdmin && <option value="">كل الجامعة (جميع الكليات)</option>}
          {faculties.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        {!isAdmin && <div style={{ fontSize: 10.5, color: '#8a95a8', textAlign: 'right', marginTop: -8, marginBottom: 12 }}>الإزاحة مقتصرة على نطاق كليتك فقط</div>}

        <div style={lbl}>وقت بداية اليوم الجديد</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {QUICK_STARTS.map((t) => (
            <button key={t} onClick={() => { setNewStart(t); reset(); }} style={{ padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, border: newStart === t ? '2px solid #1565c0' : '1px solid #ddd', backgroundColor: newStart === t ? '#e3f2fd' : '#fff', color: newStart === t ? '#1565c0' : '#555' }} data-testid={`day-shift-quick-${t.replace(':', '')}`}>{t}</button>
          ))}
          <input type="time" value={newStart} onChange={(e) => { setNewStart(e.target.value); reset(); }} style={{ ...inp, width: 120, direction: 'ltr' }} data-testid="day-shift-start-input" />
        </div>
        <div style={{ fontSize: 11, color: '#8a95a8', textAlign: 'right', marginBottom: 12 }}>الإزاحة تُحسب من أول محاضرة في كل يوم (مثال: أول محاضرة 08:00 والبداية الجديدة 10:00 ⇒ +ساعتان لكل المحاضرات).</div>

        <div style={lbl}>السبب (يظهر في الإشعار)</div>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: تأخير رسمي بسبب الأحوال الجوية" style={{ ...inp, marginBottom: 10 }} data-testid="day-shift-reason-input" />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#333', marginBottom: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} data-testid="day-shift-notify-checkbox" />
          إرسال إشعار للأساتذة والطلاب المتأثرين
        </label>

        {err && <div style={{ backgroundColor: '#ffebee', color: '#c62828', padding: '8px 10px', borderRadius: 8, fontSize: 12.5, marginBottom: 10, textAlign: 'right' }} data-testid="day-shift-error">{err}</div>}

        {preview && (
          <div style={{ backgroundColor: '#f7f9fc', border: '1px solid #e3e7ee', borderRadius: 10, padding: 12, marginBottom: 12 }} data-testid="day-shift-preview">
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              {[['صباحية تُزاح (60 د)', preview.total_lectures, '#1565c0'], ['الرابعة تبقى', preview.total_kept || 0, '#2e7d32'], ['بعد الرابعة تُلغى', preview.total_cancelled || 0, '#c62828'], ['مستثناة', preview.total_skipped, '#f57c00'], ['أستاذ متأثر', preview.teachers_affected, '#6a1b9a']].map(([l, v, c]: any) => (
                <div key={l} style={{ flex: 1, backgroundColor: '#fff', borderRadius: 8, padding: 8, textAlign: 'center', border: '1px solid #eee' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: c }}>{v}</div>
                  <div style={{ fontSize: 11, color: '#666' }}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: '#455a64', backgroundColor: '#e3f2fd', borderRadius: 8, padding: '6px 10px', marginBottom: 8 }} data-testid="day-shift-rules">
              📏 القواعد: تُزاح الفترات الصباحية (قبل الرابعة) فقط وتتقلص إلى {preview.rules?.compressed_minutes ?? 60} دقيقة باستراحة {preview.rules?.break_minutes ?? 10} دقائق · الفترة الرابعة تبقى · ما بعدها يُلغى · النصاب يُحسب بالمدة الأصلية
            </div>
            {preview.warnings?.length > 0 && <div style={{ fontSize: 11, color: '#b45309', backgroundColor: '#fff7ed', borderRadius: 8, padding: '6px 10px', marginBottom: 8 }} data-testid="day-shift-warnings">{preview.warnings.map((w: string, i: number) => <div key={i}>⚠️ {w}</div>)}</div>}
            {preview.cancelled_sample?.length > 0 && (
              <div style={{ fontSize: 11, color: '#c62828', marginBottom: 8 }} data-testid="day-shift-cancelled-sample">
                ستُلغى: {preview.cancelled_sample.slice(0, 4).map((x: any) => `${x.course} (${x.date} ${x.time})`).join(' · ')}{preview.total_cancelled > 4 ? ' …' : ''}
              </div>
            )}
            {preview.total_skipped > 0 && (
              <div style={{ fontSize: 11, color: '#f57c00', textAlign: 'right', marginBottom: 8 }}>
                المستثناة: {preview.skipped_reasons.completed} منعقدة · {preview.skipped_reasons.cancelled} ملغاة/غياب · {preview.skipped_reasons.attendance_started} بدأ تحضيرها
              </div>
            )}
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead><tr style={{ color: '#5b6678' }}><th style={{ textAlign: 'right', padding: 4 }}>اليوم</th><th style={{ padding: 4 }}>محاضرات</th><th style={{ padding: 4 }}>الإزاحة</th><th style={{ padding: 4 }}>البداية</th><th style={{ padding: 4 }}>نهاية اليوم</th></tr></thead>
              <tbody>
                {(preview.days || []).map((d: any) => (
                  <tr key={d.date} style={{ borderTop: '1px solid #eee', color: d.lectures ? '#1a2540' : '#aaa' }} data-testid={`day-shift-day-${d.date}`}>
                    <td style={{ padding: 5, fontWeight: 700 }}>{d.date}</td>
                    <td style={{ padding: 5, textAlign: 'center' }}>{d.lectures}{d.kept ? <span style={{ color: '#2e7d32' }}> · {d.kept} تبقى</span> : ''}{d.cancelled ? <span style={{ color: '#c62828' }}> · {d.cancelled} تُلغى</span> : ''}{d.skipped ? <span style={{ color: '#f57c00' }}> (+{d.skipped} مستثناة)</span> : ''}</td>
                    <td style={{ padding: 5, textAlign: 'center', fontWeight: 700, color: d.offset_minutes > 0 ? '#c62828' : d.offset_minutes < 0 ? '#2e7d32' : '#aaa' }}>{d.offset_minutes ? `${d.offset_minutes > 0 ? '+' : ''}${d.offset_minutes} د` : d.note || '—'}</td>
                    <td style={{ padding: 5, textAlign: 'center', direction: 'ltr' }}>{d.lectures ? `${d.old_first} → ${d.new_first}` : '—'}</td>
                    <td style={{ padding: 5, textAlign: 'center', direction: 'ltr' }}>{d.lectures ? `${d.old_last_end} → ${d.new_last_end}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.sample?.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#5b6678', textAlign: 'right', lineHeight: 1.8 }}>
                عينة: {preview.sample.slice(0, 4).map((x: any) => `${x.course} (${x.from} ⇒ ${x.to})`).join(' · ')}
              </div>
            )}
          </div>
        )}

        {preview && preview.lectures?.length > 0 && (
          <div style={{ marginBottom: 12 }} data-testid="day-shift-exceptions-section">
            <button onClick={() => setExceptionsOpen(!exceptionsOpen)} style={{ width: '100%', textAlign: 'right', padding: '8px 10px', borderRadius: 8, border: '1px dashed #90a4c0', backgroundColor: '#f0f4fa', color: '#1565c0', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }} data-testid="day-shift-exceptions-toggle">
              {exceptionsOpen ? '▲' : '▼'} تخصيص استثناءات لكل محاضرة ({Object.keys(exceptions).length} مُخصَّصة) — الافتراضي: تطبيق القاعدة الأساسية
            </button>
            {exceptionsOpen && (
              <div style={{ marginTop: 8, maxHeight: 280, overflowY: 'auto', border: '1px solid #e3e7ee', borderRadius: 8 }} data-testid="day-shift-exceptions-list">
                {preview.lectures.map((r: any) => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '7px 10px', borderTop: '1px solid #f1f3f7', fontSize: 11.5, flexWrap: 'wrap' }} data-testid={`day-shift-exception-row-${r.id}`}>
                    <div style={{ textAlign: 'right', flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: '#1a2540', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.course}</div>
                      <div style={{ color: '#8a95a8' }}>{r.date} · {r.old_start} — {r.exception ? r.final_action_label : r.rule_action_label}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {[['', 'القاعدة', '#1565c0'], ['keep', 'تبقى بوقتها', '#2e7d32'], ['cancel', 'إلغاء مباشر', '#c62828']].map(([v, l, c]: any) => {
                        const active = (exceptions[r.id] || '') === v;
                        return (
                          <button key={v || 'rule'} onClick={() => setExceptionAction(r.id, v)} disabled={busy} style={{ padding: '4px 7px', borderRadius: 6, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', border: active ? `2px solid ${c}` : '1px solid #ddd', backgroundColor: active ? `${c}1a` : '#fff', color: active ? c : '#777' }} data-testid={`day-shift-exception-${r.id}-${v || 'rule'}`}>{l}</button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          {!preview ? (
            <button onClick={runPreview} disabled={busy || !dateFrom || (rangeMode && !dateTo)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', backgroundColor: '#1565c0', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', opacity: busy ? 0.6 : 1 }} data-testid="day-shift-preview-btn">{busy ? 'جاري الفحص...' : '🔍 معاينة الأثر'}</button>
          ) : (
            <button onClick={runApply} disabled={busy || (!preview.total_lectures && !preview.total_cancelled)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', backgroundColor: (preview.total_lectures || preview.total_cancelled) ? '#c62828' : '#bbb', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }} data-testid="day-shift-apply-btn">{busy ? 'جاري التنفيذ...' : `⏰ تنفيذ الإزاحة (${preview.total_lectures} تُزاح${preview.total_cancelled ? ` · ${preview.total_cancelled} تُلغى` : ''})`}</button>
          )}
          <button onClick={onClose} disabled={busy} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #ddd', backgroundColor: '#fff', color: '#555', fontWeight: 700, fontSize: 13, cursor: 'pointer' }} data-testid="day-shift-cancel-btn">إغلاق</button>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { hrAPI } from '../../services/api';
import { reportPage } from '../reports/ReportShell';
import { inp, btn, alertErr, Badge, Field, Modal } from './ui';
import { EmployeePicker } from './PresenceChecks';

const lbl: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: '#333', marginBottom: 4, textAlign: 'right' };

/** ⚙️ الإعدادات العامة: أيام العمل، العطل، التسجيل الذاتي، التحقق الجغرافي، الإجازة السنوية */
export const WorkGeneralSettings: React.FC<{ data: any; onSaved: (s: any) => void }> = ({ data, onSaved }) => {
  const [s, setS] = useState<any>(data);
  const [busy, setBusy] = useState(false);
  useEffect(() => setS(data), [data]);
  const set = (k: string, v: any) => setS((p: any) => ({ ...p, [k]: v }));
  const toggleDay = (d: string) => set('work_days', s.work_days.includes(d) ? s.work_days.filter((x: string) => x !== d) : [...s.work_days, d]);
  const save = async () => { setBusy(true); try { const r = await hrAPI.saveWorkGeneral({ work_days: s.work_days, holidays: s.holidays || [], allow_self_checkin: !!s.allow_self_checkin, geofence_required: s.geofence_required !== false, annual_leave_days: Number(s.annual_leave_days), correction_enabled: s.correction_enabled !== false, correction_window_minutes: Number(s.correction_window_minutes) || 10, auto_checkout_enabled: !!s.auto_checkout_enabled, auto_checkout_after_minutes: Number(s.auto_checkout_after_minutes) || 60, auto_absent_enabled: !!s.auto_absent_enabled, device_binding_enabled: s.device_binding_enabled !== false }); window.alert(r.data.message); onSaved(r.data.settings); } catch (e) { alertErr(e); } finally { setBusy(false); } };
  return (
    <View style={[reportPage.card, { marginBottom: 12 }]} testID="work-general">
      <div style={{ direction: 'rtl' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#0f2440', marginBottom: 10 }}>الإعدادات العامة (مشتركة لكل الفترات)</div>
        <div style={lbl}>أيام العمل</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {(s.days || []).map((d: string) => <button key={d} onClick={() => toggleDay(d)} disabled={!s.can_edit} style={btn(s.work_days.includes(d) ? '#0f2440' : '#f1f5f9', s.work_days.includes(d) ? '#fff' : '#0f2440', { padding: '6px 12px', borderRadius: 16, fontSize: 12 })} data-testid={`att-day-${d}`}>{d}</button>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          <div><div style={lbl}>الإجازة السنوية الافتراضية (يوم)</div><input type="number" value={s.annual_leave_days} onChange={(e) => set('annual_leave_days', e.target.value)} style={inp} disabled={!s.can_edit} data-testid="att-set-annual" /></div>
          <div><div style={lbl}>فترة السماح بتصحيح الحضور/الانصراف (دقيقة)</div><input type="number" min={1} max={120} value={s.correction_window_minutes ?? 10} onChange={(e) => set('correction_window_minutes', e.target.value)} style={inp} disabled={!s.can_edit || s.correction_enabled === false} data-testid="att-set-correction-window" /></div>
          <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'flex-end' }}><label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer', paddingBottom: 8 }}><input type="checkbox" checked={s.correction_enabled !== false} onChange={(e) => set('correction_enabled', e.target.checked)} disabled={!s.can_edit} data-testid="att-set-correction-enabled" /> ↩️ السماح للموظف بتصحيح تسجيل خاطئ خلال فترة السماح (يحذف الحضور الخاطئ أو يلغي الانصراف ويعيد التسجيل)</label></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 12, padding: 12, backgroundColor: '#f5f3ff', borderRadius: 10 }} data-testid="att-set-auto-checkout-box">
          <div style={{ gridColumn: 'span 3', display: 'flex', alignItems: 'center' }}><label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={!!s.auto_checkout_enabled} onChange={(e) => set('auto_checkout_enabled', e.target.checked)} disabled={!s.can_edit} data-testid="att-set-auto-checkout" /> 🤖 الانصراف التلقائي: إذا لم يسجّل الموظف انصرافه، يُصرِّفه النظام تلقائياً بعد المهلة المحددة من نهاية فترته بوقت نهاية الفترة، ويُدوَّن في الملاحظات أنه انصراف تلقائي مع الوقت وآخر موقع معروف</label></div>
          <div><div style={lbl}>المهلة بعد نهاية الفترة (دقيقة)</div><input type="number" min={5} max={720} value={s.auto_checkout_after_minutes ?? 60} onChange={(e) => set('auto_checkout_after_minutes', e.target.value)} style={inp} disabled={!s.can_edit || !s.auto_checkout_enabled} data-testid="att-set-auto-checkout-after" /></div>
          <div style={{ gridColumn: 'span 4', borderTop: '1px dashed #ddd6fe', paddingTop: 10 }}><label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={!!s.auto_absent_enabled} onChange={(e) => set('auto_absent_enabled', e.target.checked)} disabled={!s.can_edit} data-testid="att-set-auto-absent" /> 🚫 الغياب التلقائي: إذا انقضت مهلة التأخير المحددة لفترة الدوام من بداية الفترة ولم يسجّل الموظف حضوره (وليس في إجازة أو عطلة)، يُسجَّل «لم يحضر / غائب» تلقائياً. إن حضر لاحقاً يتحول السجل إلى «متأخر» مع ملاحظة</label></div>
          <div style={{ gridColumn: 'span 4', fontSize: 12, color: '#b45309', backgroundColor: '#fffbeb', padding: '6px 10px', borderRadius: 8 }} data-testid="att-set-checkout-outside-note">📍 قاعدة ثابتة: الانصراف خارج نطاق العمل يُقبل دائماً، ويُدوَّن في الملاحظة «انصراف خارج نطاق العمل» مع أقرب موقع والمسافة، ويظهر كعلامة تحذيرية ⚠️ في الكشف اليومي والتقرير التفصيلي وملفات Excel</div>
        </div>
        <div style={{ marginTop: 12, padding: 12, backgroundColor: '#f0fdf4', borderRadius: 10 }} data-testid="att-set-device-box">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={s.device_binding_enabled !== false} onChange={(e) => set('device_binding_enabled', e.target.checked)} disabled={!s.can_edit} data-testid="att-set-device-binding" /> 📱 ربط التحضير بجهاز الموظف: أول جهاز يحضّر منه يُسجَّل تلقائياً، وبعدها يُقبل التحضير من ذلك الجهاز فقط (تسجيل الدخول والتصفح يعملان من أي جهاز). إدارة الأجهزة وإعادة التعيين من تبويب «الأجهزة» في صفحة الحضور.</label>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={!!s.allow_self_checkin} onChange={(e) => set('allow_self_checkin', e.target.checked)} disabled={!s.can_edit} data-testid="att-set-self" /> السماح للموظفين بتسجيل الحضور/الانصراف ذاتياً من التطبيق و«ملفي الإداري»</label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={s.geofence_required !== false} onChange={(e) => set('geofence_required', e.target.checked)} disabled={!s.can_edit} data-testid="att-set-geofence" /> 📍 التحقق الجغرافي: رفض التسجيل الذاتي خارج مواقع العمل المعتمدة</label>
          <button onClick={() => router.push('/hr-locations' as any)} style={btn('#eef4ff', '#1565c0', { fontSize: 12 })} data-testid="att-goto-locations">إدارة مواقع العمل والخريطة ←</button>
        </div>
        <div style={{ ...lbl, marginTop: 16 }}>العطل الرسمية</div>
        {(s.holidays || []).map((h: any, i: number) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input type="date" value={h.date} onChange={(e) => set('holidays', s.holidays.map((x: any, j: number) => j === i ? { ...x, date: e.target.value } : x))} style={{ ...inp, width: 160, direction: 'ltr' }} data-testid={`att-holiday-date-${i}`} />
            <input value={h.name} placeholder="اسم العطلة" onChange={(e) => set('holidays', s.holidays.map((x: any, j: number) => j === i ? { ...x, name: e.target.value } : x))} style={{ ...inp, flex: 1 }} data-testid={`att-holiday-name-${i}`} />
            {s.can_edit && <button onClick={() => set('holidays', s.holidays.filter((_: any, j: number) => j !== i))} style={btn('#ffebee', '#c62828', { padding: '6px 10px' })}>✕</button>}
          </div>
        ))}
        {s.can_edit && <>
          <button onClick={() => set('holidays', [...(s.holidays || []), { date: '', name: '' }])} style={btn('#f1f5f9', '#0f2440', { fontSize: 12 })} data-testid="att-add-holiday">+ إضافة عطلة</button>
          <div style={{ marginTop: 16 }}><button onClick={save} disabled={busy} style={btn('#1565c0')} data-testid="att-settings-save">{busy ? 'جاري الحفظ...' : 'حفظ الإعدادات العامة'}</button></div>
        </>}
      </div>
    </View>
  );
};

const EMPTY_SHIFT = { name: '', work_start: '08:00', work_end: '14:00', late_grace_minutes: '15', early_leave_grace_minutes: '0', is_active: true };

const ShiftForm: React.FC<{ initial: any; onClose: () => void; onSaved: (s: any) => void }> = ({ initial, onClose, onSaved }) => {
  const [f, setF] = useState<any>(initial);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const save = async () => {
    if (!f.name.trim()) return window.alert('اسم الفترة مطلوب');
    setBusy(true);
    try {
      const body = { name: f.name.trim(), work_start: f.work_start, work_end: f.work_end, late_grace_minutes: Number(f.late_grace_minutes) || 0, early_leave_grace_minutes: Number(f.early_leave_grace_minutes) || 0, is_active: !!f.is_active };
      const r = f.id ? await hrAPI.updateShift(f.id, body) : await hrAPI.addShift(body);
      window.alert(r.data.message); onSaved(r.data.settings); onClose();
    } catch (e) { alertErr(e); } finally { setBusy(false); }
  };
  return (
    <Modal title={f.id ? `تعديل فترة «${initial.name}»` : 'إضافة فترة دوام'} onClose={onClose} width={560} testID="shift-modal" busy={busy}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, direction: 'rtl' }}>
        <Field label="اسم الفترة *" span={2}><input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="مثال: الدوام المسائي" style={inp} data-testid="shift-name" /></Field>
        <Field label="بداية الفترة"><input type="time" value={f.work_start} onChange={(e) => set('work_start', e.target.value)} style={{ ...inp, direction: 'ltr' }} data-testid="shift-start" /></Field>
        <Field label="نهاية الفترة"><input type="time" value={f.work_end} onChange={(e) => set('work_end', e.target.value)} style={{ ...inp, direction: 'ltr' }} data-testid="shift-end" /></Field>
        <Field label="سماحية التأخير (دقيقة)"><input type="number" value={f.late_grace_minutes} onChange={(e) => set('late_grace_minutes', e.target.value)} style={inp} data-testid="shift-grace" /></Field>
        <Field label="سماحية الانصراف المبكر (دقيقة)"><input type="number" value={f.early_leave_grace_minutes} onChange={(e) => set('early_leave_grace_minutes', e.target.value)} style={inp} data-testid="shift-early" /></Field>
        {f.id && !f.is_main && <Field label="الحالة"><label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, marginTop: 8, cursor: 'pointer' }}><input type="checkbox" checked={!!f.is_active} onChange={(e) => set('is_active', e.target.checked)} data-testid="shift-active" /> مفعّلة</label></Field>}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14, direction: 'rtl' }}>
        <button onClick={save} disabled={busy} style={btn('#1565c0')} data-testid="shift-save">{busy ? 'جاري الحفظ...' : 'حفظ'}</button>
        <button onClick={onClose} style={btn('#f1f5f9', '#0f2440')}>إلغاء</button>
      </div>
    </Modal>
  );
};

const ShiftCard: React.FC<{ sh: any; canEdit: boolean; onEdit: () => void; onDelete: () => void; onSaved: (s: any) => void }> = ({ sh, canEdit, onEdit, onDelete, onSaved }) => {
  const [assign, setAssign] = useState(false);
  const [picked, setPicked] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const open = () => { setPicked(sh.employees.map((e: any) => ({ employee_id: e.employee_id, employee_name: e.employee_name, employee_no: e.employee_no }))); setAssign(true); };
  const save = async () => { setBusy(true); try { const r = await hrAPI.setShiftEmployees(sh.id, picked.map((p) => p.employee_id)); window.alert(r.data.message); onSaved(r.data.settings); setAssign(false); } catch (e) { alertErr(e); } finally { setBusy(false); } };
  return (
    <View style={[reportPage.card, { marginBottom: 12, borderRightWidth: 4, borderRightColor: sh.is_main ? '#1565c0' : sh.is_active === false ? '#94a3b8' : '#16a34a' }]} testID={`shift-card-${sh.id}`}>
      <div style={{ direction: 'rtl' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#0f2440' }} data-testid={`shift-title-${sh.id}`}>{sh.name}</span>
          {sh.is_main && <Badge color="#1565c0">الفترة الأساسية</Badge>}
          {sh.is_active === false && <Badge color="#94a3b8">معطّلة</Badge>}
          <span style={{ fontSize: 13, color: '#475569', direction: 'ltr' }}>{sh.work_start} – {sh.work_end}</span>
          <span style={{ fontSize: 12, color: '#64748b' }}>سماحية التأخير {sh.late_grace_minutes} د{sh.early_leave_grace_minutes ? ` · الانصراف المبكر ${sh.early_leave_grace_minutes} د` : ''}</span>
          <span style={{ marginRight: 'auto' }} />
          {canEdit && <>
            <button onClick={onEdit} style={btn('#f1f5f9', '#0f2440', { fontSize: 12 })} data-testid={`shift-edit-${sh.id}`}>تعديل</button>
            {!sh.is_main && <button onClick={onDelete} style={btn('#ffebee', '#c62828', { fontSize: 12 })} data-testid={`shift-del-${sh.id}`}>حذف</button>}
          </>}
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#333' }}>الموظفون المكلَّفون ({sh.employees_count})</span>
          {sh.is_main && <span style={{ fontSize: 11, color: '#94a3b8' }}>— من لم يُكلَّف بأي فترة يُحسب عليها تلقائياً</span>}
          {canEdit && <button onClick={open} style={btn('#eef4ff', '#1565c0', { fontSize: 12, padding: '4px 10px' })} data-testid={`shift-assign-${sh.id}`}>تعديل التكليف</button>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }} data-testid={`shift-emps-${sh.id}`}>
          {sh.employees.slice(0, 12).map((e: any) => <span key={e.employee_id} title={e.explicit ? 'تكليف صريح' : 'ضمني (بلا تكليف)'} style={{ fontSize: 11.5, backgroundColor: e.explicit ? '#eef4ff' : '#f8fafc', color: e.explicit ? '#1565c0' : '#64748b', border: '1px solid #e2e8f0', borderRadius: 12, padding: '2px 8px' }}>{e.employee_name}</span>)}
          {sh.employees.length > 12 && <span style={{ fontSize: 11.5, color: "#94a3b8" }}>+{sh.employees.length - 12} آخرين — اضغط «تعديل التكليف» للبحث والاختيار</span>}
          {sh.employees.length === 0 && <span style={{ fontSize: 11.5, color: '#94a3b8' }}>لا أحد</span>}
        </div>
      </div>
      {assign && (
        <Modal title={`تكليف موظفي «${sh.name}»`} onClose={() => setAssign(false)} width={620} testID="shift-assign-modal" busy={busy}>
          <div style={{ direction: 'rtl' }}>
            <div style={{ fontSize: 12.5, color: '#475569', marginBottom: 10 }}>{sh.is_main ? 'إزالة موظف من الأساسية تُبقيه على فتراته الأخرى فقط؛ ومن لا فترة له يعود إليها تلقائياً.' : 'يُضاف الموظف لهذه الفترة مع الاحتفاظ بفتراته الأخرى (صباحي + مسائي معاً ممكن).'}</div>
            <EmployeePicker value={picked} onChange={setPicked} testID="shift-emp" />
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={save} disabled={busy} style={btn('#1565c0')} data-testid="shift-assign-save">{busy ? 'جاري الحفظ...' : 'حفظ التكليف'}</button>
              <button onClick={() => setAssign(false)} style={btn('#f1f5f9', '#0f2440')}>إلغاء</button>
            </div>
          </div>
        </Modal>
      )}
    </View>
  );
};

/** ⏰ فترات الدوام وتكليف الموظفين */
export const ShiftsManager: React.FC<{ data: any; onSaved: (s: any) => void }> = ({ data, onSaved }) => {
  const [edit, setEdit] = useState<any>(null);
  const del = async (sh: any) => { if (!window.confirm(`حذف فترة «${sh.name}»؟ سيُزال تكليف موظفيها منها.`)) return; try { const r = await hrAPI.deleteShift(sh.id); window.alert(r.data.message); onSaved(r.data.settings); } catch (e) { alertErr(e); } };
  return (
    <View testID="shifts-manager">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', direction: 'rtl', marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#0f2440' }}>فترات الدوام ({data.shifts.length})</span>
        <span style={{ fontSize: 12, color: '#64748b' }}>يُحسب التأخير لكل موظف حسب فترته، والمكلَّف بفترتين يسجّل حضوراً وانصرافاً لكل فترة</span>
        <span style={{ marginRight: 'auto' }} />
        {data.can_edit && <button onClick={() => setEdit({ ...EMPTY_SHIFT })} style={btn('#16a34a')} data-testid="shift-add-btn">+ إضافة فترة</button>}
      </div>
      {data.shifts.map((sh: any) => <ShiftCard key={sh.id} sh={sh} canEdit={!!data.can_edit} onEdit={() => setEdit({ ...sh, late_grace_minutes: String(sh.late_grace_minutes), early_leave_grace_minutes: String(sh.early_leave_grace_minutes || 0) })} onDelete={() => del(sh)} onSaved={onSaved} />)}
      {edit && <ShiftForm initial={edit} onClose={() => setEdit(null)} onSaved={onSaved} />}
    </View>
  );
};

export const useWorkSettings = () => {
  const [data, setData] = useState<any>(null);
  const load = useCallback(() => hrAPI.workSettings().then((r) => setData(r.data)).catch(alertErr), []);
  useEffect(() => { load(); }, [load]);
  return { data, setData, load };
};

export const Loading = () => <Text style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>جاري التحميل...</Text>;

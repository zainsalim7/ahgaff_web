import React, { useEffect, useState, useCallback } from 'react';
import { View, Text } from 'react-native';
import { hrAPI } from '../../services/api';
import { reportPage, ReportEmpty } from '../reports/ReportShell';
import { Th, td, table, inp, btn, alertErr, Badge, Field, Modal } from './ui';

export const PRESENCE_COLOR: Record<string, string> = { pending: '#f97316', confirmed: '#16a34a', expired: '#dc2626', out_of_range: '#b91c1c', failed_biometric: '#7c3aed' };

/** 🔎 منتقي موظفين بالبحث (شرائح) */
export const EmployeePicker: React.FC<{ value: any[]; onChange: (v: any[]) => void; testID: string }> = ({ value, onChange, testID }) => {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<any[]>([]);
  useEffect(() => { if (q.trim().length < 2) { setFound([]); return; } const t = setTimeout(() => hrAPI.employees({ search: q, per_page: 8 }).then((r) => setFound(r.data.employees || [])).catch(() => {}), 300); return () => clearTimeout(t); }, [q]);
  const add = (e: any) => { if (!value.some((v) => v.employee_id === e.id)) onChange([...value, { employee_id: e.id, employee_name: e.full_name, employee_no: e.employee_no }]); setQ(''); setFound([]); };
  return (
    <div style={{ direction: 'rtl' }}>
      <div style={{ position: 'relative' }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم أو الرقم لإضافة موظف…" style={inp} data-testid={`${testID}-search`} />
        {found.length > 0 && <div style={{ position: 'absolute', top: '100%', right: 0, left: 0, backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, zIndex: 30, boxShadow: '0 6px 20px rgba(0,0,0,0.12)', maxHeight: 240, overflowY: 'auto' }} data-testid={`${testID}-results`}>
          {found.map((e) => <div key={e.id} onClick={() => add(e)} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: 13 }} data-testid={`${testID}-pick-${e.id}`}><b>{e.full_name}</b> <span style={{ color: '#94a3b8', fontSize: 11 }}>{e.employee_no}{e.job_title ? ` · ${e.job_title}` : ''}</span></div>)}
        </div>}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }} data-testid={`${testID}-chips`}>
        {value.map((v) => <span key={v.employee_id} style={{ backgroundColor: '#eef4ff', color: '#1565c0', borderRadius: 14, padding: '3px 10px', fontSize: 12, fontWeight: 700 }} data-testid={`${testID}-chip-${v.employee_id}`}>{v.employee_name || v.employee_id} <button onClick={() => onChange(value.filter((x) => x.employee_id !== v.employee_id))} style={{ border: 'none', background: 'transparent', color: '#c62828', cursor: 'pointer', fontWeight: 800 }} data-testid={`${testID}-remove-${v.employee_id}`}>✕</button></span>)}
        {value.length === 0 && <span style={{ fontSize: 12, color: '#94a3b8' }}>لم يُحدَّد أحد</span>}
      </div>
    </div>
  );
};

/** ⚙️ إعدادات الإشعار العشوائي */
export const PresenceSettings: React.FC = () => {
  const [s, setS] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { hrAPI.presenceSettings().then((r) => setS({ ...r.data, scope: r.data.employee_ids === 'all' ? 'all' : 'some', employees: r.data.employees || [] })).catch(alertErr); }, []);
  if (!s) return <Text style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>جاري التحميل...</Text>;
  const set = (k: string, v: any) => setS((p: any) => ({ ...p, [k]: v }));
  const save = async () => {
    if (s.scope === 'some' && !s.employees.length) return window.alert('اختر موظفاً واحداً على الأقل أو حدّد «جميع الموظفين»');
    setBusy(true);
    try { const r = await hrAPI.savePresenceSettings({ enabled: !!s.enabled, checks_per_day: Number(s.checks_per_day), min_interval_minutes: Number(s.min_interval_minutes), response_timeout_minutes: Number(s.response_timeout_minutes), only_checked_in: !!s.only_checked_in, employee_ids: s.scope === 'all' ? 'all' : s.employees.map((e: any) => e.employee_id) }); window.alert(r.data.message); } catch (e) { alertErr(e); } finally { setBusy(false); }
  };
  return (
    <View style={reportPage.card} testID="presence-settings">
      <div style={{ direction: 'rtl' }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, fontWeight: 800, color: '#0f2440', cursor: 'pointer', marginBottom: 12 }}><input type="checkbox" checked={!!s.enabled} onChange={(e) => set('enabled', e.target.checked)} data-testid="presence-enabled" /> تفعيل الإشعار العشوائي لتأكيد التواجد</label>
        <div style={{ fontSize: 12.5, color: '#475569', marginBottom: 12, lineHeight: 1.7 }}>يختار النظام أوقاتاً عشوائية داخل ساعات الدوام (من إعدادات الدوام) ويرسل للموظف إشعاراً؛ يفتحه ويؤكد بالبصمة/Face ID مع موقعه داخل نطاق العمل. من لا يستجيب خلال المهلة يُوسم «لم يؤكد»، ومن يؤكد من خارج النطاق يُوسم «خارج النطاق». الموظفون المستثنون من شرط الموقع يشملهم الفحص أيضاً.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <Field label="عدد الفحوصات اليومية لكل موظف"><input type="number" min={1} max={10} value={s.checks_per_day} onChange={(e) => set('checks_per_day', e.target.value)} style={inp} data-testid="presence-per-day" /></Field>
          <Field label="أقل فاصل بين فحصَين (دقيقة)"><input type="number" min={5} max={600} value={s.min_interval_minutes} onChange={(e) => set('min_interval_minutes', e.target.value)} style={inp} data-testid="presence-interval" /></Field>
          <Field label="مهلة الاستجابة (دقيقة)"><input type="number" min={1} max={60} value={s.response_timeout_minutes} onChange={(e) => set('response_timeout_minutes', e.target.value)} style={inp} data-testid="presence-timeout" /></Field>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer', marginTop: 12 }}><input type="checkbox" checked={!!s.only_checked_in} onChange={(e) => set('only_checked_in', e.target.checked)} data-testid="presence-only-checked-in" /> إرسال الفحص فقط لمن سجّل حضوره اليوم ولم يسجّل انصرافه (موصى به)</label>
        <div style={{ marginTop: 14, fontSize: 12.5, fontWeight: 700, color: '#333' }}>الموظفون المشمولون</div>
        <div style={{ display: 'flex', gap: 6, margin: '6px 0 10px' }}>
          <button onClick={() => set('scope', 'all')} style={btn(s.scope === 'all' ? '#0f2440' : '#f1f5f9', s.scope === 'all' ? '#fff' : '#0f2440', { borderRadius: 16, fontSize: 12 })} data-testid="presence-scope-all">جميع الموظفين</button>
          <button onClick={() => set('scope', 'some')} style={btn(s.scope === 'some' ? '#0f2440' : '#f1f5f9', s.scope === 'some' ? '#fff' : '#0f2440', { borderRadius: 16, fontSize: 12 })} data-testid="presence-scope-some">موظفون محددون</button>
        </div>
        {s.scope === 'some' && <EmployeePicker value={s.employees} onChange={(v) => set('employees', v)} testID="presence-emp" />}
        <div style={{ marginTop: 16 }}><button onClick={save} disabled={busy} style={btn('#1565c0')} data-testid="presence-settings-save">{busy ? 'جاري الحفظ...' : 'حفظ الإعدادات'}</button></div>
      </div>
    </View>
  );
};

/** 📋 تقرير فحوصات يوم + إرسال فحص فوري */
export const PresenceReport: React.FC = () => {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [picked, setPicked] = useState<any[]>([]);
  const [timeout, setTo] = useState('5');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { setLoading(true); hrAPI.presenceReport(date).then((r) => setD(r.data)).catch(alertErr).finally(() => setLoading(false)); }, [date]);
  useEffect(() => { load(); }, [load]);
  const sendNow = async () => {
    if (!picked.length) return window.alert('اختر موظفاً واحداً على الأقل');
    setBusy(true);
    try { const r = await hrAPI.presenceSendNow(picked.map((p) => p.employee_id), Number(timeout) || undefined); window.alert(r.data.message + (r.data.skipped?.length ? '\n' + r.data.skipped.map((s: any) => `• ${s.employee_id}: ${s.reason}`).join('\n') : '')); setSendOpen(false); setPicked([]); load(); } catch (e) { alertErr(e); } finally { setBusy(false); }
  };
  const fmt = (s?: string) => (s ? s.slice(11, 16) : '—');
  const labels: any = d?.statuses || {};
  return (
    <View testID="presence-report">
      <View style={[reportPage.card, { marginBottom: 12 }]}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', direction: 'rtl' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0f2440' }}>اليوم:</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...inp, width: 170, direction: 'ltr' }} data-testid="presence-report-date" />
          {d && ['confirmed', 'pending', 'expired', 'out_of_range', 'failed_biometric'].map((k) => <Badge key={k} color={PRESENCE_COLOR[k]} testID={`presence-sum-${k}`}>{labels[k]}: {d.summary[k] || 0}</Badge>)}
          {d && <span style={{ fontSize: 11.5, color: '#64748b' }}>مخطط لم يُرسل بعد: {d.summary.planned_unsent} · الإجمالي {d.summary.total}</span>}
          <span style={{ marginRight: 'auto' }} />
          <button onClick={() => setSendOpen(true)} style={btn('#16a34a')} data-testid="presence-send-now-btn">⚡ إرسال فحص فوري</button>
          <button onClick={load} style={btn('#f1f5f9', '#0f2440')} data-testid="presence-refresh">تحديث</button>
        </div>
        {d && !d.settings?.enabled && <div style={{ marginTop: 8, fontSize: 12, color: '#c2410c', direction: 'rtl' }} data-testid="presence-disabled-note">⚠️ الإشعار العشوائي غير مفعّل حالياً — فعّله من تبويب الإعدادات (الفحص الفوري يعمل بدونه).</div>}
      </View>
      <View style={reportPage.card}>
        {loading ? <Text style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>جاري التحميل...</Text>
          : !d || d.rows.length === 0 ? <ReportEmpty text="لا فحوصات في هذا اليوم" icon="notifications-off-outline" />
          : <table style={table} data-testid="presence-table">
            <Th cols={['الموظف', 'الوحدة', 'مخطط', 'أُرسل', 'تنتهي', 'الحالة', 'الموقع / المسافة', 'المحاولات', 'النوع']} />
            <tbody>{d.rows.map((r: any) => {
              const resp = r.response || (r.attempts || []).slice(-1)[0];
              return (
                <tr key={r.id} style={{ borderBottom: '1px solid #eef2f7' }} data-testid={`presence-row-${r.id}`}>
                  <td style={{ ...td, fontWeight: 700, color: '#0f2440' }}>{r.employee_name}<div style={{ fontSize: 10.5, color: '#94a3b8' }}>{r.employee_no}</div></td>
                  <td style={td}>{r.org_unit_name || '—'}</td><td style={td}>{fmt(r.scheduled_at)}</td><td style={td}>{fmt(r.sent_at)}</td><td style={td}>{fmt(r.expires_at)}</td>
                  <td style={td}><Badge color={PRESENCE_COLOR[r.status] || '#64748b'} testID={`presence-status-${r.id}`}>{r.status_label}</Badge></td>
                  <td style={{ ...td, fontSize: 12 }}>{resp?.location_name ? `${resp.location_name}${resp.distance_m != null ? ` · ${resp.distance_m} م` : ''}` : resp?.latitude != null ? `${Number(resp.latitude).toFixed(4)}, ${Number(resp.longitude).toFixed(4)}` : '—'}</td>
                  <td style={td}>{(r.attempts || []).length || '—'}</td>
                  <td style={td}>{r.manual ? <Badge color="#0284c7">فوري{r.by_name ? ` · ${r.by_name}` : ''}</Badge> : <Badge color="#64748b">عشوائي</Badge>}</td>
                </tr>
              );
            })}</tbody>
          </table>}
      </View>
      {sendOpen && (
        <Modal title="إرسال فحص تواجد فوري" onClose={() => setSendOpen(false)} width={560} testID="presence-send-modal" busy={busy}>
          <div style={{ direction: 'rtl' }}>
            <div style={{ fontSize: 12.5, color: '#475569', marginBottom: 10 }}>يُرسل الآن إشعاراً للموظفين المحددين ليؤكدوا تواجدهم بالبصمة والموقع خلال المهلة.</div>
            <EmployeePicker value={picked} onChange={setPicked} testID="presence-send-emp" />
            <div style={{ marginTop: 10, width: 200 }}><Field label="المهلة (دقيقة)"><input type="number" min={1} max={60} value={timeout} onChange={(e) => setTo(e.target.value)} style={inp} data-testid="presence-send-timeout" /></Field></div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={sendNow} disabled={busy} style={btn('#16a34a')} data-testid="presence-send-confirm">{busy ? 'جاري الإرسال...' : 'إرسال الآن'}</button>
              <button onClick={() => setSendOpen(false)} style={btn('#f1f5f9', '#0f2440')}>إلغاء</button>
            </div>
          </div>
        </Modal>
      )}
    </View>
  );
};

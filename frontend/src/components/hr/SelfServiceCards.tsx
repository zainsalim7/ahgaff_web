import React, { useEffect, useState, useCallback } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { hrAPI } from '../../services/api';
import { reportPage } from '../reports/ReportShell';
import { Badge, btn, alertErr, fmtDT, ATT_COLOR, CORR_COLOR } from './ui';
import { DocRow } from './EmployeeDocuments';

export const MyAttendanceCard: React.FC = () => {
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setD((await hrAPI.myAttendance()).data); } catch { setD(null); } }, []);
  useEffect(() => { load(); }, [load]);
  if (!d?.profile) return null;
  const act = async (fn: (geo?: any) => Promise<any>) => {
    setBusy(true);
    try {
      const geo = await new Promise<any>((res) => { if (!navigator.geolocation) return res(undefined); navigator.geolocation.getCurrentPosition((p) => res({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }), () => res(undefined), { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }); });
      const r = await fn(geo); window.alert(r.data.message); load();
    } catch (e) { alertErr(e); } finally { setBusy(false); }
  };
  const c = d.counts || {};
  return (
    <View style={reportPage.card} testID="hr-me-attendance">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', direction: 'rtl', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#0f2440' }}>حضوري اليوم — {d.day_name} {d.date}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            {!d.is_work_day ? (d.holiday || 'عطلة أسبوعية') : d.on_leave ? `أنت في إجازة ${d.on_leave}` : d.today ? <>حضور <b>{d.today.check_in}</b>{d.today.check_out ? <> · انصراف <b>{d.today.check_out}</b>{d.today.auto_checkout ? <span style={{ color: '#7c3aed' }}> (تلقائي)</span> : null}</> : null}{d.today.late_minutes ? <span style={{ color: '#f97316' }}> · تأخير {d.today.late_minutes} د</span> : null}</> : `الدوام ${d.settings.work_start} – ${d.settings.work_end} (سماحية ${d.settings.late_grace_minutes} د)`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {d.today && <Badge color={ATT_COLOR[d.today.status]} testID="hr-me-today-status">{d.today.status_label}{d.multi_shift && d.today.shift_name ? ` · ${d.today.shift_name}` : ''}</Badge>}
          {d.multi_shift && (d.today_shifts || []).map((ts: any) => <Badge key={ts.shift.id} color={ts.record ? (ts.record.check_out ? '#16a34a' : '#f97316') : '#94a3b8'} testID={`hr-me-shift-${ts.shift.id}`}>{ts.shift.name} {ts.shift.work_start}–{ts.shift.work_end}{ts.record ? ` ✓ ${ts.record.check_in}${ts.record.check_out ? `→${ts.record.check_out}` : ''}` : ''}</Badge>)}
          {d.today?.check_in_geo && <Badge color={({ in_range: '#16a34a', out_of_range: '#dc2626', no_location: '#f97316', exempt: '#7c3aed' } as any)[d.today.check_in_geo.status] || '#94a3b8'} testID="hr-me-today-geo">📍 {d.today.check_in_geo.location_name || d.today.check_in_geo.status_label}</Badge>}
          {d.can_check_in && <button onClick={() => act(hrAPI.checkIn)} disabled={busy} style={btn('#16a34a')} data-testid="hr-me-checkin-btn">{busy ? '📍 جاري تحديد موقعك…' : `🕐 تسجيل حضور${d.multi_shift && d.next_shift ? ` (${d.next_shift.name})` : ''}`}</button>}
          {d.can_check_out && <button onClick={() => act(hrAPI.checkOut)} disabled={busy} style={btn('#0f2440')} data-testid="hr-me-checkout-btn">🏁 تسجيل انصراف</button>}
          {d.correction?.can_correct_check_in && <button onClick={() => window.confirm(`سيُحذف حضورك المسجَّل ويُسجَّل حضور جديد بالوقت الحالي. متابعة؟`) && act((g) => hrAPI.checkIn({ ...(g || {}), correction: true }))} disabled={busy} style={btn('#fff7ed', '#c2410c')} data-testid="hr-me-correct-checkin-btn">↩️ تصحيح الحضور ({Math.ceil(d.correction.check_in_seconds_left / 60)} د متبقية)</button>}
          {d.correction?.can_correct_check_out && <button onClick={() => window.confirm(`سيُلغى انصرافك المسجَّل ويُسجَّل انصراف جديد بالوقت الحالي. متابعة؟`) && act((g) => hrAPI.checkOut({ ...(g || {}), correction: true }))} disabled={busy} style={btn('#fff7ed', '#c2410c')} data-testid="hr-me-correct-checkout-btn">↩️ تصحيح الانصراف ({Math.ceil(d.correction.check_out_seconds_left / 60)} د متبقية)</button>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10, direction: 'rtl', flexWrap: 'wrap', fontSize: 11.5 }}>
        <span style={{ color: '#64748b' }}>هذا الشهر:</span>
        <Badge color={ATT_COLOR.present}>حاضر {c.present || 0}</Badge><Badge color={ATT_COLOR.late}>متأخر {c.late || 0}</Badge><Badge color={ATT_COLOR.absent}>غائب {c.absent || 0}</Badge><Badge color={ATT_COLOR.leave}>إجازة {c.leave || 0}</Badge>
        {d.late_minutes ? <Badge color="#f97316">مجموع التأخير {d.late_minutes} د</Badge> : null}
      </div>
    </View>
  );
};

export const MyCorrespondenceCard: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async () => { try { setItems((await hrAPI.myCorr()).data.items || []); } catch { setItems([]); } }, []);
  useEffect(() => { load(); }, [load]);
  if (!items.length) return null;
  const ack = async (id: string) => { try { await hrAPI.ackCorr(id); load(); } catch (e) { alertErr(e); } };
  return (
    <View style={reportPage.card} testID="hr-me-correspondence">
      <Text style={{ fontSize: 14, fontWeight: '800', color: '#0f2440', textAlign: 'right', marginBottom: 8 }}>تعاميم ومذكرات موجهة إليك ({items.length})</Text>
      {items.map((c) => (
        <div key={c.id} style={{ direction: 'rtl', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }} data-testid={`my-corr-${c.id}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setOpen(open === c.id ? null : c.id)}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><Badge color={CORR_COLOR[c.direction]}>{c.direction_label}</Badge><span style={{ fontWeight: 700, color: '#0f2440', fontSize: 13 }}>{c.subject}</span><span style={{ fontSize: 11, color: '#94a3b8', direction: 'ltr' }}>{c.ref_no} · {c.date}</span>{c.priority === 'urgent' && <Badge color="#dc2626">عاجلة</Badge>}</div>
            {c.acknowledged ? <span style={{ fontSize: 11.5, color: '#16a34a', fontWeight: 700 }}>✓ تم الاستلام</span> : <button onClick={(e) => { e.stopPropagation(); ack(c.id); }} style={btn('#e3f2fd', '#1565c0', { padding: '5px 10px', fontSize: 11.5 })} data-testid={`my-corr-ack-${c.id}`}>تأكيد الاستلام</button>}
          </div>
          {open === c.id && <div style={{ marginTop: 8, backgroundColor: '#f7f9fc', borderRadius: 8, padding: 10, fontSize: 12.5, lineHeight: 1.8, whiteSpace: 'pre-wrap', color: '#334155' }} data-testid={`my-corr-body-${c.id}`}>{c.body || '—'}{c.from_party ? <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 6 }}>من: {c.from_party}</div> : null}{c.attachment_url ? <a href={c.attachment_url} target="_blank" rel="noreferrer" style={{ color: '#1565c0', fontWeight: 700, fontSize: 12 }}>📎 المرفق</a> : null}</div>}
        </div>
      ))}
    </View>
  );
};

export const MyLeavesShortcut: React.FC = () => {
  const router = useRouter();
  return (
    <div style={{ display: 'flex', gap: 8, direction: 'rtl', marginBottom: 12 }}>
      <button onClick={() => router.push('/hr-my-leaves')} style={btn('#1565c0')} data-testid="hr-me-goto-leaves">🏖️ إجازاتي وطلب إجازة</button>
      <button onClick={() => router.push('/hr-tasks')} style={btn('#0f2440')} data-testid="hr-me-goto-tasks">✅ مهامي</button>
      <button onClick={() => router.push('/hr-appraisals')} style={btn('#f1f5f9', '#0f2440')} data-testid="hr-me-goto-appraisals">⭐ تقييمي السنوي</button>
      <button onClick={() => router.push('/hr-letters')} style={btn('#f1f5f9', '#0f2440')} data-testid="hr-me-goto-letters">📜 خطاباتي الرسمية</button>
      <button onClick={() => router.push('/hr-profile-requests')} style={btn('#f1f5f9', '#0f2440')} data-testid="hr-me-goto-profile-requests">✏️ طلب تعديل بياناتي</button>
    </div>
  );
};

export const MyDocumentsCard: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { hrAPI.myDocs().then((r) => setItems(r.data.items || [])).catch(() => setItems([])); }, []);
  if (!items.length) return null;
  return (
    <View style={reportPage.card} testID="hr-me-documents">
      <Text style={{ fontSize: 14, fontWeight: '800', color: '#0f2440', textAlign: 'right', marginBottom: 4 }}>مستنداتي ({items.length})</Text>
      <Text style={{ fontSize: 11.5, color: '#64748b', textAlign: 'right', marginBottom: 6 }}>المستندات المحفوظة في ملفك لدى شؤون الموظفين — ستصلك تذكيرات قبل انتهاء أي منها</Text>
      {items.map((d) => <DocRow key={d.id} d={d} />)}
    </View>
  );
};

/** 📱 جهازي: الجهاز المسجّل للتحضير + طلب تغييره بنقرة (يُسجَّل الجهاز الجديد عند أول تحضير بعد الموافقة) */
export const MyDeviceCard: React.FC = () => {
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setD((await hrAPI.myDevice()).data); } catch { setD(null); } }, []);
  useEffect(() => { load(); }, [load]);
  if (!d || !d.device_binding_enabled) return null;
  const request = async () => {
    const reason = window.prompt('سبب تغيير الجهاز (اختياري) — مثال: اشتريت هاتفاً جديداً', '');
    if (reason === null) return;
    setBusy(true);
    try { const r = await hrAPI.requestDeviceChange({ device_id: '', device_name: '', reason }); window.alert(r.data.message); load(); } catch (e) { alertErr(e); } finally { setBusy(false); }
  };
  const p = d.pending_request, l = d.last_request;
  return (
    <View style={[reportPage.card, { marginBottom: 12 }]} testID="hr-me-device">
      <div style={{ direction: 'rtl' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#0f2440' }}>📱 جهاز التحضير</div>
          {d.device_id ? <Badge color="#16a34a" testID="hr-me-device-status">مسجّل</Badge> : <Badge color="#94a3b8" testID="hr-me-device-status">لم يُسجَّل بعد — سيُسجَّل جهازك عند أول تحضير من التطبيق</Badge>}
        </div>
        {d.device_id && <div style={{ marginTop: 8, fontSize: 12.5, color: '#334155' }}>الجهاز: <b>{d.device_name || 'جهاز الجوال'}</b> <code style={{ fontSize: 11, direction: 'ltr', display: 'inline-block', backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: 6 }} data-testid="hr-me-device-id">{d.device_id}</code>{d.device_registered_at ? <span style={{ color: '#94a3b8' }}> · منذ {fmtDT(d.device_registered_at)}</span> : null}</div>}
        {p ? <div style={{ marginTop: 8, fontSize: 12.5, color: '#b45309', backgroundColor: '#fffbeb', borderRadius: 8, padding: '6px 10px' }} data-testid="hr-me-device-pending">⏳ لديك طلب تغيير جهاز {p.status_label} منذ {fmtDT(p.created_at)}{p.reason ? ` — ${p.reason}` : ''}</div>
          : l ? <div style={{ marginTop: 8, fontSize: 11.5, color: l.status === 'approved' ? '#16a34a' : '#dc2626' }} data-testid="hr-me-device-last">آخر طلب: {l.status_label}{l.reviewed_at ? ` · ${fmtDT(l.reviewed_at)}` : ''}{l.reject_reason ? ` — ${l.reject_reason}` : ''}</div> : null}
        <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 8 }}>يُقبل تسجيل الحضور من جهاز واحد فقط. عند تغيير هاتفك اطلب تغيير الجهاز؛ بعد موافقة شؤون الموظفين يُسجَّل هاتفك الجديد تلقائياً عند أول تحضير منه.</div>
        {d.can_request && <button onClick={request} disabled={busy} style={btn('#fff7ed', '#c2410c', { marginTop: 8 })} data-testid="hr-me-device-request-btn">🔄 طلب تغيير الجهاز</button>}
      </div>
    </View>
  );
};

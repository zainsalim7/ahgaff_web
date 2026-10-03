import React, { useEffect, useState, useCallback } from 'react';
import { View, Text } from 'react-native';
import { hrAPI } from '../../services/api';
import { reportPage, ReportEmpty } from '../reports/ReportShell';
import { Th, td, table, inp, btn, alertErr, Badge } from './ui';
import { GeoMap, GeoPoint } from './GeoMap';

const GEO_COLOR: Record<string, string> = { in_range: '#16a34a', out_of_range: '#dc2626', no_location: '#f97316', exempt: '#7c3aed', no_locations: '#94a3b8' };

/** 🛡️ الموظفون المستثنون من شرط الموقع (أدمن فقط للتعديل) */
export const GeoExemptions: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const [items, setItems] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<any[]>([]);
  const [reason, setReason] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const load = useCallback(async () => { try { setItems((await hrAPI.geoExemptions()).data.items || []); } catch (e) { alertErr(e); } }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (q.trim().length < 2) { setFound([]); return; } const t = setTimeout(() => hrAPI.employees({ search: q, per_page: 8 }).then((r) => setFound(r.data.employees || [])).catch(() => {}), 300); return () => clearTimeout(t); }, [q]);
  const setEx = async (id: string, exempt: boolean) => { try { const r = await hrAPI.setGeoExemption(id, exempt, reason, fromDate, toDate); window.alert(r.data.message); setQ(''); setReason(''); setFromDate(''); setToDate(''); load(); } catch (e) { alertErr(e); } };
  const STATE_COLOR: Record<string, string> = { active: '#16a34a', expired: '#94a3b8', upcoming: '#1565c0' };
  return (
    <View testID="geo-exemptions">
      <View style={[reportPage.card, { marginBottom: 12 }]}>
        <div style={{ direction: 'rtl', fontSize: 12.5, color: '#475569', marginBottom: 10 }}>الموظف المستثنى يستطيع تسجيل الحضور من أي مكان (مهمات خارجية، عمل ميداني). الاستثناء دائم حتى يُلغى، أو <b>مؤقت</b> بتحديد «من تاريخ / إلى تاريخ» (ينتهي تلقائياً بانقضاء المدة)، ويُوسم سجله بـ «مستثنى».</div>
        {isAdmin ? (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr', gap: 10, direction: 'rtl' }}>
            <div style={{ position: 'relative' }}>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن موظف بالاسم أو الرقم لاستثنائه…" style={inp} data-testid="geo-exempt-search" />
              {found.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', right: 0, left: 0, backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, zIndex: 20, boxShadow: '0 6px 20px rgba(0,0,0,0.12)', maxHeight: 260, overflowY: 'auto' }} data-testid="geo-exempt-results">
                  {found.map((e) => <div key={e.id} onClick={() => setEx(e.id, true)} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: 13 }} data-testid={`geo-exempt-pick-${e.id}`}><b>{e.full_name}</b> <span style={{ color: '#94a3b8', fontSize: 11 }}>{e.employee_no} · {e.job_title || ''}</span>{items.some((i) => i.employee_id === e.id) && <Badge color="#7c3aed">مستثنى بالفعل</Badge>}</div>)}
                </div>
              )}
            </div>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="سبب الاستثناء (اختياري) — مثال: مهمة خارجية" style={inp} data-testid="geo-exempt-reason" />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', gridColumn: 'span 2', fontSize: 12.5, color: '#475569' }}>
              <span>⏳ استثناء مؤقت (اختياري):</span>
              <span>من</span><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={{ ...inp, width: 160, direction: 'ltr' }} data-testid="geo-exempt-from" />
              <span>إلى</span><input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} style={{ ...inp, width: 160, direction: 'ltr' }} data-testid="geo-exempt-to" />
              <span style={{ color: '#94a3b8' }}>{fromDate || toDate ? `سيُطبَّق ${fromDate ? `من ${fromDate}` : ''} ${toDate ? `حتى ${toDate}` : ''}` : 'فارغان = استثناء دائم'}</span>
            </div>
          </div>
        ) : <Badge color="#f97316">إضافة/إلغاء الاستثناءات متاحة لمدير النظام ومن يملك صلاحية إدارة الحضور</Badge>}
      </View>
      <View style={reportPage.card}>
        {items.length === 0 ? <ReportEmpty text="لا يوجد موظفون مستثنون من شرط الموقع" icon="shield-checkmark-outline" />
          : <table style={table} data-testid="geo-exempt-table">
            <Th cols={['الموظف', 'الوحدة', 'السبب', 'المدة', 'الحالة', 'منذ', '']} />
            <tbody>{items.map((i) => (
              <tr key={i.employee_id} style={{ borderBottom: '1px solid #eef2f7' }} data-testid={`geo-exempt-row-${i.employee_id}`}>
                <td style={{ ...td, fontWeight: 700, color: '#0f2440' }}>{i.employee_name}<div style={{ fontSize: 10.5, color: '#94a3b8' }}>{i.employee_no}{i.job_title ? ` · ${i.job_title}` : ''}</div></td>
                <td style={td}>{i.org_unit_name || '—'}</td><td style={td}>{i.reason || '—'}</td>
                <td style={{ ...td, fontSize: 12 }} data-testid={`geo-exempt-period-${i.employee_id}`}>{i.permanent ? <Badge color="#7c3aed">دائم</Badge> : <span style={{ direction: 'ltr', display: 'inline-block' }}>{i.from_date || '…'} → {i.to_date || '…'}</span>}</td>
                <td style={td}><Badge color={STATE_COLOR[i.state] || '#64748b'} testID={`geo-exempt-state-${i.employee_id}`}>{i.state_label}</Badge></td>
                <td style={td}>{(i.since || '').slice(0, 10) || '—'}{i.by_name ? <div style={{ fontSize: 10.5, color: '#94a3b8' }}>{i.by_name}</div> : null}</td>
                <td style={td}>{isAdmin && <button onClick={() => window.confirm(`إلغاء استثناء ${i.employee_name}؟`) && setEx(i.employee_id, false)} style={btn('#ffebee', '#c62828', { padding: '4px 10px', fontSize: 12 })} data-testid={`geo-unexempt-${i.employee_id}`}>إلغاء الاستثناء</button>}</td>
              </tr>))}</tbody>
          </table>}
      </View>
    </View>
  );
};

/** 🗺️ تقرير مواقع تسجيل الموظفين ليوم محدد */
export const GeoReport: React.FC = () => {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => { setLoading(true); hrAPI.locationsReport(date).then((r) => setD(r.data)).catch(alertErr).finally(() => setLoading(false)); }, [date]);
  const rows: any[] = d?.rows || [];
  const selfRows = rows.filter((r) => r.source === 'self');
  const points: GeoPoint[] = selfRows.flatMap((r) => [r.in && r.in.latitude != null ? { lat: r.in.latitude, lng: r.in.longitude, label: `${r.employee_name} — حضور ${r.check_in} (${r.in.status_label || ''}${r.in.distance_m != null ? ` · ${r.in.distance_m} م` : ''})`, color: GEO_COLOR[r.in.status] || '#64748b' } : null,
    r.out && r.out.latitude != null ? { lat: r.out.latitude, lng: r.out.longitude, label: `${r.employee_name} — انصراف ${r.check_out} (${r.out.status_label || ''})`, color: GEO_COLOR[r.out.status] || '#64748b' } : null].filter(Boolean) as GeoPoint[]);
  const G = ({ g }: { g: any }) => !g ? <span style={{ color: '#94a3b8' }}>—</span> : <Badge color={GEO_COLOR[g.status] || '#64748b'}>{g.status_label || g.status}{g.location_name ? ` · ${g.location_name}` : ''}{g.distance_m != null ? ` (${g.distance_m} م)` : ''}</Badge>;
  return (
    <View testID="geo-report">
      <View style={[reportPage.card, { marginBottom: 12 }]}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', direction: 'rtl' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0f2440' }}>اليوم:</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...inp, width: 170, direction: 'ltr' }} data-testid="geo-report-date" />
          {d && Object.entries(d.summary || {}).map(([k, v]: any) => <Badge key={k} color={GEO_COLOR[k] || '#64748b'} testID={`geo-sum-${k}`}>{({ in_range: 'داخل النطاق', out_of_range: 'خارج النطاق', no_location: 'بدون موقع', exempt: 'مستثنى', manual: 'تسجيل يدوي' } as any)[k]}: {v}</Badge>)}
        </div>
      </View>
      {loading ? <Text style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>جاري التحميل...</Text> : !d ? null : (
        <>
          <View style={[reportPage.card, { marginBottom: 12 }]}>
            <GeoMap locations={d.locations || []} points={points} height={360} testID="geo-report-map" />
            <div style={{ display: 'flex', gap: 12, fontSize: 11.5, color: '#64748b', marginTop: 8, direction: 'rtl' }}>{Object.entries(GEO_COLOR).filter(([k]) => k !== 'no_locations').map(([k, c]) => <span key={k}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, backgroundColor: c, marginLeft: 4 }} />{({ in_range: 'داخل النطاق', out_of_range: 'خارج النطاق', no_location: 'بدون موقع', exempt: 'مستثنى' } as any)[k]}</span>)}</div>
          </View>
          <View style={reportPage.card}>
            {selfRows.length === 0 ? <ReportEmpty text="لا تسجيلات ذاتية من التطبيق في هذا اليوم" icon="map-outline" />
              : <table style={table} data-testid="geo-report-table">
                <Th cols={['الموظف', 'الوحدة', 'الحضور', 'موقع الحضور', 'الانصراف', 'موقع الانصراف']} />
                <tbody>{selfRows.map((r) => (
                  <tr key={r.employee_id} style={{ borderBottom: '1px solid #eef2f7' }} data-testid={`geo-report-row-${r.employee_id}`}>
                    <td style={{ ...td, fontWeight: 700, color: '#0f2440' }}>{r.employee_name}<div style={{ fontSize: 10.5, color: '#94a3b8' }}>{r.employee_no}</div></td>
                    <td style={td}>{r.org_unit_name || '—'}</td><td style={td}>{r.check_in || '—'}</td><td style={td}><G g={r.in} /></td><td style={td}>{r.check_out || '—'}</td><td style={td}><G g={r.out} /></td>
                  </tr>))}</tbody>
              </table>}
          </View>
        </>
      )}
    </View>
  );
};

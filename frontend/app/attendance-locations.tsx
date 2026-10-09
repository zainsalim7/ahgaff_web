import React, { useEffect, useMemo, useState } from 'react';
import api from '../src/services/api';
import { useAuthStore } from '../src/store/authStore';
import { CorrPage, card, btn, inp, lbl, th, td, Badge, Empty } from '../src/components/corr/CorrUI';

const FLAG: Record<string, { label: string; color: string }> = { outside: { label: 'خارج النطاق', color: '#b91c1c' }, no_location: { label: 'بدون موقع', color: '#92400e' }, inside: { label: 'داخل الحرم', color: '#16a34a' } };
const LOC_STATUS: Record<string, string> = { ok: 'تم الالتقاط', denied: 'رفض الإذن', unavailable: 'GPS غير متاح', no_config: 'لا توجد حدود محمّلة', disabled: 'الميزة معطّلة' };
const dist = (m?: number | null) => (m == null ? '—' : m >= 1000 ? `${(m / 1000).toFixed(1)} كم` : `${Math.round(m)} م`);
const errOf = (e: any, d: string) => e?.response?.data?.detail || d;
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

export default function AttendanceLocationsPage() {
  const user = useAuthStore((s) => s.user);
  const [from, setFrom] = useState(daysAgo(30)); const [to, setTo] = useState(today()); const [dept, setDept] = useState(''); const [onlyFlagged, setOnlyFlagged] = useState(true);
  const [data, setData] = useState<any>({ items: [], summary: { outside: 0, no_location: 0, inside: 0 } }); const [depts, setDepts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true); const [err, setErr] = useState('');
  const [geo, setGeo] = useState<any>(null); const [geoOpen, setGeoOpen] = useState(false); const [geoBusy, setGeoBusy] = useState(false);

  const load = () => { setLoading(true); setErr(''); api.get('/reports/attendance-locations', { params: { start_date: from, end_date: to, department_id: dept || undefined, only_flagged: onlyFlagged } }).then((r) => setData(r.data)).catch((e) => setErr(errOf(e, 'غير مصرح بالوصول إلى هذا التقرير'))).finally(() => setLoading(false)); };
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [from, to, dept, onlyFlagged]); // eslint-disable-line
  useEffect(() => { api.get('/departments').then((r) => setDepts(Array.isArray(r.data) ? r.data : r.data?.items || [])).catch(() => {}); api.get('/geofence/campus').then((r) => setGeo(r.data)).catch(() => {}); }, []);

  const saveGeo = async () => {
    setGeoBusy(true);
    try { const r = await api.put('/geofence/campus', { enabled: geo.enabled !== false, locations: geo.locations.map((l: any) => ({ ...l, lat: Number(l.lat), lng: Number(l.lng), radius_m: Number(l.radius_m) || 200 })) }); window.alert(r.data.message); const g = await api.get('/geofence/campus'); setGeo(g.data); }
    catch (e) { window.alert(errOf(e, 'فشل الحفظ')); } finally { setGeoBusy(false); }
  };
  const setLoc = (i: number, k: string, v: any) => setGeo({ ...geo, locations: geo.locations.map((l: any, j: number) => (j === i ? { ...l, [k]: v } : l)) });
  const teachers = useMemo(() => { const m = new Map<string, { name: string; outside: number; no_location: number }>(); data.items.forEach((it: any) => { const e = m.get(it.teacher_id || it.teacher_name) || { name: it.teacher_name || 'غير معيّن', outside: 0, no_location: 0 }; if (it.flag === 'outside') e.outside++; if (it.flag === 'no_location') e.no_location++; m.set(it.teacher_id || it.teacher_name, e); }); return Array.from(m.values()).filter((t) => t.outside + t.no_location > 0).sort((a, b) => b.outside - a.outside).slice(0, 8); }, [data]);
  const s = data.summary || {};

  return (
    <CorrPage title="📍 مواقع تحضير المحاضرات" subtitle="المحاضرات التي حُضّرت خارج حدود الكلية أو بدون موقع (وضع التنبيه — لا يُمنع الحفظ). الموقع يُلتقط بصمت من هاتف الأستاذ وقت الحفظ حتى أوفلاين." testID="geo-page" hideNav
      actions={user?.role === 'admin' ? <button onClick={() => setGeoOpen((v) => !v)} style={btn(geoOpen ? '#0f2440' : '#f1f5f9', { color: geoOpen ? '#fff' : '#0f2440' })} data-testid="geo-settings-toggle">⚙️ حدود الكلية {geo ? `(${geo.locations?.length || 0})` : ''}</button> : undefined}>
      {geoOpen && geo && (
        <div style={card} data-testid="geo-settings">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <b style={{ color: '#0f2440' }}>المواقع المعتمدة (يخزّنها تطبيق الأستاذ محلياً ويُحدّثها كل 12 ساعة)</b>
            <label style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={geo.enabled !== false} onChange={(e) => setGeo({ ...geo, enabled: e.target.checked })} data-testid="geo-enabled" /> تفعيل التقاط الموقع</label>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['الاسم', 'خط العرض (lat)', 'خط الطول (lng)', 'نصف القطر (م)', ''].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{(geo.locations || []).map((l: any, i: number) => (
              <tr key={l.id || i} data-testid={`geo-loc-${i}`}>
                <td style={td}><input style={inp} value={l.name || ''} onChange={(e) => setLoc(i, 'name', e.target.value)} placeholder="الحرم الرئيسي" data-testid={`geo-loc-${i}-name`} /></td>
                <td style={td}><input style={inp} value={l.lat ?? ''} onChange={(e) => setLoc(i, 'lat', e.target.value)} placeholder="14.5412" data-testid={`geo-loc-${i}-lat`} /></td>
                <td style={td}><input style={inp} value={l.lng ?? ''} onChange={(e) => setLoc(i, 'lng', e.target.value)} placeholder="49.1242" data-testid={`geo-loc-${i}-lng`} /></td>
                <td style={td}><input style={inp} value={l.radius_m ?? 200} onChange={(e) => setLoc(i, 'radius_m', e.target.value)} data-testid={`geo-loc-${i}-radius`} /></td>
                <td style={td}><button onClick={() => setGeo({ ...geo, locations: geo.locations.filter((_: any, j: number) => j !== i) })} style={btn('#fee2e2', { color: '#b91c1c', padding: '5px 10px', fontSize: 12 })} data-testid={`geo-loc-${i}-del`}>حذف</button></td>
              </tr>
            ))}</tbody></table>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={() => setGeo({ ...geo, locations: [...(geo.locations || []), { name: '', lat: '', lng: '', radius_m: 300 }] })} style={btn('#f1f5f9', { color: '#0f2440' })} data-testid="geo-loc-add">+ إضافة موقع</button>
            <button onClick={saveGeo} disabled={geoBusy} style={btn('#16a34a')} data-testid="geo-save">{geoBusy ? '⏳' : '💾 حفظ حدود الكلية'}</button>
          </div>
        </div>
      )}
      {!!err && <div style={{ ...card, color: '#b91c1c', fontWeight: 700 }} data-testid="geo-error">{err}</div>}
      <div style={card}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr auto auto', gap: 8, alignItems: 'center' }} data-testid="geo-filters">
          <label style={{ fontSize: 12, color: '#475569' }}>من <input type="date" style={{ ...inp, width: 'auto', padding: '6px 8px' }} value={from} onChange={(e) => setFrom(e.target.value)} data-testid="geo-from" /></label>
          <label style={{ fontSize: 12, color: '#475569' }}>إلى <input type="date" style={{ ...inp, width: 'auto', padding: '6px 8px' }} value={to} onChange={(e) => setTo(e.target.value)} data-testid="geo-to" /></label>
          <select style={inp} value={dept} onChange={(e) => setDept(e.target.value)} data-testid="geo-dept"><option value="">كل الأقسام</option>{depts.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          <label style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', whiteSpace: 'nowrap' }}><input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} data-testid="geo-only-flagged" /> المخالفات فقط</label>
          <button onClick={load} style={btn('#f1f5f9', { color: '#0f2440', padding: '6px 10px', fontSize: 12 })} data-testid="geo-refresh">↻</button>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }} data-testid="geo-summary">
          {([['outside', s.outside], ['no_location', s.no_location], ['inside', s.inside]] as const).map(([k, v]) => <div key={k} style={{ flex: 1, minWidth: 160, borderRadius: 12, padding: 12, background: FLAG[k].color + '12', border: `1.5px solid ${FLAG[k].color}44` }} data-testid={`geo-summary-${k}`}><div style={{ fontSize: 26, fontWeight: 900, color: FLAG[k].color }}>{v ?? 0}</div><div style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>{FLAG[k].label}</div></div>)}
        </div>
        {teachers.length > 0 && <div style={{ marginTop: 10, fontSize: 12.5, color: '#475569' }} data-testid="geo-teachers"><b>الأكثر تكراراً:</b> {teachers.map((t) => `${t.name} (${t.outside} خارج${t.no_location ? ` · ${t.no_location} بدون موقع` : ''})`).join(' — ')}</div>}
      </div>
      <div style={card} data-testid="geo-list">
        {loading ? <div style={{ color: '#94a3b8', fontSize: 13 }}>جاري التحميل…</div> : data.items.length === 0 ? <Empty text={onlyFlagged ? 'لا توجد محاضرات مخالفة في هذه الفترة ✅' : 'لا توجد محاضرات بموقع في هذه الفترة'} /> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['التاريخ', 'الوقت', 'المقرر', 'الأستاذ', 'الحالة', 'المسافة', 'أقرب موقع', 'حالة الالتقاط', 'الدقة'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{data.items.map((it: any) => { const f = FLAG[it.flag] || FLAG.inside; const loc = it.location || {}; return (
              <tr key={it.lecture_id} data-testid={`geo-row-${it.lecture_id}`} style={it.flag === 'outside' ? { background: '#fff5f5' } : undefined}>
                <td style={td}>{it.date}</td><td style={td}>{it.start_time}–{it.end_time}</td><td style={td}>{it.course_name}</td><td style={td}>{it.teacher_name || '—'}</td>
                <td style={td}><Badge text={f.label} color={f.color} /></td>
                <td style={{ ...td, fontWeight: 800, color: it.flag === 'outside' ? '#b91c1c' : '#334155' }}>{dist(loc.distance_m)}</td>
                <td style={td}>{loc.nearest_location_name || '—'}</td><td style={td}>{LOC_STATUS[loc.status] || loc.status || '—'}{loc.captured_at ? <div style={{ fontSize: 10.5, color: '#94a3b8' }}>{String(loc.captured_at).slice(0, 16).replace('T', ' ')}</div> : null}</td>
                <td style={td}>{loc.accuracy != null ? `±${Math.round(loc.accuracy)} م` : '—'}{loc.lat != null && loc.lng != null ? <div><a href={`https://maps.google.com/?q=${loc.lat},${loc.lng}`} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#1d4ed8' }} data-testid={`geo-map-${it.lecture_id}`}>الخريطة ↗</a></div> : null}</td>
              </tr>); })}</tbody>
          </table>
        )}
      </div>
    </CorrPage>
  );
}

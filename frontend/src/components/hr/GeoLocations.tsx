import React, { useEffect, useState, useCallback } from 'react';
import { View, Text } from 'react-native';
import { hrAPI } from '../../services/api';
import { reportPage, ReportEmpty } from '../reports/ReportShell';
import { Th, td, table, inp, btn, alertErr, Modal, Badge, Field } from './ui';
import { GeoMap } from './GeoMap';

const EMPTY = { name: '', latitude: '', longitude: '', radius_meters: '200', is_active: true, description: '' };

const LocationForm: React.FC<{ initial: any; onClose: () => void; onSaved: () => void; others: any[] }> = ({ initial, onClose, onSaved, others }) => {
  const [f, setF] = useState<any>(initial);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const lat = parseFloat(f.latitude), lng = parseFloat(f.longitude);
  const valid = !isNaN(lat) && !isNaN(lng);
  const useMyPos = () => navigator.geolocation?.getCurrentPosition((p) => { set('latitude', p.coords.latitude.toFixed(6)); set('longitude', p.coords.longitude.toFixed(6)); }, () => window.alert('تعذر الحصول على موقعك من المتصفح'), { enableHighAccuracy: true, timeout: 10000 });
  const save = async () => {
    if (!f.name.trim()) return window.alert('اسم الموقع مطلوب');
    if (!valid) return window.alert('أدخل الإحداثيات أو انقر على الخريطة لتحديد الموقع');
    setBusy(true);
    try {
      const body = { name: f.name.trim(), latitude: lat, longitude: lng, radius_meters: Number(f.radius_meters) || 200, is_active: !!f.is_active, description: f.description || '' };
      const r = f.id ? await hrAPI.updateLocation(f.id, body) : await hrAPI.createLocation(body);
      window.alert(r.data.message); onSaved(); onClose();
    } catch (e) { alertErr(e); } finally { setBusy(false); }
  };
  const preview = valid ? [{ id: f.id || 'new', name: f.name || 'الموقع الجديد', latitude: lat, longitude: lng, radius_meters: Number(f.radius_meters) || 200 }] : [];
  return (
    <Modal title={f.id ? 'تعديل موقع العمل' : 'إضافة موقع عمل'} onClose={onClose} width={760} testID="geo-location-modal" busy={busy}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, direction: 'rtl' }}>
        <Field label="اسم الموقع *" span={2}><input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="مثال: الحرم الجامعي الرئيسي" style={inp} data-testid="geo-loc-name" /></Field>
        <Field label="نصف القطر (متر)"><input type="number" value={f.radius_meters} onChange={(e) => set('radius_meters', e.target.value)} style={inp} data-testid="geo-loc-radius" /></Field>
        <Field label="الحالة"><label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, marginTop: 8, cursor: 'pointer' }}><input type="checkbox" checked={!!f.is_active} onChange={(e) => set('is_active', e.target.checked)} data-testid="geo-loc-active" /> مفعّل</label></Field>
        <Field label="خط العرض (Latitude) *"><input value={f.latitude} onChange={(e) => set('latitude', e.target.value)} placeholder="14.5427" style={{ ...inp, direction: 'ltr' }} data-testid="geo-loc-lat" /></Field>
        <Field label="خط الطول (Longitude) *"><input value={f.longitude} onChange={(e) => set('longitude', e.target.value)} placeholder="49.1342" style={{ ...inp, direction: 'ltr' }} data-testid="geo-loc-lng" /></Field>
        <Field label="وصف (اختياري)" span={2}><input value={f.description} onChange={(e) => set('description', e.target.value)} style={inp} data-testid="geo-loc-desc" /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0 6px', direction: 'rtl', fontSize: 12, color: '#64748b' }}>
        <span>انقر على الخريطة لتحديد مركز الموقع، أو</span>
        <button onClick={useMyPos} style={btn('#f1f5f9', '#0f2440', { fontSize: 12 })} data-testid="geo-loc-use-my-pos">📍 استخدام موقعي الحالي</button>
      </div>
      <GeoMap locations={[...others.filter((o) => o.id !== f.id), ...preview]} picked={null} onPick={(la, ln) => { set('latitude', String(la)); set('longitude', String(ln)); }} height={300} testID="geo-loc-pick-map" />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-start', marginTop: 14, direction: 'rtl' }}>
        <button onClick={save} disabled={busy} style={btn('#1565c0')} data-testid="geo-loc-save">{busy ? 'جاري الحفظ...' : 'حفظ'}</button>
        <button onClick={onClose} style={btn('#f1f5f9', '#0f2440')}>إلغاء</button>
      </div>
    </Modal>
  );
};

/** 📍 إدارة مواقع العمل المعتمدة */
export const GeoLocations: React.FC<{ canManage: boolean }> = ({ canManage }) => {
  const [locs, setLocs] = useState<any[]>([]);
  const [required, setRequired] = useState(true);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<any>(null);
  const load = useCallback(async () => { setLoading(true); try { const r = await hrAPI.locations(); setLocs(r.data.locations || []); setRequired(!!r.data.geofence_required); } catch (e) { alertErr(e); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  const del = async (l: any) => { if (!window.confirm(`حذف الموقع «${l.name}»؟`)) return; try { await hrAPI.deleteLocation(l.id); load(); } catch (e) { alertErr(e); } };
  const toggle = async (l: any) => { try { await hrAPI.updateLocation(l.id, { name: l.name, latitude: l.latitude, longitude: l.longitude, radius_meters: l.radius_meters, is_active: !l.is_active, description: l.description || '' }); load(); } catch (e) { alertErr(e); } };
  return (
    <View testID="geo-locations">
      <View style={[reportPage.card, { marginBottom: 12 }]}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', direction: 'rtl' }}>
          <Badge color={required ? '#16a34a' : '#f97316'} testID="geo-required-badge">{required ? 'التحقق الجغرافي مفعّل' : 'التحقق الجغرافي معطّل (يُسجَّل الموقع دون رفض)'}</Badge>
          <span style={{ fontSize: 12, color: '#64748b' }}>{locs.filter((l) => l.is_active).length} موقع مفعّل من {locs.length} · يُغيَّر التفعيل من «إعدادات الدوام»</span>
          {canManage && <button onClick={() => setEdit({ ...EMPTY })} style={btn('#1565c0', '#fff', { marginRight: 'auto' })} data-testid="geo-add-location-btn">+ إضافة موقع</button>}
        </div>
      </View>
      {loading ? <Text style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>جاري التحميل...</Text>
        : locs.length === 0 ? <ReportEmpty text="لا توجد مواقع عمل معرّفة — أضف أول موقع (مثل الحرم الجامعي) ليُطبَّق التحقق الجغرافي" icon="location-outline" />
        : <>
          <View style={[reportPage.card, { marginBottom: 12 }]}><GeoMap locations={locs} height={340} testID="geo-locations-map" /></View>
          <View style={reportPage.card}>
            <table style={table} data-testid="geo-locations-table">
              <Th cols={['الموقع', 'الإحداثيات', 'نصف القطر', 'الحالة', 'الوصف', '']} />
              <tbody>
                {locs.map((l) => (
                  <tr key={l.id} style={{ borderBottom: '1px solid #eef2f7' }} data-testid={`geo-loc-row-${l.id}`}>
                    <td style={{ ...td, fontWeight: 700, color: '#0f2440' }}>{l.name}</td>
                    <td style={{ ...td, direction: 'ltr', textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>{Number(l.latitude).toFixed(5)}, {Number(l.longitude).toFixed(5)}</td>
                    <td style={td}>{l.radius_meters} م</td>
                    <td style={td}><Badge color={l.is_active ? '#16a34a' : '#94a3b8'}>{l.is_active ? 'مفعّل' : 'معطّل'}</Badge></td>
                    <td style={{ ...td, color: '#64748b' }}>{l.description || '—'}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{canManage && <>
                      <button onClick={() => setEdit({ ...l, latitude: String(l.latitude), longitude: String(l.longitude), radius_meters: String(l.radius_meters) })} style={btn('#f1f5f9', '#0f2440', { padding: '4px 10px', fontSize: 12 })} data-testid={`geo-loc-edit-${l.id}`}>تعديل</button>{' '}
                      <button onClick={() => toggle(l)} style={btn('#fff7ed', '#c2410c', { padding: '4px 10px', fontSize: 12 })} data-testid={`geo-loc-toggle-${l.id}`}>{l.is_active ? 'تعطيل' : 'تفعيل'}</button>{' '}
                      <button onClick={() => del(l)} style={btn('#ffebee', '#c62828', { padding: '4px 10px', fontSize: 12 })} data-testid={`geo-loc-del-${l.id}`}>حذف</button></>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </View>
        </>}
      {edit && <LocationForm initial={edit} others={locs} onClose={() => setEdit(null)} onSaved={load} />}
    </View>
  );
};

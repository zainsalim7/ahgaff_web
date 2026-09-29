import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { goBack } from '../src/utils/navigation';
import api from '../src/services/api';
import { ReportHero, reportPage } from '../src/components/reports/ReportShell';
import { inp, btn, alertErr, Badge, Field } from '../src/components/hr/ui';

const AppSection: React.FC<{ app: any; onSaved: (a: any) => void }> = ({ app, onSaved }) => {
  const [f, setF] = useState<any>(app);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF((p: any) => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const save = async () => {
    if (!/^\d+(\.\d+){0,3}$/.test((f.min_supported_version || '').trim())) return window.alert('الحد الأدنى للإصدار بصيغة مثل 1.2.0');
    setBusy(true);
    try {
      const r = await api.put(`/admin/app-versions/${app.app}`, { min_supported_version: f.min_supported_version, latest_version: f.latest_version || '', ios_url: f.ios_url || '', android_url: f.android_url || '', message: f.message || '', force_enabled: f.force_enabled !== false });
      window.alert(r.data.message); onSaved({ ...app, ...r.data });
    } catch (e) { alertErr(e); } finally { setBusy(false); }
  };
  const publicUrl = `${process.env.EXPO_PUBLIC_BACKEND_URL || ''}/api/app-version/${app.app}`;
  return (
    <View style={[reportPage.card, { marginBottom: 14, borderRightWidth: 4, borderRightColor: app.app === 'student' ? '#1565c0' : '#00796b' }]} testID={`app-version-${app.app}`}>
      <div style={{ direction: 'rtl' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#0f2440' }}>{app.app === 'student' ? '🎓' : '👨‍🏫'} {app.label}</span>
          <Badge color={f.force_enabled !== false ? '#dc2626' : '#94a3b8'}>{f.force_enabled !== false ? 'التحديث الإجباري مفعّل' : 'التحديث الإجباري معطّل'}</Badge>
          {app.updated_at && <span style={{ fontSize: 11, color: '#94a3b8' }}>آخر حفظ: {String(app.updated_at).slice(0, 16).replace('T', ' ')}{app.updated_by_name ? ` · ${app.updated_by_name}` : ''}</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          <Field label="الحد الأدنى للإصدار (إجباري) *"><input value={f.min_supported_version || ''} onChange={set('min_supported_version')} placeholder="1.2.0" style={{ ...inp, direction: 'ltr' }} data-testid={`${app.app}-min-version`} /></Field>
          <Field label="آخر إصدار (تنبيه غير إجباري)"><input value={f.latest_version || ''} onChange={set('latest_version')} placeholder="1.3.0" style={{ ...inp, direction: 'ltr' }} data-testid={`${app.app}-latest-version`} /></Field>
          <Field label="رابط App Store"><input value={f.ios_url || ''} onChange={set('ios_url')} placeholder="https://apps.apple.com/app/..." style={{ ...inp, direction: 'ltr' }} data-testid={`${app.app}-ios-url`} /></Field>
          <Field label="رابط Google Play"><input value={f.android_url || ''} onChange={set('android_url')} placeholder="https://play.google.com/store/apps/details?id=..." style={{ ...inp, direction: 'ltr' }} data-testid={`${app.app}-android-url`} /></Field>
          <Field label="رسالة مخصصة تظهر للمستخدم" span={4}><textarea value={f.message || ''} onChange={set('message')} rows={2} placeholder="يتوفر إصدار جديد من التطبيق، يرجى التحديث للمتابعة." style={{ ...inp, resize: 'vertical' }} data-testid={`${app.app}-message`} /></Field>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={f.force_enabled !== false} onChange={set('force_enabled')} data-testid={`${app.app}-force-enabled`} /> إجبار التحديث لمن إصداره أقل من الحد الأدنى (يُمنع من استخدام التطبيق حتى يحدّث)</label>
          <span style={{ marginRight: 'auto' }} />
          <button onClick={save} disabled={busy} style={btn(app.app === 'student' ? '#1565c0' : '#00796b')} data-testid={`${app.app}-save`}>{busy ? 'جاري الحفظ...' : 'حفظ'}</button>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: '#64748b', direction: 'ltr', textAlign: 'right' }}>API: <code>{publicUrl}?current=1.0.0</code></div>
      </div>
    </View>
  );
};

/** 📱 إعدادات التحديث الإجباري لتطبيقَي الطالب والأستاذ — أدمن فقط */
export default function AppVersions() {
  const [apps, setApps] = useState<any[] | null>(null);
  useEffect(() => { api.get('/admin/app-versions').then((r) => setApps(r.data.apps)).catch(alertErr); }, []);
  return (
    <SafeAreaView style={reportPage.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={reportPage.content}>
        <ReportHero kicker="إدارة النظام" title="إعدادات تحديث التطبيقات" subtitle="حدّد الحد الأدنى للإصدار وروابط المتاجر ورسالة التحديث لكل تطبيق؛ من يعمل بإصدار أقل من الحد الأدنى يُطالَب بالتحديث إجبارياً" onBack={() => goBack()} canExport={false} testID="app-versions-hero" />
        {!apps ? <Text style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>جاري التحميل...</Text>
          : apps.map((a) => <AppSection key={a.app} app={a} onSaved={(n) => setApps((p) => (p || []).map((x) => (x.app === n.app ? n : x)))} />)}
      </ScrollView>
    </SafeAreaView>
  );
}

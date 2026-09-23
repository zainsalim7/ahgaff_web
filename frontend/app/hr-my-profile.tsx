import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { goBack } from '../src/utils/navigation';
import { hrAPI } from '../src/services/api';
import { ReportHero, ReportEmpty, reportPage } from '../src/components/reports/ReportShell';
import { MyAttendanceCard, MyCorrespondenceCard, MyLeavesShortcut } from '../src/components/hr/SelfServiceCards';

const STATUS_COLOR: Record<string, string> = { active: '#16a34a', probation: '#f97316', leave: '#0284c7', suspended: '#dc2626', ended: '#64748b' };

export default function HrMyProfile() {
  const [p, setP] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { hrAPI.me().then((r) => setP(r.data.profile)).catch(() => setP(null)).finally(() => setLoading(false)); }, []);

  const rows = p ? [
    ['الرقم الوظيفي', p.employee_no], ['الفئة', p.category_label], ['المسمى الوظيفي', p.job_title], ['الدرجة', p.grade], ['الوحدة التنظيمية', p.org_unit_name], ['المدير المباشر', p.manager_name],
    ['نوع التعاقد', p.contract_type_label], ['تاريخ التعيين', p.hire_date], ['نهاية العقد', p.contract_end_date], ['الهاتف', p.phone], ['البريد', p.email], ['الجنسية', p.nationality],
    ['رقم الهوية / الجواز', p.national_id], ['انتهاء الهوية', p.id_expiry_date], ['المؤهل', p.qualification], ['التخصص', p.specialization],
  ] : [];

  return (
    <SafeAreaView style={reportPage.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={reportPage.content}>
        <ReportHero kicker="شؤون الموظفين" title="ملفي الإداري" subtitle="بياناتك الوظيفية كما هي مسجّلة لدى شؤون الموظفين — لتعديل أي بيان راجع إدارة الموارد البشرية" onBack={() => goBack()} canExport={false} testID="hr-me-hero" />
        {loading ? <ActivityIndicator size="large" color="#1565c0" style={{ marginTop: 30 }} />
          : !p ? <ReportEmpty text="لا يوجد ملف إداري مرتبط بحسابك بعد — سيظهر هنا بعد أن تُنشئه إدارة شؤون الموظفين" icon="id-card-outline" />
          : (<>
            <MyLeavesShortcut />
            <MyAttendanceCard />
            <MyCorrespondenceCard />
            <View style={reportPage.card} testID="hr-me-card">
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: '#0f2440', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{(p.full_name || '?').trim().charAt(0)}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#0f2440', textAlign: 'right' }}>{p.full_name}</Text>
                  <Text style={{ fontSize: 12.5, color: '#64748b', textAlign: 'right' }}>{p.job_title || p.category_label}{p.org_unit_name ? ` · ${p.org_unit_name}` : ''}</Text>
                </View>
                <View style={{ backgroundColor: (STATUS_COLOR[p.status] || '#64748b') + '18', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}><Text style={{ color: STATUS_COLOR[p.status] || '#64748b', fontWeight: '800', fontSize: 12 }}>{p.status_label}</Text></View>
              </View>
              {p.alerts?.map((a: string) => <View key={a} style={{ backgroundColor: '#fff3e0', padding: 8, borderRadius: 8, marginBottom: 8 }}><Text style={{ color: '#e65100', fontWeight: '700', fontSize: 12, textAlign: 'right' }}>⚠ {a}</Text></View>)}
              <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 }}>
                {rows.map(([l, v]) => (
                  <View key={l as string} style={{ width: '48%', backgroundColor: '#f7f9fc', borderRadius: 8, padding: 10 }}>
                    <Text style={{ fontSize: 10.5, color: '#94a3b8', textAlign: 'right' }}>{l}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#0f2440', textAlign: 'right' }}>{v || '—'}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>)}
      </ScrollView>
    </SafeAreaView>
  );
}

import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { goBack } from '../src/utils/navigation';
import { useAuth } from '../src/contexts/AuthContext';
import { ReportHero, reportPage } from '../src/components/reports/ReportShell';
import { Tabs } from '../src/components/hr/ui';
import { GeoLocations } from '../src/components/hr/GeoLocations';
import { GeoExemptions, GeoReport } from '../src/components/hr/GeoReport';

/** 📍 مواقع العمل والتحقق الجغرافي لحضور الموظفين */
export default function HrLocations() {
  const { hasPermission, user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canManage = isAdmin || hasPermission('hr_manage_attendance');
  const [tab, setTab] = useState('locations');
  const tabs = [{ key: 'locations', label: 'مواقع العمل' }, { key: 'report', label: 'تقرير مواقع التسجيل' }, { key: 'exemptions', label: 'المستثنون' }];
  return (
    <SafeAreaView style={reportPage.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={reportPage.content}>
        <ReportHero kicker="شؤون الموظفين" title="مواقع العمل والتحقق الجغرافي" subtitle="حدّد المواقع المعتمدة ونصف قطر كل منها؛ يُقبل تسجيل الحضور من التطبيق داخل هذه النطاقات فقط، ويظهر موقع كل تسجيل على الخريطة" onBack={() => goBack()} canExport={false} testID="hr-locations-hero" />
        <Tabs tabs={tabs} value={tab} onChange={setTab} testID="geo-tabs" />
        {tab === 'locations' && <GeoLocations canManage={canManage} />}
        {tab === 'report' && <GeoReport />}
        {tab === 'exemptions' && <GeoExemptions isAdmin={isAdmin} />}
      </ScrollView>
    </SafeAreaView>
  );
}

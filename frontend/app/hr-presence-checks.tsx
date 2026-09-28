import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { goBack } from '../src/utils/navigation';
import { ReportHero, reportPage } from '../src/components/reports/ReportShell';
import { Tabs } from '../src/components/hr/ui';
import { PresenceSettings, PresenceReport } from '../src/components/hr/PresenceChecks';

/** 🔔 الإشعار العشوائي لتأكيد التواجد (بصمة + GPS) */
export default function HrPresenceChecks() {
  const [tab, setTab] = useState('report');
  const tabs = [{ key: 'report', label: 'فحوصات اليوم' }, { key: 'settings', label: 'الإعدادات' }];
  return (
    <SafeAreaView style={reportPage.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={reportPage.content}>
        <ReportHero kicker="شؤون الموظفين" title="تأكيد التواجد العشوائي" subtitle="إشعارات عشوائية أثناء الدوام يؤكدها الموظف بالبصمة/Face ID مع موقعه داخل نطاق العمل — مع إمكانية إرسال فحص فوري" onBack={() => goBack()} canExport={false} testID="hr-presence-hero" />
        <Tabs tabs={tabs} value={tab} onChange={setTab} testID="presence-tabs" />
        {tab === 'report' && <PresenceReport />}
        {tab === 'settings' && <PresenceSettings />}
      </ScrollView>
    </SafeAreaView>
  );
}

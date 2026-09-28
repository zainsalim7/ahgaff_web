import React from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { goBack } from '../src/utils/navigation';
import { ReportHero, reportPage } from '../src/components/reports/ReportShell';
import { WorkGeneralSettings, ShiftsManager, useWorkSettings, Loading } from '../src/components/hr/WorkSettings';

/** ⏰ إعدادات الدوام: الفترات، التكليف، أيام العمل والعطل — صلاحية hr_manage_work_settings */
export default function HrWorkSettings() {
  const { data, setData } = useWorkSettings();
  const merge = (s: any) => setData((p: any) => ({ ...s, can_edit: p?.can_edit }));
  return (
    <SafeAreaView style={reportPage.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={reportPage.content}>
        <ReportHero kicker="شؤون الموظفين" title="إعدادات الدوام والفترات" subtitle="فترات الدوام (صباحي/مسائي…) وأوقاتها وسماحياتها، تكليف الموظفين بالفترات، أيام العمل والعطل الرسمية" onBack={() => goBack()} canExport={false} testID="hr-work-settings-hero" />
        {!data ? <Loading /> : <>
          {!data.can_edit && <div style={{ direction: 'rtl', fontSize: 12.5, color: '#c2410c', marginBottom: 10 }} data-testid="work-readonly-note">اطّلاع فقط — تعديل إعدادات الدوام يحتاج صلاحية «إعدادات الدوام».</div>}
          <ShiftsManager data={data} onSaved={merge} />
          <WorkGeneralSettings data={data} onSaved={merge} />
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}

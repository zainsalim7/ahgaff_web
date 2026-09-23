import React, { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { goBack } from '../src/utils/navigation';
import { hrAPI } from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';
import { ReportHero, reportPage } from '../src/components/reports/ReportShell';
import { Tabs } from '../src/components/hr/ui';
import { AttendanceDaily } from '../src/components/hr/AttendanceDaily';
import { AttendanceMonthly, AttendanceSettings } from '../src/components/hr/AttendanceMonthly';

export default function HrAttendance() {
  const { hasPermission, user } = useAuth();
  const canManage = user?.role === 'admin' || hasPermission('hr_manage_attendance');
  const [tab, setTab] = useState('daily');
  const [meta, setMeta] = useState<any>(null);
  const [units, setUnits] = useState<any[]>([]);
  const [key, setKey] = useState(0);

  useEffect(() => { hrAPI.attMeta().then((r) => setMeta(r.data)).catch(() => {}); hrAPI.orgUnits().then((r) => setUnits(r.data.units || [])).catch(() => {}); }, []);

  const tabs = [{ key: 'daily', label: 'الكشف اليومي' }, { key: 'monthly', label: 'التقرير الشهري' }, ...(canManage ? [{ key: 'settings', label: 'إعدادات الدوام' }] : [])];
  return (
    <SafeAreaView style={reportPage.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={reportPage.content}>
        <ReportHero kicker="شؤون الموظفين" title="الحضور الإداري" subtitle="كشف الحضور اليومي للموظفين، التقرير الشهري، وإعدادات الدوام والعطل" onBack={() => goBack()} canExport={false} testID="hr-attendance-hero" />
        <Tabs tabs={tabs} value={tab} onChange={setTab} testID="hr-att-tabs" />
        {tab === 'daily' && <AttendanceDaily key={`d${key}`} canManage={canManage} units={units} meta={meta} />}
        {tab === 'monthly' && <AttendanceMonthly key={`m${key}`} units={units} meta={meta} />}
        {tab === 'settings' && <AttendanceSettings meta={meta} onSaved={() => setKey((k) => k + 1)} />}
      </ScrollView>
    </SafeAreaView>
  );
}

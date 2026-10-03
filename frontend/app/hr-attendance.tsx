import React, { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { goBack } from '../src/utils/navigation';
import { hrAPI } from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';
import { ReportHero, reportPage } from '../src/components/reports/ReportShell';
import { Tabs } from '../src/components/hr/ui';
import { AttendanceDaily } from '../src/components/hr/AttendanceDaily';
import { AttendanceMonthly } from '../src/components/hr/AttendanceMonthly';
import { AttendanceDetails } from '../src/components/hr/AttendanceDetails';
import { AttendanceDevices } from '../src/components/hr/AttendanceDevices';
import { router } from 'expo-router';
import { btn } from '../src/components/hr/ui';

export default function HrAttendance() {
  const { hasPermission, user } = useAuth();
  const canManage = user?.role === 'admin' || hasPermission('hr_manage_attendance');
  const canWorkSettings = user?.role === 'admin' || hasPermission('hr_manage_work_settings');
  const [tab, setTab] = useState('daily');
  const [meta, setMeta] = useState<any>(null);
  const [units, setUnits] = useState<any[]>([]);
  const [key] = useState(0);

  useEffect(() => { hrAPI.attMeta().then((r) => setMeta(r.data)).catch(() => {}); hrAPI.orgUnits().then((r) => setUnits(r.data.units || [])).catch(() => {}); }, []);

  const tabs = [{ key: 'daily', label: 'الكشف اليومي' }, { key: 'monthly', label: 'التقرير الشهري' }, { key: 'details', label: 'التقرير التفصيلي' }, { key: 'devices', label: '📱 الأجهزة' }];
  return (
    <SafeAreaView style={reportPage.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={reportPage.content}>
        <ReportHero kicker="شؤون الموظفين" title="الحضور الإداري" subtitle="الكشف اليومي، التقرير الشهري، والتقرير التفصيلي (تأخير/انصراف تلقائي/الموقع) مع البحث والتصدير" onBack={() => goBack()} canExport={false} testID="hr-attendance-hero" />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', direction: 'rtl', flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}><Tabs tabs={tabs} value={tab} onChange={setTab} testID="hr-att-tabs" /></div>
          {canWorkSettings && <button onClick={() => router.push('/hr-work-settings' as any)} style={btn('#eef4ff', '#1565c0', { fontSize: 12 })} data-testid="att-goto-work-settings">⏰ إعدادات الدوام والفترات ←</button>}
        </div>
        {tab === 'daily' && <AttendanceDaily key={`d${key}`} canManage={canManage} units={units} meta={meta} />}
        {tab === 'monthly' && <AttendanceMonthly key={`m${key}`} units={units} meta={meta} />}
        {tab === 'details' && <AttendanceDetails key={`x${key}`} units={units} meta={meta} />}
        {tab === 'devices' && <AttendanceDevices key={`d${key}`} canManage={canManage} />}
      </ScrollView>
    </SafeAreaView>
  );
}

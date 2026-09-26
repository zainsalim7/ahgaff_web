import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DASH, dashStyles } from './dashTheme';
import { DashHRKpis } from './DashHRKpis';
import { DashAlerts } from './DashAlerts';
import { DashHRHeadcount } from './DashHRHeadcount';
import { DashHRPeriod } from './DashHRPeriod';
import { DashHR } from './DashHR';

const Card = ({ title, sub, icon, color, bg, testID, children }: { title: string; sub: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string; testID: string; children: React.ReactNode }) => (
  <View style={[dashStyles.card, { marginBottom: 16 }]} testID={testID}>
    <View style={dashStyles.sectionHead}>
      <View style={dashStyles.sectionTitleRow}>
        <View style={[dashStyles.iconBox, { backgroundColor: bg }]}><Ionicons name={icon} size={17} color={color} /></View>
        <View>
          <Text style={dashStyles.sectionTitle}>{title}</Text>
          <Text style={dashStyles.sectionSub}>{sub}</Text>
        </View>
      </View>
    </View>
    {children}
  </View>
);

/** 🏢 عرض «شؤون الموظفين» الكامل للوحة القيادة */
export const HRDashboardView = ({ data, compact, width }: { data: any; compact: boolean; width: number }) => {
  const h = data.hr;
  const scope = h.scope?.label || 'كل الوحدات التنظيمية';
  return (
    <View testID="hr-dashboard-view">
      <DashHRKpis h={h} periodLabel={data.period_label} compact={compact} />
      {data.sections?.alerts !== false && <DashAlerts alerts={h.alerts || []} title="التنبيهات الإدارية" />}
      {h.headcount && (
        <Card title="الأعداد والهيكل التنظيمي" sub={`${scope} · ${h.headcount.total_active} موظف على رأس العمل`} icon="people-circle" color="#6d28d9" bg="#ede9fe" testID="dash-hr-headcount-card">
          <DashHRHeadcount hc={h.headcount} />
        </Card>
      )}
      {h.period && (
        <Card title={`الدوام والإجازات والمهام — ${data.period_label}`} sub={`${scope} · ${h.period.work_days} يوم عمل`} icon="stats-chart" color={DASH.blue} bg="#dbeafe" testID="dash-hr-period-card">
          <DashHRPeriod p={h.period} periodLabel={data.period_label} width={width} />
        </Card>
      )}
      <DashHR h={h} />
    </View>
  );
};

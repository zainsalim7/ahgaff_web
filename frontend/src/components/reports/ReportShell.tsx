import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import api from '../../services/api';
import { exportName, filenameFromResponse } from '../../utils/exportName';
import { DASH, NUM_FONT, dashStyles } from '../dashboard/dashTheme';

/** 📥 تنزيل ملف من مسار API (ويب: تنزيل مباشر، جوال: مشاركة) */
export const downloadReport = async (url: string, params: any, fallbackParts: (string | undefined)[], ext: 'pdf' | 'xlsx') => {
  try {
    const res = await api.get(url, { params, responseType: 'blob' });
    const name = filenameFromResponse(res, exportName(fallbackParts, ext));
    if (Platform.OS === 'web') {
      const href = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = href; a.download = name; a.click(); window.URL.revokeObjectURL(href);
    } else {
      const path = `${FileSystem.documentDirectory}${name}`;
      const reader = new FileReader();
      reader.onloadend = async () => {
        await FileSystem.writeAsStringAsync(path, (reader.result as string).split(',')[1], { encoding: FileSystem.EncodingType.Base64 });
        await Sharing.shareAsync(path);
      };
      reader.readAsDataURL(new Blob([res.data]));
    }
  } catch (e: any) {
    Alert.alert('خطأ', e?.response?.data?.detail || 'تعذر التصدير');
  }
};

interface HeroProps {
  title: string; subtitle?: string; kicker?: string; onBack?: () => void;
  onPdf?: () => void; onExcel?: () => void; exporting?: '' | 'pdf' | 'excel' | boolean; canExport?: boolean; extra?: React.ReactNode; testID?: string;
}

/** 🟦 رأس التقرير الموحّد (كحلي + ذهبي) مع أزرار التصدير */
export const ReportHero = ({ title, subtitle, kicker = 'التقارير', onBack, onPdf, onExcel, exporting, canExport = true, extra, testID }: HeroProps) => (
  <View style={styles.hero} testID={testID || 'report-hero'}>
    <View style={{ flex: 1, minWidth: 200 }}>
      <Text style={styles.kicker}>{kicker}</Text>
      <Text style={styles.title}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
    <View style={styles.actions}>
      {!!onBack && <TouchableOpacity style={styles.iconBtn} onPress={onBack} testID="report-back-btn" accessibilityLabel="رجوع"><Ionicons name="arrow-forward" size={18} color="#fff" /></TouchableOpacity>}
      {extra}
      {canExport && !!onPdf && (
        <TouchableOpacity style={[styles.actBtn, { backgroundColor: '#b91c1c' }]} onPress={onPdf} disabled={!!exporting} testID="report-export-pdf-btn">
          {exporting === 'pdf' ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="document-text" size={15} color="#fff" />}<Text style={styles.actText}>PDF</Text>
        </TouchableOpacity>
      )}
      {canExport && !!onExcel && (
        <TouchableOpacity style={[styles.actBtn, { backgroundColor: '#15803d' }]} onPress={onExcel} disabled={!!exporting} testID="report-export-excel-btn">
          {exporting === 'excel' || exporting === true ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="grid" size={15} color="#fff" />}<Text style={styles.actText}>Excel</Text>
        </TouchableOpacity>
      )}
    </View>
  </View>
);

export interface Kpi { label: string; value: string | number; color?: string; sub?: string; icon?: keyof typeof Ionicons.glyphMap }

/** 🔢 بطاقات المؤشرات */
export const ReportKpis = ({ items, testID }: { items: Kpi[]; testID?: string }) => (
  <View style={styles.kpis} testID={testID || 'report-kpis'}>
    {items.map((k) => (
      <View key={k.label} style={[dashStyles.card, styles.kpi]}>
        <View style={[styles.kpiBar, { backgroundColor: k.color || DASH.blue }]} />
        <View style={styles.kpiTop}>
          {!!k.icon && <Ionicons name={k.icon} size={15} color={k.color || DASH.blue} />}
          <Text style={styles.kpiLbl}>{k.label}</Text>
        </View>
        <Text style={[styles.kpiVal, NUM_FONT, { color: k.color || DASH.blue }]}>{k.value}</Text>
        {!!k.sub && <Text style={styles.kpiSub} numberOfLines={1}>{k.sub}</Text>}
      </View>
    ))}
  </View>
);

/** 🧰 بطاقة الفلاتر + زر التنفيذ */
export const ReportFilters = ({ children, onRun, running, hasRun, runLabel, disabled, testID }: { children?: React.ReactNode; onRun?: () => void; running?: boolean; hasRun?: boolean; runLabel?: string; disabled?: boolean; testID?: string }) => (
  <View style={[dashStyles.card, styles.filters]} testID={testID || 'report-filters'}>
    <View style={styles.filterBody}>{children}</View>
    {!!onRun && (
      <TouchableOpacity style={[styles.runBtn, (running || disabled) && { opacity: 0.6, backgroundColor: disabled && !running ? '#94a3b8' : DASH.blue }]} onPress={onRun} disabled={running || disabled} testID="run-report-btn">
        {running ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="play" size={14} color="#fff" />}
        <Text style={styles.runText}>{running ? 'جاري التنفيذ…' : runLabel || (hasRun ? 'إعادة التنفيذ' : 'تنفيذ التقرير')}</Text>
      </TouchableOpacity>
    )}
  </View>
);

/** 📭 حالة فارغة */
export const ReportEmpty = ({ text, icon = 'document-text-outline' }: { text: string; icon?: keyof typeof Ionicons.glyphMap }) => (
  <View style={[dashStyles.card, dashStyles.empty, { marginTop: 4 }]}><Ionicons name={icon} size={40} color="#cbd5e1" /><Text style={dashStyles.emptyText}>{text}</Text></View>
);

export const reportPage = StyleSheet.create({
  container: { flex: 1, backgroundColor: DASH.bg },
  content: { padding: 16, paddingBottom: 40, maxWidth: 1400, width: '100%', alignSelf: 'center' },
  card: { ...dashStyles.card, marginBottom: 12 },
  pickerBox: { borderWidth: 1, borderColor: DASH.line, borderRadius: 10, backgroundColor: '#fff', overflow: 'hidden', minWidth: 200, flex: 1 },
  picker: { height: 40, borderWidth: 0, backgroundColor: 'transparent', fontSize: 13, textAlign: 'right' } as any,
  label: { fontSize: 12, fontWeight: '700', color: DASH.muted, textAlign: 'right', marginBottom: 4 },
});

const styles = StyleSheet.create({
  hero: { backgroundColor: DASH.navy, borderRadius: 18, padding: 18, flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' },
  kicker: { color: DASH.gold, fontSize: 11, fontWeight: '800', textAlign: 'right', letterSpacing: 1 },
  title: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'right', marginTop: 2 },
  subtitle: { color: '#cbd5e1', fontSize: 11.5, textAlign: 'right', marginTop: 4 },
  actions: { flexDirection: 'row-reverse', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  iconBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  actBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10 },
  actText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  kpis: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  kpi: { flexGrow: 1, flexBasis: 160, overflow: 'hidden', paddingTop: 14 },
  kpiBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  kpiTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  kpiLbl: { fontSize: 12, color: DASH.muted, fontWeight: '700', textAlign: 'right' },
  kpiVal: { fontSize: 24, fontWeight: '800', textAlign: 'right', marginTop: 4 },
  kpiSub: { fontSize: 11, color: '#94a3b8', textAlign: 'right', marginTop: 2 },
  filters: { marginBottom: 14 },
  filterBody: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' },
  runBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: DASH.blue, paddingVertical: 11, borderRadius: 10, marginTop: 12 },
  runText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});

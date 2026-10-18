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

export interface Kpi { label: string; value: string | number; color?: string; sub?: string; icon?: keyof typeof Ionicons.glyphMap; onPress?: () => void; active?: boolean; testID?: string }

/** 🔢 المؤشرات كرقائق صغيرة (مضغوطة) — القابلة للنقر تعمل كفلاتر */
export const ReportKpis = ({ items, testID }: { items: Kpi[]; testID?: string }) => (
  <View style={styles.kpis} testID={testID || 'report-kpis'}>
    {items.map((k) => {
      const Wrap: any = k.onPress ? TouchableOpacity : View;
      const color = k.color || DASH.blue;
      return (
        <Wrap key={k.label} onPress={k.onPress} activeOpacity={0.75} testID={k.testID} accessibilityRole={k.onPress ? 'button' : undefined}
          style={[styles.kpi, { borderColor: color }, k.active && { backgroundColor: color }, k.onPress && { cursor: 'pointer' } as any]}>
          {!!k.icon && <Ionicons name={k.icon} size={13} color={k.active ? '#fff' : color} />}
          <Text style={[styles.kpiLbl, k.active && { color: '#fff' }]}>{k.label}</Text>
          <Text style={[styles.kpiVal, NUM_FONT, { color: k.active ? '#fff' : color }]}>{k.value}</Text>
          {!!k.sub && <Text style={[styles.kpiSub, k.active && { color: 'rgba(255,255,255,0.85)' }]} numberOfLines={1}>· {k.sub}</Text>}
          {k.active && <Ionicons name="funnel" size={11} color="#fff" />}
        </Wrap>
      );
    })}
  </View>
);

/** 🧰 بطاقة الفلاتر المضغوطة: الحقول وزر التنفيذ في صف واحد */
export const ReportFilters = ({ children, onRun, running, hasRun, runLabel, disabled, testID, below }: { children?: React.ReactNode; onRun?: () => void; running?: boolean; hasRun?: boolean; runLabel?: string; disabled?: boolean; testID?: string; below?: React.ReactNode }) => (
  <View style={[dashStyles.card, styles.filters]} testID={testID || 'report-filters'}>
    <View style={styles.filterBody}>
      {children}
      {!!onRun && (
        <TouchableOpacity style={[styles.runBtn, (running || disabled) && { opacity: 0.6, backgroundColor: disabled && !running ? '#94a3b8' : DASH.blue }]} onPress={onRun} disabled={running || disabled} testID="run-report-btn">
          {running ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="play" size={13} color="#fff" />}
          <Text style={styles.runText}>{running ? 'جاري التنفيذ…' : runLabel || (hasRun ? 'إعادة التنفيذ' : 'تنفيذ التقرير')}</Text>
        </TouchableOpacity>
      )}
    </View>
    {below}
  </View>
);

/** 📊 جدول كثيف (ويب) بعرض البطاقة — rows: مصفوفة خلايا؛ صف قابل للتوسيع عبر expand(rowIndex) */
export const DenseTable = ({ head, rows, keys, align, expand, onRowClick, footer, testID, rowTestID, emptyText }: {
  head: (string | React.ReactNode)[]; rows: React.ReactNode[][]; keys?: string[]; align?: ('right' | 'center' | 'left')[];
  expand?: (i: number) => React.ReactNode; onRowClick?: (i: number) => void; footer?: React.ReactNode; testID?: string; rowTestID?: (i: number) => string; emptyText?: string;
}) => (
  <View style={[dashStyles.card, { padding: 0, overflow: 'hidden', marginBottom: 12 }]} testID={testID || 'report-table-card'}>
    <div style={{ direction: 'rtl', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid={testID ? `${testID}-table` : 'report-table'}>
        <thead><tr>{head.map((h, i) => <th key={i} style={{ ...tableStyles.th, textAlign: align?.[i] || 'right' }}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const ex = expand?.(i);
            return (
              <React.Fragment key={keys?.[i] ?? i}>
                <tr onClick={onRowClick ? () => onRowClick(i) : undefined} style={{ cursor: onRowClick ? 'pointer' : undefined, background: ex ? '#f8fafc' : undefined }} data-testid={rowTestID?.(i)}>
                  {r.map((c, j) => <td key={j} style={{ ...tableStyles.td, textAlign: align?.[j] || 'right' }}>{c}</td>)}
                </tr>
                {ex ? <tr><td colSpan={head.length} style={tableStyles.expand}>{ex}</td></tr> : null}
              </React.Fragment>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={head.length} style={{ ...tableStyles.td, textAlign: 'center', color: '#94a3b8', padding: 20 }}>{emptyText || 'لا توجد بيانات'}</td></tr>}
        </tbody>
      </table>
    </div>
    {footer ? <Text style={tableStyles.foot}>{footer}</Text> : null}
  </View>
);

/** 🎨 شارة ملوّنة صغيرة + شريط نسبة للجداول */
export const Pill = ({ color, children, testID }: { color: string; children: React.ReactNode; testID?: string }) => (
  <span data-testid={testID} style={{ background: `${color}18`, color, fontWeight: 800, padding: '2px 8px', borderRadius: 6, fontSize: 11.5, whiteSpace: 'nowrap' }}>{children}</span>
);
export const Bar = ({ pct, color, label }: { pct: number; color: string; label?: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 110 }}>
    <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: 6, background: color }} /></div>
    <span style={{ fontSize: 11.5, color, fontWeight: 700, minWidth: 34, textAlign: 'left' }}>{label ?? `${Math.round(pct)}%`}</span>
  </div>
);
export const rateColor = (r: number, good = 90, ok = 75) => (r >= good ? DASH.green : r >= ok ? DASH.orange : DASH.red);
export const tableStyles = {
  th: { padding: '7px 8px', fontSize: 12, fontWeight: 800, color: '#0f2440', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' } as React.CSSProperties,
  td: { padding: '6px 8px', fontSize: 12.5, borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' } as React.CSSProperties,
  expand: { padding: '4px 24px 10px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0' } as React.CSSProperties,
  foot: { fontSize: 11, color: '#94a3b8', textAlign: 'right' as const, padding: 8 },
};

/** 📭 حالة فارغة */
export const ReportEmpty = ({ text, icon = 'document-text-outline' }: { text: string; icon?: keyof typeof Ionicons.glyphMap }) => (
  <View style={[dashStyles.card, dashStyles.empty, { marginTop: 4 }]}><Ionicons name={icon} size={40} color="#cbd5e1" /><Text style={dashStyles.emptyText}>{text}</Text></View>
);

export const reportPage = StyleSheet.create({
  container: { flex: 1, backgroundColor: DASH.bg },
  content: { padding: 16, paddingBottom: 40, maxWidth: 1400, width: '100%', alignSelf: 'center' },
  card: { ...dashStyles.card, marginBottom: 12 },
  pickerBox: { borderWidth: 1, borderColor: DASH.line, borderRadius: 8, backgroundColor: '#fff', overflow: 'hidden', minWidth: 180, flex: 1 },
  picker: { height: 36, borderWidth: 0, backgroundColor: 'transparent', fontSize: 13, textAlign: 'right' } as any,
  label: { fontSize: 11.5, fontWeight: '700', color: DASH.muted, textAlign: 'right', marginBottom: 3 },
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
  kpis: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  kpi: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1.5, backgroundColor: '#fff' },
  kpiLbl: { fontSize: 12, color: DASH.muted, fontWeight: '600' },
  kpiVal: { fontSize: 15, fontWeight: '800' },
  kpiSub: { fontSize: 11, color: '#94a3b8' },
  filters: { marginBottom: 10, padding: 10 },
  filterBody: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' },
  runBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: DASH.blue, paddingVertical: 9, paddingHorizontal: 16, borderRadius: 8 },
  runText: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
});

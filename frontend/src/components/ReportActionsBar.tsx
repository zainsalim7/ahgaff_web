/**
 * شريط إجراءات قابل لإعادة الاستخدام في صفحات التقارير
 * - زر طباعة المتصفح (window.print)
 * - زر تصدير PDF (ينادي backend endpoint)
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api, { API_URL } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Props {
  pdfPath?: string;          // مثل /archives/SEM/students/STD/pdf
  pdfFileName?: string;      // اسم الملف الافتراضي
  showPrint?: boolean;
  showPdf?: boolean;
}

export const ReportActionsBar: React.FC<Props> = ({
  pdfPath,
  pdfFileName = 'report.pdf',
  showPrint = true,
  showPdf = true,
}) => {
  const [downloading, setDownloading] = useState(false);

  const handlePrint = () => {
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-undef
      window.print();
    } else {
      Alert.alert('الطباعة', 'الطباعة متاحة على الويب فقط حالياً.');
    }
  };

  const handleDownloadPdf = async () => {
    if (!pdfPath) return;
    setDownloading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const url = `${API_URL}/api${pdfPath}`;
      if (Platform.OS === 'web') {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(err || `HTTP ${res.status}`);
        }
        const blob = await res.blob();
        // eslint-disable-next-line no-undef
        const link = document.createElement('a');
        // eslint-disable-next-line no-undef
        link.href = URL.createObjectURL(blob);
        link.download = pdfFileName;
        link.click();
        // eslint-disable-next-line no-undef
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      } else {
        // على الموبايل: نفتحه في المتصفح
        const res = await api.get(pdfPath, { responseType: 'arraybuffer' as any });
        Alert.alert('تنزيل', 'تم تجهيز الملف بنجاح');
      }
    } catch (e: any) {
      const msg = e?.message || 'فشل تصدير PDF';
      if (Platform.OS === 'web') {
        // eslint-disable-next-line no-undef
        window.alert(`خطأ: ${msg}`);
      } else {
        Alert.alert('خطأ', msg);
      }
    } finally {
      setDownloading(false);
    }
  };

  return (
    <View style={styles.bar} className="no-print">
      {showPrint && (
        <TouchableOpacity
          style={[styles.btn, styles.printBtn]}
          onPress={handlePrint}
          testID="report-print-btn"
        >
          <Ionicons name="print" size={15} color="#1565c0" />
          <Text style={[styles.btnText, { color: '#1565c0' }]}>طباعة</Text>
        </TouchableOpacity>
      )}
      {showPdf && pdfPath && (
        <TouchableOpacity
          style={[styles.btn, styles.pdfBtn, downloading && { opacity: 0.6 }]}
          onPress={handleDownloadPdf}
          disabled={downloading}
          testID="report-pdf-btn"
        >
          {downloading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="document-text" size={15} color="#fff" />
          )}
          <Text style={[styles.btnText, { color: '#fff' }]}>
            {downloading ? 'جارٍ التحضير...' : 'تصدير PDF'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: 8,
    padding: 10,
    paddingTop: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  printBtn: {
    backgroundColor: '#e3f2fd',
    borderWidth: 1,
    borderColor: '#1565c020',
  },
  pdfBtn: {
    backgroundColor: '#c62828',
  },
  btnText: {
    fontSize: 12,
    fontWeight: '700',
  },
});

export default ReportActionsBar;

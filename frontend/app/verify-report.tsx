/**
 * صفحة التحقق من توقيع تقرير - عامة، تُفتح من مسح QR في PDF
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, Stack } from 'expo-router';
import { API_URL } from '../src/services/api';

export default function VerifyReportScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const initialId = params.id || '';
  const [docId, setDocId] = useState(initialId);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const check = useCallback(async (id: string) => {
    if (!id || id.length < 4) {
      setData({ valid: false, message: 'الرجاء إدخال معرّف صحيح' });
      setSearched(true);
      return;
    }
    setLoading(true);
    try {
      // eslint-disable-next-line no-undef
      const res = await fetch(`${API_URL}/api/verify-report/${encodeURIComponent(id)}`);
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setData({ valid: false, message: 'فشل الاتصال بالخادم' });
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }, []);

  useEffect(() => {
    if (initialId) check(initialId);
  }, [initialId, check]);

  const formatDate = (iso?: string) => {
    if (!iso) return '-';
    try {
      return new Date(iso).toLocaleString('ar-EG', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  };

  const roleLabel = (r?: string) => ({
    admin: 'مدير النظام',
    dean: 'عميد',
    department_head: 'رئيس قسم',
    registrar: 'مسجل',
    registration_manager: 'مدير تسجيل',
  }[r || ''] || r || '-');

  return (
    <>
      <Stack.Screen options={{ title: 'التحقق من تقرير', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <View style={styles.headerCard}>
            <Ionicons name="shield-checkmark" size={48} color="#6a1b9a" />
            <Text style={styles.headerTitle}>التحقق من صحة تقرير</Text>
            <Text style={styles.headerSubtitle}>
              نظام إدارة الحضور - جامعة الأحقاف
            </Text>
          </View>

          <View style={styles.searchBox}>
            <Text style={styles.label}>أدخل معرّف التقرير (Doc ID):</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={docId}
                onChangeText={setDocId}
                placeholder="مثال: 0783E3EE010F41F1"
                autoCapitalize="characters"
                testID="verify-doc-id-input"
              />
              <TouchableOpacity
                style={styles.btn}
                onPress={() => check(docId.trim())}
                disabled={loading}
                testID="verify-btn"
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.btnText}>تحقق</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {searched && data && (
            <View style={[styles.resultCard, data.valid ? styles.resultValid : styles.resultInvalid]}>
              <View style={styles.resultHeader}>
                <Ionicons
                  name={data.valid ? 'checkmark-circle' : 'close-circle'}
                  size={36}
                  color={data.valid ? '#2e7d32' : '#c62828'}
                />
                <Text style={[styles.resultTitle, { color: data.valid ? '#2e7d32' : '#c62828' }]}>
                  {data.valid ? 'تقرير موثَّق ومعتمد' : 'تقرير غير معتمد'}
                </Text>
              </View>
              <Text style={styles.resultMessage}>{data.message}</Text>

              {data.valid && (
                <View style={styles.details}>
                  <DetailRow label="نوع التقرير" value={data.report_type_label} />
                  <DetailRow label="معرّف التقرير" value={data.doc_id} mono />
                  <DetailRow label="Hash التحقق" value={data.hash} mono />
                  <DetailRow label="أُنشئ بواسطة" value={data.signed_by_name} />
                  <DetailRow label="الصفة" value={roleLabel(data.signed_by_role)} />
                  <DetailRow label="تاريخ الإنشاء" value={formatDate(data.signed_at)} />
                </View>
              )}
            </View>
          )}

          <Text style={styles.footer}>
            هذه الصفحة عامة. يمكنك التحقق من أي تقرير PDF أُنشئ من نظام جامعة الأحقاف
            بإدخال معرّف التقرير أو مسح رمز QR في أسفل التقرير.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const DetailRow = ({ label, value, mono }: any) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={[styles.detailValue, mono && { fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }]}>
      {value || '-'}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f7' },
  headerCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 22, alignItems: 'center',
    marginBottom: 14,
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#222', marginTop: 8 },
  headerSubtitle: { fontSize: 12, color: '#666', marginTop: 4 },
  searchBox: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 14,
  },
  label: { fontSize: 13, color: '#555', marginBottom: 8, textAlign: 'right' },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1, borderWidth: 1, borderColor: '#e0e0e0',
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8,
    fontSize: 14, textAlign: 'center',
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    outlineWidth: 0 as any,
  },
  btn: {
    backgroundColor: '#6a1b9a', paddingHorizontal: 20,
    justifyContent: 'center', borderRadius: 8,
  },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  resultCard: {
    borderRadius: 12, padding: 16, marginBottom: 14, borderWidth: 1,
  },
  resultValid: { backgroundColor: '#e8f5e9', borderColor: '#2e7d3240' },
  resultInvalid: { backgroundColor: '#ffebee', borderColor: '#c6282840' },
  resultHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10,
  },
  resultTitle: { fontSize: 16, fontWeight: '800' },
  resultMessage: { fontSize: 13, color: '#444', lineHeight: 20, marginBottom: 10 },
  details: { backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 8, padding: 10 },
  detailRow: {
    flexDirection: 'row', paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  detailLabel: { width: 110, fontSize: 12, color: '#666' },
  detailValue: { flex: 1, fontSize: 13, color: '#222', fontWeight: '600', textAlign: 'left' },
  footer: {
    fontSize: 11, color: '#888', textAlign: 'center', lineHeight: 18, marginTop: 10,
  },
});

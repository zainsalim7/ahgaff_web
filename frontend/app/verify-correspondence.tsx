import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

// صفحة تحقق عامة من مراسلة رسمية صادرة — بدون تسجيل دخول، بيانات محدودة فقط
export default function VerifyCorrespondencePage() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<any>(null);
  const base = process.env.EXPO_PUBLIC_BACKEND_URL || (typeof window !== 'undefined' ? window.location.origin : '');

  useEffect(() => {
    const run = async () => {
      try { setResult((await axios.get(`${base}/api/correspondence/public/verify/${token}`)).data); }
      catch { setResult({ valid: false, message: 'تعذر الاتصال بخادم التحقق — حاول مجدداً' }); }
      finally { setLoading(false); }
    };
    if (token) run(); else { setResult({ valid: false, message: 'رمز تحقق مفقود' }); setLoading(false); }
  }, [token]);

  const ok = !!result?.valid;
  const rows = result?.official_number ? [['الرقم الرسمي', result.official_number], ['نوع الوثيقة', result.document_type], ['الجهة المُصدِرة', result.organization], ['الموضوع', result.subject], ['تاريخ الإصدار', result.issued_at], ['التاريخ الهجري', result.issued_at_hijri], ['الحالة', ok ? 'سارية' : result.status === 'CANCELLED' ? 'مُلغاة' : result.status], ['بصمة الملف (SHA-256)', result.pdf_sha256 ? `${result.pdf_sha256.slice(0, 16)}…${result.pdf_sha256.slice(-8)}` : null]].filter(([, v]) => v) : [];
  return (
    <View style={{ flex: 1, backgroundColor: '#f4f6fa', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480, alignItems: 'center' }} testID="verify-corr-card">
        <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a2540', marginBottom: 4 }}>جامعة الأحقاف</Text>
        <Text style={{ fontSize: 12, color: '#8a95a8', marginBottom: 18 }}>التحقق من صحة مراسلة رسمية صادرة</Text>
        {loading ? <ActivityIndicator size="large" color="#1565c0" /> : (<>
          <Ionicons name={ok ? 'shield-checkmark' : 'close-circle'} size={56} color={ok ? '#2e7d32' : '#c62828'} />
          <Text style={{ fontSize: 15, fontWeight: '800', color: ok ? '#2e7d32' : '#c62828', marginTop: 10, textAlign: 'center' }} testID={ok ? 'verify-valid' : 'verify-invalid'}>{result?.message}</Text>
          {rows.length > 0 && (
            <View style={{ marginTop: 16, width: '100%', backgroundColor: '#f8faf9', borderRadius: 10, padding: 14, gap: 8 }} testID="verify-corr-rows">
              {rows.map(([k, v]) => <View key={k as string} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', gap: 10 }}><Text style={{ fontSize: 12.5, color: '#5b6678', fontWeight: '700' }}>{k}</Text><Text style={{ fontSize: 12.5, color: '#1a2540', flex: 1, textAlign: 'left' }} selectable>{String(v ?? '—')}</Text></View>)}
            </View>
          )}
          <Text style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 14, textAlign: 'center' }}>تُعرض بيانات التعريف فقط ولا يُكشف محتوى الوثيقة أو بيانات الأشخاص. قارن بصمة الملف مع الوثيقة التي بين يديك.</Text>
          {!!result?.verified_at && <Text style={{ fontSize: 10, color: '#b0b8c4', marginTop: 4 }}>وقت التحقق: {new Date(result.verified_at).toLocaleString('ar-EG')}</Text>}
        </>)}
      </View>
    </View>
  );
}

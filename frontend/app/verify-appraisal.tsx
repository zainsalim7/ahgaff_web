import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

// صفحة تحقق عامة من وثيقة تقييم سنوي — بدون تسجيل دخول
export default function VerifyAppraisalPage() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const base = process.env.EXPO_PUBLIC_BACKEND_URL || (typeof window !== 'undefined' ? window.location.origin : '');
        setResult((await axios.get(`${base}/api/hr/verify/appraisal/${token}`)).data);
      } catch { setResult({ valid: false, message: 'تعذر الاتصال بخادم التحقق — حاول مجدداً' }); }
      finally { setLoading(false); }
    };
    if (token) run(); else { setResult({ valid: false, message: 'رمز تحقق مفقود' }); setLoading(false); }
  }, [token]);

  const rows = result?.valid ? [['رقم التحقق', result.reference], ['الموظف', result.employee_name], ['الرقم الوظيفي', result.employee_no], ['المسمى', result.job_title], ['سنة التقييم', result.year], ['النتيجة', `${result.total_score} / 100`], ['التقدير', result.grade], ['المقيّم', result.evaluator_name], ['اعتماد شؤون الموظفين', result.approved_by], ['تاريخ الاعتماد', result.approved_at]] : [];
  return (
    <View style={{ flex: 1, backgroundColor: '#f4f6fa', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 460, alignItems: 'center' }} testID="verify-appraisal-card">
        <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a2540', marginBottom: 4 }}>جامعة الأحقاف</Text>
        <Text style={{ fontSize: 12, color: '#8a95a8', marginBottom: 18 }}>التحقق من وثيقة تقييم سنوي — شؤون الموظفين</Text>
        {loading ? <ActivityIndicator size="large" color="#1565c0" /> : result?.valid ? (<>
          <Ionicons name="shield-checkmark" size={56} color="#2e7d32" />
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#2e7d32', marginTop: 10, textAlign: 'center' }} testID="verify-valid">{result.message}</Text>
          <View style={{ marginTop: 16, width: '100%', backgroundColor: '#f8faf9', borderRadius: 10, padding: 14, gap: 8 }}>
            {rows.map(([k, v]) => <View key={k as string} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}><Text style={{ fontSize: 12.5, color: '#5b6678', fontWeight: '700' }}>{k}</Text><Text style={{ fontSize: 12.5, color: '#1a2540' }}>{String(v ?? '—')}</Text></View>)}
          </View>
        </>) : (<>
          <Ionicons name="close-circle" size={56} color="#c62828" />
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#c62828', marginTop: 10, textAlign: 'center' }} testID="verify-invalid">{result?.message}</Text>
        </>)}
      </View>
    </View>
  );
}

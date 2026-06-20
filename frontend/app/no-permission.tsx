/**
 * صفحة "ليس لديك صلاحية" — تعرض رسالة واضحة للمستخدم
 * يُوجَّه إليها تلقائياً عند تلقي 403 من خادم الـ API لأول طلب على الصفحة.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function NoPermissionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string; reason?: string }>();

  const fromPage = typeof params.from === 'string' ? params.from : '';
  const customReason = typeof params.reason === 'string' ? params.reason : '';

  return (
    <SafeAreaView style={s.container} testID="no-permission-screen">
      <ScrollView contentContainerStyle={s.scroll}>
        {/* أيقونة كبيرة */}
        <View style={s.iconRing}>
          <View style={s.iconRing2}>
            <Ionicons name="lock-closed" size={48} color="#dc2626" />
          </View>
        </View>

        {/* رسالة رئيسية */}
        <Text style={s.title}>ليس لديك صلاحية</Text>
        <Text style={s.subtitle}>
          {customReason || 'حسابك لا يملك الصلاحيات اللازمة للوصول إلى هذه الصفحة.'}
        </Text>

        {/* بطاقة الإجراءات المقترحة */}
        <View style={s.actionsCard}>
          <Text style={s.actionsTitle}>ما الذي يمكنك فعله؟</Text>

          <View style={s.actionRow}>
            <View style={s.actionDot}>
              <Text style={s.actionDotText}>1</Text>
            </View>
            <Text style={s.actionText}>
              تأكّد من أنك مسجّل دخول بالحساب الصحيح المُخوَّل بهذه العملية.
            </Text>
          </View>

          <View style={s.actionRow}>
            <View style={s.actionDot}>
              <Text style={s.actionDotText}>2</Text>
            </View>
            <Text style={s.actionText}>
              تواصل مع مدير النظام لطلب إضافة الصلاحية المطلوبة إلى دورك.
            </Text>
          </View>

          <View style={s.actionRow}>
            <View style={s.actionDot}>
              <Text style={s.actionDotText}>3</Text>
            </View>
            <Text style={s.actionText}>
              راجع <Text style={s.inlineLink} onPress={() => router.push('/help' as any)}>دليل المنصة</Text> لمعرفة الصلاحيات المرتبطة بدورك.
            </Text>
          </View>
        </View>

        {/* أزرار التنقّل */}
        <View style={s.btnRow}>
          <TouchableOpacity
            style={[s.btn, s.btnPrimary]}
            onPress={() => router.replace('/(tabs)' as any)}
            testID="no-perm-go-home"
          >
            <Ionicons name="home" size={16} color="#fff" />
            <Text style={s.btnPrimaryText}>الذهاب للرئيسية</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.btn, s.btnSecondary]}
            onPress={() => router.back()}
            testID="no-perm-go-back"
          >
            <Ionicons name="arrow-forward" size={16} color="#3f4b5c" />
            <Text style={s.btnSecondaryText}>رجوع</Text>
          </TouchableOpacity>
        </View>

        {/* معلومات تشخيصية في الأسفل (لو مرّرنا from) */}
        {!!fromPage && (
          <View style={s.diagBox}>
            <Ionicons name="information-circle-outline" size={14} color="#8a95a8" />
            <Text style={s.diagText}>الصفحة المطلوبة: {fromPage}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f8fb' },
  scroll: { padding: 24, paddingTop: 48, alignItems: 'center', maxWidth: 560, alignSelf: 'center', width: '100%' as any },
  iconRing: {
    width: 140, height: 140, borderRadius: 70, backgroundColor: '#fef2f2',
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  iconRing2: {
    width: 108, height: 108, borderRadius: 54, backgroundColor: '#fee2e2',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 26, fontWeight: '800', color: '#1f2a37', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#5b6678', textAlign: 'center', lineHeight: 24, marginBottom: 24, paddingHorizontal: 16 },
  actionsCard: {
    width: '100%' as any,
    backgroundColor: '#fff', borderRadius: 12, padding: 18,
    borderWidth: 1, borderColor: '#e8edf3', marginBottom: 18,
  },
  actionsTitle: { fontSize: 15, fontWeight: '700', color: '#1f2a37', textAlign: 'right', marginBottom: 12 },
  actionRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  actionDot: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#dbeafe',
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  actionDotText: { fontSize: 12, color: '#1565c0', fontWeight: '800' },
  actionText: { flex: 1, fontSize: 14, color: '#374151', textAlign: 'right', lineHeight: 24 },
  inlineLink: { color: '#2962ff', fontWeight: '700', textDecorationLine: 'underline' },
  btnRow: { flexDirection: 'row-reverse', gap: 10, width: '100%' as any },
  btn: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10 },
  btnPrimary: { backgroundColor: '#2962ff' },
  btnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  btnSecondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e7ee' },
  btnSecondaryText: { color: '#3f4b5c', fontSize: 14, fontWeight: '700' },
  diagBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginTop: 18, opacity: 0.7 },
  diagText: { fontSize: 11, color: '#8a95a8' },
});

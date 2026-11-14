import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';

type Category = 'academic' | 'administrative' | 'reports' | 'system';

interface DemoItem {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  category: Category;
  count?: string;
  subtitle: string;
}

const CATEGORY_COLORS: Record<Category, { bg: string; text: string; border: string; label: string }> = {
  academic: { bg: '#EFF6FF', text: '#2563EB', border: '#BFDBFE', label: 'أكاديمي' },
  administrative: { bg: '#ECFDF5', text: '#059669', border: '#A7F3D0', label: 'إداري' },
  reports: { bg: '#F5F3FF', text: '#7C3AED', border: '#DDD6FE', label: 'تقارير' },
  system: { bg: '#FFF7ED', text: '#EA580C', border: '#FED7AA', label: 'نظام' },
};

const DEMO_ITEMS: DemoItem[] = [
  { id: 'courses', label: 'المقررات', icon: 'book', category: 'academic', count: '42', subtitle: 'مقرر دراسي' },
  { id: 'students', label: 'الطلاب', icon: 'people', category: 'academic', count: '1,280', subtitle: 'طالب مسجَّل' },
  { id: 'teachers', label: 'المعلمون', icon: 'person', category: 'academic', count: '65', subtitle: 'عضو هيئة تدريس' },
  { id: 'plan', label: 'الخطة الدراسية', icon: 'clipboard', category: 'academic', count: '12', subtitle: 'خطة معتمَدة' },
  { id: 'swaps', label: 'تبادل المحاضرات', icon: 'swap-horizontal', category: 'administrative', count: '8', subtitle: 'طلب هذا الأسبوع' },
  { id: 'excuses', label: 'أعذار الطلاب', icon: 'document-attach', category: 'administrative', count: '23', subtitle: 'عذر قيد المراجعة' },
  { id: 'reports', label: 'التقارير', icon: 'bar-chart', category: 'reports', count: '—', subtitle: 'تقرير متاح' },
  { id: 'trash', label: 'سلة المحذوفات', icon: 'trash', category: 'system', count: '4', subtitle: 'عنصر محذوف' },
];

const CONCEPTS = [
  { id: 'bento', label: 'المفهوم 1: شبكة بينتو', desc: 'بطاقات غير متماثلة الحجم — المهام الأهم (المقررات، الطلاب) تأخذ مساحة أكبر لجذب الانتباه، والباقي بأحجام أصغر.' },
  { id: 'metric', label: 'المفهوم 2: بطاقات تحليلية', desc: 'شبكة موحَّدة، كل بطاقة تعرض رقماً حياً (عدد المقررات، الطلاب...) فوق زر الوصول مباشرة — مفيدة جداً للإدارة.' },
  { id: 'swimlane', label: 'المفهوم 3: مسارات أفقية', desc: 'تجميع المهام حسب الفئة (أكاديمي/إداري/تقارير/نظام)، كل فئة في صف أفقي قابل للتمرير بدل شبكة واحدة كبيرة.' },
  { id: 'appgrid', label: 'المفهوم 4: شبكة تطبيقات', desc: 'مستوحى من الشاشة الرئيسية للهاتف — مربعات متساوية بأيقونة كبيرة داخل دائرة ملوَّنة ونص بسيط أسفلها.' },
] as const;

const ICON_WRAP = (color: { bg: string; text: string }, size = 48) => ({
  width: size, height: size, borderRadius: size / 2, backgroundColor: color.bg,
  alignItems: 'center' as const, justifyContent: 'center' as const,
});

export default function DashboardConceptsDemo() {
  const router = useRouter();
  const [active, setActive] = useState<typeof CONCEPTS[number]['id']>('bento');
  const activeConcept = CONCEPTS.find((c) => c.id === active)!;

  return (
    <SafeAreaView style={styles.safe} testID="dashboard-concepts-demo-page">
      <Stack.Screen options={{ title: 'مقترحات لوحة التحكم' }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="demo-back-btn" style={styles.backBtn}>
          <Ionicons name="arrow-forward" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>مقترحات تصميم لوحة تحكم الصلاحيات</Text>
          <Text style={styles.headerSubtitle}>عرض تجريبي ببيانات وهمية — اختر الشكل الذي يناسبك قبل الربط الفعلي بصلاحيات المستخدمين</Text>
        </View>
      </View>

      <View style={styles.tabsRow} testID="demo-concept-tabs">
        {CONCEPTS.map((c) => (
          <TouchableOpacity
            key={c.id}
            onPress={() => setActive(c.id)}
            style={[styles.tabBtn, active === c.id && styles.tabBtnActive]}
            testID={`demo-concept-tab-${c.id}`}
          >
            <Text style={[styles.tabBtnText, active === c.id && styles.tabBtnTextActive]}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.descBox} testID="demo-concept-description">
          <Ionicons name="bulb" size={18} color="#2563EB" />
          <Text style={styles.descText}>{activeConcept.desc}</Text>
        </View>

        {active === 'bento' && <BentoGrid />}
        {active === 'metric' && <MetricGrid />}
        {active === 'swimlane' && <SwimlaneGrid />}
        {active === 'appgrid' && <AppIconGrid />}
      </ScrollView>
    </SafeAreaView>
  );
}

function BentoGrid() {
  const [big, ...rest] = DEMO_ITEMS;
  const big2 = rest[0];
  const small = rest.slice(1);
  return (
    <View style={styles.bentoWrap} testID="concept-bento-grid">
      {[big, big2].map((item) => {
        const c = CATEGORY_COLORS[item.category];
        return (
          <TouchableOpacity key={item.id} style={[styles.bentoBig, { borderColor: c.border, backgroundColor: c.bg }]} testID={`demo-card-${item.id}`}>
            <View style={ICON_WRAP(c, 56)}><Ionicons name={item.icon} size={28} color={c.text} /></View>
            <View>
              <Text style={[styles.bentoBigTitle, { color: c.text }]}>{item.label}</Text>
              <Text style={styles.bentoBigCount}>{item.count}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
      {small.map((item) => {
        const c = CATEGORY_COLORS[item.category];
        return (
          <TouchableOpacity key={item.id} style={[styles.bentoSmall, { borderColor: c.border }]} testID={`demo-card-${item.id}`}>
            <View style={ICON_WRAP(c, 40)}><Ionicons name={item.icon} size={20} color={c.text} /></View>
            <Text style={styles.bentoSmallTitle}>{item.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function MetricGrid() {
  return (
    <View style={styles.metricWrap} testID="concept-metric-grid">
      {DEMO_ITEMS.map((item) => {
        const c = CATEGORY_COLORS[item.category];
        return (
          <TouchableOpacity key={item.id} style={styles.metricCard} testID={`demo-card-${item.id}`}>
            <View style={styles.metricTopRow}>
              <View style={[styles.catPill, { backgroundColor: c.bg }]}><Text style={[styles.catPillText, { color: c.text }]}>{c.label}</Text></View>
              <View style={ICON_WRAP(c, 40)}><Ionicons name={item.icon} size={20} color={c.text} /></View>
            </View>
            <Text style={styles.metricValue}>{item.count}</Text>
            <Text style={styles.metricTitle}>{item.label}</Text>
            <Text style={styles.metricSubtitle}>{item.subtitle}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function SwimlaneGrid() {
  const categories: Category[] = ['academic', 'administrative', 'reports', 'system'];
  return (
    <View testID="concept-swimlane-grid">
      {categories.map((cat) => {
        const c = CATEGORY_COLORS[cat];
        const items = DEMO_ITEMS.filter((i) => i.category === cat);
        if (!items.length) return null;
        return (
          <View key={cat} style={styles.swimlaneSection}>
            <View style={styles.swimlaneHeader}>
              <View style={[styles.catDot, { backgroundColor: c.text }]} />
              <Text style={styles.swimlaneTitle}>{c.label}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingStart: 4 }}>
              {items.map((item) => (
                <TouchableOpacity key={item.id} style={[styles.swimlaneCard, { borderColor: c.border }]} testID={`demo-card-${item.id}`}>
                  <View style={ICON_WRAP(c, 44)}><Ionicons name={item.icon} size={22} color={c.text} /></View>
                  <Text style={styles.swimlaneCardTitle}>{item.label}</Text>
                  <Text style={styles.swimlaneCardCount}>{item.count}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        );
      })}
    </View>
  );
}

function AppIconGrid() {
  return (
    <View style={styles.appGridWrap} testID="concept-appgrid-grid">
      {DEMO_ITEMS.map((item) => {
        const c = CATEGORY_COLORS[item.category];
        return (
          <TouchableOpacity key={item.id} style={styles.appGridItem} testID={`demo-card-${item.id}`}>
            <View style={ICON_WRAP(c, 64)}><Ionicons name={item.icon} size={30} color={c.text} /></View>
            <Text style={styles.appGridLabel} numberOfLines={1}>{item.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, backgroundColor: '#0F172A', paddingHorizontal: 16, paddingVertical: 14 },
  backBtn: { padding: 4 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800', textAlign: 'right' },
  headerSubtitle: { color: '#94A3B8', fontSize: 12, textAlign: 'right', marginTop: 2 },
  tabsRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  tabBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  tabBtnActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  tabBtnText: { fontSize: 12.5, fontWeight: '700', color: '#475569' },
  tabBtnTextActive: { color: '#fff' },
  body: { padding: 16, paddingBottom: 60, maxWidth: 1200, width: '100%', alignSelf: 'center' },
  descBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 12, padding: 12, marginBottom: 18 },
  descText: { flex: 1, fontSize: 13, color: '#1E3A8A', textAlign: 'right', lineHeight: 19 },

  // Bento
  bentoWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  bentoBig: { width: '48%', minWidth: 220, height: 150, borderRadius: 18, borderWidth: 1, padding: 18, justifyContent: 'space-between', alignItems: 'flex-end' },
  bentoBigTitle: { fontSize: 17, fontWeight: '800', textAlign: 'right' },
  bentoBigCount: { fontSize: 26, fontWeight: '900', color: '#0F172A', textAlign: 'right', marginTop: 4 },
  bentoSmall: { width: '22%', minWidth: 110, height: 120, borderRadius: 16, borderWidth: 1, backgroundColor: '#fff', padding: 12, alignItems: 'center', justifyContent: 'center', gap: 8 },
  bentoSmallTitle: { fontSize: 12.5, fontWeight: '700', color: '#0F172A', textAlign: 'center' },

  // Metric
  metricWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  metricCard: { width: '23%', minWidth: 200, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 16 },
  metricTopRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  catPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  catPillText: { fontSize: 10.5, fontWeight: '800' },
  metricValue: { fontSize: 28, fontWeight: '900', color: '#2563EB', textAlign: 'right' },
  metricTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A', textAlign: 'right', marginTop: 4 },
  metricSubtitle: { fontSize: 11.5, color: '#64748B', textAlign: 'right', marginTop: 2 },

  // Swimlane
  swimlaneSection: { marginBottom: 24 },
  swimlaneHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 10 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  swimlaneTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  swimlaneCard: { width: 150, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, padding: 14, alignItems: 'center', gap: 8 },
  swimlaneCardTitle: { fontSize: 12.5, fontWeight: '700', color: '#0F172A', textAlign: 'center' },
  swimlaneCardCount: { fontSize: 15, fontWeight: '800', color: '#2563EB' },

  // App grid
  appGridWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, justifyContent: 'flex-end' },
  appGridItem: { width: 110, aspectRatio: 1, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 10 },
  appGridLabel: { fontSize: 12, fontWeight: '700', color: '#0F172A', textAlign: 'center' },
});

/**
 * صفحة "دليل المستخدم" — Help & User Guide
 * بنية: شريط جانبي (Sidebar) للأقسام + محتوى مفصّل خطوة بخطوة.
 * المحتوى منظَّم على 7 مراحل متسلسلة + 3 ملاحق.
 */
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { HELP_SECTIONS, HelpSection, HelpStep } from '../src/data/helpContent';
import { FAQSection } from '../src/components/FAQSection';

export default function HelpScreen() {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string>(HELP_SECTIONS[0].id);
  const [query, setQuery] = useState('');

  const activeSection: HelpSection | undefined = useMemo(
    () => HELP_SECTIONS.find(s => s.id === activeId),
    [activeId]
  );

  // 🔍 بحث مباشر في عناوين/خطوات الأقسام
  const filteredSections = useMemo(() => {
    const q = query.trim();
    if (!q) return HELP_SECTIONS;
    return HELP_SECTIONS.filter(s =>
      s.title.includes(q) ||
      s.subtitle?.includes(q) ||
      s.steps.some(st => st.title.includes(q) || st.body?.includes(q))
    );
  }, [query]);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="help-back-btn">
          <Ionicons name="arrow-forward" size={20} color="#1f2a37" />
          <Text style={styles.backText}>رجوع</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={styles.title}>دليل استخدام المنصة</Text>
          <Text style={styles.subtitle}>
            خطوات منطقية مترابطة — من فتح الموقع إلى التشغيل اليومي
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        {/* Sidebar */}
        <ScrollView style={styles.sidebar} contentContainerStyle={{ paddingBottom: 24 }}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={14} color="#8a95a8" />
            <TextInput
              style={styles.searchInput}
              placeholder="ابحث في الدليل..."
              placeholderTextColor="#a8b1c2"
              value={query}
              onChangeText={setQuery}
              testID="help-search-input"
            />
          </View>
          {filteredSections.length === 0 ? (
            <Text style={styles.noResults}>لا توجد نتائج لـ &quot;{query}&quot;</Text>
          ) : (
            filteredSections.map((s, idx) => {
              const active = s.id === activeId;
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.sidebarItem, active && styles.sidebarItemActive]}
                  onPress={() => setActiveId(s.id)}
                  testID={`help-section-${s.id}`}
                >
                  <View style={[styles.idxBubble, { backgroundColor: s.color || '#2962ff' }]}>
                    <Text style={styles.idxText}>{idx + 1}</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    {!!s.roleLabel && (
                      <View style={[styles.roleBadge, active && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                        <Text style={[styles.roleBadgeText, active && { color: '#fff' }]}>{s.roleLabel}</Text>
                      </View>
                    )}
                    <Text style={[styles.sidebarItemTitle, active && { color: '#fff' }]} numberOfLines={2}>
                      {s.title}
                    </Text>
                    {!!s.subtitle && (
                      <Text style={[styles.sidebarItemSub, active && { color: '#dbe7ff' }]} numberOfLines={1}>
                        {s.subtitle}
                      </Text>
                    )}
                  </View>
                  <Ionicons
                    name={s.icon || 'chevron-back'}
                    size={16}
                    color={active ? '#fff' : '#5b6678'}
                  />
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>

        {/* Content */}
        <ScrollView style={styles.content} contentContainerStyle={{ padding: 24, paddingBottom: 80 }}>
          {activeSection ? (
            <>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIcon, { backgroundColor: (activeSection.color || '#2962ff') + '22' }]}>
                  <Ionicons name={activeSection.icon || 'book'} size={22} color={activeSection.color || '#2962ff'} />
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={styles.sectionTitle}>{activeSection.title}</Text>
                  {!!activeSection.subtitle && (
                    <Text style={styles.sectionSubtitle}>{activeSection.subtitle}</Text>
                  )}
                </View>
              </View>

              {!!activeSection.intro && (
                <View style={styles.introBox}>
                  <Ionicons name="information-circle" size={18} color="#1976d2" />
                  <Text style={styles.introText}>{activeSection.intro}</Text>
                </View>
              )}

              {!!activeSection.warning && (
                <View style={styles.warningBox}>
                  <Ionicons name="warning" size={18} color="#bf360c" />
                  <Text style={styles.warningText}>{activeSection.warning}</Text>
                </View>
              )}

              {/* 🔧 FAQ يُعرض كقسم خاص (accordion) — بدلاً من الخطوات */}
              {activeSection.id === 'faq' ? (
                <FAQSection />
              ) : (
                <>
                  {/* الخطوات */}
                  <View style={styles.stepsList}>
                    {activeSection.steps.map((step, i) => (
                      <StepCard key={i} step={step} index={i + 1} accent={activeSection.color || '#2962ff'} />
                    ))}
                  </View>

                  {/* روابط مرتبطة */}
                  {!!activeSection.links?.length && (
                    <View style={styles.linksBox}>
                      <Text style={styles.linksTitle}>روابط سريعة:</Text>
                      {activeSection.links.map((l, i) => (
                        <TouchableOpacity
                          key={i}
                          style={styles.linkBtn}
                          onPress={() => router.push(l.route as any)}
                          testID={`help-link-${i}`}
                        >
                          <Ionicons name="arrow-back" size={14} color="#2962ff" />
                          <Text style={styles.linkText}>{l.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}

              {/* تنقّل بين الأقسام */}
              <SectionNavigation activeId={activeId} onChange={setActiveId} />
            </>
          ) : null}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

// ============================================================
// مكوّن: كرت الخطوة
// ============================================================
function StepCard({ step, index, accent }: { step: HelpStep; index: number; accent: string }) {
  return (
    <View style={styles.stepCard}>
      <View style={styles.stepHeader}>
        <View style={[styles.stepNumber, { backgroundColor: accent }]}>
          <Text style={styles.stepNumberText}>{index}</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={styles.stepTitle}>{step.title}</Text>
          {!!step.path && (
            <View style={styles.pathChip}>
              <Ionicons name="navigate" size={11} color="#5b6678" />
              <Text style={styles.pathText}>{step.path}</Text>
            </View>
          )}
        </View>
      </View>

      {!!step.body && <Text style={styles.stepBody}>{step.body}</Text>}

      {!!step.bullets?.length && (
        <View style={styles.bulletsBox}>
          {step.bullets.map((b, i) => (
            <View key={i} style={styles.bulletRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.bulletText}>{b}</Text>
            </View>
          ))}
        </View>
      )}

      {!!step.tip && (
        <View style={styles.tipBox}>
          <Ionicons name="bulb" size={14} color="#e69500" />
          <Text style={styles.tipText}>{step.tip}</Text>
        </View>
      )}

      {!!step.warning && (
        <View style={styles.stepWarnBox}>
          <Ionicons name="alert-circle" size={14} color="#c62828" />
          <Text style={styles.stepWarnText}>{step.warning}</Text>
        </View>
      )}
    </View>
  );
}

// ============================================================
// مكوّن: تنقّل بين الأقسام (سابق/تالي)
// ============================================================
function SectionNavigation({
  activeId,
  onChange,
}: {
  activeId: string;
  onChange: (id: string) => void;
}) {
  const idx = HELP_SECTIONS.findIndex(s => s.id === activeId);
  const prev = idx > 0 ? HELP_SECTIONS[idx - 1] : null;
  const next = idx >= 0 && idx < HELP_SECTIONS.length - 1 ? HELP_SECTIONS[idx + 1] : null;
  return (
    <View style={styles.navBar}>
      {prev ? (
        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => onChange(prev.id)}
          testID="help-prev-btn"
        >
          <Ionicons name="arrow-forward" size={16} color="#1f2a37" />
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.navHint}>السابق</Text>
            <Text style={styles.navLabel} numberOfLines={1}>{prev.title}</Text>
          </View>
        </TouchableOpacity>
      ) : <View />}
      {next ? (
        <TouchableOpacity
          style={[styles.navBtn, styles.navBtnNext]}
          onPress={() => onChange(next.id)}
          testID="help-next-btn"
        >
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.navHint, { color: '#dbe7ff' }]}>التالي</Text>
            <Text style={[styles.navLabel, { color: '#fff' }]} numberOfLines={1}>{next.title}</Text>
          </View>
          <Ionicons name="arrow-back" size={16} color="#fff" />
        </TouchableOpacity>
      ) : <View />}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f8fb' },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eef1f5',
    gap: 12,
  },
  backBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, padding: 6 },
  backText: { fontSize: 13, color: '#1f2a37', fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '700', color: '#0f172a', textAlign: 'right' },
  subtitle: { fontSize: 12, color: '#5b6678', marginTop: 2, textAlign: 'right' },

  body: { flex: 1, flexDirection: Platform.OS === 'web' ? 'row-reverse' : 'column' },
  // Sidebar
  sidebar: {
    width: Platform.OS === 'web' ? 280 : '100%',
    maxWidth: Platform.OS === 'web' ? 280 : undefined,
    maxHeight: Platform.OS === 'web' ? undefined : 200,
    backgroundColor: '#fff',
    borderLeftWidth: Platform.OS === 'web' ? 1 : 0,
    borderBottomWidth: Platform.OS === 'web' ? 0 : 1,
    borderColor: '#eef1f5',
    padding: 12,
  },
  searchBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#f6f8fb',
    borderWidth: 1,
    borderColor: '#eef1f5',
    borderRadius: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#1f2a37',
    textAlign: 'right',
    outlineWidth: 0 as any,
    paddingVertical: 2,
  },
  noResults: { textAlign: 'center', color: '#8a95a8', fontSize: 12, padding: 12 },
  sidebarItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  sidebarItemActive: { backgroundColor: '#2962ff' },
  idxBubble: {
    width: 22, height: 22, borderRadius: 11,
    justifyContent: 'center', alignItems: 'center',
  },
  idxText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  sidebarItemTitle: { fontSize: 13, color: '#1f2a37', fontWeight: '700', textAlign: 'right' },
  sidebarItemSub: { fontSize: 10, color: '#5b6678', marginTop: 2, textAlign: 'right' },
  roleBadge: { backgroundColor: '#06b6d4', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, marginBottom: 4 },
  roleBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },

  // Content
  content: { flex: 1 },
  sectionHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  sectionIcon: {
    width: 48, height: 48, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  sectionTitle: { fontSize: 22, fontWeight: '800', color: '#0f172a', textAlign: 'right' },
  sectionSubtitle: { fontSize: 13, color: '#5b6678', marginTop: 4, textAlign: 'right' },

  introBox: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
    borderRightWidth: 4,
    borderRightColor: '#1976d2',
  },
  introText: { flex: 1, fontSize: 13, color: '#0d47a1', textAlign: 'right', lineHeight: 20 },

  warningBox: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#fff3e0',
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
    borderRightWidth: 4,
    borderRightColor: '#e65100',
  },
  warningText: { flex: 1, fontSize: 13, color: '#bf360c', textAlign: 'right', fontWeight: '600', lineHeight: 20 },

  stepsList: { gap: 14 },
  stepCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#eef1f5',
  },
  stepHeader: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  stepNumber: {
    width: 30, height: 30, borderRadius: 15,
    justifyContent: 'center', alignItems: 'center',
  },
  stepNumberText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  stepTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', textAlign: 'right' },
  pathChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f6f8fb',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginTop: 6,
  },
  pathText: { fontSize: 11, color: '#5b6678', fontFamily: Platform.OS === 'web' ? 'monospace' : undefined },
  stepBody: { fontSize: 13, color: '#1f2a37', lineHeight: 22, textAlign: 'right' },
  bulletsBox: { marginTop: 10, gap: 6 },
  bulletRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8 },
  bulletDot: {
    width: 5, height: 5, borderRadius: 2.5,
    backgroundColor: '#2962ff',
    marginTop: 8,
  },
  bulletText: { flex: 1, fontSize: 12.5, color: '#1f2a37', textAlign: 'right', lineHeight: 20 },
  tipBox: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#fffbeb',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  tipText: { flex: 1, fontSize: 12, color: '#92400e', textAlign: 'right', lineHeight: 18 },
  stepWarnBox: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#ffebee',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  stepWarnText: { flex: 1, fontSize: 12, color: '#c62828', textAlign: 'right', lineHeight: 18, fontWeight: '600' },

  linksBox: {
    marginTop: 20,
    padding: 14,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eef1f5',
  },
  linksTitle: { fontSize: 13, fontWeight: '700', color: '#1f2a37', textAlign: 'right', marginBottom: 8 },
  linkBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
  },
  linkText: { fontSize: 13, color: '#2962ff', fontWeight: '600' },

  // Navigation
  navBar: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginTop: 28,
    gap: 10,
  },
  navBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eef1f5',
    borderRadius: 10,
    minWidth: 160,
  },
  navBtnNext: { backgroundColor: '#2962ff', borderColor: '#2962ff' },
  navHint: { fontSize: 10, color: '#8a95a8' },
  navLabel: { fontSize: 13, color: '#1f2a37', fontWeight: '700', maxWidth: 180 },
});

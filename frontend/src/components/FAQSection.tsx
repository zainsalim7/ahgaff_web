/**
 * مكوّن قسم الأسئلة الشائعة (FAQ).
 *
 * مسؤوليات:
 * - عرض الأسئلة كبطاقات accordion مع تصاميم ملوّنة
 * - شريط بحث + فلتر تصنيفات بأيقونات
 * - تحليل صيغة [[label|/route]] إلى روابط داخلية حية
 * - بنية data-driven (إضافة سؤال = سطر واحد في faqContent.ts)
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { FAQ_ITEMS, FAQ_CATEGORIES, FAQItem } from '../data/faqContent';

const LINK_TOKEN = /\[\[([^\]|]+)\|([^\]]+)\]\]/g;

interface AnswerSegment { type: 'text' | 'link'; text: string; route?: string; }

function parseAnswer(answer: string): AnswerSegment[] {
  const segments: AnswerSegment[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  LINK_TOKEN.lastIndex = 0;
  while ((m = LINK_TOKEN.exec(answer)) !== null) {
    if (m.index > lastIndex) segments.push({ type: 'text', text: answer.slice(lastIndex, m.index) });
    segments.push({ type: 'link', text: m[1].trim(), route: m[2].trim() });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < answer.length) segments.push({ type: 'text', text: answer.slice(lastIndex) });
  return segments;
}

/** خريطة أيقونة لكل تصنيف. */
const CAT_ICON: Record<string, string> = {
  'getting-started': 'rocket-outline',
  'users-roles':     'people-outline',
  'courses-plans':   'book-outline',
  'students':        'school-outline',
  'teaching-load':   'briefcase-outline',
  'schedule':        'calendar-outline',
  'reports':         'stats-chart-outline',
  'troubleshooting': 'construct-outline',
};

/** الأسئلة الـ3 الأحدث تأخذ شارة "جديد". */
const NEW_ITEM_IDS = new Set(['cross-university-perm', 'edit-course-form', 'how-add-curriculum']);

export function FAQSection() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [showMoreCats, setShowMoreCats] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim();
    return FAQ_ITEMS.filter(item => {
      if (activeCategory !== 'all' && item.category !== activeCategory) return false;
      if (!q) return true;
      return item.question.includes(q) || item.answer.includes(q) || item.keywords?.some(k => k.includes(q));
    });
  }, [query, activeCategory]);

  const grouped = useMemo(() => {
    const groups: Record<string, FAQItem[]> = {};
    for (const item of filtered) (groups[item.category] = groups[item.category] || []).push(item);
    return groups;
  }, [filtered]);

  /** التصنيفات الرئيسية المعروضة افتراضياً (الأكثر استخداماً). أولى 4. */
  const VISIBLE_CAT_LIMIT = 4;
  const sortedCats = useMemo(() => {
    return FAQ_CATEGORIES
      .map(c => ({ ...c, count: FAQ_ITEMS.filter(i => i.category === c.key).length }))
      .filter(c => c.count > 0)
      .sort((a, b) => b.count - a.count);
  }, []);
  const visibleCats = showMoreCats ? sortedCats : sortedCats.slice(0, VISIBLE_CAT_LIMIT);
  const hiddenCount = sortedCats.length - VISIBLE_CAT_LIMIT;

  return (
    <View style={st.container}>
      {/* ========== Hero: عنوان كبير + شارة سؤال ========== */}
      <View style={st.hero}>
        <View style={st.heroLeft}>
          <View style={st.bubbleBack} />
          <View style={st.bubbleFront}>
            <Text style={st.bubbleQ}>?</Text>
          </View>
        </View>
        <View style={st.heroText}>
          <Text style={st.heroTitle}>الأسئلة الشائعة</Text>
          <Text style={st.heroSubtitle}>إجابات مختصرة وواضحة على أكثر الأسئلة شيوعاً</Text>
        </View>
      </View>

      {/* ========== Intro panel (light blue) ========== */}
      <View style={st.introCard}>
        <View style={st.introIconBox}>
          <Ionicons name="information-circle" size={18} color="#2962ff" />
        </View>
        <Text style={st.introText}>
          مجموعة من الأسئلة الأكثر تكراراً مع إجابات مختصرة. اضغط على أي رابط داخل الإجابة للانتقال مباشرة إلى الصفحة المعنية.
        </Text>
      </View>

      {/* ========== Search + Filter button ========== */}
      <View style={st.searchRow}>
        <View style={st.filterBtn}>
          <Ionicons name="funnel-outline" size={14} color="#5b6678" />
          <Text style={st.filterBtnText}>تصفية</Text>
        </View>
        <View style={st.searchBox}>
          <Ionicons name="search" size={16} color="#8a95a8" />
          <TextInput
            style={st.searchInput}
            placeholder="ابحث في الأسئلة الشائعة..."
            placeholderTextColor="#a8b1c2"
            value={query}
            onChangeText={setQuery}
            testID="faq-search-input"
          />
          {!!query && (
            <TouchableOpacity onPress={() => setQuery('')} testID="faq-clear-search">
              <Ionicons name="close-circle" size={18} color="#a8b1c2" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ========== Category chips (icons + count) ========== */}
      <View style={st.catRowOuter}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.catRow}>
          <CategoryChip
            icon="grid-outline"
            label="الكل"
            color="#2962ff"
            active={activeCategory === 'all'}
            count={FAQ_ITEMS.length}
            onPress={() => setActiveCategory('all')}
          />
          {visibleCats.map(c => (
            <CategoryChip
              key={c.key}
              icon={CAT_ICON[c.key] || 'pricetag-outline'}
              label={c.label.split(' ')[0]}
              color={c.color}
              active={activeCategory === c.key}
              count={c.count}
              onPress={() => setActiveCategory(c.key)}
            />
          ))}
          {hiddenCount > 0 && (
            <TouchableOpacity onPress={() => setShowMoreCats(s => !s)} style={st.moreChip} testID="faq-show-more-cats">
              <Ionicons name={showMoreCats ? 'chevron-up' : 'chevron-down'} size={14} color="#5b6678" />
              <Text style={st.moreChipText}>{showMoreCats ? 'أقل' : `المزيد (${hiddenCount})`}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {/* ========== FAQ cards list ========== */}
      {filtered.length === 0 ? (
        <View style={st.empty}>
          <Ionicons name="help-circle-outline" size={40} color="#cdd5e0" />
          <Text style={st.emptyText}>لا توجد نتائج لـ &quot;{query}&quot;</Text>
        </View>
      ) : (
        Object.keys(grouped).map(catKey => {
          const cat = FAQ_CATEGORIES.find(c => c.key === catKey);
          return (
            <View key={catKey} style={st.group}>
              {activeCategory === 'all' && (
                <View style={st.groupHeader}>
                  <View style={[st.groupDot, { backgroundColor: cat?.color || '#5b6678' }]} />
                  <Text style={st.groupTitle}>{cat?.label || catKey}</Text>
                  <Text style={st.groupCount}>{grouped[catKey].length}</Text>
                </View>
              )}
              {grouped[catKey].map(item => (
                <FAQItemRow
                  key={item.id}
                  item={item}
                  expanded={openId === item.id}
                  onToggle={() => setOpenId(openId === item.id ? null : item.id)}
                  onNavigate={(route) => router.push(route as any)}
                  accent={cat?.color || '#2962ff'}
                  catIcon={CAT_ICON[catKey] || 'help-circle-outline'}
                  isNew={NEW_ITEM_IDS.has(item.id)}
                />
              ))}
            </View>
          );
        })
      )}
    </View>
  );
}

function CategoryChip({ icon, label, color, active, count, onPress }: {
  icon: string; label: string; color: string; active: boolean; count: number; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[st.chip, active && { backgroundColor: color, borderColor: color }]}
      testID={`faq-cat-${label}`}
    >
      <View style={[st.chipBadge, active && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
        <Text style={[st.chipBadgeText, active && { color: '#fff' }]}>{count}</Text>
      </View>
      <Text style={[st.chipText, active && { color: '#fff' }]}>{label}</Text>
      <Ionicons name={icon as any} size={14} color={active ? '#fff' : color} />
    </TouchableOpacity>
  );
}

function FAQItemRow({ item, expanded, onToggle, onNavigate, accent, catIcon, isNew }: {
  item: FAQItem;
  expanded: boolean;
  onToggle: () => void;
  onNavigate: (route: string) => void;
  accent: string;
  catIcon: string;
  isNew: boolean;
}) {
  const segments = useMemo(() => parseAnswer(item.answer), [item.answer]);
  return (
    <View style={[st.qaCard, expanded && { borderColor: accent, borderWidth: 1.5, backgroundColor: '#fbfcfe' }]} testID={`faq-item-${item.id}`}>
      <TouchableOpacity onPress={onToggle} style={st.qaHeader} testID={`faq-toggle-${item.id}`} activeOpacity={0.7}>
        {/* أيقونة دائرية ملوّنة على اليمين */}
        <View style={[st.qIconCircle, { backgroundColor: accent + '18' }]}>
          <Ionicons name={catIcon as any} size={18} color={accent} />
        </View>

        {/* نص السؤال + شارة "جديد" */}
        <View style={{ flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
          <Text style={[st.qText, expanded && { color: accent }]}>{item.question}</Text>
          {isNew && (
            <View style={st.newBadge}>
              <Text style={st.newBadgeText}>جديد</Text>
            </View>
          )}
        </View>

        <View style={[st.chevronBox, expanded && { backgroundColor: accent + '12' }]}>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={expanded ? accent : '#8a95a8'} />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={st.aBody}>
          <Text style={st.aText}>
            {segments.map((seg, i) => {
              if (seg.type === 'link' && seg.route) {
                return (
                  <Text
                    key={i}
                    style={[st.aLink, { color: accent }]}
                    onPress={() => onNavigate(seg.route!)}
                    accessibilityRole="link"
                    testID={`faq-link-${item.id}-${i}`}
                  >
                    {seg.text}
                    <Text> </Text>
                    <Ionicons name="open-outline" size={13} color={accent} />
                  </Text>
                );
              }
              return <Text key={i}>{seg.text}</Text>;
            })}
          </Text>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { paddingBottom: 24 },

  // ========== Hero ==========
  hero: { flexDirection: 'row-reverse', alignItems: 'center', gap: 18, paddingVertical: 20, paddingHorizontal: 8, marginBottom: 14 },
  heroText: { flex: 1, alignItems: 'flex-end' },
  heroTitle: { fontSize: 28, fontWeight: '800', color: '#1f2a37', textAlign: 'right', marginBottom: 6 },
  heroSubtitle: { fontSize: 14, color: '#5b6678', textAlign: 'right', lineHeight: 22 },
  heroLeft: { width: 88, height: 88, position: 'relative' },
  bubbleBack: {
    position: 'absolute', right: 8, top: 22, width: 56, height: 52, borderRadius: 28,
    backgroundColor: '#3b82f6', opacity: 0.85,
  },
  bubbleFront: {
    position: 'absolute', right: 26, top: 6, width: 58, height: 58, borderRadius: 30,
    backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#7c3aed', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  bubbleQ: { color: '#fff', fontSize: 26, fontWeight: '900' },

  // ========== Intro panel ==========
  introCard: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
    backgroundColor: '#eff6ff', borderRadius: 10, padding: 12, marginBottom: 14,
    borderWidth: 1, borderColor: '#dbeafe',
  },
  introIconBox: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },
  introText: { flex: 1, fontSize: 13.5, color: '#374151', textAlign: 'right', lineHeight: 22 },

  // ========== Search row ==========
  searchRow: { flexDirection: 'row-reverse', gap: 8, marginBottom: 12 },
  searchBox: {
    flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 11,
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e3e7ee',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#1f2a37', textAlign: 'right', outlineWidth: 0 as any },
  filterBtn: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 11,
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e3e7ee',
  },
  filterBtnText: { fontSize: 13, color: '#3f4b5c', fontWeight: '600' },

  // ========== Category chips ==========
  catRowOuter: { marginBottom: 14 },
  catRow: { flexDirection: 'row-reverse', gap: 8 },
  chip: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e7ee',
  },
  chipText: { fontSize: 13, color: '#1f2a37', fontWeight: '600' },
  chipBadge: {
    minWidth: 22, height: 20, borderRadius: 10, paddingHorizontal: 7,
    backgroundColor: '#eef1f5', alignItems: 'center', justifyContent: 'center',
  },
  chipBadgeText: { fontSize: 11, color: '#3f4b5c', fontWeight: '700' },
  moreChip: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999,
    backgroundColor: '#f6f8fb', borderWidth: 1, borderColor: '#e3e7ee',
  },
  moreChipText: { fontSize: 12.5, color: '#5b6678', fontWeight: '600' },

  // ========== Group header ==========
  group: { marginBottom: 14 },
  groupHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 8, paddingHorizontal: 4 },
  groupDot: { width: 8, height: 8, borderRadius: 4 },
  groupTitle: { flex: 1, fontSize: 13.5, color: '#1f2a37', fontWeight: '700', textAlign: 'right' },
  groupCount: { fontSize: 11.5, color: '#5b6678', backgroundColor: '#eef1f5', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, fontWeight: '700' },

  // ========== FAQ card ==========
  qaCard: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e8edf3',
    marginBottom: 10, overflow: 'hidden',
  },
  qaHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  qIconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  qText: { flex: 1, fontSize: 15, color: '#1f2a37', fontWeight: '700', textAlign: 'right', lineHeight: 24 },
  newBadge: { backgroundColor: '#d1fae5', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  newBadgeText: { fontSize: 10.5, color: '#047857', fontWeight: '800' },
  chevronBox: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f6f8fb' },

  // ========== Answer body ==========
  aBody: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 16, borderTopWidth: 1, borderTopColor: '#f0f3f7' },
  aText: { fontSize: 14, color: '#374151', lineHeight: 26, textAlign: 'right' },
  aLink: { fontWeight: '700', textDecorationLine: 'underline' },

  // ========== Empty ==========
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { marginTop: 10, fontSize: 14, color: '#8a95a8' },
});

/**
 * مكوّن قسم الأسئلة الشائعة (FAQ).
 *
 * المسؤوليات:
 * 1. عرض قائمة الأسئلة موزّعة حسب التصنيف.
 * 2. توسيع/طي إجابة كل سؤال (accordion).
 * 3. تحليل الإجابات لكشف الروابط الداخلية بالصيغة [[label|/route]]
 *    وتحويلها إلى أزرار تنقل المستخدم مباشرة للصفحة المعنية.
 * 4. بحث نصي مباشر في الأسئلة والإجابات والكلمات المفتاحية.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { FAQ_ITEMS, FAQ_CATEGORIES, FAQItem } from '../data/faqContent';

/** Regex لاكتشاف الرموز [[label|/route]] داخل النص. */
const LINK_TOKEN = /\[\[([^\]|]+)\|([^\]]+)\]\]/g;

interface AnswerSegment {
  type: 'text' | 'link';
  text: string;
  route?: string;
}

/** يقسّم الإجابة إلى مقاطع نصية وروابط قابلة للنقر. */
function parseAnswer(answer: string): AnswerSegment[] {
  const segments: AnswerSegment[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  LINK_TOKEN.lastIndex = 0;
  while ((m = LINK_TOKEN.exec(answer)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: 'text', text: answer.slice(lastIndex, m.index) });
    }
    segments.push({ type: 'link', text: m[1].trim(), route: m[2].trim() });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < answer.length) {
    segments.push({ type: 'text', text: answer.slice(lastIndex) });
  }
  return segments;
}

export function FAQSection() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('all');

  /** فلترة الأسئلة بناءً على البحث والتصنيف. */
  const filtered = useMemo(() => {
    const q = query.trim();
    return FAQ_ITEMS.filter(item => {
      if (activeCategory !== 'all' && item.category !== activeCategory) return false;
      if (!q) return true;
      return (
        item.question.includes(q) ||
        item.answer.includes(q) ||
        item.keywords?.some(k => k.includes(q))
      );
    });
  }, [query, activeCategory]);

  /** تجميع الأسئلة المُفلترة حسب التصنيف. */
  const grouped = useMemo(() => {
    const groups: Record<string, FAQItem[]> = {};
    for (const item of filtered) {
      (groups[item.category] = groups[item.category] || []).push(item);
    }
    return groups;
  }, [filtered]);

  return (
    <View style={st.container}>
      {/* شريط البحث */}
      <View style={st.searchBox}>
        <Ionicons name="search" size={14} color="#8a95a8" />
        <TextInput
          style={st.searchInput}
          placeholder="ابحث في الأسئلة الشائعة..."
          placeholderTextColor="#a8b1c2"
          value={query}
          onChangeText={setQuery}
          testID="faq-search-input"
        />
        {!!query && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={16} color="#a8b1c2" />
          </TouchableOpacity>
        )}
      </View>

      {/* فلتر التصنيفات (chips) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.catRow}>
        <CategoryChip
          label="الكل"
          color="#5b6678"
          active={activeCategory === 'all'}
          count={FAQ_ITEMS.length}
          onPress={() => setActiveCategory('all')}
        />
        {FAQ_CATEGORIES.map(c => {
          const count = FAQ_ITEMS.filter(i => i.category === c.key).length;
          if (count === 0) return null;
          return (
            <CategoryChip
              key={c.key}
              label={c.label}
              color={c.color}
              active={activeCategory === c.key}
              count={count}
              onPress={() => setActiveCategory(c.key)}
            />
          );
        })}
      </ScrollView>

      {/* قائمة الأسئلة */}
      {filtered.length === 0 ? (
        <View style={st.empty}>
          <Ionicons name="help-circle-outline" size={32} color="#cdd5e0" />
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
                />
              ))}
            </View>
          );
        })
      )}
    </View>
  );
}

function CategoryChip({ label, color, active, count, onPress }: {
  label: string; color: string; active: boolean; count: number; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[st.chip, active && { backgroundColor: color, borderColor: color }]}
      testID={`faq-cat-${label}`}
    >
      <Text style={[st.chipText, active && { color: '#fff' }]}>{label}</Text>
      <View style={[st.chipBadge, active && { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
        <Text style={[st.chipBadgeText, active && { color: '#fff' }]}>{count}</Text>
      </View>
    </TouchableOpacity>
  );
}

function FAQItemRow({ item, expanded, onToggle, onNavigate, accent }: {
  item: FAQItem;
  expanded: boolean;
  onToggle: () => void;
  onNavigate: (route: string) => void;
  accent: string;
}) {
  const segments = useMemo(() => parseAnswer(item.answer), [item.answer]);
  return (
    <View style={[st.qaCard, expanded && { borderColor: accent, borderWidth: 1.5 }]} testID={`faq-item-${item.id}`}>
      <TouchableOpacity onPress={onToggle} style={st.qaHeader} testID={`faq-toggle-${item.id}`}>
        <View style={[st.qIcon, { backgroundColor: accent + '15' }]}>
          <Ionicons name="help-circle" size={14} color={accent} />
        </View>
        <Text style={[st.qText, expanded && { color: accent, fontWeight: '700' }]}>{item.question}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#5b6678" />
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
                    {seg.text}{' '}
                    <Ionicons name="open-outline" size={11} color={accent} />
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
  searchBox: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e3e7ee',
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 13, color: '#1f2a37', textAlign: 'right', outlineWidth: 0 as any },
  catRow: { flexDirection: 'row-reverse', gap: 6, paddingBottom: 10 },
  chip: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e7ee',
  },
  chipText: { fontSize: 11.5, color: '#3f4b5c', fontWeight: '600' },
  chipBadge: {
    minWidth: 18, height: 16, borderRadius: 8, paddingHorizontal: 5,
    backgroundColor: '#eef1f5', alignItems: 'center', justifyContent: 'center',
  },
  chipBadgeText: { fontSize: 10, color: '#5b6678', fontWeight: '700' },
  group: { marginBottom: 12 },
  groupHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginBottom: 6, paddingHorizontal: 4 },
  groupDot: { width: 6, height: 6, borderRadius: 3 },
  groupTitle: { flex: 1, fontSize: 12, color: '#3f4b5c', fontWeight: '700', textAlign: 'right' },
  groupCount: { fontSize: 10, color: '#8a95a8', backgroundColor: '#eef1f5', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  qaCard: {
    backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e8edf3',
    marginBottom: 6, overflow: 'hidden',
  },
  qaHeader: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 8,
    paddingHorizontal: 10, paddingVertical: 9,
  },
  qIcon: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  qText: { flex: 1, fontSize: 13, color: '#1f2a37', fontWeight: '600', textAlign: 'right' },
  aBody: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 12, borderTopWidth: 1, borderTopColor: '#f0f3f7' },
  aText: { fontSize: 12.5, color: '#3f4b5c', lineHeight: 22, textAlign: 'right' },
  aLink: { fontWeight: '700', textDecorationLine: 'underline' },
  empty: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { marginTop: 8, fontSize: 12, color: '#8a95a8' },
});

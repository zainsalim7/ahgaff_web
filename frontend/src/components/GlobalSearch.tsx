/**
 * GlobalSearch - مكوّن البحث الشامل
 *
 * - Modal كبير في المنتصف مع تصنيف النتائج
 * - يبحث في: الطلاب، المعلمين، المقررات، الأقسام، الكليات، المحاضرات
 * - يحترم صلاحيات المستخدم تلقائياً (من Backend)
 *
 * الاستخدام:
 *   import GlobalSearch from '../../src/components/GlobalSearch';
 *   <GlobalSearch visible={open} onClose={() => setOpen(false)} />
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import api from '../services/api';

interface SearchItem {
  id: string;
  title: string;
  subtitle: string;
  route: string;
  type: string;
  icon: any;
}

interface SearchResults {
  query: string;
  results: Record<string, SearchItem[]>;
  total: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  students: { label: 'الطلاب', color: '#1565c0', icon: 'people' },
  teachers: { label: 'المعلمون', color: '#6a1b9a', icon: 'school' },
  courses: { label: 'المقررات', color: '#2e7d32', icon: 'book' },
  departments: { label: 'الأقسام', color: '#ef6c00', icon: 'grid' },
  faculties: { label: 'الكليات', color: '#c62828', icon: 'business' },
  lectures: { label: 'المحاضرات', color: '#00838f', icon: 'calendar' },
};

const TYPE_FILTERS = [
  { value: 'all', label: 'الكل', icon: 'apps' },
  { value: 'students', label: 'طلاب', icon: 'people' },
  { value: 'teachers', label: 'معلمون', icon: 'school' },
  { value: 'courses', label: 'مقررات', icon: 'book' },
  { value: 'departments', label: 'أقسام', icon: 'grid' },
  { value: 'faculties', label: 'كليات', icon: 'business' },
  { value: 'lectures', label: 'محاضرات', icon: 'calendar' },
];

export default function GlobalSearch({ visible, onClose }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<any>(null);

  // Focus + reset عند الفتح
  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
      setResults(null);
      setFilterType('all');
    }
  }, [visible]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.trim().length < 2) {
      setResults(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const typesParam = filterType === 'all' ? '' : `&types=${filterType}`;
        const r = await api.get(`/search?q=${encodeURIComponent(query.trim())}${typesParam}`);
        setResults(r.data);
      } catch (e) {
        setResults({ query: query.trim(), results: {}, total: 0 });
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [query, filterType]);

  const handleSelect = (item: SearchItem) => {
    onClose();
    setTimeout(() => router.push(item.route as any), 100);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

        <View style={styles.modal}>
          {/* Search input */}
          <View style={styles.searchBox}>
            <Ionicons name="search" size={20} color="#666" />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="ابحث عن طالب، معلم، مقرر، قسم..."
              placeholderTextColor="#aaa"
              testID="global-search-input"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')}>
                <Ionicons name="close-circle" size={20} color="#999" />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Filters */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersRow}
          >
            {TYPE_FILTERS.map((f) => {
              const active = filterType === f.value;
              return (
                <TouchableOpacity
                  key={f.value}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setFilterType(f.value)}
                  testID={`filter-${f.value}`}
                >
                  <Ionicons
                    name={f.icon as any}
                    size={14}
                    color={active ? '#fff' : '#555'}
                  />
                  <Text style={[styles.filterText, active && { color: '#fff' }]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Results */}
          <ScrollView style={styles.resultsScroll} keyboardShouldPersistTaps="handled">
            {loading && (
              <View style={styles.center}>
                <ActivityIndicator size="small" color="#1565c0" />
              </View>
            )}

            {!loading && !query.trim() && (
              <View style={styles.hintBox}>
                <Ionicons name="bulb-outline" size={32} color="#bbb" />
                <Text style={styles.hintTitle}>ابدأ الكتابة للبحث</Text>
                <Text style={styles.hintText}>
                  ابحث عن أي طالب أو معلم أو مقرر أو قسم في النظام بسرعة
                </Text>
              </View>
            )}

            {!loading && query.trim() && query.trim().length < 2 && (
              <Text style={styles.dimText}>اكتب حرفين على الأقل</Text>
            )}

            {!loading && results && results.total === 0 && (
              <View style={styles.emptyBox}>
                <Ionicons name="search-circle-outline" size={40} color="#bbb" />
                <Text style={styles.emptyText}>لا توجد نتائج لـ "{query}"</Text>
              </View>
            )}

            {!loading &&
              results &&
              Object.entries(results.results).map(([category, items]) => {
                const meta = CATEGORY_LABELS[category];
                if (!meta) return null;
                return (
                  <View key={category} style={styles.categoryGroup}>
                    <View style={styles.categoryHeader}>
                      <Ionicons name={meta.icon} size={16} color={meta.color} />
                      <Text style={[styles.categoryLabel, { color: meta.color }]}>
                        {meta.label} ({items.length})
                      </Text>
                    </View>
                    {items.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.resultItem}
                        onPress={() => handleSelect(item)}
                        testID={`result-${item.id}`}
                      >
                        <View style={[styles.resultIcon, { backgroundColor: meta.color + '15' }]}>
                          <Ionicons name={item.icon} size={18} color={meta.color} />
                        </View>
                        <View style={styles.resultBody}>
                          <Text style={styles.resultTitle}>{item.title}</Text>
                          <Text style={styles.resultSubtitle}>{item.subtitle}</Text>
                        </View>
                        <Ionicons name="chevron-back" size={18} color="#ccc" />
                      </TouchableOpacity>
                    ))}
                  </View>
                );
              })}

            {!loading && results && results.total > 0 && (
              <Text style={styles.footerHint}>
                {results.total} نتيجة | اضغط للوصول
              </Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  modal: {
    width: Platform.OS === 'web' ? '90%' : '95%',
    maxWidth: 640,
    maxHeight: '85%',
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 4,
    color: '#212121',
    textAlign: 'right',
    outlineWidth: 0 as any,
  },
  closeBtn: { padding: 4 },
  filtersRow: {
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#f5f5f5',
  },
  filterChipActive: { backgroundColor: '#1565c0', borderColor: '#1565c0' },
  filterText: { fontSize: 12, fontWeight: '600', color: '#555' },
  resultsScroll: { paddingHorizontal: 4, paddingBottom: 8 },
  center: { padding: 30, alignItems: 'center' },
  hintBox: { padding: 32, alignItems: 'center', gap: 6 },
  hintTitle: { fontSize: 15, fontWeight: '700', color: '#666' },
  hintText: { fontSize: 12, color: '#999', textAlign: 'center', paddingHorizontal: 20 },
  dimText: { color: '#999', textAlign: 'center', padding: 20, fontSize: 13 },
  emptyBox: { padding: 28, alignItems: 'center' },
  emptyText: { color: '#666', fontSize: 13, marginTop: 6 },
  categoryGroup: { marginVertical: 4 },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#fafafa',
  },
  categoryLabel: { fontSize: 12, fontWeight: '700' },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  resultIcon: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  resultBody: { flex: 1 },
  resultTitle: { fontSize: 14, fontWeight: '700', color: '#212121', textAlign: 'right' },
  resultSubtitle: { fontSize: 11, color: '#777', marginTop: 2, textAlign: 'right' },
  footerHint: { textAlign: 'center', color: '#999', fontSize: 11, padding: 10 },
});

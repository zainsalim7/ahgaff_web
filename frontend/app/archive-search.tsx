/**
 * البحث في الأرشيف الدراسي - بحث شامل عبر كل الفصول المؤرشفة
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, Stack } from 'expo-router';
import api from '../src/services/api';

type FilterType = 'all' | 'students' | 'teachers' | 'courses';

export default function ArchiveSearchScreen() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [results, setResults] = useState<any>({ students: [], teachers: [], courses: [] });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [permCheckLoading, setPermCheckLoading] = useState(true);

  // فحص الصلاحية عند فتح الصفحة
  useEffect(() => {
    (async () => {
      try {
        // أبسط طريقة للفحص: استدعاء بحث وهمي بطول كافٍ
        await api.get('/archives/search', { params: { q: '__perm_check__' } });
        setPermissionDenied(false);
      } catch (e: any) {
        if (e?.response?.status === 403) {
          setPermissionDenied(true);
        }
      } finally {
        setPermCheckLoading(false);
      }
    })();
  }, []);

  const doSearch = useCallback(async () => {
    const query = q.trim();
    if (query.length < 2) {
      setError('أدخل كلمتين على الأقل للبحث');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params: any = { q: query };
      if (filter !== 'all') params.type = filter;
      const res = await api.get('/archives/search', { params });
      setResults(res.data.results || { students: [], teachers: [], courses: [] });
      setTotal(res.data.total || 0);
      setSearched(true);
    } catch (e: any) {
      const msg = e?.response?.status === 403
        ? 'ليست لديك صلاحية البحث في الأرشيف'
        : (e?.response?.data?.detail || 'فشل البحث');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [q, filter]);

  const go = (semesterId: string) => router.push(`/archive-details?semesterId=${semesterId}` as any);

  return (
    <>
      <Stack.Screen options={{ title: 'البحث في الأرشيف', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.headerBar}>
          <Text style={styles.headerTitle}>🔍 البحث في الأرشيف</Text>
          <Text style={styles.headerSubtitle}>ابحث في كل الفصول المؤرشفة عن طالب، معلم، أو مقرر</Text>
        </View>

        {permCheckLoading ? (
          <View style={styles.placeholder}>
            <ActivityIndicator size="large" color="#6a1b9a" />
          </View>
        ) : permissionDenied ? (
          <View style={styles.placeholder}>
            <Ionicons name="lock-closed" size={56} color="#bbb" />
            <Text style={styles.placeholderText}>
              ليست لديك صلاحية البحث في الأرشيف
            </Text>
            <Text style={[styles.placeholderText, { fontSize: 12, color: '#aaa', marginTop: 6 }]}>
              يرجى التواصل مع المسؤول لمنحك الصلاحية المناسبة
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="#888" />
          <TextInput
            style={styles.searchInput}
            placeholder="اكتب اسماً أو رقماً ثم اضغط بحث..."
            value={q}
            onChangeText={setQ}
            onSubmitEditing={doSearch}
            returnKeyType="search"
            testID="archive-search-q"
          />
          <TouchableOpacity
            style={styles.searchBtn}
            onPress={doSearch}
            disabled={loading}
            testID="do-archive-search"
          >
            <Text style={styles.searchBtnText}>بحث</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.filterRow}>
          <FilterChip label="الكل" active={filter === 'all'} onPress={() => setFilter('all')} />
          <FilterChip label="طلاب" active={filter === 'students'} onPress={() => setFilter('students')} />
          <FilterChip label="معلمون" active={filter === 'teachers'} onPress={() => setFilter('teachers')} />
          <FilterChip label="مقررات" active={filter === 'courses'} onPress={() => setFilter('courses')} />
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={16} color="#c62828" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 30 }}>
          {loading ? (
            <ActivityIndicator size="large" color="#6a1b9a" style={{ marginTop: 30 }} />
          ) : !searched ? (
            <View style={styles.placeholder}>
              <Ionicons name="archive-outline" size={56} color="#ddd" />
              <Text style={styles.placeholderText}>اكتب كلمة للبحث في الأرشيف</Text>
            </View>
          ) : total === 0 ? (
            <View style={styles.placeholder}>
              <Ionicons name="search-outline" size={56} color="#ddd" />
              <Text style={styles.placeholderText}>لا توجد نتائج لـ &quot;{q}&quot;</Text>
            </View>
          ) : (
            <>
              <Text style={styles.totalText}>
                {total} نتيجة في الأرشيف لـ &quot;{q}&quot;
              </Text>

              {results.students?.length > 0 && (filter === 'all' || filter === 'students') && (
                <Section title="الطلاب" icon="people" color="#1565c0" count={results.students.length}>
                  {results.students.map((s: any, i: number) => (
                    <TouchableOpacity
                      key={`s-${s.id}-${i}`}
                      style={styles.resultRow}
                      onPress={() => go(s.semester_id)}
                      testID={`result-student-${s.id}`}
                    >
                      <View style={[styles.resIcon, { backgroundColor: '#1565c020' }]}>
                        <Ionicons name="person" size={16} color="#1565c0" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.resTitle}>{s.full_name}</Text>
                        <Text style={styles.resMeta}>{s.student_id || '-'} • {s.semester_label}</Text>
                      </View>
                      <Ionicons name="chevron-back" size={16} color="#bbb" />
                    </TouchableOpacity>
                  ))}
                </Section>
              )}

              {results.teachers?.length > 0 && (filter === 'all' || filter === 'teachers') && (
                <Section title="المعلمون" icon="school" color="#ef6c00" count={results.teachers.length}>
                  {results.teachers.map((t: any, i: number) => (
                    <TouchableOpacity
                      key={`t-${t.id}-${i}`}
                      style={styles.resultRow}
                      onPress={() => go(t.semester_id)}
                      testID={`result-teacher-${t.id}`}
                    >
                      <View style={[styles.resIcon, { backgroundColor: '#ef6c0020' }]}>
                        <Ionicons name="school" size={16} color="#ef6c00" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.resTitle}>{t.full_name}</Text>
                        <Text style={styles.resMeta}>{t.teacher_id || '-'} • {t.semester_label}</Text>
                      </View>
                      <Ionicons name="chevron-back" size={16} color="#bbb" />
                    </TouchableOpacity>
                  ))}
                </Section>
              )}

              {results.courses?.length > 0 && (filter === 'all' || filter === 'courses') && (
                <Section title="المقررات" icon="book" color="#2e7d32" count={results.courses.length}>
                  {results.courses.map((c: any, i: number) => (
                    <TouchableOpacity
                      key={`c-${c.id}-${i}`}
                      style={styles.resultRow}
                      onPress={() => go(c.semester_id)}
                      testID={`result-course-${c.id}`}
                    >
                      <View style={[styles.resIcon, { backgroundColor: '#2e7d3220' }]}>
                        <Ionicons name="book" size={16} color="#2e7d32" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.resTitle}>{c.name}</Text>
                        <Text style={styles.resMeta}>
                          {c.code} {c.teacher_name ? `• ${c.teacher_name}` : ''} • {c.semester_label}
                        </Text>
                      </View>
                      <Ionicons name="chevron-back" size={16} color="#bbb" />
                    </TouchableOpacity>
                  ))}
                </Section>
              )}
            </>
          )}
        </ScrollView>
          </>
        )}
      </SafeAreaView>
    </>
  );
}

const FilterChip = ({ label, active, onPress }: any) => (
  <TouchableOpacity
    style={[styles.chip, active && styles.chipActive]}
    onPress={onPress}
    testID={`archive-filter-${label}`}
  >
    <Text style={[styles.chipText, active && { color: '#fff' }]}>{label}</Text>
  </TouchableOpacity>
);

const Section = ({ title, icon, color, count, children }: any) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={styles.sectionTitle}>{title} ({count})</Text>
    </View>
    {children}
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f7' },
  headerBar: { backgroundColor: '#6a1b9a', paddingTop: 18, paddingBottom: 18, paddingHorizontal: 18 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff', textAlign: 'right' },
  headerSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 4, textAlign: 'right' },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff',
    margin: 12, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 10, borderWidth: 1, borderColor: '#e0e0e0',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#222', textAlign: 'right', paddingVertical: 6, outlineWidth: 0 as any },
  searchBtn: { backgroundColor: '#6a1b9a', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  searchBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  filterRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 6, marginBottom: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0' },
  chipActive: { backgroundColor: '#6a1b9a', borderColor: '#6a1b9a' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#555' },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#ffebee', marginHorizontal: 12, padding: 10, borderRadius: 8,
  },
  errorText: { color: '#c62828', fontSize: 12, fontWeight: '600' },
  totalText: { fontSize: 12, color: '#666', marginBottom: 8, fontWeight: '600' },
  placeholder: { alignItems: 'center', paddingTop: 60 },
  placeholderText: { color: '#aaa', marginTop: 14, fontSize: 14 },
  section: { backgroundColor: '#fff', borderRadius: 10, marginBottom: 10, overflow: 'hidden' },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0', backgroundColor: '#fafafa',
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#333' },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  resIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  resTitle: { fontSize: 13, fontWeight: '700', color: '#222' },
  resMeta: { fontSize: 11, color: '#888', marginTop: 2 },
});

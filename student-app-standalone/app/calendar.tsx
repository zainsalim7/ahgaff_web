import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import api from '../src/services/api';

interface CalendarEvent {
  id: string;
  event_name: string;
  event_type: string;
  notes?: string;
  gregorian_date: string;
  hijri_date: string;
  hijri_formatted: string;
  weekday_ar: string;
}

const TYPE_META: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  general: { label: 'عام', color: '#1565c0', bg: '#e3f2fd', icon: 'information-circle' },
  holiday: { label: 'إجازة', color: '#2e7d32', bg: '#e8f5e9', icon: 'sunny' },
  exam: { label: 'امتحان', color: '#c62828', bg: '#ffebee', icon: 'document-text' },
  semester_start: { label: 'بداية فصل', color: '#6a1b9a', bg: '#f3e5f5', icon: 'play-circle' },
  semester_end: { label: 'نهاية فصل', color: '#ef6c00', bg: '#fff3e0', icon: 'stop-circle' },
  registration: { label: 'تسجيل', color: '#00838f', bg: '#e0f7fa', icon: 'create' },
};

const getMeta = (type: string) => TYPE_META[type] || TYPE_META.general;

export default function CalendarPublicScreen() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get('/calendar/events');
        setEvents(r.data || []);
      } catch (e) {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // عداد لكل نوع
  const counts = useMemo(() => {
    const result: Record<string, number> = { all: events.length };
    Object.keys(TYPE_META).forEach((k) => {
      result[k] = events.filter((e) => e.event_type === k).length;
    });
    return result;
  }, [events]);

  // فرز وتجميع حسب الشهر الميلادي
  const grouped = useMemo(() => {
    const filtered = filterType === 'all' ? events : events.filter((e) => e.event_type === filterType);
    const map = new Map<string, CalendarEvent[]>();
    filtered.forEach((ev) => {
      const key = ev.gregorian_date.substring(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    });
    return Array.from(map.keys())
      .sort()
      .map((k) => ({ month: k, items: map.get(k)! }));
  }, [events, filterType]);

  const monthName = (key: string) => {
    const [y, m] = key.split('-');
    const months = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
    ];
    return `${months[parseInt(m, 10) - 1]} ${y}`;
  };

  const isUpcoming = (dateStr: string) => {
    const today = new Date().toISOString().substring(0, 10);
    return dateStr >= today;
  };

  const nextEvent = useMemo(() => {
    const today = new Date().toISOString().substring(0, 10);
    return events.find((e) => e.gregorian_date >= today) || null;
  }, [events]);

  // قائمة الفلاتر بترتيب مدروس
  const filters: { value: string; label: string; color: string; icon: any }[] = [
    { value: 'all', label: 'الكل', color: '#455a64', icon: 'apps' },
    { value: 'semester_start', label: 'بداية فصل', color: '#6a1b9a', icon: 'play-circle' },
    { value: 'semester_end', label: 'نهاية فصل', color: '#ef6c00', icon: 'stop-circle' },
    { value: 'exam', label: 'امتحان', color: '#c62828', icon: 'document-text' },
    { value: 'holiday', label: 'إجازة', color: '#2e7d32', icon: 'sunny' },
    { value: 'registration', label: 'تسجيل', color: '#00838f', icon: 'create' },
    { value: 'general', label: 'عام', color: '#1565c0', icon: 'information-circle' },
  ];

  return (
    <>
      <Stack.Screen
        options={{ title: 'التقويم الجامعي', headerBackTitle: 'رجوع' }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {/* Header */}
        <View style={styles.headerCard}>
          <Ionicons name="calendar" size={32} color="#fff" />
          <Text style={styles.headerTitle}>التقويم الجامعي</Text>
          <Text style={styles.headerSub}>{events.length} حدث | بالميلادي والهجري</Text>
        </View>

        {/* Next event highlight */}
        {nextEvent && (
          <View style={[styles.nextCard, { backgroundColor: getMeta(nextEvent.event_type).bg }]}>
            <View style={styles.nextHeader}>
              <Ionicons name="notifications" size={18} color={getMeta(nextEvent.event_type).color} />
              <Text style={[styles.nextLabel, { color: getMeta(nextEvent.event_type).color }]}>
                الحدث القادم
              </Text>
            </View>
            <Text style={[styles.nextName, { color: getMeta(nextEvent.event_type).color }]}>
              {nextEvent.event_name}
            </Text>
            <View style={styles.nextDates}>
              <Text style={styles.nextDate}>
                {nextEvent.weekday_ar} {nextEvent.gregorian_date}
              </Text>
              <Text style={styles.nextDateHijri}>{nextEvent.hijri_formatted}</Text>
            </View>
          </View>
        )}

        {/* فلاتر بشكل grid منظم */}
        <View style={styles.filtersSection}>
          <Text style={styles.filtersTitle}>تصفية حسب النوع</Text>
          <View style={styles.filtersGrid}>
            {filters.map((f) => {
              const isActive = filterType === f.value;
              const count = counts[f.value] || 0;
              return (
                <TouchableOpacity
                  key={f.value}
                  style={[
                    styles.filterChip,
                    isActive && { backgroundColor: f.color, borderColor: f.color },
                    !isActive && { borderColor: f.color },
                  ]}
                  onPress={() => setFilterType(f.value)}
                  testID={`filter-${f.value}`}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={f.icon}
                    size={14}
                    color={isActive ? '#fff' : f.color}
                  />
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: isActive ? '#fff' : f.color },
                    ]}
                  >
                    {f.label}
                  </Text>
                  <View
                    style={[
                      styles.filterBadge,
                      {
                        backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : f.color + '22',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterBadgeText,
                        { color: isActive ? '#fff' : f.color },
                      ]}
                    >
                      {count}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Events list */}
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#1565c0" />
            </View>
          ) : grouped.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={56} color="#bbb" />
              <Text style={styles.emptyText}>لا توجد أحداث</Text>
              <Text style={styles.emptySub}>
                {filterType !== 'all' ? 'جرب تغيير الفلتر' : 'لم يتم إدخال أحداث بعد'}
              </Text>
            </View>
          ) : (
            grouped.map((group) => (
              <View key={group.month}>
                <Text style={styles.monthHeader}>{monthName(group.month)}</Text>
                {group.items.map((ev) => {
                  const meta = getMeta(ev.event_type);
                  const upcoming = isUpcoming(ev.gregorian_date);
                  return (
                    <View
                      key={ev.id}
                      style={[styles.eventCard, !upcoming && styles.eventCardPast]}
                      testID={`event-${ev.id}`}
                    >
                      <View style={[styles.typeIconCircle, { backgroundColor: meta.bg }]}>
                        <Ionicons name={meta.icon} size={20} color={meta.color} />
                      </View>
                      <View style={styles.eventBody}>
                        <View style={styles.eventTopRow}>
                          <Text style={[styles.eventName, !upcoming && { color: '#888' }]}>
                            {ev.event_name}
                          </Text>
                          <View style={[styles.typeBadge, { backgroundColor: meta.color }]}>
                            <Text style={styles.typeBadgeText}>{meta.label}</Text>
                          </View>
                        </View>
                        <View style={styles.datesRow}>
                          <View style={styles.dateBox}>
                            <Ionicons name="calendar-clear-outline" size={13} color="#666" />
                            <Text style={styles.dateText}>
                              {ev.weekday_ar} - {ev.gregorian_date}
                            </Text>
                          </View>
                          <View style={styles.dateBox}>
                            <Ionicons name="moon-outline" size={13} color="#6a1b9a" />
                            <Text style={[styles.dateText, { color: '#6a1b9a' }]}>
                              {ev.hijri_formatted}
                            </Text>
                          </View>
                        </View>
                        {ev.notes ? (
                          <Text style={styles.notesText}>{ev.notes}</Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  center: { alignItems: 'center', padding: 32 },
  headerCard: {
    backgroundColor: '#1565c0',
    padding: 16,
    alignItems: 'center',
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 8 },
  headerSub: { color: '#bbdefb', fontSize: 12, marginTop: 4 },

  nextCard: {
    marginHorizontal: 12,
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  nextHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nextLabel: { fontSize: 12, fontWeight: '700' },
  nextName: { fontSize: 17, fontWeight: '800', marginTop: 6, textAlign: 'right' },
  nextDates: { flexDirection: 'row', gap: 12, marginTop: 6, flexWrap: 'wrap' },
  nextDate: { fontSize: 12, color: '#333' },
  nextDateHijri: { fontSize: 12, color: '#6a1b9a', fontWeight: '600' },

  /* الفئات - تصميم جديد */
  filtersSection: {
    marginHorizontal: 12,
    marginTop: 14,
    marginBottom: 4,
  },
  filtersTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
    marginBottom: 8,
    textAlign: 'right',
  },
  filtersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1.5,
    backgroundColor: '#fff',
    minHeight: 32,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  filterBadge: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },

  empty: { alignItems: 'center', padding: 40 },
  emptyText: { color: '#666', fontSize: 16, fontWeight: '600', marginTop: 12 },
  emptySub: { color: '#999', fontSize: 13, marginTop: 4 },

  monthHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1565c0',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 6,
    textAlign: 'right',
  },
  eventCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 4,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    alignItems: 'flex-start',
    gap: 10,
  },
  eventCardPast: { opacity: 0.6 },
  typeIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventBody: { flex: 1 },
  eventTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 6,
  },
  eventName: { flex: 1, fontSize: 14, fontWeight: '700', color: '#212121', textAlign: 'right' },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  typeBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  datesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  dateBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateText: { fontSize: 11, color: '#666' },
  notesText: {
    fontSize: 11,
    color: '#888',
    marginTop: 6,
    textAlign: 'right',
    fontStyle: 'italic',
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
});

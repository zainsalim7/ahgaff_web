import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../src/store/authStore';
import { useAuth, PERMISSIONS } from '../../src/contexts/AuthContext';
import {
  usersAPI,
  studentsAPI,
  departmentsAPI,
  coursesAPI,
  facultiesAPI,
  notificationsAPI,
} from '../../src/services/api';

/**
 * 🏛️ الصفحة الرئيسية الموحدة — لوحة الإحصائيات
 * تظهر لكل المستخدمين، كل عنصر مفلتر بصلاحيته الخاصة.
 */

const todayInArabic = () => {
  const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const now = new Date();
  return `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
};

interface StatCard {
  key: string;
  label: string;
  count: number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
  perms: string[];
  route: string;
  note?: string;
}

export default function HomeDashboardScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { hasAnyPermission } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [counts, setCounts] = useState({
    teachers: 0,
    students: 0,
    courses: 0,
    departments: 0,
    users: 0,
    faculties: 0,
  });
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchData = useCallback(async () => {
    const results = await Promise.allSettled([
      usersAPI.getAll('teacher'),
      studentsAPI.getAll(),
      coursesAPI.getAll(),
      departmentsAPI.getAll(),
      usersAPI.getAll(),
      facultiesAPI.getAll(),
      notificationsAPI.getAll({ limit: 5 }).catch(() => ({ data: [] })),
    ]);
    const get = (i: number) => (results[i].status === 'fulfilled' ? (results[i] as any).value.data : []);
    setCounts({
      teachers: (get(0) || []).length,
      students: (get(1) || []).length,
      courses: (get(2) || []).length,
      departments: (get(3) || []).length,
      users: (get(4) || []).length,
      faculties: (get(5) || []).length,
    });
    const notifsRaw = get(6);
    const notifs = Array.isArray(notifsRaw)
      ? notifsRaw
      : Array.isArray(notifsRaw?.notifications)
      ? notifsRaw.notifications
      : Array.isArray(notifsRaw?.items)
      ? notifsRaw.items
      : [];
    setNotifications(notifs.slice(0, 3));
    setUnreadCount(notifs.filter((n: any) => !n.read && !n.is_read).length);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const stats: StatCard[] = useMemo(() => [
    {
      key: 'teachers', label: 'المعلمون', count: counts.teachers,
      icon: 'person', color: '#22c55e', bg: '#dcfce7',
      perms: [PERMISSIONS.MANAGE_TEACHERS, 'view_teachers'],
      route: '/manage-teachers',
    },
    {
      key: 'students', label: 'الطلاب', count: counts.students,
      icon: 'people', color: '#1565c0', bg: '#dbeafe',
      perms: [PERMISSIONS.MANAGE_STUDENTS, 'view_students'],
      route: '/students',
    },
    {
      key: 'courses', label: 'المقررات', count: counts.courses,
      icon: 'book', color: '#f97316', bg: '#ffedd5',
      perms: [PERMISSIONS.MANAGE_COURSES, 'view_courses'],
      route: '/(tabs)/courses',
    },
    {
      key: 'departments', label: 'الأقسام', count: counts.departments,
      icon: 'business', color: '#ef4444', bg: '#fee2e2',
      perms: [PERMISSIONS.MANAGE_DEPARTMENTS, 'view_departments'],
      route: '/add-department', note: `${counts.faculties} كليات`,
    },
    {
      key: 'users', label: 'المستخدمون', count: counts.users,
      icon: 'people-circle', color: '#7c3aed', bg: '#ede9fe',
      perms: [PERMISSIONS.MANAGE_USERS, 'view_users'],
      route: '/manage-users', note: 'الصلاحيات النشطة',
    },
    {
      key: 'faculties', label: 'الكليات', count: counts.faculties,
      icon: 'school', color: '#0ea5e9', bg: '#e0f2fe',
      perms: [PERMISSIONS.MANAGE_FACULTIES, 'view_faculties'],
      route: '/general-settings', note: 'جميع الكليات',
    },
  ], [counts]);

  const visibleStats = useMemo(() => {
    if (user?.role === 'admin') return stats;
    return stats.filter((s) => hasAnyPermission(s.perms));
  }, [stats, hasAnyPermission, user]);

  // مقطع الإشعارات
  const canViewNotifications = hasAnyPermission([
    PERMISSIONS.SEND_NOTIFICATIONS, 'manage_notifications', 'view_notifications',
  ]) || true; // الإشعارات الشخصية متاحة للجميع

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#1e40af" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Hero Header */}
        <View style={styles.hero}>
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle}>لوحة الإحصائيات</Text>
            <Text style={styles.heroSubtitle}>نظرة عامة على بيانات الجامعة</Text>
            <View style={styles.heroDate}>
              <Ionicons name="calendar-outline" size={14} color="#fff" />
              <Text style={styles.heroDateText}>{todayInArabic()}</Text>
            </View>
          </View>
          <View style={styles.heroIcon}>
            <Ionicons name="bar-chart" size={48} color="rgba(255,255,255,0.5)" />
          </View>
        </View>

        {/* Stats Grid */}
        {visibleStats.length > 0 ? (
          <View style={styles.grid}>
            {visibleStats.map((stat) => (
              <TouchableOpacity
                key={stat.key}
                style={styles.statCard}
                onPress={() => router.push(stat.route as any)}
                activeOpacity={0.7}
                data-testid={`stat-${stat.key}`}
              >
                <View style={styles.statRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.statCount} numberOfLines={1}>
                      {stat.count.toLocaleString('ar-EG')}
                    </Text>
                    <Text style={styles.statLabel}>{stat.label}</Text>
                  </View>
                  <View style={[styles.statIcon, { backgroundColor: stat.bg }]}>
                    <Ionicons name={stat.icon} size={26} color={stat.color} />
                  </View>
                </View>
                <View style={styles.statFoot}>
                  {stat.note ? (
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 4 }}>
                      <View style={[styles.dot, { backgroundColor: stat.color }]} />
                      <Text style={styles.statNote}>{stat.note}</Text>
                    </View>
                  ) : <View />}
                  <View style={styles.statBtn}>
                    <Text style={[styles.statBtnText, { color: stat.color }]}>التفاصيل</Text>
                    <Ionicons name="arrow-back" size={12} color={stat.color} />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="lock-closed-outline" size={56} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>لا توجد إحصائيات متاحة</Text>
            <Text style={styles.emptyText}>
              ليس لديك صلاحية لعرض الإحصائيات.{'\n'}يمكنك الوصول لما لديك من القائمة الجانبية.
            </Text>
          </View>
        )}

        {/* Quick Access for Teacher / Student */}
        {user?.role === 'teacher' && (
          <View style={[styles.quickCard, { backgroundColor: '#fff' }]}>
            <Text style={styles.sectionTitle}>الوصول السريع</Text>
            <View style={styles.quickRow}>
              <TouchableOpacity style={styles.quickItem} onPress={() => router.push('/(tabs)/my-lectures' as any)}>
                <View style={[styles.quickIcon, { backgroundColor: '#dcfce7' }]}>
                  <Ionicons name="calendar" size={22} color="#16a34a" />
                </View>
                <Text style={styles.quickLabel}>محاضراتي</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickItem} onPress={() => router.push('/(tabs)/courses' as any)}>
                <View style={[styles.quickIcon, { backgroundColor: '#dbeafe' }]}>
                  <Ionicons name="book" size={22} color="#1565c0" />
                </View>
                <Text style={styles.quickLabel}>مقرراتي</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {user?.role === 'student' && (
          <View style={[styles.quickCard, { backgroundColor: '#fff' }]}>
            <Text style={styles.sectionTitle}>الوصول السريع</Text>
            <View style={styles.quickRow}>
              <TouchableOpacity style={styles.quickItem} onPress={() => router.push('/(tabs)/my-attendance' as any)}>
                <View style={[styles.quickIcon, { backgroundColor: '#dbeafe' }]}>
                  <Ionicons name="checkbox" size={22} color="#1565c0" />
                </View>
                <Text style={styles.quickLabel}>حضوري</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickItem} onPress={() => router.push('/(tabs)/my-schedule' as any)}>
                <View style={[styles.quickIcon, { backgroundColor: '#ede9fe' }]}>
                  <Ionicons name="calendar" size={22} color="#7c3aed" />
                </View>
                <Text style={styles.quickLabel}>جدولي</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Notifications & Alerts */}
        {canViewNotifications && (
          <View style={styles.notifCard}>
            <View style={styles.notifHeader}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                <View style={styles.notifBadge}>
                  <Ionicons name="notifications" size={16} color="#f97316" />
                </View>
                <Text style={styles.sectionTitle}>التنبيهات والإشعارات</Text>
              </View>
              {unreadCount > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{unreadCount}</Text>
                </View>
              )}
            </View>
            {notifications.length > 0 ? (
              <View style={styles.notifList}>
                {notifications.map((n, i) => (
                  <View key={n.id || i} style={styles.notifItem}>
                    <View style={[
                      styles.notifSideBar,
                      { backgroundColor: i === 0 ? '#f97316' : i === 1 ? '#1565c0' : '#22c55e' }
                    ]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.notifTitle} numberOfLines={1}>{n.title || 'إشعار'}</Text>
                      <Text style={styles.notifBody} numberOfLines={2}>{n.message || n.body || ''}</Text>
                    </View>
                    <View style={[
                      styles.notifIcon,
                      { backgroundColor: i === 0 ? '#fff7ed' : i === 1 ? '#eff6ff' : '#f0fdf4' }
                    ]}>
                      <Ionicons
                        name={i === 0 ? 'warning' : i === 1 ? 'calendar' : 'checkmark-circle'}
                        size={18}
                        color={i === 0 ? '#f97316' : i === 1 ? '#1565c0' : '#22c55e'}
                      />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                <Ionicons name="notifications-outline" size={40} color="#cbd5e1" />
                <Text style={{ color: '#94a3b8', marginTop: 8, fontSize: 13 }}>لا توجد إشعارات جديدة</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.viewAllBtn}
              onPress={() => router.push('/(tabs)/notifications' as any)}
            >
              <Ionicons name="arrow-back" size={14} color="#1565c0" />
              <Text style={styles.viewAllText}>عرض جميع الإشعارات</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  scroll: { flex: 1 },
  scrollContent: { padding: 14 },

  /* Hero */
  hero: {
    backgroundColor: '#1e40af',
    borderRadius: 20,
    padding: 22,
    marginBottom: 18,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#1e40af',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 5,
  },
  heroContent: { flex: 1 },
  heroTitle: { fontSize: 24, fontWeight: '800', color: '#fff', textAlign: 'right' },
  heroSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 4, textAlign: 'right' },
  heroDate: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
    marginTop: 14, alignSelf: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  heroDateText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  heroIcon: { marginLeft: 12 },

  /* Stats grid */
  grid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    width: 'calc(33.333% - 7px)' as any,
    minWidth: 160,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  statRow: { flexDirection: 'row-reverse', alignItems: 'center' },
  statIcon: {
    width: 52, height: 52, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  statCount: { fontSize: 30, fontWeight: '800', color: '#0f172a', textAlign: 'right' },
  statLabel: { fontSize: 13, color: '#64748b', marginTop: 2, fontWeight: '600', textAlign: 'right' },
  statFoot: {
    flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 14, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statNote: { fontSize: 11, color: '#64748b' },
  statBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3 },
  statBtnText: { fontSize: 11, fontWeight: '700' },

  /* Empty */
  emptyState: {
    backgroundColor: '#fff', borderRadius: 16, padding: 40,
    alignItems: 'center', marginBottom: 14,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginTop: 12 },
  emptyText: { fontSize: 13, color: '#94a3b8', textAlign: 'center', marginTop: 6, lineHeight: 20 },

  /* Section / Quick */
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a', textAlign: 'right' },
  quickCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14 },
  quickRow: { flexDirection: 'row-reverse', gap: 12, marginTop: 12 },
  quickItem: { flex: 1, alignItems: 'center', padding: 14, backgroundColor: '#f8fafc', borderRadius: 12 },
  quickIcon: {
    width: 44, height: 44, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  quickLabel: { fontSize: 13, fontWeight: '700', color: '#0f172a' },

  /* Notifications */
  notifCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14 },
  notifHeader: {
    flexDirection: 'row-reverse', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 14,
  },
  notifBadge: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: '#fff7ed', justifyContent: 'center', alignItems: 'center',
  },
  unreadBadge: {
    backgroundColor: '#ef4444', paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 10, minWidth: 22, alignItems: 'center',
  },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  notifList: { gap: 10 },
  notifItem: {
    flexDirection: 'row-reverse', alignItems: 'center',
    backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, gap: 10,
    overflow: 'hidden',
  },
  notifSideBar: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  notifTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a', textAlign: 'right' },
  notifBody: { fontSize: 11, color: '#64748b', marginTop: 2, textAlign: 'right' },
  notifIcon: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  viewAllBtn: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 4,
    justifyContent: 'center', marginTop: 14, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  viewAllText: { color: '#1565c0', fontSize: 12, fontWeight: '700' },
});

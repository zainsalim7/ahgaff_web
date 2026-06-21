import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usersAPI, studentsAPI, departmentsAPI, coursesAPI, facultiesAPI } from '../../src/services/api';
import { LoadingScreen } from '../../src/components/LoadingScreen';
import { useAuth, PERMISSIONS } from '../../src/contexts/AuthContext';

/**
 * 📊 صفحة الإدارة — Dashboard إحصائيات فقط
 *
 * السبب: كان هناك تكرار لقائمة الروابط في 3 أماكن (السايدبار، الرئيسية، صفحة الإدارة)
 * مما أدى إلى تناقضات في خرائط الصلاحيات. الحل: مصدر واحد للحقيقة.
 *
 * هذه الصفحة تعرض إحصائيات لمحة سريعة فقط. للوصول للصفحات استخدم:
 *   - الصفحة الرئيسية (الكاردات)
 *   - القائمة الجانبية (السايدبار)
 */
export default function AdminDashboardScreen() {
  const router = useRouter();
  const { hasAnyPermission } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [counts, setCounts] = useState({
    teachers: 0,
    students: 0,
    departments: 0,
    courses: 0,
    faculties: 0,
    users: 0,
  });

  const fetchCounts = useCallback(async () => {
    // 🛡️ Promise.allSettled: لو فشل أي API بـ 403، البقية تكمل
    const results = await Promise.allSettled([
      usersAPI.getAll('teacher'),
      studentsAPI.getAll(),
      departmentsAPI.getAll(),
      coursesAPI.getAll(),
      facultiesAPI.getAll(),
      usersAPI.getAll(),
    ]);
    const get = (i: number) => (results[i].status === 'fulfilled' ? (results[i] as any).value.data : []);
    setCounts({
      teachers: get(0)?.length || 0,
      students: get(1)?.length || 0,
      departments: get(2)?.length || 0,
      courses: get(3)?.length || 0,
      faculties: get(4)?.length || 0,
      users: get(5)?.length || 0,
    });
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchCounts();
  };

  if (loading) return <LoadingScreen />;

  // 📌 كروت الإحصائيات — تظهر فقط ما لديه المستخدم صلاحية لرؤيته
  const stats = [
    {
      key: 'students',
      label: 'الطلاب',
      count: counts.students,
      icon: 'people',
      color: '#1565c0',
      bg: '#e3f2fd',
      perms: [PERMISSIONS.MANAGE_STUDENTS, 'view_students'],
      route: '/students',
    },
    {
      key: 'teachers',
      label: 'المعلمون',
      count: counts.teachers,
      icon: 'person',
      color: '#4caf50',
      bg: '#e8f5e9',
      perms: [PERMISSIONS.MANAGE_TEACHERS, 'view_teachers'],
      route: '/manage-teachers',
    },
    {
      key: 'courses',
      label: 'المقررات',
      count: counts.courses,
      icon: 'book',
      color: '#ff9800',
      bg: '#fff3e0',
      perms: [PERMISSIONS.MANAGE_COURSES, 'view_courses'],
      route: '/(tabs)/courses',
    },
    {
      key: 'departments',
      label: 'الأقسام',
      count: counts.departments,
      icon: 'business',
      color: '#e91e63',
      bg: '#fce4ec',
      perms: [PERMISSIONS.MANAGE_DEPARTMENTS, 'view_departments'],
      route: '/add-department',
    },
    {
      key: 'faculties',
      label: 'الكليات',
      count: counts.faculties,
      icon: 'school',
      color: '#673ab7',
      bg: '#ede7f6',
      perms: [PERMISSIONS.MANAGE_FACULTIES, 'view_faculties'],
      route: '/general-settings',
    },
    {
      key: 'users',
      label: 'المستخدمون',
      count: counts.users,
      icon: 'people-circle',
      color: '#7b1fa2',
      bg: '#f3e5f5',
      perms: [PERMISSIONS.MANAGE_USERS, 'view_users'],
      route: '/manage-users',
    },
  ];

  const visibleStats = stats.filter((s) => hasAnyPermission(s.perms));

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="analytics" size={28} color="#fff" />
          </View>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={styles.headerTitle}>لوحة الإحصائيات</Text>
            <Text style={styles.headerSubtitle}>نظرة عامة على بيانات الجامعة</Text>
          </View>
        </View>

        {/* Stats Grid */}
        {visibleStats.length > 0 ? (
          <View style={styles.grid}>
            {visibleStats.map((stat) => (
              <TouchableOpacity
                key={stat.key}
                style={styles.card}
                onPress={() => router.push(stat.route as any)}
                activeOpacity={0.7}
                data-testid={`stat-card-${stat.key}`}
              >
                <View style={[styles.cardIcon, { backgroundColor: stat.bg }]}>
                  <Ionicons name={stat.icon as any} size={28} color={stat.color} />
                </View>
                <Text style={styles.cardCount}>{stat.count.toLocaleString('ar-EG')}</Text>
                <Text style={styles.cardLabel}>{stat.label}</Text>
                <View style={styles.cardArrow}>
                  <Ionicons name="arrow-back" size={14} color={stat.color} />
                  <Text style={[styles.cardArrowText, { color: stat.color }]}>عرض</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <Ionicons name="lock-closed-outline" size={64} color="#cfd6e1" />
            <Text style={styles.emptyTitle}>لا توجد إحصائيات متاحة</Text>
            <Text style={styles.emptyText}>
              ليس لديك صلاحية لرؤية أي إحصائيات هنا.
              {'\n'}يمكنك الوصول لما لديك صلاحية له من القائمة الجانبية أو الرئيسية.
            </Text>
          </View>
        )}

        {/* Info Note */}
        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={18} color="#5b6678" />
          <Text style={styles.noteText}>
            للوصول لجميع الصفحات والأدوات، استخدم القائمة الجانبية (☰) أو الصفحة الرئيسية.
          </Text>
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },

  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#1565c0',
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    shadowColor: '#1565c0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'right',
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 3,
    textAlign: 'right',
  },

  grid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  card: {
    width: 'calc(50% - 6px)' as any,
    minWidth: 140,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardCount: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  cardLabel: {
    fontSize: 13,
    color: '#5b6678',
    marginTop: 4,
    fontWeight: '600',
  },
  cardArrow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#eef1f5',
    width: '100%',
    justifyContent: 'center',
  },
  cardArrowText: {
    fontSize: 11,
    fontWeight: '600',
  },

  note: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    borderRightWidth: 3,
    borderRightColor: '#5b6678',
  },
  noteText: {
    fontSize: 12,
    color: '#5b6678',
    flex: 1,
    textAlign: 'right',
    lineHeight: 18,
  },

  empty: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a2e',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 13,
    color: '#8a95a8',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
});

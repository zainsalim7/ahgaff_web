import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usersAPI, studentsAPI, departmentsAPI, coursesAPI, scopeAPI } from '../../src/services/api';
import { LoadingScreen } from '../../src/components/LoadingScreen';

const checkPermission = (userRole: string, userPermissions: string[], requiredPermission: string): boolean => {
  if (userRole === 'admin') return true;
  return userPermissions?.includes(requiredPermission) || false;
};

export default function AdminScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userRole, setUserRole] = useState<string>('');
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [userScope, setUserScope] = useState<any>(null);
  const [counts, setCounts] = useState({
    teachers: 0, students: 0, departments: 0, courses: 0, faculties: 0,
  });

  const loadUserData = useCallback(async () => {
    try {
      const storedUser = await AsyncStorage.getItem('user');
      if (storedUser) {
        const user = JSON.parse(storedUser);
        setUserRole(user.role || '');
        setUserPermissions(user.permissions || []);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  }, []);

  const fetchCounts = useCallback(async () => {
    try {
      try {
        const scopeRes = await scopeAPI.get();
        setUserScope(scopeRes.data);
      } catch (e) {}
      const [teachers, students, departments, courses] = await Promise.all([
        usersAPI.getAll('teacher'),
        studentsAPI.getAll(),
        departmentsAPI.getAll(),
        coursesAPI.getAll(),
      ]);
      setCounts({
        teachers: teachers.data?.length || 0,
        students: students.data?.length || 0,
        departments: departments.data?.length || 0,
        courses: courses.data?.length || 0,
        faculties: 0,
      });
    } catch (error) {
      setCounts({ teachers: 0, students: 0, departments: 0, courses: 0, faculties: 0 });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadUserData();
    fetchCounts();
  }, [loadUserData, fetchCounts]);

  const onRefresh = () => { setRefreshing(true); fetchCounts(); };

  if (loading) return <LoadingScreen />;

  // تعريف المجموعات
  const allGroups = [
    {
      groupTitle: 'إدارة البيانات',
      groupIcon: 'folder-open',
      groupColor: '#1565c0',
      items: [
        { title: 'الكليات', icon: 'school', color: '#673ab7', bg: '#ede7f6', route: '/general-settings', permission: 'manage_faculties', count: counts.faculties },
        { title: 'الأقسام', icon: 'business', color: '#e91e63', bg: '#fce4ec', route: '/add-department', permission: 'manage_departments', count: counts.departments },
        { title: 'المعلمين', icon: 'person', color: '#4caf50', bg: '#e8f5e9', route: '/manage-teachers', permission: 'manage_users', count: counts.teachers },
        { title: 'الطلاب', icon: 'people', color: '#1565c0', bg: '#e3f2fd', route: '/students', permission: 'manage_students', count: counts.students },
        { title: 'المقررات', icon: 'book', color: '#ff9800', bg: '#fff3e0', route: '/courses', permission: 'manage_courses', count: counts.courses },
      ],
    },
    {
      groupTitle: 'الجدول والحضور',
      groupIcon: 'calendar',
      groupColor: '#9c27b0',
      items: [
        { title: 'جدول المحاضرات', icon: 'calendar', color: '#9c27b0', bg: '#f3e5f5', route: '/schedule', permission: 'manage_lectures' },
        { title: 'لوحة الأقسام', icon: 'grid', color: '#009688', bg: '#e0f2f1', route: '/department-dashboard', permission: 'view_reports' },
        { title: 'الأوفلاين', icon: 'cloud-offline', color: '#607d8b', bg: '#eceff1', route: '/offline-sync', permission: null, teacherOnly: true },
      ],
    },
    {
      groupTitle: 'التقارير',
      groupIcon: 'bar-chart',
      groupColor: '#00bcd4',
      items: [
        { title: 'التقارير والتصدير', icon: 'document-text', color: '#00bcd4', bg: '#e0f7fa', route: '/reports', permission: 'view_reports' },
      ],
    },
    {
      groupTitle: 'الإشعارات',
      groupIcon: 'notifications',
      groupColor: '#ff9800',
      items: [
        { title: 'إرسال إشعار', icon: 'send', color: '#4caf50', bg: '#e8f5e9', route: '/send-notification', permission: 'send_notifications' },
        { title: 'سجل الإشعارات', icon: 'notifications', color: '#1565c0', bg: '#e3f2fd', route: '/manage-notifications', permission: 'send_notifications' },
      ],
    },
    {
      groupTitle: 'النظام والصلاحيات',
      groupIcon: 'settings',
      groupColor: '#f44336',
      items: [
        { title: 'الإعدادات', icon: 'settings', color: '#1565c0', bg: '#e3f2fd', route: '/general-settings', permission: null, adminOnly: true },
        { title: 'المستخدمين', icon: 'people-circle', color: '#673ab7', bg: '#ede7f6', route: '/manage-users', permission: 'manage_users', adminOnly: true },
        { title: 'الأدوار', icon: 'shield-checkmark', color: '#ff5722', bg: '#fbe9e7', route: '/manage-roles', permission: 'manage_roles', adminOnly: true },
        { title: 'سجل النشاط', icon: 'list', color: '#3f51b5', bg: '#e8eaf6', route: '/activity-logs', permission: null, adminOnly: true },
      ],
    },
  ];

  // فلترة حسب الصلاحيات
  const canSee = (item: any) => {
    if (userRole === 'admin') return true;
    if (item.teacherOnly) return userRole === 'teacher' || userPermissions?.includes('record_attendance');
    if (item.adminOnly) {
      if (item.route === '/general-settings') return userScope?.can_manage_settings === true || userScope?.level === 'university';
      if (item.route === '/activity-logs') return false;
      if (item.route === '/manage-roles') return userPermissions?.includes('manage_roles');
      return false;
    }
    if (item.permission) {
      const has = checkPermission(userRole, userPermissions, item.permission);
      if (!has) return false;
      if (item.permission === 'manage_faculties') return userScope?.level === 'university' || userScope?.level === 'faculty';
      if (item.permission === 'manage_departments') return ['university', 'faculty', 'department'].includes(userScope?.level);
      return true;
    }
    return false;
  };

  const filteredGroups = allGroups
    .map(g => ({ ...g, items: g.items.filter(canSee) }))
    .filter(g => g.items.length > 0);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={styles.pageHeader} data-testid="admin-header">
          <Ionicons name="shield-checkmark" size={28} color="#1565c0" />
          <Text style={styles.pageTitle}>لوحة التحكم</Text>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow} data-testid="admin-stats">
          {[
            { label: 'المعلمين', count: counts.teachers, icon: 'person', color: '#4caf50' },
            { label: 'الطلاب', count: counts.students, icon: 'people', color: '#1565c0' },
            { label: 'المقررات', count: counts.courses, icon: 'book', color: '#ff9800' },
            { label: 'الأقسام', count: counts.departments, icon: 'business', color: '#e91e63' },
          ].map((stat, i) => (
            <View key={i} style={styles.statItem}>
              <View style={[styles.statIcon, { backgroundColor: stat.color + '15' }]}>
                <Ionicons name={stat.icon as any} size={18} color={stat.color} />
              </View>
              <Text style={styles.statNum}>{stat.count}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Groups */}
        {filteredGroups.map((group, gi) => (
          <View key={gi} style={styles.groupContainer} data-testid={`admin-group-${gi}`}>
            <View style={styles.groupHeader}>
              <Ionicons name={group.groupIcon as any} size={18} color={group.groupColor} />
              <Text style={[styles.groupTitle, { color: group.groupColor }]}>{group.groupTitle}</Text>
            </View>
            <View style={styles.grid}>
              {group.items.map((item, ii) => (
                <TouchableOpacity
                  key={ii}
                  style={styles.gridItem}
                  onPress={() => router.replace(item.route as any)}
                  activeOpacity={0.7}
                  data-testid={`admin-btn-${item.route.replace(/\//g, '-').slice(1)}`}
                >
                  <View style={[styles.gridIcon, { backgroundColor: item.bg }]}>
                    <Ionicons name={item.icon as any} size={26} color={item.color} />
                  </View>
                  <Text style={styles.gridTitle} numberOfLines={1}>{item.title}</Text>
                  {item.count > 0 && (
                    <Text style={styles.gridCount}>{item.count}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16 },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1a1a2e',
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  statNum: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a2e',
  },
  statLabel: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  groupContainer: {
    marginBottom: 20,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  groupTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridItem: {
    width: Platform.OS === 'web' ? 'calc(25% - 8px)' as any : '47%' as any,
    minWidth: 90,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  gridIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  gridTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  gridCount: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
});

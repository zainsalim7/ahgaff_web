import React, { useEffect, useState, useCallback } from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/authStore';
import { useOfflineSyncStore } from '../../src/store/offlineSyncStore';
import { institutionAPI } from '../../src/services/api';
import api from '../../src/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function TabsLayout() {
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const role = user?.role || '';
  const permissions = user?.permissions || [];
  const pendingCount = useOfflineSyncStore((state) => state.getPendingRecordsCount());
  const [institutionName, setInstitutionName] = useState('نظام الحضور');

  // 🆕 عدد طلبات اعتماد الحضور المعلّقة (للعميد + المدير)
  const [approvalCount, setApprovalCount] = useState(0);
  const canApproveAttendance = permissions.includes('approve_attendance_changes') || role === 'admin';
  const fetchApprovalCount = useCallback(async () => {
    if (!canApproveAttendance) return;
    try {
      const r = await api.get('/attendance-changes/pending-count');
      setApprovalCount(r.data?.count || 0);
    } catch (e) { /* silent */ }
  }, [canApproveAttendance]);
  useEffect(() => {
    if (!canApproveAttendance) return;
    fetchApprovalCount();
    const iv = setInterval(fetchApprovalCount, 60000); // كل 60 ثانية
    return () => clearInterval(iv);
  }, [fetchApprovalCount, canApproveAttendance]);

  const isReady = !isLoading && !!user && !!role;

  // تفعيل إشعارات Firebase (Web) و Expo Push (Mobile)
  useEffect(() => {
    if (!user) return;
    
    const initNotifications = async () => {
      try {
        if (Platform.OS === 'web') {
          const { requestNotificationPermission, onForegroundMessage } = await import('../../src/services/firebase');
          
          const fcmToken = await requestNotificationPermission();
          if (fcmToken) {
            const token = await AsyncStorage.getItem('token');
            const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
            await fetch(`${backendUrl}/api/notifications/register-token`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({ token: fcmToken, device_type: 'web' }),
            });
          }

          onForegroundMessage((payload) => {
            if (Notification.permission === 'granted') {
              new Notification(payload.notification?.title || 'جامعة الأحقاف', {
                body: payload.notification?.body || '',
                icon: '/icon.png',
                dir: 'rtl',
                lang: 'ar',
              });
            }
          });
        } else {
          // Mobile: استخدم Expo Notifications
          const { registerForPushNotifications, addNotificationReceivedListener } = await import('../../src/services/pushNotifications');
          await registerForPushNotifications();
          
          addNotificationReceivedListener((notification) => {
            console.log('Notification received:', notification);
          });
        }
      } catch (error) {
        console.log('Notifications init error:', error);
      }
    };

    initNotifications();
  }, [user]);

  // 🔑 التحقق من الصلاحيات الإدارية — مبني على الصلاحيات فقط (لا الدور)
  const hasAdminPermissions = isReady && (role === 'admin' ||
    permissions.includes('manage_users') ||
    permissions.includes('manage_students') || permissions.includes('view_students') ||
    permissions.includes('manage_faculties') || permissions.includes('view_faculties') ||
    permissions.includes('manage_departments') || permissions.includes('view_departments') ||
    permissions.includes('manage_courses') || permissions.includes('view_courses') ||
    permissions.includes('manage_teachers') || permissions.includes('view_teachers') ||
    permissions.includes('manage_enrollments') || permissions.includes('view_enrollments') ||
    permissions.includes('manage_roles'));

  // 🔑 تبويب المقررات — صلاحيات المقررات فقط (لا اسم دور)
  const hasCoursesPermission = isReady && (role === 'admin' ||
    permissions.includes('manage_courses') ||
    permissions.includes('view_courses'));

  // 🔑 تبويب "محاضراتي" — خاص بالمعلم فقط (بيانات شخصية: محاضراته الخاصة كمدرّس)
  const hasMyLecturesAccess = isReady && role === 'teacher';

  // هل المستخدم طالب؟ (لتبويبات الطالب فقط: حضوري، جدولي)
  const isStudent = isReady && role === 'student';

  // جلب اسم المؤسسة حسب المستخدم
  useEffect(() => {
    const fetchInstitution = async () => {
      if (!user) return;
      try {
        const response = await institutionAPI.get();
        if (response.data?.name) {
          setInstitutionName(response.data.name);
        }
      } catch (error) {
        console.log('Error fetching institution:', error);
      }
    };
    fetchInstitution();
  }, [user]);

  return (
    <Tabs
      key={`tabs-${role}-${permissions.length}`}
      screenOptions={{
        tabBarActiveTintColor: '#1565c0',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#e0e0e0',
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        headerStyle: {
          backgroundColor: '#1565c0',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'الرئيسية',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
          headerTitle: institutionName,
        }}
      />
      
      <Tabs.Screen
        name="admin"
        options={{
          title: 'الإعدادات الأساسية',
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="settings" size={size} color={color} />
              {pendingCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{pendingCount > 9 ? '9+' : pendingCount}</Text>
                </View>
              )}
              {approvalCount > 0 && (
                <View style={styles.approvalBadge} data-testid="approval-badge">
                  <Text style={styles.badgeText}>{approvalCount > 99 ? '99+' : approvalCount}</Text>
                </View>
              )}
            </View>
          ),
          headerTitle: 'الإعدادات الأساسية',
          href: hasAdminPermissions ? undefined : null,
        }}
      />

      <Tabs.Screen
        name="courses"
        options={{
          title: 'المقررات',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book" size={size} color={color} />
          ),
          headerShown: false,
          href: hasCoursesPermission ? undefined : null,
        }}
      />

      <Tabs.Screen
        name="my-attendance"
        options={{
          title: 'حضوري',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkmark-circle" size={size} color={color} />
          ),
          headerTitle: 'سجل حضوري',
          href: isStudent ? undefined : null,
        }}
      />

      <Tabs.Screen
        name="my-lectures"
        options={{
          title: 'محاضراتي',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar" size={size} color={color} />
          ),
          headerTitle: 'محاضراتي اليوم',
          href: hasMyLecturesAccess ? undefined : null,
        }}
      />

      <Tabs.Screen
        name="my-schedule"
        options={{
          title: 'جدولي',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar" size={size} color={color} />
          ),
          headerTitle: 'جدول محاضراتي',
          href: isStudent ? undefined : null,
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'حسابي',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
          headerTitle: 'الملف الشخصي',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#f44336',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  approvalBadge: {
    position: 'absolute',
    top: -4,
    left: -8,
    backgroundColor: '#ff9800',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
});

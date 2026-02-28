import React, { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/authStore';
import { useOfflineSyncStore } from '../../src/store/offlineSyncStore';
import { institutionAPI } from '../../src/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function TabsLayout() {
  const user = useAuthStore((state) => state.user);
  const role = user?.role || 'student';
  const permissions = user?.permissions || [];
  const pendingCount = useOfflineSyncStore((state) => state.getPendingRecordsCount());
  const [institutionName, setInstitutionName] = useState('نظام الحضور');

  // تفعيل إشعارات Firebase
  useEffect(() => {
    if (!user || Platform.OS !== 'web') return;
    
    const initNotifications = async () => {
      try {
        const { requestNotificationPermission, onForegroundMessage } = await import('../../src/services/firebase');
        
        const fcmToken = await requestNotificationPermission();
        if (fcmToken) {
          // Register token with backend
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
          console.log('FCM token registered successfully');
        }

        // Listen for foreground notifications
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
      } catch (error) {
        console.log('Notifications init error:', error);
      }
    };

    initNotifications();
  }, [user]);

  // التحقق من الصلاحيات الإدارية
  const hasAdminPermissions = role === 'admin' || 
    permissions.includes('manage_users') || 
    permissions.includes('manage_students') ||
    permissions.includes('manage_faculties') ||
    permissions.includes('manage_departments') ||
    permissions.includes('manage_courses') ||
    permissions.includes('manage_roles');
  
  // التحقق من صلاحية المقررات
  const hasCoursesPermission = role === 'admin' || 
    role === 'teacher' ||
    permissions.includes('manage_courses') ||
    permissions.includes('view_courses') ||
    permissions.includes('manage_lectures') ||
    permissions.includes('record_attendance');

  // هل المستخدم معلم؟
  const isTeacher = role === 'teacher';

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
          title: 'الإدارة',
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="settings" size={size} color={color} />
              {pendingCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{pendingCount > 9 ? '9+' : pendingCount}</Text>
                </View>
              )}
            </View>
          ),
          headerTitle: 'لوحة الإدارة',
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
          headerTitle: 'المقررات الدراسية',
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
          href: role === 'student' ? undefined : null,
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
          href: isTeacher ? undefined : null,
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
          href: role === 'student' ? undefined : null,
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
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
});

import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useOfflineSyncStore } from '../../src/store/offlineSyncStore';
import { View, Text, StyleSheet } from 'react-native';

export default function TabsLayout() {
  const pendingCount = useOfflineSyncStore((s) => s.getPendingCount());

  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: '#1b5e20',
      tabBarInactiveTintColor: '#9e9e9e',
      tabBarStyle: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e0e0e0', height: 64, paddingBottom: 10, paddingTop: 8, elevation: 8 },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      headerStyle: { backgroundColor: '#1b5e20', elevation: 0 },
      headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: 'bold', fontSize: 18 },
    }}>
      <Tabs.Screen name="index" options={{
        title: 'الرئيسية',
        tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        headerTitle: 'أستاذ الأحقاف',
      }} />
      <Tabs.Screen name="my-courses" options={{
        title: 'مقرراتي',
        tabBarIcon: ({ color, size }) => <Ionicons name="book" size={size} color={color} />,
        headerTitle: 'مقرراتي',
      }} />
      <Tabs.Screen name="take-attendance" options={{
        title: 'تحضير',
        tabBarIcon: ({ color, size }) => (
          <View>
            <Ionicons name="clipboard" size={size} color={color} />
            {pendingCount > 0 && (
              <View style={styles.badge}><Text style={styles.badgeText}>{pendingCount}</Text></View>
            )}
          </View>
        ),
        headerTitle: 'تسجيل الحضور',
      }} />
      <Tabs.Screen name="profile" options={{
        title: 'حسابي',
        tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size} color={color} />,
        headerTitle: 'الملف الشخصي',
      }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', top: -4, right: -8, backgroundColor: '#f44336', borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
});

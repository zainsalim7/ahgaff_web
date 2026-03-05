import React, { useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../src/store/authStore';
import { View, StyleSheet, I18nManager, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import api from '../src/services/api';

I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function registerForPushNotifications() {
  if (!Device.isDevice) return null;
  
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  if (finalStatus !== 'granted') return null;
  
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1b5e20',
      sound: 'default',
    });
  }
  
  const tokenData = await Notifications.getDevicePushTokenAsync();
  return tokenData.data;
}

export default function RootLayout() {
  const loadAuth = useAuthStore((state) => state.loadAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  
  useEffect(() => { loadAuth(); }, []);
  
  useEffect(() => {
    if (isAuthenticated) {
      registerForPushNotifications().then(async (fcmToken) => {
        if (fcmToken) {
          try {
            await api.post('/fcm/register', { token: fcmToken, platform: Platform.OS });
            console.log('FCM token registered');
          } catch (e) {
            console.error('FCM register error:', e);
          }
        }
      });
    }
  }, [isAuthenticated]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Stack screenOptions={{
        headerStyle: { backgroundColor: '#1b5e20' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
        headerBackTitle: 'رجوع',
        animation: 'slide_from_left',
      }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ title: 'الإشعارات' }} />
        <Stack.Screen name="change-password" options={{ title: 'تغيير كلمة المرور', headerShown: false }} />
        <Stack.Screen name="course-students" options={{ title: 'طلاب المقرر' }} />
        <Stack.Screen name="lecture-attendance" options={{ title: 'تسجيل الحضور' }} />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1b5e20' },
});

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import api from './api';

// إعداد كيفية عرض الإشعارات عندما يكون التطبيق مفتوحاً
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  // Push notifications تعمل فقط على أجهزة حقيقية
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  // التحقق من الصلاحية
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Failed to get push notification permission');
    return null;
  }

  try {
    // جلب Expo Push Token
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: projectId,
    });
    const token = tokenData.data;
    console.log('Expo Push Token:', token);

    // تسجيل التوكن في السيرفر
    try {
      await api.post('/notifications/register-token', {
        token: token,
        device_type: Platform.OS,
      });
      console.log('Push token registered with server');
    } catch (e) {
      console.log('Failed to register token with server:', e);
    }

    // إعداد قناة الإشعارات لـ Android
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'إشعارات النظام',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1565c0',
        sound: 'default',
      });
    }

    return token;
  } catch (error) {
    console.log('Error getting push token:', error);
    return null;
  }
}

// الاستماع للإشعارات الواردة
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
) {
  return Notifications.addNotificationReceivedListener(callback);
}

// الاستماع للنقر على الإشعار
export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

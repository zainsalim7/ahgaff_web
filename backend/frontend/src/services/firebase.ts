import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

let app;
let messaging;

export function getFirebaseApp() {
  if (!app) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  }
  return app;
}

export async function getFirebaseMessaging() {
  if (messaging) return messaging;
  
  const supported = await isSupported();
  if (!supported) {
    console.log('Firebase Messaging is not supported in this browser');
    return null;
  }
  
  const firebaseApp = getFirebaseApp();
  messaging = getMessaging(firebaseApp);
  return messaging;
}

export async function requestNotificationPermission() {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Notification permission denied');
      return null;
    }

    const fcmMessaging = await getFirebaseMessaging();
    if (!fcmMessaging) return null;

    const token = await getToken(fcmMessaging, {
      vapidKey: undefined, // Will use default Firebase VAPID key
    });

    console.log('FCM Token:', token);
    return token;
  } catch (error) {
    console.error('Error getting FCM token:', error);
    return null;
  }
}

export function onForegroundMessage(callback) {
  getFirebaseMessaging().then((fcmMessaging) => {
    if (!fcmMessaging) return;
    onMessage(fcmMessaging, (payload) => {
      console.log('Foreground message:', payload);
      callback(payload);
    });
  });
}

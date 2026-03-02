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

const isConfigured = !!firebaseConfig.projectId;

let app: any;
let messaging: any;

export function getFirebaseApp() {
  if (!isConfigured) return null;
  if (!app) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  }
  return app;
}

export async function getFirebaseMessaging() {
  if (!isConfigured) return null;
  if (messaging) return messaging;

  const supported = await isSupported();
  if (!supported) return null;

  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  messaging = getMessaging(firebaseApp);
  return messaging;
}

export async function requestNotificationPermission() {
  if (!isConfigured) return null;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    const fcmMessaging = await getFirebaseMessaging();
    if (!fcmMessaging) return null;

    const token = await getToken(fcmMessaging, { vapidKey: undefined });
    return token;
  } catch (error) {
    console.error('Error getting FCM token:', error);
    return null;
  }
}

export function onForegroundMessage(callback: (payload: any) => void) {
  if (!isConfigured) return;
  getFirebaseMessaging().then((fcmMessaging) => {
    if (!fcmMessaging) return;
    onMessage(fcmMessaging, (payload) => {
      callback(payload);
    });
  });
}

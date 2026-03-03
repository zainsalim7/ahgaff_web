import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  if (isOnline) return null;

  return (
    <View style={styles.container}>
      <Ionicons name="cloud-offline-outline" size={18} color="#ef6c00" />
      <Text style={styles.text}>لا يوجد اتصال بالإنترنت</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff3e0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  text: { fontSize: 13, color: '#ef6c00', fontWeight: '600' },
});

export default OfflineIndicator;

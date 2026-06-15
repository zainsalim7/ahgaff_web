import React, { useEffect } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function StudentDetailsScreen() {
  const { studentId } = useLocalSearchParams();

  useEffect(() => {
    // تأخير لضمان تركيب Root Layout قبل التنقل
    const timer = setTimeout(() => {
      try {
        if (studentId) {
          router.replace(`/students?openStudent=${studentId}` as any);
        } else {
          router.replace('/students');
        }
      } catch (e) {
        console.warn('Redirect failed, will retry...', e);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [studentId]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.content}>
        <ActivityIndicator size="large" color="#1565c0" />
        <Text style={styles.text}>جاري فتح بيانات الطالب...</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  text: { fontSize: 14, color: '#666', marginTop: 12 },
});

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';

export default function DuplicateCoursesScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'أداة معطّلة', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container} edges={['bottom']} testID="duplicate-courses-screen">
        <View style={styles.box}>
          <Ionicons name="close-circle-outline" size={48} color="#c62828" />
          <Text style={styles.title}>هذه الأداة مُعطَّلة</Text>
          <Text style={styles.text}>
            تبيَّن أن المقررات المتشابهة بالاسم في النظام ليست مكرَّرة فعلياً، بل هي مقررات حقيقية مستقلة
            لشُعب ومستويات وفصول دراسية مختلفة (مثل الأقسام الإلكترونية/المدمجة أو شعب الطالبات). لذلك لا يجوز
            دمجها، وتم تعطيل أداة "دمج المقررات المكررة" نهائياً لتفادي أي فقدان لبيانات حقيقية.
          </Text>
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  box: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { fontSize: 16, fontWeight: '800', color: '#c62828', marginTop: 12 },
  text: { fontSize: 13, color: '#555', textAlign: 'center', marginTop: 10, lineHeight: 20 },
});

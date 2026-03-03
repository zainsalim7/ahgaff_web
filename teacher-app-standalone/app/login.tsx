import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView,
  Platform, Alert, ActivityIndicator, ScrollView, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../src/store/authStore';
import { authAPI } from '../src/services/api';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

const UNIVERSITY_LOGO = 'https://ahgaff.edu.ye/pluginfile.php/1/theme_lambda2/favicon/1769931878/University%20Logo.png';

export default function LoginScreen() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    authAPI.initAdmin().catch(() => {});
    AsyncStorage.getItem('saved_credentials_teacher').then(saved => {
      if (saved) {
        const { username: u, password: p } = JSON.parse(saved);
        setUsername(u); setPassword(p); setRememberMe(true);
      }
    }).catch(() => {});
  }, []);

  const showError = (msg: string) => {
    setErrorMessage(msg);
    if (Platform.OS !== 'web') Alert.alert('خطأ', msg);
    setTimeout(() => setErrorMessage(''), 5000);
  };

  const handleLogin = async () => {
    setErrorMessage('');
    if (!username.trim() || !password.trim()) { showError('الرجاء إدخال اسم المستخدم وكلمة المرور'); return; }
    setIsLoading(true);
    try {
      const res = await authAPI.login(username.trim(), password);
      const { access_token, user } = res.data;
      if (user.role !== 'teacher') { showError('هذا التطبيق مخصص للأساتذة فقط'); setIsLoading(false); return; }
      await setAuth(user, access_token);
      if (rememberMe) await AsyncStorage.setItem('saved_credentials_teacher', JSON.stringify({ username: username.trim(), password }));
      else await AsyncStorage.removeItem('saved_credentials_teacher');
      await AsyncStorage.setItem('offline_credentials_teacher', JSON.stringify({ username: username.trim(), password, user, access_token }));
      router.replace('/(tabs)');
    } catch (error: any) {
      if (!error.response) {
        try {
          const d = await AsyncStorage.getItem('offline_credentials_teacher');
          if (d) {
            const { username: su, password: sp, user, access_token } = JSON.parse(d);
            if (username.trim() === su && password === sp) { await setAuth(user, access_token); router.replace('/(tabs)'); return; }
          }
          showError('لا يوجد اتصال بالإنترنت ولا توجد بيانات محفوظة');
        } catch { showError('لا يوجد اتصال بالإنترنت'); }
      } else { showError(error.response?.data?.detail || 'اسم المستخدم أو كلمة المرور غير صحيحة'); }
    } finally { setIsLoading(false); }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Image source={{ uri: UNIVERSITY_LOGO }} style={styles.logo} resizeMode="contain" />
            </View>
            <Text style={styles.title}>أستاذ الأحقاف</Text>
            <Text style={styles.subtitle}>تسجيل دخول الأستاذ</Text>
          </View>
          <View style={styles.formContainer}>
            {errorMessage ? <View style={styles.errorBox} data-testid="login-error"><Ionicons name="alert-circle" size={18} color="#c62828" /><Text style={styles.errorText}>{errorMessage}</Text></View> : null}
            <View style={styles.inputContainer}>
              <Ionicons name="person" size={20} color="#1b5e20" style={{ marginLeft: 8 }} />
              <TextInput style={styles.input} placeholder="اسم المستخدم" placeholderTextColor="#999" value={username} onChangeText={setUsername} autoCapitalize="none" data-testid="username-input" />
            </View>
            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed" size={20} color="#1b5e20" style={{ marginLeft: 8 }} />
              <TextInput style={styles.input} placeholder="كلمة المرور" placeholderTextColor="#999" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} data-testid="password-input" />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ padding: 6 }}>
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="#999" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.rememberRow} onPress={() => setRememberMe(!rememberMe)}>
              <Ionicons name={rememberMe ? 'checkbox' : 'square-outline'} size={22} color={rememberMe ? '#1b5e20' : '#999'} />
              <Text style={styles.rememberText}>تذكرني</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.loginBtn, isLoading && { opacity: 0.7 }]} onPress={handleLogin} disabled={isLoading} data-testid="login-btn">
              {isLoading ? <ActivityIndicator color="#fff" /> : <><Ionicons name="log-in-outline" size={22} color="#fff" /><Text style={styles.loginBtnText}>تسجيل الدخول</Text></>}
            </TouchableOpacity>
          </View>
          <View style={styles.footer}><Text style={styles.footerText}>جامعة الأحقاف</Text><Text style={styles.footerVersion}>v1.0.0</Text></View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1b5e20' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 32 },
  logoContainer: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center', marginBottom: 16, overflow: 'hidden' },
  logo: { width: 60, height: 60 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  subtitle: { fontSize: 15, color: 'rgba(255,255,255,0.7)' },
  formContainer: { backgroundColor: '#fff', borderRadius: 24, padding: 24, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 16 },
  errorBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffebee', padding: 12, borderRadius: 12, marginBottom: 16, gap: 8 },
  errorText: { flex: 1, color: '#c62828', fontSize: 13 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f7fa', borderRadius: 14, marginBottom: 14, paddingHorizontal: 14, height: 52, borderWidth: 1, borderColor: '#e8e8e8' },
  input: { flex: 1, fontSize: 15, color: '#1a1a2e', textAlign: 'right', paddingHorizontal: 8 },
  rememberRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 8 },
  rememberText: { fontSize: 14, color: '#666' },
  loginBtn: { backgroundColor: '#1b5e20', borderRadius: 14, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, elevation: 3 },
  loginBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  footer: { alignItems: 'center', marginTop: 32 },
  footerText: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  footerVersion: { fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 },
});

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
  Image,
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
  const setAuth = useAuthStore((state) => state.setAuth);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    initializeAdmin();
    loadSavedCredentials();
  }, []);

  const loadSavedCredentials = async () => {
    try {
      const saved = await AsyncStorage.getItem('saved_credentials');
      if (saved) {
        const { username: savedUser, password: savedPass } = JSON.parse(saved);
        setUsername(savedUser);
        setPassword(savedPass);
        setRememberMe(true);
      }
    } catch (e) {}
  };

  const initializeAdmin = async () => {
    try {
      await authAPI.initAdmin();
    } catch (error) {}
    setInitialized(true);
  };

  const showError = (message: string) => {
    setErrorMessage(message);
    if (Platform.OS !== 'web') {
      Alert.alert('خطأ', message);
    }
    setTimeout(() => setErrorMessage(''), 5000);
  };

  const handleLogin = async () => {
    setErrorMessage('');

    if (!username.trim() || !password.trim()) {
      showError('الرجاء إدخال رقم القيد وكلمة المرور');
      return;
    }

    setIsLoading(true);
    try {
      const response = await authAPI.login(username.trim(), password);
      const { access_token, user } = response.data;

      // Only allow students
      if (user.role !== 'student') {
        showError('هذا التطبيق مخصص للطلاب فقط');
        setIsLoading(false);
        return;
      }

      await setAuth(user, access_token);

      if (rememberMe) {
        await AsyncStorage.setItem('saved_credentials', JSON.stringify({ username: username.trim(), password }));
      } else {
        await AsyncStorage.removeItem('saved_credentials');
      }

      // Save for offline login
      await AsyncStorage.setItem('offline_credentials', JSON.stringify({
        username: username.trim(),
        password,
        user,
        access_token,
      }));

      router.replace('/(tabs)');
    } catch (error: any) {
      if (!error.response) {
        try {
          const offlineData = await AsyncStorage.getItem('offline_credentials');
          if (offlineData) {
            const { username: savedUser, password: savedPass, user, access_token } = JSON.parse(offlineData);
            if (username.trim() === savedUser && password === savedPass) {
              await setAuth(user, access_token);
              router.replace('/(tabs)');
              return;
            }
          }
          showError('لا يوجد اتصال بالإنترنت ولا توجد بيانات محفوظة');
        } catch (e) {
          showError('لا يوجد اتصال بالإنترنت');
        }
      } else {
        const message = error.response?.data?.detail || 'رقم القيد أو كلمة المرور غير صحيحة';
        showError(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Image
                source={{ uri: UNIVERSITY_LOGO }}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.title}>طالب الأحقاف</Text>
            <Text style={styles.subtitle}>تسجيل دخول الطالب</Text>
          </View>

          {/* Form */}
          <View style={styles.formContainer}>
            {errorMessage ? (
              <View style={styles.errorBox} data-testid="login-error">
                <Ionicons name="alert-circle" size={18} color="#c62828" />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <View style={styles.inputContainer}>
              <Ionicons name="person" size={20} color="#0d47a1" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="رقم القيد"
                placeholderTextColor="#999"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                data-testid="username-input"
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed" size={20} color="#0d47a1" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="كلمة المرور"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                data-testid="password-input"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="#999" />
              </TouchableOpacity>
            </View>

            {/* Remember Me */}
            <TouchableOpacity
              style={styles.rememberRow}
              onPress={() => setRememberMe(!rememberMe)}
              data-testid="remember-me-btn"
            >
              <Ionicons
                name={rememberMe ? 'checkbox' : 'square-outline'}
                size={22}
                color={rememberMe ? '#0d47a1' : '#999'}
              />
              <Text style={styles.rememberText}>تذكرني</Text>
            </TouchableOpacity>

            {/* Login Button */}
            <TouchableOpacity
              style={[styles.loginBtn, isLoading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
              data-testid="login-btn"
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="log-in-outline" size={22} color="#fff" />
                  <Text style={styles.loginBtnText}>تسجيل الدخول</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>جامعة الأحقاف</Text>
            <Text style={styles.footerVersion}>v1.0.0</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d47a1' },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },

  header: { alignItems: 'center', marginBottom: 32 },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  logo: { width: 60, height: 60 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  subtitle: { fontSize: 15, color: 'rgba(255,255,255,0.7)' },

  formContainer: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  errorText: { flex: 1, color: '#c62828', fontSize: 13 },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f7fa',
    borderRadius: 14,
    marginBottom: 14,
    paddingHorizontal: 14,
    height: 52,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  inputIcon: { marginLeft: 8 },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#1a1a2e',
    textAlign: 'right',
    paddingHorizontal: 8,
  },
  eyeBtn: { padding: 6 },

  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 8,
  },
  rememberText: { fontSize: 14, color: '#666' },

  loginBtn: {
    backgroundColor: '#0d47a1',
    borderRadius: 14,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    elevation: 3,
  },
  loginBtnDisabled: { opacity: 0.7 },
  loginBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },

  footer: { alignItems: 'center', marginTop: 32 },
  footerText: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  footerVersion: { fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 },
});

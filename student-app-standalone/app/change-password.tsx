import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { authAPI } from '../src/services/api';
import { useAuthStore } from '../src/store/authStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { goBack } from '../src/utils/navigation';

export default function ChangePasswordScreen() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('خطأ', 'الرجاء ملء جميع الحقول');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('خطأ', 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('خطأ', 'كلمتا المرور غير متطابقتين');
      return;
    }

    if (newPassword === currentPassword) {
      Alert.alert('خطأ', 'كلمة المرور الجديدة يجب أن تكون مختلفة عن القديمة');
      return;
    }

    setLoading(true);
    try {
      await authAPI.changePassword(currentPassword, newPassword);
      
      if (user) {
        const updatedUser = { ...user, must_change_password: false };
        setUser(updatedUser);
        await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
      }

      Alert.alert('تم بنجاح', 'تم تغيير كلمة المرور', [
        {
          text: 'حسناً',
          onPress: () => goBack(router),
        },
      ]);
    } catch (error: any) {
      const message = error.response?.data?.detail || 'فشل في تغيير كلمة المرور';
      Alert.alert('خطأ', message);
    } finally {
      setLoading(false);
    }
  };

  const isValid = currentPassword.length > 0 &&
                  newPassword.length >= 6 && 
                  newPassword !== currentPassword && 
                  newPassword === confirmPassword;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => goBack(router)} style={styles.backBtn} data-testid="back-btn">
              <Ionicons name="arrow-forward" size={24} color="#1565c0" />
            </TouchableOpacity>
            <View style={styles.iconContainer}>
              <Ionicons name="key" size={28} color="#fff" />
            </View>
            <Text style={styles.title}>تغيير كلمة المرور</Text>
            <Text style={styles.subtitle}>أدخل كلمة المرور القديمة والجديدة</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Current Password */}
            <Text style={styles.inputLabel}>كلمة المرور الحالية</Text>
            <View style={styles.inputContainer}>
              <TouchableOpacity onPress={() => setShowCurrentPass(!showCurrentPass)}>
                <Ionicons name={showCurrentPass ? 'eye-off' : 'eye'} size={22} color="#888" />
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                placeholder="كلمة المرور الحالية"
                placeholderTextColor="#aaa"
                secureTextEntry={!showCurrentPass}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                data-testid="current-password-input"
              />
              <Ionicons name="lock-closed" size={22} color="#1565c0" />
            </View>

            {/* New Password */}
            <Text style={styles.inputLabel}>كلمة المرور الجديدة</Text>
            <View style={styles.inputContainer}>
              <TouchableOpacity onPress={() => setShowNewPass(!showNewPass)}>
                <Ionicons name={showNewPass ? 'eye-off' : 'eye'} size={22} color="#888" />
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                placeholder="كلمة المرور الجديدة (6 أحرف على الأقل)"
                placeholderTextColor="#aaa"
                secureTextEntry={!showNewPass}
                value={newPassword}
                onChangeText={setNewPassword}
                data-testid="new-password-input"
              />
              <Ionicons name="key" size={22} color="#1565c0" />
            </View>

            {/* Confirm Password */}
            <Text style={styles.inputLabel}>تأكيد كلمة المرور الجديدة</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="أعد كتابة كلمة المرور الجديدة"
                placeholderTextColor="#aaa"
                secureTextEntry={!showNewPass}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                data-testid="confirm-password-input"
              />
              <Ionicons name="checkmark-circle" size={22} color={confirmPassword && confirmPassword === newPassword ? '#4caf50' : '#ccc'} />
            </View>

            {/* Validation messages */}
            {newPassword.length > 0 && newPassword.length < 6 && (
              <Text style={styles.errorText}>كلمة المرور يجب أن تكون 6 أحرف على الأقل</Text>
            )}
            {confirmPassword.length > 0 && confirmPassword !== newPassword && (
              <Text style={styles.errorText}>كلمتا المرور غير متطابقتين</Text>
            )}

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitBtn, !isValid && styles.submitBtnDisabled]}
              onPress={handleChangePassword}
              disabled={!isValid || loading}
              data-testid="change-password-submit"
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.submitBtnText}>تغيير كلمة المرور</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Cancel Button */}
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => goBack(router)}
              data-testid="cancel-btn"
            >
              <Text style={styles.cancelBtnText}>إلغاء</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { flex: 1 },
  scrollContent: { padding: 20 },
  header: { alignItems: 'center', marginBottom: 30, marginTop: 10 },
  backBtn: {
    position: 'absolute',
    left: 0,
    top: 0,
    padding: 8,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#1565c0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1a1a2e' },
  subtitle: { fontSize: 14, color: '#888', marginTop: 4 },
  form: { gap: 12 },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
    textAlign: 'right',
    marginBottom: -4,
  },
  inputContainer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  input: {
    flex: 1,
    height: 52,
    fontSize: 15,
    color: '#333',
    textAlign: 'right',
    writingDirection: 'rtl',
    paddingHorizontal: 8,
  },
  errorText: {
    fontSize: 12,
    color: '#f44336',
    textAlign: 'right',
  },
  submitBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1565c0',
    borderRadius: 12,
    height: 50,
    marginTop: 10,
  },
  submitBtnDisabled: {
    backgroundColor: '#b0bec5',
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelBtn: {
    alignItems: 'center',
    padding: 14,
  },
  cancelBtnText: {
    color: '#888',
    fontSize: 15,
  },
});

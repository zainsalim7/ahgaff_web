import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../src/store/authStore';
import { notificationsAPI } from '../../src/services/api';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const fetchUnreadCount = async () => {
      try {
        const response = await notificationsAPI.getCount();
        setUnreadCount(response.data.count || 0);
      } catch (error) {
        console.log('Error fetching notifications count:', error);
      }
    };
    fetchUnreadCount();
  }, []);

  const performLogout = async () => {
    try {
      await logout();
      router.replace('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('هل أنت متأكد من تسجيل الخروج؟')) {
        performLogout();
      }
    } else {
      Alert.alert(
        'تسجيل الخروج',
        'هل أنت متأكد من تسجيل الخروج؟',
        [
          { text: 'إلغاء', style: 'cancel' },
          { text: 'تسجيل الخروج', style: 'destructive', onPress: performLogout },
        ]
      );
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']} data-testid="profile-screen">
      <ScrollView style={styles.scrollView}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <Ionicons name="school" size={44} color="#0d47a1" />
          </View>
          <Text style={styles.userName} data-testid="profile-name">{user?.full_name}</Text>
          <Text style={styles.userUsername}>@{user?.username}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>طالب</Text>
          </View>
        </View>

        {/* Info Section */}
        <View style={styles.infoSection}>
          <View style={styles.infoItem}>
            <Ionicons name="person-outline" size={22} color="#0d47a1" />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>اسم المستخدم</Text>
              <Text style={styles.infoValue}>{user?.username}</Text>
            </View>
          </View>

          {user?.email && (
            <View style={styles.infoItem}>
              <Ionicons name="mail-outline" size={22} color="#0d47a1" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>البريد الإلكتروني</Text>
                <Text style={styles.infoValue}>{user?.email}</Text>
              </View>
            </View>
          )}

          {user?.phone && (
            <View style={styles.infoItem}>
              <Ionicons name="call-outline" size={22} color="#0d47a1" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>رقم الهاتف</Text>
                <Text style={styles.infoValue}>{user?.phone}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Menu Items */}
        <View style={styles.menuSection}>
          {/* Notifications */}
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push('/notifications')}
            data-testid="profile-notifications-btn"
          >
            <View style={[styles.menuIcon, { backgroundColor: '#fff3e0' }]}>
              <Ionicons name="notifications-outline" size={22} color="#ef6c00" />
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                </View>
              )}
            </View>
            <Text style={styles.menuText}>الإشعارات</Text>
            <Ionicons name="chevron-back" size={20} color="#ccc" />
          </TouchableOpacity>

          {/* Student Card */}
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push('/student-card')}
            data-testid="student-card-btn"
          >
            <View style={[styles.menuIcon, { backgroundColor: '#e8eaf6' }]}>
              <Ionicons name="card-outline" size={22} color="#3949ab" />
            </View>
            <Text style={styles.menuText}>بطاقة الطالب</Text>
            <Ionicons name="chevron-back" size={20} color="#ccc" />
          </TouchableOpacity>

          {/* Change Password */}
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push('/change-password')}
            data-testid="change-password-btn"
          >
            <View style={[styles.menuIcon, { backgroundColor: '#fce4ec' }]}>
              <Ionicons name="key-outline" size={22} color="#c62828" />
            </View>
            <Text style={styles.menuText}>تغيير كلمة المرور</Text>
            <Ionicons name="chevron-back" size={20} color="#ccc" />
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} data-testid="logout-btn">
          <Ionicons name="log-out-outline" size={22} color="#c62828" />
          <Text style={styles.logoutText}>تسجيل الخروج</Text>
        </TouchableOpacity>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appName}>طالب الأحقاف</Text>
          <Text style={styles.appVersion}>الإصدار 1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  scrollView: { flex: 1 },

  profileHeader: {
    backgroundColor: '#fff',
    paddingVertical: 28,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
  },
  avatarContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#e8eaf6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  userName: { fontSize: 22, fontWeight: 'bold', color: '#1a1a2e', marginBottom: 4 },
  userUsername: { fontSize: 14, color: '#888', marginBottom: 10 },
  roleBadge: {
    backgroundColor: '#e8eaf6',
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: 16,
  },
  roleText: { color: '#0d47a1', fontWeight: '700', fontSize: 13 },

  infoSection: {
    backgroundColor: '#fff',
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoContent: { flex: 1, marginLeft: 14 },
  infoLabel: { fontSize: 11, color: '#999' },
  infoValue: { fontSize: 15, color: '#1a1a2e', marginTop: 2 },

  menuSection: {
    marginTop: 16,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#f44336',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  menuText: { flex: 1, fontSize: 15, color: '#1a1a2e', marginLeft: 12 },

  logoutBtn: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ffcdd2',
    gap: 8,
  },
  logoutText: { color: '#c62828', fontSize: 16, fontWeight: '600' },

  appInfo: { alignItems: 'center', paddingVertical: 24 },
  appName: { fontSize: 14, color: '#999', fontWeight: '500' },
  appVersion: { fontSize: 12, color: '#bbb', marginTop: 4 },
});

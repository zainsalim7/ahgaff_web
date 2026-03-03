import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../src/store/authStore';
import { useOfflineSyncStore } from '../../src/store/offlineSyncStore';
import { notificationsAPI } from '../../src/services/api';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { pendingRecords, lastSyncTime } = useOfflineSyncStore();
  const [unreadCount, setUnreadCount] = useState(0);
  const pendingCount = pendingRecords.filter(r => !r.synced).length;

  useEffect(() => {
    notificationsAPI.getCount().then(r => setUnreadCount(r.data.count || 0)).catch(() => {});
  }, []);

  const handleLogout = () => {
    const doLogout = async () => { await logout(); router.replace('/login'); };
    if (Platform.OS === 'web') { if (window.confirm('هل أنت متأكد من تسجيل الخروج؟')) doLogout(); }
    else Alert.alert('تسجيل الخروج', 'هل أنت متأكد؟', [{ text: 'إلغاء', style: 'cancel' }, { text: 'تسجيل الخروج', style: 'destructive', onPress: doLogout }]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']} data-testid="profile-screen">
      <ScrollView style={{ flex: 1 }}>
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}><Ionicons name="person" size={44} color="#1b5e20" /></View>
          <Text style={styles.userName}>{user?.full_name}</Text>
          <Text style={styles.userUsername}>@{user?.username}</Text>
          <View style={styles.roleBadge}><Text style={styles.roleText}>أستاذ</Text></View>
        </View>

        <View style={styles.menuSection}>
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/notifications')}>
            <View style={[styles.menuIcon, { backgroundColor: '#fff3e0' }]}>
              <Ionicons name="notifications-outline" size={22} color="#ef6c00" />
              {unreadCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{unreadCount}</Text></View>}
            </View>
            <Text style={styles.menuText}>الإشعارات</Text>
            <Ionicons name="chevron-back" size={20} color="#ccc" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/change-password')}>
            <View style={[styles.menuIcon, { backgroundColor: '#fce4ec' }]}><Ionicons name="key-outline" size={22} color="#c62828" /></View>
            <Text style={styles.menuText}>تغيير كلمة المرور</Text>
            <Ionicons name="chevron-back" size={20} color="#ccc" />
          </TouchableOpacity>
        </View>

        {/* Sync Status */}
        <View style={styles.syncSection}>
          <Text style={styles.syncTitle}>حالة المزامنة</Text>
          <View style={styles.syncRow}>
            <Ionicons name={pendingCount > 0 ? 'cloud-upload-outline' : 'cloud-done-outline'} size={20} color={pendingCount > 0 ? '#ef6c00' : '#2e7d32'} />
            <Text style={styles.syncText}>{pendingCount > 0 ? `${pendingCount} سجل بانتظار المزامنة` : 'كل البيانات متزامنة'}</Text>
          </View>
          {lastSyncTime && <Text style={styles.lastSyncText}>آخر مزامنة: {new Date(lastSyncTime).toLocaleString('ar-SA')}</Text>}
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} data-testid="logout-btn">
          <Ionicons name="log-out-outline" size={22} color="#c62828" />
          <Text style={styles.logoutText}>تسجيل الخروج</Text>
        </TouchableOpacity>

        <View style={styles.appInfo}><Text style={styles.appName}>أستاذ الأحقاف</Text><Text style={styles.appVersion}>الإصدار 1.0.0</Text></View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  profileHeader: { backgroundColor: '#fff', paddingVertical: 28, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#e8e8e8' },
  avatarContainer: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#e8f5e9', justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  userName: { fontSize: 22, fontWeight: 'bold', color: '#1a1a2e', marginBottom: 4 },
  userUsername: { fontSize: 14, color: '#888', marginBottom: 10 },
  roleBadge: { backgroundColor: '#e8f5e9', paddingHorizontal: 18, paddingVertical: 6, borderRadius: 16 },
  roleText: { color: '#1b5e20', fontWeight: '700', fontSize: 13 },
  menuSection: { marginTop: 16, backgroundColor: '#fff', paddingHorizontal: 16 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  menuIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  badge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#f44336', borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  menuText: { flex: 1, fontSize: 15, color: '#1a1a2e', marginLeft: 12 },
  syncSection: { margin: 16, backgroundColor: '#fff', padding: 16, borderRadius: 14 },
  syncTitle: { fontSize: 15, fontWeight: '600', color: '#1a1a2e', marginBottom: 10 },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  syncText: { fontSize: 14, color: '#666' },
  lastSyncText: { fontSize: 12, color: '#999', marginTop: 8 },
  logoutBtn: { backgroundColor: '#fff', margin: 16, padding: 16, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ffcdd2', gap: 8 },
  logoutText: { color: '#c62828', fontSize: 16, fontWeight: '600' },
  appInfo: { alignItems: 'center', paddingVertical: 24 },
  appName: { fontSize: 14, color: '#999', fontWeight: '500' },
  appVersion: { fontSize: 12, color: '#bbb', marginTop: 4 },
});

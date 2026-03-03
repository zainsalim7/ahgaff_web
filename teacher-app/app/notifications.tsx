import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../src/services/api';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'warning' | 'deprivation' | 'info' | 'reminder';
  course_name?: string;
  absence_rate?: number;
  remaining_allowed?: number;
  is_read: boolean;
  created_at: string;
}

export default function NotificationsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await api.get('/notifications/my');
      setNotifications(response.data.notifications);
      setUnreadCount(response.data.unread_count);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await api.post(`/notifications/mark-read/${notificationId}`);
      setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.post('/notifications/mark-all-read');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const deleteNotification = async (notificationId: string) => {
    const doDelete = async () => {
      try {
        await api.delete(`/notifications/${notificationId}`);
        const deleted = notifications.find(n => n.id === notificationId);
        setNotifications(prev => prev.filter(n => n.id !== notificationId));
        if (deleted && !deleted.is_read) setUnreadCount(prev => Math.max(0, prev - 1));
      } catch (error) {
        if (Platform.OS === 'web') window.alert('فشل حذف الإشعار');
        else Alert.alert('خطأ', 'فشل حذف الإشعار');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('هل تريد حذف هذا الإشعار؟')) await doDelete();
    } else {
      Alert.alert('تأكيد', 'هل تريد حذف هذا الإشعار؟', [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'حذف', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'warning': return 'warning';
      case 'deprivation': return 'close-circle';
      case 'reminder': return 'time';
      default: return 'information-circle';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'warning': return '#ef6c00';
      case 'deprivation': return '#c62828';
      case 'reminder': return '#1b5e20';
      default: return '#666';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'الآن';
    if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
    if (diffHours < 24) return `منذ ${diffHours} ساعة`;
    if (diffDays < 7) return `منذ ${diffDays} يوم`;
    return date.toLocaleDateString('ar-SA');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1b5e20" />
        <Text style={styles.loadingText}>جارٍ تحميل الإشعارات...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container} data-testid="notifications-screen">
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} data-testid="back-btn">
          <Ionicons name="arrow-forward" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>الإشعارات</Text>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllAsRead} style={styles.markAllButton} data-testid="mark-all-read-btn">
            <Text style={styles.markAllText}>قراءة الكل</Text>
          </TouchableOpacity>
        )}
      </View>

      {unreadCount > 0 && (
        <View style={styles.unreadBadge}>
          <Ionicons name="notifications" size={18} color="#1b5e20" />
          <Text style={styles.unreadText}>لديك {unreadCount} إشعار غير مقروء</Text>
        </View>
      )}

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1b5e20']} />}
      >
        {notifications.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="notifications-off-outline" size={56} color="#ccc" />
            <Text style={styles.emptyText}>لا توجد إشعارات</Text>
            <Text style={styles.emptySubtext}>ستظهر هنا التنبيهات المتعلقة بحضورك</Text>
          </View>
        ) : (
          notifications.map((notification) => (
            <TouchableOpacity
              key={notification.id}
              style={[
                styles.notificationCard,
                !notification.is_read && styles.unreadCard,
                { borderRightColor: getTypeColor(notification.type) },
              ]}
              onPress={() => { if (!notification.is_read) markAsRead(notification.id); }}
              data-testid={`notification-${notification.id}`}
            >
              <View style={styles.notificationHeader}>
                <View style={[styles.iconContainer, { backgroundColor: getTypeColor(notification.type) + '18' }]}>
                  <Ionicons name={getTypeIcon(notification.type)} size={22} color={getTypeColor(notification.type)} />
                </View>
                <View style={styles.titleContainer}>
                  <Text style={styles.notificationTitle}>{notification.title}</Text>
                  <Text style={styles.notificationTime}>{formatDate(notification.created_at)}</Text>
                </View>
                {!notification.is_read && <View style={styles.unreadDot} />}
                <TouchableOpacity
                  onPress={(e) => { e.stopPropagation?.(); deleteNotification(notification.id); }}
                  style={styles.deleteBtn}
                  data-testid={`delete-notification-${notification.id}`}
                >
                  <Ionicons name="trash-outline" size={18} color="#c62828" />
                </TouchableOpacity>
              </View>

              <Text style={styles.notificationMessage}>{notification.message}</Text>

              {(notification.absence_rate !== undefined || notification.remaining_allowed !== undefined) && (
                <View style={styles.statsContainer}>
                  {notification.absence_rate !== undefined && (
                    <View style={styles.statBadge}>
                      <Text style={styles.statLabel}>نسبة الغياب</Text>
                      <Text style={[styles.statValue, { color: getTypeColor(notification.type) }]}>
                        {notification.absence_rate.toFixed(1)}%
                      </Text>
                    </View>
                  )}
                  {notification.remaining_allowed !== undefined && notification.remaining_allowed > 0 && (
                    <View style={styles.statBadge}>
                      <Text style={styles.statLabel}>الغياب المتبقي</Text>
                      <Text style={styles.statValue}>{notification.remaining_allowed}</Text>
                    </View>
                  )}
                </View>
              )}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f2f5' },
  loadingText: { marginTop: 16, fontSize: 15, color: '#666' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1b5e20',
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  markAllButton: { padding: 8 },
  markAllText: { color: '#fff', fontSize: 13 },
  unreadBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8eaf6',
    padding: 10,
    gap: 8,
  },
  unreadText: { color: '#1b5e20', fontSize: 13, fontWeight: '600' },
  content: { flex: 1, padding: 16 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 17, color: '#999', marginTop: 16 },
  emptySubtext: { fontSize: 13, color: '#bbb', marginTop: 8, textAlign: 'center' },
  notificationCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderRightWidth: 4,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
  unreadCard: { backgroundColor: '#fafafa' },
  notificationHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: { flex: 1, marginLeft: 12 },
  notificationTitle: { fontSize: 14, fontWeight: '600', color: '#1a1a2e' },
  notificationTime: { fontSize: 11, color: '#999', marginTop: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1b5e20' },
  deleteBtn: { padding: 6, marginLeft: 4 },
  notificationMessage: { fontSize: 13, color: '#666', lineHeight: 20 },
  statsContainer: { flexDirection: 'row', marginTop: 10, gap: 10 },
  statBadge: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
  },
  statLabel: { fontSize: 10, color: '#999', marginBottom: 2 },
  statValue: { fontSize: 15, fontWeight: 'bold', color: '#333' },
});
